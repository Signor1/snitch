import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSnitch } from "../game/store";
import { BOSS_LOOKS, CREW_TAGS, useProfile } from "../settings/store";
import { Character } from "./Character";
import { Prop } from "./Prop";
import { useSurface } from "./pbr";
import { Sign } from "./Venues";

/** Table height and radius in metres. */
export const TABLE_H = 0.78;
export const TABLE_R = 0.67;
const CYAN = "#00e5ff";
const HEAT = "#ff2d6f";
const P = "/real/props/";
const S = "/real/shop/";

/** x spans -W..W, back wall at z = -D, open towards the camera. */
const W = 5.6;
const D = 4.4;
const H = 3.4;

/** Job pin in table space, stable per job index. */
const pinAt = (i: number) => {
  const a = i * 2.39 + 0.7;
  const r = 0.12 + ((i * 37) % 10) / 40;
  return { x: Math.cos(a) * r * 0.85, z: Math.sin(a) * r * 0.6 };
};

function useMapTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9cfb6";
    g.fillRect(0, 0, 1024, 1024);
    // the bay
    g.fillStyle = "#9fb4bd";
    g.beginPath();
    g.moveTo(0, 760);
    g.bezierCurveTo(260, 700, 420, 880, 640, 820);
    g.bezierCurveTo(820, 770, 900, 900, 1024, 860);
    g.lineTo(1024, 1024);
    g.lineTo(0, 1024);
    g.fill();
    // blocks between streets
    for (let y = 0; y < 760; y += 64)
      for (let x = 0; x < 1024; x += 80) {
        g.fillStyle = (x * 7 + y * 3) % 11 === 0 ? "#a9b88f" : "#c8bc9f";
        g.fillRect(x + 7, y + 7, 66, 50);
      }
    // avenues
    g.strokeStyle = "#f2ead6";
    g.lineWidth = 12;
    for (const x of [240, 560, 880]) {
      g.beginPath();
      g.moveTo(x - 3, 0);
      g.lineTo(x - 3, 790);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, 380);
    g.lineTo(1024, 300);
    g.stroke();
    // pencil marks and coffee rings
    g.strokeStyle = "rgba(40,30,20,0.35)";
    g.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(200 + i * 160, 200 + ((i * 97) % 400), 30 + i * 4, 0, 6.28);
      g.stroke();
    }
    g.strokeStyle = "rgba(90,60,30,0.25)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(760, 560, 46, 0.4, 5.6);
    g.stroke();
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(60,40,20,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
}

function useRugTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4a1418";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#b08a4a";
    g.lineWidth = 10;
    g.strokeRect(26, 26, 460, 460);
    g.strokeStyle = "#20090b";
    g.lineWidth = 18;
    g.strokeRect(52, 52, 408, 408);
    g.strokeStyle = "#8a6a3a";
    g.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(256, 256, 40 + i * 30, 26 + i * 20, 0, 0, 6.28);
      g.stroke();
    }
    const r = g.createRadialGradient(256, 256, 20, 256, 256, 260);
    r.addColorStop(0, "rgba(255,230,200,0.12)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,220,180"},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function PlanningTable() {
  const map = useMapTexture();
  const chapter = useSnitch((s) => s.chapter);
  const job = useSnitch((s) => s.job);
  const pin = useRef<THREE.Mesh>(null);
  const jobs = chapter?.jobs.length ?? 4;
  useFrame((st) => {
    if (pin.current) pin.current.position.y = 0.09 + Math.sin(st.clock.elapsedTime * 3) * 0.012;
  });
  const top = TABLE_H + 0.004;
  return (
    <group>
      <Prop url={P + "round_table.glb"} height={TABLE_H} />
      {/* the map */}
      <mesh position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0.12]} receiveShadow>
        <planeGeometry args={[1.0, 0.72]} />
        <meshStandardMaterial map={map} roughness={0.9} />
      </mesh>
      {[...Array(jobs)].map((_, i) => {
        const p = pinAt(i);
        const done = i < job;
        const next = i === job;
        return (
          <group key={i} position={[p.x, top, p.z]}>
            <mesh position={[0, 0.03, 0]}>
              <cylinderGeometry args={[0.003, 0.003, 0.06, 6]} />
              <meshStandardMaterial color="#bfc3c8" metalness={1} roughness={0.3} />
            </mesh>
            <mesh ref={next ? pin : undefined} position={[0, 0.065, 0]}>
              <sphereGeometry args={[0.014, 16, 12]} />
              <meshStandardMaterial color={next ? CYAN : done ? "#4a4f57" : "#c23a3a"} emissive={next ? CYAN : "#000000"} emissiveIntensity={next ? 2.6 : 0} toneMapped={!next} />
            </mesh>
            {done && (
              <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0.7]}>
                <planeGeometry args={[0.06, 0.008]} />
                <meshBasicMaterial color="#2a1a10" />
              </mesh>
            )}
          </group>
        );
      })}
      {next(job, jobs) && <pointLight position={[pinAt(job).x, top + 0.2, pinAt(job).z]} color={CYAN} intensity={0.6} distance={0.8} />}
      {/* cash, a pistol, a pack of cigarettes, a bottle */}
      {[...Array(5)].map((_, i) => (
        <mesh key={i} position={[0.36 + (i % 2) * 0.04, top + 0.018 + Math.floor(i / 2) * 0.026, 0.3 - (i % 3) * 0.02]} rotation={[0, 0.3 + i * 0.2, 0]} castShadow>
          <boxGeometry args={[0.155, 0.024, 0.068]} />
          <meshStandardMaterial color="#7d9a82" roughness={0.85} />
        </mesh>
      ))}
      <Prop url={P + "pistol.glb"} longest={0.2} position={[-0.34, top, 0.34]} rotation={[0, 2.1, 0]} />
      <Prop url={P + "cigarette_pack.glb"} longest={0.09} position={[-0.48, top, -0.2]} rotation={[0, 0.6, 0]} />
      <Prop url={P + "bottles.glb"} longest={0.32} position={[0.36, top, -0.36]} rotation={[0, 1, 0]} />
    </group>
  );
}
const next = (job: number, jobs: number) => job < jobs;

/** One pinned page per file found. */
function Board() {
  const found = useSnitch((s) => s.evidence.length);
  const pins = useMemo(() => [...Array(24)].map((_, i) => ({ y: 0.55 - Math.floor(i / 6) * 0.36 + ((i * 13) % 5) * 0.012, z: -0.95 + (i % 6) * 0.38 + ((i * 7) % 5) * 0.02, r: (((i * 31) % 9) - 4) * 0.04 })), []);
  const shown = pins.slice(0, Math.min(found, pins.length));
  const string = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(shown.map((p) => new THREE.Vector3(0.025, p.y + 0.11, p.z)));
    return g;
  }, [shown]);
  return (
    <group position={[-W + 0.06, 1.75, -1.2]}>
      <group>
        <mesh>
          <boxGeometry args={[0.04, 1.5, 2.4]} />
          <meshStandardMaterial color="#8a6438" roughness={1} />
        </mesh>
        {shown.map((p, i) => (
          <group key={i} position={[0.025, p.y, p.z]} rotation={[p.r, 0, 0]}>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.26, 0.2]} />
              <meshStandardMaterial color="#ece6d6" roughness={0.9} />
            </mesh>
            <mesh position={[0.01, 0.11, 0]}>
              <sphereGeometry args={[0.012, 10, 8]} />
              <meshStandardMaterial color="#c4232b" />
            </mesh>
          </group>
        ))}
        {shown.length > 1 && (
          <line>
            <primitive object={string} attach="geometry" />
            <lineBasicMaterial color="#c4232b" />
          </line>
        )}
      </group>
    </group>
  );
}

/** Uses the look the player picked. */
function Boss() {
  const look = useProfile((s) => s.identity?.look ?? 0);
  const model = BOSS_LOOKS[look % BOSS_LOOKS.length].model;
  return (
    <group position={[3.35, 0, -2.75]} rotation={[0, -0.8, 0]}>
      <Suspense fallback={null}>
        <Character key={model} model={model} emote="arms" phase={9} />
      </Suspense>
    </group>
  );
}

export function Hideout() {
  const brick = useSurface("brick_dark", [W * 2, H], 2.2);
  const side = useSurface("brick_red", [D * 2, H], 2.2, { color: "#8a8a8a" });
  const floor = useSurface("concrete_wall", [W * 2, D * 2 + 4], 3, { color: "#9a958c", roughness: 0.9 });
  const rug = useRugTexture();
  const crewName = useProfile((s) => s.identity?.crew) || "Port Solace";
  const tag = useProfile((s) => CREW_TAGS[s.identity?.tag ?? 1]?.color ?? "#9d5cff");
  const heat = useSnitch((s) => s.heat);
  const raid = useSnitch((s) => !!s.ending?.raided || (s.busy === "end" && s.heat >= 3));
  const lamp = useRef<THREE.SpotLight>(null);
  const tv = useRef<THREE.PointLight>(null);
  const red = useRef<THREE.PointLight>(null);
  const blue = useRef<THREE.PointLight>(null);
  const pipe = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3d3a36", metalness: 0.7, roughness: 0.55 }), []);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    // The lamp flickers once the heat is on.
    if (lamp.current) {
      const flick = heat >= 2 && Math.sin(t * 23) * Math.sin(t * 7.3) > 0.82 ? 0.35 : 1;
      lamp.current.intensity = 24 * flick;
    }
    if (tv.current) tv.current.intensity = 1.2 + Math.sin(t * 17) * 0.4 + Math.sin(t * 5.1) * 0.3;
    const flash = raid ? (Math.floor(t * 4) % 2 === 0 ? 1 : 0) : 0;
    if (red.current) red.current.intensity = THREE.MathUtils.damp(red.current.intensity, raid ? flash * 60 : 0, 14, dt);
    if (blue.current) blue.current.intensity = THREE.MathUtils.damp(blue.current.intensity, raid ? (1 - flash) * 60 : 0, 14, dt);
  });

  return (
    <group>
      {/* shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2 - 0]} material={floor} receiveShadow>
        <planeGeometry args={[W * 2, D * 2 + 4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -0.2]} receiveShadow>
        <planeGeometry args={[3.6, 2.6]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      <mesh position={[0, H / 2, -D]} material={brick} receiveShadow>
        <planeGeometry args={[W * 2, H]} />
      </mesh>
      <mesh position={[-W, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={side} receiveShadow>
        <planeGeometry args={[D * 2, H]} />
      </mesh>
      <mesh position={[W, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={side} receiveShadow>
        <planeGeometry args={[D * 2, H]} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * 2, D * 2]} />
        <meshStandardMaterial color="#141210" roughness={1} />
      </mesh>
      {/* ceiling pipes */}
      {[-1.6, -1.35, 2.1].map((z, i) => (
        <mesh key={z} position={[0, H - 0.18 - i * 0.05, z]} rotation={[0, 0, Math.PI / 2]} material={pipe}>
          <cylinderGeometry args={[0.05 - i * 0.012, 0.05 - i * 0.012, W * 2, 12]} />
        </mesh>
      ))}

      <PlanningTable />
      <Prop url={P + "hanging_lamp.glb"} height={0.9} position={[0, H - 0.9, 0]} emissive={2.4} />
      <spotLight ref={lamp} position={[0, H - 0.95, 0]} angle={0.85} penumbra={0.6} intensity={24} distance={7} decay={2} color="#ffd29a" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.05} target-position={[0, 0, 0]} />

      {/* crew name in neon, and the eye over the keyhole */}
      <Sign text={crewName.toUpperCase()} color={tag} width={4.2} position={[0, 2.75, -D + 0.04]} />
      <pointLight position={[0, 2.7, -D + 0.6]} color={tag} intensity={7} distance={5} />

      {/* back wall: shelves, crates, safe */}
      <group position={[-3.9, 0, -D + 0.32]}>
        <Prop url={P + "steel_shelves.glb"} height={2.05} />
        <Prop url={P + "cardboard_box.glb"} longest={0.45} position={[0, 1.05, 0]} rotation={[0, 0.3, 0]} />
        <Prop url={P + "suitcase.glb"} longest={0.6} position={[0, 0.55, 0]} rotation={[0, -0.2, 0]} />
        <Prop url={S + "toolbox.glb"} longest={0.5} position={[0, 1.55, 0]} rotation={[0, 0.2, 0]} />
      </group>
      <group position={[-2.65, 0, -D + 0.32]}>
        <Prop url={P + "steel_shelves.glb"} height={2.05} />
        <Prop url={P + "boombox.glb"} longest={0.5} position={[0, 1.05, 0]} rotation={[0, -0.2, 0]} />
        <Prop url={P + "bottles.glb"} longest={0.45} position={[0, 0.55, 0]} />
        <Prop url={P + "cardboard_box.glb"} longest={0.4} position={[0, 1.55, 0]} rotation={[0, 0.5, 0]} />
      </group>
      <Prop url={S + "safe.glb"} height={1.2} position={[3.1, 0, -D + 0.5]} rotation={[0, -0.25, 0]} />
      <group position={[4.5, 0, -D + 0.75]} rotation={[0, -0.5, 0]}>
        <Prop url={P + "pallet.glb"} longest={1.2} />
        <Prop url={P + "wooden_crate.glb"} longest={0.95} position={[0, 0.14, 0]} />
        <Prop url={P + "wooden_crate.glb"} longest={0.7} position={[0.05, 0.86, 0]} rotation={[0, 0.4, 0]} />
      </group>
      <Prop url={P + "barrel.glb"} height={0.9} position={[-W + 0.5, 0, -0.9]} />
      <Prop url={P + "aircon_unit.glb"} longest={0.8} position={[-W + 0.25, 2.5, 0.8]} rotation={[0, Math.PI / 2, 0]} />
      <Prop url={P + "security_camera.glb"} longest={0.4} position={[W - 0.25, 2.9, -D + 0.3]} rotation={[0.3, -Math.PI * 0.75, 0]} />
      <Prop url={S + "wall_clock.glb"} longest={0.4} position={[2.6, 2.6, -D + 0.04]} />

      {/* corner desk: laptop, TV, police scanner */}
      <group position={[3.75, 0, 0.7]} rotation={[0, -Math.PI / 2, 0]}>
        <Prop url={P + "metal_desk.glb"} width={1.5} />
        <Prop url={S + "laptop.glb"} longest={0.36} position={[-0.3, 0.76, 0]} rotation={[0, 0.3, 0]} />
        <Prop url={S + "tv_crt.glb"} width={0.48} position={[0.38, 0.76, -0.05]} rotation={[0, -0.3, 0]} />
        <pointLight ref={tv} position={[0.3, 1.0, 0.5]} color="#9fc3ff" intensity={1.2} distance={2.2} />
        <mesh position={[-0.6, 0.79, 0.15]}>
          <boxGeometry args={[0.12, 0.05, 0.08]} />
          <meshStandardMaterial color="#1a1a1c" emissive={heat >= 2 ? HEAT : "#3dff8a"} emissiveIntensity={0.9} />
        </mesh>
      </group>
      <Prop url={P + "chair_leather.glb"} height={1.0} position={[3.0, 0, 0.75]} rotation={[0, Math.PI / 2 + 0.3, 0]} />

      <Board />
      <Boss />

      <pointLight ref={red} position={[-3.5, 2.6, 2]} color={HEAT} intensity={0} distance={14} />
      <pointLight ref={blue} position={[3.5, 2.6, 2]} color="#1f6bff" intensity={0} distance={14} />
    </group>
  );
}
