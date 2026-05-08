import React from 'react';
import { 
  EffectComposer, 
  Bloom, 
  SMAA, 
  ToneMapping, 
  Vignette,
  Noise,
  ChromaticAberration
} from '@react-three/postprocessing';
import { N8AO } from '@react-three/postprocessing';
import { Vector2 } from 'three';
import { ToneMappingMode } from 'postprocessing';

export const GraphicsEngine = () => {
    return (
        <EffectComposer enableNormalPass={false} multisampling={4}>
            <N8AO
                intensity={1.5}
                aoRadius={1.5}
                distanceFalloff={1.0}
                quality="high"
                halfRes={false}
            />
            <Bloom 
                intensity={0.5} 
                luminanceThreshold={0.8} 
                luminanceSmoothing={0.3} 
                mipmapBlur 
            />
            <ChromaticAberration offset={new Vector2(0.001, 0.001)} />
            <Noise opacity={0.03} />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
    );
};

export const HighEndEnvironment = () => {
    return (
        <>
            <fog attach="fog" args={['#1a1b1e', 10, 150]} />
            <color attach="background" args={['#1a1b1e']} />
            
            {/* Primary Cinematic Sun */}
            <directionalLight 
                position={[50, 50, 25]} 
                intensity={1.5} 
                castShadow 
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
            />

            {/* Subtle Blue Fill Light */}
            <pointLight position={[-50, -20, -50]} intensity={2.0} color="#3b82f6" />
            
            {/* Warm Bounce Light */}
            <pointLight position={[0, -10, 0]} intensity={1.5} color="#fbbf24" />
        </>
    );
};
