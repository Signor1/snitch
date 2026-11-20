import { TIPS, type Mode, type Rules } from "./data";

/**
 * `t`: job i happens at i + 0.5; anything between jobs at the number of jobs done.
 * Needed for the recruit chapter.
 */
export type Evidence =
  | { kind: "job"; team: number[]; tipped: boolean; badLuck?: number; t?: number }
  | { kind: "tail"; member: number; seen: boolean; t?: number }
  | { kind: "rumour"; member: number; seen: boolean; t?: number }
  | { kind: "wiretap"; pair: [number, number]; hit: boolean; t?: number }
  | { kind: "accuse"; member: number; right: boolean; t?: number };

/** One possible truth with its prior. */
interface Story {
  start: number[];
  recruit?: number;
  weight: number;
}

function stories(n: number, rules: Rules = {}): Story[] {
  const out: Story[] = [];
  if (rules.snitches === 2) {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push({ start: [a, b], weight: 1 });
    return out;
  }
  if (rules.recruitAt !== undefined) {
    for (let s = 0; s < n; s++) for (let r = 0; r < n; r++) if (r !== s) out.push({ start: [s], recruit: r, weight: 1 });
    return out;
  }
  for (let s = 0; s < n; s++) out.push({ start: [s], weight: 1 });
  // Outside rule: half the time nobody at the table is talking.
  if (rules.outside) out.push({ start: [], weight: n });
  return out;
}

/**
 * Bayes over every possible truth. One probability per member; with two snitches they sum to about 2.
 */
export function suspicion(n: number, mode: Mode, log: Evidence[], rules: Rules = {}, now = Infinity): number[] {
  const hs = stories(n, rules);
  const p = Array<number>(n).fill(0);
  let sum = 0;
  for (const h of hs) {
    let w = h.weight;
    let active = [...h.start];
    const ever = new Set(active);
    let recruited = false;
    const turn = (t: number) => {
      // Only if a snitch is still at large when the recruit job starts.
      if (h.recruit === undefined || recruited || rules.recruitAt === undefined || t <= rules.recruitAt) return;
      recruited = true;
      if (active.length && !active.includes(h.recruit)) {
        active.push(h.recruit);
        ever.add(h.recruit);
      }
    };
    for (const e of log) {
      turn(e.t ?? 0);
      if (e.kind === "job") {
        const luck = e.badLuck ?? mode.badLuck;
        if (luck >= 1) continue; // forced by the story: no evidence either way
        const on = active.some((x) => e.team.includes(x));
        const tip = on ? TIPS + (1 - TIPS) * luck : luck;
        w *= e.tipped ? tip : 1 - tip;
      } else if (e.kind === "tail" || e.kind === "rumour") {
        const seen = active.includes(e.member) ? 1 - mode.tailWrong : mode.tailWrong;
        w *= e.seen ? seen : 1 - seen;
      } else if (e.kind === "wiretap") {
        if (e.pair.some((x) => active.includes(x)) !== e.hit) w = 0;
      } else if (e.kind === "accuse") {
        if (active.includes(e.member) !== e.right) w = 0;
        active = active.filter((x) => x !== e.member);
      }
      if (w === 0) break;
    }
    turn(now);
    sum += w;
    for (const m of ever) p[m] += w;
  }
  return p.map((x) => (sum ? x / sum : 0));
}
