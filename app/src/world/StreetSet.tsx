import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Prop } from "./Prop";
import { useSurface, type Surface } from "./pbr";
import { Sign } from "./Venues";

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
function Shopfront({ name, alarm }: { name: string; alarm: boolean }) {
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: "#141316", roughness: 0.5, metalness: 0.5 }), []);
  // the room seen through the glass
  const inside = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 336;
    const g = c.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 0, 336);
    bg.addColorStop(0, "#5a4326");
    bg.addColorStop(1, "#1d140b");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 336);
    g.filter = "blur(2px)";
    for (let row = 0; row < 3; row++) {
      g.fillStyle = "#1a120a";
      g.fillRect(20, 70 + row * 80, 472, 8);
      for (let i = 0; i < 14; i++) {
        const w = 14 + ((i * 37 + row * 11) % 22);
        const h = 22 + ((i * 53 + row * 7) % 40);
        g.fillStyle = ["#c8a45a", "#7a8fa8", "#a8553c", "#d9d2c0", "#3f5a4a", "#2a2a30"][(i + row * 2) % 6];
        g.fillRect(28 + i * 33, 70 + row * 80 - h, w, h);
      }
    }
    g.filter = "none";
    g.fillStyle = "rgba(255,214,150,0.16)";
    g.fillRect(0, 0, 512, 60);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
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
      <Sign text={name.toUpperCase()} color="#ff2d6f" width={3.6} position={[0, 3.25, 0.18]} />
      <Prop url={P + "security_camera.glb"} longest={0.4} position={[-2.7, 3.0, 0.3]} rotation={[0.3, 0.6, 0]} />
      <Prop url={P + "aircon_unit.glb"} longest={0.9} position={[2.6, 4.2, 0.25]} />
      <pointLight position={[0.8, 2.0, 1.6]} color={alarm ? "#ff2d6f" : "#ffd29a"} intensity={alarm ? 10 : 16} distance={9} />
    </group>
  );
}

const BLOCKS: Block[] = (() => {
  const r = rng(11);
  const out: Block[] = [];
  const kinds: Surface[] = ["brick_red", "brick_dark", "concrete_wall", "plaster_worn", "facade_tiles_dark", "brick_dark"];
  for (const side of [1, -1] as const)
    for (let z = -36; z < 30; ) {
      const target = side === 1 && z <= -3.2 && z + 7 > 0;
      const w = target ? 6.4 : 5 + Math.floor(r() * 3) * 1.2;
      const zz = target ? -3.2 : z;
      out.push({ z: zz + w / 2, w, h: FLOOR_H * (target ? 3 : 2 + Math.floor(r() * 4)), d: 9, surface: target ? "brick_dark" : kinds[Math.floor(r() * kinds.length)], side });
      z = zz + w + 0.02;
    }
  return out;
})();

export function StreetSet({ name, alarm }: { name: string; alarm: boolean }) {
  const road = useSurface("asphalt_road", [8, 90], 4, { roughness: 0.62, envMapIntensity: 1.4 });
  const pave = useSurface("pavement_concrete", [3, 90], 2.5);
  const { lit, dark, frame } = useMemo(() => ({ lit: [] as THREE.Matrix4[], dark: [] as THREE.Matrix4[], frame: [] as THREE.Matrix4[] }), []);
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

      {BLOCKS.map((b, i) => (
        <group key={i}>
          <Building b={b} lit={lit} dark={dark} frame={frame} />
          {!(b.side === 1 && Math.abs(b.z) < 3.3) && <ShutteredFront z={b.z} w={b.w} side={b.side} />}
        </group>
      ))}
      <Windows lit={lit} dark={dark} frame={frame} />
      <Shopfront name={name} alarm={alarm} />

      {/* street furniture */}
      {[-22, -6, 12].map((z, i) => (
        <group key={z} position={[(i % 2 ? -1 : 1) * (KERB_X + 0.45), 0.15, z]}>
          <Prop url={P + "street_light_modern.glb"} height={7.2} rotation={[0, i % 2 ? Math.PI / 2 : -Math.PI / 2, 0]} />
          <pointLight position={[(i % 2 ? 1 : -1) * 1.6, 6.6, 0]} color="#ffb46b" intensity={90} distance={20} decay={1.8} />
        </group>
      ))}
      <Prop url={P + "fire_hydrant.glb"} height={0.75} position={[KERB_X + 0.5, 0.15, 3.6]} />
      <Prop url={P + "dumpster.glb"} width={1.9} position={[FRONT_X - 1.0, 0.15, -8.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop url={P + "trash_bag.glb"} longest={0.7} position={[FRONT_X - 0.9, 0.15, -6.6]} />
      <Prop url={P + "trash_bag.glb"} longest={0.6} position={[FRONT_X - 1.5, 0.15, -6.9]} rotation={[0, 1, 0]} />
      <Prop url={P + "trash_can.glb"} height={0.85} position={[KERB_X + 0.6, 0.15, -3.9]} />
      <Prop url={P + "payphone.glb"} height={1.9} position={[-(KERB_X + 2.3), 0.15, 2.5]} rotation={[0, Math.PI / 2, 0]} />
      <Prop url={P + "utility_box.glb"} height={1.3} position={[-(FRONT_X - 0.5), 0.15, -5.2]} rotation={[0, Math.PI / 2, 0]} />
      <Prop url={P + "street_bench.glb"} width={1.8} position={[-(KERB_X + 1.8), 0.15, -11]} rotation={[0, Math.PI / 2, 0]} />
      <Prop url={P + "manhole_cover.glb"} longest={0.8} position={[-1.6, 0.005, -4.5]} />
      <Prop url={P + "traffic_cone.glb"} height={0.7} position={[KERB_X - 0.5, 0, 6.5]} />
      <Prop url={P + "concrete_barrier.glb"} width={2} position={[-(KERB_X + 1.2), 0.15, 9]} rotation={[0, 0.2, 0]} />
      {/* parked cars */}
      <Prop url="/real/vehicles/hatchback.glb" depth={4.0} position={[-(KERB_X - 1.05), 0, -9]} tint="#6d2a2a" />
      <Prop url="/real/vehicles/pickup.glb" depth={5.3} position={[-(KERB_X - 1.1), 0, 5.5]} rotation={[0, Math.PI, 0]} tint="#44505c" />
      <Prop url="/real/vehicles/covered_car.glb" depth={4.3} position={[KERB_X - 1.05, 0, -16]} />
      {/* signs down the street */}
      <Sign text="LIQUOR" color="#00e5ff" width={2.2} position={[-(FRONT_X - 0.1), 3.4, -13.5]} rotation={[0, Math.PI / 2, 0]} />
      <Sign text="24 HR" color="#9d5cff" width={1.6} position={[FRONT_X - 0.1, 3.4, 9.5]} rotation={[0, -Math.PI / 2, 0]} />
      <pointLight position={[-(FRONT_X - 1.5), 3.2, -13.5]} color="#00e5ff" intensity={18} distance={10} />
      <pointLight position={[FRONT_X - 1.5, 3.2, 9.5]} color="#9d5cff" intensity={18} distance={10} />
    </group>
  );
}
