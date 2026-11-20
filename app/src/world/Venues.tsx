import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Target, Venue as VenueKind } from "../game/data";
import { Prop } from "./Prop";
import { useSurface, type Surface } from "./pbr";

// Every venue is the same 11 x 9 m room so crew blocking never changes; only the dressing differs.

const R = "/real/props/";
const S = "/real/shop/";
type V3 = [number, number, number];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
export function Sign({ text, color, width, ...p }: { text: string; color: string; width: number } & Omit<React.ComponentProps<"mesh">, "children">) {
  const map = useMemo(
    () =>
      canvasTex(1024, 192, (g) => {
        g.clearRect(0, 0, 1024, 192);
        g.font = "900 120px Arial Black, Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = color;
        g.shadowBlur = 28;
        g.strokeStyle = color;
        g.lineWidth = 7;
        g.strokeText(text, 512, 100, 980);
        g.shadowBlur = 8;
        g.strokeStyle = "#ffffff";
        g.lineWidth = 2;
        g.strokeText(text, 512, 100, 980);
      }),
    [text, color],
  );
  return (
    <mesh {...p}>
      <planeGeometry args={[width, (width * 192) / 1024]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={1.5} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface Look {
  floor: Surface;
  floorTint: string;
  floorM: number;
  wall: Surface;
  wallTint: string;
  /** Lower-wall wood panelling, if any. */
  dado?: string;
  light: string;
  power: number;
  sign: string;
  tone: string;
  /** Not repainted, fully rough. */
  raw?: boolean;
  ceiling?: string;
  /** Ceiling fitting, or null when lamps hang elsewhere. */
  fitting?: string | null;
}
const LOOK: Record<VenueKind, Look> = {
  pawn: { floor: "floor_tiles_checker", floorTint: "#d8d2c4", floorM: 1.2, wall: "plaster_worn", wallTint: "#8f8068", dado: "#3b2a1c", light: "#ffe9c4", power: 34, sign: "PAWN · LOANS · GOLD", tone: "#ff2d6f" },
  jewel: { floor: "floor_tiles_checker", floorTint: "#f2efe8", floorM: 1.6, wall: "plaster_worn", wallTint: "#b9b0a2", dado: "#2b2320", light: "#fff6e6", power: 46, sign: "FINE JEWELLERY", tone: "#00e5ff" },
  cards: { floor: "wood_floor_worn", floorTint: "#a8806a", floorM: 2.4, wall: "plaster_worn", wallTint: "#5a1f22", dado: "#2a1710", light: "#ffc98a", power: 14, sign: "MEMBERS ONLY", tone: "#ff2d6f" },
  bank: { floor: "floor_tiles_checker", floorTint: "#bdb8ae", floorM: 2.0, wall: "plaster_worn", wallTint: "#9a968c", light: "#f4f1ea", power: 40, sign: "NIGHT DEPOSIT", tone: "#00e5ff" },
  dock: { floor: "pavement_concrete", floorTint: "#9c9a94", floorM: 3, wall: "corrugated_iron", wallTint: "#8a8f96", light: "#dfe8ff", power: 26, sign: "BAY 9", tone: "#9d5cff", raw: true, ceiling: "#2a2c30", fitting: "caged_ceiling_light.glb" },
  // The Golden Anchor
  casino: { floor: "wood_floor_worn", floorTint: "#7a2a2a", floorM: 2.4, wall: "plaster_worn", wallTint: "#1f4a37", dado: "#2e1d0c", light: "#ffd28a", power: 22, sign: "THE GOLDEN ANCHOR", tone: "#ffc23d", fitting: null },
  // St Brendan's
  church: { floor: "wood_floor_worn", floorTint: "#8a7560", floorM: 2.4, wall: "plaster_worn", wallTint: "#cfc6b4", dado: "#4a3524", light: "#ffcf8f", power: 12, sign: "ST BRENDAN'S", tone: "#ffcf8f", fitting: null },
  // the old tram tunnel
  tunnel: { floor: "pavement_concrete", floorTint: "#6d6c68", floorM: 2.5, wall: "concrete_wall", wallTint: "#77787a", light: "#bcd4ff", power: 10, sign: "TRAM 4 · NO ENTRY", tone: "#ff2d6f", raw: true, ceiling: "#1d1e20", fitting: "caged_ceiling_light.glb" },
  // The Port Solace Mint
  mint: { floor: "floor_tiles_checker", floorTint: "#c9ccd0", floorM: 1.6, wall: "concrete_wall", wallTint: "#a9adb2", light: "#f2f6ff", power: 48, sign: "PORT SOLACE MINT", tone: "#00e5ff", ceiling: "#cfd2d6" },
};

function Shell({ kind, fight }: { kind: VenueKind; fight: boolean }) {
  const look = LOOK[kind];
  const floorMat = useSurface(look.floor, [11, 9], look.floorM, { color: look.floorTint, roughness: look.raw ? 1 : 0.7 });
  const wallMat = useSurface(look.wall, [11, 3.6], look.raw ? 2 : 2.4, { color: look.wallTint, painted: !look.raw, roughness: look.raw ? 1 : 0.85, relief: kind === "jewel" || kind === "bank" || kind === "mint" ? 0.25 : 1 });
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16130f", roughness: 0.6 }), []);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floorMat} receiveShadow>
        <planeGeometry args={[11, 9]} />
      </mesh>
      {look.dado && (
        <>
          <mesh position={[0, 0.6, -3.48]} receiveShadow>
            <boxGeometry args={[10.8, 1.2, 0.04]} />
            <meshStandardMaterial color={look.dado} roughness={0.55} />
          </mesh>
          <mesh position={[-5.28, 0.6, 0]} receiveShadow>
            <boxGeometry args={[0.04, 1.2, 8.8]} />
            <meshStandardMaterial color={look.dado} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.21, -3.45]}>
            <boxGeometry args={[10.8, 0.05, 0.08]} />
            <meshStandardMaterial color={look.dado} roughness={0.4} />
          </mesh>
          <mesh position={[-5.25, 1.21, 0]}>
            <boxGeometry args={[0.08, 0.05, 8.8]} />
            <meshStandardMaterial color={look.dado} roughness={0.4} />
          </mesh>
        </>
      )}
      <mesh position={[0, 1.8, -3.6]} material={wallMat} receiveShadow>
        <boxGeometry args={[11, 3.6, 0.2]} />
      </mesh>
      <mesh position={[-5.4, 1.8, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat} receiveShadow>
        <boxGeometry args={[9, 3.6, 0.2]} />
      </mesh>
      {/* street wall: solid run, door, shop window */}
      <mesh position={[5.4, 1.8, -2.1]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <boxGeometry args={[4.8, 3.6, 0.2]} />
      </mesh>
      <mesh position={[5.4, 3.05, 2.4]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <boxGeometry args={[4.2, 1.1, 0.2]} />
      </mesh>
      <mesh position={[5.4, 0.35, 3.3]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <boxGeometry args={[2.4, 0.7, 0.2]} />
      </mesh>
      {/* window glass and frame */}
      <mesh position={[5.4, 1.6, 3.3]}>
        <boxGeometry args={[0.04, 1.8, 2.3]} />
        <meshStandardMaterial color="#9fc4e8" roughness={0.05} metalness={0.6} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {[2.12, 4.48].map((z) => (
        <mesh key={z} position={[5.4, 1.6, z]} material={dark}>
          <boxGeometry args={[0.14, 1.9, 0.07]} />
        </mesh>
      ))}
      {/* door frame and open leaf */}
      {[0.32, 2.08].map((z) => (
        <mesh key={z} position={[5.4, 1.25, z]} material={dark}>
          <boxGeometry args={[0.24, 2.5, 0.09]} />
        </mesh>
      ))}
      <Prop url={S + "shop_door.glb"} height={2.36} position={[4.98, 0.02, 0.62]} rotation={[0, Math.PI / 2 + 0.5, 0]} />
      <mesh position={[0, 3.62, 0]}>
        <boxGeometry args={[11, 0.06, 9]} />
        <meshStandardMaterial color={look.ceiling ?? "#d9d5cb"} roughness={0.95} />
      </mesh>
      {/* skirting */}
      <mesh position={[0, 0.07, -3.48]} material={dark}>
        <boxGeometry args={[11, 0.14, 0.04]} />
      </mesh>
      <mesh position={[-5.28, 0.07, 0]} material={dark}>
        <boxGeometry args={[0.04, 0.14, 9]} />
      </mesh>
      {/* ceiling lights, dimmed during the shooting */}
      {[-2.4, 1.6].map((x) => (
        <group key={x} position={[x, 3.5, 0.2]}>
          {kind === "cards" || look.fitting === null ? null : <Prop url={R + (look.fitting ?? "ceiling_tube_light.glb")} width={1.3} position={[0, -0.14, 0]} emissive={2.2} />}
          <pointLight color={look.light} intensity={fight ? look.power * 0.35 : look.power} distance={12} position={[0, -0.4, 0]} castShadow={false} />
        </group>
      ))}
      <Prop url={R + "security_camera.glb"} longest={0.42} position={[-5.0, 3.05, -3.2]} rotation={[0.3, Math.PI * 0.75, 0]} />
      <Sign text="EXIT" color="#3dff8a" width={0.7} position={[5.28, 2.75, 1.2]} rotation={[0, -Math.PI / 2, 0]} />
    </>
  );
}

function Shards({ w }: { w: number }) {
  const bits = useMemo(() => [...Array(26)].map(() => ({ x: (Math.random() - 0.5) * w * 1.3, z: 0.35 + Math.random() * 0.7, r: Math.random() * 6, s: 0.03 + Math.random() * 0.07 })), [w]);
  return (
    <>
      {bits.map((b, i) => (
        <mesh key={i} position={[b.x, 0.006, b.z]} rotation={[-Math.PI / 2, 0, b.r]}>
          <circleGeometry args={[b.s, 3]} />
          <meshPhysicalMaterial color="#e8f4ff" roughness={0.05} metalness={0.1} transparent opacity={0.55} />
        </mesh>
      ))}
    </>
  );
}

/** Cleared and smashed on a clean job. */
function Showcase({ open, w = 1.5, ...p }: { open: boolean; w?: number } & Omit<React.ComponentProps<"group">, "children">) {
  return (
    <group {...p}>
      <Prop url={S + "display_counter.glb"} width={w} hide={open ? ["display_counter_goods", "display_counter_glass"] : undefined} />
      {open && <Shards w={w} />}
      <pointLight position={[0, 0.95, 0]} color="#fff2d0" intensity={open ? 0.2 : 0.9} distance={1.6} />
    </group>
  );
}

function CagedCounter({ bars = true, register = true }: { bars?: boolean; register?: boolean }) {
  return (
    <group position={[2.1, 0, -2.45]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.0, 1.0, 0.7]} />
        <meshStandardMaterial color="#3b2717" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[3.1, 0.05, 0.8]} />
        <meshStandardMaterial color="#1d1712" roughness={0.35} />
      </mesh>
      {bars &&
        [...Array(19)].map((_, i) => (
          <mesh key={i} position={[-1.44 + i * 0.16, 2.3, 0.3]} visible={i < 8 || i > 11}>
            <cylinderGeometry args={[0.012, 0.012, 2.5, 6]} />
            <meshStandardMaterial color="#6b6e74" metalness={0.9} roughness={0.4} />
          </mesh>
        ))}
      {bars && (
        <mesh position={[0, 2.05, 0.3]}>
          <boxGeometry args={[3.0, 0.04, 0.03]} />
          <meshStandardMaterial color="#6b6e74" metalness={0.9} roughness={0.4} />
        </mesh>
      )}
      {register && <Prop url={S + "cash_register.glb"} height={0.42} position={[0.95, 1.045, -0.05]} rotation={[0, 0, 0]} />}
    </group>
  );
}

function Stock() {
  return (
    <>
      {[-0.5, 0.75].map((x, i) => (
        <Prop key={x} url={S + "shelf_with_goods.glb"} height={1.95} position={[x, 0, -3.22]} rotation={[0, i * Math.PI, 0]} />
      ))}
      <group position={[2.0, 0, -3.22]}>
        <Prop url={R + "steel_shelves.glb"} height={2.05} />
        <Prop url={S + "tv_wood.glb"} width={0.62} position={[0, 0.05, 0]} />
        <Prop url={S + "toolbox.glb"} longest={0.5} position={[0, 1.05, 0]} rotation={[0, 0.3, 0]} />
        <Prop url={S + "camera.glb"} longest={0.16} position={[-0.2, 1.55, 0]} rotation={[0, 0.5, 0]} />
        <Prop url={R + "boombox.glb"} longest={0.5} position={[0.1, 1.55, 0]} rotation={[0, -0.2, 0]} />
      </group>
      <group position={[3.25, 0, -3.22]}>
        <Prop url={R + "steel_shelves.glb"} height={2.05} />
        <Prop url={S + "tv_crt.glb"} width={0.5} position={[0, 1.05, 0]} rotation={[0, -0.15, 0]} />
        <Prop url={R + "suitcase.glb"} longest={0.6} position={[0, 0.55, 0]} rotation={[0, 0.3, 0]} />
        <Prop url={S + "laptop.glb"} longest={0.36} position={[0, 1.55, 0]} rotation={[0, 0.4, 0]} />
      </group>
      {/* TVs on the counter, guitar wall */}
      <Prop url={S + "tv_crt.glb"} width={0.48} position={[0.85, 1.045, -2.5]} rotation={[0, 0.35, 0]} />
      <Prop url={S + "amplifier.glb"} width={0.6} position={[-4.6, 0, 1.05]} rotation={[0, Math.PI / 2, 0]} />
      {[-0.4, 0.3, 1.0].map((z, i) => (
        <Prop key={z} url={S + "ukulele.glb"} height={0.6} position={[-5.24, 1.6 + (i % 2) * 0.12, z]} rotation={[0.08, Math.PI / 2, 0]} />
      ))}
    </>
  );
}

/** Drawn across the shop window from inside. */
function Grille() {
  return <Prop url={S + "security_grille.glb"} width={2.3} position={[5.25, 0.68, 3.3]} rotation={[0, -Math.PI / 2, 0]} />;
}

function Clock({ x = -0.9 }: { x?: number }) {
  return <Prop url={S + "wall_clock.glb"} longest={0.46} position={[x, 2.3, -3.46]} />;
}

/** The docks' version of the cases. */
function Crates({ open }: { open: boolean }) {
  return (
    <>
      {([[-3.6, -2.7, 0.1], [-2.2, -2.8, -0.2], [-4.4, -1.4, 1.4]] as V3[]).map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Prop url={R + "wooden_crate.glb"} longest={1.1} />
          {open && <Prop url={R + "pallet.glb"} longest={1.0} position={[0.4, 0.02, 0.75]} rotation={[0, 0.6, 0]} />}
          {open && [0, 1, 2].map((k) => (
            <mesh key={k} position={[(k - 1) * 0.22, 0.04, 0.85]} rotation={[0, k * 0.4, 0]} castShadow>
              <boxGeometry args={[0.16, 0.07, 0.075]} />
              <meshStandardMaterial color="#7fa38a" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** The door is a separate node, hinged on the right, so it can swing open. */
function Safe({ open, height = 1.3, ...p }: { open: boolean; height?: number } & Omit<React.ComponentProps<"group">, "children">) {
  const gltf = useGLTF(S + "safe.glb");
  const { object, scale, offset, door } = useMemo(() => {
    const object = gltf.scene.clone(true);
    object.traverse((o) => {
      o.castShadow = o.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    return { object, scale: height / size.y, offset: new THREE.Vector3(-c.x, -box.min.y, -c.z), door: object.getObjectByName("safe_door") };
  }, [gltf.scene, height]);
  const swing = useRef(0);
  useFrame((_, dt) => {
    swing.current = THREE.MathUtils.damp(swing.current, open ? 1.95 : 0, 2.2, dt);
    if (door) door.rotation.y = swing.current;
  });
  return (
    <group {...p}>
      <group scale={scale}>
        <primitive object={object} position={offset} />
      </group>
      {/* the take */}
      {open &&
        [...Array(10)].map((_, i) => (
          <mesh key={i} position={[((i % 5) - 2) * 0.13, (i < 5 ? 0.143 : 0.689) + 0.035, 0.02]} castShadow>
            <boxGeometry args={[0.12, 0.07, 0.065]} />
            <meshStandardMaterial color="#7fa38a" roughness={0.85} />
          </mesh>
        ))}
      <pointLight position={[0, 0.95, 0.25]} color="#fff0cf" intensity={open ? 1.2 : 0} distance={1.3} />
    </group>
  );
}

/** Opens on a clean job. */
export function Goal({ target, venue, open }: { target: Target; venue: VenueKind; open: boolean }) {
  if (target === "cases" && (venue === "dock" || venue === "tunnel")) return <Crates open={open} />;
  if (target === "cases")
    return (
      <>
        <Showcase open={open} position={[-3.75, 0, -2.75]} />
        <Showcase open={open} position={[-2.15, 0, -2.75]} />
        <Showcase open={open} w={1.3} position={[-4.65, 0, -0.2]} rotation={[0, Math.PI / 2, 0]} />
      </>
    );
  if (target === "table")
    return (
      <group position={[-2.7, 0, -2.2]}>
        <Prop url={R + "round_table.glb"} width={1.7} />
        {[0, 1, 2, 3].map((i) => (
          <Prop key={i} url={R + "chair_leather.glb"} height={1.0} position={[Math.cos(i * 1.57 + 0.6) * 1.25, 0, Math.sin(i * 1.57 + 0.6) * 1.25]} rotation={[0, -i * 1.57 + 2.2, 0]} />
        ))}
        {!open && [...Array(7)].map((_, i) => (
          <mesh key={i} position={[Math.cos(i) * 0.3, 0.8 + (i % 3) * 0.012, Math.sin(i * 2) * 0.3]} rotation={[0, i, 0]}>
            <boxGeometry args={[0.16, 0.02, 0.075]} />
            <meshStandardMaterial color="#7fa38a" roughness={0.9} />
          </mesh>
        ))}
        <Prop url={R + "hanging_lamp.glb"} height={1.3} position={[0, 2.3, 0]} emissive={2} />
        <pointLight position={[0, 2.0, 0]} color="#ffc98a" intensity={22} distance={7} />
      </group>
    );
  if (target === "safe") return <Safe open={open} position={[-2.7, 0, -3.0]} />;
  return <Vault open={open} />;
}

function Vault({ open }: { open: boolean }) {
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#9a9ca1", metalness: 0.85, roughness: 0.38 }), []);
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5d6066", metalness: 0.8, roughness: 0.5 }), []);
  const chrome = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9bcc2", metalness: 1, roughness: 0.32 }), []);
  const hinge = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (hinge.current) hinge.current.rotation.y = THREE.MathUtils.damp(hinge.current.rotation.y, open ? 1.7 : 0, 1.6, dt);
  });
  const R0 = 1.05;
  const C = 1.3; // height of the door's centre
  return (
    <group position={[-2.7, 0, -3.5]}>
      {/* frame plate and the chamber behind the door */}
      <mesh position={[0, C, 0.03]} material={frame} receiveShadow>
        <boxGeometry args={[2.9, 2.6, 0.06]} />
      </mesh>
      <mesh position={[0, C, 0.065]}>
        <circleGeometry args={[R0 + 0.02, 64]} />
        <meshStandardMaterial color="#0c0d10" roughness={0.9} />
      </mesh>
      <mesh position={[0, C, 0.07]} material={chrome}>
        <torusGeometry args={[R0 + 0.06, 0.05, 12, 72]} />
      </mesh>
      {/* inside: cash and gold */}
      {[0.75, 1.3, 1.85].map((y, r) => (
        <group key={y} position={[0, y, 0.12]}>
          <mesh>
            <boxGeometry args={[1.5 - Math.abs(r - 1) * 0.5, 0.03, 0.12]} />
            <meshStandardMaterial color="#3a3d44" metalness={0.8} roughness={0.4} />
          </mesh>
          {[...Array(r === 1 ? 6 : 4)].map((_, i, a) => (
            <mesh key={i} position={[(i - (a.length - 1) / 2) * 0.2, 0.05, 0]} castShadow>
              <boxGeometry args={[0.17, 0.07, 0.08]} />
              {r === 2 ? <meshStandardMaterial color="#e2b84e" metalness={1} roughness={0.25} /> : <meshStandardMaterial color="#7fa38a" roughness={0.85} />}
            </mesh>
          ))}
        </group>
      ))}
      <pointLight position={[0, C + 0.3, 1.4]} color="#fff0cf" intensity={open ? 2.2 : 0} distance={3} />
      {/* door, hinged on its right edge */}
      <group ref={hinge} position={[R0 + 0.12, C, 0.12]}>
        <group position={[-(R0 + 0.12), 0, 0.2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
            <cylinderGeometry args={[R0, R0, 0.4, 64]} />
          </mesh>
          {/* face rings */}
          {[0.92, 0.6].map((r) => (
            <mesh key={r} position={[0, 0, 0.205]} material={frame}>
              <ringGeometry args={[r - 0.02, r, 64]} />
            </mesh>
          ))}
          {/* locking bolts */}
          {[...Array(14)].map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * R0, Math.sin(a) * R0, 0]} rotation={[0, 0, a - Math.PI / 2]} material={chrome}>
                <cylinderGeometry args={[0.045, 0.045, 0.16, 16]} />
              </mesh>
            );
          })}
          {/* the wheel */}
          <group position={[0, 0, 0.28]}>
            <mesh material={chrome}>
              <torusGeometry args={[0.32, 0.025, 10, 40]} />
            </mesh>
            <mesh material={chrome} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.12, 24]} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <mesh key={k} rotation={[0, 0, (k * Math.PI) / 3]} material={chrome}>
                <boxGeometry args={[0.66, 0.03, 0.03]} />
              </mesh>
            ))}
          </group>
          {/* hinge arm */}
          <mesh position={[R0 - 0.02, 0, -0.05]} material={frame}>
            <boxGeometry args={[0.3, 0.5, 0.2]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function Venue({ kind, name, fight }: { kind: VenueKind; name: string; fight: boolean }) {
  const look = LOOK[kind];
  return (
    <>
      <Shell kind={kind} fight={fight} />
      <Sign text={kind === "dock" || kind === "casino" || kind === "church" || kind === "tunnel" || kind === "mint" ? look.sign : name.toUpperCase()} color={look.tone} width={3.2} position={[1.9, 3.0, -3.48]} />
      <Sign text="OPEN" color="#ff2d6f" width={0.9} position={[5.3, 2.2, 3.3]} rotation={[0, -Math.PI / 2, 0]} />
      {kind === "pawn" && (
        <>
          <CagedCounter />
          <Stock />
          <Grille />
          <Clock x={-1.6} />
          <Prop url={R + "bar_stool.glb"} height={0.8} position={[0.4, 0, -1.6]} />
          <Prop url={R + "wooden_crate.glb"} longest={0.9} position={[-4.7, 0, 1.9]} rotation={[0, 0.4, 0]} />
          <Prop url={R + "trash_can.glb"} height={0.6} position={[4.5, 0, -0.6]} />
        </>
      )}
      {kind === "jewel" && (
        <>
          <CagedCounter bars={false} />
          <Showcase open={false} position={[0.4, 0, 1.7]} rotation={[0, 0.3, 0]} />
          <Showcase open={false} w={1.3} position={[-1.6, 0, 2.6]} rotation={[0, -0.2, 0]} />
          <Clock x={-0.6} />
          <Prop url={R + "chair_leather.glb"} height={1.0} position={[0.6, 0, -1.55]} rotation={[0, Math.PI, 0]} />
          <Prop url={R + "trash_can.glb"} height={0.6} position={[4.5, 0, -0.6]} />
        </>
      )}
      {kind === "cards" && (
        <>
          {/* a small bar along the back */}
          <mesh position={[2.1, 0.55, -2.6]} castShadow>
            <boxGeometry args={[3.2, 1.1, 0.6]} />
            <meshStandardMaterial color="#2a1710" roughness={0.4} />
          </mesh>
          {[0.9, 1.7, 2.5, 3.3].map((x, i) => (
            <Prop key={x} url={R + "bottles.glb"} longest={0.5} position={[x, 1.1, -2.6]} rotation={[0, i, 0]} />
          ))}
          {[1.2, 2.1, 3.0].map((x) => (
            <Prop key={x} url={R + "bar_stool.glb"} height={0.8} position={[x, 0, -1.85]} />
          ))}
          <Prop url={R + "boombox.glb"} longest={0.6} position={[-4.6, 0.9, 0.8]} rotation={[0, Math.PI / 2, 0]} />
          <Prop url={R + "wooden_crate.glb"} longest={0.9} position={[-4.6, 0, 0.8]} rotation={[0, Math.PI / 2, 0]} />
          <Prop url={S + "tv_wood.glb"} width={0.7} position={[-4.7, 0, -0.6]} rotation={[0, Math.PI / 2, 0]} />
          <Prop url={S + "amplifier.glb"} width={0.55} position={[4.6, 0, -1.2]} rotation={[0, -Math.PI / 2, 0]} />
          <pointLight position={[2.1, 2.2, -2.2]} color="#ff7a3a" intensity={10} distance={6} />
        </>
      )}
      {kind === "bank" && (
        <>
          <CagedCounter register={false} />
          <Prop url={R + "metal_desk.glb"} width={1.5} position={[0.2, 0, 2.2]} rotation={[0, 0.2, 0]} />
          <Prop url={R + "chair_leather.glb"} height={1.0} position={[0.2, 0, 3.0]} rotation={[0, Math.PI, 0]} />
          <Prop url={S + "laptop.glb"} longest={0.36} position={[0.1, 0.76, 2.2]} rotation={[0, Math.PI + 0.2, 0]} />
          <Prop url={S + "cash_register.glb"} height={0.38} position={[1.3, 1.045, -2.5]} />
          <Clock x={-0.4} />
          <Grille />
        </>
      )}
      {kind === "dock" && (
        <>
          {([[2.4, -2.6, 0.2], [3.4, -2.3, 1.1], [0.6, -2.9, 0.5], [-4.5, 1.2, 1.3], [2.9, 2.9, 0.1]] as V3[]).map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
              <Prop url={R + "pallet.glb"} longest={1.2} />
              <Prop url={R + "wooden_crate.glb"} longest={1.0} position={[0, 0.14, 0]} />
              {i % 2 === 0 && <Prop url={R + "cardboard_box.glb"} longest={0.6} position={[0.1, 0.55, 0]} rotation={[0, 0.5, 0]} />}
            </group>
          ))}
          {[[-4.8, -0.2], [-4.75, 0.45], [4.4, -3.0]].map(([x, z], i) => (
            <Prop key={i} url={R + "barrel.glb"} height={0.9} position={[x, 0, z]} />
          ))}
          <Prop url={R + "plastic_crate.glb"} longest={0.5} position={[1.2, 0, 2.6]} />
          <Prop url={R + "tyre.glb"} longest={0.7} position={[-4.9, 0.35, 2.9]} rotation={[0, 0, 0.2]} />
          <Prop url={S + "toolbox.glb"} longest={0.55} position={[0.2, 0, 2.9]} rotation={[0, 0.7, 0]} />
        </>
      )}
      {kind === "casino" && <Casino />}
      {kind === "church" && <Church />}
      {kind === "tunnel" && <Tunnel />}
      {kind === "mint" && <Mint />}
    </>
  );
}

function GameTable({ position, chips = 6 }: { position: V3; chips?: number }) {
  return (
    <group position={position}>
      <Prop url={R + "round_table.glb"} height={0.78} />
      <mesh position={[0, 0.79, 0]} receiveShadow>
        <cylinderGeometry args={[0.52, 0.52, 0.02, 32]} />
        <meshStandardMaterial color="#14532d" roughness={0.95} />
      </mesh>
      {[...Array(chips)].map((_, i) => (
        <mesh key={i} position={[Math.cos(i * 1.1) * 0.28, 0.81 + (i % 3) * 0.012, Math.sin(i * 1.1) * 0.28]}>
          <cylinderGeometry args={[0.035, 0.035, 0.012, 16]} />
          <meshStandardMaterial color={["#c81e3c", "#e8e2d0", "#1b4fd6", "#111"][i % 4]} roughness={0.5} />
        </mesh>
      ))}
      {[0, 2.1, 4.2].map((r) => (
        <Prop key={r} url={R + "bar_stool.glb"} height={0.72} position={[Math.cos(r) * 0.85, 0, Math.sin(r) * 0.85]} />
      ))}
      <Prop url={R + "hanging_lamp.glb"} height={0.6} position={[0, 2.5, 0]} emissive={2.5} />
      <pointLight position={[0, 2.1, 0]} color="#ffd28a" intensity={9} distance={4} />
    </group>
  );
}

function Casino() {
  return (
    <>
      {/* tables front-left, clear of the crew's spots at the back wall and door */}
      <GameTable position={[-2.6, 0, 2.3]} />
      <GameTable position={[-0.3, 0, 3.0]} chips={9} />
      {/* the cashier's cage along the right wall */}
      <mesh position={[4.9, 0.55, -2.4]} castShadow>
        <boxGeometry args={[0.7, 1.1, 1.8]} />
        <meshStandardMaterial color="#3a2410" roughness={0.45} />
      </mesh>
      <Prop url={S + "cash_register.glb"} height={0.38} position={[4.9, 1.1, -2.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop url={S + "security_grille.glb"} width={1.8} position={[4.55, 1.1, -2.4]} rotation={[0, -Math.PI / 2, 0]} />
      {/* brass rail along the back */}
      <mesh position={[2.6, 1.0, -3.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 4.6, 12]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.25} />
      </mesh>
      <Prop url={S + "tv_crt.glb"} width={0.6} position={[-4.7, 1.4, 1.6]} rotation={[0, Math.PI / 2, 0]} />
    </>
  );
}

function Church() {
  return (
    <>
      {/* pews either side of the aisle */}
      {[0.9, 2.3].map((z) =>
        [-3.4, -1.3].map((x) => <Prop key={`${x}${z}`} url={R + "wooden_bench.glb"} longest={1.6} position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]} />),
      )}
      {/* the altar and its candles */}
      <mesh position={[1.7, 0.5, -2.9]} castShadow>
        <boxGeometry args={[2.2, 1.0, 0.7]} />
        <meshStandardMaterial color="#e8e1d2" roughness={0.8} />
      </mesh>
      {[0.9, 1.3, 2.1, 2.5].map((x) => (
        <group key={x} position={[x, 1.0, -2.85]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.24, 10]} />
            <meshStandardMaterial color="#f3ead8" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial color="#ffb347" emissive="#ffb347" emissiveIntensity={6} />
          </mesh>
        </group>
      ))}
      <pointLight position={[1.7, 1.6, -2.4]} color="#ffb347" intensity={8} distance={5} />
      {/* stained-glass window */}
      <mesh position={[4.5, 2.2, -3.47]}>
        <planeGeometry args={[0.8, 1.7]} />
        <meshStandardMaterial color="#3b2a6b" emissive="#5b3bb0" emissiveIntensity={0.9} />
      </mesh>
      <Prop url={R + "hanging_lamp.glb"} height={0.6} position={[-2.3, 2.9, 1.6]} emissive={2} />
      <Prop url={R + "suitcase.glb"} longest={0.5} position={[4.6, 0, -1.4]} rotation={[0, 1.2, 0]} />
    </>
  );
}

function Tunnel() {
  return (
    <>
      {/* rails and sleepers */}
      {[-0.55, 0.55].map((z) => (
        <mesh key={z} position={[0, 0.06, 1.7 + z]}>
          <boxGeometry args={[11, 0.08, 0.07]} />
          <meshStandardMaterial color="#5c4a3a" metalness={0.8} roughness={0.5} />
        </mesh>
      ))}
      {[...Array(14)].map((_, i) => (
        <mesh key={i} position={[-5 + i * 0.78, 0.02, 1.7]} receiveShadow>
          <boxGeometry args={[0.22, 0.05, 1.6]} />
          <meshStandardMaterial color="#2e261f" roughness={1} />
        </mesh>
      ))}
      {/* cable run */}
      {[2.6, 2.75, 2.9].map((y) => (
        <mesh key={y} position={[0, y, -3.45]}>
          <cylinderGeometry args={[0.025, 0.025, 10.6, 8]} />
          <meshStandardMaterial color="#141414" roughness={0.7} />
        </mesh>
      ))}
      <Prop url={R + "concrete_barrier.glb"} width={1.6} position={[3.4, 0, -2.6]} />
      <Prop url={R + "traffic_cone.glb"} height={0.5} position={[4.6, 0, -0.9]} />
      <Prop url={R + "traffic_cone.glb"} height={0.5} position={[4.5, 0, 0.2]} />
      <Prop url={R + "utility_box.glb"} height={1.0} position={[4.8, 0, -1.6]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop url={R + "trash_bag.glb"} longest={0.6} position={[-4.6, 0, 3.0]} />
      <Prop url={R + "wall_lamp.glb"} longest={0.3} position={[0.4, 2.4, -3.4]} emissive={3} />
    </>
  );
}

function Bars({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Prop url={R + "steel_shelves.glb"} height={1.8} />
      {[0.56, 0.96, 1.36].map((y) =>
        [...Array(5)].map((_, i) => (
          <mesh key={`${y}${i}`} position={[-0.3 + i * 0.15, y, 0.02]} castShadow>
            <boxGeometry args={[0.13, 0.06, 0.08]} />
            <meshStandardMaterial color="#f0c24a" emissive="#9a6a00" emissiveIntensity={0.55} metalness={0.35} roughness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Mint() {
  return (
    <>
      <Bars position={[0.2, 0, -3.15]} />
      <Bars position={[1.5, 0, -3.15]} />
      <Bars position={[2.8, 0, -3.15]} />
      <Prop url={R + "metal_desk.glb"} width={1.5} position={[-1.8, 0, 2.6]} rotation={[0, 0.3, 0]} />
      <Prop url={S + "laptop.glb"} longest={0.36} position={[-1.8, 0.76, 2.6]} rotation={[0, Math.PI + 0.3, 0]} />
      <Prop url={R + "chair_leather.glb"} height={1.0} position={[-2.1, 0, 3.4]} rotation={[0, Math.PI + 0.3, 0]} />
      <Prop url={S + "safe.glb"} height={1.2} position={[4.8, 0, -0.4]} rotation={[0, -Math.PI / 2, 0]} />
      <Prop url={R + "plastic_crate.glb"} longest={0.5} position={[-4.6, 0, 2.8]} />
    </>
  );
}
