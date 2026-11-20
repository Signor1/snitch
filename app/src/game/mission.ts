import type { Job, Member, Mode, Skill, Target } from "./data";
import { jobTake } from "./data";

// Everything here is public. Only the snitch and their call stay sealed, in the engine.

/** Bad-luck ladder. Powers of two so the contract can draw them with FHE randomness. */
export const LUCK = [1 / 16, 1 / 8, 1 / 4, 1 / 2] as const;

export type ScoutId = "case" | "plans" | "cop";
export interface Scout {
  id: ScoutId;
  title: string;
  body: string;
  /** Share of the job's take. */
  cost: number;
}
export const SCOUTS: Scout[] = [
  { id: "case", title: "Case the place", body: "Spend the evening watching it. You'll know the two moments coming, and get more time to decide.", cost: 0 },
  { id: "plans", title: "Buy the plans", body: "A floor plan and the alarm codes. The hands-on part is much easier.", cost: 0.1 },
  { id: "cop", title: "Pay off a beat cop", body: "The patrol looks the other way: plain bad luck is less likely. A snitch can still call it in.", cost: 0.15 },
];

export interface Choice {
  label: string;
  hint: string;
  /** Take multiplier. */
  take: number;
  /** Rungs up (+) or down (-) the LUCK ladder. */
  risk: number;
}
export interface Event {
  key: string;
  from: Skill | "radio";
  line: string;
  choices: [Choice, Choice];
  /** Picked when the player doesn't answer. */
  fallback: 0 | 1;
}

export const EVENTS: Record<string, Event> = {
  patrol: {
    key: "patrol",
    from: "Lookout",
    line: "Patrol car just turned onto the street. Slow. Real slow.",
    choices: [
      { label: "Wait it out", hint: "Safer. Less time inside: smaller take.", take: 0.85, risk: -1 },
      { label: "Go now", hint: "Full take. They might look this way.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  clerk: {
    key: "clerk",
    from: "Muscle",
    line: "The clerk's hand just went under the counter.",
    choices: [
      { label: "Grab and run", hint: "Take what's in reach. Half the take, no risk.", take: 0.5, risk: 0 },
      { label: "Finish it", hint: "Everything, if that wasn't the silent alarm.", take: 1.1, risk: 1 },
    ],
    fallback: 0,
  },
  drunk: {
    key: "drunk",
    from: "Lookout",
    line: "Some drunk is banging on the door, shouting for his money back.",
    choices: [
      { label: "Let him in, sit him down", hint: "Keeps the street quiet. Costs time.", take: 0.9, risk: -1 },
      { label: "Ignore him", hint: "No time lost. He might call someone.", take: 1, risk: 1 },
    ],
    fallback: 1,
  },
  backdoor: {
    key: "backdoor",
    from: "Driver",
    line: "Back alley's blocked by a delivery truck. Front or wait?",
    choices: [
      { label: "Out the front", hint: "Fast, and seen by the whole street.", take: 1, risk: 1 },
      { label: "Wait for the truck", hint: "Slower. Grab a little more while you wait.", take: 1.1, risk: 0 },
    ],
    fallback: 1,
  },
  dog: {
    key: "dog",
    from: "Lookout",
    line: "There's a dog in the yard. Big one. Not asleep.",
    choices: [
      { label: "Throw it the steak", hint: "Quiet. Takes a minute.", take: 0.9, risk: 0 },
      { label: "Go over the roof", hint: "No dog. Loud tin roof.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  creak: {
    key: "creak",
    from: "Inside",
    line: "Footsteps upstairs. Someone's home.",
    choices: [
      { label: "Freeze and wait", hint: "They'll go back to bed. Probably. Less time.", take: 0.8, risk: -1 },
      { label: "Keep working, quietly", hint: "Full take if they stay upstairs.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  alarm: {
    key: "alarm",
    from: "Hacker",
    line: "There's a second alarm panel. Not on the plans.",
    choices: [
      { label: "Cut the power to it", hint: "It goes quiet. Takes time: smaller take.", take: 0.85, risk: -1 },
      { label: "Leave it alone", hint: "Hope nobody's watching it.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  camera: {
    key: "camera",
    from: "Hacker",
    line: "Camera on the corner is live. It's pointed right at us.",
    choices: [
      { label: "Loop the feed", hint: "Thirty seconds of nothing. Costs time.", take: 0.9, risk: -1 },
      { label: "Hoods up, go", hint: "Fast. Your faces are on tape somewhere.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  floodlight: {
    key: "floodlight",
    from: "Lookout",
    line: "Floodlights on the yard just came on. Timer, or someone flipped them?",
    choices: [
      { label: "Pull back and wait", hint: "Safer. You lose time and some of the take.", take: 0.8, risk: -1 },
      { label: "Push on in the dark corners", hint: "Full take. Very exposed.", take: 1, risk: 1 },
    ],
    fallback: 0,
  },
  radio: {
    key: "radio",
    from: "radio",
    line: "Police radio: \"All units, possible disturbance, harbour district.\"",
    choices: [
      { label: "Abort the extra", hint: "Leave the last load behind. Less take.", take: 0.75, risk: -1 },
      { label: "Load everything", hint: "Two more minutes. Could be nothing.", take: 1.15, risk: 1 },
    ],
    fallback: 0,
  },
};

export type GameKind = "dial" | "smash" | "sweep" | "code";
export const GAME_FOR: Record<Target, GameKind> = { safe: "dial", cases: "smash", table: "sweep", vault: "code" };
/** Skill that makes each hands-on task easier. */
export const GAME_SKILL: Record<GameKind, Skill> = { dial: "Safecracker", smash: "Muscle", sweep: "Inside", code: "Hacker" };

/** Number of seats filled by the right role. */
export function matches(job: Job, team: number[], crew: Member[]) {
  return job.roles.reduce((n, r, i) => n + (crew[team[i]]?.role === r ? 1 : 0), 0);
}

export function hasSkill(job: Job, team: number[], crew: Member[], skill: Skill) {
  return job.roles.some((r, i) => r === skill && crew[team[i]]?.role === skill);
}

/**
 * Unlocked by reputation (sum of best payouts), once per run. They only change the public plan,
 * so they work the same on Sepolia.
 */
export type ContactId = "cop" | "fence" | "wheel";
export interface Contact {
  id: ContactId;
  name: string;
  body: string;
  rep: number;
}
export const CONTACTS: Contact[] = [
  { id: "cop", name: "The bent cop", body: "Plain bad luck is less likely on this job. Stacks with a paid-off patrol.", rep: 20_000 },
  { id: "fence", name: "The fence", body: "Moves the goods for more: +15% take on this job.", rep: 60_000 },
  { id: "wheel", name: "The wheelman", body: "If the police come, nobody gets picked up on the way out.", rep: 150_000 },
];

export interface Plan {
  scout?: ScoutId;
  contact?: ContactId;
  /** Option index per decision moment. */
  choices: number[];
  /** Hands-on score, 0..1. */
  game?: number;
}

/** Contract bounds on the take share, in basis points. */
export const MIN_BPS = 2000;
export const maxBps = (rung: number) => Math.min(25000, 15000 + 5000 * rung);

export interface Odds {
  badLuck: number;
  /** Sent to the contract: bad luck = 1 / (16 >> rung). */
  rung: number;
  /** Share of the base take in basis points, sent to the contract. */
  bps: number;
  /** Before any skimmer. */
  take: number;
  parts: { label: string; value: string }[];
}

export function oddsFor(job: Job, team: number[], crew: Member[], mode: Mode, plan: Plan): Odds {
  const base = jobTake(job);
  const parts: Odds["parts"] = [{ label: "The job", value: money(base) }];
  let mult = 1;
  let rung = mode.luck;

  const m = matches(job, team, crew);
  if (m) {
    mult *= 1 + 0.12 * m;
    parts.push({ label: `${m} in the right seat`, value: `+${Math.round(12 * m)}%` });
  }
  const wrong = job.roles.length - m;
  if (wrong > job.roles.length / 2) {
    rung += 1;
    parts.push({ label: "Too many in the wrong seat", value: "riskier" });
  }
  const scout = SCOUTS.find((s) => s.id === plan.scout);
  if (scout?.cost) {
    mult *= 1 - scout.cost;
    parts.push({ label: scout.title, value: `-${Math.round(scout.cost * 100)}%` });
  }
  if (plan.scout === "cop") rung -= 1;
  if (plan.contact === "cop") {
    rung -= 1;
    parts.push({ label: "The bent cop", value: "safer" });
  }
  if (plan.contact === "fence") {
    mult *= 1.15;
    parts.push({ label: "The fence", value: "+15%" });
  }

  job.beats.forEach((k, i) => {
    const c = EVENTS[k]?.choices[plan.choices[i] ?? EVENTS[k].fallback];
    if (!c) return;
    mult *= c.take;
    rung += c.risk;
    if (c.take !== 1) parts.push({ label: c.label, value: `${c.take > 1 ? "+" : "-"}${Math.round(Math.abs(c.take - 1) * 100)}%` });
  });

  if (plan.game !== undefined) {
    const g = 0.6 + 0.4 * plan.game;
    mult *= g;
    parts.push({ label: "Inside work", value: `${Math.round(plan.game * 100)}%` });
    if (plan.game < 0.34) {
      rung += 1;
      parts.push({ label: "Sloppy inside", value: "riskier" });
    }
  }

  rung = Math.max(0, Math.min(LUCK.length - 1, rung));
  const forced = job.forced === "tipped";
  let bps = Math.max(MIN_BPS, Math.round(mult * 10000));
  if (bps > maxBps(rung)) {
    bps = maxBps(rung);
    parts.push({ label: "Capped: greed needs risk", value: `${bps / 100}%` });
  }
  // Must match the contract: base * bps / 10000, rounded down.
  return { badLuck: forced ? 1 : LUCK[rung], rung, bps, take: Math.floor((base * bps) / 10000), parts };
}

export interface Route {
  id: string;
  title: string;
  body: string;
  /** Chance someone is lifted: [no driver, driver]. */
  lift: [number, number];
}
export const ROUTES: Route[] = [
  { id: "alleys", title: "Through the alleys", body: "Tight turns. A real driver makes it look easy.", lift: [0.5, 0.125] },
  { id: "docks", title: "Along the docks", body: "Wide open and fast. Easy to see from the air.", lift: [0.25, 0.25] },
  { id: "tunnel", title: "The old tram tunnel", body: "Nobody uses it. Nobody knows if it's still open.", lift: [0.375, 0.375] },
];

export function getaway(route: Route, driver: boolean, roll = Math.random()) {
  return roll < route.lift[driver ? 1 : 0];
}

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
