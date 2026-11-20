import type { Body } from "../game/data";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

// MakeHuman / MPFB bodies (CC0) use the Quaternius 65-bone skeleton,
// so every animation clip plays on every body.

export type Model = Body;
const MODELS: Model[] = ["gang_m1", "gang_m2", "gang_m3", "gang_f1", "gang_f2", "gang_f3", "boss", "boss_widow", "boss_kid", "boss_ghost", "cop_m", "cop_f"];
const url = (m: Model) => `/real/characters/${m}.glb`;
const ANIMS = ["/models/anims.glb", "/models/anims2.glb", "/models/anims3.glb"];

export type Emote =
  | "idle"
  | "talk"
  | "arms"
  | "phone"
  | "no"
  | "dance"
  | "interact"
  | "pickup"
  | "yes"
  | "point"
  | "facepalm"
  | "open"
  | "sip"
  | "hop"
  | "gunIdle"
  | "aim"
  | "shoot"
  | "sprint"
  | "crouch"
  | "fix"
  | "fall"
  | "walk"
  | "surrender";

const CLIP: Record<Emote, string> = {
  idle: "Idle_Loop",
  talk: "Idle_Talking_Loop",
  arms: "Idle_FoldArms_Loop",
  phone: "Idle_TalkingPhone_Loop",
  no: "Idle_No_Loop",
  dance: "Dance_Loop",
  interact: "Interact",
  pickup: "PickUp_Table",
  yes: "Yes",
  point: "Spell_Simple_Shoot",
  facepalm: "Hit_Head",
  open: "Chest_Open",
  sip: "Consume",
  hop: "Jump_Land",
  gunIdle: "Pistol_Idle_Loop",
  aim: "Pistol_Aim_Neutral",
  shoot: "Pistol_Shoot",
  sprint: "Sprint_Loop",
  crouch: "Crouch_Idle_Loop",
  fix: "Fixing_Kneeling",
  fall: "Death01",
  walk: "Walk_Formal_Loop",
  surrender: "Fixing_Kneeling",
};
const LOOPING = new Set<Emote>(["idle", "talk", "arms", "phone", "no", "dance", "gunIdle", "aim", "shoot", "sprint", "crouch", "fix", "walk", "surrender"]);

// No clip has hands on the head, so "surrender" kneels with Fixing_Kneeling and then aims the arm
// bones after each mixer update. Directions are in the body's own space: x to its left, y up, z forward.
const SURRENDER: [string, THREE.Vector3][] = [
  ["upperarm_l", new THREE.Vector3(0.8, 0.55, -0.15)],
  ["lowerarm_l", new THREE.Vector3(-0.55, 0.5, -0.35)],
  ["upperarm_r", new THREE.Vector3(-0.8, 0.55, -0.15)],
  ["lowerarm_r", new THREE.Vector3(0.55, 0.5, -0.35)],
];
const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Quaternion(), w: new THREE.Quaternion() };

/** Turns `bone` so the segment to its first child points along `dir` (body space). */
function aimBone(bone: THREE.Object3D, dir: THREE.Vector3, body: THREE.Quaternion) {
  const child = bone.children.find((c) => (c as THREE.Bone).isBone);
  if (!child || !bone.parent) return;
  bone.updateWorldMatrix(true, true);
  const from = tmp.a.setFromMatrixPosition(child.matrixWorld).sub(tmp.b.setFromMatrixPosition(bone.matrixWorld)).normalize();
  const to = tmp.b.copy(dir).normalize().applyQuaternion(body);
  const turn = tmp.q.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(tmp.w);
  bone.parent.getWorldQuaternion(tmp.p);
  bone.quaternion.copy(tmp.p.invert().multiply(turn.multiply(tmp.w)));
}

const PISTOL = "/real/props/pistol.glb";

/** One gun from the scanned set, sized for a hand. Bone space is in metres. */
function makePistol(src: THREE.Object3D) {
  const g = new THREE.Group();
  const model = src.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(c);
  const fit = new THREE.Group();
  fit.add(model);
  fit.scale.setScalar(0.24 / Math.max(size.x, size.y, size.z));
  g.add(fit);
  // grip in the palm, barrel along the fingers
  g.position.set(...GUN_POS);
  g.rotation.set(...GUN_ROT);
  return g;
}
const GUN_POS: [number, number, number] = [0, 0.13, 0.02];

// Tints multiply the fabric texture, and most of these are dark, so a tint alone comes out near black.
// Dividing by the texture's average brightness lands on the intended colour and keeps the weave.
const brightness = new Map<string, number>();
function textureBrightness(t: THREE.Texture | null): number {
  const img = t?.image as CanvasImageSource | undefined;
  if (!t || !img) return 1;
  const known = brightness.get(t.uuid);
  if (known !== undefined) return known;
  let v = 1;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lin = (x: number) => Math.pow(x / 255, 2.2);
      sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    }
    v = Math.min(1, Math.max(0.25, sum / 256));
  } catch {
    /* unreadable image: tint as is */
  }
  brightness.set(t.uuid, v);
  return v;
}
function tint(mat: THREE.MeshStandardMaterial, colour: string) {
  const m = mat.clone();
  m.color.set(colour).multiplyScalar(1 / textureBrightness(mat.map));
  return m;
}
const GUN_ROT: [number, number, number] = [0, Math.PI / 2, Math.PI / 2];

export function Character({
  model,
  emote = "idle",
  oneShot,
  pistol = false,
  phase = 0,
  outfit,
  uniform,
}: {
  model: Model;
  emote?: Emote;
  oneShot?: { emote: Emote; at: number };
  pistol?: boolean;
  /** Offsets looping clips so a group doesn't move in lockstep. */
  phase?: number;
  /** Clothing colours, applied in order to the cloth materials (shoes keep theirs). */
  outfit?: string[];
  /** Colour for police gear (cap, belt, patches). */
  uniform?: string;
}) {
  const body = useGLTF(url(model));
  const a1 = useGLTF(ANIMS[0]);
  const a2 = useGLTF(ANIMS[1]);
  const a3 = useGLTF(ANIMS[2]);
  const gunSrc = useGLTF(PISTOL);

  const look = `${outfit?.join(",") ?? ""}|${uniform ?? ""}`;
  const root = useMemo(() => {
    const r = cloneSkinned(body.scene) as THREE.Group;
    let k = 0;
    r.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      // clones share materials, so tint a copy
      const mat = m.material as THREE.MeshStandardMaterial;
      const name = mat.name ?? "";
      const cloth = name.startsWith("cloth_") && !/shoe|boot|stiletto/.test(name);
      const gear = name.startsWith("uniform_") && !/badge|metal/.test(name);
      if (outfit?.length && cloth) m.material = tint(mat, outfit[k++ % outfit.length]);
      else if (uniform && gear) m.material = tint(mat, uniform);
    });
    const hand = r.getObjectByName("hand_r");
    if (hand) {
      const gun = makePistol(gunSrc.scene);
      gun.name = "pistol";
      gun.visible = false;
      hand.add(gun);
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.scene, gunSrc.scene, look]);

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const clips = useMemo(() => new Map([...a1.animations, ...a2.animations, ...a3.animations].map((c) => [c.name, c])), [a1.animations, a2.animations, a3.animations]);
  const current = useRef<THREE.AnimationAction | null>(null);
  const baseEmote = useRef<Emote>(emote);

  const play = (e: Emote, fade = 0.35) => {
    const clip = clips.get(CLIP[e]);
    if (!clip) return;
    const next = mixer.clipAction(clip);
    const loop = LOOPING.has(e);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    if (loop) next.time = (phase * 0.731) % clip.duration;
    next.timeScale = loop ? 0.9 + ((phase * 13) % 20) / 100 : 1;
    next.play();
    if (current.current && current.current !== next) current.current.crossFadeTo(next, fade, false);
    current.current = next;
    return clip.duration / next.timeScale;
  };

  useEffect(() => {
    baseEmote.current = emote;
    play(emote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emote, mixer]);

  useEffect(() => {
    if (!oneShot) return;
    const d = play(oneShot.emote, 0.2) ?? 1;
    if (LOOPING.has(oneShot.emote)) return;
    const t = setTimeout(() => play(baseEmote.current, 0.4), Math.max(300, d * 1000 - 350));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneShot?.at]);

  useEffect(() => {
    const gun = root.getObjectByName("pistol");
    if (gun) gun.visible = pistol;
  }, [root, pistol]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);
  const posing = useRef(false);
  posing.current = (oneShot?.emote ?? emote) === "surrender" || emote === "surrender";
  const bodyQuat = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 0.05));
    if (!posing.current) return;
    root.getWorldQuaternion(bodyQuat);
    for (const [name, dir] of SURRENDER) {
      const b = root.getObjectByName(name);
      if (b) aimBone(b, dir, bodyQuat);
    }
  });

  return <primitive object={root} />;
}

// only the people on the first screen load up front; police come with the street and shop
[...MODELS.filter((m) => !/^cop_/.test(m)).map(url), ...ANIMS, PISTOL].forEach((u) => useGLTF.preload(u));
