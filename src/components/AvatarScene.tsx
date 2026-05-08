import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, ContactShadows, Environment, useGLTF, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ImportedModel, CustomAvatarSwitcher } from './ModelLoaders';
import { AvatarConfig } from '../types';
import { GraphicsEngine } from './GraphicsEngine';

import ErrorBoundary from './ErrorBoundary';

const BONES = [
  "HeadGroup",
  "Torso",
  "LeftArm",
  "RightArm",
  "LeftLeg",
  "RightLeg"
];

// --- ACCESSORY LOADERS ---

const AccessoryFBX = ({ url, position, scale }: { url: string; position: any; scale: any }) => {
  const fbx = useLoader(FBXLoader, url);
  const clone = React.useMemo(() => fbx.clone(), [fbx]);
  return <primitive object={clone} position={position} scale={scale} />;
};

const AccessoryGLTF = ({ url, position, scale }: { url: string; position: any; scale: any }) => {
  const { scene } = useGLTF(url);
  const clone = React.useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} position={position} scale={scale} />;
};

const AccessoryModel = ({ url, position, scale }: { url: string; position: any; scale: any }) => {
  if (!url) return null;
  const isFbx = url.includes('#fbx');
  const cleanUrl = url.replace('#fbx', '');
  
  // Check extension
  const isImage = cleanUrl.toLowerCase().endsWith('.jpg') || cleanUrl.toLowerCase().endsWith('.png') || cleanUrl.toLowerCase().endsWith('.jpeg');
  if (isImage) {
      return null;
  }

  if (isFbx) {
    return <AccessoryFBX url={cleanUrl} position={position} scale={scale} />;
  }
  return <AccessoryGLTF url={cleanUrl} position={position} scale={scale} />;
};

// --- HEAD COMPONENTS ---

const TexturedHead = ({ url, materialProps }: { url: string; materialProps: any }) => {
  return (
    <ErrorBoundary fallback={<ColoredHead color={materialProps.color || "#F5CD30"} materialProps={materialProps} />}>
      <Suspense fallback={<ColoredHead color={materialProps.color || "#F5CD30"} materialProps={materialProps} />}>
        <HeadTextureLoader url={url} materialProps={materialProps} />
      </Suspense>
    </ErrorBoundary>
  );
};

const HeadTextureLoader = ({ url, materialProps }: { url: string; materialProps: any }) => {
  const texture = useTexture(url);
  return (
    <mesh name="Head">
      <cylinderGeometry args={[0.35, 0.35, 0.7, 32]} />
      <meshStandardMaterial map={texture} color="white" {...materialProps} transparent />
    </mesh>
  );
};

const ColoredHead = ({ color, materialProps }: { color: string; materialProps: any }) => {
  return (
    <mesh name="Head">
      <cylinderGeometry args={[0.35, 0.35, 0.7, 32]} />
      <meshStandardMaterial color={color} {...materialProps} />
    </mesh>
  );
};

const VideoHead = ({ url, materialProps }: { url: string; materialProps: any }) => {
    const [video, setVideo] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!url) {
            setVideo(null);
            return;
        }

        const v = document.createElement('video');
        v.src = url;
        v.crossOrigin = "anonymous";
        v.loop = true;
        v.muted = true;
        v.playsInline = true; // Important for some browsers
        
        const playVideo = async () => {
            try {
                await v.play();
                setVideo(v);
            } catch (err) {
                console.warn("Video face failed to play:", err);
                // Fallback: don't set video so it shows the colored head
            }
        };

        playVideo();

        return () => {
            v.pause();
            v.src = "";
            v.load();
            setVideo(null);
        };
    }, [url]);

    if (!video) return null;

    return (
        <mesh name="Head">
            <cylinderGeometry args={[0.35, 0.35, 0.7, 32]} />
            <meshStandardMaterial {...materialProps} transparent>
                <videoTexture attach="map" args={[video]} />
            </meshStandardMaterial>
        </mesh>
    );
};

interface CharacterProps {
  config: AvatarConfig;
  position?: [number, number, number];
  rotation?: [number, number, number];
  isMoving?: boolean;
  isJumping?: boolean;
  weaponEquipped?: boolean; // New: Weapon holding animation
  selectedAnimation?: string; // New: Selected animation from menu
  username?: string; // New prop for Name Tag
  isEditor?: boolean; // New: Disable automatic animations for the editor
  onBoneClick?: (boneName: string) => void; // New: Click on bone to select in editor
}

const Shirt = ({ url }: { url: string }) => {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <ShirtTextureLoader url={url} />
      </Suspense>
    </ErrorBoundary>
  );
};

const ShirtTextureLoader = ({ url }: { url: string }) => {
  const texture = useTexture(url);
  return (
    <mesh position={[0, 0, 0.26]}>
      <planeGeometry args={[0.8, 0.8]} />
      <meshBasicMaterial color="white" map={texture} transparent />
    </mesh>
  );
};

export const VoxelCharacter = ({ config, position = [0, 0, 0], rotation = [0, 0, 0], isMoving = false, isJumping = false, weaponEquipped = false, selectedAnimation, username, isEditor, onBoneClick }: CharacterProps) => {
  const group = useRef<THREE.Group>(null);
  const lightningRef = useRef<THREE.Group>(null);
  const [showLightning, setShowLightning] = useState(true);
  
  // Appearance lightning effect
  useEffect(() => {
    setShowLightning(true);
    const timer = setTimeout(() => setShowLightning(false), 2000);
    return () => clearTimeout(timer);
  }, [config.customModelUrl]);

  useFrame((state, delta) => {
    if (lightningRef.current) {
        lightningRef.current.rotation.y += delta * 10;
        const s = 1 + Math.sin(state.clock.elapsedTime * 20) * 0.2;
        lightningRef.current.scale.set(s, s, s);
    }
    
    if (group.current && !config.customModelUrl) {
      if (isEditor) return; 
      
      const t = state.clock.getElapsedTime();
      
      // Get Object References
      const leftArm = group.current.getObjectByName("LeftArm");
      const rightArm = group.current.getObjectByName("RightArm");
      const leftLeg = group.current.getObjectByName("LeftLeg");
      const rightLeg = group.current.getObjectByName("RightLeg");
      const headGroup = group.current.getObjectByName("HeadGroup");
      const torso = group.current.getObjectByName("Torso");

      // Reset base positions/rotations if not managed
      if (torso) { torso.rotation.y = 0; torso.rotation.z = 0; torso.position.y = 0.8; }
      if (headGroup) { headGroup.rotation.y = 0; headGroup.position.y = 1.6; }

      // CHECK FOR CUSTOM KEYFRAMED ANIMATIONS FIRST
      const customAnimType = isJumping ? 'Jump' : isMoving ? 'Walk' : 'Idle';
      const customAnim = config.customAnimations?.data?.[customAnimType];

      if (customAnim && customAnim.keyframes.length > 0) {
        const duration = customAnim.duration;
        const time = (t % duration);
        
        BONES.forEach(boneName => {
          const bone = group.current?.getObjectByName(boneName);
          if (!bone) return;

          const keyframes = customAnim.keyframes;
          let prev = [...keyframes].reverse().find(k => k.time <= time);
          let next = keyframes.find(k => k.time > time);

          if (!prev) prev = keyframes[0];
          
          if (!next) {
            const rot = prev.rotations[boneName] || [0, 0, 0];
            bone.rotation.set(rot[0], rot[1], rot[2]);
          } else {
            const range = next.time - prev.time;
            const factor = (time - prev.time) / range;
            const rotPrev = prev.rotations[boneName] || [0, 0, 0];
            const rotNext = next.rotations[boneName] || [0, 0, 0];
            bone.rotation.x = THREE.MathUtils.lerp(rotPrev[0], rotNext[0], factor);
            bone.rotation.y = THREE.MathUtils.lerp(rotPrev[1], rotNext[1], factor);
            bone.rotation.z = THREE.MathUtils.lerp(rotPrev[2], rotNext[2], factor);
          }
        });
        return;
      }

      // If we have an emote selected
      const currentEmote = config.customAnimations?.emotes?.find(e => e.id === selectedAnimation);
      if (currentEmote) {
          // Play sound if exists
          if (currentEmote.soundUrl) {
              // Usually we'd want to throttle this or check if already playing
          }
          // Simple procedural "Emote" if it's just a name
          if (currentEmote.name.toLowerCase().includes('baile')) {
               selectedAnimation = 'Dance';
          }
      }

      if (isJumping) {
         // JUMP ANIMATION
         if (leftArm) { leftArm.rotation.x = 2.5; leftArm.rotation.z = 0.5; }
         if (rightArm) { rightArm.rotation.x = 2.5; rightArm.rotation.z = -0.5; }
         if (leftLeg) { leftLeg.rotation.x = 0.5; leftLeg.rotation.z = 0.2; }
         if (rightLeg) { rightLeg.rotation.x = 0.5; rightLeg.rotation.z = -0.2; }
      } 
      else if (weaponEquipped) {
          // WEAPON HOLDING ANIMATION (Shooter)
          const speed = 10;
          const swingRange = 0.4;
          const isShooting = (window as any).isLocalShooting;

          if (isShooting) {
              // Recoil/Shoot pose
              if (leftArm) { leftArm.rotation.x = 1.6; leftArm.rotation.z = 0.6; }
              if (rightArm) { rightArm.rotation.x = 1.6; rightArm.rotation.z = -0.1; }
          } else {
              // Aiming pose
              if (leftArm) { leftArm.rotation.x = 1.4; leftArm.rotation.z = 0.5; }
              if (rightArm) { rightArm.rotation.x = 1.2; rightArm.rotation.z = -0.2; }
          }
          
          if (isMoving) {
              if (leftLeg) leftLeg.rotation.x = Math.sin(t * speed + Math.PI) * swingRange;
              if (rightLeg) rightLeg.rotation.x = Math.sin(t * speed) * swingRange;
          } else {
              if (leftLeg) { leftLeg.rotation.x = 0; leftLeg.rotation.z = 0; }
              if (rightLeg) { rightLeg.rotation.x = 0; rightLeg.rotation.z = 0; }
          }
      }
      else if (isMoving) {
        // WALK ANIMATION
        const speed = 10;
        const swingRange = 0.8;
        if (leftArm) leftArm.rotation.x = Math.sin(t * speed) * swingRange;
        if (rightArm) rightArm.rotation.x = Math.sin(t * speed + Math.PI) * swingRange;
        if (leftLeg) leftLeg.rotation.x = Math.sin(t * speed + Math.PI) * swingRange;
        if (rightLeg) rightLeg.rotation.x = Math.sin(t * speed) * swingRange;
        
        if (leftArm) leftArm.rotation.z = 0;
        if (rightArm) rightArm.rotation.z = 0;
        if (leftLeg) leftLeg.rotation.z = 0;
        if (rightLeg) rightLeg.rotation.z = 0;
        if (torso) torso.rotation.z = Math.cos(t * speed) * 0.05;
      } 
      else if (selectedAnimation === 'Dance') {
          // DANCE ANIMATION
          const speed = 8;
          if (leftArm) { leftArm.rotation.x = Math.sin(t * speed) * 1.5; leftArm.rotation.z = 0.5; }
          if (rightArm) { rightArm.rotation.x = Math.sin(t * speed + Math.PI) * 1.5; rightArm.rotation.z = -0.5; }
          if (leftLeg) leftLeg.rotation.x = Math.sin(t * speed + Math.PI) * 0.5;
          if (rightLeg) rightLeg.rotation.x = Math.sin(t * speed) * 0.5;
          if (torso) torso.rotation.z = Math.sin(t * speed) * 0.2;
      }
      else if (selectedAnimation === 'Wave') {
          // WAVE ANIMATION
          if (rightArm) { rightArm.rotation.x = 2.5; rightArm.rotation.z = -0.5 + Math.sin(t * 10) * 0.5; }
          if (leftArm) { leftArm.rotation.x = 0.2; leftArm.rotation.z = 0.2; }
      }
      else if (selectedAnimation === 'Sit') {
          // SIT ANIMATION
          if (leftLeg) { leftLeg.rotation.x = -1.5; leftLeg.rotation.z = 0.2; }
          if (rightLeg) { rightLeg.rotation.x = -1.5; rightLeg.rotation.z = -0.2; }
          if (leftArm) { leftArm.rotation.x = 0.5; leftArm.rotation.z = 0.2; }
          if (rightArm) { rightArm.rotation.x = 0.5; rightArm.rotation.z = -0.2; }
          if (group.current) group.current.position.y = position[1] - 0.5;
      }
      else {
        // IDLE ANIMATION
        const breathe = Math.sin(t * 1.5);
        if (headGroup) headGroup.position.y = 1.6 + breathe * 0.005;
        if (torso) torso.position.y = 0.8 + breathe * 0.005;
        if (leftArm) { leftArm.rotation.x = breathe * 0.02; leftArm.rotation.z = 0.15; }
        if (rightArm) { rightArm.rotation.x = breathe * 0.02; rightArm.rotation.z = -0.15; }
        if (leftLeg) { leftLeg.rotation.x = 0; leftLeg.rotation.z = 0; }
        if (rightLeg) { rightLeg.rotation.x = 0; rightLeg.rotation.z = 0; }
        if (group.current) group.current.position.y = position[1];
      }
    }
  });

  if (config.invisible) return null;

  if (config.customModelUrl) {
    return (
      <ErrorBoundary fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
        <Suspense fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="gray" wireframe /></mesh>}>
          <CustomAvatarSwitcher 
            modelUrl={config.customModelUrl} 
            idleUrl={config.customAnimations?.idleUrl}
            walkUrl={config.customAnimations?.walkUrl}
            jumpUrl={config.customAnimations?.jumpUrl}
            emote1Url={config.customAnimations?.emote1Url}
            emotes={config.customAnimations?.emotes}
            isMoving={isMoving}
            isJumping={isJumping}
            selectedAnimation={selectedAnimation}
            targetHeight={3} 
          />
        </Suspense>
      </ErrorBoundary>
    );
  }


  const materialProps = { 
    roughness: 0.3, 
    metalness: 0.1,
    envMapIntensity: 1.5
  };

  return (
    <group ref={group} position={new THREE.Vector3(...position)} rotation={new THREE.Euler(...rotation)} dispose={null}>
      {/* Lightning Appearance Effect */}
      {showLightning && (
        <group ref={lightningRef} position={[0, 1.5, 0]}>
            <mesh scale={[1, 4, 1]}>
               <cylinderGeometry args={[0.05, 0.5, 1, 4]} />
               <meshBasicMaterial color="#00f2ff" transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]} scale={[0.8, 3.5, 0.8]}>
               <cylinderGeometry args={[0.05, 0.4, 1, 4]} />
               <meshBasicMaterial color="white" transparent opacity={0.8} />
            </mesh>
            <pointLight distance={3} intensity={40} color="#00f2ff" />
        </group>
      )}

      {/* Name Tag */}
      {username && (
         <group position={[0, 3.2, 0]}>
            <Text
              fontSize={0.4}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.04}
              outlineColor="black"
            >
              {username}
            </Text>
         </group>
      )}

      {/* Head Group */}
      <group position={[0, 1.6, 0]} name="HeadGroup" onClick={() => onBoneClick?.("HeadGroup")}>
        
        {config.faceVideoUrl ? (
            <VideoHead url={config.faceVideoUrl} materialProps={materialProps} />
        ) : config.faceTextureUrl ? (
          <React.Suspense fallback={<ColoredHead color={config.bodyColors.head} materialProps={materialProps} />}>
             <TexturedHead url={config.faceTextureUrl} materialProps={materialProps} />
          </React.Suspense>
        ) : (
             <ColoredHead color={config.bodyColors.head} materialProps={materialProps} />
        )}

        {!config.faceTextureUrl && !config.hideFace && (
          <group>
             {/* Square Eyes for Voxel Look */}
             <mesh position={[0.15, 0.05, 0.3]}>
                 <boxGeometry args={[0.08, 0.08, 0.02]} />
                 <meshBasicMaterial color="black" />
             </mesh>
             <mesh position={[-0.15, 0.05, 0.3]}>
                 <boxGeometry args={[0.08, 0.08, 0.02]} />
                 <meshBasicMaterial color="black" />
             </mesh>
             {/* Rectangular Mouth */}
             <mesh position={[0, -0.15, 0.3]}>
                 <boxGeometry args={[0.15, 0.04, 0.02]} />
                 <meshBasicMaterial color="black" />
             </mesh>
          </group>
        )}

        {config.accessories.hatModelUrl && (
          <React.Suspense fallback={null}>
            <AccessoryModel 
              url={config.accessories.hatModelUrl} 
              position={config.accessories.hatTransform?.position || [0, 0.4, 0]} 
              scale={config.accessories.hatTransform?.scale || [0.8, 0.8, 0.8]} 
            />
          </React.Suspense>
        )}
      </group>

      {/* Torso */}
      <mesh position={[0, 0.8, 0]} name="Torso" castShadow receiveShadow onClick={() => onBoneClick?.("Torso")}>
        <boxGeometry args={[1, 1, 0.5]} />
        <meshStandardMaterial color={config.bodyColors.torso} {...materialProps} />
        {config.accessories.shirtTextureUrl && (
           <React.Suspense fallback={null}>
              <Shirt url={config.accessories.shirtTextureUrl} />
           </React.Suspense>
        )}
      </mesh>

      {/* Left Arm */}
      <mesh position={[-0.75, 0.8, 0]} name="LeftArm" castShadow receiveShadow onClick={() => onBoneClick?.("LeftArm")}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial color={config.bodyColors.leftArm} {...materialProps} />
      </mesh>

      {/* Right Arm */}
      <mesh position={[0.75, 0.8, 0]} name="RightArm" castShadow receiveShadow onClick={() => onBoneClick?.("RightArm")}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial color={config.bodyColors.rightArm} {...materialProps} />
        {weaponEquipped && (
            <mesh position={[0, -0.5, 0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.15, 0.8, 0.2]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        )}
      </mesh>

      {/* Left Leg */}
      <mesh position={[-0.26, -0.2, 0]} name="LeftLeg" castShadow receiveShadow onClick={() => onBoneClick?.("LeftLeg")}>
        <boxGeometry args={[0.48, 1, 0.5]} />
        <meshStandardMaterial color={config.bodyColors.leftLeg} {...materialProps} />
      </mesh>

      {/* Right Leg */}
      <mesh position={[0.26, -0.2, 0]} name="RightLeg" castShadow receiveShadow onClick={() => onBoneClick?.("RightLeg")}>
        <boxGeometry args={[0.48, 1, 0.5]} />
        <meshStandardMaterial color={config.bodyColors.rightLeg} {...materialProps} />
      </mesh>
    </group>
  );
};

interface AvatarSceneProps {
  config?: AvatarConfig;
  interactive?: boolean;
  globalAvatar?: { url: string; isFbx: boolean };
  selectedAnimation?: string;
}

export const AvatarScene: React.FC<AvatarSceneProps> = ({ config, interactive = true, globalAvatar, selectedAnimation: propSelectedAnimation }) => {
  const defaultConfig: AvatarConfig = {
    bodyColors: {
      head: '#F5CD30', torso: '#0047AB', leftArm: '#F5CD30',
      rightArm: '#F5CD30', leftLeg: '#A2C429', rightLeg: '#A2C429'
    },
    faceTextureUrl: null,
    accessories: { hatModelUrl: null, shirtTextureUrl: null },
    hideFace: false,
    selectedAnimation: 'Idle'
  };

  const activeConfig = config || defaultConfig;
  const activeAnimation = propSelectedAnimation || activeConfig.selectedAnimation;

  return (
    <div className="w-full h-full min-h-[300px] relative bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden border border-gray-700">
      <div className="absolute top-2 left-2 z-10 bg-black/50 px-2 py-1 rounded text-xs font-bold text-white uppercase tracking-wider">
        Vista 3D
      </div>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 1, 4]} fov={50} />
        <ambientLight intensity={0.7} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        <group position={[0, -0.5, 0]}>
            <ErrorBoundary fallback={<mesh><boxGeometry args={[1,1,1]} /><meshStandardMaterial color="red" wireframe /></mesh>}>
                <React.Suspense fallback={null}>
                   {globalAvatar?.url ? (
                       <ImportedModel url={globalAvatar.url} isFbx={globalAvatar.isFbx} isPlaying={true} targetHeight={3} selectedAnimation={activeAnimation} />
                   ) : (
                       <VoxelCharacter config={activeConfig} selectedAnimation={activeAnimation} />
                   )}
                </React.Suspense>
            </ErrorBoundary>
            <ContactShadows resolution={1024} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
        </group>
        <OrbitControls enablePan={false} enableZoom={interactive} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 1.5} />
        <Environment preset="city" />
        <GraphicsEngine />
      </Canvas>
    </div>
  );
};
