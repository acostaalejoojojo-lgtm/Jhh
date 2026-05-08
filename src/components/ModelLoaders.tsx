import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { AnimationMixer } from 'three';

export const ModelGLTFInternal = ({ url, isPlaying, selectedAnimation, onAnimationsLoaded, targetHeight = 3 }: { 
  url: string; 
  isPlaying?: boolean; 
  selectedAnimation?: string;
  onAnimationsLoaded?: (names: string[]) => void;
  targetHeight?: number;
}) => {
  const { scene, animations } = useGLTF(url);
  const mixer = useRef<AnimationMixer | null>(null);
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene]);

  useEffect(() => {
    if (clone) {
      clone.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.envMapIntensity = 2.0;
          }
        }
      });
    }
  }, [clone]);

  useEffect(() => {
    if (animations?.length && onAnimationsLoaded) {
      onAnimationsLoaded(animations.map(a => a.name));
    }
  }, [animations, onAnimationsLoaded]);

  useEffect(() => {
    if (clone && animations?.length) {
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 0) {
        const scale = targetHeight / size.y;
        clone.scale.set(scale, scale, scale);
      }

      if (isPlaying || selectedAnimation) {
        if (!mixer.current) mixer.current = new AnimationMixer(clone);
        mixer.current.stopAllAction();
        const animToPlay = selectedAnimation 
          ? animations.find(a => a.name === selectedAnimation) || animations[0]
          : animations[0];
        if (animToPlay) {
            const action = mixer.current.clipAction(animToPlay);
            action.reset().fadeIn(0.2).play();
        }
      } else {
        mixer.current?.stopAllAction();
      }
    }
  }, [clone, isPlaying, animations, selectedAnimation, targetHeight]);

  useFrame((state, delta) => {
    mixer.current?.update(delta);
  });

  return <primitive object={clone} />;
};

export const ModelGLTF = ({ url, isPlaying, selectedAnimation, onAnimationsLoaded, targetHeight = 3 }: { 
    url: string; 
    isPlaying?: boolean; 
    selectedAnimation?: string; 
    onAnimationsLoaded?: (names: string[]) => void;
    targetHeight?: number;
  }) => {
    const [error, setError] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState(false);
  
    useEffect(() => {
      let isMounted = true;
      const checkUrl = async () => {
        if (!url) return;
        try {
          // Use fetch to check if the file exists and is not an HTML error page
          // Also check for binary header if it's a small fetch to avoid "PK" (ZIP) issues with GLTF JSON loader
          const response = await fetch(url);
          if (!isMounted) return;

          if (!response.ok) {
            setError(`Error: El archivo no existe (${response.status})`);
            return;
          }

          const contentType = response.headers.get('Content-Type');
          if (contentType && contentType.includes('text/html')) {
            setError("Error: El servidor devolvió HTML en lugar de un modelo 3D");
            return;
          }

          // Peek at start of file for "PK" (ZIP/corrupted) or "glTF"
          const reader = response.body?.getReader();
          if (reader) {
             const { value } = await reader.read();
             if (value && value.length >= 2) {
                const header = String.fromCharCode(value[0], value[1]);
                if (header === 'PK') {
                   // This is a zip/fbx binary/corrupted gltf
                   // If it's a .glb, it should start with "glTF"
                   if (url.toLowerCase().endsWith('.glb') || url.toLowerCase().endsWith('.gltf')) {
                       // GLB starts with "glTF" (0x67 0x6C 0x54 0x46)
                       const gltfHeader = String.fromCharCode(value[0], value[1], value[2], value[3]);
                       if (gltfHeader !== 'glTF' && !url.toLowerCase().endsWith('.gltf')) {
                          setError("Error: El archivo GLB parece estar corrupto (Cabecera PK detectada)");
                          return;
                       }
                   }
                }
             }
             reader.releaseLock();
          }

          setIsVerified(true);
        } catch (e) {
          if (isMounted) setError("Error de red al cargar el modelo");
        }
      };
      
      setIsVerified(false);
      setError(null);
      checkUrl();
      
      return () => { isMounted = false; };
    }, [url]);
  
    if (error) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="red" wireframe />
        </mesh>
      );
    }

    if (!isVerified) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="gray" wireframe />
        </mesh>
      );
    }
  
    return (
      <Suspense fallback={<mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh>}>
        <ModelGLTFInternal url={url} isPlaying={isPlaying} selectedAnimation={selectedAnimation} onAnimationsLoaded={onAnimationsLoaded} targetHeight={targetHeight} />
      </Suspense>
    );
  };

export const ModelFBXInternal = ({ url, isPlaying, selectedAnimation, onAnimationsLoaded, targetHeight = 3 }: { 
  url: string; 
  isPlaying?: boolean; 
  selectedAnimation?: string;
  onAnimationsLoaded?: (names: string[]) => void;
  targetHeight?: number;
}) => {
  const fbx = useLoader(FBXLoader, url);
  const mixer = useRef<AnimationMixer | null>(null);
  const clone = React.useMemo(() => SkeletonUtils.clone(fbx), [fbx]);

  useEffect(() => {
    if (clone) {
      clone.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.envMapIntensity = 2.0;
          }
        }
      });
    }
  }, [clone]);

  useEffect(() => {
    if ((fbx as any)?.animations?.length && onAnimationsLoaded) {
      onAnimationsLoaded((fbx as any).animations.map((a: any) => a.name));
    }
  }, [fbx, onAnimationsLoaded]);

  useEffect(() => {
    if (clone && (fbx as any)?.animations?.length) {
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 0) {
        const scale = targetHeight / size.y;
        clone.scale.set(scale, scale, scale);
      }

      if (isPlaying || selectedAnimation) {
        if (!mixer.current) mixer.current = new AnimationMixer(clone);
        mixer.current.stopAllAction();
        const animations = (fbx as any).animations;
        const animToPlay = selectedAnimation 
          ? animations.find((a: any) => a.name === selectedAnimation) || animations[0]
          : animations[0];
        if (animToPlay) {
            const action = mixer.current.clipAction(animToPlay);
            action.reset().fadeIn(0.2).play();
        }
      } else {
        mixer.current?.stopAllAction();
      }
    }
  }, [clone, isPlaying, fbx, selectedAnimation, targetHeight]);

  useFrame((state, delta) => {
    mixer.current?.update(delta);
  });

  return <primitive object={clone} />;
};

export const ModelFBX = ({ url, isPlaying, selectedAnimation, onAnimationsLoaded, targetHeight = 3 }: { 
  url: string; 
  isPlaying?: boolean; 
  selectedAnimation?: string;
  onAnimationsLoaded?: (names: string[]) => void;
  targetHeight?: number;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkUrl = async () => {
      if (!url) return;
      try {
        const response = await fetch(url);
        if (!isMounted) return;

        if (!response.ok) {
          setError(`Error: El archivo no existe (${response.status})`);
          return;
        }

        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('text/html')) {
          setError("Error: El servidor devolvió HTML en lugar de un modelo 3D");
          return;
        }

        // Peek at start of file
        const reader = response.body?.getReader();
        if (reader) {
           const { value } = await reader.read();
           if (value && value.length >= 2) {
              const header = String.fromCharCode(value[0], value[1]);
              if (header !== 'Ka' && header !== 'PK' && !url.toLowerCase().endsWith('.fbx')) {
                 // FBX usually starts with "Kaydara FBX Binary" ('Ka') or is text or zip (PK)
                 // This is a relaxed check but helps catch obvious non-binary files
              }
           }
           reader.releaseLock();
        }

        setIsVerified(true);
      } catch (e) {
        if (isMounted) setError("Error de red al cargar el modelo");
      }
    };
    
    setIsVerified(false);
    setError(null);
    checkUrl();
    
    return () => { isMounted = false; };
  }, [url]);

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="red" wireframe />
      </mesh>
    );
  }

  if (!isVerified) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="gray" wireframe />
      </mesh>
    );
  }

  return (
    <Suspense fallback={<mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="gray" wireframe /></mesh>}>
      <ModelFBXInternal url={url} isPlaying={isPlaying} selectedAnimation={selectedAnimation} onAnimationsLoaded={onAnimationsLoaded} targetHeight={targetHeight} />
    </Suspense>
  );
};

export const ImportedModel = ({ url, isFbx, isPlaying, selectedAnimation, onAnimationsLoaded, targetHeight = 3 }: { 
  url: string; 
  isFbx?: boolean; 
  isPlaying?: boolean;
  selectedAnimation?: string;
  onAnimationsLoaded?: (names: string[]) => void;
  targetHeight?: number;
}) => {
  if (!url) return null;
  const isActuallyFbx = isFbx || url.includes('#fbx');
  const cleanUrl = url.replace('#fbx', '');

  if (isActuallyFbx) {
    return <ModelFBX url={cleanUrl} isPlaying={isPlaying} selectedAnimation={selectedAnimation} onAnimationsLoaded={onAnimationsLoaded} targetHeight={targetHeight} />;
  }
  return <ModelGLTF url={cleanUrl} isPlaying={isPlaying} selectedAnimation={selectedAnimation} onAnimationsLoaded={onAnimationsLoaded} targetHeight={targetHeight} />;
};

export const CustomAvatarSwitcher = ({ 
  modelUrl, 
  idleUrl, 
  walkUrl, 
  jumpUrl, 
  emote1Url,
  emotes = [],
  isMoving, 
  isJumping,
  selectedAnimation,
  targetHeight = 3 
}: { 
  modelUrl: string;
  idleUrl?: string | null;
  walkUrl?: string | null;
  jumpUrl?: string | null;
  emote1Url?: string | null;
  emotes?: any[];
  isMoving?: boolean;
  isJumping?: boolean;
  selectedAnimation?: string;
  targetHeight?: number;
}) => {
  // Use the specific animation URL based on state
  let currentAnimUrl = idleUrl || modelUrl;
  let isFbxHint = modelUrl.includes('#fbx');

  const emote = emotes.find(e => e.id === selectedAnimation);

  if (emote) {
    currentAnimUrl = emote.animationUrl;
    isFbxHint = emote.animationUrl.includes('#fbx');
  } else if (selectedAnimation === 'emote1' && emote1Url) {
    currentAnimUrl = emote1Url;
    isFbxHint = emote1Url.includes('#fbx') || isFbxHint;
  } else if (isJumping && jumpUrl) {
    currentAnimUrl = jumpUrl;
    isFbxHint = jumpUrl.includes('#fbx') || isFbxHint;
  } else if (isMoving && walkUrl) {
    currentAnimUrl = walkUrl;
    isFbxHint = walkUrl.includes('#fbx') || isFbxHint;
  } else if (idleUrl) {
    isFbxHint = idleUrl.includes('#fbx') || isFbxHint;
  }

  return <ImportedModel url={currentAnimUrl} isFbx={isFbxHint} isPlaying={true} targetHeight={targetHeight} />;
};
