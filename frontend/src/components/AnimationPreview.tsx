import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

export const AnimationPreview = ({ animation }: { animation: any[] }) => {
  useEffect(() => {
    // placeholder: animation can be implemented using Three.js Meshes and positions
  }, [animation]);

  return (
    <div style={{ width:'600px', height:'400px', border:'1px solid black' }}>
      <Canvas camera={{position:[0,0,200]}}>
        <ambientLight />
        <pointLight position={[100,100,100]} />
        {/* TODO: load CAD parts as meshes */}
      </Canvas>
    </div>
  );
};