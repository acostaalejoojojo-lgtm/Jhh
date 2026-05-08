import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, ContactShadows, Environment, TransformControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Save, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  Layers,
  Settings,
  User as UserIcon,
  Clock,
  Send,
  Upload,
  Zap,
  Maximize
} from 'lucide-react';
import { AvatarConfig, CustomAnimation, AnimationKeyframe, Page } from '../types';
import { VoxelCharacter } from '../components/AvatarScene';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface AnimationEditorProps {
  config: AvatarConfig;
  onSave: (animation: CustomAnimation, type: 'Idle' | 'Walk' | 'Jump') => void;
  onBack: () => void;
}

const BONES = [
  "HeadGroup",
  "Torso",
  "LeftArm",
  "RightArm",
  "LeftLeg",
  "RightLeg"
];

export const AnimationEditor: React.FC<AnimationEditorProps> = ({ config, onSave, onBack }) => {
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [keyframes, setKeyframes] = useState<AnimationKeyframe[]>([
    { time: 0, rotations: {} }
  ]);
  const [animName, setAnimName] = useState("Nueva Animación");
  const [animType, setAnimType] = useState<'Idle' | 'Walk' | 'Jump'>('Idle');

  const characterRef = useRef<THREE.Group>(null);
  const ghostSkeletonRef = useRef<THREE.Group>(null);
  const uploadedModelRef = useRef<THREE.Group>(null);
  const [uploadedModel, setUploadedModel] = useState<THREE.Group | null>(null);
  const [boneMapping, setBoneMapping] = useState<Record<string, string>>({});
  const [isMapping, setIsMapping] = useState(false);
  const lastFrameTime = useRef(0);

  // Bone Raycasting / Mapping Logic
  const autoMapBones = (model: THREE.Group) => {
    if (!characterRef.current) return;
    setIsMapping(true);
    
    const mapping: Record<string, string> = {};
    const targetBones: THREE.Object3D[] = [];
    
    model.traverse(child => {
        if (child.type === 'Bone' || child.type === 'Group' || child.type === 'Object3D') {
            targetBones.push(child);
        }
    });

    BONES.forEach(srcBoneName => {
        const srcBone = characterRef.current?.getObjectByName(srcBoneName);
        if (!srcBone) return;

        // Get world position of source bone
        const srcPos = new THREE.Vector3();
        srcBone.getWorldPosition(srcPos);

        let minDistance = Infinity;
        let bestMatch = "";

        targetBones.forEach(targetBone => {
            const targetPos = new THREE.Vector3();
            targetBone.getWorldPosition(targetPos);
            const dist = srcPos.distanceTo(targetPos);
            
            // Heuristic: Name matching boost
            let score = dist;
            if (targetBone.name.toLowerCase().includes(srcBoneName.toLowerCase().replace('group', ''))) {
                score -= 0.5; // High priority for similar names
            }

            if (score < minDistance) {
                minDistance = score;
                bestMatch = targetBone.name;
            }
        });

        if (bestMatch && minDistance < 1.0) { // Threshold for proximity
            mapping[srcBoneName] = bestMatch;
        }
    });

    setBoneMapping(mapping);
    setUploadedModel(model);
    setIsMapping(false);
    alert("Escaneo Completo: Sincronización de huesos realizada mediante Proximidad 3D.");
  };

  const syncSouls = () => {
    if (!uploadedModel || !boneMapping) return;
    
    // Normalize poses by aligning rotations
    BONES.forEach(boneName => {
        const srcBone = characterRef.current?.getObjectByName(boneName);
        const mappedName = boneMapping[boneName];
        if (srcBone && mappedName) {
            const targetBone = uploadedModel.getObjectByName(mappedName);
            if (targetBone) {
                // Apply source rotation to target bone with offset correction if needed
                targetBone.rotation.copy(srcBone.rotation);
            }
        }
    });
    alert("¡Almas Sincronizadas! El modelo nuevo ahora imita los movimientos del esqueleto de luz.");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'fbx') {
        const loader = new FBXLoader();
        loader.load(url, (fbx) => {
            fbx.scale.set(0.01, 0.01, 0.01); // Standard FBX scaling correction
            autoMapBones(fbx);
        });
    } else if (extension === 'glb' || extension === 'gltf') {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
            autoMapBones(gltf.scene);
        });
    }
  };

  // Load existing animation if it exists in config
  useEffect(() => {
    const existing = config.customAnimations?.data?.[animType];
    if (existing) {
        setAnimName(existing.name);
        setKeyframes(existing.keyframes);
        setDuration(existing.duration);
    } else {
        // Reset to default blank state
        setAnimName(`Nueva ${animType}`);
        setKeyframes([{ time: 0, rotations: {} }]);
        setDuration(2);
    }
  }, [animType]);

  // Animation Engine
  useFrame((state, delta) => {
    if (isPlaying) {
      setCurrentTime((prev) => {
        let next = prev + delta;
        if (next >= duration) next = 0;
        return next;
      });
    }

    if (characterRef.current) {
        applyAnimationAtTime(currentTime);
        
        // Sync uploaded model if mapped
        if (uploadedModel) {
            BONES.forEach(boneName => {
                const srcBone = characterRef.current?.getObjectByName(boneName);
                const mappedName = boneMapping[boneName];
                if (srcBone && mappedName) {
                    const targetBone = uploadedModel.getObjectByName(mappedName);
                    if (targetBone) {
                        targetBone.rotation.copy(srcBone.rotation);
                    }
                }
            });
        }
    }
  });

  const applyAnimationAtTime = (time: number) => {
    if (!characterRef.current) return;

    // Interpolation logic
    BONES.forEach(boneName => {
        const bone = characterRef.current?.getObjectByName(boneName);
        if (!bone) return;

        // Find surrounding keyframes
        const sorted = [...keyframes].sort((a, b) => a.time - b.time);
        let prev = [...sorted].reverse().find(k => k.time <= time);
        let next = sorted.find(k => k.time > time);

        if (!prev) prev = sorted[0];
        
        if (!next) {
            // Either at end or no next
            const rot = prev.rotations[boneName] || [0, 0, 0];
            bone.rotation.set(rot[0], rot[1], rot[2]);
        } else {
            const range = next.time - prev.time;
            const t = (time - prev.time) / range;
            const rotPrev = prev.rotations[boneName] || [0, 0, 0];
            const rotNext = next.rotations[boneName] || [0, 0, 0];

            // Use Slerp-like interpolation for rotations (simplifying with Lerp for euler since we use Euler state)
            bone.rotation.x = THREE.MathUtils.lerp(rotPrev[0], rotNext[0], t);
            bone.rotation.y = THREE.MathUtils.lerp(rotPrev[1], rotNext[1], t);
            bone.rotation.z = THREE.MathUtils.lerp(rotPrev[2], rotNext[2], t);
        }
    });
  };

  const addKeyframe = () => {
    const existing = keyframes.find(k => Math.abs(k.time - currentTime) < 0.01);
    const newRotations: any = {};
    
    if (characterRef.current) {
        BONES.forEach(boneName => {
            const bone = characterRef.current?.getObjectByName(boneName);
            if (bone) {
                newRotations[boneName] = [bone.rotation.x, bone.rotation.y, bone.rotation.z];
            }
        });
    }

    if (existing) {
        setKeyframes(keyframes.map(k => k === existing ? { ...k, rotations: newRotations } : k));
    } else {
        setKeyframes([...keyframes, { time: currentTime, rotations: newRotations }]);
    }
  };

  const removeKeyframe = (time: number) => {
    setKeyframes(keyframes.filter(k => k.time !== time));
  };

  const handleBoneRotation = (e: any) => {
      if (!selectedBone || !characterRef.current) return;
      const bone = characterRef.current.getObjectByName(selectedBone);
      if (bone) {
          // The rotation is automatically updated by TransformControls if we attach it.
          // But we want to ensure we sync it to the current time's keyframe if we're "recording"
      }
  };

  const saveAnimation = () => {
    const anim: CustomAnimation = {
        id: Math.random().toString(36).substr(2, 9),
        name: animName,
        keyframes: keyframes.sort((a, b) => a.time - b.time),
        duration: duration,
        loop: true
    };
    onSave(anim, animType);
    alert(`Animación "${animName}" guardada como ${animType}!`);
  };

  return (
    <div className="flex h-screen bg-[#1e1f22] text-white overflow-hidden font-sans select-none">
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-[#2b2d31]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="h-6 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Editor de Animación Beta</span>
            <input 
              value={animName}
              onChange={(e) => setAnimName(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm font-medium p-0"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
            {uploadedModel && (
                <button 
                    onClick={syncSouls}
                    className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all group"
                >
                    <Zap size={14} className="group-hover:scale-125 transition-transform" /> Sincronizar Almas
                </button>
            )}
            <label className="bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg cursor-pointer">
                <Upload size={14} /> Importar FBX/GLB
                <input type="file" accept=".fbx,.glb,.gltf" onChange={handleFileUpload} className="hidden" />
            </label>
            <select 
                value={animType}
                onChange={(e) => setAnimType(e.target.value as any)}
                className="bg-[#313338] border border-white/10 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
                <option value="Idle">Reposo (Idle)</option>
                <option value="Walk">Caminar (Walk)</option>
                <option value="Jump">Saltar (Jump)</option>
            </select>
            <button 
                onClick={saveAnimation}
                className="bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
            >
                <Save size={14} /> Guardar
            </button>
        </div>
      </div>

      {/* Left Sidebar: Hierarchy (Limbs) */}
      <div className="w-64 bg-[#2b2d31] border-r border-white/5 pt-16 flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between text-gray-400 border-b border-white/5">
            <div className="flex items-center gap-2">
                <Layers size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Huesos / Partes</span>
            </div>
            <button className="p-1 hover:text-white transition-colors">
                <Plus size={14} />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
            {BONES.map(bone => (
                <button
                    key={bone}
                    onClick={() => setSelectedBone(bone)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all mb-1 flex items-center justify-between group ${
                        selectedBone === bone 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'hover:bg-white/5 text-gray-400'
                    }`}
                >
                    <span>{bone}</span>
                    <Settings 
                        size={12} 
                        className={`opacity-0 group-hover:opacity-100 transition-opacity ${selectedBone === bone ? 'opacity-100' : ''}`} 
                    />
                </button>
            ))}
        </div>
        
        {/* Helper text like Prisma 3D */}
        <div className="p-4 text-[10px] text-gray-500 italic bg-black/10">
            Prisma 3D Clone Style: Selecciona una parte para rotarla. Los cambios se guardan como keyframes.
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative">
        <Canvas shadows gl={{ antialias: true }}>
            <PerspectiveCamera makeDefault position={[3, 2, 5]} fov={50} />
            <OrbitControls 
                makeDefault 
                enabled={!selectedBone} 
                target={[0, 1.5, 0]}
            />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
            <Environment preset="city" />
            
            <group position={[0, 0, 0]}>
                <group ref={characterRef}>
                    {/* Ghost Skeleton Shell */}
                    <mesh position={[0, 0.45, 0]}>
                        <boxGeometry args={[0.6, 0.9, 0.3]} />
                        <meshStandardMaterial color="#3b82f6" transparent opacity={0.15} wireframe />
                    </mesh>
                    <VoxelCharacter config={config} isEditor={true} onBoneClick={setSelectedBone} />
                </group>
                
                {uploadedModel && (
                    <primitive object={uploadedModel} position={[0, 0, 0]} />
                )}

                {selectedBone && characterRef.current && (
                    <TransformControls 
                        object={characterRef.current.getObjectByName(selectedBone)}
                        mode="rotate"
                        onMouseUp={addKeyframe}
                    />
                )}
            </group>

            <Grid 
                infiniteGrid 
                sectionSize={1} 
                sectionColor="#313338" 
                cellColor="#232428" 
                position={[0, 0, 0]} 
            />
            <ContactShadows opacity={0.4} scale={10} blur={2} far={10} />
        </Canvas>

        {/* Viewport Overlay Controls */}
        <div className="absolute top-20 right-6 flex flex-col gap-2">
            <button 
                onClick={() => setSelectedBone(null)}
                className="bg-white/5 hover:bg-white/10 p-2 rounded-full backdrop-blur-md border border-white/10"
            >
                <RotateCcw size={20} />
            </button>
        </div>
      </div>

      {/* Bottom Timeline */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-[#2b2d31]/90 backdrop-blur-xl border-t border-white/5 flex flex-col">
        {/* Playback Controls */}
        <div className="h-12 border-b border-white/5 flex items-center px-6 gap-6">
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isPlaying ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                >
                    {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="flex items-center gap-1 font-mono text-xs">
                    <span className="text-white">{currentTime.toFixed(2)}s</span>
                    <span className="text-gray-500">/</span>
                    <span className="text-gray-500">{duration.toFixed(1)}s</span>
                </div>
            </div>

            <div className="h-6 w-px bg-white/10" />

            <div className="flex items-center gap-4">
                <button 
                    onClick={addKeyframe}
                    className="bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border border-white/10 transition-all active:scale-95"
                >
                    <Plus size={12} /> Keyframe
                </button>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase">
                    Duración
                    <input 
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        step={0.5}
                        min={0.5}
                        max={10}
                        className="w-12 bg-[#1e1f22] border border-white/10 rounded px-1 text-white text-center focus:outline-none"
                    />
                </div>
            </div>
            
            <div className="flex-1" />
            
            <button 
                onClick={() => setKeyframes([{ time: 0, rotations: {} }])}
                className="text-red-400 hover:text-red-300 transition-colors"
                title="Limpiar todo"
            >
                <Trash2 size={16} />
            </button>
        </div>

        {/* Timeline Track */}
        <div className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar bg-black/20">
            {/* Markers */}
            <div className="absolute inset-0 flex">
                {Array.from({ length: Math.ceil(duration * 10) + 1 }).map((_, i) => (
                    <div 
                        key={i} 
                        className={`border-l border-white/5 h-full ${i % 10 === 0 ? 'opacity-40' : 'opacity-10'}`}
                        style={{ minWidth: '40px' }}
                    >
                        {i % 10 === 0 && <span className="text-[8px] ml-1 text-gray-500">{(i / 10).toFixed(0)}s</span>}
                    </div>
                ))}
            </div>

            {/* Keyframes Track */}
            <div className="absolute inset-x-0 h-10 top-12 flex items-center px-[20px]">
                {keyframes.map((kf, i) => (
                    <button
                        key={i}
                        onClick={() => setCurrentTime(kf.time)}
                        onContextMenu={(e) => { e.preventDefault(); removeKeyframe(kf.time); }}
                        className="absolute w-3 h-3 bg-blue-500 border border-white rounded-sm rotate-45 transform -translate-x-1/2 hover:scale-125 transition-transform shadow-lg"
                        style={{ left: `${(kf.time / duration) * 100}%` }}
                        title={`Keyframe at ${kf.time.toFixed(2)}s. Click derecho para borrar.`}
                    />
                ))}
            </div>

            {/* Scrubber */}
            <input 
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={(e) => setCurrentTime(Number(e.target.value))}
                className="absolute inset-x-0 top-0 h-full opacity-0 cursor-pointer z-10"
            />
            <div 
                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-0 pointer-events-none shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                style={{ left: `${(currentTime / duration) * 100}%` }}
            >
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-400 rounded-full" />
            </div>
        </div>
      </div>
    </div>
  );
};
