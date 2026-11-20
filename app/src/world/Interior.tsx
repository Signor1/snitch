import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { audio } from "../fx/audio";
import type { Target, Venue as VenueKind } from "../game/data";
import { COP_LOOK } from "../game/looks";
import { useSnitch, type Cut } from "../game/store";
import { Character, type Emote } from "./Character";
import { precompile } from "./Region";
import { STREET_X } from "./Street";
import { Goal, Venue } from "./Venues";

/** Interior set, far from the others. */
export const INSIDE_X = 160;
const HEAT = "#ff2d6f";
const DOOR = new THREE.Vector3(4.6, 0, 1.2);
const BACK = new THREE.Vector3(-4.6, 0, -2.2);
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

type XZ = [number, number];
/** One stop on a robber's round. */
interface Stop {
  at: XZ;
  face: XZ;
  emote: Emote;
  dwell: number;
}
const stop = (at: XZ, face: XZ, emote: Emote, dwell: number): Stop => ({ at, face, emote, dwell });

/** Lead: case to case, round the table, or kneeling at the safe. */
function leadRound(target: Target, venue: VenueKind): Stop[] {
  if (target === "cases" && venue !== "dock" && venue !== "tunnel")
    return [
      stop([-3.75, -2.0], [-3.75, -2.75], "pickup", 2.2),
      stop([-2.15, -2.0], [-2.15, -2.75], "interact", 2.0),
      stop([-3.85, -0.2], [-4.65, -0.2], "pickup", 2.2),
    ];
  if (target === "cases")
    return [
      stop([-3.6, -1.9], [-3.6, -2.7], "open", 2.4),
      stop([-2.2, -2.0], [-2.2, -2.8], "pickup", 2.0),
      stop([-3.6, -1.0], [-4.4, -1.4], "open", 2.4),
    ];
  if (target === "table")
    return [
      stop([-1.6, -1.9], [-2.7, -2.2], "pickup", 2.0),
      stop([-2.7, -1.15], [-2.7, -2.2], "pickup", 2.0),
      stop([-3.7, -1.6], [-2.7, -2.2], "interact", 2.0),
    ];
  return [stop([-2.7, -2.15], [-2.7, -3.2], "fix", 99)];
}
/** Second: covers the clerk the whole time. */
const COVER = [stop([0.9, -0.6], [2.1, -2.6], "aim", 99)];
/** Third: loots the till and shelves. */
const LOOT = [stop([3.0, -1.75], [3.05, -2.45], "interact", 2.0), stop([1.2, -2.45], [1.2, -3.2], "pickup", 2.0), stop([-0.1, -2.45], [-0.1, -3.2], "pickup", 2.0)];
/** Fourth: by the door, watching the street. */
const WATCH = [stop([3.4, 1.4], [DOOR.x, DOOR.z], "gunIdle", 3.5), stop([4.3, 2.9], [5.4, 3.3], "gunIdle", 2.5)];

const WALK = 1.35; // metres per second
const COPS: [number, number][] = [
  [3.5, 0.5],
  [3.7, 2.0],
  [2.6, -1.0],
];

const since = (cut: Cut) => (performance.now() - cut.beatAt) / 1000;

function Robber({ i, id }: { i: number; id: number }) {
  const g = useRef<THREE.Group>(null);
  const cut = useSnitch((s) => s.cut)!;
  const model = useSnitch((s) => s.crew[id]?.model ?? "gang_m1");
  const outfit = useSnitch((s) => s.crew[id]?.outfit);
  const round = useMemo(() => [leadRound(cut.target, cut.venue), COVER, LOOT, WATCH][i] ?? COVER, [i, cut.target, cut.venue]);
  const beat = cut.beat;
  const fight = beat === "payoff" && cut.state === "tipped";
  const leave = beat === "payoff" && cut.state === "clean";
  // walking to stop k, or working at it
  const nav = useRef({ k: 0, arrived: false, until: 0, from: DOOR.clone(), start: 0 });
  const [act, setAct] = useState<Emote>("walk");
  const fled = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    // fresh round each time the crew walks in
    nav.current = { k: 0, arrived: false, until: 0, from: DOOR.clone(), start: performance.now() / 1000 + i * 0.6 };
    setAct("walk");
  }, [cut.at, i]);
  useEffect(() => {
    if (leave) setAct("walk");
    else if (fight) setAct("shoot");
  }, [leave, fight]);

  useFrame(() => {
    const o = g.current;
    if (!o) return;
    const now = performance.now() / 1000;
    if (fight || leave) {
      // fight: hold and shoot, then run for the back. clean: walk out the front.
      if (!fled.current) fled.current = o.position.clone();
      // in an ambush the police come from the back, so the crew breaks out the front
      const dest = fight && cut.bust !== "ambush" ? BACK : DOOR;
      const delay = fight ? 2.4 + i * 0.15 : 0.6 + i * 0.35;
      const t = since(cut) - delay;
      if (t > 0) {
        if (fight && act !== "sprint") setAct("sprint");
        const d = fled.current.distanceTo(dest);
        const k = Math.min(1, (t * (fight ? 4 : WALK)) / Math.max(0.01, d));
        o.position.lerpVectors(fled.current, dest, k);
      }
      const look = fight && t <= 0 ? DOOR : dest;
      o.rotation.y = Math.atan2(look.x - o.position.x, look.z - o.position.z);
      return;
    }
    fled.current = null;
    if (beat !== "inside") return;
    const n = nav.current;
    if (now < n.start) {
      o.position.copy(DOOR);
      return;
    }
    const s = round[n.k % round.length];
    const to = new THREE.Vector3(s.at[0], 0, s.at[1]);
    if (!n.arrived) {
      const d = n.from.distanceTo(to);
      const k = Math.min(1, ((now - n.start) * WALK) / Math.max(0.01, d));
      o.position.lerpVectors(n.from, to, k);
      o.rotation.y = Math.atan2(to.x - o.position.x, to.z - o.position.z);
      if (k >= 1) {
        n.arrived = true;
        n.until = now + s.dwell;
        setAct(s.emote);
      }
    } else {
      const f = new THREE.Vector3(s.face[0], 0, s.face[1]);
      const want = Math.atan2(f.x - o.position.x, f.z - o.position.z);
      o.rotation.y += Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y)) * 0.15;
      if (now > n.until && round.length > 1) {
        n.from = to.clone();
        n.k++;
        n.arrived = false;
        n.start = now;
        setAct("walk");
      }
    }
  });

  return (
    <group ref={g} position={DOOR}>
      <Suspense fallback={null}>
        <Character model={model} outfit={outfit} phase={i} emote={act} pistol={act === "aim" || act === "gunIdle" || act === "shoot" || (act === "walk" && i !== 0 && i !== 2)} />
      </Suspense>
    </group>
  );
}

// In an ambush they were waiting in the back room; every other raid comes through the front door.
const AMBUSH_SPOTS: [number, number][] = [
  [-3.2, -1.2],
  [-2.2, 0.6],
  [-4.0, 0.9],
];

function Cop({ i }: { i: number }) {
  const g = useRef<THREE.Group>(null);
  const cut = useSnitch((s) => s.cut)!;
  const look = COP_LOOK[cut.bust];
  const ambush = cut.bust === "ambush";
  const from = ambush ? new THREE.Vector3(BACK.x, 0, BACK.z) : new THREE.Vector3(DOOR.x + 1.5, 0, DOOR.z);
  const to = ambush ? AMBUSH_SPOTS[i] : COPS[i];
  useFrame(() => {
    const o = g.current;
    if (!o) return;
    const k = ease((since(cut) - (ambush ? 0.1 : 0.5) - i * 0.25) / 0.9);
    o.position.lerpVectors(from, new THREE.Vector3(to[0], 0, to[1]), k);
    const aim = ambush ? DOOR : new THREE.Vector3(-1.5, 0, -0.5);
    o.rotation.y = Math.atan2(aim.x - o.position.x, aim.z - o.position.z);
  });
  return (
    <group ref={g} position={from}>
      <Suspense fallback={null}>
        <Character model={i % 2 ? "cop_f" : "cop_m"} outfit={look.outfit} uniform={look.uniform} phase={i} emote="shoot" pistol />
      </Suspense>
    </group>
  );
}

/** A white flash and a bang as the SWAT team comes in. */
function Flashbang({ on }: { on: boolean }) {
  const l = useRef<THREE.PointLight>(null);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      if (l.current) l.current.intensity = 2600;
      audio.gunshot(false);
    }, 350);
    return () => clearTimeout(t);
  }, [on]);
  useFrame((_, dt) => {
    if (l.current) l.current.intensity = THREE.MathUtils.damp(l.current.intensity, 0, 5, dt);
  });
  return <pointLight ref={l} position={[2.4, 1.4, 0.6]} color="#ffffff" intensity={0} distance={22} />;
}

function Firefight({ on }: { on: boolean }) {
  const a = useRef<THREE.PointLight>(null);
  const b = useRef<THREE.PointLight>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    let n = 0;
    const fire = () => {
      if (!live || n++ > 16) return;
      audio.gunshot(n % 3 === 0);
      const l = n % 2 ? a.current : b.current;
      if (l) l.intensity = 90;
      setTimeout(fire, 110 + Math.random() * 260);
    };
    const t = setTimeout(fire, 1300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [on]);
  useFrame((_, dt) => {
    for (const l of [a.current, b.current]) if (l) l.intensity = THREE.MathUtils.damp(l.intensity, 0, 22, dt);
  });
  return (
    <>
      <pointLight ref={a} position={[3.3, 1.45, 1.2]} color="#ffd9a0" intensity={0} distance={9} />
      <pointLight ref={b} position={[-0.4, 1.45, -0.2]} color="#ffd9a0" intensity={0} distance={9} />
    </>
  );
}

export function Interior() {
  const cut = useSnitch((s) => s.cut);
  // Build the next job's venue off-screen during planning so walking in never waits.
  const nextJob = useSnitch((s) => s.chapter?.jobs[s.job]);
  const venue = cut?.venue ?? nextJob?.venue;
  const target = cut?.target ?? nextJob?.target;
  const name = cut?.job ?? nextJob?.name ?? "";
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!venue) return;
    const t = setTimeout(() => precompile(gl, scene, camera, [STREET_X, INSIDE_X]), 600);
    return () => clearTimeout(t);
  }, [venue, target, gl, scene, camera]);
  const red = useRef<THREE.PointLight>(null);
  const blue = useRef<THREE.PointLight>(null);
  const inside = !!cut && (cut.beat === "inside" || cut.beat === "payoff");
  const fight = !!cut && cut.beat === "payoff" && cut.state === "tipped";
  const open = !!cut && cut.beat === "payoff" && cut.state === "clean";

  const bust = cut?.bust ?? "patrol";
  const cops = COP_LOOK[bust].count;
  useFrame((st) => {
    const flash = Math.floor(st.clock.elapsedTime * 5) % 2;
    // an ambush has no sirens outside the door, only red emergency light
    const ambush = bust === "ambush";
    if (red.current) red.current.intensity = fight ? (ambush ? 40 + Math.sin(st.clock.elapsedTime * 9) * 12 : flash ? 70 : 4) : 0;
    if (blue.current) blue.current.intensity = fight && !ambush ? (flash ? 4 : 70) : 0;
  });

  return (
    <group position={[INSIDE_X, 0, 0]}>
      {venue && <Venue kind={venue} name={name} fight={fight} />}
      <pointLight ref={red} position={[6.6, 1.6, 3.2]} color={HEAT} intensity={0} distance={16} />
      <pointLight ref={blue} position={[6.6, 1.6, 1.2]} color="#1f6bff" intensity={0} distance={16} />

      {venue && target && <Goal target={target} venue={venue} open={open} />}
      {cut && inside && (
        <>
          {cut.team.slice(0, 4).map((id, i) => (
            <Robber key={id} i={i} id={id} />
          ))}
          <group position={[2.1, 0, -3.05]} rotation={[0, 0, 0]}>
            <Suspense fallback={null}>
              <Character model="gang_m3" emote="crouch" />
            </Suspense>
          </group>
          {fight && COPS.slice(0, cops).map((_, i) => <Cop key={i} i={i} />)}
        </>
      )}
      <Firefight on={fight} />
      <Flashbang on={fight && (bust === "swat" || bust === "allin")} />
    </group>
  );
}
