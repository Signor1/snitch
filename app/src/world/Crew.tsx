import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CHAPTERS, castOf, type Member } from "../game/data";
import { useStage } from "../story/stage";
import { useSnitch } from "../game/store";
import { Character, type Emote } from "./Character";

/** Arc behind the table, facing the camera. */
export function spot(i: number, n: number) {
  const spread = n <= 5 ? 0.5 : 0.44;
  const a = (i - (n - 1) / 2) * spread;
  const r = 2.0;
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r * 0.82 + 0.25 };
}

const BASE: Emote[] = ["arms", "idle", "arms", "phone", "idle", "talk", "idle"];

function Body({ m, i, n }: { m: Member; i: number; n: number }) {
  const g = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  const tap = useSnitch((s) => s.tap);
  const selected = useSnitch((s) => s.selected.includes(m.id));
  const tool = useSnitch((s) => s.tool);
  const status = useSnitch((s) => s.status);
  const busy = useSnitch((s) => s.busy);
  const cue = useSnitch((s) => s.cue);
  const away = useSnitch((s) => s.status === "job" && !!s.cut?.team.includes(m.id));
  const isSnitch = useSnitch((s) => !!s.ending?.snitches.includes(m.id));
  const speaking = useStage((s) => s.speaker === m.id);
  const [shot, setShot] = useState<{ emote: Emote; at: number }>();
  const [hover, setHover] = useState(false);
  const p = useMemo(() => spot(i, n), [i, n]);
  const playing = status === "plan" && !busy;
  const tone = isSnitch ? "#ff2d6f" : tool === "accuse" ? "#ff2d6f" : tool === "team" ? "#00e5ff" : "#9d5cff";

  useEffect(() => {
    if (!cue) return;
    const mine = cue.member === m.id;
    const pick = (a: Emote, b: Emote) => ((i + Math.floor(cue.at)) % 2 ? a : b);
    if (cue.name === "clean") setShot({ emote: pick("yes", "hop"), at: cue.at });
    else if (cue.name === "tipped") setShot({ emote: pick("facepalm", "no"), at: cue.at });
    else if (cue.name === "wrong" && !mine) setShot({ emote: pick("no", "facepalm"), at: cue.at });
    else if (cue.name === "right" && !mine) setShot({ emote: pick("point", "yes"), at: cue.at });
    else if ((cue.name === "seen" || cue.name === "quiet") && mine) setShot({ emote: "interact", at: cue.at });
    else if (cue.name === "reveal") setShot({ emote: mine ? "phone" : pick("point", "no"), at: cue.at });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.at]);

  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const step = selected ? 0.3 : 0;
    const len = Math.hypot(p.x, p.z) || 1;
    o.position.x = THREE.MathUtils.damp(o.position.x, p.x - (p.x / len) * step, 6, dt);
    o.position.z = THREE.MathUtils.damp(o.position.z, p.z - (p.z / len) * step, 6, dt);
    const s = THREE.MathUtils.damp(o.scale.x, away ? 0.001 : 1, 7, dt);
    o.scale.setScalar(s);
    if (ring.current) ring.current.emissiveIntensity = THREE.MathUtils.damp(ring.current.emissiveIntensity, selected || isSnitch ? 3 : hover && playing ? 1 : 0, 8, dt);
  });

  const base: Emote = speaking ? "talk" : isSnitch ? "phone" : busy && busy !== "start" ? "arms" : BASE[m.id % BASE.length];

  return (
    <group ref={g} position={[p.x, 0, p.z]} rotation={[0, Math.atan2(-p.x, 2.6 - p.z), 0]}>
      <Suspense fallback={null}>
        <Character model={m.model} phase={m.id} emote={base} oneShot={shot} />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[0.3, 0.335, 48]} />
        <meshStandardMaterial ref={ring} color={tone} emissive={tone} emissiveIntensity={0} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {/* click target */}
      <mesh
        position={[0, 0.95, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          tap(m.id);
        }}
        onPointerOver={() => {
          setHover(true);
          if (playing) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <cylinderGeometry args={[0.32, 0.32, 1.9, 8]} />
      </mesh>
      {!away && status !== "brief" && status !== "story" && (
        <Html position={[0, 2.02, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <span
            className={`eyebrow whitespace-nowrap rounded-full border px-2.5 py-1 backdrop-blur-sm ${
              isSnitch ? "border-heat bg-heat/20 text-heat" : selected ? "border-cyan bg-cyan/15 text-cyan" : "border-line bg-ink/70 text-mist"
            }`}
          >
            {m.name}
          </span>
        </Html>
      )}
    </group>
  );
}

/** Must never read hidden state before the reveal. */
export function Crew() {
  const crew = useSnitch((s) => s.crew);
  const out = useSnitch((s) => s.out);
  const shown = crew.length ? crew : castOf(CHAPTERS[1]);
  return (
    <group>
      {shown.map((m, i) => (out.includes(m.id) ? null : <Body key={m.id} m={m} i={i} n={shown.length} />))}
    </group>
  );
}
