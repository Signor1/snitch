import { create } from "zustand";
import { audio } from "../fx/audio";

export type Quality = "low" | "medium" | "high";

export interface Identity {
  boss: string;
  /** Index into BOSS_LOOKS. */
  look: number;
  crew: string;
  /** Index into CREW_TAGS. */
  tag: number;
}

export const BOSS_LOOKS = [
  { name: "The Don", line: "Old money. Older grudges.", seed: 11, model: "boss" },
  { name: "The Widow", line: "Inherited the business. Improved it.", seed: 6, model: "boss_widow" },
  { name: "The Kid", line: "Too young to be this careful.", seed: 9, model: "boss_kid" },
  { name: "The Ghost", line: "No record. No photo. No mercy.", seed: 12, model: "boss_ghost" },
] as const;
export const CREW_TAGS = [
  { name: "Cyan", color: "#00e5ff" },
  { name: "Violet", color: "#9d5cff" },
  { name: "Bone", color: "#ece6f7" },
  { name: "Signal", color: "#ff2d6f" },
];

export interface Settings {
  volume: number;
  quality: Quality;
  reduceMotion: boolean;
  largeText: boolean;
}

interface State {
  identity?: Identity;
  settings: Settings;
  setIdentity(i: Identity): void;
  set(p: Partial<Settings>): void;
}

const KEY = "snitch:profile";
const defaults: Settings = { volume: 0.8, quality: "high", reduceMotion: false, largeText: false };

function load(): Pick<State, "identity" | "settings"> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { identity: v.identity, settings: { ...defaults, ...v.settings } };
  } catch {
    return { settings: defaults };
  }
}
function save(s: Pick<State, "identity" | "settings">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ identity: s.identity, settings: s.settings }));
  } catch {
    /* private mode */
  }
}
/** Applies settings that live outside React. */
function apply(s: Settings) {
  audio.setVolume(s.volume);
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = s.largeText ? "112.5%" : "";
  document.documentElement.classList.toggle("calm", s.reduceMotion);
}

export const useProfile = create<State>((set, get) => ({
  ...load(),
  setIdentity(identity) {
    set({ identity });
    save(get());
  },
  set(p) {
    const settings = { ...get().settings, ...p };
    set({ settings });
    save(get());
    apply(settings);
  },
}));

apply(useProfile.getState().settings);
