import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky, Stars, useGLTF, Environment, ContactShadows, MeshReflectorMaterial, Html, Text as Text3D } from '@react-three/drei';
import { MousePointer2, Move, Maximize, RotateCw, Box as BoxIcon, Circle as CircleIcon, Triangle as TriangleIcon, Cylinder as CylinderIcon, Save, Play, Square, Home, ArrowLeft, Upload, FileBox, Gamepad, Volume2, Video as VideoIcon, Mic, MicOff, Sun, Moon, Cloud, CloudSun, Star, Skull, Search, UserPlus, Layout, Send, Server as ServerIcon, Mountain, Palette, Globe, Puzzle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { PositionalAudio, VideoTexture } from '@react-three/drei';
import { AnimationMixer, LoopRepeat } from 'three';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MapObject, AvatarConfig, RemotePlayer, Server, Game, AppSettings, VisualBlock, Scene } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ImportedModel } from '../components/ModelLoaders';
import { VoxelCharacter } from '../components/AvatarScene';
import ErrorBoundary from '../components/ErrorBoundary';
import { dataService } from '../lib/dataService';
import { getSupabaseClient, isSupabaseEnabled } from '../lib/supabase';
import { GraphicsEngine } from '../components/GraphicsEngine';

// --- WEBRTC MANAGER ---

class WebRTCManager {
  peers: Map<string, RTCPeerConnection> = new Map();
  localStream: MediaStream | null = null;
  roomId: string;
  onStream: (id: string, stream: MediaStream) => void;
  onDisconnect: (id: string) => void;
  sendSignal: (targetId: string, signal: any) => void;

  constructor(roomId: string, sendSignal: (targetId: string, signal: any) => void, onStream: (id: string, stream: MediaStream) => void, onDisconnect: (id: string) => void) {
    this.roomId = roomId;
    this.sendSignal = sendSignal;
    this.onStream = onStream;
    this.onDisconnect = onDisconnect;
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    this.peers.forEach(pc => {
      // Avoid adding tracks multiple times
      const senders = pc.getSenders();
      stream.getTracks().forEach(track => {
        if (!senders.find(s => s.track === track)) {
          pc.addTrack(track, stream);
        }
      });
    });
  }

  async createPeer(targetId: string, isInitiator: boolean) {
    if (this.peers.has(targetId)) return this.peers.get(targetId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.peers.set(targetId, pc);

    pc.onicecandidate = (event) => {
      console.log("ICE candidate generated:", event.candidate);
      if (event.candidate) {
        this.sendSignal(targetId, { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track:", event);
      this.onStream(targetId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            this.removePeer(targetId);
        }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
    }

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(targetId, { type: 'offer', sdp: offer.sdp });
    }

    return pc;
  }

  async handleSignal(senderId: string, signal: any) {
    let pc = this.peers.get(senderId);

    if (signal.type === 'offer') {
      if (!pc) pc = await this.createPeer(senderId, false);
      await pc!.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      this.sendSignal(senderId, { type: 'answer', sdp: answer.sdp });
    } else if (signal.type === 'answer') {
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
    } else if (signal.type === 'ice-candidate') {
      if (pc && signal.candidate) {
          try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
              console.error("Error adding ice candidate", e);
          }
      }
    }
  }

  removePeer(id: string) {
    const pc = this.peers.get(id);
    if (pc) {
      pc.close();
      this.peers.delete(id);
      this.onDisconnect(id);
    }
  }

  destroy() {
      this.peers.forEach(pc => pc.close());
      this.peers.clear();
  }
}

// --- HELPERS ---

const SKYBOXES = {
    Day: { sunPosition: [100, 20, 100], stars: false, fog: '#87ceeb', icon: <Sun size={16} />, environment: 'city' },
    Night: { sunPosition: [0, -10, 0], stars: true, fog: '#050505', icon: <Moon size={16} />, environment: 'night' },
    Sunset: { sunPosition: [100, 2, 100], stars: false, fog: '#ff7f50', icon: <CloudSun size={16} />, environment: 'sunset' },
    Space: { sunPosition: [0, 0, 0], stars: true, fog: '#000000', icon: <Star size={16} />, environment: 'apartment' },
    Cloudy: { sunPosition: [0, 50, 0], stars: false, fog: '#a0a0a0', icon: <Cloud size={16} />, environment: 'forest' },
    Realistic: { sunPosition: [50, 50, 50], stars: false, fog: '#f3f4f6', icon: <Globe size={16} />, environment: 'park' }
};

const SoundObject = ({ url, volume = 1, loop = true, playing = true, proximityTrigger = false, touchTrigger = false, triggerDistance = 5, position }: { url: string; volume?: number; loop?: boolean; playing?: boolean; proximityTrigger?: boolean; touchTrigger?: boolean; triggerDistance?: number; position: [number, number, number] }) => {
    if (!url) return null;
    const [isNear, setIsNear] = useState(false);
    const [isTouched, setIsTouched] = useState(false);
    
    useFrame(() => {
        const localPos = (window as any).localPlayerPos || { x: 0, y: 0, z: 0 };
        const dist = Math.sqrt(
            Math.pow(position[0] - localPos.x, 2) +
            Math.pow(position[1] - localPos.y, 2) +
            Math.pow(position[2] - localPos.z, 2)
        );

        if (proximityTrigger) {
            setIsNear(dist < triggerDistance);
        }

        if (touchTrigger) {
            if (dist < 2 && !isTouched) {
                setIsTouched(true);
            }
        }
    });

    const shouldPlay = touchTrigger ? isTouched : (proximityTrigger ? isNear : playing);

    return (
        <group>
            <mesh>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial color="cyan" wireframe transparent opacity={0.3} />
            </mesh>
            <Suspense fallback={null}>
                {shouldPlay && <PositionalAudio url={url} distance={50} loop={loop} autoplay={true} />}
            </Suspense>
        </group>
    );
};

const VideoObject = ({ url, scale, isPlaying, proximityTrigger = false, touchTrigger = false, triggerDistance = 10, position }: { url: string; scale: [number, number, number]; isPlaying?: boolean; proximityTrigger?: boolean; touchTrigger?: boolean; triggerDistance?: number; position: [number, number, number] }) => {
    const [video] = useState(() => {
        if (!url) return null;
        const v = document.createElement('video');
        v.src = url;
        v.crossOrigin = "Anonymous";
        v.loop = true;
        v.muted = true;
        return v;
    });

    const [isNear, setIsNear] = useState(false);
    
    useFrame(() => {
        if (!proximityTrigger) return;
        const localPos = (window as any).localPlayerPos || { x: 0, y: 0, z: 0 };
        const dist = Math.sqrt(
            Math.pow(position[0] - localPos.x, 2) +
            Math.pow(position[1] - localPos.y, 2) +
            Math.pow(position[2] - localPos.z, 2)
        );
        setIsNear(dist < triggerDistance);
    });

    useEffect(() => {
        if (video) {
            const shouldPlay = proximityTrigger ? isNear : isPlaying;
            if (shouldPlay) {
                video.muted = false;
                video.play().catch(() => {});
            } else {
                video.muted = true;
                video.pause();
            }
        }
    }, [isPlaying, isNear, proximityTrigger, video]);

    if (!video) return null;

    return (
        <mesh scale={scale}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial side={THREE.DoubleSide}>
                <videoTexture attach="map" args={[video]} />
            </meshStandardMaterial>
        </mesh>
    );
};

const Terrain = ({ data, onSculpt, isSelected }: { data: number[][], onSculpt?: (x: number, y: number) => void, isSelected?: boolean }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const [isSculpting, setIsSculpting] = useState(false);
    const size = data.length;
    const geometry = React.useMemo(() => {
        const geo = new THREE.PlaneGeometry(size, size, size - 1, size - 1);
        geo.rotateX(-Math.PI / 2);
        const vertices = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const index = (i * size + j) * 3 + 1; // Y coordinate
                vertices[index] = data[i][j];
            }
        }
        geo.computeVertexNormals();
        return geo;
    }, [data, size]);

    const handleSculpt = (e: any) => {
        if (onSculpt) {
            e.stopPropagation();
            const point = e.point;
            const x = Math.floor(point.x + size / 2);
            const z = Math.floor(point.z + size / 2);
            onSculpt(x, z);
        }
    };

    return (
        <mesh 
            ref={meshRef} 
            geometry={geometry} 
            castShadow
            receiveShadow
            onPointerDown={(e) => { setIsSculpting(true); handleSculpt(e); }}
            onPointerUp={() => setIsSculpting(false)}
            onPointerMove={(e) => { if (isSculpting) handleSculpt(e); }}
            onPointerLeave={() => setIsSculpting(false)}
        >
            <meshStandardMaterial color="#4ade80" roughness={0.6} metalness={0.1} envMapIntensity={0.5} />
        </mesh>
    );
};

const MapMaterial = ({ type, color, textureUrl }: { type: string, color: string, textureUrl?: string }) => {
    const props: any = {
        color,
        roughness: type === 'Plastic' ? 0.2 : type === 'Neon' ? 0 : type === 'Metal' ? 0.05 : 0.7,
        metalness: type === 'Metal' ? 1.0 : type === 'Plastic' ? 0.05 : 0,
        emissive: type === 'Neon' ? color : 'black',
        emissiveIntensity: type === 'Neon' ? 8 : 0,
    };

    return (
        <ErrorBoundary fallback={<meshStandardMaterial color={color} />}>
            <Suspense fallback={<meshStandardMaterial color={color} />}>
                <TextureLoaderComponent textureUrl={textureUrl} props={props} />
            </Suspense>
        </ErrorBoundary>
    );
}

const TextureLoaderComponent = ({ textureUrl, props }: { textureUrl?: string, props: any }) => {
    const { gl } = useThree();
    if (textureUrl) {
        const texture = useLoader(THREE.TextureLoader, textureUrl);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = gl.capabilities.getMaxAnisotropy();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        props.map = texture;
    }
    return <meshStandardMaterial {...props} />;
}

// --- CONTROLS UI ---

const GameControls = () => {
  const touchStart = useRef({ x: 0, y: 0 });
  const [showEmotes, setShowEmotes] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    
    // Normalize roughly to -1 to 1 range
    const x = Math.max(-1, Math.min(1, dx / 50));
    const y = Math.max(-1, Math.min(1, dy / -50)); // Invert Y for forward

    setJoystickPos({ x: x * 40, y: -y * 40 });

    const event = new CustomEvent('joystickMove', { detail: { x, y } });
    window.dispatchEvent(event);
  };

  const handleTouchEnd = () => {
    setJoystickPos({ x: 0, y: 0 });
    const event = new CustomEvent('joystickMove', { detail: { x: 0, y: 0 } });
    window.dispatchEvent(event);
  };

  const EmoteIcon = () => (
    <div className="w-10 h-10 bg-white rounded-full flex flex-col items-center justify-center border-2 border-gray-300 shadow-inner">
        <div className="flex gap-1.5 mb-0.5">
            <div className="w-1.5 h-1.5 bg-black rounded-full" />
            <div className="w-1.5 h-1.5 bg-black rounded-full" />
        </div>
        <div className="w-4 h-1.5 border-b-2 border-black rounded-full" />
    </div>
  );

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-end pb-10 px-6">
       <div className="flex justify-between items-end pointer-events-auto">
          {/* Virtual Joystick Zone */}
          <div 
            className="w-32 h-32 bg-white/10 rounded-full border border-white/20 flex items-center justify-center backdrop-blur-sm"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
             <div 
                className="w-12 h-12 bg-white/30 rounded-full transition-transform duration-75" 
                style={{ transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)` }}
             />
          </div>

          {/* Emotes, Jump & Shoot */}
          <div className="flex flex-col gap-4 items-end">
              {showEmotes && (
                  <div className="bg-black/60 backdrop-blur-md p-2 rounded-xl border border-white/20 flex flex-wrap gap-2 w-48 mb-2">
                      {['👋', '🕺', '😂', '🔥', '💖', '😎'].map(e => (
                          <button key={e} className="w-full h-10 hover:bg-white/20 rounded flex items-center justify-center text-xl">{e}</button>
                      ))}
                  </div>
              )}
              <div className="flex gap-4 items-end">
                  <button 
                    onClick={() => setShowEmotes(!showEmotes)}
                    className="w-16 h-16 bg-white/10 rounded-full border border-white/20 flex items-center justify-center backdrop-blur-sm active:bg-white/30"
                  >
                     <EmoteIcon />
                  </button>
                  
                  <div className="flex flex-col gap-4">
                      <button 
                        className="w-24 h-24 bg-red-600/40 rounded-full border border-red-500/40 flex items-center justify-center backdrop-blur-sm active:bg-red-500/60 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                        onPointerDown={() => (window as any).triggerShoot?.()}
                      >
                         <div className="text-white font-black italic tracking-tighter">FUEGO</div>
                      </button>
                      
                      <button 
                        className="w-20 h-20 bg-white/10 rounded-full border border-white/20 flex items-center justify-center backdrop-blur-sm active:bg-white/30"
                        onTouchStart={() => window.dispatchEvent(new Event('jumpPress'))}
                        onTouchEnd={() => window.dispatchEvent(new Event('jumpRelease'))}
                        onMouseDown={() => window.dispatchEvent(new Event('jumpPress'))}
                        onMouseUp={() => window.dispatchEvent(new Event('jumpRelease'))}
                      >
                         <div className="text-white font-bold text-xs">SALTAR</div>
                      </button>
                  </div>
              </div>
          </div>
       </div>
    </div>
  )
};

const TeamSelectionOverlay = ({ onSelect, players }: { onSelect: (team: 'Red' | 'Blue') => void, players: RemotePlayer[] }) => {
    const redTeam = players.filter(p => p.config?.bodyColors?.head === '#ff0000' || Math.random() > 0.5); // Simplified team check
    const blueTeam = players.filter(p => !redTeam.includes(p));

    return (
        <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-10 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
                <div className="absolute top-0 left-0 w-1/2 h-full bg-red-900/20 blur-[100px]"></div>
                <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-900/20 blur-[100px]"></div>
            </div>

            <div className="text-center mb-16 relative z-10">
                <h2 className="text-6xl font-black text-white italic tracking-tighter mb-2 shadow-2xl">SELECCIONA TU EQUIPO</h2>
                <div className="h-1 w-32 bg-blue-600 mx-auto rounded-full"></div>
            </div>

            <div className="flex gap-12 w-full max-w-6xl relative z-10">
                {/* Red Team */}
                <div 
                    onClick={() => onSelect('Red')}
                    className="flex-1 group cursor-pointer"
                >
                    <div className="relative overflow-hidden rounded-2xl border-2 border-red-500/20 group-hover:border-red-500 transition-all duration-500 bg-red-950/20 aspect-[4/3] flex flex-col items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-t from-red-900/80 to-transparent"></div>
                        <div className="text-8xl mb-4 group-hover:scale-110 transition-transform">🔴</div>
                        <h3 className="text-4xl font-black text-white italic tracking-tight group-hover:tracking-widest transition-all">TEAM ROJO</h3>
                        <p className="text-red-400 font-bold mt-2">6 / 6 SLOTS DISPONIBLES</p>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-2 justify-center">
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="w-12 h-12 rounded-lg bg-red-900/40 border border-red-500/20 flex items-center justify-center">
                                <SkeletonLoader />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Blue Team */}
                <div 
                    onClick={() => onSelect('Blue')}
                    className="flex-1 group cursor-pointer"
                >
                    <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/20 group-hover:border-blue-500 transition-all duration-500 bg-blue-950/20 aspect-[4/3] flex flex-col items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/80 to-transparent"></div>
                        <div className="text-8xl mb-4 group-hover:scale-110 transition-transform">🔵</div>
                        <h3 className="text-4xl font-black text-white italic tracking-tight group-hover:tracking-widest transition-all">TEAM AZUL</h3>
                        <p className="text-blue-400 font-bold mt-2">6 / 6 SLOTS DISPONIBLES</p>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-2 justify-center">
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="w-12 h-12 rounded-lg bg-blue-900/40 border border-blue-500/20 flex items-center justify-center">
                                <SkeletonLoader />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="mt-20">
                <button className="text-white/40 hover:text-white text-xs uppercase tracking-widest transition-colors">Espectar Partida</button>
            </div>
        </div>
    );
};

const SkeletonLoader = () => (
    <div className="w-8 h-8 rounded-full bg-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
    </div>
);


const VisualScriptEditor = ({ 
    object, 
    onClose, 
    onUpdate 
}: { 
    object: MapObject, 
    onClose: () => void, 
    onUpdate: (scripts: VisualBlock[]) => void 
}) => {
    const [scripts, setScripts] = useState<VisualBlock[]>(object.visualScripts || []);
    
    const blockTypes = [
        { name: 'OnStart', type: 'Event', color: 'bg-yellow-600' },
        { name: 'OnTouch', type: 'Event', color: 'bg-yellow-600' },
        { name: 'OnClicked', type: 'Event', color: 'bg-yellow-600' },
        { name: 'OnAvatarMove', type: 'Event', color: 'bg-yellow-600' },
        { name: 'ChangeScene', type: 'Action', color: 'bg-blue-600' },
        { name: 'PlaySound', type: 'Action', color: 'bg-blue-600' },
        { name: 'ShowFloatingText', type: 'Action', color: 'bg-purple-600' },
        { name: 'Wait', type: 'Control', color: 'bg-orange-600' },
        { name: 'SpawnParticle', type: 'Action', color: 'bg-cyan-600' },
        { name: 'SyncMultiplayer', type: 'Action', color: 'bg-green-600' },
    ];

    const addBlock = (name: string, type: 'Event' | 'Action' | 'Variable' | 'Control') => {
        const newBlock: VisualBlock = {
            id: Date.now().toString() + Math.random(),
            name,
            type,
            params: {}
        };
        setScripts([...scripts, newBlock]);
    };

    return (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
            <div className="bg-[#1e1f21] w-full max-w-5xl h-full max-h-[800px] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600/20 p-2 rounded-lg"><Puzzle className="text-blue-400" size={24} /></div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-widest italic">Bloques de Programación</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Editando Script de: {object.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Maximize className="rotate-45" size={24} /></button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-64 border-r border-white/10 p-4 space-y-4 overflow-y-auto bg-black/10">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Librería</h3>
                        {blockTypes.map(b => (
                            <button 
                                key={b.name}
                                onClick={() => addBlock(b.name as any, b.type as any)}
                                className={`${b.color} w-full p-4 rounded-xl text-left font-black italic tracking-widest text-xs hover:scale-105 transition-transform shadow-lg group`}
                            >
                                <div className="flex items-center justify-between">
                                    <span>{b.name.toUpperCase()}</span>
                                    <Puzzle size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="text-[8px] opacity-70 mt-1 uppercase tracking-tight">{b.type}</div>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 p-8 bg-black/20 overflow-y-auto">
                        <div className="flex flex-col gap-6">
                            {scripts.map(s => (
                                <div key={s.id} className="relative group bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`${s.type === 'Event' ? 'bg-yellow-600' : (s.type === 'Control' ? 'bg-orange-600' : 'bg-blue-600')} px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl border-l-8 border-white/20`}>
                                            <Puzzle size={18} />
                                            <div className="font-black italic text-sm">{s.name.toUpperCase()}</div>
                                        </div>
                                        <button 
                                            onClick={() => setScripts(scripts.filter(b => b.id !== s.id))}
                                            className="text-gray-500 hover:text-red-500 transition-colors"
                                        >
                                            <Skull size={20} />
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        {s.name === 'ChangeScene' && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase">Escena Destino</label>
                                                <input 
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none"
                                                    placeholder="Lobby, Nivel 1, etc."
                                                    value={s.params.sceneName || ''}
                                                    onChange={e => {
                                                        const newScripts = scripts.map(b => b.id === s.id ? { ...b, params: { ...b.params, sceneName: e.target.value } } : b);
                                                        setScripts(newScripts);
                                                    }}
                                                />
                                            </div>
                                        )}
                                        {s.name === 'ShowFloatingText' && (
                                            <>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Texto</label>
                                                    <input 
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
                                                        value={s.params.text || ''}
                                                        onChange={e => {
                                                            const newScripts = scripts.map(b => b.id === s.id ? { ...b, params: { ...b.params, text: e.target.value } } : b);
                                                            setScripts(newScripts);
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Segundos para desaparecer</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
                                                        value={s.params.duration || 3}
                                                        onChange={e => {
                                                            const newScripts = scripts.map(b => b.id === s.id ? { ...b, params: { ...b.params, duration: Number(e.target.value) } } : b);
                                                            setScripts(newScripts);
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {s.name === 'PlaySound' && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase">URL del Sonido</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs"
                                                        placeholder="http://..."
                                                        value={s.params.soundUrl || ''}
                                                        onChange={e => {
                                                            const newScripts = scripts.map(b => b.id === s.id ? { ...b, params: { ...b.params, soundUrl: e.target.value } } : b);
                                                            setScripts(newScripts);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-4 bg-black/20">
                    <button onClick={onClose} className="px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white/10 rounded-xl transition-colors text-gray-400">Descartar</button>
                    <button 
                        onClick={() => {
                            onUpdate(scripts);
                            onClose();
                        }}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-black uppercase italic tracking-[0.2em] shadow-lg shadow-blue-600/30 active:scale-95 transition-all text-white"
                    >
                        APLICAR SCRIPTS
                    </button>
                </div>
            </div>
        </div>
    );
};

const FloatingTextRenderer = () => {
    const [texts, setTexts] = useState<{id: string, text: string, pos: [number, number, number], opacity: number}[]>([]);

    useEffect(() => {
        const handler = (e: any) => {
            const { text, position, duration } = e.detail;
            const id = Math.random().toString();
            setTexts(prev => [...prev, { id, text, pos: position, opacity: 1 }]);
            
            setTimeout(() => {
                let currentOpacity = 1;
                const interval = setInterval(() => {
                    currentOpacity -= 0.05;
                    setTexts(prev => prev.map(t => t.id === id ? { ...t, opacity: Math.max(0, currentOpacity) } : t));
                    if (currentOpacity <= 0) {
                        clearInterval(interval);
                        setTexts(prev => prev.filter(t => t.id !== id));
                    }
                }, 50);
            }, (duration || 3) * 1000);
        };
        window.addEventListener('show-floating-text', handler);
        return () => window.removeEventListener('show-floating-text', handler);
    }, []);

    return (
        <group>
            {texts.map(t => (
                <group key={t.id} position={new THREE.Vector3(...t.pos).add(new THREE.Vector3(0, 2 - t.opacity, 0))}>
                    <Text3D
                        fontSize={0.8}
                        color="white"
                        anchorX="center"
                        anchorY="middle"
                    >
                        {t.text}
                        <meshStandardMaterial transparent opacity={t.opacity} />
                    </Text3D>
                </group>
            ))}
        </group>
    );
};

const UIRenderer = ({ obj, isPlaying, handleSceneChange }: { obj: MapObject, isPlaying: boolean, handleSceneChange: (name: string) => void }) => {
    if (obj.type === 'Text') {
        return (
            <group position={new THREE.Vector3(...obj.position)} rotation={new THREE.Euler(...obj.rotation)}>
                <Text3D
                    fontSize={obj.scale[0]}
                    color={obj.color}
                    anchorX="center"
                    anchorY="middle"
                >
                    {obj.uiProperties?.text || 'Texto'}
                </Text3D>
            </group>
        );
    }

    if (obj.type === 'Button') {
        return (
            <group position={new THREE.Vector3(...obj.position)} rotation={new THREE.Euler(...obj.rotation)}>
                <Html transform occlude distanceFactor={10}>
                    <button 
                        onClick={() => {
                            if (isPlaying && obj.uiProperties?.sceneTarget) {
                                handleSceneChange(obj.uiProperties.sceneTarget);
                            }
                        }}
                        style={{
                            width: obj.scale[0] * 100 + 'px',
                            height: obj.scale[1] * 100 + 'px',
                            backgroundColor: obj.color,
                            color: obj.uiProperties?.fontColor || 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 'bold',
                            fontSize: (obj.uiProperties?.fontSize || 16) + 'px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: isPlaying ? 'pointer' : 'default',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
                            transform: 'scale(1)',
                            transition: 'transform 0.2s',
                        }}
                        className="hover:scale-105 active:scale-95"
                    >
                        {obj.textureUrl ? (
                            <img src={obj.textureUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                        ) : (
                            obj.uiProperties?.text || 'CLICK'
                        )}
                    </button>
                </Html>
            </group>
        );
    }

    if (obj.type === 'Canvas') {
        return (
            <group position={new THREE.Vector3(...obj.position)} rotation={new THREE.Euler(...obj.rotation)}>
                <Html transform occlude distanceFactor={10}>
                    <div style={{
                        width: obj.scale[0] * 100 + 'px',
                        height: obj.scale[1] * 100 + 'px',
                        backgroundColor: obj.color + (Math.floor(obj.transparency * 255).toString(16).padStart(2, '0')),
                        borderRadius: '20px',
                        border: '2px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(10px)',
                    }}>
                        {/* Canvas elements could be Nested children, but for now it's a panel */}
                        {obj.textureUrl && <img src={obj.textureUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} referrerPolicy="no-referrer" />}
                    </div>
                </Html>
            </group>
        );
    }

    return null;
};

const LoadingScreen = ({ loadingStep, onSkip }: { loadingStep: number, onSkip?: () => void }) => {
    const messages = [
        "", 
        "Iniciando motor Glidrovia...", 
        "Conectando a Google Cloud Engine...", 
        "Sincronizando con Oracle Cloud DB...", 
        "¡Listo!"
    ];
    return (
        <div className="absolute inset-0 z-50 bg-[#0a0b0d] flex flex-col items-center justify-center overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="relative w-24 h-24 mb-12 flex items-center justify-center">
                    <div className="absolute inset-0 border-4 border-blue-600/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                    <div className="w-10 h-10 bg-blue-600 rounded-lg rotate-45 flex items-center justify-center shadow-lg">
                        <div className="w-4 h-4 bg-white rounded-sm"></div>
                    </div>
                </div>

                <h2 className="text-5xl font-black text-white mb-4 italic tracking-tighter bg-gradient-to-r from-blue-400 via-white to-blue-600 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                    GLIDROVIA
                </h2>
                
                <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden mb-4 border border-white/5">
                    <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                        style={{ width: `${(loadingStep / 4) * 100}%` }}
                    ></div>
                </div>

                <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                        <p className="text-blue-400 font-mono text-xs uppercase tracking-[0.3em] font-bold">
                            {messages[loadingStep] || "Cargando..."}
                        </p>
                    </div>
                    
                    {loadingStep > 0 && (
                        <button 
                            onClick={onSkip}
                            className="mt-8 px-4 py-1 text-[10px] text-gray-500 hover:text-white border border-white/10 hover:border-white/30 rounded uppercase tracking-widest transition-all"
                        >
                            Saltar Carga
                        </button>
                    )}
                </div>
            </div>

            <div className="absolute bottom-10 text-white/20 font-mono text-[10px] tracking-widest uppercase">
                Glidrovia Engine v4.2.0 • Build 2026.04.12
            </div>
        </div>
    );
};

// --- PLAYER CONTROLLER ---

interface PlayerControllerProps {
    avatarConfig: AvatarConfig;
    mapObjects: MapObject[];
    username?: string;
    activeServer?: Server | null;
    isPlaying: boolean;
    currentScene: 'Lobby' | 'Game';
    equippedWeapon: string | null;
    isShooter: boolean;
    setEquippedWeapon: (w: string | null) => void;
    setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
    setKills: React.Dispatch<React.SetStateAction<number>>;
    setShowKillIcon: React.Dispatch<React.SetStateAction<boolean>>;
    globalAvatarReplacement?: any;
    settings?: AppSettings;
    playerName?: string;
    supabaseChannelRef?: React.MutableRefObject<any>;
}

const PlayerController: React.FC<PlayerControllerProps> = ({ 
    avatarConfig, 
    mapObjects, 
    username, 
    activeServer,
    isPlaying,
    currentScene,
    equippedWeapon,
    isShooter,
    setEquippedWeapon,
    setObjects,
    setKills,
    setShowKillIcon,
    globalAvatarReplacement,
    settings,
    playerName,
    supabaseChannelRef
}) => {
    const [pos, setPos] = useState(new THREE.Vector3(0, 2, 0));
    const [rot, setRot] = useState(new THREE.Euler(0, 0, 0));
    const [isMoving, setIsMoving] = useState(false);
    const [isJumping, setIsJumping] = useState(false);
    const walkSoundRef = useRef<HTMLAudioElement | null>(null);
    const shakeRef = useRef(new THREE.Vector3(0, 0, 0));
    const shakeIntensity = useRef(0);

    useEffect(() => {
        (window as any).triggerShoot = () => {
            if (isPlaying) handleShoot();
        };
    }, [isPlaying, equippedWeapon, mapObjects, rot, pos]);
    
    // Add Shoot event listener
    useEffect(() => {
        const handleShootEvent = () => {
            if (isPlaying && equippedWeapon) handleShoot();
        };
        window.addEventListener('triggerShoot', handleShootEvent);
        return () => window.removeEventListener('triggerShoot', handleShootEvent);
    }, [isPlaying, equippedWeapon, mapObjects, rot, pos]);
    
    // Add logic for weapon pickup UI
    useEffect(() => {
        if (!isPlaying) return;
        const interval = setInterval(() => {
            const nearestWeapon = mapObjects.find(obj => {
                if (!obj.isWeapon || obj.transparency === 1) return false;
                const dist = pos.distanceTo(new THREE.Vector3(...obj.position));
                return dist < 5;
            });
            (window as any).nearestWeapon = nearestWeapon;
        }, 500);
        return () => clearInterval(interval);
    }, [isPlaying, mapObjects, pos]);

    // Physics State
    const velocity = useRef(new THREE.Vector3(0, 0, 0));
    const canJump = useRef(true);
    const keys = useRef<{ [key: string]: boolean }>({});
    const isDead = useRef(false);

    const playTriggerSound = (trigger: MapObject['trigger']) => {
        const soundObj = mapObjects.find(obj => obj.type === 'Sound' && obj.trigger === trigger && obj.assetUrl);
        if (soundObj && soundObj.assetUrl) {
            const audio = new Audio(soundObj.assetUrl);
            audio.volume = soundObj.volume || 1;
            audio.play().catch(() => {});
        }
    };

    useEffect(() => {
        // Play spawn sound
        playTriggerSound('OnSpawn');
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => keys.current[e.code] = true;
        const onKeyUp = (e: KeyboardEvent) => keys.current[e.code] = false;
        
        const onJoystickMove = (e: CustomEvent) => {
             const { x, y } = e.detail;
             keys.current['KeyW'] = y > 0.3;
             keys.current['KeyS'] = y < -0.3;
             keys.current['ArrowLeft'] = x < -0.3;
             keys.current['ArrowRight'] = x > 0.3;
        };
        const onJumpPress = () => keys.current['Space'] = true;
        const onJumpRelease = () => keys.current['Space'] = false;

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('joystickMove', onJoystickMove as EventListener);
        window.addEventListener('jumpPress', onJumpPress);
        window.addEventListener('jumpRelease', onJumpRelease);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('joystickMove', onJoystickMove as EventListener);
            window.removeEventListener('jumpPress', onJumpPress);
            window.removeEventListener('jumpRelease', onJumpRelease);
        };
    }, []);

    useFrame((state) => {
        if (isDead.current) return;

        const speed = 0.25; 
        const jumpForce = 0.5; 
        const gravity = 0.025;
        
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.y);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.y);
        
        let moveVec = new THREE.Vector3(0, 0, 0);
        let moving = false;

        if (keys.current['KeyW']) { moveVec.add(forward); moving = true; }
        if (keys.current['KeyS']) { moveVec.sub(forward); moving = true; }
        
        if (moving) moveVec.normalize().multiplyScalar(speed);
        
        if (isMoving !== moving) {
            setIsMoving(moving);
            // Trigger blocks
            if (moving) {
                window.dispatchEvent(new CustomEvent('on-avatar-move', { detail: { position: [pos.x, pos.y, pos.z] } }));
            }
        }

        // Walk Sound Logic
        if (moving && !walkSoundRef.current && avatarConfig.walkSoundUrl) {
            walkSoundRef.current = new Audio(avatarConfig.walkSoundUrl);
            walkSoundRef.current.loop = true;
            walkSoundRef.current.play().catch(e => console.warn("Walk sound play failed", e));
        } else if (!moving && walkSoundRef.current) {
            walkSoundRef.current.pause();
            walkSoundRef.current = null;
        }

        const rotationSpeed = 0.08;
        if (keys.current['ArrowLeft'] || keys.current['KeyA']) setRot(r => new THREE.Euler(r.x, r.y + rotationSpeed, r.z));
        if (keys.current['ArrowRight'] || keys.current['KeyD']) setRot(r => new THREE.Euler(r.x, r.y - rotationSpeed, r.z));

        velocity.current.x = moveVec.x;
        velocity.current.z = moveVec.z;

        if (keys.current['Space'] && canJump.current) {
            velocity.current.y = jumpForce;
            canJump.current = false;
            setIsJumping(true);
            playTriggerSound('OnJump');
        }

        // 1. Apply Gravity
        velocity.current.y -= gravity;

        // 2. Collision Detection
        const nextPosVal = pos.clone().add(velocity.current);
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(nextPosVal.x, nextPosVal.y + 1, nextPosVal.z),
            new THREE.Vector3(1, 2, 1)
        );

        let collidedY = false;
        mapObjects.forEach(obj => {
            if (!obj.canCollide) return;
            
            // Simple AABB for Parts
            const objBox = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(...obj.position),
                new THREE.Vector3(...obj.scale)
            );

            if (playerBox.intersectsBox(objBox)) {
                // Resolve collision
                // If moving down and hitting top of object
                if (velocity.current.y < 0 && pos.y >= obj.position[1] + obj.scale[1]/2 - 0.1) {
                    velocity.current.y = 0;
                    nextPosVal.y = obj.position[1] + obj.scale[1]/2;
                    collidedY = true;
                    canJump.current = true;
                    if (isJumping) setIsJumping(false);
                } else {
                    // Horizontal collision - simple stop for now
                    velocity.current.x = 0;
                    velocity.current.z = 0;
                }
            }
        });

        let nextY = nextPosVal.y;
        
        // Death Logic: Fall below map
        if (nextY < -50 && !isDead.current) {
            isDead.current = true;
            playTriggerSound('OnFall');
            playTriggerSound('OnDeath');
            setTimeout(() => {
                setPos(new THREE.Vector3(0, 5, 0));
                velocity.current.set(0, 0, 0);
                isDead.current = false;
                playTriggerSound('OnSpawn');
            }, 2000);
        }

        if (nextY <= 0) {
            nextY = 0;
            velocity.current.y = 0;
            canJump.current = true;
            if (isJumping) setIsJumping(false);
        }

        // FPS Logic
        if (isPlaying && currentScene === 'Game') {
            // Pickup weapons
            mapObjects.forEach(obj => {
                if (obj.isWeapon && obj.transparency !== 1) {
                    const dist = pos.distanceTo(new THREE.Vector3(...obj.position));
                    if (dist < 3) {
                        if (equippedWeapon) {
                            // Drop current weapon (make it visible again)
                            const oldWeapon = mapObjects.find(o => (o.weaponType === equippedWeapon || o.name === equippedWeapon) && o.transparency === 1);
                            if (oldWeapon) (window as any).updateObject(oldWeapon.id, { transparency: 0, canCollide: true, position: [pos.x, pos.y, pos.z] });
                        }
                        setEquippedWeapon(obj.weaponType || 'Rifle');
                        (window as any).updateObject(obj.id, { transparency: 1, canCollide: false }); // Hide it
                        playTriggerSound('OnSpawn');
                    }
                }
            });

            // Bot AI (Simple follow and shoot)
            if (state.clock.getElapsedTime() % 1 < 0.02) {
                setObjects(prev => prev.map(obj => {
                    if (obj.isBot && obj.health && obj.health > 0) {
                        const botPos = new THREE.Vector3(...obj.position);
                        const dist = pos.distanceTo(botPos);
                        if (dist < 30 && dist > 5) {
                            const dir = pos.clone().sub(botPos).normalize().multiplyScalar(0.2);
                            return { ...obj, position: [obj.position[0] + dir.x, obj.position[1], obj.position[2] + dir.z] as [number, number, number] };
                        }
                    }
                    return obj;
                }));
            }
        }

        const nextPos = pos.clone().add(velocity.current);
        if(nextPos.y < 0) nextPos.y = 0;

        setPos(nextPos);
        (window as any).localPlayerPos = { x: nextPos.x, y: nextPos.y, z: nextPos.z };
        setIsMoving(moving || Math.abs(velocity.current.x) > 0.01 || Math.abs(velocity.current.z) > 0.01);

        // Sync with server
        const roomId = activeServer?.id || 'default-room';
        const socket = (window as any).studioSocket;
        const syncData = {
            id: socket?.id || username,
            username: playerName || username || 'Guest',
            position: [nextPos.x, nextPos.y, nextPos.z],
            rotation: [rot.x, rot.y, rot.z],
            isMoving: moving,
            isJumping: !canJump.current,
            isShooting: (window as any).isLocalShooting,
            weaponType: equippedWeapon,
            team: (window as any).myTeam,
            config: avatarConfig
        };

        if (state.clock.getElapsedTime() % 0.1 < 0.02) {
            if (socket) {
                socket.emit('update-player', roomId, syncData);
            }
            
            // Supabase Sync
            if (settings?.selectedRegion === 'Supabase' && supabaseChannelRef.current) {
                supabaseChannelRef.current.send({
                    type: 'broadcast',
                    event: 'player-sync',
                    payload: syncData
                });
            }
        }

        if (currentScene === 'Lobby') {
            // In lobby, player is fixed and looking at camera
            state.camera.position.set(0, 5, 15);
            state.camera.lookAt(0, 2, 0);
            setPos(new THREE.Vector3(0, 0, 0));
            setRot(new THREE.Euler(0, Math.PI, 0));
            return;
        }

        const camDist = 12;
        const camHeight = 6;
        
        // Apply camera shake
        if (shakeIntensity.current > 0) {
            shakeRef.current.set(
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current
            );
            shakeIntensity.current *= 0.9; // Decay
            if (shakeIntensity.current < 0.01) shakeIntensity.current = 0;
        } else {
            shakeRef.current.set(0, 0, 0);
        }

        state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, nextPos.x - Math.sin(rot.y) * camDist + shakeRef.current.x, 0.1);
        state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, nextPos.z - Math.cos(rot.y) * camDist + shakeRef.current.z, 0.1);
        state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, nextPos.y + camHeight + shakeRef.current.y, 0.1);
        state.camera.lookAt(nextPos.x, nextPos.y + 3, nextPos.z);
    });

    const avatarReplacement = mapObjects.find(obj => obj.isAvatarReplacement);

    const handleShoot = () => {
        if ((window as any).currentBuildMode && (window as any).currentBuildMode !== 'none') {
            // Build logic
            const buildType = (window as any).currentBuildMode;
            const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, rot.y, 0));
            const buildPos = pos.clone().add(direction.multiplyScalar(4));
            buildPos.y = Math.floor(buildPos.y / 4) * 4 + 2;
            
            const newObj: MapObject = {
                id: Date.now().toString(),
                name: buildType === 'wall' ? 'Wall' : 'Ramp',
                type: buildType === 'wall' ? 'Part' : 'Wedge',
                position: [buildPos.x, buildPos.y, buildPos.z],
                rotation: [0, rot.y, 0],
                scale: buildType === 'wall' ? [4, 4, 0.5] : [4, 4, 4],
                color: '#8B4513',
                material: 'Wood',
                transparency: 0,
                anchored: true,
                canCollide: true
            };
            setObjects(prev => [...prev, newObj]);
            return;
        }

        if (!equippedWeapon) return;
        
        // Weapon specific sounds and effects
        const weaponObj = mapObjects.find(o => o.isWeapon && o.weaponType === equippedWeapon);
        const shootSound = weaponObj?.assetUrl || 'https://assets.mixamo.com/sounds/rifle_shot.mp3'; // Fallback
        const audio = new Audio(shootSound);
        audio.volume = 0.5;
        audio.play().catch(() => {});

        (window as any).isLocalShooting = true;
        setTimeout(() => { (window as any).isLocalShooting = false; }, 100);

        // Camera shake
        shakeIntensity.current = 0.8;
        
        // Raycast logic for bots or other players
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z)));
        raycaster.set(pos, direction);
        
        const botObjects = mapObjects.filter(o => o.isBot && Number(o.health) > 0);
        botObjects.forEach(bot => {
            const botBox = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(...bot.position),
                new THREE.Vector3(...bot.scale)
            );
            if (raycaster.ray.intersectsBox(botBox)) {
                const damage = equippedWeapon === 'Rifle' ? 35 : 20;
                const newHealth = (Number(bot.health) || 0) - damage;
                (window as any).updateObject(bot.id, { health: newHealth });
                if (newHealth <= 0) {
                    setKills(prev => prev + 1);
                    setShowKillIcon(true);
                    setTimeout(() => setShowKillIcon(false), 2000);
                }
            }
        });
    };

    useEffect(() => {
        const onMouseDown = () => { if (isPlaying) handleShoot(); };
        window.addEventListener('mousedown', onMouseDown);
        return () => window.removeEventListener('mousedown', onMouseDown);
    }, [isPlaying, equippedWeapon, mapObjects, rot, pos]);

    return (
        <ErrorBoundary fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
            <Suspense fallback={null}>
                    {globalAvatarReplacement?.url ? (
                        <group position={[pos.x, pos.y, pos.z]} rotation={[rot.x, rot.y, rot.z]}>
                            <ImportedModel 
                                url={globalAvatarReplacement.url} 
                                isFbx={globalAvatarReplacement.isFbx} 
                                isPlaying={true} 
                                targetHeight={3}
                            />
                        </group>
                    ) : avatarReplacement ? (
                    <group position={[pos.x, pos.y, pos.z]} rotation={[rot.x, rot.y, rot.z]}>
                        {avatarReplacement.type === 'Model' && avatarReplacement.assetUrl ? (
                            <ImportedModel 
                                url={avatarReplacement.assetUrl} 
                                isFbx={avatarReplacement.assetUrl.includes('#fbx')} 
                                isPlaying={true} 
                                selectedAnimation={currentScene === 'Lobby' ? 'Idle_Weapon' : (equippedWeapon ? 'Run_Weapon' : avatarReplacement.selectedAnimation)}
                            />
                        ) : avatarReplacement.type === 'Sound' && avatarReplacement.assetUrl ? (
                            <SoundObject url={avatarReplacement.assetUrl} volume={avatarReplacement.volume} loop={avatarReplacement.loop} playing={true} position={[pos.x, pos.y, pos.z]} />
                        ) : avatarReplacement.type === 'Video' && avatarReplacement.assetUrl ? (
                            <VideoObject url={avatarReplacement.assetUrl} scale={avatarReplacement.scale} isPlaying={true} position={[pos.x, pos.y, pos.z]} />
                        ) : (
                            <group scale={avatarReplacement.scale}>
                                <PartGeometry type={avatarReplacement.type} />
                                <MapMaterial type={avatarReplacement.material} color={avatarReplacement.color} />
                            </group>
                        )}
                    </group>
                ) : (
                    <VoxelCharacter 
                        config={avatarConfig} 
                        position={[pos.x, pos.y, pos.z]} 
                        rotation={[rot.x, rot.y, rot.z]} 
                        isMoving={isMoving}
                        isJumping={isJumping}
                        weaponEquipped={!!equippedWeapon}
                        selectedAnimation={avatarReplacement?.selectedAnimation || avatarConfig.selectedAnimation}
                        username={username}
                    />
                )}
            </Suspense>
        </ErrorBoundary>
    );
};

// --- STUDIO COMPONENT ---

interface StudioProps {
  onPublish: (gameData: { title: string, map: MapObject[], skybox: string, thumbnail?: string, maxPlayers?: number, isMultiplayer?: boolean }) => void;
  avatarConfig: AvatarConfig;
  initialMapData?: MapObject[];
  initialGame?: Game;
  isPlayMode?: boolean;
  activeServer?: Server | null;
  onExit?: () => void;
  playerName?: string;
  username?: string;
  settings?: AppSettings;
}

const INITIAL_MAP: MapObject[] = [
    { id: 'baseplate', name: 'Baseplate', type: 'Part', position: [0, -0.5, 0], rotation: [0, 0, 0], scale: [100, 1, 100], color: '#2b2b2b', material: 'Plastic', transparency: 0, anchored: true, canCollide: true },
    { id: 'spawn', name: 'SpawnLocation', type: 'Part', position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [6, 0.2, 6], color: '#a3a2a5', material: 'Plastic', transparency: 0, anchored: true, canCollide: true }
];

const TEMPLATES = {
    Empty: INITIAL_MAP,
    FPS_Shooter: [
        { id: 'config', name: 'GameConfig', type: 'Part' as const, position: [0, -1000, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], color: '#000000', material: 'Plastic' as const, transparency: 1, anchored: true, canCollide: false, isShooter: true },
        { id: 'baseplate', name: 'Baseplate', type: 'Part' as const, position: [0, -0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [300, 1, 300] as [number, number, number], color: '#1a1a1a', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'spawn_blue', name: 'Spawn Blue', type: 'Part' as const, position: [-100, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [15, 0.2, 15] as [number, number, number], color: '#0000ff', material: 'Plastic' as const, transparency: 0.5, anchored: true, canCollide: true, team: 'Blue' as const },
        { id: 'spawn_red', name: 'Spawn Red', type: 'Part' as const, position: [100, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [15, 0.2, 15] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0.5, anchored: true, canCollide: true, team: 'Red' as const },
        
        // Weapons
        { id: 'gun1', name: 'Rifle Alpha', type: 'Part' as const, position: [0, 1, 10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [0.5, 0.5, 2] as [number, number, number], color: '#444444', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isWeapon: true, weaponType: 'Rifle' },
        { id: 'gun2', name: 'Sniper Beta', type: 'Part' as const, position: [0, 1, -10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [0.4, 0.4, 3] as [number, number, number], color: '#222222', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isWeapon: true, weaponType: 'Sniper' },
        
        // Bots Red Team (4)
        { id: 'bot_r1', name: 'Bot Red 1', type: 'Part' as const, position: [80, 1, 30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Red' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_r2', name: 'Bot Red 2', type: 'Part' as const, position: [80, 1, 10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Red' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_r3', name: 'Bot Red 3', type: 'Part' as const, position: [80, 1, -10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Red' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_r4', name: 'Bot Red 4', type: 'Part' as const, position: [80, 1, -30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Red' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        
        // Bots Blue Team (4)
        { id: 'bot_b1', name: 'Bot Blue 1', type: 'Part' as const, position: [-80, 1, 30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#0000ff', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Blue' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_b2', name: 'Bot Blue 2', type: 'Part' as const, position: [-80, 1, 10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#0000ff', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Blue' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_b3', name: 'Bot Blue 3', type: 'Part' as const, position: [-80, 1, -10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#0000ff', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Blue' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        { id: 'bot_b4', name: 'Bot Blue 4', type: 'Part' as const, position: [-80, 1, -30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#0000ff', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, team: 'Blue' as const, health: 100, maxHealth: 100, availableAnimations: ['Idle', 'Dance', 'Wave', 'Sit'] },
        
        // Mountains
        { id: 'mtn1', name: 'Mountain North', type: 'Wedge' as const, position: [0, 25, 100] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [100, 50, 100] as [number, number, number], color: '#4b3621', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'mtn2', name: 'Mountain South', type: 'Wedge' as const, position: [0, 25, -100] as [number, number, number], rotation: [0, Math.PI, 0] as [number, number, number], scale: [100, 50, 100] as [number, number, number], color: '#4b3621', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'mtn3', name: 'Mountain East', type: 'Wedge' as const, position: [150, 15, 0] as [number, number, number], rotation: [0, -Math.PI/2, 0] as [number, number, number], scale: [50, 30, 50] as [number, number, number], color: '#4b3621', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'mtn4', name: 'Mountain West', type: 'Wedge' as const, position: [-150, 15, 0] as [number, number, number], rotation: [0, Math.PI/2, 0] as [number, number, number], scale: [50, 30, 50] as [number, number, number], color: '#4b3621', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
    ],
    Battle_Royale: [
        { id: 'config', name: 'GameConfig', type: 'Part' as const, position: [0, -1000, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], color: '#000000', material: 'Plastic' as const, transparency: 1, anchored: true, canCollide: false, isShooter: true },
        { id: 'baseplate', name: 'Baseplate', type: 'Part' as const, position: [0, -0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1000, 1, 1000] as [number, number, number], color: '#1a1a1a', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'spawn', name: 'Spawn Location', type: 'Part' as const, position: [0, 100, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [50, 1, 50] as [number, number, number], color: '#ffffff', material: 'Plastic' as const, transparency: 0.5, anchored: true, canCollide: true },
        
        // Buildings
        { id: 'b1', name: 'Building 1', type: 'Part' as const, position: [50, 10, 50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [20, 20, 20] as [number, number, number], color: '#555555', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'b2', name: 'Building 2', type: 'Part' as const, position: [-50, 15, -50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [25, 30, 25] as [number, number, number], color: '#444444', material: 'Brick' as const, transparency: 0, anchored: true, canCollide: true },
        
        // Loot
        { id: 'loot1', name: 'Loot Chest', type: 'Part' as const, position: [50, 1, 50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2, 2, 2] as [number, number, number], color: '#ffd700', material: 'Neon' as const, transparency: 0, anchored: false, canCollide: true, isWeapon: true, weaponType: 'Rifle' },
        { id: 'loot2', name: 'Loot Chest', type: 'Part' as const, position: [-50, 1, -50] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2, 2, 2] as [number, number, number], color: '#ffd700', material: 'Neon' as const, transparency: 0, anchored: false, canCollide: true, isWeapon: true, weaponType: 'Sniper' },
        
        // Bots
        { id: 'bot1', name: 'Enemy Bot', type: 'Part' as const, position: [100, 1, 100] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, health: 100, maxHealth: 100 },
        { id: 'bot2', name: 'Enemy Bot', type: 'Part' as const, position: [-100, 1, -100] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number], color: '#ff0000', material: 'Plastic' as const, transparency: 0, anchored: false, canCollide: true, isBot: true, health: 100, maxHealth: 100 }
    ],
    Obby: [
        { id: 'baseplate', name: 'Baseplate', type: 'Part' as const, position: [0, -0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [50, 1, 50] as [number, number, number], color: '#1a1a1a', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'spawn', name: 'Spawn Location', type: 'Part' as const, position: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [6, 0.2, 6] as [number, number, number], color: '#00ff00', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'jump1', name: 'Jump 1', type: 'Part' as const, position: [0, 0.1, 10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [4, 0.2, 4] as [number, number, number], color: '#ff0000', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'jump2', name: 'Jump 2', type: 'Part' as const, position: [0, 0.1, 20] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [3, 0.2, 3] as [number, number, number], color: '#0000ff', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'jump3', name: 'Jump 3', type: 'Part' as const, position: [0, 0.1, 30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2, 0.2, 2] as [number, number, number], color: '#ffff00', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'finish', name: 'Finish Line', type: 'Part' as const, position: [0, 0.1, 40] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [6, 0.2, 6] as [number, number, number], color: '#ffffff', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
    ],
    Carreras: [
        { id: 'baseplate', name: 'Track Base', type: 'Part' as const, position: [0, -0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [200, 1, 200] as [number, number, number], color: '#111111', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'spawn', name: 'Start Line', type: 'Part' as const, position: [0, 0.1, -80] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [20, 0.2, 5] as [number, number, number], color: '#ffffff', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'track1', name: 'Track Straight', type: 'Part' as const, position: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [20, 0.1, 160] as [number, number, number], color: '#333333', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'wall1', name: 'Wall L', type: 'Part' as const, position: [-10, 1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 160] as [number, number, number], color: '#ff0000', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'wall2', name: 'Wall R', type: 'Part' as const, position: [10, 1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 2, 160] as [number, number, number], color: '#ff0000', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
    ],
    Tycoon: [
        { id: 'baseplate', name: 'Land', type: 'Part' as const, position: [0, -0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [100, 1, 100] as [number, number, number], color: '#2d4c1e', material: 'Grass' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'spawn', name: 'Spawn', type: 'Part' as const, position: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [6, 0.2, 6] as [number, number, number], color: '#a3a2a5', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'dropper1', name: 'Dropper 1', type: 'Part' as const, position: [10, 5, 10] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2, 2, 2] as [number, number, number], color: '#555555', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'conveyor', name: 'Conveyor', type: 'Part' as const, position: [10, 0.5, 20] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [3, 1, 20] as [number, number, number], color: '#222222', material: 'Plastic' as const, transparency: 0, anchored: true, canCollide: true },
        { id: 'collector', name: 'Collector', type: 'Part' as const, position: [10, 1, 30] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [4, 2, 4] as [number, number, number], color: '#00ff00', material: 'Neon' as const, transparency: 0, anchored: true, canCollide: true },
    ]
};

const PartGeometry = ({ type }: { type: MapObject['type'] }) => {
    switch (type) {
        case 'Sphere': return <sphereGeometry />;
        case 'Cylinder': return <cylinderGeometry />;
        case 'Wedge': return <boxGeometry />; // Simple wedge approximation
        case 'Canvas': return <planeGeometry />;
        default: return <boxGeometry />;
    }
};

const CameraHelper = ({ isSelected }: { isSelected: boolean }) => (
    <group>
        <mesh>
            <boxGeometry args={[0.5, 0.4, 0.6]} />
            <meshStandardMaterial color={isSelected ? "#00a2ff" : "#444"} />
        </mesh>
        <mesh position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
            <meshStandardMaterial color={isSelected ? "#00c3ff" : "#222"} />
        </mesh>
        {/* View Direction indicator */}
        <mesh position={[0, 0, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.1, 0.3, 4]} />
            <meshStandardMaterial color="#ffcc00" />
        </mesh>
    </group>
);

const CinematicCamera = ({ objects, index, isPlaying }: { objects: MapObject[], index: number | null, isPlaying: boolean }) => {
    const cameras = objects.filter(o => o.type === 'Camera');

    useFrame((state) => {
        if (!isPlaying || index === null || cameras.length === 0) return;
        
        const targetCam = cameras[index % cameras.length];
        if (!targetCam) return;
        
        const pos = new THREE.Vector3(...targetCam.position);
        const rot = new THREE.Euler(...targetCam.rotation);
        
        state.camera.position.lerp(pos, 0.1);
        state.camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(rot), 0.1);
    });
    
    return null;
};

const MapRenderer = ({ objects, isPlaying, selectedId, transformMode, handleUpdateObject, setSelectedId, sculptMode, handleSceneChange }: any) => (
      <>
        {objects.filter((obj: any) => !(isPlaying && obj.isAvatarReplacement)).map((obj: any) => (
            <React.Fragment key={obj.id}>
                {/* Bot Health Bar Overlay */}
                {isPlaying && obj.isBot && obj.health && obj.health > 0 && (
                    <group position={[obj.position[0], obj.position[1] + 4, obj.position[2]]}>
                        <mesh>
                            <planeGeometry args={[2, 0.2]} />
                            <meshBasicMaterial color="red" />
                        </mesh>
                        <mesh position={[-(1 - (Number(obj.health) || 0) / (obj.maxHealth || 100)), 0, 0.01]}>
                            <planeGeometry args={[2 * ((Number(obj.health) || 0) / (obj.maxHealth || 100)), 0.2]} />
                            <meshBasicMaterial color="green" />
                        </mesh>
                    </group>
                )}

                {(selectedId === obj.id && !isPlaying) ? (
                <TransformControls 
                    mode={transformMode} 
                    onObjectChange={(e: any) => {
                        if(e?.target?.object) {
                            const o = e.target.object;
                            handleUpdateObject(obj.id, {
                                position: [o.position.x, o.position.y, o.position.z],
                                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                                scale: [o.scale.x, o.scale.y, o.scale.z]
                            });
                        }
                    }}
                >
                    <group>
                        {['Canvas', 'Text', 'Button', 'Image'].includes(obj.type) ? (
                            <UIRenderer obj={obj} isPlaying={isPlaying} handleSceneChange={handleSceneChange} />
                        ) : (
                            <mesh 
                                position={new THREE.Vector3(...obj.position)} 
                                rotation={new THREE.Euler(...obj.rotation)} 
                                scale={new THREE.Vector3(...obj.scale)}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(obj.id); }}
                            >
                                {obj.type === 'Model' && obj.assetUrl ? (
                                    <ErrorBoundary fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                        <Suspense fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="gray" wireframe /></mesh>}>
                                            <ImportedModel 
                                                url={obj.assetUrl.replace('#fbx','')} 
                                                isFbx={obj.assetUrl.includes('#fbx')} 
                                                isPlaying={isPlaying} 
                                                selectedAnimation={obj.selectedAnimation}
                                                onAnimationsLoaded={(names) => {
                                                    if (!obj.availableAnimations || obj.availableAnimations.length !== names.length) {
                                                        handleUpdateObject(obj.id, { availableAnimations: names });
                                                    }
                                                }}
                                            />
                                        </Suspense>
                                    </ErrorBoundary>
                                ) : obj.isBot ? (
                                    <VoxelCharacter 
                                        config={{
                                            bodyColors: {
                                                head: obj.color, torso: obj.color, leftArm: obj.color,
                                                rightArm: obj.color, leftLeg: obj.color, rightLeg: obj.color
                                            },
                                            faceTextureUrl: null,
                                            accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                            hideFace: false
                                        }}
                                        position={[0, -1, 0]}
                                        rotation={[0, 0, 0]}
                                        isMoving={isPlaying}
                                        weaponEquipped={true}
                                        selectedAnimation={obj.selectedAnimation}
                                        username={obj.name}
                                    />
                                ) : obj.type === 'Sound' && obj.assetUrl ? (
                                    <ErrorBoundary fallback={<mesh><sphereGeometry args={[0.5, 8, 8]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                        <SoundObject url={obj.assetUrl} volume={obj.volume} loop={obj.loop} playing={isPlaying} proximityTrigger={obj.proximityTrigger} triggerDistance={obj.triggerDistance} position={obj.position} />
                                    </ErrorBoundary>
                                ) : obj.type === 'Video' && obj.assetUrl ? (
                                    <ErrorBoundary fallback={<mesh><planeGeometry args={[1, 1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                        <VideoObject url={obj.assetUrl} scale={obj.scale} isPlaying={isPlaying} proximityTrigger={obj.proximityTrigger} triggerDistance={obj.triggerDistance} position={obj.position} />
                                    </ErrorBoundary>
                                ) : obj.type === 'Terrain' && obj.terrainData ? (
                                    <Terrain 
                                        data={obj.terrainData} 
                                        isSelected={selectedId === obj.id}
                                        onSculpt={(x, z) => {
                                            if (sculptMode && selectedId === obj.id) {
                                                const newData = [...obj.terrainData!];
                                                for (let i = -4; i <= 4; i++) {
                                                    for (let j = -4; j <= 4; j++) {
                                                        const nx = x + i;
                                                        const nz = z + j;
                                                        if (nx >= 0 && nx < newData.length && nz >= 0 && nz < newData.length) {
                                                            const dist = Math.sqrt(i*i + j*j);
                                                            newData[nx][nz] += Math.max(0, 4 - dist) * 0.5;
                                                        }
                                                    }
                                                }
                                                handleUpdateObject(obj.id, { terrainData: newData });
                                            }
                                        }}
                                    />
                                ) : obj.type === 'Camera' ? (
                                    <CameraHelper isSelected={selectedId === obj.id} />
                                ) : (
                                    <>
                                        <PartGeometry type={obj.type} />
                                        <MapMaterial type={obj.material} color={obj.color} textureUrl={obj.textureUrl} />
                                    </>
                                )}
                            </mesh>
                        )}
                    </group>
                </TransformControls>
                ) : (
                <group>
                    {['Canvas', 'Text', 'Button', 'Image'].includes(obj.type) ? (
                        <UIRenderer obj={obj} isPlaying={isPlaying} handleSceneChange={handleSceneChange} />
                    ) : (
                        <mesh 
                            position={new THREE.Vector3(...obj.position)} 
                            rotation={new THREE.Euler(...obj.rotation)} 
                            scale={new THREE.Vector3(...obj.scale)}
                            onClick={(e) => { 
                                if(!isPlaying) {
                                    e.stopPropagation(); 
                                    setSelectedId(obj.id); 
                                }
                            }}
                        >
                            {obj.type === 'Model' && obj.assetUrl ? (
                                <ErrorBoundary fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                    <Suspense fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="gray" wireframe /></mesh>}>
                                        <ImportedModel 
                                            url={obj.assetUrl.replace('#fbx','')} 
                                            isFbx={obj.assetUrl.includes('#fbx')} 
                                            isPlaying={isPlaying} 
                                            selectedAnimation={obj.selectedAnimation}
                                            onAnimationsLoaded={(names) => {
                                                if (!obj.availableAnimations || obj.availableAnimations.length !== names.length) {
                                                    handleUpdateObject(obj.id, { availableAnimations: names });
                                                }
                                            }}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            ) : obj.isBot ? (
                                <VoxelCharacter 
                                    config={{
                                        bodyColors: {
                                            head: obj.color, torso: obj.color, leftArm: obj.color,
                                            rightArm: obj.color, leftLeg: obj.color, rightLeg: obj.color
                                        },
                                        faceTextureUrl: null,
                                        accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                        hideFace: false
                                    }}
                                    position={[0, -1, 0]}
                                    rotation={[0, 0, 0]}
                                    isMoving={isPlaying}
                                    weaponEquipped={true}
                                    selectedAnimation={obj.selectedAnimation}
                                    username={obj.name}
                                />
                            ) : obj.type === 'Sound' && obj.assetUrl ? (
                                <ErrorBoundary fallback={<mesh><sphereGeometry args={[0.5, 8, 8]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                    <SoundObject url={obj.assetUrl} volume={obj.volume} loop={obj.loop} playing={isPlaying} proximityTrigger={obj.proximityTrigger} triggerDistance={obj.triggerDistance} position={obj.position} />
                                </ErrorBoundary>
                            ) : obj.type === 'Video' && obj.assetUrl ? (
                                <ErrorBoundary fallback={<mesh><planeGeometry args={[1, 1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                                    <VideoObject url={obj.assetUrl} scale={obj.scale} isPlaying={isPlaying} proximityTrigger={obj.proximityTrigger} triggerDistance={obj.triggerDistance} position={obj.position} />
                                </ErrorBoundary>
                            ) : obj.type === 'Camera' ? (
                                isPlaying ? null : <CameraHelper isSelected={selectedId === obj.id} />
                            ) : (
                                <>
                                    <PartGeometry type={obj.type} />
                                    <MapMaterial type={obj.material} color={obj.color} textureUrl={obj.textureUrl} />
                                </>
                            )}
                        </mesh>
                    )}
                </group>
                )}
            </React.Fragment>
        ))}
      </>
  );

const RemotePlayerRenderer = ({ player, stream, globalAvatarReplacement }: { player: RemotePlayer, stream?: MediaStream, globalAvatarReplacement?: any }) => {
      const [currentPos] = useState(() => new THREE.Vector3(...player.position));
      const [currentRot] = useState(() => new THREE.Euler(...player.rotation));
      const audioRef = useRef<HTMLAudioElement | null>(null);
      
      useEffect(() => {
          if (stream && !audioRef.current) {
              const audio = new Audio();
              audio.srcObject = stream;
              audio.play().catch(e => console.error("Error playing remote stream", e));
              audioRef.current = audio;
          }
          return () => {
              if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.srcObject = null;
                  audioRef.current = null;
              }
          };
      }, [stream]);

      useFrame((state, delta) => {
          // If we have a target (future) position, lerp towards it
          if (player.targetPosition && player.isMoving) {
               const target = new THREE.Vector3(...player.targetPosition);
               currentPos.lerp(target, delta * 5); // Faster lerp for responsiveness
               
               if (currentPos.distanceTo(target) > 0.1) {
                   const angle = Math.atan2(target.x - currentPos.x, target.z - currentPos.z);
                   currentRot.y = angle + Math.PI;
               }
          } else {
              // Otherwise, snap/lerp to the current known position
              const target = new THREE.Vector3(...player.position);
              currentPos.lerp(target, 0.2); // Smooth snap
              currentRot.y = THREE.MathUtils.lerp(currentRot.y, player.rotation[1], 0.2);
          }
      });

      return (
          <group>
              <ErrorBoundary fallback={null}>
                  <Suspense fallback={null}>
                    {globalAvatarReplacement?.url ? (
                        <group position={[currentPos.x, currentPos.y, currentPos.z]} rotation={[0, currentRot.y, 0]}>
                            <ImportedModel 
                                url={globalAvatarReplacement.url} 
                                isFbx={globalAvatarReplacement.isFbx} 
                                isPlaying={true} 
                                targetHeight={3}
                            />
                        </group>
                    ) : (
                        <>
                           <VoxelCharacter 
                              config={player.config} 
                              position={[currentPos.x, currentPos.y, currentPos.z]} 
                              rotation={[0, currentRot.y, 0]}
                              isMoving={player.isMoving}
                              isJumping={player.isJumping}
                              weaponEquipped={!!(player as any).weaponType}
                              selectedAnimation={player.selectedAnimation}
                              username={`${player.username} [${player.country || '??'}]`}
                           />
                           {(player as any).isShooting && (
                              <group position={[currentPos.x, currentPos.y + 1, currentPos.z]}>
                                 <pointLight intensity={2} distance={5} color="orange" />
                              </group>
                           )}
                        </>
                    )}
                  </Suspense>
              </ErrorBoundary>
              {player.isTalking && (
                  <mesh position={[currentPos.x, currentPos.y + 3.5, currentPos.z]}>
                      <sphereGeometry args={[0.1, 16, 16]} />
                      <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
                  </mesh>
              )}
          </group>
      );
  }

const SpecialEffects = ({ objects }: { objects: MapObject[] }) => {
    // Check if any object has an effect
    const activeEffects = objects.map(o => o.effect).filter(e => e && e !== 'none');
    const isTeatro = objects.some(o => o.name === 'Stage' && o.material === 'Wood');
    
    return (
        <>
            {isTeatro && (
                <div className="absolute inset-0 pointer-events-none z-50 bg-black animate-[fadeOut_3s_ease-in-out_forwards]" />
            )}
            <style>{`
                @keyframes fadeOut {
                    0% { opacity: 1; }
                    50% { opacity: 0.8; }
                    100% { opacity: 0; visibility: hidden; }
                }
            `}</style>
            {activeEffects.includes('snow') && (
                <div className="absolute inset-0 pointer-events-none z-30 flex justify-center overflow-hidden">
                    {/* Fake snow effect using CSS */}
                    {Array.from({ length: 50 }).map((_, i) => (
                        <div key={i} className="absolute bg-white rounded-full opacity-80" 
                             style={{
                                 width: Math.random() * 5 + 2 + 'px',
                                 height: Math.random() * 5 + 2 + 'px',
                                 left: Math.random() * 100 + '%',
                                 top: -10,
                                 animation: `fall ${Math.random() * 3 + 2}s linear infinite`,
                                 animationDelay: `${Math.random() * 5}s`
                             }} 
                        />
                    ))}
                    <style>{`
                        @keyframes fall {
                            to { transform: translateY(100vh); }
                        }
                    `}</style>
                </div>
            )}
            {activeEffects.includes('rain') && (
                <div className="absolute inset-0 pointer-events-none z-30 flex justify-center overflow-hidden">
                    {/* Fake rain effect using CSS */}
                    {Array.from({ length: 100 }).map((_, i) => (
                        <div key={i} className="absolute bg-blue-400 opacity-40" 
                             style={{
                                 width: '1px',
                                 height: Math.random() * 15 + 10 + 'px',
                                 left: Math.random() * 100 + '%',
                                 top: -20,
                                 animation: `rainFall ${Math.random() * 0.5 + 0.5}s linear infinite`,
                                 animationDelay: `${Math.random() * 2}s`
                             }} 
                        />
                    ))}
                    <style>{`
                        @keyframes rainFall {
                            to { transform: translateY(100vh); }
                        }
                    `}</style>
                </div>
            )}
            {activeEffects.includes('fire') && (
                <div className="absolute bottom-0 left-0 w-full h-32 pointer-events-none z-30 bg-gradient-to-t from-orange-600/50 to-transparent animate-pulse mix-blend-screen" />
            )}
            {activeEffects.includes('lights') && (
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30 flex justify-around mix-blend-screen opacity-30">
                    <div className="w-1/3 h-full bg-gradient-to-b from-blue-500 to-transparent animate-pulse" style={{ animationDuration: '2s' }} />
                    <div className="w-1/3 h-full bg-gradient-to-b from-red-500 to-transparent animate-pulse" style={{ animationDuration: '1.5s' }} />
                    <div className="w-1/3 h-full bg-gradient-to-b from-green-500 to-transparent animate-pulse" style={{ animationDuration: '2.5s' }} />
                </div>
            )}
            {activeEffects.includes('rainbow') && (
                <div className="absolute inset-0 pointer-events-none z-30 bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 opacity-20 mix-blend-overlay animate-pulse" style={{ animationDuration: '5s' }} />
            )}
        </>
    );
};

export const StudioPage: React.FC<StudioProps> = ({ onPublish, avatarConfig, initialMapData, initialGame, isPlayMode = false, activeServer, onExit, playerName, username, settings }) => {
    const [scenes, setScenes] = useState<Scene[]>(initialGame?.scenes || [{ id: 'main', name: 'Escena 1', objects: initialMapData || INITIAL_MAP, skybox: 'Day' }]);
    const [activeWorldSceneId, setActiveWorldSceneId] = useState('main');
    const [currentScene, setCurrentScene] = useState<'Lobby' | 'Game'>('Game');
    const [showScriptEditor, setShowScriptEditor] = useState(false);
    
    const objects = scenes.find(s => s.id === activeWorldSceneId)?.objects || [];
    const skybox = scenes.find(s => s.id === activeWorldSceneId)?.skybox || 'Day';

    const setObjects = (newObjects: MapObject[] | ((prev: MapObject[]) => MapObject[])) => {
        setScenes(prev => prev.map(s => {
            if (s.id === activeWorldSceneId) {
                return { ...s, objects: typeof newObjects === 'function' ? newObjects(s.objects) : newObjects };
            }
            return s;
        }));
    };

    const setSkybox = (newSkybox: string) => {
        setScenes(prev => prev.map(s => s.id === activeWorldSceneId ? { ...s, skybox: newSkybox } : s));
    };

    const handleSceneChange = (name: string) => {
        const targetScene = scenes.find(s => s.name === name || s.id === name);
        if (targetScene) {
            setActiveWorldSceneId(targetScene.id);
            window.dispatchEvent(new CustomEvent('show-floating-text', { 
                detail: { text: `Cargando ${targetScene.name}...`, position: [0, 5, 0], duration: 1 } 
            }));
        }
    };

    const handleAddScene = () => {
        const id = Math.random().toString(36).substr(2, 9);
        const name = "Escena " + (scenes.length + 1);
        setScenes([...scenes, { id, name, objects: [], skybox: 'Day' }]);
        setActiveWorldSceneId(id);
    };

    const [isPlaying, setIsPlaying] = useState(false); 
    const [loadingStep, setLoadingStep] = useState(0);
    const [activeCinematicIndex, setActiveCinematicIndex] = useState<number | null>(null);
    const [globalAvatarReplacement, setGlobalAvatarReplacement] = useState<{ url: string; isFbx: boolean } | null>(null);
    const supabaseChannelRef = useRef<any>(null);
    const roomId = activeServer?.id || (initialGame?.id ? `editor-${initialGame.id}` : 'global-lobby');

    // Script Runner Effect
    useEffect(() => {
        if (!isPlaying) return;
        
        objects.forEach(obj => {
            if (obj.visualScripts) {
                obj.visualScripts.forEach(script => {
                    if (script.name === 'OnStart') {
                        if (script.params.text) {
                            window.dispatchEvent(new CustomEvent('show-floating-text', { 
                                detail: { text: script.params.text, position: obj.position, duration: script.params.duration || 3 } 
                            }));
                        }
                    }
                });
            }
        });
    }, [isPlaying, activeWorldSceneId]);

    useEffect(() => {
        if (settings?.selectedRegion === 'Supabase' && isSupabaseEnabled()) {
            if (username === 'Invitado') return () => {};
      const client = getSupabaseClient();
            if (client) {
                console.log("Initializing Supabase Realtime Multiplayer for room:", roomId);
                const channel = client.channel(`mp:${roomId}`, {
                    config: {
                        broadcast: { self: false },
                        presence: { key: username || 'guest' }
                    }
                });

                channel
                    .on('broadcast', { event: 'player-sync' }, ({ payload }) => {
                        setRemotePlayers(prev => {
                            const existing = prev.find(p => p.id === payload.id);
                            if (existing) {
                                return prev.map(p => p.id === payload.id ? { ...p, ...payload } : p);
                            }
                            return [...prev, payload];
                        });
                    })
                    .on('broadcast', { event: 'webrtc-signal' }, ({ payload }) => {
                        if (payload.targetId === socketRef.current?.id || payload.targetId === username) {
                            webrtcManager.current?.handleSignal(payload.senderId, payload.signal);
                        }
                    })
                    .on('presence', { event: 'sync' }, () => {
                        const state = channel.presenceState();
                        console.log('Presence sync:', state);
                    })
                    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                        leftPresences.forEach((p: any) => {
                            setRemotePlayers(prev => prev.filter(pl => pl.username !== p.key));
                        });
                    })
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            channel.track({ online_at: new Date().toISOString() });
                        }
                    });

                supabaseChannelRef.current = channel;
                (window as any).supabaseChannel = channel;
                return () => {
                    client.removeChannel(channel);
                    (window as any).supabaseChannel = null;
                };
            }
        }
    }, [settings?.selectedRegion, roomId, username]);

    useEffect(() => {
        const unsubscribeGlobal = dataService.subscribeToGlobalSettings((data) => {
            if (data.global_avatar_replacement) {
                setGlobalAvatarReplacement(data.global_avatar_replacement);
            } else {
                setGlobalAvatarReplacement(null);
            }
        });
        return () => unsubscribeGlobal();
    }, []);

    const [equippedWeapon, setEquippedWeapon] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<'none' | 'wall' | 'ramp'>('none');
  const [kills, setKills] = useState(0);
  const [showKillIcon, setShowKillIcon] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showStudioMenu, setShowStudioMenu] = useState(false);
  const [gameTitle, setGameTitle] = useState("Mi Experiencia Glidrovia");
  const [isMultiplayer, setIsMultiplayer] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [isMicOn, setIsMicOn] = useState(false);
  const [sculptMode, setSculptMode] = useState(false);
  const [showTextureSphere, setShowTextureSphere] = useState(false);

  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleCreateObject = (type: MapObject['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newObj: MapObject = {
      id,
      name: type + ' ' + id.substr(0, 4),
      type,
      position: [0, 5, 0],
      rotation: [0, 0, 0],
      scale: type === 'Terrain' ? [1, 1, 1] : [4, 4, 4], // Default scale larger as requested
      color: '#ffffff',
      material: 'Plastic',
      transparency: 0,
      anchored: true,
      canCollide: true,
      isTerrain: type === 'Terrain',
      terrainData: type === 'Terrain' ? Array(50).fill(0).map(() => Array(50).fill(0)) : undefined
    };
    setObjects([...objects, newObj]);
    setSelectedId(id);
  };

  const handleDuplicateObject = () => {
    if (!selectedId) return;
    const original = objects.find(o => o.id === selectedId);
    if (!original) return;

    const id = Math.random().toString(36).substr(2, 9);
    const newObj: MapObject = {
      ...original,
      id,
      name: original.name + ' Copy',
      position: [original.position[0] + 5, original.position[1], original.position[2]]
    };
    setObjects([...objects, newObj]);
    setSelectedId(id);
  };

  const createShooterTemplate = () => {
    setLoadingStep(1);
    setTimeout(() => {
      const shooterObjects: MapObject[] = [
        // Spawners Team A (Red)
        { id: 'spawner_a1', name: 'Spawner Rojo 1', type: 'Part', position: [-50, 0.1, -50], rotation: [0, 0, 0], scale: [2, 0.2, 2], color: '#ff0000', material: 'Neon', transparency: 0, anchored: true, canCollide: false, team: 'Red' },
        { id: 'spawner_a2', name: 'Spawner Rojo 2', type: 'Part', position: [-45, 0.1, -50], rotation: [0, 0, 0], scale: [2, 0.2, 2], color: '#ff0000', material: 'Neon', transparency: 0, anchored: true, canCollide: false, team: 'Red' },
        // Spawners Team B (Blue)
        { id: 'spawner_b1', name: 'Spawner Azul 1', type: 'Part', position: [50, 0.1, 50], rotation: [0, 0, 0], scale: [2, 0.2, 2], color: '#0000ff', material: 'Neon', transparency: 0, anchored: true, canCollide: false, team: 'Blue' },
        { id: 'spawner_b2', name: 'Spawner Azul 2', type: 'Part', position: [45, 0.1, 50], rotation: [0, 0, 0], scale: [2, 0.2, 2], color: '#0000ff', material: 'Neon', transparency: 0, anchored: true, canCollide: false, team: 'Blue' },
        // Weapon Pickups
        { id: 'weapon_rifle_1', name: 'Rifle de Asalto', type: 'Part', position: [0, 1, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 2], color: '#333333', material: 'Plastic', transparency: 0, anchored: true, canCollide: false, isWeapon: true, weaponType: 'Rifle' },
        { id: 'weapon_pistol_1', name: 'Pistola', type: 'Part', position: [10, 1, 10], rotation: [0, 0, 0], scale: [0.3, 0.3, 0.6], color: '#333333', material: 'Plastic', transparency: 0, anchored: true, canCollide: false, isWeapon: true, weaponType: 'Pistol' },
        // Central Cover
        { id: 'cover_1', name: 'Muro Central', type: 'Part', position: [0, 2, 0], rotation: [0, 0.78, 0], scale: [10, 4, 1], color: '#444444', material: 'Brick', transparency: 0, anchored: true, canCollide: true },
        // Mark as Shooter Game
        { id: 'game_config', name: 'Configuracion Shooter', type: 'Part', position: [0, -100, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#000000', material: 'Plastic', transparency: 0, anchored: true, canCollide: false, isShooter: true }
      ];
      setObjects(prev => [...prev, ...shooterObjects]);
      setLoadingStep(0);
      alert("¡Plantilla Shooter (6vs6) cargada! Asegúrate de equipar el XBot en el Editor de Avatares.");
    }, 1000);
  };
  const [isShooter, setIsShooter] = useState(false);
  const [showTeamIntro, setShowTeamIntro] = useState(false);
  const [userTeam, setUserTeam] = useState<'Red' | 'Blue' | null>(null);

  useEffect(() => {
     setIsShooter(objects.some(obj => obj.isShooter));
  }, [objects]);
  
  // Multiplayer State
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);
  const remotePlayersRef = useRef<RemotePlayer[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const webrtcManager = useRef<WebRTCManager | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Sync ref with state
  useEffect(() => {
    remotePlayersRef.current = remotePlayers;
  }, [remotePlayers]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const [myPublishedGames, setMyPublishedGames] = useState<Game[]>([]);
  const [showImportServerModal, setShowImportServerModal] = useState(false);

  useEffect(() => {
      (window as any).updateObject = (id: string, newProps: Partial<MapObject>) => {
          setObjects(prev => prev.map(obj => obj.id === id ? { ...obj, ...newProps } : obj));
      };
      
      // Connect to real-time server for both Editor and Play mode
      const socket = io();
      socketRef.current = socket;
      (window as any).studioSocket = socket;
      
      // Determine Room ID: Use server ID if in play mode, otherwise a default or game-specific room
      const roomId = activeServer?.id || (initialGame?.id ? `editor-${initialGame.id}` : 'global-lobby');
      
      console.log("Connecting to real-time room:", roomId);

      socket.on('connect', () => {
          console.log("Socket connected:", socket.id);
          socket.emit('join-room', roomId, {
              username: playerName || 'Guest',
              config: avatarConfig,
              country: ['ES', 'US', 'MX', 'AR', 'CO', 'CL', 'BR'][Math.floor(Math.random() * 7)]
          });
      });

      socket.on('room-state', (state) => {
          console.log("Received room state:", state);
          const others = Object.values(state.players).filter((p: any) => p.id !== socket.id) as RemotePlayer[];
          setRemotePlayers(others);
          // Only update objects from server if we are in play mode (to avoid overwriting editor changes)
          if (isPlayMode && state.mapObjects.length > 0) setObjects(state.mapObjects);
      });

      socket.on('player-joined', (player) => {
          console.log("Player joined:", player.username);
          setRemotePlayers(prev => {
              if (prev.find(p => p.id === player.id)) return prev;
              return [...prev, player];
          });
      });

      socket.on('player-updated', (player) => {
          setRemotePlayers(prev => prev.map(p => p.id === player.id ? player : p));
      });

      socket.on('player-left', (id) => {
          console.log("Player left:", id);
          setRemotePlayers(prev => prev.filter(p => p.id !== id));
      });

      socket.on('map-updated', (mapObjects) => {
          if (isPlayMode) setObjects(mapObjects);
      });



      // Initialize WebRTC Manager with Supabase or Socket signal
      webrtcManager.current = new WebRTCManager(
          roomId,
          (targetId, signal) => {
              const senderId = socketRef.current?.id || username || 'anon';
              if (settings?.selectedRegion === 'Supabase' && supabaseChannelRef.current) {
                  supabaseChannelRef.current.send({
                      type: 'broadcast',
                      event: 'webrtc-signal',
                      payload: { targetId, senderId, signal }
                  });
              } else {
                  socketRef.current?.emit('webrtc-signal', roomId, targetId, signal);
              }
          },
          (id, stream) => {
              setRemoteStreams(prev => ({ ...prev, [id]: stream }));
          },
          (id) => {
              setRemoteStreams(prev => {
                  const next = { ...prev };
                  delete next[id];
                  return next;
              });
          }
      );

      socket.on('webrtc-signal', (senderId, signal) => {
          webrtcManager.current?.handleSignal(senderId, signal);
      });

      // Proximity check interval
      const proximityInterval = setInterval(() => {
          if (!socket.connected || !webrtcManager.current) return;
          
          const localPlayer = (window as any).localPlayerPos || { x: 0, y: 0, z: 0 };
          const PROXIMITY_DISTANCE = 100; // Increased range for global feel

          remotePlayersRef.current.forEach(player => {
              const dist = Math.sqrt(
                  Math.pow(player.position[0] - localPlayer.x, 2) +
                  Math.pow(player.position[1] - localPlayer.y, 2) +
                  Math.pow(player.position[2] - localPlayer.z, 2)
              );

              if (dist < PROXIMITY_DISTANCE) {
                  if (!webrtcManager.current?.peers.has(player.id)) {
                      webrtcManager.current?.createPeer(player.id, true);
                  }
              } else {
                  if (webrtcManager.current?.peers.has(player.id)) {
                      webrtcManager.current?.removePeer(player.id);
                  }
              }
          });
      }, 2000);

      return () => {
          console.log("Cleaning up socket connection");
          socket.disconnect();
          webrtcManager.current?.destroy();
          clearInterval(proximityInterval);
      };
  }, [activeServer?.id, initialGame?.id, playerName, avatarConfig]); // Re-connect if identity or room changes

  useEffect(() => {
      if (isPlayMode) {
          handlePlaySequence();
      } else if (username) {
          // Load saved studio map from Firestore
          const loadStudioMap = async () => {
              try {
                  const data = await dataService.getStudioData(username);
                  if (data && data.mapData && data.mapData.length > 0) {
                      setObjects(data.mapData);
                      setGameTitle(data.title || "Mi Experiencia Voxel");
                      setSkybox(data.skybox || "Day");
                  }
              } catch (err) {
                  console.error("Error loading studio map:", err);
              }
          };
          loadStudioMap();
      }
  }, [isPlayMode, username]);

  // Auto-save effect (Batching)
  useEffect(() => {
      if (!isPlayMode && !isPlaying && username && objects.length > 0) {
          const autoSave = async () => {
              try {
                  console.log("Auto-saving batch...");
                  await dataService.saveStudioData(username, objects);
              } catch (err) {
                  console.error("Error auto-saving:", err);
              }
          };

          const timer = setTimeout(autoSave, 300000); // Save every 5 minutes (300k ms)
          
          // Save on exit
          const handleBeforeUnload = () => {
              autoSave();
          };
          window.addEventListener('beforeunload', handleBeforeUnload);

          return () => {
              clearTimeout(timer);
              window.removeEventListener('beforeunload', handleBeforeUnload);
          };
      }
  }, [objects, gameTitle, skybox, isPlayMode, isPlaying, username]);

  const handlePlaySequence = () => {
    if (isShooter && !userTeam) {
        setShowTeamIntro(true);
        return;
    }
    setLoadingStep(1);
    const sequence = [
      () => setLoadingStep(1),
      () => setLoadingStep(2),
      () => setLoadingStep(3),
      () => { 
        setLoadingStep(4); 
        setTimeout(() => {
          setIsPlaying(true);
          setLoadingStep(0);
        }, 800); 
      }
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < sequence.length) { 
        sequence[i](); 
        i++; 
      } else { 
        clearInterval(interval); 
      }
    }, 800);

    // Safety timeout: if it hangs for more than 10 seconds, force start
    setTimeout(() => {
      if (loadingStep > 0 && !isPlaying) {
        console.warn("Loading sequence timed out, forcing play mode.");
        setIsPlaying(true);
        setLoadingStep(0);
      }
    }, 10000);
  };

  const handleImportModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isFbx = file.name.toLowerCase().endsWith('.fbx');
    
    // Fallback/Local mode: Use FileReader to get a Data URL immediately
    const reader = new FileReader();
    reader.onload = async (event) => {
        const localUrl = event.target?.result as string;
        
        // Try to upload to server for persistence
        let finalUrl = localUrl;
        
        try {
            finalUrl = await dataService.uploadFile(file);
        } catch (err) {
            console.warn("Server upload failed, using local Data URL:", err);
        }

        const assetUrl = isFbx ? `${finalUrl}#fbx` : finalUrl;

        if (selectedId) {
            const selectedObj = objects.find(o => o.id === selectedId);
            if (selectedObj && (selectedObj.isBot || selectedObj.isWeapon)) {
                handleUpdateObject(selectedId, { type: 'Model', assetUrl });
                return;
            }
        }

        const newObj: MapObject = {
            id: Date.now().toString(),
            name: file.name,
            type: 'Model',
            position: [0, 5, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#FFFFFF',
            material: 'Plastic',
            transparency: 0,
            anchored: true,
            canCollide: true,
            assetUrl
        };
        setObjects([...objects, newObj]);
        setSelectedId(newObj.id);
    };
    reader.readAsDataURL(file);
  };

  const handleExportMap = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(objects));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mapa_glidrovia.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportMap = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setObjects(json);
          alert("¡Mapa importado con éxito!");
        }
      } catch (err) {
        alert("Error al importar el archivo JSON.");
      }
    };
    reader.readAsText(file);
  };

  const fetchMyGames = async () => {
    if (!username) return;
    try {
      const games = await dataService.getGamesByCreator(username);
      setMyPublishedGames(games as any);
      setShowImportServerModal(true);
    } catch (err) {
      console.error("Error fetching my games:", err);
      // alert is blocked in iframe, but we'll keep it as a fallback or replace with UI
    }
  };

  const handleImportAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
        const url = await dataService.uploadFile(file);
        
        const newObj: MapObject = {
            id: Date.now().toString(),
            name: file.name,
            type: 'Sound',
            position: [0, 2, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#00ffff',
            material: 'Plastic',
            transparency: 0,
            anchored: true,
            canCollide: false,
            assetUrl: url,
            volume: 1,
            loop: true,
            playing: true,
            proximityTrigger: false,
            triggerDistance: 5
        };
        setObjects([...objects, newObj]);
        setSelectedId(newObj.id);
    } catch (err) {
        console.error("Error uploading audio:", err);
    }
  };

  const handleImportVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
        const url = await dataService.uploadFile(file);
        
        const newObj: MapObject = {
            id: Date.now().toString(),
            name: file.name,
            type: 'Video',
            position: [0, 5, 0],
            rotation: [0, 0, 0],
            scale: [10, 6, 1],
            color: '#ffffff',
            material: 'Plastic',
            transparency: 0,
            anchored: true,
            canCollide: true,
            assetUrl: url,
            proximityTrigger: false,
            triggerDistance: 10
        };
        setObjects([...objects, newObj]);
        setSelectedId(newObj.id);
    } catch (err) {
        console.error("Error uploading video:", err);
    }
  };

  const handleImportTexture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file && !selectedId) return;
    
    try {
        const url = await dataService.uploadFile(file!);
        handleUpdateObject(selectedId!, { textureUrl: url });
    } catch (err) {
        console.error("Error uploading texture:", err);
    }
  };

  useEffect(() => {
    const handleMicCommand = (e: any) => {
        const { command } = e.detail;
        if (command === '/mic on') {
            if (!isMicOn) toggleMic();
        } else if (command === '/mic off') {
            if (isMicOn) toggleMic();
        }
    };
    window.addEventListener('chat-command', handleMicCommand);
    return () => window.removeEventListener('chat-command', handleMicCommand);
  }, [isMicOn]);

  const handleUpdateObject = (id: string, newProps: Partial<MapObject>) => {
    setObjects(prev => prev.map(obj => obj.id === id ? { ...obj, ...newProps } : obj));
  };



  const toggleMic = async () => {
    if (isMicOn) {
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
      }
      setIsMicOn(false);
      socketRef.current?.emit('update-player', activeServer?.id || 'global-lobby', { isTalking: false });
    } else {
      // Level check for Microphone
      const userLevel = (window as any).currentUserLevel || 1;
      if (userLevel < 10) {
        alert(`Nivel insuficiente. Necesitas ser Nivel 10 para usar el micrófono (Nivel actual: ${userLevel})`);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream.current = stream;
        webrtcManager.current?.setLocalStream(stream);
        setIsMicOn(true);
        socketRef.current?.emit('update-player', activeServer?.id || 'global-lobby', { isTalking: true });
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("No se pudo acceder al micrófono");
      }
    }
  };



  // Component to interpolate remote players


  const GameUI = () => (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-[60]">
            {/* Cinematic Controls */}
            {objects.some(o => o.type === 'Camera') && (
                <div className="absolute top-24 left-4 pointer-events-auto flex flex-col gap-2">
                    <button 
                        onClick={() => setActiveCinematicIndex(prev => prev === null ? 0 : (prev + 1) % objects.filter(o => o.type === 'Camera').length)}
                        className={`p-3 rounded-full border-2 transition-all shadow-lg flex items-center gap-2 font-bold text-xs ${activeCinematicIndex !== null ? 'bg-orange-500 border-white text-white' : 'bg-black/60 border-white/20 text-gray-300'}`}
                    >
                        <VideoIcon size={20} /> 
                        {activeCinematicIndex !== null ? `Cámara ${activeCinematicIndex + 1}` : 'Ver Cinemática'}
                    </button>
                    {activeCinematicIndex !== null && (
                        <button 
                            onClick={() => setActiveCinematicIndex(null)}
                            className="p-2 bg-red-600 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white shadow-lg"
                        >
                            Salir de Cámara
                        </button>
                    )}
                </div>
            )}
            
            {/* Crosshair */}
            {isShooter && (
                <div className="w-4 h-4 border-2 border-white/50 rounded-full flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full" />
                </div>
            )}
            
            {/* Kill Icon */}
            {isShooter && showKillIcon && (
                <div className="absolute top-1/3 animate-bounce">
                    <Skull size={64} className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                </div>
            )}

            {/* Stats */}
            {isShooter && (
                <div className="absolute top-10 right-10 bg-black/50 p-4 rounded-lg border border-white/10 backdrop-blur-md flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kills</div>
                            <div className="text-3xl font-black text-white">{kills}</div>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Team</div>
                            <div className={`text-xl font-black italic ${userTeam === 'Red' ? 'text-red-500' : 'text-blue-500'}`}>{userTeam || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Weapon Pickup Button */}
            {(window as any).nearestWeapon && (
                <div className="absolute bottom-40 flex flex-col items-center gap-2">
                    <button 
                        onClick={() => window.dispatchEvent(new Event('triggerPickup'))}
                        className="bg-yellow-600 hover:bg-yellow-500 text-white font-black px-6 py-3 rounded-full border-2 border-white/20 pointer-events-auto shadow-2xl animate-pulse"
                    >
                        AGARRAR {(window as any).nearestWeapon.name.toUpperCase()}
                    </button>
                    <div className="text-white text-xs font-bold uppercase tracking-[0.3em] drop-shadow-lg">¡Arma Cerca!</div>
                </div>
            )}

            {/* Shoot Button (Mobile/Tablet friendly) */}
            {equippedWeapon && (
                <button 
                    onPointerDown={() => (window as any).triggerShoot?.()}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-red-600/80 border-4 border-white/20 rounded-full flex items-center justify-center pointer-events-auto active:scale-90 transition-transform shadow-lg shadow-red-600/20"
                >
                    <div className="w-8 h-8 bg-white rounded-full opacity-50" />
                </button>
            )}

            {/* Weapon Info */}
            {equippedWeapon && (
                <div className="absolute bottom-10 right-10 bg-black/50 p-4 rounded-lg border border-white/10 backdrop-blur-md flex items-center gap-4">
                    <div className="bg-blue-600/20 p-3 rounded-lg border border-blue-500/30">
                        <Gamepad size={24} className="text-blue-400" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Arma Equipada</div>
                        <div className="text-xl font-bold text-white">{equippedWeapon}</div>
                    </div>
                </div>
            )}
        </div>
    );

    const LobbyUI = () => (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-[70]">
            <div className="bg-[#1e1f21] p-8 rounded-2xl border border-white/10 shadow-2xl w-[500px] flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Lobby de Equipo</h2>
                    <div className="bg-blue-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">4 VS 4</div>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Invitar Jugadores</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input 
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-blue-500 transition-colors"
                            placeholder="Buscar por nombre de usuario..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="max-h-48 overflow-y-auto flex flex-col gap-2 pr-2">
                    {['PlayerOne', 'SniperPro', 'VoxelKing', 'ShadowNinja'].filter(u => u.toLowerCase().includes((searchQuery || '').toLowerCase())).map(user => (
                        <div key={user} className="bg-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full" />
                                <span className="font-bold text-sm">{user}</span>
                            </div>
                            <button 
                                onClick={() => setInvitedUsers(prev => [...prev, user])}
                                className={`p-2 rounded-lg transition-colors ${invitedUsers.includes(user) ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {invitedUsers.includes(user) ? 'Invitado' : <UserPlus size={16} />}
                            </button>
                        </div>
                    ))}
                </div>

                <button 
                    onClick={() => setCurrentScene('Game')}
                    className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-xl font-black text-lg uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                >
                    Comenzar Partida
                </button>
            </div>
        </div>
    );



  return (
    <div className="flex flex-col h-screen w-screen bg-[#232527] overflow-hidden text-white font-sans relative">
      
      {loadingStep > 0 && !isPlaying && (
        <LoadingScreen 
            loadingStep={loadingStep} 
            onSkip={() => {
                setIsPlaying(true);
                setLoadingStep(0);
            }} 
        />
      )}
      
      {isPlaying && currentScene === 'Game' && <GameUI />}
      {isPlaying && currentScene === 'Lobby' && <LobbyUI />}
      
      {isPlaying && <SpecialEffects objects={objects} />}
      {isPlaying && <GameControls />}

      {/* MULTIPLAYER STATUS OVERLAY */}
      <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-1 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md border border-white/10 p-2 rounded text-[10px] text-white/70 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${socketRef.current?.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {socketRef.current?.connected ? 'Sincronizado' : 'Desconectado'}
              <span className="opacity-50">|</span>
              <span>{remotePlayers.length + 1} Jugadores</span>
          </div>
          {remotePlayers.length > 0 && (
              <div className="flex flex-col gap-1">
                  {remotePlayers.slice(0, 3).map(p => (
                      <div key={p.id} className="bg-black/20 px-2 py-0.5 rounded text-[9px] text-white/50">
                          {p.username} se unió
                      </div>
                  ))}
                  {remotePlayers.length > 3 && <div className="text-[9px] text-white/30 pl-2">... y {remotePlayers.length - 3} más</div>}
              </div>
          )}
      </div>

      {/* TEAM SELECTION OVERLAY */}
      {showTeamIntro && (
          <TeamSelectionOverlay 
            players={remotePlayers} 
            onSelect={(team) => {
                (window as any).myTeam = team;
                setUserTeam(team);
                setShowTeamIntro(false);
                handlePlaySequence(); // Actually start the sequence now
            }} 
          />
      )}

      {showScriptEditor && selectedId && (
          <VisualScriptEditor 
            object={objects.find(o => o.id === selectedId)!}
            onClose={() => setShowScriptEditor(false)}
            onUpdate={(newScripts) => {
                handleUpdateObject(selectedId, { visualScripts: newScripts });
            }}
          />
      )}

      {showPublishModal && (() => {
          const handlePublishGame = async () => {
              setIsPublishing(true);
              let thumbnailUrl = "https://picsum.photos/seed/voxel/800/600";
              
              if (thumbnailFile) {
                  try {
                      thumbnailUrl = await dataService.uploadFile(thumbnailFile);
                  } catch (err) {
                      console.error("Error uploading thumbnail:", err);
                  }
              }

              onPublish({ 
                  title: gameTitle, 
                  map: objects, 
                  skybox,
                  thumbnail: thumbnailUrl,
                  maxPlayers: isMultiplayer ? maxPlayers : 1,
                  isMultiplayer: isMultiplayer
              });
              setIsPublishing(false);
              setShowPublishModal(false);
              alert("¡Experiencia Publicada!");
          };

          return (
            <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center">
                <div className="bg-[#2b2d31] p-6 rounded-lg w-96 border border-gray-600 shadow-xl">
                    <h2 className="text-xl font-bold mb-4">Publicar en Glidrovia</h2>
                    
                    {/* RULES & CREATOR PROGRAM WARNING */}
                    <div className="mb-4 space-y-2">
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-500 font-bold uppercase leading-tight">
                            ⚠️ REGLAS CRÍTICAS: LOS MAPAS CON CONTENIDO EXPLÍCITO, SEXUAL O SPAM SERÁN ELIMINADOS DE INMEDIATO. 
                            RIESGO DE BANEO: 60%. NO USAR MODS/HACKS EXTERNOS.
                        </div>
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-[10px] text-yellow-500 font-bold uppercase leading-tight flex items-center gap-2">
                            <Star size={12} className="shrink-0" />
                            PROGRAMA DE CREADORES: AL PUBLICAR, ACEPTAS EL MONITOREO DE ACTIVIDAD. RIESGO DE BANEO PERMANENTE POR INCUMPLIMIENTO: 40%.
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-400 font-bold uppercase">Nombre del Modo</label>
                            <input className="w-full bg-black/20 border border-gray-600 rounded p-2 mt-1" value={gameTitle} onChange={e => setGameTitle(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 font-bold uppercase">Miniatura (Foto)</label>
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="w-full text-xs mt-1" 
                                onChange={e => setThumbnailFile(e.target.files?.[0] || null)} 
                            />
                        </div>
                        <div className="flex items-center justify-between bg-black/20 p-2 rounded border border-gray-600">
                            <label className="text-xs text-gray-400 font-bold uppercase">Multijugador</label>
                            <button 
                                onClick={() => setIsMultiplayer(!isMultiplayer)}
                                className={`w-10 h-5 rounded-full transition-colors relative ${isMultiplayer ? 'bg-blue-600' : 'bg-gray-700'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isMultiplayer ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                        {isMultiplayer && (
                            <div>
                                <label className="text-xs text-gray-400 font-bold uppercase">Máximo de Jugadores</label>
                                <input 
                                    type="number" 
                                    min="2"
                                    max="100"
                                    className="w-full bg-black/20 border border-gray-600 rounded p-2 mt-1" 
                                    value={maxPlayers} 
                                    onChange={e => setMaxPlayers(parseInt(e.target.value) || 2)} 
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 justify-end mt-6">
                        <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 hover:bg-white/10 rounded">Cancelar</button>
                        <button 
                            disabled={isPublishing}
                            onClick={handlePublishGame} 
                            className="px-4 py-2 bg-blue-600 rounded font-bold disabled:opacity-50"
                        >
                            {isPublishing ? 'Publicando...' : 'Publicar'}
                        </button>
                    </div>
                </div>
            </div>
          );
      })()}
      
      {!isPlaying && !isPlayMode && (
        <div className="flex flex-col bg-[#2b2d31] border-b border-[#111213]">
            <div className="h-14 flex items-center px-4 justify-between">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 relative">
                    <button 
                        onClick={() => setShowStudioMenu(!showStudioMenu)}
                        className="font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors shadow-lg"
                    >
                        MENÚ
                    </button>
                    {showStudioMenu && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-[#2b2d31] border border-gray-600 rounded-lg shadow-2xl z-50 py-2 overflow-hidden">
                            <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Importar / Exportar</div>
                            <button onClick={() => { fileInputRef.current?.click(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><Upload size={16} className="text-purple-400" /> Modelo 3D</button>
                            <button onClick={() => { fetchMyGames(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><ServerIcon size={16} className="text-green-400" /> Desde el Servidor</button>
                            <button onClick={() => { mapInputRef.current?.click(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><FileBox size={16} className="text-yellow-400" /> Archivo Local (.json)</button>
                            <button onClick={() => { handleExportMap(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><Save size={16} className="text-blue-400" /> Exportar Mapa (.json)</button>
                            
                            {username === 'glidrovia' && (
                                <button 
                                    onClick={() => {
                                        const officialConfig = {
                                            bodyColors: { head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30', rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429' },
                                            faceTextureUrl: null,
                                            accessories: { hatModelUrl: null, shirtTextureUrl: null },
                                            hideFace: false
                                        };
                                        // Create a model with this config
                                        const id = Math.random().toString(36).substr(2, 9);
                                        const newObj: MapObject = {
                                            id,
                                            name: 'Avatar Oficial',
                                            type: 'Model',
                                            position: [0, 5, 0],
                                            rotation: [0, 0, 0],
                                            scale: [4, 4, 4],
                                            color: '#ffffff',
                                            material: 'Plastic',
                                            transparency: 0,
                                            anchored: true,
                                            canCollide: true,
                                            isAvatarReplacement: true
                                        };
                                        setObjects([...objects, newObj]);
                                        setSelectedId(id);
                                        setShowStudioMenu(false);
                                        alert("Avatar oficial importado al Studio");
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-yellow-600 text-sm text-white flex items-center gap-3 transition-colors"
                                >
                                    <UserPlus size={16} className="text-yellow-400" /> Importar Avatar Oficial
                                </button>
                            )}

                            <div className="h-px bg-gray-600 my-2"></div>
                            
                            <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Multimedia</div>
                            <button onClick={() => { audioInputRef.current?.click(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><Volume2 size={16} className="text-cyan-400" /> Sonido</button>
                            <button onClick={() => { videoInputRef.current?.click(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><VideoIcon size={16} className="text-orange-400" /> Video</button>
                            
                            <div className="h-px bg-gray-600 my-2"></div>
                            
                            <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Plantillas Especiales</div>
                            <button onClick={() => { createShooterTemplate(); setShowStudioMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-blue-600 text-sm text-white flex items-center gap-3 transition-colors"><Puzzle size={16} className="text-blue-400" /> Shooter 6vs6 (Mixamo)</button>
                        </div>
                    )}
                </div>
                
                {/* Skybox Menu */}
                <div className="flex gap-1 bg-[#1e1f21] p-1 rounded-lg border border-white/5">
                    {Object.entries(SKYBOXES).map(([name, config]) => (
                        <button 
                            key={name}
                            onClick={() => setSkybox(name)}
                            title={name}
                            className={`p-1.5 rounded flex items-center gap-1 transition-colors ${skybox === name ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                        >
                            {config.icon}
                            <span className="text-[10px] font-bold hidden lg:inline">{name}</span>
                        </button>
                    ))}
                </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 font-bold uppercase">Plantilla</label>
                        <select 
                            className="bg-[#1e1f21] border border-white/10 rounded px-2 py-1 text-xs font-bold text-blue-400"
                            onChange={(e) => {
                                const template = TEMPLATES[e.target.value as keyof typeof TEMPLATES];
                                if (template) setObjects(template);
                            }}
                        >
                            {Object.keys(TEMPLATES).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                    </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Escena</label>
                    <div className="flex gap-1 bg-[#1e1f21] p-1 rounded-lg border border-white/5">
                        {scenes.map(s => (
                            <button 
                                key={s.id}
                                onClick={() => setActiveWorldSceneId(s.id)}
                                className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${activeWorldSceneId === s.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                            >
                                {s.name.toUpperCase()}
                            </button>
                        ))}
                        <button 
                            onClick={handleAddScene}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-[10px] font-bold text-white transition-colors"
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="flex gap-1 bg-[#1e1f21] p-1 rounded-lg">
                    <button onClick={() => setTransformMode('translate')} className={`p-1.5 rounded ${transformMode === 'translate' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} title="Mover"><Move size={18} /></button>
                    <button onClick={() => setTransformMode('scale')} className={`p-1.5 rounded ${transformMode === 'scale' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} title="Escalar (Estirar)"><Maximize size={18} /></button>
                    <button onClick={() => setTransformMode('rotate')} className={`p-1.5 rounded ${transformMode === 'rotate' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} title="Rotar"><RotateCw size={18} /></button>
                    <button onClick={handleDuplicateObject} className="p-1.5 rounded hover:bg-white/10" title="Duplicar (Ctrl+D)"><BoxIcon size={18} className="text-gray-400" /></button>
                    <button onClick={() => selectedId && handleUpdateObject(selectedId, { color: '#' + Math.floor(Math.random()*16777215).toString(16) })} className="p-1.5 rounded hover:bg-white/10" title="Color Aleatorio"><Palette size={18} className="text-gray-400" /></button>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Part', type: 'Part', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#A2A2A2', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><BoxIcon size={20} className="text-blue-400" /></button>
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Sphere', type: 'Sphere', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#A2A2A2', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><CircleIcon size={20} className="text-red-400" /></button>
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Wedge', type: 'Wedge', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#A2A2A2', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><TriangleIcon size={20} className="text-green-400" /></button>
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Cylinder', type: 'Cylinder', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#A2A2A2', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><CylinderIcon size={20} className="text-yellow-400 transform rotate-45" /></button>
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Canvas', type: 'Canvas', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#FFFFFF', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><Square size={20} className="text-purple-400" /></button>
                    <button onClick={() => { 
                         const newObj: MapObject = { id: Date.now().toString(), name: 'Text', type: 'Text', position: [0, 5, 0], rotation: [0,0,0], scale: [1,1,1], color: '#FFFFFF', material: 'Plastic', transparency: 0, anchored: false, canCollide: true };
                         setObjects([...objects, newObj]); setSelectedId(newObj.id);
                    }} className="p-1 hover:bg-white/10 rounded"><BoxIcon size={20} className="text-white" /></button>
                    <button onClick={() => handleCreateObject('Button')} className="p-1 hover:bg-white/10 rounded"><CircleIcon size={20} className="text-orange-400" /></button>
                    <button onClick={() => {
                        const id = Date.now().toString();
                        const newObj: MapObject = { 
                            id, name: 'Cámara ' + (objects.filter(o=>o.type==='Camera').length + 1), 
                            type: 'Camera', position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1], 
                            color: '#ffffff', material: 'Plastic', transparency: 0, anchored: true, canCollide: false 
                        };
                        setObjects([...objects, newObj]);
                        setSelectedId(id);
                    }} className="p-1 hover:bg-white/10 rounded"><VideoIcon size={20} className="text-orange-500" /></button>
                    <button onClick={() => handleCreateObject('Terrain')} className="p-1 hover:bg-white/10 rounded"><Mountain size={20} className="text-emerald-400" /></button>
                    {selectedId && objects.find(o => o.id === selectedId)?.isTerrain && (
                        <button 
                            onClick={() => setSculptMode(!sculptMode)} 
                            className={`p-1 rounded transition-colors ${sculptMode ? 'bg-emerald-600 text-white' : 'hover:bg-white/10 text-emerald-400'}`}
                            title="Modo Esculpir Montañas"
                        >
                            <Mountain size={20} />
                        </button>
                    )}
                    
                    <input type="file" ref={fileInputRef} hidden accept=".glb,.gltf,.fbx" onChange={handleImportModel} />
                    <input type="file" ref={audioInputRef} hidden accept="audio/*" onChange={handleImportAudio} />
                    <input type="file" ref={videoInputRef} hidden accept="video/*" onChange={handleImportVideo} />
                    <input type="file" ref={mapInputRef} hidden accept=".json" onChange={handleImportMap} />
                </div>
            </div>
            </div>

            {/* Import from Server Modal */}
            {showImportServerModal && (
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-[#1e1f21] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-600/20 to-transparent">
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                                <ServerIcon className="text-blue-400" /> Importar desde el Servidor
                            </h2>
                            <button onClick={() => setShowImportServerModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <ArrowLeft size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {myPublishedGames.length > 0 ? myPublishedGames.map(game => (
                                <div 
                                    key={game.id} 
                                    onClick={() => {
                                        if (game.mapData) {
                                            setObjects(game.mapData);
                                            setGameTitle(game.title);
                                            setShowImportServerModal(false);
                                            alert(`¡Mapa "${game.title}" cargado!`);
                                        }
                                    }}
                                    className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 hover:border-blue-500/50 transition-all group"
                                >
                                    <div className="aspect-video rounded-lg overflow-hidden mb-3 relative">
                                        <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Upload className="text-white" size={32} />
                                        </div>
                                    </div>
                                    <div className="font-bold text-white truncate">{game.title}</div>
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-1">ID: {game.id}</div>
                                </div>
                            )) : (
                                <div className="col-span-full py-12 text-center text-gray-500 font-bold uppercase tracking-widest">
                                    No tienes juegos publicados aún.
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-black/20 border-t border-white/5 flex justify-end">
                            <button onClick={() => setShowImportServerModal(false)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-bold text-sm transition-colors">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="h-12 bg-[#232428] flex items-center px-4 gap-4 border-t border-[#111213]">
                <div className="flex gap-2">
                    <button onClick={() => setShowPublishModal(true)} className="flex items-center gap-2 bg-[#2b2d31] border border-gray-600 hover:bg-gray-700 px-4 py-1.5 rounded text-sm font-bold transition-colors"><Save size={16} /> Publicar</button>
                    <button onClick={handlePlaySequence} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-1.5 rounded text-sm font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95"><Play size={16} fill="white" /> Jugar</button>
                </div>
                <div className="h-6 w-[1px] bg-white/10" />
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase tracking-widest">
                    <Layout size={14} />
                    <span>Modo Editor</span>
                </div>
            </div>
        </div>
      )}

      {/* STOP BUTTON / SERVER INFO */}
      {isPlaying && (
          <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
              <div className="flex gap-2">
                  <button onClick={() => { 
                      if (isPlayMode && onExit) onExit();
                      else { setIsPlaying(false); setLoadingStep(0); }
                  }} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow-lg flex items-center gap-2 border-2 border-white/20">
                      <ArrowLeft size={20} /> {isPlayMode ? 'Salir del Juego' : 'Detener'}
                  </button>
              </div>
              {activeServer && (
                  <div className="bg-black/50 p-2 rounded text-xs text-white border border-white/10 backdrop-blur-md">
                      <div className="font-bold text-green-400">● Conectado</div>
                      <div>{activeServer.name}</div>
                      <div>Ping: {activeServer.ping}ms</div>
                  </div>
              )}
          </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-[#111213] relative">
           <Canvas shadows dpr={[1, 2]} camera={{ position: [20, 20, 20], fov: 50 }}>
              <ErrorBoundary fallback={<gridHelper args={[100, 100, 0xff0000, 0x444444]} />}>
                 {!isPlaying && <OrbitControls makeDefault />}
                 <ambientLight intensity={0.4} />
                 <directionalLight 
                    position={[50, 100, 50]} 
                    intensity={2.0} 
                    castShadow 
                    shadow-mapSize={[4096, 4096]}
                    shadow-bias={-0.0001}
                    shadow-camera-left={-200}
                    shadow-camera-right={200}
                    shadow-camera-top={200}
                    shadow-camera-bottom={-200}
                  />
                  <Environment preset={SKYBOXES[skybox as keyof typeof SKYBOXES].environment as any || "city"} />
                  <ContactShadows position={[0, -0.99, 0]} opacity={0.4} scale={100} blur={2} far={10} />
                 
                 <Sky 
                    sunPosition={SKYBOXES[skybox as keyof typeof SKYBOXES].sunPosition as any} 
                    turbidity={skybox === 'Sunset' ? 10 : 0.5} 
                    rayleigh={skybox === 'Sunset' ? 3 : 0.5} 
                  />
                  {SKYBOXES[skybox as keyof typeof SKYBOXES].stars && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
                  <fog attach="fog" args={[SKYBOXES[skybox as keyof typeof SKYBOXES].fog, 0, 200]} />
                  
                  <GraphicsEngine />
                  
                  {isPlaying && activeCinematicIndex !== null && (
                      <CinematicCamera objects={objects} index={activeCinematicIndex} isPlaying={isPlaying} />
                  )}

                 {!isPlaying && <Grid infiniteGrid sectionSize={4} sectionColor="#6f6f6f" cellColor="#4a4a4a" position={[0, -0.01, 0]} />}
                  
                  {isPlaying && (
                      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                          <planeGeometry args={[1000, 1000]} />
                          <MeshReflectorMaterial
                              blur={[300, 100]}
                              resolution={1024}
                              mixBlur={1}
                              mixStrength={60}
                              roughness={1}
                              depthScale={1.2}
                              minDepthThreshold={0.4}
                              maxDepthThreshold={1.4}
                              color="#151515"
                              metalness={0.5}
                              mirror={0.8}
                          />
                      </mesh>
                  )}

                 {isPlaying && (
                     <PlayerController 
                        avatarConfig={avatarConfig} 
                        mapObjects={objects} 
                        username={username}
                        settings={settings}
                        playerName={playerName}
                        supabaseChannelRef={supabaseChannelRef}
                        activeServer={activeServer} 
                        isPlaying={isPlaying}
                        currentScene={currentScene}
                        equippedWeapon={equippedWeapon}
                        isShooter={isShooter}
                        setEquippedWeapon={setEquippedWeapon}
                        setObjects={setObjects}
                        setKills={setKills}
                        setShowKillIcon={setShowKillIcon}
                        globalAvatarReplacement={globalAvatarReplacement}
                     />
                 )}
                 
                 {/* RENDER REMOTE PLAYERS */}
                 {(isPlaying || !isPlayMode) && remotePlayers.map(rp => (
                     <RemotePlayerRenderer key={rp.id} player={rp} stream={remoteStreams[rp.id]} globalAvatarReplacement={globalAvatarReplacement} />
                 ))}

                 <Suspense fallback={null}>
                    <MapRenderer 
                        objects={objects}
                        isPlaying={isPlaying}
                        selectedId={selectedId}
                        transformMode={transformMode}
                        handleUpdateObject={handleUpdateObject}
                        setSelectedId={setSelectedId}
                        sculptMode={sculptMode}
                        handleSceneChange={handleSceneChange}
                   />
                 </Suspense>
                 
                 {!isPlaying && (
                     <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} onClick={() => setSelectedId(null)}>
                       <planeGeometry args={[1000, 1000]} />
                       <meshBasicMaterial visible={false} />
                     </mesh>
                 )}
              </ErrorBoundary>
           </Canvas>
        </div>
        
        {!isPlaying && !isPlayMode && (
            <div className="w-64 bg-[#2b2d31] border-l border-[#111213] flex flex-col">
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="text-xs font-bold text-gray-300 mb-2">EXPLORADOR</div>
                    {objects.map(obj => (
                        <div key={obj.id} onClick={() => setSelectedId(obj.id)} className={`pl-2 cursor-pointer text-sm flex items-center gap-2 py-0.5 ${selectedId === obj.id ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>
                            {obj.type === 'Model' ? <FileBox size={12}/> : <BoxIcon size={12} />} {obj.name}
                        </div>
                    ))}
                </div>

                {/* PROPIEDADES */}
                {selectedId && (
                    <div className="h-1/2 border-t border-[#111213] p-3 overflow-y-auto bg-[#1e1f21]">
                        <div className="text-xs font-bold text-gray-300 mb-3 uppercase tracking-wider">Propiedades</div>
                        {objects.find(o => o.id === selectedId) && (() => {
                            const obj = objects.find(o => o.id === selectedId)!;
                            return (
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Nombre</label>
                                        <input 
                                            className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs" 
                                            value={obj.name} 
                                            onChange={e => handleUpdateObject(obj.id, { name: e.target.value })}
                                        />
                                    </div>

                                    {/* NUMERICAL INPUTS FOR TRANSFORM */}
                                    <div className="space-y-2 border-t border-white/5 pt-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Posición</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {['x', 'y', 'z'].map((axis, i) => (
                                                <div key={axis} className="flex flex-col gap-0.5">
                                                    <span className="text-[8px] text-gray-600 uppercase text-center">{axis}</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.1"
                                                        className="bg-black/40 border border-gray-800 rounded px-1 py-0.5 text-[10px] text-center"
                                                        value={obj.position[i]}
                                                        onChange={e => {
                                                            const newPos = [...obj.position] as [number, number, number];
                                                            newPos[i] = parseFloat(e.target.value) || 0;
                                                            handleUpdateObject(obj.id, { position: newPos });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Rotación</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {['x', 'y', 'z'].map((axis, i) => (
                                                <div key={axis} className="flex flex-col gap-0.5">
                                                    <span className="text-[8px] text-gray-600 uppercase text-center">{axis}</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.1"
                                                        className="bg-black/40 border border-gray-800 rounded px-1 py-0.5 text-[10px] text-center"
                                                        value={obj.rotation[i]}
                                                        onChange={e => {
                                                            const newRot = [...obj.rotation] as [number, number, number];
                                                            newRot[i] = parseFloat(e.target.value) || 0;
                                                            handleUpdateObject(obj.id, { rotation: newRot });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Escala</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {['x', 'y', 'z'].map((axis, i) => (
                                                <div key={axis} className="flex flex-col gap-0.5">
                                                    <span className="text-[8px] text-gray-600 uppercase text-center">{axis}</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.1"
                                                        className="bg-black/40 border border-gray-800 rounded px-1 py-0.5 text-[10px] text-center"
                                                        value={obj.scale[i]}
                                                        onChange={e => {
                                                            const newScale = [...obj.scale] as [number, number, number];
                                                            newScale[i] = parseFloat(e.target.value) || 0;
                                                            handleUpdateObject(obj.id, { scale: newScale });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Color</label>
                                        <input 
                                            type="color"
                                            className="w-full h-8 bg-black/20 border border-gray-700 rounded cursor-pointer" 
                                            value={obj.color} 
                                            onChange={e => handleUpdateObject(obj.id, { color: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Material</label>
                                        <select 
                                            className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                            value={obj.material}
                                            onChange={e => handleUpdateObject(obj.id, { material: e.target.value as any })}
                                        >
                                            {['Plastic', 'Neon', 'Grass', 'Wood', 'Brick', 'Fabric'].map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {(obj.type === 'Model' || obj.isBot) && obj.availableAnimations && obj.availableAnimations.length > 0 && (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Animación</label>
                                            <select 
                                                className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                                value={obj.selectedAnimation || obj.availableAnimations[0]}
                                                onChange={e => handleUpdateObject(obj.id, { selectedAnimation: e.target.value })}
                                            >
                                                {obj.availableAnimations.map(anim => (
                                                    <option key={anim} value={anim}>{anim}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {['Part', 'Sphere', 'Wedge', 'Cylinder', 'Canvas', 'Text', 'Button', 'Image'].includes(obj.type) && (
                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase">Programación (Script)</label>
                                                <div className="text-[8px] bg-purple-600 px-1.5 py-0.5 rounded font-black italic">V4.0</div>
                                            </div>
                                            <button 
                                                onClick={() => setShowScriptEditor(true)}
                                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 border-b-4 border-purple-900 rounded-xl flex items-center justify-center gap-3 font-black italic uppercase tracking-widest text-xs transition-all shadow-lg active:border-b-0 active:translate-y-1"
                                            >
                                                <Puzzle className="text-white" size={16} /> BLOQUES
                                            </button>

                                            {['Canvas', 'Text', 'Button', 'Image'].includes(obj.type) && (
                                                <div className="space-y-4 bg-black/20 p-3 rounded-xl border border-white/5">
                                                    <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2 border-b border-blue-500/20 pb-1">Configuración UI</div>
                                                    
                                                    {(obj.type === 'Text' || obj.type === 'Button') && (
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-gray-400 font-bold uppercase">Texto</label>
                                                            <input 
                                                                className="bg-black/40 border border-gray-700 rounded px-2 py-1 text-xs" 
                                                                value={obj.uiProperties?.text || ''} 
                                                                onChange={e => handleUpdateObject(obj.id, { uiProperties: { ...obj.uiProperties, text: e.target.value } })}
                                                            />
                                                        </div>
                                                    )}

                                                    {obj.type === 'Button' && (
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-gray-400 font-bold uppercase">Escena Destino</label>
                                                            <input 
                                                                className="bg-black/40 border border-gray-700 rounded px-2 py-1 text-xs" 
                                                                placeholder="Nombre de la Escena..."
                                                                value={obj.uiProperties?.sceneTarget || ''} 
                                                                onChange={e => handleUpdateObject(obj.id, { uiProperties: { ...obj.uiProperties, sceneTarget: e.target.value } })}
                                                            />
                                                        </div>
                                                    )}

                                                    {(obj.type === 'Image' || obj.type === 'Button') && (
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-[10px] text-gray-400 font-bold uppercase">Imagen/Icono (URL)</label>
                                                            <div className="flex gap-2">
                                                                <input 
                                                                    className="flex-1 bg-black/40 border border-gray-700 rounded px-2 py-1 text-[10px]" 
                                                                    value={obj.textureUrl || ''} 
                                                                    onChange={e => handleUpdateObject(obj.id, { textureUrl: e.target.value })}
                                                                />
                                                                <button 
                                                                    onClick={() => {
                                                                        const input = document.createElement('input');
                                                                        input.type = 'file';
                                                                        input.accept = 'image/*';
                                                                        input.onchange = (e: any) => handleImportTexture(e);
                                                                        input.click();
                                                                    }}
                                                                    className="bg-blue-600 px-2 py-1 rounded text-[10px]"
                                                                >
                                                                    SUBIR
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {['Part', 'Sphere', 'Wedge', 'Cylinder'].includes(obj.type) && (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Imagen de Galería (Textura)</label>
                                            
                                            {/* TEXTURE PREVIEW SPHERE */}
                                            <div className="w-full aspect-square bg-black/40 rounded-lg border border-white/10 mb-2 overflow-hidden relative">
                                                <Canvas camera={{ position: [0, 0, 2] }}>
                                                    <ambientLight intensity={0.5} />
                                                    <pointLight position={[10, 10, 10]} />
                                                    <mesh>
                                                        <sphereGeometry args={[0.8, 32, 32]} />
                                                        <MapMaterial type={obj.material} color={obj.color} textureUrl={obj.textureUrl} />
                                                    </mesh>
                                                    <OrbitControls enableZoom={false} />
                                                </Canvas>
                                                <div className="absolute bottom-1 right-1 text-[8px] text-white/30 uppercase font-bold">Vista Previa</div>
                                            </div>

                                            <div className="flex gap-2">
                                                {obj.textureUrl && (
                                                    <img src={obj.textureUrl} className="w-10 h-10 rounded border border-white/10 object-cover" referrerPolicy="no-referrer" />
                                                )}
                                                <button 
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = 'image/*';
                                                        input.onchange = (e: any) => handleImportTexture(e);
                                                        input.click();
                                                    }}
                                                    className="flex-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 py-1 rounded text-[10px] font-bold uppercase"
                                                >
                                                    {obj.textureUrl ? 'Cambiar Imagen' : 'Colocar Imagen'}
                                                </button>
                                                {obj.textureUrl && (
                                                    <button onClick={() => handleUpdateObject(obj.id, { textureUrl: undefined })} className="p-1 text-red-400 hover:bg-red-400/10 rounded">X</button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {(obj.type === 'Sound' || obj.type === 'Video') && (
                                        <div className="space-y-2 border-t border-white/5 pt-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase">Proximidad (Trigger)</label>
                                                <input 
                                                    type="checkbox"
                                                    checked={obj.proximityTrigger || false}
                                                    onChange={e => handleUpdateObject(obj.id, { proximityTrigger: e.target.checked })}
                                                />
                                            </div>
                                            {obj.proximityTrigger && (
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Distancia de Activación</label>
                                                    <input 
                                                        type="number"
                                                        className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                                        value={obj.triggerDistance || 5}
                                                        onChange={e => handleUpdateObject(obj.id, { triggerDistance: parseFloat(e.target.value) })}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Efecto Especial</label>
                                        <select 
                                            className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                            value={obj.effect || 'none'}
                                            onChange={e => handleUpdateObject(obj.id, { effect: e.target.value as any })}
                                        >
                                            <option value="none">Ninguno</option>
                                            <option value="snow">Nieve</option>
                                            <option value="fire">Fuego</option>
                                            <option value="lights">Luces de Colores</option>
                                            <option value="rainbow">Arcoíris</option>
                                        </select>
                                    </div>

                                    {obj.isBot && (
                                        <div className="space-y-4 border-t border-white/5 pt-4">
                                            <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Configuración de Bot</div>
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase">Equipo</label>
                                                <select 
                                                    className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                                    value={obj.team || 'Red'}
                                                    onChange={e => handleUpdateObject(obj.id, { team: e.target.value as any })}
                                                >
                                                    <option value="Red">Rojo</option>
                                                    <option value="Blue">Azul</option>
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase">Salud Máxima</label>
                                                <input 
                                                    type="number"
                                                    className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                                    value={obj.maxHealth || 100}
                                                    onChange={e => handleUpdateObject(obj.id, { maxHealth: parseInt(e.target.value), health: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 py-2 rounded text-[10px] font-bold uppercase"
                                            >
                                                Cambiar Modelo de Bot
                                            </button>
                                        </div>
                                    )}

                                    {obj.isWeapon && (
                                        <div className="space-y-4 border-t border-white/5 pt-4">
                                            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Configuración de Arma</div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-gray-500 font-bold uppercase">Tipo de Arma</label>
                                                <input 
                                                    className="bg-black/20 border border-gray-700 rounded px-2 py-1 text-xs"
                                                    value={obj.weaponType || 'Rifle'}
                                                    onChange={e => handleUpdateObject(obj.id, { weaponType: e.target.value })}
                                                />
                                            </div>
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 py-2 rounded text-[10px] font-bold uppercase"
                                            >
                                                Cambiar Modelo de Arma
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Usar como Avatar</label>
                                        <input 
                                            type="checkbox"
                                            className="w-4 h-4 accent-blue-500"
                                            checked={obj.isAvatarReplacement || false}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                // Uncheck all others
                                                setObjects(objects.map(o => ({
                                                    ...o,
                                                    isAvatarReplacement: o.id === obj.id ? checked : false
                                                })));
                                            }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Colisión</label>
                                        <button 
                                            onClick={() => handleUpdateObject(obj.id, { canCollide: !obj.canCollide })}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${obj.canCollide ? 'bg-blue-600' : 'bg-gray-700'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${obj.canCollide ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Mesh Colisión</label>
                                        <button 
                                            onClick={() => handleUpdateObject(obj.id, { meshCollision: !obj.meshCollision })}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${obj.meshCollision ? 'bg-blue-600' : 'bg-gray-700'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${obj.meshCollision ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Anclado</label>
                                        <input 
                                            type="checkbox"
                                            checked={obj.anchored}
                                            onChange={e => handleUpdateObject(obj.id, { anchored: e.target.checked })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase">Colisión</label>
                                        <input 
                                            type="checkbox"
                                            checked={obj.canCollide}
                                            onChange={e => handleUpdateObject(obj.id, { canCollide: e.target.checked })}
                                        />
                                    </div>
                                    
                                    <button 
                                        onClick={() => { setObjects(objects.filter(o => o.id !== selectedId)); setSelectedId(null); }}
                                        className="w-full bg-red-600/20 hover:bg-red-600/40 text-red-400 text-[10px] font-bold py-1.5 rounded border border-red-600/30"
                                    >
                                        ELIMINAR OBJETO
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}
                {/* Creator Program & Rules Warning */}
                <div className="p-4 bg-yellow-500/10 border-t border-yellow-500/30 space-y-3">
                    <div className="flex items-center gap-2 text-yellow-500 font-bold text-sm">
                        <Globe size={16} />
                        PROGRAMA DE CREADORES GLIDROVIA
                    </div>
                    <p className="text-[9px] text-gray-400 leading-relaxed uppercase font-medium">
                        MAPAS MONITOREADOS: CONTENIDO EXPLÍCITO, SEXUAL, SPAM O ENGAÑO RESULTARÁ EN ELIMINACIÓN INMEDIATA. 
                        RIESGO DE BANEO ESTIMADO: 80%. HACKS/MODS: RIESGO DE BANEO PERMANENTE (40%).
                    </p>
                    <button className="w-full py-2 bg-yellow-500 text-black text-[10px] font-black rounded-lg hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20">
                        UNIRSE AL PROGRAMA
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
