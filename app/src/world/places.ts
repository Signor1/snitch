import type { Venue } from "../game/data";

export type District = "oldtown" | "downtown" | "industrial" | "parish";

/** The part of town a target sits in. */
export function districtOf(venue?: Venue): District {
  if (venue === "dock" || venue === "tunnel") return "industrial";
  if (venue === "jewel" || venue === "bank" || venue === "casino" || venue === "mint") return "downtown";
  if (venue === "church") return "parish";
  return "oldtown";
}

/** Stable number from a job's name. */
export function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483646 || 1;
}
