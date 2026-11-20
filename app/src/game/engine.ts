import { HEAT_MAX, MODES, TIPS, type Difficulty } from "./data";
import { findChapter, seeded } from "./modes";

export type Phase = "signing" | "sending" | "sealing" | "decrypting";
type OnPhase = (p: Phase) => void;

export interface JobResult {
  tipped: boolean;
  gained: number;
  bag: number;
  heat: number;
}
/** Public job settings. Only the snitch is sealed. */
export interface JobOdds {
  /** A power of two, or 1 when the story forces it. */
  badLuck: number;
  /** Before any skimmer. */
  take: number;
  hot: boolean;
  /** Sent to the contract: bad-luck rung (0..3) and take share in basis points. */
  rung?: number;
  bps?: number;
  raid?: boolean;
}

export interface Reveal {
  /** -1 when there was none at the table. */
  snitch: number;
  /** In the order they turned. */
  snitches: number[];
  skimmer: number | null;
  bag: number;
  heat: number;
  payout: number;
}

/** Only the contract knows the snitch; the client sees what it may decrypt. */
export interface TableEngine {
  start(chapter: number, difficulty: Difficulty, on: OnPhase): Promise<void>;
  runJob(team: number[], odds: JobOdds, on: OnPhase): Promise<JobResult>;
  /** Lets friends on the team start sealing their words during the job. */
  rollOut?(team: number[]): void;
  /** Like a tail, but free, after each job. */
  rumour?(member: number, on: OnPhase): Promise<{ seen: boolean }>;
  tail(member: number, on: OnPhase): Promise<{ seen: boolean }>;
  wiretap(a: number, b: number, on: OnPhase): Promise<{ hit: boolean }>;
  accuse(member: number, on: OnPhase): Promise<{ right: boolean; bag: number; heat: number }>;
  walkAway(on: OnPhase): Promise<Reveal>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Set for seeded tables (the daily job). */
let source: (() => number) | null = null;
function rnd(n: number) {
  if (source) return Math.floor(source() * n);
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
const chance = (p: number) => rnd(1 << 16) / (1 << 16) < p;

/**
 * Practice table: same rules as the contract (see SPEC.md), secrets held in a closure.
 * In rooms, each human on the team seals a word per job; only the snitch's word counts.
 */
export interface Friends {
  seats: number[];
  begin(snitch: number): void;
  words(job: number, name: string, seats: number[]): Promise<Map<number, boolean>>;
}

export function createRehearsalTable(speed = 1, friends?: Friends, seed?: number): TableEngine {
  source = seed === undefined ? null : seeded(seed);
  /** A caught snitch drops out. */
  let active: number[] = [];
  let all: number[] = [];
  let skimmer: number | null = null;
  let caught = false;
  let bag = 0;
  let heat = 0;
  let job = 0;
  let out: number[] = [];
  let chapter = findChapter(1)!;
  let mode = MODES[0];

  async function ritual(on: OnPhase, long = false) {
    on("signing");
    await wait(250 * speed);
    on("sending");
    await wait((long ? 1500 : 800) * speed);
    on("sealing");
    await wait((long ? 3200 : 1300) * speed);
    on("decrypting");
    await wait(900 * speed);
  }
  let sealing: Promise<Map<number, boolean>> | null = null;
  const pickOther = (n: number, not: number[]) => {
    const pool = [...Array(n).keys()].filter((i) => !not.includes(i));
    return pool[rnd(pool.length)];
  };

  return {
    async start(ch, difficulty, on) {
      chapter = findChapter(ch)!;
      mode = MODES[difficulty];
      const n = chapter.cast.length;
      const r = chapter.rules ?? {};
      const first = rnd(n);
      active = r.outside && rnd(2) === 0 ? [] : [first];
      if (r.snitches === 2 && active.length) active.push(pickOther(n, active));
      all = [...active];
      skimmer = chapter.skimmer ? pickOther(n, all) : null;
      friends?.begin(all[0] ?? -1);
      caught = false;
      bag = 0;
      heat = 0;
      job = 0;
      out = [];
      on("sending");
      await wait(900 * speed);
      on("sealing");
      await wait(1400 * speed);
    },
    rollOut(team) {
      const humans = friends ? team.filter((x) => friends.seats.includes(x)) : [];
      sealing = humans.length ? friends!.words(job, chapter.jobs[job]?.name ?? "", humans) : null;
    },
    async runJob(team, odds, on) {
      await ritual(on, true);
      const at = chapter.rules?.recruitAt;
      if (at !== undefined && job === at && active.length && all.length < 2) {
        const r = pickOther(chapter.cast.length, [...all, ...out, ...(skimmer !== null ? [skimmer] : [])]);
        if (r !== undefined) {
          active.push(r);
          all.push(r);
        }
      }
      // A computer snitch decides by the odds.
      const humans = friends ? team.filter((x) => friends.seats.includes(x)) : [];
      const said = humans.length ? await (sealing ?? friends!.words(job, chapter.jobs[job]?.name ?? "", humans)) : new Map<number, boolean>();
      sealing = null;
      job++;
      const tips = active.filter((x) => team.includes(x)).some((x) => (friends?.seats.includes(x) ? said.get(x) === true : chance(TIPS)));
      const tipped = tips || chance(odds.badLuck);
      let gained = 0;
      if (tipped) heat = odds.raid ? Math.max(heat, HEAT_MAX) : heat + (odds.hot ? 2 : 1);
      else {
        gained = skimmer !== null && team.includes(skimmer) ? Math.floor(odds.take / 2) : odds.take;
        bag += gained;
      }
      return { tipped, gained, bag, heat };
    },
    async rumour(member, on) {
      await ritual(on);
      const wrong = chance(mode.tailWrong);
      return { seen: active.includes(member) !== wrong };
    },
    async tail(member, on) {
      await ritual(on);
      const wrong = chance(mode.tailWrong);
      return { seen: active.includes(member) !== wrong };
    },
    async wiretap(a, b, on) {
      await ritual(on);
      return { hit: active.includes(a) || active.includes(b) };
    },
    async accuse(member, on) {
      await ritual(on);
      const right = active.includes(member);
      out.push(member);
      if (right) {
        active = active.filter((x) => x !== member);
        // Only the first catch doubles the bag.
        if (!caught) bag *= 2;
        caught = true;
      } else heat += 1;
      return { right, bag, heat };
    },
    async walkAway(on) {
      await ritual(on);
      return { snitch: all[0] ?? -1, snitches: [...all], skimmer, bag, heat, payout: heat >= HEAT_MAX ? 0 : bag * mode.mult };
    },
  };
}
