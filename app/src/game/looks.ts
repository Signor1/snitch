import { DAILY_ID, ENDLESS_ID } from "./modes";

// Each chapter has its own police raid and its own wardrobe, so no two chapters look alike.

export type Bust = "patrol" | "detectives" | "harbour" | "swat" | "roadblock" | "helicopter" | "ambush" | "allin";

const BUSTS: Bust[] = ["patrol", "detectives", "harbour", "swat", "roadblock", "helicopter", "ambush", "allin"];
const BY_CHAPTER: Record<number, Bust> = { 0: "harbour", 1: "patrol", 2: "detectives", 3: "harbour", 4: "swat", 5: "roadblock", 6: "helicopter", 7: "ambush", 8: "allin" };

/** Story chapters keep one raid style; the daily job and endless night change it every job. */
export function bustFor(chapter: number, job: number): Bust {
  if (chapter === DAILY_ID || chapter === ENDLESS_ID) return BUSTS[job % BUSTS.length];
  return BY_CHAPTER[chapter] ?? "patrol";
}

// Cloth colours per chapter. A member wears two of them, picked by seat and job: nobody matches, and
// nobody turns up to two jobs in the same clothes.
const WARDROBE: Record<number, string[]> = {
  0: ["#7a5a3a", "#b88a3a", "#3d5a80", "#6b3a2a", "#4f5b3a"], // ten years ago: tan, mustard, denim
  1: ["#4a5263", "#7a5f45", "#3f6650", "#8a3a44", "#5a5a62"], // street hoodies
  2: ["#1c1c22", "#e3ddd0", "#2b3a67", "#4a2f4f", "#5c5248"], // uptown tailoring
  3: ["#2f4a5a", "#7b6a45", "#5a5a52", "#8a3b2a", "#34403a"], // dock workwear
  4: ["#111114", "#3a0f1a", "#1d2b3a", "#d8d1c0", "#2a2a2a"], // casino black tie
  5: ["#2b3540", "#4a5a2f", "#5b2f2f", "#6b6e75", "#3b3328"], // rain gear
  6: ["#4b1d1d", "#1f2f2a", "#c9b27a", "#2a2438", "#5a4a3a"], // new money
  7: ["#0e0e10", "#2a2a2e", "#3b2c22", "#45231f", "#1d1f24"], // funeral black
  8: ["#16181c", "#1b2a3a", "#16181c", "#22262c", "#16181c"], // matching heist blacks
};

export function outfitFor(chapter: number, seat: number, job = 0): string[] {
  const p = WARDROBE[chapter] ?? WARDROBE[(chapter % 8) + 1];
  const n = p.length;
  return [p[(seat + job) % n], p[(seat + 2 + job * 2) % n]];
}

export interface CopLook {
  outfit?: string[];
  uniform?: string;
  /** Police who come through the door. */
  count: number;
}

export const COP_LOOK: Record<Bust, CopLook> = {
  patrol: { count: 2 },
  detectives: { outfit: ["#4a3a2c", "#26262b"], uniform: "#26262b", count: 2 },
  harbour: { outfit: ["#d4dc3a", "#1d2633"], count: 3 },
  swat: { outfit: ["#15171a", "#15171a"], uniform: "#0c0d0f", count: 3 },
  roadblock: { outfit: ["#1d2a44", "#1d2a44"], count: 2 },
  helicopter: { count: 2 },
  ambush: { outfit: ["#2a2a2e", "#1e1e22"], uniform: "#1e1e22", count: 3 },
  allin: { outfit: ["#15171a", "#15171a"], uniform: "#0c0d0f", count: 3 },
};
