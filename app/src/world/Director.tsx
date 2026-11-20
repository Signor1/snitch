import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { audio } from "../fx/audio";
import { CLOSE_MS, useCurtain } from "../fx/curtain";
import { useSnitch } from "../game/store";
import { useStage } from "../story/stage";
import { spot } from "./Crew";
import { INSIDE_X } from "./Interior";
import { STREET_X } from "./Street";

const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type V3 = [number, number, number];
type Shot = { pos: V3; target: V3; orbit?: number; cut?: boolean; smooth?: number };
export type Scene = "title" | "city" | "run";

/** Camera shots for each scene. */
export function Director({ scene }: { scene: Scene }) {
  const ref = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const status = useSnitch((s) => s.status);
  const busy = useSnitch((s) => s.busy);
  const cut = useSnitch((s) => s.cut);
  const tool = useSnitch((s) => s.tool);
  const selected = useSnitch((s) => s.selected);
  const crew = useSnitch((s) => s.crew);
  const out = useSnitch((s) => s.out);
  const ending = useSnitch((s) => s.ending);
  const speaker = useStage((s) => s.speaker);
  const shot = useRef<Shot | null>(null);
  const set = useRef("room");
  const pending = useRef<Shot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      useCurtain.getState().open();
    },
    [],
  );

  const aspect = size.width / Math.max(1, size.height);
  const portrait = aspect < 1;
  const wide = size.width >= 1024;
  const X = STREET_X;
  const I = INSIDE_X;

  const at = (id: number): V3 => {
    const i = crew.findIndex((m) => m.id === id);
    const p = spot(Math.max(0, i), crew.length || 5);
    return [p.x, 1.5, p.z];
  };

  let s: Shot;
  if (scene !== "run") s = { pos: [1.4, 2.0, 4.6], target: [0, 1.35, -0.3], orbit: 0.045 };
  else if (cut) {
    if (cut.beat === "arrive") s = { pos: [X - 3.6, 3.4, -11.5], target: [X + 2.6, 1.0, -1], cut: true, orbit: 0.012 };
    else if (cut.beat === "inside") s = { pos: [I + 1.2, 2.5, 6.4], target: [I - 0.6, 1.0, -0.8], cut: true, orbit: 0.02 };
    else if (cut.beat === "payoff") s = cut.state === "clean" ? { pos: [I - 0.2, 1.7, 2.6], target: [I - 2.6, 0.95, -2.4], smooth: 1.4 } : { pos: [I - 1.4, 2.7, 7.2], target: [I + 0.9, 1.0, -0.4], smooth: 0.6 };
    else if (cut.state === "clean") s = { pos: [X - 1.2, 1.5, -7.5], target: [X + 3, 1.2, 0.5], cut: true };
    else s = { pos: [X - 3.7, 2.4, 8.5], target: [X + 0.8, 0.8, -3], cut: true, orbit: -0.02 };
  } else if (status === "ended" && ending && ending.snitch >= 0 && !out.includes(ending.snitch)) {
    const [x, y, z] = at(ending.snitch);
    s = { pos: [x * 0.55, 1.5, z + 3.1], target: [x, y - 0.85, z], smooth: 1.8 };
  } else if (status === "story" && speaker !== undefined) {
    // slow push-in on whoever is talking
    const [x, y, z] = at(crew[speaker]?.id ?? 0);
    s = { pos: [x * 0.45, 1.65, z + 2.6], target: [x, y + 0.05, z], smooth: 1.2 };
  } else if (status === "brief" || status === "story") s = { pos: [0.6, 2.5, 5.4], target: [0, 1.3, -0.3], orbit: 0.03 };
  else if (status === "scout" || status === "aftermath") s = { pos: [-1.2, 2.9, 4.8], target: [0, 0.9, -0.6], orbit: 0.02 };
  else if ((tool !== "team" || busy === "tail" || busy === "accuse") && selected.length === 1) {
    const [x, y, z] = at(selected[0]);
    s = { pos: [x * 0.5, 1.8, z + 2.9], target: [x * 0.9, y - 0.05, z], smooth: 1.1 };
  } else s = { pos: [0, 2.2, 4.5], target: [0, 1.3, -0.45] };

  useEffect(() => {
    camera.fov = portrait ? Math.min(66, 40 / Math.max(aspect, 0.55)) : 40;
    camera.updateProjectionMatrix();
  }, [camera, portrait, aspect]);
  if (portrait) {
    const k = cut ? 1.25 : 1.3;
    const pos = s.pos.map((p, i) => s.target[i] + (p - s.target[i]) * k) as V3;
    s = { ...s, pos, target: [s.target[0], s.target[1] - (scene === "run" && !cut ? 0.35 : 0.1), s.target[2]] };
  }
  // Keep the subject clear of the HUD text on the left.
  const offsetX = wide && scene !== "run" ? -1.2 : 0;

  useEffect(() => {
    ref.current?.setFocalOffset(offsetX, 0, 0, !reduce);
  }, [offsetX]);

  const key = JSON.stringify([s.pos, s.target]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const next = !cut ? "room" : cut.beat === "inside" || cut.beat === "payoff" ? "inside" : "street";
    const cutting = s.cut || next !== set.current;
    set.current = next;
    shot.current = s;
    if (!cutting && timer.current) {
      pending.current = s;
      return;
    }
    if (!cutting) {
      c.smoothTime = reduce ? 0 : (s.smooth ?? 0.9);
      void c.setLookAt(...s.pos, ...s.target, !reduce);
      return;
    }
    if (reduce) {
      void c.setLookAt(...s.pos, ...s.target, false);
      return;
    }
    // Dip to black, jump while dark, fade in on a slow push.
    // A cut that lands mid-cut just retargets, so the camera ends on the latest shot.
    pending.current = s;
    if (timer.current) return;
    useCurtain.getState().close();
    audio.whoosh();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      const t = pending.current!;
      const back = t.pos.map((p, i) => t.target[i] + (p - t.target[i]) * 1.14) as V3;
      c.smoothTime = 0;
      void c.setLookAt(...back, ...t.target, false);
      c.smoothTime = 1.3;
      void c.setLookAt(...t.pos, ...t.target, true);
      // Open only after the new shot has drawn; a set's first frame can be slow.
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => useCurtain.getState().open())));
    }, CLOSE_MS + 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c || reduce || !shot.current?.orbit) return;
    c.azimuthAngle += shot.current.orbit * dt;
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={1}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2.05}
      mouseButtons={{ left: 0, middle: 0, right: 0, wheel: 0 }}
      touches={{ one: 0, two: 0, three: 0 }}
    />
  );
}
