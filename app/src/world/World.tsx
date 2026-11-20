import { AdaptiveDpr, Environment, PerformanceMonitor, Preload } from "@react-three/drei";
import { preloadSets } from "./assets";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router";
import * as THREE from "three";
import { Crew } from "./Crew";
import { Director, type Scene } from "./Director";
import { Hideout, TABLE_H } from "./Hideout";
import { INSIDE_X, Interior } from "./Interior";
import { Region } from "./Region";
import { STREET_X, Street } from "./Street";
import { useProfile } from "../settings/store";
import { useBoot } from "../shell/Boot";
import { useFilm } from "../shell/film";

function sceneFor(path: string): Scene {
  if (path === "/") return "title";
  if (path.startsWith("/run/")) return "run";
  return "city";
}

// Phones get the lighter pipeline from the first frame instead of after they've already stuttered.
const PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

const ABERRATION = new THREE.Vector2(0.0006, 0.0006);

function Effects({ quality }: { quality: number }) {
  const high = quality > 0.6;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO halfRes aoRadius={0.6} intensity={2.4} distanceFalloff={0.6} color="#000000" /> : <></>}
      <Bloom mipmapBlur levels={PHONE ? 4 : 8} luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.95} radius={0.8} />
      {high ? <ChromaticAberration offset={ABERRATION} radialModulation={false} modulationOffset={0} /> : <></>}
      <Vignette offset={0.26} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/**
 * The street and shop sets mount once the player is past the title screen, so the loader only waits for the
 * hideout. On a phone, decoding every set up front kept the main thread busy and taps went unanswered.
 */
function useLater() {
  const started = useBoot((s) => s.started);
  const [later, setLater] = useState(0);
  useEffect(() => {
    if (!started) return;
    // one set at a time: decoding both at once froze taps for half a second on a slow phone
    const a = setTimeout(() => {
      setLater(1);
      preloadSets();
    }, 400);
    const b = setTimeout(() => setLater(2), 2400);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [started]);
  return later;
}

/**
 * Phones draw at a steady 30fps. A phone GPU that can't hold 60 makes every frame late, and the taps that
 * queue behind those frames are what felt unresponsive.
 */
function Steady30() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= 1000 / 30 - 4) {
        last = t;
        invalidate();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);
  return null;
}

/** One persistent world behind every screen. */
export default function World() {
  const [auto, setQuality] = useState(1);
  const pref = useProfile((s) => s.settings.quality);
  const quality = pref === "low" ? 0.3 : pref === "medium" || PHONE ? Math.min(auto, 0.6) : auto;
  const film = useFilm((s) => s.playing);
  const path = sceneFor(useLocation().pathname);
  // the intro film plays through the job sets, so the camera follows it like a run
  const scene = film ? "run" : path;
  const later = useLater();
  return (
    <div className="fixed inset-0 -z-0">
      <Canvas frameloop={PHONE ? "demand" : "always"} shadows={!PHONE} dpr={pref === "low" ? 1 : PHONE ? [1, 1.35] : [1, 1.75]} camera={{ position: [1.4, 2.2, 5.2], fov: 40, near: 0.1, far: 110 }} gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}>
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#0a0414", 7, 34]} />
        <PerformanceMonitor onDecline={() => setQuality(0.4)} onIncline={() => setQuality(1)} />
        <AdaptiveDpr pixelated={false} />
        {PHONE && <Steady30 />}

        <ambientLight intensity={0.3} color="#c9bfe6" />
        {/* soft key from the player's side, for the crew's faces */}
        <spotLight position={[0.5, 3.4, 4.6]} target-position={[0, 1.3, -1.4]} angle={0.75} penumbra={0.9} intensity={110} distance={12} decay={2} color="#ffe2c4" />
        <spotLight position={[0, 3.15, 0]} angle={0.95} penumbra={0.8} intensity={34} distance={8} decay={2} color="#d9ccff" target-position={[0, TABLE_H, 0]} />
        {/* amethyst rim, cool front fill, cyan kick off the table */}
        <directionalLight position={[-4, 5, -6]} intensity={1.6} color="#7a35d6" />
        <directionalLight position={[2, 3, 6]} intensity={0.7} color="#cfc4ee" />
        <pointLight position={[0, TABLE_H + 0.35, 0]} intensity={2.6} distance={3.4} color="#00e5ff" />
        <pointLight position={[0, 3.2, -5.6]} intensity={26} distance={9} color="#9d5cff" />

        <Suspense fallback={null}>
          <Environment files="/real/hdri/night_street_512.hdr" environmentIntensity={0.55} />
        </Suspense>
        {/* one Suspense per set so a slow model never blanks the others */}
        <Region x={0}>
          <Suspense fallback={null}>
            <Hideout />
            <Crew />
          </Suspense>
        </Region>
        {later > 0 && (
          <Region x={STREET_X}>
            <Suspense fallback={null}>
              <Street />
            </Suspense>
          </Region>
        )}
        {later > 1 && (
          <Region x={INSIDE_X}>
            <Suspense fallback={null}>
              <Interior />
            </Suspense>
          </Region>
        )}
        <Suspense fallback={null}>
          <Preload all />
        </Suspense>

        <Director scene={scene} />
        <Effects quality={quality} />
      </Canvas>
    </div>
  );
}
