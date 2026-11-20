import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Prop } from "./Prop";
import { useSurface, type Surface } from "./pbr";
import { Sign } from "./Venues";
import type { Venue } from "../game/data";
import { districtOf, seedOf, type District } from "./places";

// Road runs along Z; the mark is on the +X side at z = 0.

const P = "/real/props/";
export const KERB_X = 4;
export const FRONT_X = 7; // building line
const FLOOR_H = 3.1;

interface Block {
  z: number;
  w: number; // along the street
  h: number;
  d: number;
  surface: Surface;
  side: 1 | -1;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function Building({ b, lit, dark, frame }: { b: Block; lit: THREE.Matrix4[]; dark: THREE.Matrix4[]; frame: THREE.Matrix4[] }) {
  const wall = useSurface(b.surface, [b.w, b.h], b.surface.startsWith("brick") ? 2.2 : 3);
  const side = useSurface(b.surface, [b.d, b.h], b.surface.startsWith("brick") ? 2.2 : 3);
  const x = b.side * (FRONT_X + b.d / 2);
  // windows go into the parent's shared instanced meshes
  useMemo(() => {
    const r = rng(Math.round(b.z * 13 + b.side * 7 + 99));
    const floors = Math.floor(b.h / FLOOR_H) - 1;
    const bays = Math.max(1, Math.floor(b.w / 2.3));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (-b.side * Math.PI) / 2, 0));
    for (let f = 0; f < floors; f++)
      for (let k = 0; k < bays; k++) {
        const pos = new THREE.Vector3(b.side * (FRONT_X - 0.02), FLOOR_H * (f + 1) + 1.55, b.z - b.w / 2 + (k + 0.5) * (b.w / bays));
        m.compose(pos, q, new THREE.Vector3(1.15, 1.55, 1));
        (r() < 0.3 ? lit : dark).push(m.clone());
        m.compose(pos.clone().setX(b.side * (FRONT_X - 0.05)), q, new THREE.Vector3(1.33, 1.73, 1));
        frame.push(m.clone());
      }
  }, [b, lit, dark, frame]);
  return (
    <group>
      <mesh position={[x, b.h / 2, b.z]} material={[side, side, wall, wall, wall, wall]} castShadow receiveShadow>
        <boxGeometry args={[b.d, b.h, b.w]} />
      </mesh>
      {/* face the wall scan the right way round */}
      <mesh position={[b.side * (FRONT_X - 0.005), b.h / 2, b.z]} rotation={[0, (-b.side * Math.PI) / 2, 0]} material={wall} receiveShadow>
        <planeGeometry args={[b.w, b.h]} />
      </mesh>
      {/* cornice and a ledge over the ground floor */}
      <mesh position={[b.side * (FRONT_X - 0.1), b.h + 0.12, b.z]}>
        <boxGeometry args={[0.5, 0.3, b.w + 0.1]} />
        <meshStandardMaterial color="#2b2a2c" roughness={0.9} />
      </mesh>
      <mesh position={[b.side * (FRONT_X - 0.12), FLOOR_H + 0.25, b.z]}>
        <boxGeometry args={[0.3, 0.16, b.w]} />
        <meshStandardMaterial color="#3a3836" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Instanced: the whole block's windows in three draw calls. */
function Windows({ lit, dark, frame }: { lit: THREE.Matrix4[]; dark: THREE.Matrix4[]; frame: THREE.Matrix4[] }) {
  const a = useRef<THREE.InstancedMesh>(null);
  const b = useRef<THREE.InstancedMesh>(null);
  const c = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const fill = (mesh: THREE.InstancedMesh | null, ms: THREE.Matrix4[], tint?: boolean) => {
      if (!mesh) return;
      const col = new THREE.Color();
      ms.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        if (tint) mesh.setColorAt(i, col.set(["#ffd9a0", "#ffe9c9", "#cfe6ff", "#ffc680"][i % 4]));
      });
      mesh.count = ms.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    fill(a.current, lit, true);
    fill(b.current, dark);
    fill(c.current, frame);
  });
  return (
    <>
      <instancedMesh ref={c} args={[undefined, undefined, 600]} frustumCulled={false}>
        <planeGeometry />
        <meshStandardMaterial color="#1c1b1d" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={b} args={[undefined, undefined, 600]} frustumCulled={false}>
        <planeGeometry />
        <meshStandardMaterial color="#0a0d12" roughness={0.08} metalness={0.9} envMapIntensity={1.6} />
      </instancedMesh>
      <instancedMesh ref={a} args={[undefined, undefined, 300]} frustumCulled={false}>
        <planeGeometry />
        <meshStandardMaterial color="#ffffff" emissive="#ffd9a0" emissiveIntensity={0.9} roughness={0.4} />
      </instancedMesh>
    </>
  );
}

function ShutteredFront({ z, w, side }: { z: number; w: number; side: 1 | -1 }) {
  const shutter = useSurface("metal_shutter", [w - 0.8, 2.5], 2.5, { roughness: 0.9 });
  return (
    <group position={[side * (FRONT_X - 0.06), 0, z]} rotation={[0, (-side * Math.PI) / 2, 0]}>
      <mesh position={[0, 1.3, 0]} material={shutter}>
        <planeGeometry args={[w - 0.8, 2.5]} />
      </mesh>
      <mesh position={[0, 2.72, 0.05]}>
        <boxGeometry args={[w - 0.6, 0.34, 0.14]} />
        <meshStandardMaterial color="#232226" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** The mark's shopfront. */
// what the window shows and how the front is finished, by the kind of place
const FRONT: Partial<Record<Venue, { goods: string[]; glow: [string, string]; trim: string; sign: string }>> = {
  pawn: { goods: ["#c8a45a", "#7a8fa8", "#a8553c", "#d9d2c0", "#3f5a4a", "#2a2a30"], glow: ["#5a4326", "#1d140b"], trim: "#141316", sign: "#ff2d6f" },
  jewel: { goods: ["#f2d27a", "#e8e8f0", "#c9a227", "#9fd8ff", "#f2d27a", "#ffffff"], glow: ["#3a3550", "#0e0c18"], trim: "#1a1a20", sign: "#00e5ff" },
  cards: { goods: ["#14532d", "#c81e3c", "#e8e2d0", "#2a1710", "#ffc98a", "#14532d"], glow: ["#4a1d1d", "#140808"], trim: "#1c0f0c", sign: "#ff2d6f" },
  bank: { goods: ["#9a968c", "#d9d5cb", "#5a5a5e", "#c9ccd0", "#3a3d42", "#9a968c"], glow: ["#3a3f48", "#14161a"], trim: "#22252a", sign: "#00e5ff" },
  casino: { goods: ["#ffc23d", "#c81e3c", "#14532d", "#ffffff", "#ffc23d", "#3a0f1a"], glow: ["#4a2a10", "#1a0c06"], trim: "#2e1d0c", sign: "#ffc23d" },
  church: { goods: ["#5b3bb0", "#ffcf8f", "#e8e1d2", "#3b2a6b", "#ffb347", "#5b3bb0"], glow: ["#2a2240", "#0c0a14"], trim: "#2a241c", sign: "#ffcf8f" },
  mint: { goods: ["#e3b341", "#c9ccd0", "#e3b341", "#9a9ea4", "#e3b341", "#ffffff"], glow: ["#3a4048", "#121418"], trim: "#22262c", sign: "#00e5ff" },
  dock: { goods: ["#7b6a45", "#5a5a52", "#8a3b2a", "#34403a", "#7b6a45", "#2a2a30"], glow: ["#2a2a26", "#0c0c0a"], trim: "#1c1d1f", sign: "#ffa23a" },
  tunnel: { goods: ["#5a5a52", "#3a3836", "#7a6a4a", "#2a2a30", "#5a5a52", "#3a3836"], glow: ["#1e2024", "#0a0a0c"], trim: "#1c1d1f", sign: "#ff2d6f" },
};

function Shopfront({ name, alarm, venue }: { name: string; alarm: boolean; venue?: Venue }) {
  const front = FRONT[venue ?? "pawn"] ?? FRONT.pawn!;
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: front.trim, roughness: 0.5, metalness: 0.5 }), [front]);
  // the room seen through the glass
  const inside = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 336;
    const g = c.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 0, 336);
    bg.addColorStop(0, front.glow[0]);
    bg.addColorStop(1, front.glow[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 336);
    g.filter = "blur(2px)";
    for (let row = 0; row < 3; row++) {
      g.fillStyle = "#1a120a";
      g.fillRect(20, 70 + row * 80, 472, 8);
      for (let i = 0; i < 14; i++) {
        const w = 14 + ((i * 37 + row * 11) % 22);
        const h = 22 + ((i * 53 + row * 7) % 40);
        g.fillStyle = front.goods[(i + row * 2) % 6];
        g.fillRect(28 + i * 33, 70 + row * 80 - h, w, h);
      }
    }
    g.filter = "none";
    g.fillStyle = "rgba(255,214,150,0.16)";
    g.fillRect(0, 0, 512, 60);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [front]);
  return (
    <group position={[FRONT_X - 0.08, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* surround */}
      <mesh position={[0, 1.5, -0.02]} material={trim}>
        <planeGeometry args={[6.4, 3]} />
      </mesh>
      {/* interior seen through the glass */}
      <mesh position={[1.55, 1.45, 0.01]}>
        <planeGeometry args={[2.9, 1.9]} />
        <meshStandardMaterial map={inside} emissiveMap={inside} emissive={alarm ? "#7a3040" : "#ffffff"} emissiveIntensity={alarm ? 0.35 : 0.55} />
      </mesh>
      <mesh position={[1.55, 1.45, 0.06]}>
        <planeGeometry args={[2.9, 1.9]} />
        <meshPhysicalMaterial color="#a8c4dc" transparent opacity={0.16} roughness={0.03} metalness={0.2} envMapIntensity={2.2} />
      </mesh>
      {[0.08, 3.02].map((x) => (
        <mesh key={x} position={[x, 1.45, 0.07]} material={trim}>
          <boxGeometry args={[0.07, 2, 0.07]} />
        </mesh>
      ))}
      <Prop url="/real/shop/open_sign.glb" width={0.62} position={[2.3, 1.75, 0.09]} emissive={alarm ? 0.3 : 5} />
      <Prop url="/real/shop/shop_door.glb" height={2.25} position={[-1.3, 0, 0.02]} />
      <mesh position={[-1.3, 1.1, -0.01]}>
        <planeGeometry args={[1.0, 2.1]} />
        <meshStandardMaterial color="#1c1610" emissive="#ffcf8f" emissiveIntensity={alarm ? 0.1 : 0.45} />
      </mesh>
      {/* fascia with the name */}
      <mesh position={[0, 3.25, 0.08]}>
        <boxGeometry args={[6.4, 0.75, 0.16]} />
        <meshStandardMaterial color="#0d0c10" roughness={0.6} />
      </mesh>
      <Sign text={name.toUpperCase()} color={front.sign} width={3.6} position={[0, 3.25, 0.18]} />
      <Prop url={P + "security_camera.glb"} longest={0.4} position={[-2.7, 3.0, 0.3]} rotation={[0.3, 0.6, 0]} />
      <Prop url={P + "aircon_unit.glb"} longest={0.9} position={[2.6, 4.2, 0.25]} />
      <pointLight position={[0.8, 2.0, 1.6]} color={alarm ? "#ff2d6f" : "#ffd29a"} intensity={alarm ? 10 : 16} distance={9} />
    </group>
  );
}

// Crews don't hit the same street twice: each job gets its own street, seeded by the job's name, in the
// part of town its target belongs to. Light count never changes between streets (no shader recompiles).

const LOOK: Record<District, { walls: Surface[]; target: Surface; floors: [number, number]; lamp: string; signs: string[]; tones: string[] }> = {
  oldtown: { walls: ["brick_red", "brick_dark", "plaster_worn", "brick_dark"], target: "brick_dark", floors: [2, 4], lamp: "#ffb46b", signs: ["LIQUOR", "24 HR", "DINER", "CHECKS CASHED", "LAUNDRY", "PAWN"], tones: ["#00e5ff", "#9d5cff", "#ff2d6f", "#ffb347"] },
  downtown: { walls: ["facade_tiles_dark", "concrete_wall", "plaster_worn", "facade_tiles_dark"], target: "facade_tiles_dark", floors: [3, 6], lamp: "#e8f0ff", signs: ["HOTEL", "BAR", "PARKING", "OPEN LATE", "CLUB", "TAXI"], tones: ["#00e5ff", "#ffffff", "#ffc23d", "#9d5cff"] },
  industrial: { walls: ["corrugated_iron", "concrete_wall", "corrugated_iron"], target: "concrete_wall", floors: [1, 2], lamp: "#ffa23a", signs: ["BAY 4", "NO ENTRY", "FREIGHT", "GATE 2", "CUSTOMS"], tones: ["#ffa23a", "#ff2d6f", "#e8f0ff"] },
  parish: { walls: ["plaster_worn", "brick_red", "plaster_worn"], target: "plaster_worn", floors: [2, 3], lamp: "#ffcf8f", signs: ["BAKERY", "FLOWERS", "TAILOR", "CAFE"], tones: ["#ffcf8f", "#9d5cff", "#00e5ff"] },
};


function blocksFor(seed: number, d: District): Block[] {
  const r = rng(seed);
  const look = LOOK[d];
  const out: Block[] = [];
  const [lo, hi] = look.floors;
  for (const side of [1, -1] as const)
    for (let z = -36; z < 30; ) {
      const target = side === 1 && z <= -3.2 && z + 7 > 0;
      const w = target ? 6.4 : (d === "industrial" ? 8 : 5) + Math.floor(r() * 3) * 1.2;
      const zz = target ? -3.2 : z;
      const floors = target ? Math.max(2, lo + 1) : lo + Math.floor(r() * (hi - lo + 1));
      out.push({ z: zz + w / 2, w, h: FLOOR_H * floors, d: 9, surface: target ? look.target : look.walls[Math.floor(r() * look.walls.length)], side });
      z = zz + w + 0.02;
    }
  return out;
}

const CARS = ["/real/vehicles/hatchback.glb", "/real/vehicles/pickup.glb", "/real/vehicles/covered_car.glb", "/real/vehicles/saloon.glb", "/real/vehicles/saloon.glb", "/real/vehicles/van.glb"];
// the street cameras stand on the -x side, where a parked van would fill the shot
const LOW_CARS = CARS.filter((u) => !u.includes("van"));
const CAR_LENGTH: Record<string, number> = { pickup: 5.3, saloon: 4.7, van: 5.2 };
// what real cars come in: silver, black, white, grey, then a few colours
const PAINTS = ["#b8bcc2", "#16181c", "#e4e5e7", "#5c6168", "#1e2d4a", "#6a1c22", "#c8c0aa"];
const CAR_TINTS = ["#6d2a2a", "#44505c", "#2b3a2f", "#5a5a5e", "#1d2433", "#7a6a4a", undefined];
// kerbside spots clear of the van (+x lane, z around -2.6) and the police lanes
const SLOTS: [number, number][] = [
  [-(KERB_X - 1.05), -20],
  [-(KERB_X - 1.05), -14],
  [-(KERB_X - 1.05), -9],
  [-(KERB_X - 1.1), 5.5],
  [-(KERB_X - 1.05), 13],
  [KERB_X - 1.05, -16],
  [KERB_X - 1.05, 14],
];

export function StreetSet({ name, alarm, venue }: { name: string; alarm: boolean; venue?: Venue }) {
  const road = useSurface("asphalt_road", [8, 90], 4, { roughness: 0.62, envMapIntensity: 1.4 });
  const pave = useSurface("pavement_concrete", [3, 90], 2.5);
  const district = districtOf(venue);
  const look = LOOK[district];
  const seed = seedOf(name);
  const blocks = useMemo(() => blocksFor(seed, district), [seed, district]);
  // windows are collected per street, so a new street starts from empty lists
  const { lit, dark, frame } = useMemo(() => ({ lit: [] as THREE.Matrix4[], dark: [] as THREE.Matrix4[], frame: [] as THREE.Matrix4[] }), [blocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const dressing = useMemo(() => {
    const r = rng(seed + 7);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const slots = SLOTS.filter(() => r() < 0.55).slice(0, 4);
    return {
      cars: slots.map(([x, z]) => ({ x, z, url: pick(x < 0 ? LOW_CARS : CARS), tint: pick(CAR_TINTS), paint: pick(PAINTS), flip: r() < 0.5 })),
      shift: (r() - 0.5) * 6,
      signs: [pick(look.signs), pick(look.signs.filter((x) => x !== look.signs[0]))],
      tones: [pick(look.tones), pick(look.tones)],
      signZ: [-13.5 + (r() - 0.5) * 8, 9.5 + (r() - 0.5) * 6],
      clutter: r(),
    };
  }, [seed, look]);
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9b6a8", roughness: 0.75 }), []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4]} material={road} receiveShadow>
        <planeGeometry args={[8, 90]} />
      </mesh>
      {/* road markings */}
      {[...Array(15)].map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -40 + i * 5.2]} material={paint}>
          <planeGeometry args={[0.13, 2.4]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (KERB_X + 1.5), 0.075, -4]} rotation={[0, 0, 0]} material={[paint, paint, pave, pave, paint, paint]} receiveShadow>
            <boxGeometry args={[3, 0.15, 90]} />
          </mesh>
          <mesh position={[s * (KERB_X + 0.06), 0.08, -4]}>
            <boxGeometry args={[0.16, 0.17, 90]} />
            <meshStandardMaterial color="#77756f" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {blocks.map((b, i) => (
        <group key={`${seed}-${i}`}>
          <Building b={b} lit={lit} dark={dark} frame={frame} />
          {district !== "industrial" && !(b.side === 1 && Math.abs(b.z) < 3.3) && <ShutteredFront z={b.z} w={b.w} side={b.side} />}
        </group>
      ))}
      <Windows key={seed} lit={lit} dark={dark} frame={frame} />
      <Shopfront name={name} alarm={alarm} venue={venue} />

      {/* street furniture */}
      {[-22, -6, 12].map((z, i) => (
        <group key={z} position={[(i % 2 ? -1 : 1) * (KERB_X + 0.45), 0.15, z]}>
          <Prop url={P + "street_light_modern.glb"} height={7.2} rotation={[0, i % 2 ? Math.PI / 2 : -Math.PI / 2, 0]} />
          <pointLight position={[(i % 2 ? 1 : -1) * 1.6, 6.6, 0]} color={look.lamp} intensity={90} distance={20} decay={1.8} />
        </group>
      ))}
      <Prop url={P + "fire_hydrant.glb"} height={0.75} position={[KERB_X + 0.5, 0.15, 3.6]} />
      <Prop url={P + "dumpster.glb"} width={1.9} position={[FRONT_X - 1.0, 0.15, -8.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop url={P + "trash_bag.glb"} longest={0.7} position={[FRONT_X - 0.9, 0.15, -6.6]} />
      <Prop url={P + "trash_bag.glb"} longest={0.6} position={[FRONT_X - 1.5, 0.15, -6.9]} rotation={[0, 1, 0]} />
      <Prop url={P + "trash_can.glb"} height={0.85} position={[KERB_X + 0.6, 0.15, -3.9]} />
      {district !== "industrial" && <Prop url={P + "payphone.glb"} height={1.9} position={[-(KERB_X + 2.3), 0.15, 2.5 + dressing.shift]} rotation={[0, Math.PI / 2, 0]} />}
      <Prop url={P + "utility_box.glb"} height={1.3} position={[-(FRONT_X - 0.5), 0.15, -5.2]} rotation={[0, Math.PI / 2, 0]} />
      {district !== "industrial" && <Prop url={P + "street_bench.glb"} width={1.8} position={[-(KERB_X + 1.8), 0.15, -11 - dressing.shift]} rotation={[0, Math.PI / 2, 0]} />}
      {district === "industrial" &&
        [-14, -10, -6, -2, 2, 6].map((z) => (
          <group key={z} position={[-(FRONT_X - 0.6), 0.15, z]}>
            <Prop url={P + "chainlink_fence_panel.glb"} width={4} rotation={[0, Math.PI / 2, 0]} />
          </group>
        ))}
      <Prop url={P + "manhole_cover.glb"} longest={0.8} position={[-1.6, 0.005, -4.5]} />
      <Prop url={P + "traffic_cone.glb"} height={0.7} position={[KERB_X - 0.5, 0, 6.5]} />
      <Prop url={P + "concrete_barrier.glb"} width={2} position={[-(KERB_X + 1.2), 0.15, 9]} rotation={[0, 0.2, 0]} />
      {dressing.cars.map((c, i) => (
        <Prop
          key={`${seed}-${i}`}
          url={c.url}
          depth={CAR_LENGTH[c.url.split("/").pop()!.replace(".glb", "")] ?? 4.2}
          position={[c.x, 0, c.z]}
          rotation={[0, c.flip ? Math.PI : 0, 0]}
          {...(/saloon|van/.test(c.url) ? { paint: c.paint } : { tint: c.tint })}
        />
      ))}
      <Sign text={dressing.signs[0]} color={dressing.tones[0]} width={2.2} position={[-(FRONT_X - 0.1), 3.4, dressing.signZ[0]]} rotation={[0, Math.PI / 2, 0]} />
      <Sign text={dressing.signs[1]} color={dressing.tones[1]} width={1.8} position={[FRONT_X - 0.1, 3.4, dressing.signZ[1]]} rotation={[0, -Math.PI / 2, 0]} />
      <pointLight position={[-(FRONT_X - 1.5), 3.2, dressing.signZ[0]]} color={dressing.tones[0]} intensity={18} distance={10} />
      <pointLight position={[FRONT_X - 1.5, 3.2, dressing.signZ[1]]} color={dressing.tones[1]} intensity={18} distance={10} />
    </group>
  );
}
