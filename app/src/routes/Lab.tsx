import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useRef } from "react";
import { useSearchParams } from "react-router";
import type * as THREE from "three";
import { Character } from "../world/Character";
import { Car } from "../world/Street";
import { StreetSet } from "../world/StreetSet";
import type { Target, Venue as VenueKind } from "../game/data";
import { Goal, Sign, Venue } from "../world/Venues";
import { useSurface } from "../world/pbr";

type V3 = [number, number, number];

function Backdrop() {
  const brick = useSurface("brick_dark", [18, 7], 2.2);
  return (
    <>
      <mesh position={[0, 3.5, -2.6]} material={brick} receiveShadow>
        <planeGeometry args={[18, 7]} />
      </mesh>
      <Sign text="PORT SOLACE" color="#9d5cff" width={5.2} position={[0, 3.05, -2.5]} />
    </>
  );
}

// Dev-only poster studio: /lab?s=crew|job|law or /lab?s=venue&v=jewel&t=cases&open=1.
// The art in public/art was captured from these views.
export default function Lab() {
  const [q] = useSearchParams();
  const s = q.get("s") ?? "crew";
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  const cam: Record<string, { pos: V3; look: V3; fov: number }> = {
    crew: { pos: [0.3, 1.2, 4.3], look: [0, 1.12, 0], fov: 34 },
    job: { pos: [0.4, 1.25, 7.6], look: [3.8, 1.5, 0], fov: 40 },
    law: { pos: [1.2, 1.15, 9.8], look: [0.2, 1.25, 0], fov: 36 },
    venue: { pos: [1.2, 2.5, 6.4], look: [-0.6, 1.0, -0.8], fov: 40 },
    door: { pos: [0.2, 1.7, -1.2], look: [5.2, 1.2, 1.8], fov: 50 },
    bosses: { pos: [0, 1.25, 5.2], look: [0, 1.0, 0], fov: 36 },
    goal: { pos: [-1.2, 1.5, -0.4], look: [-2.7, 0.8, -3.1], fov: 45 },
    wide: { pos: [4.6, 2.9, 3.6], look: [-2.2, 0.9, -1.6], fov: 52 },
  };
  const c = cam[s] ?? cam.crew;
  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] bg-black" data-ready="1">
      <Canvas shadows camera={{ position: c.pos, fov: c.fov }} onCreated={({ camera }) => camera.lookAt(...c.look)} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#0a0414", 8, 40]} />
        <Suspense fallback={null}>
          <Environment files="/real/hdri/night_street_512.hdr" environmentIntensity={s === "crew" ? 0.25 : 0.6} />
          {s === "crew" && (
            <>
              <ambientLight intensity={0.25} />
              <spotLight position={[0, 4.5, 4]} angle={0.6} penumbra={0.9} intensity={170} color="#ffe6cc" castShadow shadow-bias={-0.0006} shadow-normalBias={0.05} shadow-mapSize={[2048, 2048]} />
              <Backdrop />
              <pointLight position={[-4, 2.4, -2.5]} intensity={90} color="#9d5cff" />
              <pointLight position={[4, 2.4, -2.5]} intensity={90} color="#00e5ff" />
              <pointLight position={[0, 3.5, -4]} intensity={60} color="#ff2d6f" />
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#08060c" roughness={0.25} metalness={0.7} />
              </mesh>
              <group position={[0, 0, 1.3]}><Character model="boss" emote="arms" /></group>
              <group position={[-1.05, 0, 0.5]} rotation={[0, 0.25, 0]}><Character model="gang_m1" emote="gunIdle" pistol phase={1} /></group>
              <group position={[1.05, 0, 0.5]} rotation={[0, -0.25, 0]}><Character model="gang_f1" emote="arms" phase={2} /></group>
              <group position={[-2.0, 0, -0.4]} rotation={[0, 0.4, 0]}><Character model="gang_f2" emote="idle" phase={3} /></group>
              <group position={[2.0, 0, -0.4]} rotation={[0, -0.4, 0]}><Character model="gang_m2" emote="gunIdle" pistol phase={4} /></group>
              <group position={[-2.9, 0, -1.2]} rotation={[0, 0.5, 0]}><Character model="gang_m3" emote="arms" phase={5} /></group>
              <group position={[2.9, 0, -1.2]} rotation={[0, -0.5, 0]}><Character model="gang_f3" emote="idle" phase={6} /></group>
            </>
          )}
          {s === "bosses" && (
            <>
              <ambientLight intensity={0.25} />
              <spotLight position={[0, 4.5, 4]} angle={0.6} penumbra={0.9} intensity={170} color="#ffe6cc" castShadow shadow-bias={-0.0006} shadow-normalBias={0.05} />
              <Backdrop />
              <pointLight position={[-4, 2.4, -2.5]} intensity={90} color="#9d5cff" />
              <pointLight position={[4, 2.4, -2.5]} intensity={90} color="#00e5ff" />
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#08060c" roughness={0.25} metalness={0.7} />
              </mesh>
              {(["boss", "boss_widow", "boss_kid", "boss_ghost"] as const).map((m, i) => (
                <group key={m} position={[(i - 1.5) * 1.1, 0, 0.6]}><Character model={m} emote="arms" phase={i} /></group>
              ))}
            </>
          )}
          {(s === "venue" || s === "wide" || s === "goal" || s === "door") && (
            <>
              <ambientLight intensity={0.3} color="#c9bfe6" />
              <Venue kind={(q.get("v") ?? "pawn") as VenueKind} name={q.get("n") ?? "Pawn shop"} fight={false} />
              <Goal target={(q.get("t") ?? "cases") as Target} venue={(q.get("v") ?? "pawn") as VenueKind} open={q.get("open") === "1"} />
            </>
          )}
          {(s === "job" || s === "law") && (
            <>
              <ambientLight intensity={0.22} color="#c9bfe6" />
              <StreetSet name="Pawn shop" alarm={s === "law"} />
            </>
          )}
          {s === "job" && (
            <>
              <group position={[2.7, 0, -1.6]}><Car carRef={a} /></group>
              <group position={[4.6, 0.15, 1.9]} rotation={[0, -0.9, 0]}><Character model="gang_m1" emote="aim" pistol /></group>
              <group position={[5.6, 0.15, 0.6]} rotation={[0, 2.2, 0]}><Character model="gang_f2" emote="gunIdle" pistol phase={2} /></group>
              <group position={[1.2, 0, 2.8]} rotation={[0, 0.5, 0]}><Character model="gang_m2" emote="gunIdle" pistol phase={3} /></group>
            </>
          )}
          {s === "law" && (
            <>
              <group position={[-1.0, 0, 1.6]} rotation={[0, 0.7, 0]}><Car police carRef={a} /></group>
              <group position={[2.6, 0, -6]} rotation={[0, -0.3, 0]}><Car police carRef={b} /></group>
              <group position={[-0.9, 0, 5.2]} rotation={[0, 0.5, 0]}><Character model="cop_m" emote="aim" pistol /></group>
              <group position={[2.3, 0, 4.6]} rotation={[0, 0.2, 0]}><Character model="cop_f" emote="shoot" pistol phase={2} /></group>
              <pointLight position={[-1.0, 2.2, 1.6]} intensity={120} color="#ff1a2e" distance={22} />
              <spotLight position={[1, 4, 10]} angle={0.5} penumbra={1} intensity={90} color="#ffe6cc" />
              <pointLight position={[2.6, 2.2, -6]} intensity={140} color="#1f6bff" distance={26} />
            </>
          )}
        </Suspense>
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} radius={0.8} />
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
