import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Multer setup for asset uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Database setup
const DB_PATH = path.join(__dirname, "db.json");

interface Database {
  users: Record<string, any>;
  games: any[];
  regions?: any[];
  reports?: any[];
}

function readDB(): Database {
  if (!fs.existsSync(DB_PATH)) {
    const initialDB: Database = {
      users: {},
      games: [
        { id: '1', title: 'Glidrovia City RP', creator: 'Glidrovia', creatorUid: 'admin', creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Glidrovia', thumbnail: 'https://picsum.photos/seed/city/768/432', likes: '94%', playing: 450000, mapData: undefined },
        { id: '2', title: 'Tower of Glidrovia', creator: 'User123', creatorUid: 'user123', creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User123', thumbnail: 'https://picsum.photos/seed/tower/768/432', likes: '88%', playing: 12000, mapData: undefined }
      ],
      regions: [],
      reports: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  if (!db.regions) db.regions = [];
  if (!db.reports) db.reports = [];
  return db;
}

function writeDB(db: Database) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function startServer() {
  const app = express();
  // Global middleware
  app.use(express.json({ limit: '200mb' })); // Increase limit for large 3D models
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // API Routes
  app.use("/uploads", express.static(UPLOADS_DIR));

  app.use((req, res, next) => {
    if (req.url !== '/api/upload') {
       console.log(`${req.method} ${req.url}`);
    }
    next();
  });

  // Global error handler for body-parser limit errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === 'entity.too.large' || err.status === 413) {
      console.error("[SERVER] Payload too large error:", err.message);
      return res.status(413).json({ error: "El archivo es demasiado grande. Máximo 200MB." });
    }
    next(err);
  });

  app.post("/api/upload", (req, res) => {
    console.log("[UPLOAD] Incoming request...");
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error("[UPLOAD] Multer error:", err);
        return res.status(400).json({ error: err.message || "Error uploading file" });
      }
      const file = (req as any).file;
      if (!file) {
        console.error("[UPLOAD] No file received. Body:", req.body, "Headers:", req.headers['content-type']);
        return res.status(400).json({ error: "No file uploaded" });
      }
      console.log("[UPLOAD] Success:", file.filename, `(${file.size} bytes)`);
      const url = `/uploads/${file.filename}`;
      res.json({ url });
    });
  });

  app.get("/api/games", (req, res) => {
    const db = readDB();
    res.json(db.games);
  });

  app.post("/api/games", (req, res) => {
    const db = readDB();
    const gameData = req.body;
    
    // Check if game already exists (update)
    const existingIndex = db.games.findIndex(g => g.id === gameData.id);
    
    if (existingIndex !== -1) {
      const oldGame = db.games[existingIndex];
      // Save current state as a version before updating
      const version = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        mapData: oldGame.mapData,
        skybox: oldGame.skybox
      };
      
      const updatedGame = {
        ...oldGame,
        ...gameData,
        versions: [version, ...(oldGame.versions || [])]
      };
      
      db.games[existingIndex] = updatedGame;
      writeDB(db);
      res.json(updatedGame);
    } else {
      // New game
      const newGame = {
        ...gameData,
        id: gameData.id || Date.now().toString(),
        versions: []
      };
      db.games.unshift(newGame);
      writeDB(db);
      res.json(newGame);
    }
  });

  app.post("/api/user/:username/update-status", (req, res) => {
    const { username } = req.params;
    const { isUpdated } = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].isUpdated = isUpdated;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/update-tos", (req, res) => {
    const { username } = req.params;
    const { acceptedToS } = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].acceptedToS = acceptedToS;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/xp", (req, res) => {
    const { username } = req.params;
    const { xp } = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].xp = (db.users[username].xp || 0) + xp;
      writeDB(db);
      res.json({ success: true, newXp: db.users[username].xp });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/gallery", (req, res) => {
    const { username } = req.params;
    const { gallery } = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].gallery = gallery;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.delete("/api/games/:id", (req, res) => {
    const { id } = req.params;
    const db = readDB();
    db.games = db.games.filter(g => g.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  app.get("/api/admin/users", (req, res) => {
    const { admin_password } = req.query;
    if (admin_password !== "glidroviaoficial") {
      return res.status(403).json({ error: "No autorizado" });
    }
    const db = readDB();
    res.json(db.users);
  });

  app.get("/api/users", (req, res) => {
    const { q } = req.query;
    const db = readDB();
    const users = Object.values(db.users)
        .filter(u => u.username !== 'Invitado')
        .map(u => ({
            username: u.username || '',
            displayName: u.displayName || '',
            avatarConfig: u.avatarConfig,
            rank: u.rank || ((u.username || '').toLowerCase() === 'glidrovia' ? 'Platinum' : 'Standard')
        }));
    
    if (q) {
        const queryStr = (q as string || '').toLowerCase();
        const filtered = users.filter(u => 
            (u.username || '').toLowerCase().includes(queryStr) || 
            (u.displayName || '').toLowerCase().includes(queryStr)
        );
        return res.json(filtered);
    }
    res.json(users);
  });

  app.post("/api/login", (req, res) => {
    try {
      console.log("[API] Login request:", req.body?.username);
      const { username, password } = req.body;
      const db = readDB();
      
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const normalizedUsername = username.toLowerCase().trim();

      // Official Account Logic
      if (normalizedUsername === "glidrovia") {
        if (password !== "glidroviaoficial") {
          return res.status(401).json({ error: "Contraseña incorrecta para la cuenta oficial" });
        }
        
        if (!db.users[normalizedUsername]) {
          db.users[normalizedUsername] = {
            username: normalizedUsername,
            displayName: "Glidrovia Oficial",
            robux: 99999,
            drovis: 99999,
            tokens: 99999,
            isAdmin: true,
            rank: 'Platinum',
            usernameChangeCards: 1,
            friends: [],
            avatarConfig: {
              bodyColors: {
                head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429'
              },
              faceTextureUrl: null,
              accessories: { hatModelUrl: null, shirtTextureUrl: null },
              hideFace: false
            },
            settings: { language: 'es', backgroundColor: '#1a1b1e' }
          };
          writeDB(db);
        }
        return res.json(db.users[normalizedUsername]);
      }

      if (!db.users[normalizedUsername]) {
        db.users[normalizedUsername] = {
          username: normalizedUsername,
          displayName: username,
          robux: 1540,
          drovis: 200,
          tokens: 0,
          rank: 'Standard',
          usernameChangeCards: 1,
          friends: [],
          avatarConfig: {
            bodyColors: {
              head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429'
            },
            faceTextureUrl: null,
            accessories: { hatModelUrl: null, shirtTextureUrl: null },
            hideFace: false
          },
          settings: { language: 'es', backgroundColor: '#1a1b1e' }
        };
        writeDB(db);
      }
      res.json(db.users[normalizedUsername]);
    } catch (err) {
      console.error("Login catch error:", err);
      res.status(500).json({ error: "Internal server error during login" });
    }
  });

  app.post("/api/user/:username/avatar", (req, res) => {
    const { username } = req.params;
    const avatarConfig = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].avatarConfig = avatarConfig;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/settings", (req, res) => {
    const { username } = req.params;
    const settings = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].settings = settings;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/username", (req, res) => {
    const { username } = req.params;
    const { newUsername } = req.body;
    const db = readDB();

    if (!db.users[username]) {
      return res.status(404).json({ error: "User not found" });
    }

    if (db.users[newUsername]) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const userData = db.users[username];
    userData.username = newUsername;
    userData.displayName = newUsername; // Update display name too
    
    // Transfer data
    db.users[newUsername] = userData;
    delete db.users[username];
    
    writeDB(db);
    res.json(userData);
  });

  app.get("/api/regions", (req, res) => {
    const db = readDB();
    res.json(db.regions || []);
  });

  app.post("/api/reports", (req, res) => {
    const reportData = req.body;
    const db = readDB();
    const newReport = {
      ...reportData,
      id: Date.now().toString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.reports = [newReport, ...(db.reports || [])];
    writeDB(db);
    res.json(newReport);
  });

  app.post("/api/regions", (req, res) => {
    const { name, url, key, creator } = req.body;
    const db = readDB();
    
    const newRegion = {
      id: `custom-${Date.now()}`,
      name,
      url,
      key,
      creator,
      label: `${name} 🚀`,
      emoji: '🚀',
      createdAt: new Date().toISOString()
    };
    
    // Update existing if name + creator matches
    const existingIndex = (db.regions || []).findIndex(r => r.name === name && r.creator === creator);
    if (existingIndex !== -1) {
      db.regions![existingIndex] = newRegion;
    } else {
      db.regions = [newRegion, ...(db.regions || [])];
    }
    
    writeDB(db);
    res.json(newRegion);
  });

  app.post("/api/user/purchase", (req, res) => {
    const { username, itemId, price } = req.body;
    const db = readDB();
    
    if (!db.users[username]) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    const user = db.users[username];
    const currentDrovis = user.drovis || 0;
    
    if (currentDrovis < price) {
      return res.status(400).json({ error: "Drovis insuficientes" });
    }
    
    user.drovis = currentDrovis - price;
    if (!user.clothingHistory) user.clothingHistory = [];
    user.clothingHistory.push(itemId);
    
    writeDB(db);
    res.json({ success: true, newDrovis: user.drovis });
  });

  app.get("/api/user/:username/studio", (req, res) => {
    const { username } = req.params;
    const db = readDB();
    if (db.users[username]) {
      res.json(db.users[username].studioMap || { title: "Mi Experiencia Voxel", map: [], skybox: "Day" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.post("/api/user/:username/studio", (req, res) => {
    const { username } = req.params;
    const studioMap = req.body;
    const db = readDB();
    if (db.users[username]) {
      db.users[username].studioMap = studioMap;
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.get("/api/store/items", (req, res) => {
    const db = readDB() as any;
    res.json(db.items || []);
  });

  // Store game state (in-memory for real-time)
  const rooms: Record<string, {
    players: Record<string, any>;
    mapObjects: any[];
  }> = {};

  const activeUserSockets = new Map<string, string>(); // socket.id -> username
  const MAX_GLOBAL_PLAYERS = 50;

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Identity check for limit/queue
    socket.on("identify", (username) => {
      const db = readDB();
      const currentOnlineCount = activeUserSockets.size;

      if (currentOnlineCount >= MAX_GLOBAL_PLAYERS && !activeUserSockets.has(socket.id)) {
        socket.emit("server-full", {
          message: "Lo sentimos, este juego está constantemente en desarrollo. Hay una cola de espera o el juego está lleno (Límite 50). Prueba otro día.",
          count: currentOnlineCount
        });
        return;
      }

      activeUserSockets.set(socket.id, username);
      if (db.users[username]) {
        db.users[username].online = true;
        db.users[username].lastSeen = new Date().toISOString();
        writeDB(db);
        io.emit("user-status-changed", { username, online: true });
      }
    });

    // Periodic XP Gain (10 XP every 1 minute if online)
    const xpInterval = setInterval(() => {
        const username = activeUserSockets.get(socket.id);
        if (username) {
            const db = readDB();
            if (db.users[username]) {
                const currentXp = db.users[username].xp || 0;
                const currentLevel = db.users[username].level || 1;
                const nextXp = currentXp + 10;
                const nextLevel = Math.floor(nextXp / 100) + 1;
                
                db.users[username].xp = nextXp;
                if (nextLevel > currentLevel) {
                    db.users[username].level = nextLevel;
                    socket.emit("level-up", { level: nextLevel });
                }
                writeDB(db);
                socket.emit("xp-update", { xp: nextXp, level: db.users[username].level });
            }
        }
    }, 60000);

    // Real-time Publishing
    socket.on("publish-game", (gameData) => {
      const db = readDB();
      const newGame = {
        ...gameData,
        id: gameData.id || Date.now().toString(),
        likesCount: 0,
        stars: 0,
        starCount: 0,
        playing: 0,
        createdAt: new Date().toISOString()
      };
      db.games.unshift(newGame);

      // --- NEW: Generate Creator Code if doesn't exist ---
      const creator = gameData.creator;
      if (db.users[creator] && !db.users[creator].creatorCode) {
        db.users[creator].creatorCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      }

      writeDB(db);
      io.emit("game-published", newGame);
    });

    socket.on("publish-video", (videoData) => {
      const db = readDB() as any;
      if (!db.videos) db.videos = [];
      const newVideo = {
        ...videoData,
        id: Date.now().toString(),
        likes: [],
        createdAt: new Date().toISOString()
      };
      db.videos.unshift(newVideo);
      writeDB(db);
      io.emit("video-published", newVideo);
    });

    socket.on("publish-item", (itemData) => {
      const db = readDB() as any;
      if (!db.items) db.items = [];
      const newItem = {
        ...itemData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      };
      db.items.unshift(newItem);
      writeDB(db);
      io.emit("item-published", newItem);
    });

    socket.on("rate-game", ({ gameId, stars }) => {
      const db = readDB();
      const gameIndex = db.games.findIndex(g => g.id === gameId);
      if (gameIndex !== -1) {
        const game = db.games[gameIndex];
        const currentTotalStars = (game.stars || 0) * (game.starCount || 0);
        const newStarCount = (game.starCount || 0) + 1;
        const newStars = (currentTotalStars + stars) / newStarCount;
        
        db.games[gameIndex] = {
          ...game,
          stars: newStars,
          starCount: newStarCount
        };
        writeDB(db);
        io.emit("game-updated", db.games[gameIndex]);
      }
    });

    socket.on("like-game", ({ gameId }) => {
      const db = readDB();
      const gameIndex = db.games.findIndex(g => g.id === gameId);
      if (gameIndex !== -1) {
        const game = db.games[gameIndex];
        db.games[gameIndex] = {
          ...game,
          likesCount: (game.likesCount || 0) + 1
        };
        writeDB(db);
        io.emit("game-updated", db.games[gameIndex]);
      }
    });

    socket.on("play-game", ({ gameId, username }) => {
      const db = readDB();
      if (db.users[username]) {
        if (!db.users[username].playedHistory) db.users[username].playedHistory = [];
        if (!db.users[username].playedHistory.includes(gameId)) {
          db.users[username].playedHistory.unshift(gameId);
          writeDB(db);
        }
      }
    });

    socket.on("use-clothing", ({ itemId, username }) => {
      const db = readDB();
      if (db.users[username]) {
        if (!db.users[username].clothingHistory) db.users[username].clothingHistory = [];
        if (!db.users[username].clothingHistory.includes(itemId)) {
          db.users[username].clothingHistory.unshift(itemId);
          writeDB(db);
        }
      }
    });

    socket.on("join-room", (roomId, userData) => {
      socket.join(roomId);
      if (!rooms[roomId]) {
        rooms[roomId] = { players: {}, mapObjects: [] };
      }
      
      rooms[roomId].players[socket.id] = {
        id: socket.id,
        ...userData,
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        isMoving: false,
        isJumping: false,
        isTalking: false
      };

      // Send current state to the new player
      socket.emit("room-state", rooms[roomId]);
      
      // Notify others
      socket.to(roomId).emit("player-joined", rooms[roomId].players[socket.id]);
    });

    socket.on("update-player", (roomId, data) => {
      if (rooms[roomId] && rooms[roomId].players[socket.id]) {
        rooms[roomId].players[socket.id] = {
          ...rooms[roomId].players[socket.id],
          ...data
        };
        socket.to(roomId).emit("player-updated", rooms[roomId].players[socket.id]);
      }
    });

    socket.on("update-map", (roomId, mapObjects) => {
      if (rooms[roomId]) {
        rooms[roomId].mapObjects = mapObjects;
        socket.to(roomId).emit("map-updated", mapObjects);
      }
    });

    socket.on("voice-data", (roomId, audioData) => {
      // Broadcast voice data to others in the room (Legacy Socket.io fallback)
      socket.to(roomId).emit("remote-voice", socket.id, audioData);
    });

    // --- WebRTC Signaling ---
    socket.on("webrtc-signal", (roomId, targetId, signal) => {
      // Forward signal (offer, answer, or ice-candidate) to the specific target
      socket.to(targetId).emit("webrtc-signal", socket.id, signal);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      
      const username = activeUserSockets.get(socket.id);
      if (username) {
        activeUserSockets.delete(socket.id);
        const db = readDB();
        if (db.users[username]) {
          db.users[username].online = false;
          db.users[username].lastSeen = new Date().toISOString();
          writeDB(db);
          io.emit("user-status-changed", { username, online: false });
        }
      }

      for (const roomId in rooms) {
        if (rooms[roomId].players[socket.id]) {
          delete rooms[roomId].players[socket.id];
          io.to(roomId).emit("player-left", socket.id);
        }
      }
    });
  });

  // API fallback: return JSON for missing API routes instead of HTML
  app.all("/api/*all", (req, res) => {
    console.log(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: "Route not found", path: req.url });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Glidrovia Server is starting...`);
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
