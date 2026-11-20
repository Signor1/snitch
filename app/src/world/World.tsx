import { AdaptiveDpr, Environment, PerformanceMonitor, Preload } from "@react-three/drei";
import { preloadSets } from "./assets";
import { Canvas } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useState } from "react";
import { useLocation } from "react-router";
import * as THREE from "three";
import { Crew } from "./Crew";
import { Director, type Scene } from "./Director";
import { Hideout, TABLE_H } from "./Hideout";
import { Interior } from "./Interior";
import { Street } from "./Street";
import { useProfile } from "../settings/store";

function sceneFor(path: string): Scene {
  if (path === "/") return "title";
  if (path.startsWith("/run/")) return "run";
  return "city";
}

const ABERRATION = new THREE.Vector2(0.0006, 0.0006);

function Effects({ quality }: { quality: number }) {
  const high = quality > 0.6;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO halfRes aoRadius={0.6} intensity={2.4} distanceFalloff={0.6} color="#000000" /> : <></>}
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.95} radius={0.8} />
      {high ? <ChromaticAberration offset={ABERRATION} radialModulation={false} modulationOffset={0} /> : <></>}
      <Vignette offset={0.26} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/** One persistent world behind every screen. */
preloadSets();

export default function World() {
  const [auto, setQuality] = useState(1);
  const pref = useProfile((s) => s.settings.quality);
  const quality = pref === "low" ? 0.3 : pref === "medium" ? Math.min(auto, 0.6) : auto;
  const scene = sceneFor(useLocation().pathname);
  return (
    <div className="fixed inset-0 -z-0">
      <Canvas shadows dpr={pref === "low" ? 1 : [1, 1.75]} camera={{ position: [1.4, 2.2, 5.2], fov: 40, near: 0.1, far: 110 }} gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}>
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#0a0414", 7, 34]} />
        <PerformanceMonitor onDecline={() => setQuality(0.4)} onIncline={() => setQuality(1)} />
        <AdaptiveDpr pixelated={false} />

        <ambientLight intensity={0.3} color="#c9bfe6" />
        {/* soft key from the player's side, for the crew's faces */}
        <spotLight position={[0.5, 3.4, 4.6]} target-position={[0, 1.3, -1.4]} angle={0.75} penumbra={0.9} intensity={110} distance={12} decay={2} color="#ffe2c4" />
        <spotLight position={[0, 3.15, 0]} angle={0.95} penumbra={0.8} intensity={34} distance={8} decay={2} color="#d9ccff" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.05} target-position={[0, TABLE_H, 0]} />
        {/* amethyst rim, cool front fill, cyan kick off the table */}
        <directionalLight position={[-4, 5, -6]} intensity={1.6} color="#7a35d6" />
        <directionalLight position={[2, 3, 6]} intensity={0.7} color="#cfc4ee" />
        <pointLight position={[0, TABLE_H + 0.35, 0]} intensity={2.6} distance={3.4} color="#00e5ff" />
        <pointLight position={[0, 3.2, -5.6]} intensity={26} distance={9} color="#9d5cff" />

        <Suspense fallback={null}>
          <Environment files="/real/hdri/night_street_1k.hdr" environmentIntensity={0.55} />
        </Suspense>
        {/* one Suspense per set so a slow model never blanks the others */}
        <Suspense fallback={null}>
          <Hideout />
          <Crew />
        </Suspense>
        <Suspense fallback={null}>
          <Street />
        </Suspense>
        <Suspense fallback={null}>
          <Interior />
        </Suspense>
        <Suspense fallback={null}>
          <Preload all />
        </Suspense>

        <Director scene={scene} />
        <Effects quality={quality} />
      </Canvas>
    </div>
  );
}
