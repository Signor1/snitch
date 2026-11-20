import { CHAPTERS, type Chapter, type Job } from "./data";

// Practice only: the contract's FHE randomness can't be seeded by a date.
export const DAILY_ID = 100;
export const ENDLESS_ID = 200;
const EPOCH = Date.UTC(2026, 10, 19); // daily job #1

/** mulberry32 */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC days since the first daily job, starting at 1. */
export const dayNumber = (now = new Date()) => Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH) / 86_400_000) + 1;
export const dailySeed = (day = dayNumber()) => (day * 2654435761) >>> 0;

const story = () => CHAPTERS.filter((c) => c.open && !c.prologue);
/** These modes have no scenes. */
const bare = (j: Job): Job => ({ ...j, after: undefined, boss: false });

export function dailyChapter(day = dayNumber()): Chapter {
  const rnd = seeded(dailySeed(day));
  const pool = story();
  const src = pool[Math.floor(rnd() * pool.length)];
  const start = Math.floor(rnd() * (src.jobs.length - 3));
  const jobs = src.jobs.slice(start, start + 4).map(bare);
  jobs[jobs.length - 1] = { ...jobs[jobs.length - 1], boss: true };
  return {
    id: DAILY_ID,
    name: `Daily job #${day}`,
    tagline: `${src.name}: four jobs, from ${jobs[0].name} to ${jobs[3].name}. Same table, same snitch for everyone today.`,
    cast: src.cast,
    jobs,
    skimmer: false,
    wiretap: src.wiretap,
    intro: "",
    outro: "",
    twist: "The daily job. Everyone plays this exact table today. Compare your take with friends.",
    open: true,
  };
}

export function endlessChapter(): Chapter {
  const src = CHAPTERS.find((c) => c.id === 4)!;
  const all = story()
    .flatMap((c) => c.jobs)
    .filter((j) => j.roles.length <= 5)
    .sort((a, b) => a.take - b.take);
  const pick = Array.from({ length: 20 }, (_, i) => all[Math.floor((i * (all.length - 1)) / 19)]);
  const jobs = pick.map((j, i) => {
    // seat rules refer to another chapter's cast, so drop them
    const task = j.task.kind === "need" || j.task.kind === "ban" ? { kind: "plain" as const } : j.task;
    return { ...bare(j), task, name: `Night ${i + 1} · ${j.name}`, boss: i === 19 };
  });
  return {
    id: ENDLESS_ID,
    name: "Endless night",
    tagline: "Twenty jobs, each bigger than the last. Walk away whenever you like. Three heat and it's all gone.",
    cast: src.cast,
    jobs,
    skimmer: false,
    wiretap: true,
    intro: "",
    outro: "",
    twist: "Endless night. The snitch turns someone else at job 8 if you haven't caught them. Know when to walk.",
    rules: { recruitAt: 7 },
    open: true,
  };
}

export function findChapter(id: number): Chapter | undefined {
  if (id === DAILY_ID) return dailyChapter();
  if (id === ENDLESS_ID) return endlessChapter();
  return CHAPTERS.find((c) => c.id === id && c.open);
}

export const isSideMode = (id?: number) => id === DAILY_ID || id === ENDLESS_ID;

export interface Best {
  payout: number;
  jobs: number;
  at: number;
}
const key = (id: number, day?: number) => (id === DAILY_ID ? `snitch:best:daily:${day ?? dayNumber()}` : `snitch:best:endless`);

export function bestOf(id: number, day?: number): Best | undefined {
  try {
    const v = localStorage.getItem(key(id, day));
    return v ? (JSON.parse(v) as Best) : undefined;
  } catch {
    return undefined;
  }
}

/** Returns true on a new best. */
export function recordBest(id: number, payout: number, jobs: number): boolean {
  const prev = bestOf(id);
  if (prev && (prev.payout > payout || (prev.payout === payout && prev.jobs >= jobs))) return false;
  try {
    localStorage.setItem(key(id), JSON.stringify({ payout, jobs, at: Date.now() }));
  } catch {
    /* private mode */
  }
  return true;
}
