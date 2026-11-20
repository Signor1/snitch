import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSnitch, type Cut } from "../game/store";
import { Prop } from "./Prop";

// Street-side pieces of a police raid. Positions are in the street set's space (the van parks at x 2.7,
// z -2.6; the shop door is at x 6.6, z 1.3).
// All of them stay mounted and are switched with `active`: adding or removing a light makes three.js
// recompile every material, which stalls the frame.

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const VAN = new THREE.Vector3(2.7, 0, -2.6);

/** Seconds since the police showed up on the street, or -1 if they haven't. */
function raidTime(cut?: Cut) {
  if (!cut || cut.state !== "tipped" || cut.beat !== "exit") return -1;
  return (performance.now() - cut.beatAt) / 1000;
}

/** Two light towers that slam on one after the other. */
export function Floodlights({ active }: { active: boolean }) {
  const lamps = useRef<(THREE.SpotLight | null)[]>([]);
  const glass = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    const t = active ? raidTime(useSnitch.getState().cut) : -1;
    lamps.current.forEach((l, i) => {
      const on = t >= 0.25 + i * 0.45 ? 1 : 0;
      if (l) l.intensity = on * 900;
      const g = glass.current[i];
      if (g) g.emissiveIntensity = on * 12;
    });
  });
  // down the street from the camera, both aimed at the shop door
  const towers: [number, number][] = [
    [-4.6, -6],
    [-4.6, -17],
  ];
  return (
    <>
      {towers.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} visible={active}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 6, 8]} />
            <meshStandardMaterial color="#2a2c30" metalness={0.7} roughness={0.5} />
          </mesh>
          <mesh position={[0.15, 6.05, 0]}>
            <boxGeometry args={[0.5, 0.45, 0.9]} />
            <meshStandardMaterial ref={(m) => void (glass.current[i] = m)} color="#e8eef8" emissive="#ffffff" emissiveIntensity={0} toneMapped={false} />
          </mesh>
          <spotLight
            ref={(l) => void (lamps.current[i] = l)}
            position={[0.3, 6, 0]}
            target-position={[6.6 - x, 0.5, 1.3 - z]}
            angle={0.42}
            penumbra={0.35}
            intensity={0}
            distance={40}
            color="#f2f6ff"
          />
        </group>
      ))}
    </>
  );
}

/** A police helicopter that sweeps in and holds its searchlight on the van. */
export function Helicopter({ active }: { active: boolean }) {
  const g = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const blink = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dt) => {
    const t = active ? raidTime(useSnitch.getState().cut) : -1;
    const o = g.current;
    if (!o) return;
    o.visible = t >= 0;
    if (beam.current) beam.current.visible = t >= 0.6;
    if (spot.current) spot.current.intensity = t >= 0 ? 1600 : 0;
    if (t < 0) return;
    const k = ease(t / 2.4);
    const sway = Math.sin(st.clock.elapsedTime * 0.7) * 0.6;
    o.position.set(THREE.MathUtils.lerp(-14, -1.5, k) + sway, 13, THREE.MathUtils.lerp(-34, -6, k));
    o.rotation.set(0.12 * (1 - k), 0.5, 0.05 * Math.sin(st.clock.elapsedTime));
    if (rotor.current) rotor.current.rotation.y += dt * 38;
    if (blink.current) blink.current.emissiveIntensity = Math.floor(st.clock.elapsedTime * 2) % 2 ? 0 : 8;
    // the light searches, then locks on
    const search = Math.max(0, 1 - t / 3.2) * 3;
    target.position.set(VAN.x + Math.sin(st.clock.elapsedTime * 1.7) * search, 0, VAN.z + Math.cos(st.clock.elapsedTime * 1.3) * search);
    target.updateMatrixWorld();
    if (spot.current) spot.current.target = target;
    if (beam.current) {
      const from = o.position;
      const to = target.position;
      const len = from.distanceTo(to);
      beam.current.position.copy(from).lerp(to, 0.5);
      beam.current.scale.set(1, len, 1);
      beam.current.lookAt(target.getWorldPosition(aim)); // lookAt wants world space
      beam.current.rotateX(Math.PI / 2);
    }
  });
  return (
    <>
      <primitive object={target} />
      <group ref={g} visible={false}>
        <mesh>
          <boxGeometry args={[1.0, 0.9, 2.6]} />
          <meshStandardMaterial color="#14171c" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.15, -2.2]}>
          <boxGeometry args={[0.18, 0.2, 2.4]} />
          <meshStandardMaterial color="#14171c" />
        </mesh>
        <mesh ref={rotor} position={[0, 0.62, 0]}>
          <boxGeometry args={[6.2, 0.04, 0.22]} />
          <meshStandardMaterial color="#0a0b0d" />
        </mesh>
        <mesh position={[0, -0.5, 0.4]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial ref={blink} color="#ff1a2e" emissive="#ff1a2e" emissiveIntensity={8} toneMapped={false} />
        </mesh>
        <spotLight ref={spot} position={[0, -0.5, 0.8]} angle={0.16} penumbra={0.4} intensity={0} distance={60} color="#e8f0ff" />
      </group>
      {/* the visible shaft of light, in world space between the helicopter and the ground */}
      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[1.6, 0.15, 1, 24, 1, true]} />
        <meshBasicMaterial color="#cfe0ff" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/** Barriers slide across both ends of the street, with flares on the road. */
export function Roadblock({ active }: { active: boolean }) {
  const ends = useRef<(THREE.Group | null)[]>([]);
  const flares = useRef<(THREE.PointLight | null)[]>([]);
  useFrame((st) => {
    const t = active ? raidTime(useSnitch.getState().cut) : -1;
    ends.current.forEach((e, i) => {
      if (!e) return;
      e.visible = t >= 0;
      e.position.x = THREE.MathUtils.lerp(-12, 0, ease((t - 0.2 - i * 0.3) / 0.9));
    });
    flares.current.forEach((f, i) => {
      if (f) f.intensity = t >= 0.8 ? 14 + Math.sin(st.clock.elapsedTime * 23 + i * 3) * 5 : 0;
    });
  });
  return (
    <>
      {[8.5, -13.5].map((z, i) => (
        <group key={z} ref={(e) => void (ends.current[i] = e)} visible={false} position={[0, 0, z]}>
          {[-2.6, 0, 2.6, 5.2].map((x) => (
            <Prop key={x} url="/real/props/concrete_barrier.glb" width={2.4} position={[x, 0, 0]} />
          ))}
          {[-1.3, 1.3, 3.9].map((x) => (
            <Prop key={x} url="/real/props/traffic_cone.glb" height={0.55} position={[x, 0, i ? 1.1 : -1.1]} />
          ))}
          {[-0.6, 3.2].map((x) => (
            <mesh key={x} position={[x, 0.05, i ? 1.8 : -1.8]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
              <meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={10} toneMapped={false} />
            </mesh>
          ))}
          <pointLight ref={(f) => void (flares.current[i] = f)} position={[1.3, 0.3, i ? 1.8 : -1.8]} color="#ff3b1f" intensity={0} distance={10} />
        </group>
      ))}
    </>
  );
}
