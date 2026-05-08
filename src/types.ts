
export interface Emote {
  id: string;
  name: string;
  animationUrl: string | null;
  soundUrl?: string | null;
}

export interface User {
  uid: string;
  username: string;
  displayName: string;
  robux: number;
  tokens: number; // For game transactions
  creatorCode?: string; // Random code for the user
  usedCreatorCode?: boolean; // If they have already used a code to get 200 tokens
  drovis: number; // New currency
  avatarUrl?: string; 
  friends?: string[]; // List of UIDs
  avatarConfig?: AvatarConfig;
  settings?: AppSettings;
  xp?: number;
  level?: number;
  gallery?: string[]; // New: List of video URLs for profile
  playedHistory?: string[]; // New: List of game IDs played
  clothingHistory?: string[]; // New: List of item IDs used
  rank?: string; // New: Platinum, Standard, etc.
  lastUsernameChange?: string; // New: ISO date
  usernameChangeCards?: number; // New: Count
  isUpdated?: boolean; // New: Track if the user has applied the simulation update
  lastSeen?: string; // New: For online status
  online?: boolean; // New: Active status
  acceptedToS?: boolean; // New: Compliance track
  isAdmin?: boolean; // Only for official accounts
}

export interface Report {
  id: string;
  reporterUid: string;
  targetId: string; // ID of game, user, or item
  targetType: 'game' | 'user' | 'item' | 'comment';
  reason: 'copyright' | 'harassment' | 'offensive' | 'scam' | 'other';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: string;
}

export interface VisualBlock {
  id: string;
  type: 'Event' | 'Action' | 'Variable' | 'Control';
  name: string; // e.g. "OnStart", "ChangeScene", "PlaySound", "OnAvatarMove"
  params: {
    [key: string]: any;
  };
}

export interface MapObject {
  id: string;
  name: string;
  type: 'Part' | 'Sphere' | 'Wedge' | 'Cylinder' | 'Model' | 'Sound' | 'Video' | 'Canvas' | 'Text' | 'Button' | 'Terrain' | 'Camera' | 'Image';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material: 'Plastic' | 'Neon' | 'Grass' | 'Wood' | 'Brick' | 'Fabric';
  transparency: number;
  anchored: boolean;
  canCollide: boolean;
  meshCollision?: boolean; 
  assetUrl?: string; 
  volume?: number;
  loop?: boolean;
  playing?: boolean;
  autoPlay?: boolean;
  trigger?: 'None' | 'OnDeath' | 'OnJump' | 'OnFall' | 'OnSpawn'; 
  isAvatarReplacement?: boolean; 
  selectedAnimation?: string; 
  availableAnimations?: string[]; 
  health?: number; 
  maxHealth?: number;
  isWeapon?: boolean; 
  weaponType?: string;
  isBot?: boolean; 
  team?: 'Red' | 'Blue'; 
  isShooter?: boolean; 
  effect?: 'none' | 'snow' | 'rain' | 'fire' | 'lights' | 'rainbow'; 
  textureUrl?: string; 
  terrainData?: number[][]; 
  isTerrain?: boolean; 
  proximityTrigger?: boolean; 
  touchTrigger?: boolean; 
  triggerDistance?: number; 
  visualScripts?: VisualBlock[];
  uiProperties?: {
    text?: string;
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    opacity?: number;
    imageWidth?: number;
    imageHeight?: number;
    fadeOut?: boolean;
    fadeDuration?: number; // in seconds
    sceneTarget?: string; // For buttons to switch scenes
  };
}

export interface Scene {
  id: string;
  name: string;
  objects: MapObject[];
  skybox: string;
}

export interface GameVersion {
  id: string;
  timestamp: string;
  mapData: MapObject[];
  skybox: string;
  scenes?: Scene[];
}

export interface Game {
  id: string;
  title: string;
  creator: string;
  creatorUid: string;
  thumbnail: string;
  likes: string; 
  likesCount?: number; 
  stars?: number; 
  starCount?: number; 
  playing: number;
  creatorAvatar?: string; // New: Creator's avatar thumbnail
  creatorAvatarConfig?: AvatarConfig; // New: Full config for 3D preview
  mapData?: MapObject[]; 
  skybox?: string; 
  versions?: GameVersion[]; 
  scenes?: Scene[];
}

export interface Video {
  id: string;
  url: string;
  creatorUid: string;
  creatorName: string;
  likes: string[]; // List of UIDs
  createdAt: string;
}

export interface AnimationKeyframe {
  time: number;
  rotations: {
    [boneName: string]: [number, number, number]; // Euler angles [x, y, z]
  };
  positions?: {
    [boneName: string]: [number, number, number];
  };
}

export interface CustomAnimation {
  id: string;
  name: string;
  keyframes: AnimationKeyframe[];
  duration: number; // in seconds
  loop: boolean;
}

export interface AvatarConfig {
  bodyColors: {
    head: string;
    torso: string;
    leftArm: string;
    rightArm: string;
    leftLeg: string;
    rightLeg: string;
  };
  faceTextureUrl: string | null; // URL string (blob or http)
  faceVideoUrl?: string | null; // New: Video face
  accessories: {
    hatModelUrl: string | null; // URL string for .glb/.gltf
    shirtTextureUrl: string | null;
    hatTransform?: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    };
  };
  hideFace: boolean;
  invisible?: boolean; // New: Make avatar invisible
  selectedAnimation?: string; // New: Selected animation from menu
  walkSoundUrl?: string | null; // New: Sound when moving
  walkAnimationUrl?: string | null; // New: FBX/GLB for walk animation
  customModelUrl?: string | null; // New: Import a full avatar replacement
  customAnimations?: {
    idleUrl?: string | null;
    walkUrl?: string | null;
    jumpUrl?: string | null;
    emote1Url?: string | null;
    data?: {
      [key: string]: CustomAnimation; // key is 'Idle', 'Walk', 'Jump' etc.
    };
    emotes?: Emote[]; // New: List of emotes
    emoteButtonText?: string; 
  };
}

export interface Message {
  user: string;
  text: string;
}

export interface StoreItem {
  id: string;
  name: string;
  type: 'face' | 'hat' | 'shirt';
  price: number; // 0 for free
  thumbnail: string; // URL or placeholder
  assetUrl: string; // The actual content
  creator: string;
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
}

export interface Server {
  id: string;
  name: string; // e.g., "Server de Juan"
  ping: number;
  players: number;
  maxPlayers: number;
  friendsInServer?: string[]; // Avatars of friends
  status: 'online' | 'offline' | 'full';
  region: string; // e.g., "Google Cloud", "Oracle Cloud"
}

export interface RemotePlayer {
  id: string;
  username: string;
  country?: string; // New: Multi-country support
  position: [number, number, number];
  rotation: [number, number, number];
  config: AvatarConfig;
  isMoving: boolean;
  isJumping: boolean;
  isTalking?: boolean; // New: Voice indicator
  currentAnimation?: string; // New: Sync animations
  selectedAnimation?: string; // New: Selected animation from menu
  targetPosition?: [number, number, number]; // For interpolation/simulation
}

export enum Page {
  HOME = 'HOME',
  PROFILE = 'PROFILE',
  GAMES = 'GAMES',
  AVATAR = 'AVATAR',
  STORE = 'STORE',
  STUDIO = 'STUDIO',
  PLAY = 'PLAY',
  SOCIAL = 'SOCIAL',
  SETTINGS = 'SETTINGS',
  ANIMATION_EDITOR = 'ANIMATION_EDITOR',
  DEVELOPER = 'DEVELOPER'
}

export interface AppSettings {
  language: 'es' | 'en';
  backgroundColor: string;
  selectedRegion?: string;
}

export const RANKS = [
  { name: 'Bronce', minXp: 0, color: '#CD7F32' },
  { name: 'Plata', minXp: 500, color: '#C0C0C0' },
  { name: 'Oro', minXp: 1500, color: '#FFD700' },
  { name: 'Platino', minXp: 3500, color: '#E5E4E2' },
  { name: 'Diamante', minXp: 7000, color: '#00F2FF', iconUrl: 'https://static.wikia.nocookie.net/roblox/images/a/a2/Diamond_Rank.png' },
  { name: 'Maestro', minXp: 12000, color: '#FF00FF' },
  { name: 'Leyenda', minXp: 20000, color: '#FF4500' }
];

export const getRankInfo = (xp: number = 0) => {
  const currentRankIndex = RANKS.reduce((acc, rank, idx) => {
    if (xp >= rank.minXp) return idx;
    return acc;
  }, 0);
  
  const currentRank = RANKS[currentRankIndex];
  const nextRank = RANKS[currentRankIndex + 1];
  
  let progress = 100;
  if (nextRank) {
    const range = nextRank.minXp - currentRank.minXp;
    const gained = xp - currentRank.minXp;
    progress = Math.min(100, Math.max(0, (gained / range) * 100));
  }
  
  return {
    ...currentRank,
    progress,
    nextRank
  };
};
