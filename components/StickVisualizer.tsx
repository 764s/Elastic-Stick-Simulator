
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Grid, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Stick } from '../classes/Stick';
import { ElasticProperties, Vector3 as IVector3, SwingMode } from '../types';

// --- Types & Interfaces ---

interface StickVisualizerProps {
  stick: Stick;
  swingMode: SwingMode;
  manualPos: { x: number; y: number };
  elasticProps: ElasticProperties;
  length: number;
  timeScale: number;
}

// --- Animation Engine ---

type Keyframe = { t: number; v: [number, number, number] }; // Time, Euler(x,y,z) Degrees
type Track = Keyframe[];
type AnimationClip = {
  duration: number;
  loop: boolean;
  tracks: Record<string, Track>; // boneName -> keyframes
};

// Helper: Linear Interpolation for Eulers
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const D2R = Math.PI / 180;

const evaluateTrack = (track: Track, time: number): THREE.Euler | null => {
  if (!track || track.length === 0) return null;
  
  // Find frame
  let frameIdx = 0;
  for (let i = 0; i < track.length - 1; i++) {
    if (time >= track[i].t && time < track[i+1].t) {
      frameIdx = i;
      break;
    }
  }
  
  // Clamp end
  if (time >= track[track.length-1].t) {
     const v = track[track.length-1].v;
     return new THREE.Euler(v[0]*D2R, v[1]*D2R, v[2]*D2R);
  }

  const k1 = track[frameIdx];
  const k2 = track[frameIdx + 1];
  
  const duration = k2.t - k1.t;
  const pct = (time - k1.t) / duration;
  
  // Simple Linear Interp
  return new THREE.Euler(
    lerp(k1.v[0], k2.v[0], pct) * D2R,
    lerp(k1.v[1], k2.v[1], pct) * D2R,
    lerp(k1.v[2], k2.v[2], pct) * D2R
  );
};

// --- Animation Data (The "Mocap" Data) ---

const CLIPS: Record<string, AnimationClip> = {
  idle: {
    duration: 4.0,
    loop: true,
    tracks: {
      spine: [ {t:0, v:[0,0,0]}, {t:2, v:[5,2,0]}, {t:4, v:[0,0,0]} ],
      chest: [ {t:0, v:[0,0,0]}, {t:2, v:[-2,0,0]}, {t:4, v:[0,0,0]} ],
      arm_r: [ {t:0, v:[0,0,10]}, {t:2, v:[0,0,15]}, {t:4, v:[0,0,10]} ],
      forearm_r: [ {t:0, v:[20,0,0]}, {t:2, v:[15,0,0]}, {t:4, v:[20,0,0]} ],
      hand_r: [ {t:0, v:[0,0,0]}, {t:2, v:[0,0,-10]}, {t:4, v:[0,0,0]} ],
      arm_l: [ {t:0, v:[0,0,-10]}, {t:2, v:[0,0,-15]}, {t:4, v:[0,0,-10]} ],
      forearm_l: [ {t:0, v:[20,0,0]}, {t:2, v:[25,0,0]}, {t:4, v:[20,0,0]} ],
    }
  },
  slash_h: {
    duration: 1.5,
    loop: true,
    tracks: {
      hips: [ {t:0, v:[0,0,0]}, {t:0.4, v:[0,-30,0]}, {t:0.6, v:[0,45,0]}, {t:1.0, v:[0,20,0]}, {t:1.5, v:[0,0,0]} ],
      spine: [ {t:0, v:[0,0,0]}, {t:0.4, v:[0,-10,0]}, {t:0.6, v:[10,10,0]}, {t:1.5, v:[0,0,0]} ],
      chest: [ {t:0, v:[0,0,0]}, {t:0.4, v:[0,-20,0]}, {t:0.6, v:[0,30,0]}, {t:1.5, v:[0,0,0]} ],
      
      // Arm Winding
      arm_r: [ 
        {t:0, v:[0,0,10]}, 
        {t:0.3, v:[-20,45,80]}, // Windup High Right
        {t:0.5, v:[10,-45,10]}, // STRIKE Across
        {t:0.7, v:[20,-60,10]}, // Follow through
        {t:1.5, v:[0,0,10]} // Return
      ],
      forearm_r: [ 
        {t:0, v:[20,0,0]}, 
        {t:0.3, v:[90,0,0]}, // Bend
        {t:0.5, v:[10,0,0]}, // Extend (Snap)
        {t:1.5, v:[20,0,0]} 
      ],
      hand_r: [
        {t:0, v:[0,0,0]},
        {t:0.3, v:[0,0,-20]}, // Cock wrist
        {t:0.5, v:[0,0,20]},  // Snap wrist
        {t:1.5, v:[0,0,0]}
      ]
    }
  },
  chop: {
    duration: 1.6,
    loop: true,
    tracks: {
      hips: [ {t:0, v:[0,0,0]}, {t:0.5, v:[0,10,0]}, {t:0.7, v:[0,-10,0]}, {t:1.6, v:[0,0,0]} ],
      spine: [ {t:0, v:[0,0,0]}, {t:0.5, v:[-15,0,0]}, {t:0.7, v:[20,0,0]}, {t:1.6, v:[0,0,0]} ], // Lean back then forward
      
      arm_r: [ 
        {t:0, v:[0,0,10]}, 
        {t:0.5, v:[180, 0, 10]}, // Raise overhead
        {t:0.7, v:[10, 20, 10]}, // SLAM down
        {t:1.0, v:[10, 20, 10]}, // Hold
        {t:1.6, v:[0,0,10]} // Return
      ],
      forearm_r: [ 
        {t:0, v:[20,0,0]}, 
        {t:0.5, v:[120,0,0]}, // Cock back
        {t:0.7, v:[10,0,0]}, // Extend Snap
        {t:1.6, v:[20,0,0]} 
      ],
       hand_r: [
        {t:0, v:[0,0,0]},
        {t:0.5, v:[0,0,-30]}, 
        {t:0.7, v:[0,0,45]},  // Wrist Snap
        {t:1.6, v:[0,0,0]}
      ]
    }
  },
  whirlwind: {
    duration: 1.0,
    loop: true,
    tracks: {
      arm_r: [ {t:0, v:[20,45,45]}, {t:1, v:[20,45,45]} ],
      forearm_r: [ {t:0, v:[90,0,0]}, {t:1, v:[90,0,0]} ],
      hand_r: [ 
        // Rotated around X instead of Y so the stick (which aligns with Y) actually spins visually
        {t:0, v:[0,0,0]}, 
        {t:0.25, v:[90,0,0]}, 
        {t:0.5, v:[180,0,0]}, 
        {t:0.75, v:[270,0,0]}, 
        {t:1.0, v:[360,0,0]} 
      ]
    }
  },
  stab: {
    duration: 1.0,
    loop: true,
    tracks: {
      spine: [{t:0, v:[0,0,0]}, {t:0.4, v:[10,10,0]}, {t:1, v:[0,0,0]}],
      arm_r: [{t:0, v:[0,0,10]}, {t:0.3, v:[-30,0,10]}, {t:0.5, v:[0,0,20]}, {t:1, v:[0,0,10]}],
      forearm_r: [{t:0, v:[90,0,0]}, {t:0.3, v:[120,0,0]}, {t:0.5, v:[10,0,0]}, {t:1, v:[90,0,0]}], 
    }
  },
  combo: {
    duration: 5.0,
    loop: true,
    tracks: {
      hips: [ 
        {t:0, v:[0,0,0]}, 
        // Slash Phase
        {t:0.8, v:[0,-30,0]}, {t:1.0, v:[0,45,0]}, 
        // Chop Phase
        {t:1.8, v:[0,0,0]}, {t:2.2, v:[0,0,0]}, {t:2.4, v:[0,-10,0]},
        // Flourish Phase
        {t:3.0, v:[0,0,0]}, {t:5.0, v:[0,0,0]}
      ],
      chest: [
         {t:0, v:[0,0,0]}, 
         {t:0.8, v:[0,-30,0]}, {t:1.0, v:[0,45,0]}, // Slash
         {t:1.8, v:[0,0,0]}, {t:2.2, v:[-10,0,0]}, {t:2.4, v:[20,0,0]}, // Chop
         {t:3.0, v:[0,0,0]}
      ],
      arm_r: [
        {t:0, v:[0,0,10]},
        // Slash
        {t:0.8, v:[-20,45,80]}, {t:1.0, v:[10,-45,10]}, {t:1.5, v:[0,0,10]},
        // Chop
        {t:2.2, v:[170,0,10]}, {t:2.4, v:[10,20,10]}, {t:2.8, v:[20,20,10]},
        // Flourish
        {t:3.2, v:[20,45,45]}, {t:4.5, v:[20,45,45]}, {t:5.0, v:[0,0,10]}
      ],
      forearm_r: [
        {t:0, v:[20,0,0]},
        // Slash
        {t:0.8, v:[90,0,0]}, {t:1.0, v:[10,0,0]}, {t:1.5, v:[20,0,0]},
        // Chop
        {t:2.2, v:[120,0,0]}, {t:2.4, v:[10,0,0]}, {t:2.8, v:[20,0,0]},
        // Flourish
        {t:3.2, v:[90,0,0]}, {t:4.5, v:[90,0,0]}, {t:5.0, v:[20,0,0]}
      ],
      hand_r: [
        {t:0, v:[0,0,0]},
        // Slash
        {t:0.8, v:[0,0,-20]}, {t:1.0, v:[0,0,20]}, {t:1.5, v:[0,0,0]},
        // Chop
        {t:2.2, v:[0,0,-30]}, {t:2.4, v:[0,0,45]}, {t:2.8, v:[0,0,0]},
        // Flourish (Spinning) - Using X axis rotation for visible spin
        {t:3.2, v:[0,0,0]}, {t:3.5, v:[180,0,0]}, {t:3.8, v:[360,0,0]}, {t:4.1, v:[540,0,0]}, {t:4.5, v:[720,0,0]},
        {t:5.0, v:[0,0,0]}
      ]
    }
  }
};

// --- 3D Components ---

const Stick3D = ({ stick, length, gripRatio }: { stick: Stick, length: number, gripRatio: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // Initialize with safe default points to avoid Three.js warnings
  const curveRef = useRef<THREE.CatmullRomCurve3>(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0), new THREE.Vector3(0,10,0)
  ]));
  
  useFrame(() => {
    if (!meshRef.current) return;
    
    const points: THREE.Vector3[] = [];
    const segments = 30; 
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = stick.queryPNormalize(t);
      points.push(new THREE.Vector3(p.x, p.y, p.z));
    }

    // Update curve points
    curveRef.current.points = points;
    
    // We must recreate the geometry because TubeGeometry doesn't support efficient live updating 
    // of path points without rebuilding the buffers. 
    const geometry = meshRef.current.geometry as THREE.TubeGeometry;
    // @ts-ignore
    if (geometry.parameters) {
        geometry.copy(new THREE.TubeGeometry(curveRef.current, 64, 2, 12, false));
    }
  });

  return (
    <group>
      <mesh ref={meshRef} castShadow receiveShadow>
        <tubeGeometry args={[curveRef.current, 64, 2, 12, false]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.2} metalness={0.5} />
      </mesh>
      <Marker stick={stick} t={0} color="#a855f7" />
      <Marker stick={stick} t={gripRatio} color="#10b981" scale={1.2} />
      <Marker stick={stick} t={1} color="#ef4444" />
    </group>
  );
};

const Marker = ({ stick, t, color, scale = 1 }: { stick: Stick, t: number, color: string, scale?: number }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) {
      const p = stick.queryPNormalize(t);
      ref.current.position.set(p.x, p.y, p.z);
    }
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[2 * scale, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

// --- Humanoid Character ---

const Humanoid = ({ 
  stick, 
  swingMode, 
  timeScale, 
  manualPos 
}: { 
  stick: Stick, 
  swingMode: SwingMode, 
  timeScale: number,
  manualPos: { x: number; y: number }
}) => {
  // Bones
  const refs = {
    hips: useRef<THREE.Group>(null),
    spine: useRef<THREE.Group>(null),
    chest: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    
    shoulder_r: useRef<THREE.Group>(null),
    arm_r: useRef<THREE.Group>(null),
    forearm_r: useRef<THREE.Group>(null),
    hand_r: useRef<THREE.Group>(null),
    
    shoulder_l: useRef<THREE.Group>(null),
    arm_l: useRef<THREE.Group>(null),
    forearm_l: useRef<THREE.Group>(null),
    hand_l: useRef<THREE.Group>(null),
  };

  const timeRef = useRef(0);
  
  // Materials defined as React elements
  const matGray = <meshStandardMaterial color="#64748b" roughness={0.5} />;
  const matDark = <meshStandardMaterial color="#334155" roughness={0.5} />;
  const matJoint = <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />;

  useFrame((state, delta) => {
    const dt = delta * timeScale;
    timeRef.current += dt;
    
    // 1. Determine Animation Clip
    let clip = CLIPS['idle'];
    // Map modes to clips
    if (swingMode === 'slash_h' || swingMode === 'slash_v') clip = CLIPS['slash_h']; 
    if (swingMode === 'chop') clip = CLIPS['chop'];
    if (swingMode === 'slash_v') clip = CLIPS['chop']; 
    if (swingMode === 'whirlwind') clip = CLIPS['whirlwind'];
    if (swingMode === 'combo') clip = CLIPS['combo'];
    if (swingMode === 'stab') clip = CLIPS['stab'];

    // 2. Manual Override
    if (swingMode === 'manual') {
        // Simple IK/LookAt
        if (refs.chest.current) refs.chest.current.rotation.y = manualPos.x * 1.0;
        if (refs.chest.current) refs.chest.current.rotation.x = manualPos.y * 0.5;
        
        if (refs.arm_r.current) refs.arm_r.current.rotation.x = -manualPos.y * 1.0;
        if (refs.arm_r.current) refs.arm_r.current.rotation.z = -1.0 + manualPos.x * 0.5;
        if (refs.forearm_r.current) refs.forearm_r.current.rotation.x = 1.5; // Fixed elbow
    } else {
        // 3. Play Animation
        const t = clip.loop ? timeRef.current % clip.duration : Math.min(timeRef.current, clip.duration);
        
        // Apply tracks to bones
        Object.entries(clip.tracks).forEach(([boneName, track]) => {
            // @ts-ignore
            const ref = refs[boneName];
            if (ref && ref.current) {
                const rot = evaluateTrack(track, t);
                if (rot) ref.current.rotation.copy(rot);
            }
        });
    }

    // 4. Physics Update
    if (refs.hand_r.current) {
        // Calculate Palm Center (Offset from wrist joint)
        // Hand mesh is Box(8,10,8) positioned at 0,-4,0. Center is at 0,-4,0.
        const localPalmCenter = new THREE.Vector3(0, -4, 0);
        const worldPos = localPalmCenter.applyMatrix4(refs.hand_r.current.matrixWorld);
        
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.extractRotation(refs.hand_r.current.matrixWorld);
        
        // Stick Direction: 
        // Hand Local -Y is "Down" (towards fingers/out).
        // Hand Local +Y is "Up" (towards wrist/arm).
        // We want the stick to extend OUT from the hand.
        const dir = new THREE.Vector3(0, -1, 0).applyMatrix4(rotationMatrix);

        stick.swing(
            { x: worldPos.x, y: worldPos.y, z: worldPos.z },
            { x: dir.x, y: dir.y, z: dir.z },
            dt
        );
    }
  });

  return (
    <group position={[0, -85, 0]}>
      {/* Hips / Pelvis */}
      <group ref={refs.hips} position={[0, 100, 0]}>
        <mesh position={[0, 0, 0]}>
            <boxGeometry args={[25, 15, 18]} />
            {matDark}
        </mesh>

        {/* Spine -> Chest */}
        <group ref={refs.spine} position={[0, 7.5, 0]}>
            <mesh position={[0, 10, 0]}>
                <cylinderGeometry args={[10, 11, 20]} />
                {matGray}
            </mesh>
            <group ref={refs.chest} position={[0, 20, 0]}>
                <mesh position={[0, 15, 0]}>
                    <boxGeometry args={[35, 30, 22]} />
                    {matGray}
                </mesh>
                <mesh position={[0, 15, 12]}>
                    <boxGeometry args={[20, 20, 5]} />
                    {matDark}
                </mesh>
                
                {/* Head */}
                <group ref={refs.head} position={[0, 30, 0]}>
                    <mesh position={[0, 10, 0]}>
                        <boxGeometry args={[18, 22, 20]} />
                        {matGray}
                    </mesh>
                    {/* Visor */}
                    <mesh position={[0, 10, 10]}>
                        <boxGeometry args={[14, 6, 2]} />
                        <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={2} />
                    </mesh>
                </group>

                {/* Right Arm Chain */}
                <group ref={refs.shoulder_r} position={[20, 25, 0]}>
                     <mesh>
                        <sphereGeometry args={[8]} />
                        {matJoint}
                     </mesh>
                     <group ref={refs.arm_r}>
                        <mesh position={[0, -14, 0]}>
                            <cylinderGeometry args={[6, 5, 28]} />
                            {matGray}
                        </mesh>
                        <group ref={refs.forearm_r} position={[0, -28, 0]}>
                            <mesh>
                                <sphereGeometry args={[6]} />
                                {matJoint}
                            </mesh>
                            <mesh position={[0, -12, 0]}>
                                <cylinderGeometry args={[5, 4, 24]} />
                                {matGray}
                            </mesh>
                            <group ref={refs.hand_r} position={[0, -24, 0]}>
                                <mesh position={[0, -4, 0]}>
                                    <boxGeometry args={[8, 10, 8]} />
                                    <meshStandardMaterial color="#94a3b8" />
                                </mesh>
                                {/* Stick is visually separate but logically driven here */}
                            </group>
                        </group>
                     </group>
                </group>

                 {/* Left Arm Chain (Visual Only) */}
                 <group ref={refs.shoulder_l} position={[-20, 25, 0]}>
                     <mesh>
                        <sphereGeometry args={[8]} />
                        {matJoint}
                     </mesh>
                     <group ref={refs.arm_l}>
                        <mesh position={[0, -14, 0]}>
                            <cylinderGeometry args={[6, 5, 28]} />
                            {matGray}
                        </mesh>
                        <group ref={refs.forearm_l} position={[0, -28, 0]}>
                            <mesh>
                                <sphereGeometry args={[6]} />
                                {matJoint}
                            </mesh>
                            <mesh position={[0, -12, 0]}>
                                <cylinderGeometry args={[5, 4, 24]} />
                                {matGray}
                            </mesh>
                            <group ref={refs.hand_l} position={[0, -24, 0]}>
                                <mesh position={[0, -4, 0]}>
                                    <boxGeometry args={[8, 10, 8]} />
                                    <meshStandardMaterial color="#94a3b8" />
                                </mesh>
                            </group>
                        </group>
                     </group>
                </group>

            </group>
        </group>
        
        {/* Legs (Static Stance) */}
        <group position={[10, -7.5, 0]}>
            <mesh position={[0, -20, 0]}>
                <cylinderGeometry args={[7, 5, 40]} />
                {matDark}
            </mesh>
             <mesh position={[0, -42, 2]}>
                <boxGeometry args={[10, 4, 16]} />
                {matDark}
            </mesh>
        </group>
        <group position={[-10, -7.5, 0]}>
            <mesh position={[0, -20, 0]}>
                <cylinderGeometry args={[7, 5, 40]} />
                {matDark}
            </mesh>
             <mesh position={[0, -42, 2]}>
                <boxGeometry args={[10, 4, 16]} />
                {matDark}
            </mesh>
        </group>
      </group>
    </group>
  );
};

export const StickVisualizer: React.FC<StickVisualizerProps> = (props) => {
  useEffect(() => {
    props.stick.updateProperties(props.length, props.elasticProps);
  }, [props.length, props.elasticProps, props.stick]);

  return (
    <div className="w-full h-full bg-slate-100 rounded-lg overflow-hidden shadow-inner">
      <Canvas shadows camera={{ position: [50, 50, 250], fov: 45 }}>
        <color attach="background" args={['#e2e8f0']} />
        <fog attach="fog" args={['#e2e8f0', 200, 600]} />
        
        <ambientLight intensity={0.6} />
        <directionalLight 
            position={[100, 150, 80]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize={[2048, 2048]} 
            shadow-bias={-0.0001}
        >
             <orthographicCamera attach="shadow-camera" args={[-150, 150, 150, -150]} />
        </directionalLight>

        <SoftShadows size={10} samples={10} focus={0.5} />
        <Environment preset="studio" />

        <group>
            <Humanoid 
                stick={props.stick} 
                swingMode={props.swingMode} 
                timeScale={props.timeScale}
                manualPos={props.manualPos}
            />
            <Stick3D 
                stick={props.stick} 
                length={props.length} 
                gripRatio={props.elasticProps.gripRatio} 
            />
            <ContactShadows opacity={0.5} scale={300} blur={2.5} far={20} />
            <Grid 
                infiniteGrid 
                fadeDistance={500} 
                sectionColor="#94a3b8" 
                cellColor="#cbd5e1" 
            />
        </group>

        <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2} 
            target={[0, 20, 0]}
        />
      </Canvas>
    </div>
  );
};
