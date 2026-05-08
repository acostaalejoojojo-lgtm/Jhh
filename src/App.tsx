import React, { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getDocs,
  addDoc
} from 'firebase/firestore';
import { User, Page, AvatarConfig, Game, MapObject, Server, AppSettings, CustomAnimation, StoreItem, RemotePlayer } from './types';
import { AvatarScene } from './components/AvatarScene';
import { TermsModal } from './components/TermsModal';
import { ReportModal } from './components/ReportModal';
import ErrorBoundary from './components/ErrorBoundary';
import { AvatarEditor } from './pages/AvatarEditor';
import { AnimationEditor } from './pages/AnimationEditor';
import { DeveloperMenu } from './components/DeveloperMenu';
import { StudioPage } from './pages/Studio';
import { GameCard } from './components/GameCard';
import { Chat } from './components/Chat';
import { io, Socket } from 'socket.io-client';
import { dataService, GameData } from './lib/dataService';
import { isSupabaseEnabled, checkSupabaseConnection } from './lib/supabase';
import { EmoteWheel } from './components/EmoteWheel';
import { 
  Play, ThumbsUp, User as UserIcon, Server as ServerIcon, Plus, Users, Settings as SettingsIcon, 
  Globe, Palette, Trash2, Search, LogOut as LogOutIcon, Star, Skull, Box as BoxIcon, 
  Triangle as TriangleIcon, ShieldCheck, Shield, CreditCard, Key, Upload, Database, Flag, BadgeCheck,
  Smile, Video, Heart
} from 'lucide-react';

const TRANSLATIONS = {
  es: {
    home: "Inicio",
    profile: "Perfil",
    experiences: "Experiencias",
    avatar: "Avatar",
    create: "Crear",
    friends: "Amigos",
    settings: "Ajustes",
    customize: "Personalizar",
    play: "Jugar",
    welcome: "Hola",
    search_results: "Resultados de búsqueda para",
    recommended_users: "Usuarios Recomendados",
    search_users: "Buscar usuarios...",
    users: "Usuarios",
    add: "Agregar",
    online: "En línea",
    no_friends: "Aún no tienes amigos. ¡Busca usuarios arriba para agregarlos!",
    back_home: "← Volver al Inicio",
    language: "Idioma",
    region: "Región del Servidor",
    bg_color: "Color de Fondo",
    save: "Guardar",
    logout: "Cerrar Sesión",
    voxels: "Voxels",
    active_players: "Activos",
    likes: "Me gusta",
    join: "Unirse",
    create_server: "Crear Servidor Privado",
    server_name: "Nombre del Servidor",
    players: "Jugadores",
    ping: "Ping",
    action: "Acción",
    connected: "Conectado",
    exit_game: "Salir del Juego",
    stop: "Detener"
  },
  en: {
    home: "Home",
    profile: "Profile",
    experiences: "Experiences",
    avatar: "Avatar",
    create: "Create",
    friends: "Friends",
    settings: "Settings",
    customize: "Customize",
    play: "Play",
    welcome: "Hello",
    search_results: "Search results for",
    recommended_users: "Recommended Users",
    search_users: "Search users...",
    users: "Users",
    add: "Add",
    online: "Online",
    no_friends: "You don't have friends yet. Search for users above to add them!",
    back_home: "← Back to Home",
    language: "Language",
    region: "Server Region",
    bg_color: "Background Color",
    save: "Save",
    logout: "Logout",
    voxels: "Voxels",
    active_players: "Active",
    likes: "Likes",
    join: "Join",
    create_server: "Create Private Server",
    server_name: "Server Name",
    players: "Players",
    ping: "Ping",
    action: "Action",
    connected: "Connected",
    exit_game: "Exit Game",
    stop: "Stop"
  }
};

const RANKS = [
  { name: 'Bronce', minXp: 0, color: '#CD7F32' },
  { name: 'Plata', minXp: 500, color: '#C0C0C0' },
  { name: 'Oro', minXp: 1500, color: '#FFD700' },
  { name: 'Platino', minXp: 3500, color: '#E5E4E2' },
  { name: 'Diamante', minXp: 7000, color: '#00F2FF', iconUrl: 'https://vignette.wikia.nocookie.net/roblox/images/a/a2/Diamond_Rank.png/revision/latest?cb=20190520211111' },
  { name: 'Maestro', minXp: 12000, color: '#FF00FF' },
  { name: 'Leyenda', minXp: 20000, color: '#FF4500' }
];

const getRankInfo = (xp: number) => {
  let currentRank = RANKS[0];
  let nextRank = RANKS[1];
  
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) {
      currentRank = RANKS[i];
      nextRank = RANKS[i+1] || RANKS[i];
    } else {
      break;
    }
  }
  
  const range = nextRank.minXp - currentRank.minXp;
  const progress = range === 0 ? 100 : Math.min(100, ((xp - currentRank.minXp) / range) * 100);
  
  return { ...currentRank, progress };
};

const LoadingSplash = ({ error, onRetry, onSkip }: { error?: string | null, onRetry: () => void, onSkip?: () => void }) => (
  <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#1a1b1e] text-white font-sans">
    <div className="w-[100px] h-[100px] bg-[#2563eb] border-4 border-white rounded-[24px] flex items-center justify-center mb-6 shadow-[0_10px_30px_rgba(37,99,235,0.4)] relative">
      <div className="w-[40px] h-[10px] bg-white rounded-[5px] -rotate-45 absolute top-[30px] left-[20px]"></div>
      <div className="w-[10px] h-[40px] bg-white rounded-[5px] -rotate-45 absolute top-[20px] left-[30px]"></div>
      <div className="w-[40px] h-[8px] bg-white/80 rounded-[4px] rotate-[15deg] absolute bottom-[25px] right-[15px]"></div>
    </div>
    <h1 className="text-3xl font-black tracking-[2px] mb-2 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">GLIDROVIA</h1>
    {!error ? (
      <>
        <div className="w-[240px] h-1 bg-[#2b2d31] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-[loading_1.5s_infinite_ease-in-out]"></div>
        </div>
        <p className="mt-4 text-[#9ca3af] text-[12px] font-bold uppercase tracking-[1px]">Sincronizando mundos...</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-4 py-1 text-[10px] text-gray-500 hover:text-white border border-white/10 hover:border-white/30 rounded uppercase tracking-widest transition-all"
        >
          Reintentar Carga
        </button>
      </>
    ) : (
      <div className="text-center px-4 max-w-md">
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-6">
          <p className="text-red-400 text-sm font-medium mb-2">⚠️ Error de Inicialización</p>
          <p className="text-gray-400 text-xs leading-relaxed">{error}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onRetry}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-900/20"
          >
            Reintentar Conexión
          </button>
          <button 
            onClick={onSkip}
            className="w-full bg-white/5 hover:bg-white/10 text-gray-400 py-3 rounded-xl font-bold text-sm transition-all border border-white/10"
          >
            Continuar sin Supabase (Modo Local)
          </button>
        </div>
      </div>
    )}
    <style>{`
      @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
    `}</style>
  </div>
);

const UpdateModal = ({ user, onUpdate }: { user: User, onUpdate: () => void }) => {
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  const startUpdate = () => {
    setUpdating(true);
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 12;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(onUpdate, 800);
      }
      setProgress(p);
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-[#1a1b1e] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-[80px]"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-[80px]"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="bg-blue-600/10 p-4 rounded-2xl border border-blue-500/30 mb-6">
             <Database className="text-blue-400" size={40} />
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight italic uppercase">
            {updating ? "Cargando Archivos" : "Nueva Versión Disponible"}
          </h2>
          <p className="text-blue-400 font-bold tracking-widest text-[10px] uppercase mb-8">Glidrovia Engine v5.0.0</p>
          
          <div className="w-full bg-[#2b2d31] border border-white/5 rounded-2xl p-6 mb-8 text-sm leading-relaxed text-gray-300">
            <h3 className="text-red-400 font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-xs">
               <Skull size={14} /> Reglas de la Comunidad (Alejo)
            </h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">1.</span>
                <p>Contenido explícito o sexual será eliminado de inmediato. Tu cuenta correrá un 60% de riesgo de baneo.</p>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">2.</span>
                <p>Contenido spam o engaño será eliminado al 80%. No uses mods o hacks.</p>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-500 font-bold shrink-0">3.</span>
                <p>Cualquier intento de hackeo de cuentas resultará en pausa inmediata de tu cuenta y riesgo de baneo permanente (40%).</p>
              </li>
            </ul>
          </div>

          {!updating ? (
            <button 
              onClick={startUpdate}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-blue-900/30 active:scale-95"
            >
              ACTUALIZAR GLIDROVIA
            </button>
          ) : (
            <div className="w-full">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Procesando Actualización...</span>
                <span className="text-blue-400 font-mono font-bold">{Math.floor(progress)}%</span>
              </div>
              <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<Page>(Page.HOME);
  const [user, setUser] = useState<User | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [socialTab, setSocialTab] = useState<'friends' | 'community'>('friends');
  const [settings, setSettings] = useState<AppSettings>({ language: 'es', backgroundColor: '#1a1b1e', selectedRegion: 'Global' });
  const [publicRegions, setPublicRegions] = useState<any[]>([]);
  const [publishingRegion, setPublishingRegion] = useState(false);
  const [customRegionName, setCustomRegionName] = useState('');
  const [isEmoteWheelOpen, setIsEmoteWheelOpen] = useState(false);
  const [activeEmote, setActiveEmote] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{ connected: boolean, error?: string, url?: string }>({ connected: false });
  const [messages, setMessages] = useState<{user: string, text: string}[]>([]);
  const [micActive, setMicActive] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayer>>({});

  useEffect(() => {
    const check = async () => {
      const status = await checkSupabaseConnection();
      setSupabaseStatus(status);
    };
    check();
  }, []);

  useEffect(() => {
    if (user) {
      import('./lib/p2pService').then(({ p2pService }) => {
        p2pService.init(user.uid);
        p2pService.setHandlers(
          (msg) => {
            setMessages(prev => [...prev.slice(-49), msg]);
          },
          (update) => {
             if (update.id) {
                setRemotePlayers(prev => ({
                  ...prev,
                  [update.id]: { ...prev[update.id], ...update, id: update.id } as RemotePlayer
                }));
             }
          }
        );
      });
    }
  }, [user]);

  useEffect(() => {
    const handleCommand = async (e: any) => {
        const cmd = e.detail.command.toLowerCase().trim();
        if (cmd === 'microphone-on') {
            const { p2pService } = await import('./lib/p2pService');
            const success = await p2pService.toggleMic(true);
            if (success) {
                setMicActive(true);
                setMessages(prev => [...prev.slice(-49), { user: 'Sistema', text: '🎤 Micrófono encendido' }]);
            }
        } else if (cmd === 'microphone-off') {
            const { p2pService } = await import('./lib/p2pService');
            await p2pService.toggleMic(false);
            setMicActive(false);
            setMessages(prev => [...prev.slice(-49), { user: 'Sistema', text: '🔇 Micrófono apagado' }]);
        }
    };
    window.addEventListener('chat-command', handleCommand);
    return () => window.removeEventListener('chat-command', handleCommand);
  }, []);

  const handleSelectEmote = (emoteId: string) => {
    setActiveEmote(emoteId);
    
    // Check if it's the builtin 'emote1' or a dynamic emote
    let emote;
    if (emoteId === 'emote1') {
       emote = { name: 'Emote 1', soundUrl: null };
    } else {
       emote = avatarConfig.customAnimations?.emotes?.find(e => (e as any).id === emoteId);
    }

    if (emote?.soundUrl) {
      const audio = new Audio(emote.soundUrl);
      audio.play().catch(e => console.error("Sound play failed:", e));
    }
    
    // Clear emote after some time or when moving
    setTimeout(() => {
      setActiveEmote(null);
    }, 5000);
  };
  
  useEffect(() => {
    const init = async () => {
      try {
        const regions = await dataService.getPublicRegions();
        setPublicRegions(regions);

        const items = await dataService.getStoreItems();
        setPublishedItems(items as any);

        if (isSupabaseEnabled()) {
          const status = await checkSupabaseConnection();
          if (!status.connected) {
            setLoadingError(`Error de conexión con Supabase: ${status.error || 'Desconocido'}. Verifica tu URL y Anon Key en Configuración.`);
          }
        }
      } catch (err) {
        console.error("Init error:", err);
      } finally {
        setTimeout(() => setIsAppReady(true), 1000);
      }
    };
    init();
  }, []);

  const t = TRANSLATIONS[settings.language as 'es' | 'en'];
  
  // Game Play State
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  // Initial Games
  const [publishedGames, setPublishedGames] = useState<Game[]>([]);
  const [publishedItems, setPublishedItems] = useState<StoreItem[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (isAuthenticated && user && socket) {
      socket.emit("identify", user.username);
      (window as any).currentUserLevel = user.level || 1;
    }
  }, [isAuthenticated, user?.username, user?.level, socket]);

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on("game-published", (newGame: Game) => {
      setPublishedGames(prev => [newGame, ...prev]);
    });

    s.on("item-published", (newItem: StoreItem) => {
      setPublishedItems(prev => [newItem, ...prev]);
    });

    s.on("game-updated", (updatedGame: Game) => {
      setPublishedGames(prev => prev.map(g => g.id === updatedGame.id ? updatedGame : g));
    });

    s.on("server-full", (data: { message: string, count: number }) => {
      alert(data.message);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleNavigate = (e: any) => {
        if (e.detail === 'ANIMATION_EDITOR') {
            setCurrentPage(Page.ANIMATION_EDITOR);
        }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  useEffect(() => {
      // Fetch initial games with retry
      const fetchGames = async (retries = 3) => {
          try {
              const data = await dataService.getGames();
              setPublishedGames(data as any);
          } catch (e) {
              console.error("Error fetching games:", e);
              if (retries > 0) {
                  console.log(`Retrying fetch games... (${retries} retries left)`);
                  setTimeout(() => fetchGames(retries - 1), 2000);
              }
          }
      };
      fetchGames();
  }, []);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    // Real-time users for search and recommendations
    const unsubscribe = dataService.subscribeToUsers((users) => {
        setAllUsers(users as User[]);
    });
    return () => unsubscribe();
  }, []);

  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    bodyColors: {
      head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429'
    },
    faceTextureUrl: null,
    accessories: { hatModelUrl: null, shirtTextureUrl: null },
    hideFace: false
  });

  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [globalAvatar, setGlobalAvatar] = useState<AvatarConfig | null>(null);
  const [globalAvatarReplacement, setGlobalAvatarReplacement] = useState<{ url: string; isFbx: boolean } | null>(null);

  useEffect(() => {
    // Listen to global settings
    const unsubscribeGlobal = dataService.subscribeToGlobalSettings((data) => {
        if (data.global_avatar) {
          setGlobalAvatar(data.global_avatar);
        }
        if (data.global_avatar_replacement) {
          setGlobalAvatarReplacement(data.global_avatar_replacement);
        } else {
          setGlobalAvatarReplacement(null);
        }
    });
    return () => unsubscribeGlobal();
  }, []);

  useEffect(() => {
    if (searchQuery) {
        dataService.searchUsers(searchQuery)
            .then(data => setFilteredUsers(data))
            .catch(err => console.error("Error searching users:", err));
    } else {
        setFilteredUsers([]);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (isSupabaseEnabled()) {
        // Supabase mode: check local storage for session
        const storedUser = localStorage.getItem('glidroviaUser');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            // Subscribe to user updates
            localStorage.setItem('glidroviaUid', parsedUser.uid || '');
            const unsubscribe = dataService.subscribeToUser(parsedUser.username, (userData) => {
                setUser(userData as User);
                if (userData.avatar_config) setAvatarConfig(userData.avatar_config);
                if (userData.settings) setSettings(userData.settings);
                setIsAuthenticated(true);
            });
            return () => unsubscribe();
        }
    } else {
        // Firebase mode
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
          if (firebaseUser) {
            const unsubscribeUser = onSnapshot(doc(db, 'users', firebaseUser.uid), async (userDoc) => {
              if (userDoc.exists()) {
                const userData = userDoc.data() as User;
                localStorage.setItem('glidroviaUid', firebaseUser.uid);
                setUser(userData);
                if (userData.avatarConfig) setAvatarConfig(userData.avatarConfig);
                if (userData.settings) setSettings(userData.settings);
                setIsAuthenticated(true);
              } else {
                // Create new user profile in Firestore if it doesn't exist
                const username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
                const newUser: User = {
                  uid: firebaseUser.uid,
                  username: username,
                  displayName: firebaseUser.displayName || 'User',
                  robux: username.toLowerCase() === 'glidrovia oficial' ? 99999 : 0,
                  tokens: username.toLowerCase() === 'glidrovia oficial' ? 99999 : 0,
                  drovis: username.toLowerCase() === 'glidrovia oficial' ? 99999 : 0,
                  friends: [],
                  avatarConfig: avatarConfig,
                  settings: settings,
                  rank: username.toLowerCase() === 'glidrovia oficial' ? 'Diamante' : 'Bronze',
                  usernameChangeCards: 1,
                  creatorCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                  usedCreatorCode: false
                };
                try {
                    await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                    // Create username index
                    await setDoc(doc(db, 'users_by_username', newUser.username.toLowerCase()), { uid: firebaseUser.uid });
                } catch (err) {
                    try {
                        handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
                    } catch (e) {
                        console.error("Error creating user profile:", e);
                    }
                }
              }
            }, (err) => {
                try {
                    handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
                } catch (e) {
                    console.error("Firestore User Snapshot Error:", e);
                }
            });
            return () => unsubscribeUser();
          } else {
            // User is signed out, check legacy local storage
            const storedUser = localStorage.getItem('glidroviaUser');
            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                handleLogin(parsedUser.username);
            }
          }
        });
        return () => unsubscribeAuth();
    }
  }, []);

  const handleUpdateAvatar = async (config: AvatarConfig) => {
    // If global avatar is active, we might want to override or just update user's own
    setAvatarConfig(config);
    if (user) {
        try {
            await dataService.updateAvatar(user.username, config);
            
            // If user is glidrovia, they can update the global avatar
            if (user?.username?.toLowerCase() === 'glidrovia') {
                await dataService.updateGlobalSettings({ global_avatar: config });
            }
        } catch (err) {
            console.error("Error updating avatar:", err);
        }
    }
  };

  const handleLogin = async (username: string, password?: string) => {
    if (!username.trim()) return;
    try {
        // Sign in anonymously to Firebase to have a session for Firestore rules if not already logged in
        if (!auth.currentUser && !isSupabaseEnabled()) {
            try {
                await signInAnonymously(auth);
            } catch (authErr) {
                console.error("Firebase Anonymous Auth failed:", authErr);
            }
        }

        const userData = await dataService.login(username, password);
        
        if (userData.error) {
          alert(userData.error);
          return;
        }

        // Check for specific rules in games
        const games = await dataService.getGames();
        const flaggedGames = games.filter(g => 
            g.title.toLowerCase().includes('sex') || 
            g.title.toLowerCase().includes('hack') || 
            g.title.toLowerCase().includes('explicit')
        );

        if (flaggedGames.length > 0) {
            console.warn("Detected games violating rules. Notifying admin system.");
        }

        setUser(userData);
        if (!userData.acceptedToS) {
            dataService.updateUserToS(userData.username, true, userData.uid).catch(e => console.error("Non-blocking ToS update failed:", e));
        }
        if (userData.avatarConfig) setAvatarConfig(userData.avatarConfig);
        if (userData.settings) setSettings(userData.settings);
        localStorage.setItem('glidroviaUser', JSON.stringify({ username: userData.username }));
        localStorage.setItem('glidroviaUid', userData.uid);
        setIsAuthenticated(true);
    } catch (err) {
        console.error("Error logging in:", err);
        alert("Error al iniciar sesión. Por favor, intenta de nuevo.");
    }
  };

  const handleApplyUpdate = async () => {
    if (!user) return;
    try {
        const resetConfig: AvatarConfig = {
          bodyColors: {
            head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429'
          },
          accessories: { hatModelUrl: null, shirtTextureUrl: null },
          faceTextureUrl: null,
          hideFace: false,
          customAnimations: {
              idleUrl: null,
              walkUrl: null,
              jumpUrl: null,
              emote1Url: null,
              emoteButtonText: 'Emotes',
              emotes: []
          }
        };

        // Update local state immediately so modal disappears
        setUser({ ...user, isUpdated: true, avatarConfig: resetConfig });
        setAvatarConfig(resetConfig);
        
        // Notify server
        await dataService.updateUserUpdateStatus(user.username, true);
        await dataService.updateAvatar(user.username, resetConfig);
    } catch (err) {
        console.error("Error applying update:", err);
    }
  };

  const handleGoogleLogin = async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (err) {
        console.error("Error signing in with Google:", err);
        alert("Error al iniciar sesión con Google");
    }
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('glidroviaUser');
    } catch (err) {
        console.error("Error signing out:", err);
    }
  };

  const handleAddFriend = (friendName: string) => {
    if (!user) return;
    const updatedUser = { ...user, friends: [...(user.friends || []), friendName] };
    setUser(updatedUser);
    // Note: Friend persistence could also be moved to backend, but keeping it simple for now
    // as per the user's request to have "its own database" which I'm implementing via the user object
    localStorage.setItem('glidroviaUser', JSON.stringify({ username: user.username }));
    alert(`${t.add} ${friendName}!`);
  };

  const handleSaveAnimation = async (animation: CustomAnimation, type: 'Idle' | 'Walk' | 'Jump') => {
    if (!user) return;
    const newConfig = {
        ...avatarConfig,
        customAnimations: {
            ...avatarConfig.customAnimations,
            data: {
                ...(avatarConfig.customAnimations?.data || {}),
                [type]: animation
            }
        }
    };
    setAvatarConfig(newConfig);
    try {
        await dataService.updateAvatar(user.username, newConfig);
        if (socket) {
            socket.emit("update-avatar", { username: user.username, config: newConfig });
        }
    } catch (err) {
        console.error("Error saving custom animation:", err);
    }
  };

  const handleUpdateSettings = async (newSettings: any) => {
    setSettings(newSettings);
    if (user) {
        try {
            await dataService.updateSettings(user.username, newSettings);
        } catch (err) {
            console.error("Error updating settings:", err);
        }
    }
  };

  const handleChangeUsername = async (newUsername: string) => {
    if (!user) return;
    if (!newUsername.trim()) return;
    
    // Check if user has cards
    if ((user.usernameChangeCards || 0) <= 0) {
        alert("No tienes tarjetas de cambio de nombre.");
        return;
    }

    try {
        await dataService.updateUsername(user.uid, user.username, newUsername);
        
        // Update local state
        const updatedUser = { 
            ...user, 
            username: newUsername,
            displayName: newUsername,
            lastUsernameChange: new Date().toISOString(),
            usernameChangeCards: (user.usernameChangeCards || 1) - 1
        };
        setUser(updatedUser);
        
        alert("¡Nombre de usuario cambiado con éxito!");
    } catch (err: any) {
        console.error("Error changing username:", err);
        alert(`Error al cambiar el nombre de usuario: ${err.message || 'Error desconocido'}`);
    }
  };

  const handleUploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    try {
        const url = await dataService.uploadFile(file);
        const videoData = {
            url: url,
            creatorUid: user.uid,
            creatorName: user.displayName,
            createdAt: new Date().toISOString()
        };
        
        if (socket) {
            socket.emit("publish-video", videoData);
        }

        const updatedGallery = [url, ...(user.gallery || [])];
        const updatedUser = { ...user, gallery: updatedGallery };
        setUser(updatedUser);
        
        await dataService.updateGallery(user.username, updatedGallery);
        alert("¡Video subido y publicado en tiempo real!");
    } catch (err) {
        console.error("Error uploading to gallery:", err);
    }
  };

  const handlePublishGame = async (gameData: { title: string, map: MapObject[], skybox: string, thumbnail?: string }) => {
      const gameId = Date.now().toString();
      const newGame: Game = {
          id: gameId,
          title: gameData.title,
          creator: user?.displayName || 'Anon',
          creatorUid: user?.uid || 'anon',
          thumbnail: gameData.thumbnail || 'https://picsum.photos/seed/' + Math.random() + '/768/432',
          likes: '0%',
          likesCount: 0,
          stars: 0,
          starCount: 0,
          playing: 0,
          creatorAvatarConfig: avatarConfig, // Store current avatar config
          mapData: gameData.map,
          skybox: gameData.skybox
      };
      
      try {
          await dataService.saveGame(newGame);
          
          if (socket) {
              socket.emit("publish-game", newGame);
          }
          
          // Generate Creator Code if not exists
          if (!user?.creatorCode) {
              const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              await updateDoc(doc(db, 'users', user?.uid || ''), { creatorCode: newCode });
              alert(`¡Juego publicado! Ahora tienes tu código de creador: ${newCode}`);
          } else {
              alert(`¡Juego publicado! Recuerda que tu código de creador es: ${user.creatorCode}`);
          }
      } catch (err) {
          console.error("Error publishing game:", err);
          alert("Error al publicar el juego.");
      }
  };

  const openGameDetails = (game: Game) => {
      setSelectedGame(game);
      setCurrentPage(Page.PLAY);
  };

  if (!isAuthenticated) return <LoginPage onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />;

  if (user && !user.isUpdated) {
    return <UpdateModal user={user} onUpdate={handleApplyUpdate} />;
  }

  const filteredGames = (publishedGames || []).filter(g => {
    const title = g.title || '';
    const creator = g.creator || '';
    const query = searchQuery || '';
    return title.toLowerCase().includes(query.toLowerCase()) || 
           creator.toLowerCase().includes(query.toLowerCase());
  });

  const searchedUsers = (allUsers || []).filter(u => {
    const username = u.username || '';
    const displayName = u.displayName || '';
    const query = searchQuery || '';
    return username.toLowerCase().includes(query.toLowerCase()) || 
           displayName.toLowerCase().includes(query.toLowerCase());
  });

  // --- ANIMATION EDITOR ---
  if (currentPage === Page.ANIMATION_EDITOR) {
      return (
          <div className="h-screen w-screen">
              <AnimationEditor 
                config={avatarConfig} 
                onSave={handleSaveAnimation} 
                onBack={() => setCurrentPage(Page.AVATAR)} 
              />
          </div>
      );
  }

  // --- STUDIO MODE ---
  if (currentPage === Page.STUDIO) {
      return (
        <div className="h-screen w-screen" style={{ backgroundColor: settings.backgroundColor }}>
           <button onClick={() => setCurrentPage(Page.HOME)} className="fixed top-3 right-3 z-50 bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-xs rounded shadow-md">{t.stop}</button>
           <StudioPage 
            onPublish={handlePublishGame} 
            avatarConfig={avatarConfig} 
            username={user?.username} 
            playerName={user?.displayName} 
            settings={settings}
          />
        </div>
      );
  }

  if (!isAppReady) {
    return (
      <LoadingSplash 
        error={loadingError} 
        onRetry={() => window.location.reload()} 
        onSkip={() => {
          setLoadingError(null);
          setIsAppReady(true);
        }}
      />
    );
  }

  // --- GAME PLAY MODE (LAUNCHER) ---
  if (currentPage === Page.PLAY && selectedGame && user) {
      return <GamePlayerView game={selectedGame} avatarConfig={avatarConfig} onBack={() => setCurrentPage(Page.HOME)} user={user} setUser={setUser} t={t} settings={settings} allUsers={allUsers} globalAvatarReplacement={globalAvatarReplacement} />;
  }


  const handleUseCreatorCode = async (code: string) => {
    if (!user || user.usedCreatorCode) return;
    try {
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) return;

      let reward = 0;
      if (normalizedCode === 'GLIDROVIA') {
        reward = 200;
      } else {
        const creator = allUsers.find(u => u.creatorCode === normalizedCode);
        if (creator) {
          reward = 100;
        } else {
          alert("Código no válido");
          return;
        }
      }

      const updatedUser = {
        ...user,
        tokens: (user.tokens || 0) + reward,
        usedCreatorCode: true
      };
      
      setUser(updatedUser);
      if (socket) {
        socket.emit("update-user-profile", updatedUser);
      }
      alert(`¡Código canjeado! Has recibido ${reward} tokens.`);
    } catch (err) {
      console.error("Error using creator code:", err);
    }
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: settings.backgroundColor }}>
        {user && <Navbar user={user} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={() => { setUser(null); setIsAuthenticated(false); }} onSearch={setSearchQuery} onNavigate={setCurrentPage} />}
        
        <div className="flex flex-1 pt-[0px] relative">
          <Sidebar isOpen={sidebarOpen} currentPage={currentPage} onNavigate={setCurrentPage} user={user} t={t} />
          
          <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-16'} ml-0 relative`}>
            {/* Emote Button */}
            {user && currentPage === Page.HOME && (
                <button 
                  onClick={() => setIsEmoteWheelOpen(true)}
                  className="fixed bottom-24 right-8 z-[90] w-auto px-6 h-14 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all hover:scale-110 active:scale-95 group"
                >
                  <Smile size={28} />
                  <span className="font-black italic uppercase tracking-tighter text-sm pr-2">
                    {avatarConfig.customAnimations?.emoteButtonText || 'Emotes'}
                  </span>
                  <div className="absolute right-full mr-3 bg-black/80 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest whitespace-nowrap">
                    Menú Personalizado
                  </div>
                </button>
            )}

            <EmoteWheel 
              isOpen={isEmoteWheelOpen} 
              onClose={() => setIsEmoteWheelOpen(false)} 
              emotes={[
                ...(avatarConfig.customAnimations?.emote1Url ? [{ id: 'emote1', name: 'Emote 1', animationUrl: avatarConfig.customAnimations.emote1Url }] : []),
                ...(avatarConfig.customAnimations?.emotes || [])
              ]}
              onSelect={handleSelectEmote}
            />
            {currentPage === Page.HOME && user && (
              <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
                 {searchQuery && (
                    <div className="mb-8">
                        <h2 className="text-xl font-bold text-white mb-4">{t.search_results} "{searchQuery}"</h2>
                        {filteredUsers.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">{t.users}</h3>
                                <div className="flex flex-wrap gap-4">
                                    {filteredUsers.map(u => (
                                        <div key={u.username} className="bg-[#2b2d31] p-3 rounded-lg flex items-center gap-3 border border-gray-700">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-500">
                                                <AvatarScene config={u.avatarConfig} interactive={false} globalAvatar={globalAvatarReplacement} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="text-white font-bold text-sm">{u.displayName}</div>
                                                    {u.rank === 'Platinum' && <ShieldCheck size={12} className="text-white" />}
                                                </div>
                                                <div className="text-gray-500 text-xs">@{u.username}</div>
                                            </div>
                                            <button 
                                                onClick={() => handleAddFriend(u.username)}
                                                className="ml-2 bg-white/10 hover:bg-white/20 p-1.5 rounded text-xs font-bold"
                                            >{t.add}</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                 )}

                 <div className="flex flex-col md:flex-row gap-8 mb-10">
                    <div className="flex-1">
                        <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden mb-6 border border-white/10 shadow-2xl">
                            <img 
                                src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop" 
                                className="w-full h-full object-cover" 
                                alt="Banner"
                                referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
                                <h1 className="text-3xl md:text-5xl font-black text-white mb-1 tracking-tighter italic uppercase">GLIDROVIA</h1>
                                <div className="flex items-center gap-2">
                                    <p className="text-blue-400 font-bold tracking-widest text-xs uppercase">Bienvenido de nuevo, {user.displayName}</p>
                                    {(user.username.toLowerCase() === 'glidrovia' || user.isAdmin) && (
                                        <div className="bg-blue-500/20 p-1 rounded-full border border-blue-500/50 flex items-center justify-center animate-[shimmer_2s_infinite] shadow-[0_0_10px_rgba(59,130,246,0.5)]" title="Admin Oficial">
                                            <BadgeCheck size={12} className="text-blue-400" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
                     <div className="lg:col-span-1 bg-[#2b2d31] p-4 rounded-xl border border-[#393b3d] flex flex-col items-center">
                          <div className="w-full aspect-[3/4] rounded-lg overflow-hidden relative">
                              <ErrorBoundary>
                                <AvatarScene config={avatarConfig} interactive={false} globalAvatar={globalAvatarReplacement} selectedAnimation={activeEmote || avatarConfig.selectedAnimation} />
                              </ErrorBoundary>
                          </div>
                          {globalAvatarReplacement ? (
                              <div className="mt-4 w-full bg-blue-600/20 border border-blue-500/30 py-2 rounded-lg font-bold text-[10px] text-blue-400 text-center uppercase tracking-wider">
                                  Avatar Global Activo
                              </div>
                          ) : (
                              <button onClick={() => setCurrentPage(Page.AVATAR)} className="mt-4 w-full bg-white/10 hover:bg-white/20 py-2 rounded-lg font-medium text-sm transition-colors text-white">{t.customize}</button>
                          )}
                     </div>
                     <div className="lg:col-span-3">
                         <h3 className="text-xl font-bold text-white mb-4">{t.experiences} {searchQuery ? '(Filtradas)' : ''}</h3>
                         
                         {searchQuery && searchedUsers.length > 0 && (
                            <div className="mb-8">
                                <h4 className="text-sm font-bold text-gray-400 uppercase mb-3">Usuarios Encontrados</h4>
                                <div className="flex flex-wrap gap-4">
                                    {searchedUsers.map(u => (
                                        <div key={u.uid} className="bg-[#2b2d31] p-3 rounded-xl flex items-center gap-3 border border-gray-700 hover:border-blue-500 transition-colors cursor-pointer" onClick={() => { setCurrentPage(Page.PROFILE); }}>
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-500">
                                                <AvatarScene 
                                                    config={u.avatarConfig} 
                                                    interactive={false} 
                                                    globalAvatar={globalAvatarReplacement} 
                                                />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="text-white font-bold text-sm">{u.displayName}</div>
                                                    {(u.username.toLowerCase() === 'glidrovia' || u.isAdmin) && (
                                                        <div className="bg-blue-500/10 p-0.5 rounded-full animate-[shimmer_2s_infinite]">
                                                            <BadgeCheck size={10} className="text-blue-400" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-gray-500 text-xs">@{u.username}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                         )}

                         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                             {(searchQuery ? filteredGames : publishedGames).map(game => (
                                 <div key={game.id} onClick={() => openGameDetails(game)}>
                                     <GameCard game={game} />
                                 </div>
                             ))}
                         </div>
                     </div>
                 </div>
              </div>
            )}
            
            {currentPage === Page.PROFILE && (
                <div className="p-8 max-w-4xl mx-auto">
                    <div className="bg-[#2b2d31] rounded-2xl border border-gray-700 overflow-hidden shadow-2xl">
                        <div className="h-32 bg-gradient-to-r from-blue-600 to-purple-600"></div>
                        <div className="px-8 pb-8 flex flex-col md:flex-row gap-6">
                            <div className="w-48 h-48 -mt-24 bg-[#111213] rounded-2xl border-4 border-[#2b2d31] overflow-hidden shadow-lg relative">
                                <ErrorBoundary>
                                    <AvatarScene config={avatarConfig} interactive={false} globalAvatar={globalAvatarReplacement} selectedAnimation={activeEmote || avatarConfig.selectedAnimation} />
                                </ErrorBoundary>
                            </div>
                            <div className="flex-1 pt-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-3xl font-bold text-white">{user.displayName}</h2>
                                            {user.username.toLowerCase() === 'glidrovia' && (
                                                <div className="bg-blue-500/20 p-1 rounded-full border border-blue-500/50 flex items-center justify-center animate-[shimmer_2s_infinite] shadow-[0_0_10px_rgba(59,130,246,0.5)]" title="Verificado Oficial">
                                                    <BadgeCheck size={16} className="text-blue-400" />
                                                </div>
                                            )}
                                            {(() => {
                                                const info = getRankInfo(user.xp || 0);
                                                return (
                                                    <div className="bg-white/5 p-1.5 rounded-lg border border-white/10 flex items-center gap-2" title={`Rango ${info.name}`}>
                                                        {(info as any).iconUrl ? (
                                                            <img src={(info as any).iconUrl} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <Shield size={18} style={{ color: info.color }} />
                                                        )}
                                                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: info.color }}>{info.name}</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <p className="text-gray-400">@{user.username}</p>
                                    </div>
                                    <label className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer transition-colors">
                                        Subir Video
                                        <input type="file" accept="video/*" className="hidden" onChange={handleUploadGallery} />
                                    </label>
                                </div>
                                <div className="flex gap-4 mt-4">
                                    <div className="text-center">
                                        <div className="text-white font-bold">{(user.friends || []).length}</div>
                                        <div className="text-xs text-gray-500 uppercase">{t.friends}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-white font-bold">{(user.gallery || []).length}</div>
                                        <div className="text-xs text-gray-500 uppercase">Videos</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Creator Code Section */}
                    {user.creatorCode && (
                        <div className="mt-8 bg-blue-600/10 p-6 rounded-2xl border border-blue-500/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-blue-400 font-black uppercase tracking-tighter italic flex items-center gap-2 text-sm">
                                        <Star size={18} className="fill-blue-500" />
                                        Tu Código de Creador
                                    </h3>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Comparte este código para ganar recompensas especiales.</p>
                                </div>
                                <div className="bg-black/40 border border-blue-500/50 px-6 py-3 rounded-xl">
                                    <span className="text-2xl font-black text-white tracking-[0.2em]">{user.creatorCode}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Support Creator Section */}
                    {!user.usedCreatorCode && (
                        <div className="mt-4 bg-[#1e1f21] p-6 rounded-2xl border border-gray-800">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase italic tracking-tighter">
                                <Heart size={18} className="text-red-500" />
                                Apoya a un Creador
                            </h3>
                            <div className="flex gap-3">
                                <input 
                                    id="creator-code-input"
                                    type="text" 
                                    placeholder="Ingresa código (ej: GLIDROVIA)" 
                                    className="flex-1 bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-all uppercase font-bold"
                                />
                                <button 
                                    onClick={() => {
                                        const codeInput = document.getElementById('creator-code-input') as HTMLInputElement;
                                        handleUseCreatorCode(codeInput.value);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                                >
                                    Canjear
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Rank Classification Section */}
                    <div className="mt-8 bg-[#1a1b1e] p-6 rounded-2xl border border-gray-700 shadow-xl overflow-hidden relative group">
                        <div className="absolute top-0 right-0 p-8 transform translate-x-8 -translate-y-8 opacity-5 group-hover:opacity-10 transition-opacity">
                             <Shield size={120} />
                        </div>
                        <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2 italic uppercase tracking-tighter">
                             <Shield size={24} className="text-blue-500" />
                             Clasificación de Rangos
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {RANKS.map((rank, i) => {
                                const info = getRankInfo(user?.xp || 0);
                                const isCurrent = info.name === rank.name;
                                return (
                                    <div key={rank.name} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isCurrent ? 'bg-white/5 border-white/20 shadow-lg ring-1 ring-white/10' : 'bg-black/20 border-white/5 opacity-50'}`}>
                                        <div 
                                            className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl italic shrink-0 overflow-hidden relative shadow-lg"
                                            style={{ backgroundColor: `${rank.color}20`, color: rank.color, border: `1px solid ${rank.color}40` }}
                                        >
                                            {(rank as any).iconUrl ? (
                                                <img src={(rank as any).iconUrl} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
                                            ) : (
                                                <span className="relative z-10">{i + 1}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <h4 className="text-sm font-black uppercase tracking-tight truncate" style={{ color: rank.color }}>{rank.name}</h4>
                                                {isCurrent && <span className="bg-blue-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full text-white shrink-0">Actual</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-tight">{rank.minXp}+ XP</p>
                                        </div>
                                        {isCurrent && (
                                            <div className="w-20 shrink-0">
                                                <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                                    <div 
                                                        className="h-full transition-all duration-1000"
                                                        style={{ 
                                                            width: `${info.progress}%`,
                                                            backgroundColor: rank.color,
                                                            boxShadow: `0 0 10px ${rank.color}40`
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-4">Mis Mapas</h3>
                            <div className="grid grid-cols-1 gap-4">
                                {publishedGames.filter(g => g.creatorUid === user.uid).length > 0 ? (
                                    publishedGames.filter(g => g.creatorUid === user.uid).map(game => (
                                        <div key={game.id} onClick={() => openGameDetails(game)} className="bg-[#1e1f21] p-3 rounded-xl border border-gray-800 flex items-center gap-4 hover:bg-[#2b2d31] cursor-pointer transition-all">
                                            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-500/50 shrink-0 bg-[#111213]">
                                                <AvatarScene config={allUsers.find(u => u.uid === game.creatorUid)?.avatarConfig || {
                                                     bodyColors: { head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429' },
                                                     faceTextureUrl: null,
                                                     accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                                     hideFace: false
                                                }} interactive={false} globalAvatar={globalAvatarReplacement} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold text-sm truncate">{game.title}</div>
                                                <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest truncate">@{game.creator}</div>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 rounded-full border border-blue-500/30">
                                                <Users size={10} className="text-blue-400" />
                                                <span className="text-[10px] font-black text-white">{game.playing}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center text-gray-500 bg-[#2b2d31] rounded-xl border border-gray-700">
                                        No has publicado mapas aún.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-4">Mapas Jugados</h3>
                            <div className="grid grid-cols-1 gap-4">
                                {(user.playedHistory || []).slice(0, 4).map(gameId => {
                                    const game = publishedGames.find(g => g.id === gameId);
                                    if (!game) return null;
                                    return (
                                        <div key={gameId} onClick={() => openGameDetails(game)} className="bg-[#2b2d31] p-3 rounded-xl border border-gray-700 flex items-center gap-4 hover:bg-[#323439] cursor-pointer transition-all">
                                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-blue-500 shrink-0">
                                                <AvatarScene config={game.creatorAvatarConfig || {
                                                     bodyColors: { head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429' },
                                                     faceTextureUrl: null,
                                                     accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                                     hideFace: false
                                                }} interactive={false} globalAvatar={globalAvatarReplacement} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold truncate">{game.title}</div>
                                                <div className="text-xs text-blue-400 font-bold uppercase tracking-widest">Mapa de {game.creator}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {(user.playedHistory || []).length === 0 && (
                                    <div className="col-span-full py-8 text-center text-gray-500 bg-[#2b2d31] rounded-xl border border-gray-700">
                                        No has jugado mapas aún.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white mb-4">Ropa Usada</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {(user.clothingHistory || []).slice(0, 4).map(itemId => (
                                    <div key={itemId} className="bg-[#2b2d31] p-2 rounded-xl border border-gray-700 flex flex-col items-center">
                                        <div className="w-full aspect-square bg-[#111213] rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                                            <img src={`https://picsum.photos/seed/${itemId}/200/200`} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-xs text-gray-400">Item #{itemId.slice(-4)}</span>
                                    </div>
                                ))}
                                {(user.clothingHistory || []).length === 0 && (
                                    <div className="col-span-full py-8 text-center text-gray-500 bg-[#2b2d31] rounded-xl border border-gray-700">
                                        No has usado ropa aún.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Gallery Section */}
                    <div className="mt-8">
                        <h3 className="text-xl font-bold text-white mb-4">Galería de Videos</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(user.gallery || []).map((videoUrl, idx) => (
                                <div key={idx} className="bg-[#2b2d31] rounded-xl border border-gray-700 overflow-hidden aspect-video relative group">
                                    <video src={videoUrl} className="w-full h-full object-cover" controls />
                                    <button 
                                        onClick={async () => {
                                            if (confirm("¿Eliminar este video?")) {
                                                const updated = user.gallery?.filter(u => u !== videoUrl);
                                                setUser({ ...user, gallery: updated });
                                                await dataService.updateGallery(user.username, updated || []);
                                            }
                                        }}
                                        className="absolute top-2 right-2 bg-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {(user.gallery || []).length === 0 && (
                                <div className="col-span-full py-12 text-center text-gray-500 bg-[#2b2d31] rounded-xl border border-dashed border-gray-700">
                                    No has subido videos aún.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {currentPage === Page.SOCIAL && (
                <div className="p-8 max-w-5xl mx-auto">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <h2 className={`text-3xl font-bold cursor-pointer transition-all ${currentPage === Page.SOCIAL && !searchQuery ? 'text-white' : 'text-gray-500'}`} onClick={() => { setSearchQuery(''); setCurrentPage(Page.SOCIAL); }}>{t.friends}</h2>
                            <h2 className="text-3xl font-bold text-gray-800">/</h2>
                            <h2 className="text-3xl font-bold text-blue-500 cursor-pointer hover:text-blue-400" onClick={() => { /* Filter for community maps/users if needed */ }}>Comunidad</h2>
                        </div>
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input 
                                type="text"
                                placeholder={t.search_users}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#111213] border border-gray-700 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Social Sidebar / Tabs */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-[#1e1f21] p-1 rounded-xl flex gap-1 border border-white/5">
                                <button 
                                    onClick={() => setSocialTab('friends')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${socialTab === 'friends' ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-gray-400'}`}
                                >
                                    Seguidos
                                </button>
                                <button 
                                    onClick={() => setSocialTab('community')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${socialTab === 'community' ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-gray-400'}`}
                                >
                                    Comunidad
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <h3 className="text-gray-400 font-bold uppercase text-[10px] tracking-wider mb-2">Gente de la Comunidad</h3>
                                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                    {allUsers
                                        .filter(u => socialTab === 'community' ? true : user?.friends?.includes(u.username))
                                        .slice(0, 30).map(u => (
                                        <div key={u.uid} className="bg-[#111213] p-3 rounded-xl border border-gray-800 flex items-center gap-3 hover:border-gray-700 transition-all cursor-pointer">
                                            <div className="w-8 h-8 rounded-full bg-[#1e1f21] border border-gray-800 overflow-hidden relative">
                                                {u.avatarConfig && (
                                                    <div className="w-full h-full scale-150">
                                                        <AvatarScene config={u.avatarConfig} interactive={false} globalAvatar={globalAvatarReplacement} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-bold text-xs truncate leading-none mb-1">{u.displayName}</p>
                                                <p className="text-[9px] text-gray-500 truncate">@{u.username}</p>
                                            </div>
                                            {u.online && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Friends List - Main Content */}
                        <div className="lg:col-span-2 space-y-4">
                            <h3 className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-4">
                                {socialTab === 'friends' ? 'Mis Amigos' : 'Explorar Comunidad'}
                            </h3>
                            <h3 className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-4">Mis Amigos</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(user?.friends || []).length > 0 ? (
                                    user?.friends?.map(f => (
                                        <div key={f} className="bg-[#2b2d31] p-4 rounded-xl border border-gray-700 flex items-center gap-4 hover:border-gray-600 transition-all group">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                                {(f[0] || '').toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-white font-bold">{f}</div>
                                                {allUsers.find(u => u.username === f)?.online ? (
                                                  <div className="text-xs text-green-500 flex items-center gap-1">
                                                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                      {t.online}
                                                  </div>
                                                ) : (
                                                  <div className="text-xs text-gray-500 flex items-center gap-1">
                                                      <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                                                      Desconectado
                                                  </div>
                                                )}
                                            </div>
                                            <button className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-xs font-bold transition-colors">Chat</button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full text-center py-12 text-gray-500 bg-[#2b2d31] rounded-xl border border-dashed border-gray-700">
                                        <Users size={48} className="mx-auto mb-4 opacity-20" />
                                        <p>{t.no_friends}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recommended Users / Search Results */}
                        <div className="space-y-4">
                            <h3 className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-4">
                                {searchQuery ? t.search_results : t.recommended_users}
                            </h3>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {allUsers
                                    .filter(u => u.uid !== user?.uid && (searchQuery ? (u.username || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || (u.displayName || '').toLowerCase().includes((searchQuery || '').toLowerCase()) : true))
                                    .map(u => (
                                        <div key={u.uid} className="bg-[#1e1f21] p-3 rounded-xl border border-gray-800 flex items-center gap-3 hover:bg-[#2b2d31] transition-all">
                                            <div className="w-10 h-10 rounded-full bg-[#111213] border border-gray-700 overflow-hidden flex items-center justify-center relative">
                                                {u.avatarConfig ? (
                                                    <div className="w-full h-full scale-150">
                                                        <AvatarScene config={u.avatarConfig} interactive={false} globalAvatar={globalAvatarReplacement} />
                                                    </div>
                                                ) : (
                                                    <UserIcon size={20} className="text-gray-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold text-sm truncate flex items-center gap-2">
                                                  {u.displayName || u.username}
                                                  {u.online && <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">@{u.username}</div>
                                            </div>
                                            <button 
                                                onClick={async () => {
                                                    if (!user.friends?.includes(u.username)) {
                                                        const updatedFriends = [...(user.friends || []), u.username];
                                                        await updateDoc(doc(db, 'users', user.uid), { friends: updatedFriends });
                                                    }
                                                }}
                                                className={`p-2 rounded-lg transition-colors ${user.friends?.includes(u.username) ? 'bg-green-600/20 text-green-500 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                                            >
                                                {user.friends?.includes(u.username) ? <ThumbsUp size={16} /> : <Plus size={16} />}
                                            </button>
                                        </div>
                                    ))}
                            </div>

                            {/* Creator Code Entry */}
                            <div className="mt-8 bg-[#1e1f21] p-4 rounded-xl border border-[#393b3d]">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Canjear Código</h3>
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        placeholder="Código..."
                                        className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white uppercase"
                                        id="creator-code-input"
                                    />
                                    <button 
                                        onClick={async () => {
                                            const input = document.getElementById('creator-code-input') as HTMLInputElement;
                                            const code = input?.value?.toLowerCase();
                                            if (!code) return;
                                            
                                            if (user.usedCreatorCode) {
                                                alert("Ya has canjeado un código de creador.");
                                                return;
                                            }

                                            if (code === 'glidrovia') {
                                                const updatedTokens = (user.tokens || 0) + 200;
                                                const updatedDrovis = (user.drovis || 0) + 200;
                                                await updateDoc(doc(db, 'users', user.uid), { 
                                                    tokens: updatedTokens,
                                                    drovis: updatedDrovis,
                                                    usedCreatorCode: true 
                                                });
                                                alert("¡Felicidades! Has recibido 200 tokens.");
                                            } else {
                                                alert("Código inválido.");
                                            }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-xs font-bold"
                                    > Canjear </button>
                                </div>
                                {user.creatorCode && (
                                    <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/5">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Tu Código de Creador:</p>
                                        <p className="text-xl font-black text-white tracking-widest">{user.creatorCode}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {currentPage === Page.STORE && user && (
                <div className="p-8 max-w-6xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">TIENDA ANIEA</h2>
                            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Gasta tus Drovis en artículos exclusivos</p>
                        </div>
                        <div className="bg-blue-600/20 border border-blue-500/30 px-6 py-3 rounded-2xl flex flex-col items-end">
                            <span className="text-blue-400 font-black text-2xl leading-none">{user.drovis || 0}</span>
                            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Tus Drovis</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {/* User Published Items */}
                        {publishedItems.map(item => {
                            const isOwned = (user.clothingHistory || []).includes(item.id);
                            return (
                                <div key={item.id} className="bg-[#1e1f21] border border-white/10 rounded-2xl p-1 overflow-hidden hover:border-purple-500/50 transition-all group relative">
                                    <div className="h-40 bg-[#111213] rounded-xl relative overflow-hidden">
                                        <div className="w-full h-full scale-150 relative">
                                             <AvatarScene 
                                                config={{
                                                    bodyColors: { head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429' },
                                                    faceTextureUrl: null,
                                                    accessories: { 
                                                        hatModelUrl: item.type === 'hat' ? item.assetUrl : null,
                                                        shirtTextureUrl: item.type === 'shirt' ? item.assetUrl : null,
                                                        hatTransform: item.transform
                                                    },
                                                    hideFace: false,
                                                    selectedAnimation: 'Idle'
                                                }} 
                                                interactive={false} 
                                                globalAvatar={globalAvatarReplacement}
                                            />
                                        </div>
                                        <div className="absolute top-2 left-2 bg-purple-600 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest text-white shadow-lg">Comunidad</div>
                                    </div>
                                    <div className="p-3 flex flex-col gap-2">
                                        <div className="flex justify-between items-start min-w-0">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold text-xs truncate">{item.name}</div>
                                                <div className="text-[8px] text-gray-500 font-bold uppercase tracking-widest truncate">@{item.creator}</div>
                                            </div>
                                            <div className="text-purple-400 font-black text-xs ml-2">{item.price}</div>
                                        </div>
                                        <button 
                                            disabled={isOwned || (user.drovis || 0) < item.price}
                                            onClick={async () => {
                                                try {
                                                    const data = await dataService.purchaseItem(user.username, { id: item.id, price: item.price, currency: 'drovis' });
                                                    if (data) {
                                                        setUser({ ...user, drovis: data.drovis, clothingHistory: [...(user.clothingHistory || []), item.id] });
                                                        alert(`¡Has comprado ${item.name}!`);
                                                    }
                                                } catch (err: any) {
                                                    console.error("Purchase error:", err);
                                                    alert(err.message || "Error en la compra");
                                                }
                                            }}
                                            className={`w-full py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isOwned ? 'bg-green-600/20 text-green-500' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                                        >
                                            {isOwned ? 'Adquirido' : `Comprar`}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {[
                            { id: 'hat_crown', name: 'Corona de Oro', price: 500, type: 'hat', icon: <Star className="text-yellow-400" /> },
                            { id: 'hat_ninja', name: 'Máscara Ninja', price: 300, type: 'hat', icon: <Skull className="text-gray-400" /> },
                            { id: 'shirt_glidrovia', name: 'Camisa Glidrovia', price: 200, type: 'shirt', icon: <BoxIcon className="text-blue-400" /> },
                            { id: 'hat_viking', name: 'Casco Vikingo', price: 450, type: 'hat', icon: <TriangleIcon className="text-orange-400" /> },
                        ].map(item => {
                            const isOwned = (user.clothingHistory || []).includes(item.id);
                            return (
                                <div key={item.id} className="bg-[#2b2d31] border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-blue-500/50 transition-all group">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                        {React.cloneElement(item.icon as React.ReactElement<any>, { size: 40 })}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-white font-bold">{item.name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">{item.type}</div>
                                    </div>
                                    <button 
                                        disabled={isOwned || (user.drovis || 0) < item.price}
                                        onClick={async () => {
                                            try {
                                                const data = await dataService.purchaseItem(user.username, { id: item.id, price: item.price, currency: 'drovis' });
                                                if (data) {
                                                    setUser({ ...user, drovis: data.drovis, clothingHistory: [...(user.clothingHistory || []), item.id] });
                                                    alert(`¡Has comprado ${item.name}!`);
                                                }
                                            } catch (err: any) {
                                                console.error("Purchase error:", err);
                                                alert(err.message || "Error en la compra");
                                            }
                                        }}
                                        className={`w-full py-2 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${isOwned ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95 disabled:opacity-50'}`}
                                    >
                                        {isOwned ? 'Comprado' : `${item.price} Drovis`}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {currentPage === Page.SETTINGS && (
                <div className="p-8 max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                        <SettingsIcon size={32} /> {t.settings}
                    </h2>
                    
                    <div className="space-y-8 bg-[#2b2d31] p-8 rounded-2xl border border-gray-700 shadow-xl">
                        {/* Username Change Section */}
                        <div className="flex flex-col gap-3 pb-6 border-b border-white/5">
                            <label className="text-gray-400 font-bold uppercase text-xs flex items-center gap-2">
                                <CreditCard size={14} /> Cambiar Nombre de Usuario
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    placeholder="Nuevo nombre..."
                                    className="flex-1 bg-[#111213] border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                                    id="new-username-input"
                                />
                                <button 
                                    onClick={() => {
                                        const input = document.getElementById('new-username-input') as HTMLInputElement;
                                        if (input) handleChangeUsername(input.value);
                                    }}
                                    className={`px-6 py-2 rounded-xl font-bold transition-all ${user.usernameChangeCards > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                                >
                                    {user.usernameChangeCards > 0 ? 'Usar Tarjeta' : 'Sin Tarjetas'}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">
                                Tienes <span className="text-blue-400">{user.usernameChangeCards || 0}</span> tarjetas. Se puede cambiar 1 vez al mes.
                            </p>
                        </div>

                        {/* Glidrovia Admin Section */}
                        {user?.username?.toLowerCase() === 'glidrovia' && (
                            <div className="flex flex-col gap-3 pb-6 border-b border-white/5">
                                <label className="text-yellow-400 font-bold uppercase text-xs flex items-center gap-2">
                                    <Key size={14} /> Cuentas y Contraseñas (Solo Glidrovia)
                                </label>
                                <button 
                                    onClick={async () => {
                                        try {
                                            const res = await fetch(`/api/admin/users?admin_password=glidroviaoficial`);
                                            const data = await res.json();
                                            console.log("User Data:", data);
                                            alert("Datos de usuarios cargados en consola. Revisa el inspector.");
                                            // Optional: Show in a list
                                            const list = Object.values(data).map((u: any) => `${u.username}: ${u.password || 'N/A'}`).join('\n');
                                            alert(list);
                                        } catch (err) {
                                            console.error("Error fetching admin users:", err);
                                        }
                                    }}
                                    className="w-full bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-500/30 py-3 rounded-xl text-yellow-500 font-bold text-sm uppercase mb-4"
                                >
                                    Ver todas las contraseñas
                                </button>

                                <div className="space-y-3">
                                    <label className="text-blue-400 font-bold uppercase text-[10px] flex items-center gap-2">
                                        <Upload size={12} /> Importar Avatar Global (GLB/FBX)
                                    </label>
                                    <input 
                                        type="file" 
                                        accept=".glb,.gltf,.fbx"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            
                                            try {
                                                const url = await dataService.uploadFile(file);
                                                if (url) {
                                                    const isFbx = file.name.toLowerCase().endsWith('.fbx');
                                                    const config = { globalAvatarReplacement: { url, isFbx } };
                                                    
                                                    // Update both if possible (for migration) or just use dataService
                                                    await dataService.updateGlobalSettings(config);
                                                    
                                                    // Fallback for Firebase if still used
                                                    try {
                                                        await setDoc(doc(db, 'global_settings', 'main'), config, { merge: true });
                                                    } catch {}

                                                    alert("Avatar global actualizado para todos!");
                                                }
                                            } catch (err) {
                                                console.error("Error uploading global avatar:", err);
                                                alert("Error al subir el avatar global");
                                            }
                                        }}
                                        className="w-full bg-[#111213] border border-gray-700 rounded-xl px-4 py-2 text-xs text-gray-400"
                                    />
                                    {globalAvatarReplacement && (
                                        <button 
                                            onClick={async () => {
                                                const config = { globalAvatarReplacement: null };
                                                await dataService.updateGlobalSettings(config);
                                                try {
                                                    await setDoc(doc(db, 'global_settings', 'main'), config, { merge: true });
                                                } catch {}
                                                alert("Avatar global eliminado");
                                            }}
                                            className="text-red-500 text-[10px] font-bold uppercase hover:underline"
                                        >
                                            Eliminar Avatar Global
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <label className="text-gray-400 font-bold uppercase text-xs flex items-center gap-2">
                                <Globe size={14} /> {t.region}
                            </label>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {[
                                    { id: 'Global', label: 'Global 🌎', emoji: '🌎' },
                                    { id: 'AR', label: 'Argentina 🇦🇷', emoji: '🇦🇷' },
                                    { id: 'MX', label: 'México 🇲🇽', emoji: '🇲🇽' },
                                    { id: 'ES', label: 'España 🇪🇸', emoji: '🇪🇸' },
                                    { id: 'US', label: 'United States 🇺🇸', emoji: '🇺🇸' },
                                    { id: 'Supabase', label: 'Mi Supabase 🚀', emoji: '🚀' },
                                    ...publicRegions.map(pr => ({ id: pr.id, label: pr.label, emoji: pr.emoji, config: pr }))
                                ].map(reg => (
                                    <button 
                                        key={reg.id}
                                        onClick={() => {
                                            if ((reg as any).config) {
                                                const config = (reg as any).config;
                                                localStorage.setItem('VITE_SUPABASE_URL', config.url);
                                                localStorage.setItem('VITE_SUPABASE_ANON_KEY', config.key);
                                                window.location.reload(); // Hard reload to apply new supabase client
                                                return;
                                            }

                                            const newSettings = { ...settings, selectedRegion: reg.id };
                                            handleUpdateSettings(newSettings);
                                            // Real-time: if switching to/from Supabase, we might want to alert
                                            if (reg.id === 'Supabase' && !isSupabaseEnabled()) {
                                                alert("Configura Supabase abajo para usar esta región.");
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-3 py-3 rounded-xl font-bold transition-all text-[10px] ${settings.selectedRegion === reg.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-[#111213] text-gray-400 hover:bg-[#1e1f21]'}`}
                                    >
                                        <span className="text-xs">{reg.emoji}</span>
                                        <span className="truncate">{reg.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-500 italic mt-1">
                                {settings.selectedRegion === 'Supabase' 
                                    ? 'Conectado a tu base de datos privada en tiempo real.' 
                                    : 'Usando servidores globales compartidos (Glidrovia Network).'}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <label className="text-blue-400 font-bold uppercase text-xs flex items-center gap-2">
                                <Database size={14} /> Conexión Supabase (BYOB)
                            </label>
                            <div className="bg-[#111213] p-4 rounded-xl border border-gray-700 space-y-3">
                                <p className="text-[10px] text-gray-500 uppercase font-bold">Configura tu propio servidor global</p>
                                
                                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-[10px] text-amber-200 leading-relaxed">
                                    <p className="font-bold mb-1">⚠️ IMPORTANTE:</p>
                                    No uses "Personal Access Tokens". Necesitas las <strong>Project API Keys</strong>.
                                    <br/>
                                    <a href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noreferrer" className="underline hover:text-white font-bold">
                                        Ir a Project Settings {'>'} API
                                    </a>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] text-gray-500 uppercase font-bold">Project URL</label>
                                    <input 
                                        type="text" 
                                        placeholder="https://xyz.supabase.co"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                                        defaultValue={localStorage.getItem('VITE_SUPABASE_URL') || import.meta.env.VITE_SUPABASE_URL}
                                        onChange={(e) => {
                                            localStorage.setItem('VITE_SUPABASE_URL', e.target.value);
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] text-gray-500 uppercase font-bold">Anon Public Key</label>
                                    <input 
                                        type="password" 
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                                        defaultValue={localStorage.getItem('VITE_SUPABASE_ANON_KEY') || import.meta.env.VITE_SUPABASE_ANON_KEY}
                                        onChange={(e) => {
                                            localStorage.setItem('VITE_SUPABASE_ANON_KEY', e.target.value);
                                        }}
                                    />
                                </div>

                                <button 
                                    onClick={() => window.location.reload()}
                                    className="w-full bg-blue-600 hover:bg-blue-700 border border-blue-500/30 py-3 rounded-xl text-[10px] font-bold text-white uppercase transition-all shadow-lg shadow-blue-900/20"
                                >
                                    Aplicar y Reiniciar
                                </button>

                                <div className="flex flex-col gap-1 pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${supabaseStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                                            {supabaseStatus.connected ? 'Conectado a' : 'Error de Conexión'}
                                        </span>
                                        {supabaseStatus.connected && supabaseStatus.url && (
                                            <span className="text-[9px] text-blue-400 font-mono truncate max-w-[150px]" title={supabaseStatus.url}>
                                                {supabaseStatus.url.replace('https://', '').split('.')[0]}
                                            </span>
                                        )}
                                    </div>
                                    {supabaseStatus.error && (
                                        <p className="text-[9px] text-red-400 italic bg-red-500/5 p-2 rounded border border-red-500/10">
                                            {supabaseStatus.error}
                                        </p>
                                    )}
                                    {!isSupabaseEnabled() && !supabaseStatus.error && (
                                        <p className="text-[9px] text-gray-600 italic">
                                            Sin Supabase, los datos se guardarán solo en esta sesión.
                                        </p>
                                    )}
                                </div>

                                {isSupabaseEnabled() && (
                                    <div className="pt-4 border-t border-white/5 space-y-3">
                                        <div className="bg-blue-600/10 border border-blue-500/20 p-3 rounded-lg mb-4">
                                            <p className="text-[10px] text-blue-300 font-bold uppercase mb-2">Setup Multijugador Realtime</p>
                                            <p className="text-[9px] text-gray-400 mb-3 leading-relaxed">
                                                Copia y pega este SQL en tu Dashboard de Supabase (SQL Editor) para habilitar el tiempo real:
                                            </p>
                                            <div className="relative group">
                                                <pre className="bg-black/60 p-3 rounded-lg text-[8px] font-mono text-blue-200 overflow-x-auto whitespace-pre border border-white/5 max-h-40">
{`-- 1. Habilitar Tiempo Real (Réplicas)
alter publication supabase_realtime add table users;
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table global_settings;

-- 2. Asegurar Tablas
create table if not exists users (
  uid text primary key,
  username text unique,
  display_name text,
  avatar_url text,
  settings jsonb,
  credits int default 1000,
  updated_at timestamp with time zone default now()
);

create table if not exists global_settings (
  id text primary key,
  data jsonb,
  updated_at timestamp with time zone default now()
);`}
                                                </pre>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-blue-400 uppercase font-bold">Publicar Mi Región</p>
                                        <div className="space-y-2">
                                            <label className="text-[9px] text-gray-500 uppercase font-bold">Nombre del País / Servidor</label>
                                            <input 
                                                type="text" 
                                                placeholder="Ej: Perú 🇵🇪"
                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                                                value={customRegionName}
                                                onChange={(e) => setCustomRegionName(e.target.value)}
                                            />
                                        </div>
                                        <button 
                                            disabled={!customRegionName || publishingRegion}
                                            onClick={async () => {
                                                setPublishingRegion(true);
                                                try {
                                                    await dataService.publishRegion(
                                                        customRegionName,
                                                        localStorage.getItem('VITE_SUPABASE_URL') || '',
                                                        localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '',
                                                        user?.username || 'Anon'
                                                    );
                                                    alert("¡Región publicada! Otros podrán conectarse a tu Supabase.");
                                                    const updatedRegions = await dataService.getPublicRegions();
                                                    setPublicRegions(updatedRegions);
                                                } catch (err) {
                                                    console.error("Error publishing region:", err);
                                                    alert("Error al publicar región.");
                                                } finally {
                                                    setPublishingRegion(false);
                                                }
                                            }}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded-xl text-[10px] font-bold text-white uppercase transition-all flex items-center justify-center gap-2"
                                        >
                                            {publishingRegion ? 'Publicando...' : 'Publicar Región'}
                                        </button>
                                    </div>
                                )}

                                <div className="bg-blue-500/5 border border-blue-500/10 p-2 rounded text-[9px] text-blue-400/60 italic">
                                    ¿Tablas no encontradas? Asegúrate de haber ejecutado el SQL de inicialización en el editor de Supabase.
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <label className="text-gray-400 font-bold uppercase text-xs flex items-center gap-2">
                                <Globe size={14} /> {t.language}
                            </label>
                            <div className="flex gap-2">
                                {['es', 'en'].map(lang => (
                                    <button 
                                        key={lang}
                                        onClick={() => handleUpdateSettings({ ...settings, language: lang })}
                                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${settings.language === lang ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-[#111213] text-gray-400 hover:bg-[#1e1f21]'}`}
                                    >
                                        {lang === 'es' ? 'Español' : 'English'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <label className="text-gray-400 font-bold uppercase text-xs flex items-center gap-2">
                                <Palette size={14} /> {t.bg_color}
                            </label>
                            <div className="flex flex-wrap gap-3">
                                {['#1a1b1e', '#232527', '#0f172a', '#1e1b4b', '#450a0a', '#064e3b'].map(color => (
                                    <button 
                                        key={color}
                                        onClick={() => handleUpdateSettings({ ...settings, backgroundColor: color })}
                                        className={`w-12 h-12 rounded-full border-2 transition-transform hover:scale-110 ${settings.backgroundColor === color ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={() => setCurrentPage(Page.HOME)}
                            className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                        >
                            {t.save}
                        </button>
                    </div>
                </div>
            )}

            {currentPage === Page.AVATAR && (
                <div className="p-4 md:p-8 max-w-6xl mx-auto h-[calc(100vh-60px)] flex flex-col">
                     <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
                        <div className="flex-1 bg-[#111213] rounded-xl border border-[#393b3d] relative overflow-hidden shadow-2xl">
                          <ErrorBoundary>
                            <AvatarScene config={avatarConfig} globalAvatar={globalAvatarReplacement} selectedAnimation={activeEmote || avatarConfig.selectedAnimation} />
                          </ErrorBoundary>
                        </div>
                        <div className="w-full md:w-[400px] bg-[#232527] rounded-xl border border-[#393b3d] overflow-hidden flex flex-col shadow-xl">
                          <AvatarEditor currentConfig={globalAvatar || avatarConfig} onUpdateConfig={handleUpdateAvatar} socket={socket} user={user} globalAvatarReplacement={globalAvatarReplacement} />
                        </div>
                     </div>
                </div>
            )}
            
            {currentPage === Page.DEVELOPER && user && (
                <DeveloperMenu 
                  user={user} 
                  setUser={setUser} 
                  avatarConfig={avatarConfig} 
                  onUpdateAvatar={handleUpdateAvatar} 
                />
            )}

            {currentPage === Page.GAMES && (
                 <div className="p-8">
                     <h2 className="text-2xl font-bold text-white mb-6">Todas las Experiencias</h2>
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                         {publishedGames.map(game => <div key={game.id} onClick={() => openGameDetails(game)}><GameCard game={game} /></div>)}
                     </div>
                 </div>
            )}
          </main>
        </div>
      </div>
    </HashRouter>
  );
}

// --- SUB-COMPONENT: GAME DETAILS & PLAYER ---
const GamePlayerView = ({ game, avatarConfig, onBack, user, setUser, t, settings, allUsers, globalAvatarReplacement }: { game: Game, avatarConfig: AvatarConfig, onBack: () => void, user: User, setUser: React.Dispatch<React.SetStateAction<User | null>>, t: any, settings: any, allUsers: User[], globalAvatarReplacement: any }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [xpGained, setXpGained] = useState(0);
    const [activeServer, setActiveServer] = useState<Server | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [servers, setServers] = useState<Server[]>([
        { id: '1', name: 'Google Cloud - Global Alpha', players: 12, maxPlayers: 20, ping: 45, status: 'online', region: 'Google Cloud' },
        { id: '2', name: 'Oracle Cloud - Voxel Hub', players: 18, maxPlayers: 20, ping: 52, status: 'online', region: 'Oracle Cloud' },
        { id: '3', name: 'Google Cloud - Friends Only', players: 3, maxPlayers: 10, ping: 38, status: 'online', region: 'Google Cloud' },
    ]);

    useEffect(() => {
        const s = io();
        setSocket(s);

        // Keep servers "alive"
        const interval = setInterval(() => {
            setServers(prev => prev.map(srv => ({
                ...srv,
                players: Math.max(1, Math.min(srv.maxPlayers, srv.players + (Math.random() > 0.5 ? 1 : -1))),
                ping: Math.max(20, Math.min(100, srv.ping + Math.floor(Math.random() * 5) - 2))
            })));
        }, 5000);

        return () => { 
            s.disconnect(); 
            clearInterval(interval);
        };
    }, []);

    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const [showReport, setShowReport] = useState(false);

    const handleJoinServer = async (server: Server) => {
        // Record play history
        if (socket && user) {
            socket.emit("play-game", { gameId: game.id, username: user.username });
        }

        // Add XP for playing
        if (user) {
            try {
                const newXp = await dataService.addXp(user.username, 25);
                setUser(prev => prev ? { ...prev, xp: newXp } : null);
            } catch (err) {
                console.error("Failed to add XP:", err);
            }
        }

        if (server.players >= server.maxPlayers) {
            // Fake queue system
            setQueuePosition(Math.floor(Math.random() * 10) + 1);
            let currentPos = Math.floor(Math.random() * 10) + 1;
            const interval = setInterval(() => {
                currentPos -= 1;
                setQueuePosition(currentPos);
                if (currentPos <= 0) {
                    clearInterval(interval);
                    setQueuePosition(null);
                    setActiveServer(server);
                    setIsPlaying(true);
                }
            }, 2000);
        } else {
            setActiveServer(server);
            setIsPlaying(true);
        }
    };

    const handleCreateServer = () => {
        const newServer: Server = {
            id: Date.now().toString(),
            name: `${user.username}'s World`,
            players: 1,
            maxPlayers: 10,
            ping: 20,
            status: 'online',
            region: 'Google Cloud'
        };
        setServers([...servers, newServer]);
        handleJoinServer(newServer);
    };

    const handleQuickPlay = () => {
        handleJoinServer(servers[0]);
    }

    const handleDeleteGame = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("¿Estás seguro de que quieres eliminar este mapa?")) {
            try {
                await dataService.deleteGame(game.id);
                onBack();
            } catch (err) {
                console.error("Error deleting game:", err);
            }
        }
    };

    if (queuePosition !== null) {
        return (
            <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white font-sans">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8" />
                <h2 className="text-3xl font-bold mb-4">Servidor Lleno</h2>
                <p className="text-xl text-gray-400 mb-2">Estás en la cola para entrar.</p>
                <p className="text-2xl font-bold text-blue-400">Posición: {queuePosition}</p>
                <button 
                    onClick={() => setQueuePosition(null)}
                    className="mt-8 px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold transition-colors"
                >
                    Cancelar
                </button>
            </div>
        );
    }

    if (isPlaying) {
        return (
            <div className="h-screen w-screen bg-black relative">
                {socket && (
                  <Chat 
                    socket={socket} 
                    roomId={activeServer?.id || 'global-lobby'} 
                    username={user.username} 
                    supabaseChannel={(window as any).supabaseChannel}
                  />
                )}
                <StudioPage 
                    onPublish={() => {}} 
                    avatarConfig={avatarConfig} 
                    initialMapData={game.mapData} 
                    initialGame={game}
                    isPlayMode={true} 
                    activeServer={activeServer}
                    playerName={user.displayName}
                    username={user.username}
                    onExit={() => setIsPlaying(false)}
                    settings={settings}
                />
                {xpGained > 0 && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/80 text-white px-4 py-2 rounded-full font-bold shadow-lg animate-pulse z-[100]">
                        +{xpGained} XP
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="h-screen w-screen text-white overflow-y-auto" style={{ backgroundColor: settings.backgroundColor }}>
            {/* Banner Blur Background */}
            <div className="absolute top-0 left-0 w-full h-[60vh] overflow-hidden opacity-30 pointer-events-none">
                 <img src={game.thumbnail || undefined} className="w-full h-full object-cover blur-xl" />
                 <div className="absolute inset-0 bg-gradient-to-t from-[#1a1b1e] via-transparent to-transparent"></div>
            </div>

            <div className="relative max-w-6xl mx-auto pt-20 px-6 z-10 flex flex-col md:flex-row gap-8">
                 {/* Game Thumbnail & Creator Avatar 3D */}
                 <div className="w-full md:w-[640px] flex flex-col gap-4">
                     <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-700">
                         <img src={game.thumbnail || undefined} className="w-full h-full object-cover" />
                     </div>
                     
                     {/* Creator Info as Circle Avatar */}
                     <div className="bg-[#2b2d31] p-4 rounded-xl border border-gray-700 flex items-center justify-between shadow-lg">
                         <div className="flex items-center gap-3">
                             <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-blue-500 shadow-inner bg-[#111213]">
                                 <AvatarScene 
                                     config={game.creatorAvatarConfig || allUsers.find(u => u.username === game.creator || u.displayName === game.creator)?.avatarConfig || {
                                         bodyColors: { head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429' },
                                         faceTextureUrl: null,
                                         accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                         hideFace: false
                                     }} 
                                     interactive={false} 
                                     globalAvatar={globalAvatarReplacement}
                                 />
                             </div>
                             <div>
                                 <div className="flex items-center gap-1.5">
                                     <h3 className="text-white font-black italic uppercase tracking-tighter leading-none">{game.creator}</h3>
                                     {(game.creator === 'glidrovia oficial' || game.creator === user.displayName + ' (Tú)') && (
                                         <div className="bg-blue-500/10 p-0.5 rounded-full animate-[shimmer_2s_infinite]">
                                             <BadgeCheck size={10} className="text-blue-400" />
                                         </div>
                                     )}
                                 </div>
                                 <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Creador</p>
                             </div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-1 bg-black/20 rounded-full border border-white/5">
                             <Users size={12} className="text-blue-400" />
                             <span className="text-[10px] font-black text-white">OFICIAL</span>
                         </div>
                     </div>
                 </div>

                 {/* Info & Play */}
                 <div className="flex-1 flex flex-col gap-4">
                     <div>
                         <h1 className="text-4xl font-extrabold mb-2">{game.title}</h1>
                         <div className="flex items-center gap-2 text-gray-400">
                             <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-gray-800 flex items-center justify-center shrink-0 shadow-lg inline-flex align-middle mr-2">
                                 {game.creatorAvatar ? (
                                     <img src={game.creatorAvatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                 ) : (
                                     <UserIcon size={16} />
                                 )}
                             </div>
                             <span>By <span className="text-white font-black hover:underline cursor-pointer tracking-tight">{game.creator}</span></span>
                         </div>
                     </div>

                     <div className="flex items-center gap-6 py-4 border-y border-gray-700">
                         <div className="flex flex-col">
                             <span className="text-lg font-bold text-white">{game.playing.toLocaleString()}</span>
                             <span className="text-xs text-gray-400">{t.active_players}</span>
                         </div>
                         <div className="flex flex-col">
                             <span className="text-lg font-bold text-white">{game.likesCount || 0}</span>
                             <span className="text-xs text-gray-400">{t.likes}</span>
                         </div>
                         <div className="flex flex-col">
                             <div className="flex items-center gap-1">
                                 <span className="text-lg font-bold text-white">{(game.stars || 0).toFixed(1)}</span>
                                 <span className="text-yellow-500">★</span>
                             </div>
                             <span className="text-xs text-gray-400">{game.starCount || 0} Votos</span>
                         </div>
                     </div>

                     {/* User Rank Display */}
                     <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-2 mb-4">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                 <div 
                                     className="w-2 h-2 rounded-full animate-pulse"
                                     style={{ backgroundColor: getRankInfo(user?.xp || 0).color }}
                                 />
                                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tu Rango:</span>
                                 <span 
                                     className="text-[10px] font-black uppercase tracking-widest"
                                     style={{ color: getRankInfo(user?.xp || 0).color }}
                                 >
                                     {getRankInfo(user?.xp || 0).name}
                                 </span>
                             </div>
                             <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                 XP Actual: {user?.xp || 0}
                             </span>
                         </div>
                         <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                             <div 
                                 className="h-full transition-all duration-1000 ease-in-out"
                                 style={{ 
                                     width: `${getRankInfo(user?.xp || 0).progress}%`,
                                     backgroundColor: getRankInfo(user?.xp || 0).color,
                                     boxShadow: `0 0 10px ${getRankInfo(user?.xp || 0).color}40`
                                 }}
                             />
                         </div>
                     </div>
 
                     {/* Interaction Buttons */}
                     <div className="flex gap-4">
                         <button 
                           onClick={() => socket?.emit("like-game", { gameId: game.id })}
                           className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg flex items-center justify-center gap-2 border border-white/10 transition-colors"
                         >
                           <ThumbsUp size={18} /> Like
                         </button>
                         <button 
                           onClick={() => setShowReport(true)}
                           className="px-3 bg-red-600/10 hover:bg-red-600/20 py-2 rounded-lg flex items-center justify-center gap-2 border border-red-500/20 transition-colors text-red-400 group"
                           title="Reportar Abuso / DMCA"
                         >
                           <Flag size={18} className="group-hover:scale-110 transition-transform" />
                         </button>
                         <div className="flex-1 flex items-center justify-center gap-1 bg-white/5 rounded-lg border border-white/10 px-2">
                           {[1, 2, 3, 4, 5].map(star => (
                               <button 
                                   key={star}
                                   onClick={() => socket?.emit("rate-game", { gameId: game.id, stars: star })}
                                   className="text-gray-500 hover:text-yellow-500 transition-colors text-xl"
                               >
                                   ★
                               </button>
                           ))}
                         </div>
                     </div>

                     {/* BIG PLAY BUTTON */}
                     <div className="flex gap-4">
                         <button 
                            onClick={handleQuickPlay}
                            className="bg-blue-600 hover:bg-blue-500 w-full md:w-48 py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transform transition-transform active:scale-95"
                         >
                             <div className="bg-white/20 p-1 rounded">
                                 <Play fill="white" size={32} />
                             </div>
                             <span className="text-2xl font-bold">{t.play}</span>
                         </button>
                         {(user.username === game.creator || user.displayName === game.creator) && (
                             <button 
                                onClick={handleDeleteGame}
                                className="bg-red-600/20 hover:bg-red-600/40 text-red-500 px-6 py-4 rounded-xl font-bold border border-red-500/30 transition-all"
                             >
                                Eliminar Mapa
                             </button>
                         )}
                     </div>
                 </div>
            </div>

            {/* SERVER LIST SECTION */}
            <div className="relative max-w-6xl mx-auto mt-12 px-6 pb-20 z-10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <ServerIcon className="text-gray-400" /> {t.settings}
                    </h2>
                    <button 
                        onClick={handleCreateServer}
                        className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                    >
                        <Plus size={16} /> {t.create_server}
                    </button>
                </div>
                
                <div className="bg-[#2b2d31] rounded-lg border border-gray-700 overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 p-4 bg-[#111213] text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <div className="col-span-5">{t.server_name}</div>
                        <div className="col-span-2 text-center">{t.players}</div>
                        <div className="col-span-2 text-center">{t.ping}</div>
                        <div className="col-span-3 text-right">{t.action}</div>
                    </div>
                    {servers.map((server) => (
                        <div key={server.id} className="grid grid-cols-12 gap-4 p-4 border-t border-gray-700 items-center hover:bg-white/5 transition-colors">
                            <div className="col-span-5 font-bold text-white flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${server.status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                                <div className="flex flex-col">
                                    <span>{server.name}</span>
                                    <span className="text-[10px] text-blue-400 font-mono uppercase">{server.region}</span>
                                </div>
                            </div>
                            <div className="col-span-2 text-center text-gray-300">
                                {server.players} / {server.maxPlayers}
                            </div>
                            <div className="col-span-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${server.ping < 50 ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                                    {server.ping} ms
                                </span>
                            </div>
                            <div className="col-span-3 text-right">
                                <button 
                                    onClick={() => handleJoinServer(server)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                                >
                                    {t.join}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <button onClick={onBack} className="fixed top-4 left-4 bg-black/50 px-4 py-2 rounded-full text-sm hover:bg-black/70 z-50 backdrop-blur-md border border-white/10">
                {t.back_home}
            </button>
            {showReport && (
                <ReportModal 
                    targetId={game.id}
                    targetType="game"
                    targetName={game.title}
                    reporterUid={user.uid}
                    onClose={() => setShowReport(false)}
                />
            )}
        </div>
    );
};

export default App;
