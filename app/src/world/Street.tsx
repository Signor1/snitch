import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COP_LOOK, copModel } from "../game/looks";
import { useSnitch, type Cut } from "../game/store";
import { Character, type Emote } from "./Character";
import { Prop } from "./Prop";
import { StreetSet } from "./StreetSet";
import { seedOf } from "./places";
import { Floodlights, Helicopter, Roadblock } from "./Raid";

/** Street set, far from the hideout. */
export const STREET_X = 80;
const CYAN = "#00e5ff";
const HEAT = "#ff2d6f";
const DOOR = new THREE.Vector3(6.6, 0.15, 1.3);
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function Rain() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 1400;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 26;
      p[i * 3 + 1] = Math.random() * 12;
      p[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] -= dt * 14;
      if (arr[i] < 0) arr[i] += 12;
    }
    a.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#b9a8de" size={0.035} transparent opacity={0.5} depthWrite={false} />
    </points>
  );
}

let livery: THREE.Texture | undefined;
function liveryTexture() {
  if (livery) return livery;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f5f7";
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = "#12336e";
  g.fillRect(0, 62, 512, 14);
  g.fillStyle = "#12336e";
  g.font = "900 50px Arial Black, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE", 256, 30);
  livery = new THREE.CanvasTexture(c);
  livery.colorSpace = THREE.SRGBColorSpace;
  return livery;
}

// a different van every job, the way a crew never uses the same vehicle twice
const VAN_PAINTS = ["#e6e4de", "#3b4048", "#1f2a3c", "#5a2126", "#c4bca6", "#2e3a2d"];

export type CarKind = "crew" | "patrol" | "unmarked" | "swat";

/** The crew's van, a marked patrol car, an unmarked detective car, or a black SWAT van. */
export function Car({ police = false, kind = police ? "patrol" : "crew", carRef, lit = true }: { police?: boolean; kind?: CarKind; carRef: React.RefObject<THREE.Group | null>; lit?: boolean }) {
  const red = useRef<THREE.MeshStandardMaterial>(null);
  const blue = useRef<THREE.MeshStandardMaterial>(null);
  const dash = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((st) => {
    const on = Math.floor(st.clock.elapsedTime * 5) % 2 === 0;
    const k = lit ? 1 : 0;
    if (red.current) red.current.emissiveIntensity = k * (on ? 7 : 0.3);
    if (blue.current) blue.current.emissiveIntensity = k * (on ? 0.3 : 7);
    if (dash.current) dash.current.emissiveIntensity = k * (Math.floor(st.clock.elapsedTime * 8) % 2 ? 9 : 0);
  });
  const job = useSnitch((s) => s.cut?.job);
  const sedan = kind === "patrol" || kind === "unmarked";
  const len = sedan ? 4.7 : 5.2;
  const half = sedan ? 0.9 : 1.0;
  const roof = sedan ? 1.5 : 2.42;
  const marked = kind === "patrol" || kind === "swat";
  const paint = kind === "patrol" ? "#eceef1" : kind === "unmarked" ? "#22252c" : kind === "swat" ? "#0f1114" : VAN_PAINTS[seedOf(job ?? "") % VAN_PAINTS.length];
  return (
    <group ref={carRef}>
      <Prop url={sedan ? "/real/vehicles/saloon.glb" : "/real/vehicles/van.glb"} depth={len} paint={paint} />
      {kind === "unmarked" && (
        // a blue strobe behind the windscreen, nothing on the roof
        <mesh position={[0, 1.18, 0.55]}>
          <boxGeometry args={[0.7, 0.06, 0.1]} />
          <meshStandardMaterial ref={dash} color="#1f6bff" emissive="#1f6bff" emissiveIntensity={9} toneMapped={false} />
        </mesh>
      )}
      {/* head and tail lamps */}
      {[-0.62, 0.62].map((x) => (
        <group key={x}>
          <mesh position={[x * half * 1.05, sedan ? 0.66 : 0.95, len / 2 - 0.02]}>
            <boxGeometry args={[0.3, 0.1, 0.04]} />
            <meshStandardMaterial color="#fff" emissive="#fff3d6" emissiveIntensity={5} toneMapped={false} />
          </mesh>
          <mesh position={[x * half * 1.05, sedan ? 0.82 : 1.05, -len / 2 + 0.02]}>
            <boxGeometry args={[0.26, 0.09, 0.04]} />
            <meshStandardMaterial color={HEAT} emissive="#ff1a2e" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <spotLight position={[0, 0.8, len / 2]} target-position={[0, 0, len / 2 + 8]} angle={0.5} penumbra={0.6} intensity={60} distance={18} color="#fff1d0" />
      {marked && (
        <>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (half + 0.012), 0.74, -0.15]} rotation={[0, (side * Math.PI) / 2, 0]}>
              <planeGeometry args={[1.9, 0.36]} />
              <meshStandardMaterial map={liveryTexture()} roughness={0.35} metalness={0.2} />
            </mesh>
          ))}
          {/* roof bar */}
          <mesh position={[0, roof + 0.03, -0.1]}>
            <boxGeometry args={[1.15, 0.05, 0.28]} />
            <meshStandardMaterial color="#111318" roughness={0.4} />
          </mesh>
          <mesh position={[-0.3, roof + 0.1, -0.1]}>
            <boxGeometry args={[0.5, 0.1, 0.24]} />
            <meshStandardMaterial ref={red} color="#ff1a2e" emissive="#ff1a2e" emissiveIntensity={6} toneMapped={false} />
          </mesh>
          <mesh position={[0.3, roof + 0.1, -0.1]}>
            <boxGeometry args={[0.5, 0.1, 0.24]} />
            <meshStandardMaterial ref={blue} color="#1f6bff" emissive="#1f6bff" emissiveIntensity={6} toneMapped={false} />
          </mesh>
          {/* push bar */}
          {[-0.35, 0.35].map((x) => (
            <mesh key={x} position={[x, 0.55, len / 2 + 0.08]}>
              <boxGeometry args={[0.06, 0.5, 0.06]} />
              <meshStandardMaterial color="#0c0d10" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.66, len / 2 + 0.1]}>
            <boxGeometry args={[0.9, 0.06, 0.06]} />
            <meshStandardMaterial color="#0c0d10" roughness={0.5} metalness={0.6} />
          </mesh>
        </>
      )}
    </group>
  );
}

const PARK_Z = -2.6;
const sinceCut = (cut: Cut) => (performance.now() - (cut.state === "go" ? cut.at : cut.beatAt)) / 1000;

/**
 * One crew member on the street. Going in: van to door. Clean: back to the van and gone.
 * Tipped: out of the door at a sprint and into the van before the police box it in. In the intro film
 * they don't make it: they stop short and go down on their knees.
 */
function Runner({ i, id }: { i: number; id: number }) {
  const g = useRef<THREE.Group>(null);
  const member = useSnitch((s) => s.crew[id]);
  const [act, setAct] = useState<Emote>("sprint");
  const van = useMemo(() => new THREE.Vector3(3.9, 0, PARK_Z + 0.6 - i * 0.5), [i]);
  const door = useMemo(() => new THREE.Vector3(DOOR.x, DOOR.y, DOOR.z - i * 0.1), [i]);
  useFrame(() => {
    const o = g.current;
    const cut = useSnitch.getState().cut;
    if (!o || !cut) return;
    const t = sinceCut(cut);
    const outside = cut.state === "go" ? cut.beat === "arrive" : cut.beat === "exit";
    let k = 0;
    let show = false;
    let want: Emote = "sprint";
    if (!outside) show = false;
    else if (cut.state === "go") {
      k = ease((t - 3.3 - i * 0.25) / 1.3);
      show = t > 3.3 + i * 0.25 && k < 1;
    } else if (cut.state === "clean") {
      k = 1 - ease((t - i * 0.12) / 0.8);
      show = k > 0.02;
    } else if (cut.caught) {
      // boxed in: they stop halfway, drop to their knees and put their hands up
      const run = ease((t - i * 0.15) / 1.0);
      k = 1 - run * 0.5;
      show = true;
      if (run >= 1) want = "surrender";
    } else {
      // make it to the van while the police cars are still braking
      const run = ease((t - i * 0.18) / 1.1);
      k = 1 - run;
      show = run < 0.98;
    }
    o.visible = show;
    o.position.lerpVectors(van, door, k);
    if (want === "surrender") o.rotation.y = Math.atan2(-1.6 - o.position.x, 3.4 - o.position.z);
    else {
      const dir = cut.state === "go" ? door : van;
      o.rotation.y = Math.atan2(dir.x - o.position.x, dir.z - o.position.z);
    }
    if (want !== act) setAct(want);
  });
  if (!member) return null;
  return (
    <group ref={g} visible={false}>
      <Suspense fallback={null}>
        <Character model={member.model} outfit={member.outfit} phase={i} emote={act} pistol={act === "sprint"} />
      </Suspense>
    </group>
  );
}

/** An officer gets out of each police car once it has stopped, and covers the van. */
function StreetCop({ i }: { i: number }) {
  const g = useRef<THREE.Group>(null);
  const cut = useSnitch((s) => s.cut);
  const look = COP_LOOK[cut?.bust ?? "patrol"];
  const from = useMemo(() => (i ? new THREE.Vector3(1.2, 0, -7.0) : new THREE.Vector3(-0.4, 0, 2.6)), [i]);
  const to = useMemo(() => (i ? new THREE.Vector3(1.9, 0, -5.4) : new THREE.Vector3(0.7, 0, 1.4)), [i]);
  const [act, setAct] = useState<Emote>("walk");
  useFrame(() => {
    const o = g.current;
    const c = useSnitch.getState().cut;
    if (!o || !c) return;
    const t = sinceCut(c) - (c.bust === "ambush" ? 0.7 : 1.2) - i * 0.3;
    o.visible = t > 0;
    const k = ease(t / 1.1);
    o.position.lerpVectors(from, to, k);
    // cover the van, or the crew kneeling in the street
    const aim = c.caught ? DOOR : new THREE.Vector3(2.7, 0, PARK_Z);
    o.rotation.y = Math.atan2(aim.x - o.position.x, aim.z - o.position.z);
    const want: Emote = k >= 1 ? "aim" : "walk";
    if (want !== act) setAct(want);
  });
  return (
    <group ref={g} visible={false} position={from}>
      <Suspense fallback={null}>
        <Character model={copModel(cut?.bust ?? "patrol", i)} outfit={look.outfit} uniform={look.uniform} phase={i + 5} emote={act} pistol />
      </Suspense>
    </group>
  );
}

/** Driven only by what the player already knows. */
export function Street() {
  const cut = useSnitch((s) => s.cut);
  const van = useRef<THREE.Group>(null);
  const copA = useRef<THREE.Group>(null);
  const copB = useRef<THREE.Group>(null);
  const red = useRef<THREE.PointLight>(null);
  const blue = useRef<THREE.PointLight>(null);
    const cash = useRef<THREE.Points>(null);
  const cashGeo = useMemo(() => {
    const n = 90;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.userData.v = [...Array(n)].map(() => new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3));
    return g;
  }, []);
  const bust = cut?.bust ?? "patrol";
  // the weather changes from night to night: about one job in three is dry
  const wet = !cut || seedOf(cut.job) % 3 !== 0;
  const raiding = cut?.state === "tipped" && cut.beat === "exit";
  const kinds: [CarKind, CarKind] =
    bust === "detectives" ? ["unmarked", "unmarked"] : bust === "swat" || bust === "allin" ? ["swat", "patrol"] : ["patrol", "patrol"];

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    // Arrival runs from job start; the result plays when the film cuts back outside.
    const live = cut && (cut.state === "go" || cut.beat === "exit");
    const since = cut ? (performance.now() - (cut.state === "go" ? cut.at : cut.beatAt)) / 1000 : 0;
    const state = live ? cut.state : cut ? "go" : "idle";
    const parkZ = PARK_Z;
    // van: rolls in, waits, then leaves (clean) or is boxed in (tipped)
    if (van.current) {
      let z = -40;
      if (state === "go") z = THREE.MathUtils.lerp(-34, parkZ, ease(since / 3.2));
      else if (state === "tipped") z = parkZ;
      else if (state === "clean") z = parkZ + Math.pow(Math.max(0, since - 0.7), 2) * 9;
      van.current.position.set(2.7, Math.sin(t * 22) * 0.004, z);
    }
    // police: two cars close the street from both ends; in an ambush they were parked there all along
    const arrive = state !== "tipped" ? 0 : bust === "ambush" ? 1 : ease(since / 1.1);
    copA.current?.position.set(-1.6, 0, THREE.MathUtils.lerp(34, 3.4, arrive));
    copB.current?.position.set(0.4, 0, THREE.MathUtils.lerp(-40, -8.2, arrive));
    if (copA.current) copA.current.rotation.y = Math.PI + 0.5 * arrive;
    if (copB.current) copB.current.rotation.y = -0.35 * arrive;
    const flash = Math.floor(t * 5) % 2;
    const on = state === "tipped" && (bust !== "ambush" || since > 0.6) ? 1 : 0;
    if (red.current) red.current.intensity = on * (flash ? 90 : 6);
    if (blue.current) blue.current.intensity = on * (flash ? 6 : 90);
    // cash burst on a clean job
    if (cash.current) {
      const a = cashGeo.attributes.position as THREE.BufferAttribute;
      const v = cashGeo.userData.v as THREE.Vector3[];
      const u = Math.max(0, since);
      cash.current.visible = state === "clean" && u < 3;
      for (let i = 0; i < v.length; i++) a.setXYZ(i, DOOR.x - 1 + v[i].x * u, 0.6 + v[i].y * u - 4.5 * u * u, v[i].z * u);
      a.needsUpdate = true;
      (cash.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - u / 2.6);
    }
    void dt;
  });

  return (
    <group position={[STREET_X, 0, 0]}>
      <StreetSet name={cut?.job ?? "Pawn shop"} venue={cut?.venue} alarm={cut?.state === "tipped" && cut.beat === "exit"} />

      <Car carRef={van} />
      <Car kind={kinds[0]} carRef={copA} lit={bust !== "ambush" || raiding} />
      <Car kind={kinds[1]} carRef={copB} lit={bust !== "ambush" || raiding} />
      <Floodlights active={bust === "harbour" || bust === "allin"} />
      <Helicopter active={bust === "helicopter" || bust === "allin"} />
      <Roadblock active={bust === "roadblock" || bust === "allin"} />
      {cut?.team.slice(0, 4).map((id, i) => <Runner key={id} i={i} id={id} />)}
      {raiding && [0, 1].map((i) => <StreetCop key={i} i={i} />)}
      <points ref={cash} geometry={cashGeo} visible={false}>
        <pointsMaterial color={CYAN} size={0.12} transparent depthWrite={false} toneMapped={false} />
      </points>
      <pointLight ref={red} position={[-1, 2.2, 3]} color={HEAT} intensity={0} distance={30} />
      <pointLight ref={blue} position={[0.5, 2.2, -7]} color="#1f6bff" intensity={0} distance={30} />
      {wet && <Rain />}
    </group>
  );
}
