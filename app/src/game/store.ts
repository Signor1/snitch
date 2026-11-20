import { create } from "zustand";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { SCENES } from "../story/script";
import { BOSS_LOOKS, useProfile } from "../settings/store";
import { CHAPTERS, HEAT_MAX, MODES, castOf, starsFor, teamSize, type Chapter, type Difficulty, type Job, type Member, type Mode, type Target, type Venue } from "./data";
import { createRehearsalTable, type Phase, type Reveal, type TableEngine } from "./engine";
import { roomHost, useRoom } from "../rooms/store";
import { useChain } from "../chain/store";
import type { Evidence } from "./suspicion";
import type { ChainTable, LiveRun } from "../chain/engine";
import { revertName } from "../chain/tx";
import { ACTIONS, type Ask } from "./actions";
import { DAILY_ID, dailySeed, findChapter, isSideMode, recordBest } from "./modes";
import { outfitFor, type Bust } from "./looks";
import { CONTACTS, type ContactId, type GameKind, type Odds, type Plan, type ScoutId } from "./mission";
import { autoTeam, barred, blackout, teamProblem } from "./tasks";

export type Tool = "team" | "tail" | "wiretap" | "accuse";
export type Status = "story" | "brief" | "scout" | "plan" | "job" | "aftermath" | "ended";
export type Busy = null | "start" | "job" | "tail" | "wiretap" | "accuse" | "end";

export interface Cut {
  state: "go" | "clean" | "tipped";
  beat: "arrive" | "inside" | "payoff" | "exit";
  beatAt: number;
  target: Target;
  venue: Venue;
  bust: Bust;
  /** The crew don't reach the van: they surrender in the street (the intro film). */
  caught?: boolean;
  at: number;
  team: number[];
  job: string;
  gained: number;
}

export type Prompt =
  | { kind: "choice"; event: string; seconds: number; known: boolean; at: number }
  | { kind: "game"; game: GameKind; easy: boolean; skilled: boolean; at: number }
  | { kind: "route"; at: number };

export interface After {
  job: Job;
  index: number;
  team: number[];
  tipped: boolean;
  gained: number;
  odds: Odds;
  heatBefore: number;
  lifted?: number;
  route?: string;
  rumour?: { member: number; seen: boolean };
  short: boolean;
  /** Set only when the file is new. */
  file?: string;
}

export interface Note {
  tone: "good" | "bad" | "info";
  title: string;
  body: string;
}

export interface Ending extends Reveal {
  stars: number;
  raided: boolean;
  caught: boolean;
}

export interface Playing {
  key: string;
  next: "brief" | "scout" | "city";
  at: number;
}

type Cue = { name: "clean" | "tipped" | "seen" | "quiet" | "right" | "wrong" | "raid" | "reveal"; at: number; member?: number };

export interface State {
  chapter?: Chapter;
  mode: Mode;
  crew: Member[];
  out: number[];
  /** Lifted on the last getaway: sits out the next job only. */
  benched: number[];
  /** 0..100, only in chapters with the loyalty rule. */
  loyalty: number;
  /** The sit-down vote before the boss job has happened. */
  voted: boolean;
  /** Going with the vote counts as an accusation. */
  sitDown(go: boolean, member: number): Promise<void>;
  job: number;
  bag: number;
  heat: number;
  favors: number;
  wiretapUsed: boolean;
  caught: boolean;
  selected: number[];
  tool: Tool;
  status: Status;
  busy: Busy;
  phase?: Phase;
  sealed: boolean;
  log: Evidence[];
  plan: Plan;
  prompt?: Prompt;
  after?: After;
  scene?: Playing;
  note?: Note;
  cut?: Cut;
  ending?: Ending;
  cue?: Cue;
  taunt?: { text: string; from: "echo" | "hale"; at: number };
  onChain: boolean;
  error?: string;
  contact?: ContactId;
  contactsUsed: ContactId[];
  callContact(id: ContactId | undefined): void;
  newBest?: boolean;
  /** An on-chain run of this chapter left open by a reload. */
  resumable?: LiveRun;
  /** Values for {job}, {take}, {heat} in story lines. */
  memo: Record<string, string>;
  /** Set after the chapter's last scene; the route goes back to the city. */
  done?: { next?: number };
  difficulty: Difficulty;
  progress: Record<number, { stars: number; best: number }>;
  /** Ids from story/evidence.ts, kept across runs. */
  evidence: string[];
  start(id: number): void;
  pickUp(): Promise<void>;
  startOver(): void;
  storyDone(): void;
  begin(): void;
  scout(id: ScoutId): void;
  setTool(t: Tool): void;
  tap(id: number): void;
  go(): Promise<void>;
  /** Answers to an older prompt than `at` are ignored. */
  answer(v: number | string, at?: number): void;
  rushOut(): void;
  next(): void;
  walk(): Promise<void>;
  finish(): void;
  setDifficulty(d: Difficulty): void;
  leave(): void;
}

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const now = () => performance.now();

let engine: TableEngine = createRehearsalTable();
let run = 0;
/** Keys the resume snapshot. */
let ticket: { address: string; run: number } | null = null;

/** State the chain can't give back after a reload. */
interface Snapshot {
  run: number;
  chapter: number;
  job: number;
  log: Evidence[];
  loyalty: number;
  benched: number[];
  voted: boolean;
  caught: boolean;
  memo: Record<string, string>;
}
const snapKey = (address: string) => `snitch:run:${address.toLowerCase()}`;
const bits = (mask: number) => Array.from({ length: 16 }, (_, i) => i).filter((i) => mask & (1 << i));
let waiting: ((v: number | string) => void) | null = null;

export function need(tool: Tool, chapter?: Chapter, job = 0) {
  if (tool === "team") return chapter?.jobs[job] ? teamSize(chapter.jobs[job]) : 0;
  return tool === "wiretap" ? 2 : 1;
}

/** Crew bodies that match the boss look get swapped. */
function dressed(crew: Member[]): Member[] {
  const look = BOSS_LOOKS[(useProfile.getState().identity?.look ?? 0) % BOSS_LOOKS.length].model;
  const female = (m: string) => m.includes("_f") || m === "boss_widow";
  const spares = (["boss_kid", "boss_ghost", "boss", "boss_widow", "gang_f2", "gang_f1", "gang_f3"] as const).filter((m) => m !== look && !crew.some((c) => c.model === m));
  return crew.map((m) => (m.model === look ? { ...m, model: spares.find((x) => female(x) === female(m.model)) ?? m.model } : m));
}

/** The prologue is practice only. */
export const ON_CHAIN = [1, 2, 3, 4, 5, 6, 7, 8];
/** The rooms contract has no special rules, so only plain chapters. */
export const ROOM_CHAPTERS = [1, 2, 3];

function plain(e: Error) {
  if (import.meta.env.DEV) console.error("[chain]", e);
  const m = e.message ?? "";
  const name = revertName(e);
  if (name === "ChapterLocked") return "On Sepolia, a chapter opens once you've won a star on the one before it there. Play the earlier chapter on-chain first, or practise this one.";
  if (name === "Blackout") return "Phones are off before this job: no tails or wiretap until it's done.";
  if (name === "NoFavorsLeft") return "No favours left to call in this run.";
  if (name === "WrongStage") return "This run has already ended on-chain. Start it again.";
  if (/user rejected|denied/i.test(m)) return "You cancelled it in your wallet. Try again when you're ready.";
  if (/insufficient funds/i.test(m)) return "Not enough test ETH for gas. The gas tank tops game wallets up; your own wallet needs Sepolia ETH.";
  if (/gas tank/i.test(m)) return m;
  return "The network didn't answer in time. Your run is safe on-chain: try the move again.";
}

export const away = (s: Pick<State, "out" | "benched">) => [...s.out, ...s.benched];

export const useSnitch = create<State>((set, get) => {
  const play = (key: string, next: Playing["next"]) => {
    if (!SCENES[key]) return void after(next);
    set({ status: "story", scene: { key, next, at: now() } });
  };
  const after = (next: Playing["next"]) => {
    if (next === "brief") set({ status: "brief", scene: undefined });
    else if (next === "scout") {
      // a new job, a change of clothes
      const st = get();
      const crew = st.chapter ? st.crew.map((m) => ({ ...m, outfit: outfitFor(st.chapter!.id, m.id, st.job) })) : st.crew;
      set({ status: "scout", scene: undefined, selected: [], tool: "team", plan: { choices: [] }, crew });
      const s = get();
      if (s.chapter?.rules?.loyalty && s.loyalty < 40) {
        const pool = s.crew.map((m) => m.id).filter((id) => !s.out.includes(id) && !s.benched.includes(id));
        const job = s.chapter.jobs[s.job];
        if (job && pool.length > job.roles.length) {
          const who = pool[Math.floor(Math.random() * pool.length)];
          set({ benched: [...s.benched, who], note: { tone: "bad", title: `${s.crew[who].name} won't work tonight.`, body: `Loyalty is down to ${s.loyalty}. Wrong accusations and police nights cost you their trust.` } });
        }
      }
    }
    else {
      const c = get().chapter;
      set({ scene: undefined, done: { next: c ? CHAPTERS.find((x) => x.id === c.id + 1 && x.open)?.id : undefined } });
    }
  };
  /** Plays the intro while the table is sealed (the start transaction on-chain). */
  const launch = (chapter: Chapter, my: number) => {
    play(chapter.intro, "brief");
    const t = engine;
    void t
      .start(chapter.id, get().mode.id, (phase) => my === run && set({ phase }))
      .then(async () => {
        if (my !== run) return;
        set({ busy: null, sealed: true, phase: undefined });
        const w = useChain.getState().wallet;
        const solo = t as Partial<ChainTable>;
        if (get().onChain && w && solo.live) ticket = { address: w.address, run: (await solo.live()).run };
      })
      .catch((e: Error) => my === run && set({ busy: null, phase: undefined, error: plain(e) }));
  };
  const ask: Ask = (p) =>
    new Promise((resolve) => {
      waiting = resolve as (v: number | string) => void;
      set({ prompt: { ...p, at: now() } as Prompt });
    });

  return {
    mode: MODES[load<Difficulty>("snitch:difficulty", 0)],
    difficulty: load<Difficulty>("snitch:difficulty", 0),
    progress: load("snitch:progress", {}),
    evidence: load<string[]>("snitch:evidence", []),
    crew: [],
    out: [],
    benched: [],
    loyalty: 70,
    voted: false,
    job: 0,
    bag: 0,
    heat: 0,
    favors: 0,
    wiretapUsed: false,
    caught: false,
    selected: [],
    tool: "team",
    status: "story",
    busy: null,
    sealed: false,
    log: [],
    plan: { choices: [] },
    memo: {},
    onChain: false,
    contactsUsed: [],

    callContact(id) {
      const s = get();
      if (s.status !== "scout") return;
      const c = CONTACTS.find((x) => x.id === id);
      if (id && (!c || s.contactsUsed.includes(id) || totalRep(s.progress) < c.rep)) return void audio.error();
      audio.select();
      set({ contact: s.contact === id ? undefined : id });
    },

    start(id) {
      const chapter = findChapter(id);
      if (!chapter) return;
      const my = ++run;
      waiting = null;
      const mode = MODES[get().difficulty];
      engine = createRehearsalTable(1, roomHost.active() ? { seats: roomHost.humanSeats(), begin: roomHost.begin, words: roomHost.words } : undefined, id === DAILY_ID ? dailySeed() : undefined);
      set({
        chapter,
        mode,
        crew: dressed(castOf(chapter)).map((m) => ({ ...m, outfit: outfitFor(chapter.id, m.id) })),
        out: [],
        benched: [],
        loyalty: 70,
        voted: false,
        job: 0,
        bag: 0,
        heat: 0,
        favors: chapter.prologue ? 1 : mode.favors,
        wiretapUsed: false,
        caught: false,
        selected: [],
        tool: "team",
        busy: "start",
        phase: undefined,
        sealed: false,
        log: [],
        plan: { choices: [] },
        prompt: undefined,
        after: undefined,
        note: undefined,
        cut: undefined,
        ending: undefined,
        taunt: undefined,
        done: undefined,
        newBest: undefined,
        contact: undefined,
        contactsUsed: [],
      });
      // Loaded lazily so practice stays light.
      const chain = useChain.getState();
      ticket = null;
      const roomId = roomHost.chainId();
      if (roomId !== undefined && chain.wallet) {
        set({ onChain: true, error: undefined, resumable: undefined, status: "brief" });
        const w = chain.wallet;
        const waitOn = (missing: number[]) => useRoom.setState({ waitingOn: missing });
        void import("../chain/rooms")
          .then(async (m) => {
            const r = await m.readRoom(w, roomId);
            if (my !== run) return;
            if (r.stage !== m.ROOM.Playing && r.stage !== m.ROOM.Ended) {
              engine = m.createRoomTable(w, roomId, waitOn);
              return launch(chapter, my);
            }
            // The boss reloaded mid-room.
            const t = await m.shared(w, roomId);
            if (my !== run) return;
            engine = m.createRoomTable(w, roomId, waitOn, { bag: t.bag, difficulty: r.difficulty });
            set({ mode: MODES[r.difficulty as Difficulty], job: r.job, favors: r.favors, wiretapUsed: r.wiretapUsed, out: bits(r.out), bag: t.bag, heat: t.heat, sealed: true, busy: null, note: { tone: "info", title: "Back at the table.", body: `The room is still on Sepolia: job ${Math.min(r.job + 1, chapter.jobs.length)} of ${chapter.jobs.length}, ${"$" + t.bag.toLocaleString("en-US")} in the bag.` } });
            if (r.stage === m.ROOM.Ended || r.job >= chapter.jobs.length || t.heat >= HEAT_MAX) {
              set({ status: "scout" });
              return void get().walk();
            }
            after("scout");
          })
          .catch((e: Error) => my === run && set({ busy: null, phase: undefined, error: plain(e) }));
        return;
      }
      const real = chain.mode === "chain" && !!chain.wallet && ON_CHAIN.includes(id) && !roomHost.active();
      set({ onChain: real, error: undefined, resumable: undefined });
      if (!real) return launch(chapter, my);
      // Check for an open run first so the intro isn't started and then cut off.
      set({ status: "brief" });
      void import("../chain/engine")
        .then(async (m) => {
          const t = m.createChainTable(chain.wallet!);
          engine = t;
          const open = await t.live().catch(() => undefined);
          if (my !== run) return;
          if (open && open.chapter === id && (open.stage === 1 || open.stage === 2)) set({ busy: null, resumable: open });
          else launch(chapter, my);
        })
        .catch((e: Error) => my === run && set({ busy: null, phase: undefined, error: plain(e) }));
    },

    async pickUp() {
      const s = get();
      const open = s.resumable;
      if (!open || !s.chapter || s.busy) return;
      const my = run;
      const t = engine as ChainTable;
      set({ busy: "start", error: undefined });
      try {
        const { bag, heat } = await t.resume(open, (phase) => my === run && set({ phase }));
        if (my !== run) return;
        const address = useChain.getState().wallet!.address;
        ticket = { address, run: open.run };
        const snap = load<Snapshot | null>(snapKey(address), null);
        const mine = snap && snap.run === open.run && snap.chapter === open.chapter ? snap : null;
        const mode = MODES[open.difficulty as Difficulty];
        set({
          mode,
          job: open.job,
          favors: open.favors,
          wiretapUsed: open.wiretapUsed,
          out: bits(open.out),
          bag,
          heat,
          sealed: true,
          busy: null,
          phase: undefined,
          resumable: undefined,
          ...(mine && { log: mine.log, loyalty: mine.loyalty, voted: mine.voted, caught: mine.caught, memo: mine.memo, benched: mine.job === open.job ? mine.benched : [] }),
          note: { tone: "info", title: "Back at the table.", body: `Job ${Math.min(open.job + 1, s.chapter.jobs.length)} of ${s.chapter.jobs.length}, ${"$" + bag.toLocaleString("en-US")} in the bag. Everything you did is still on-chain.` },
        });
        if (open.stage === 2 || open.job >= s.chapter.jobs.length || heat >= HEAT_MAX) {
          set({ status: "scout" });
          return void get().walk();
        }
        after("scout");
      } catch (e) {
        if (my === run) set({ busy: null, phase: undefined, error: plain(e as Error) });
      }
    },

    startOver() {
      const s = get();
      if (!s.chapter || !s.resumable || s.busy) return;
      set({ resumable: undefined });
      launch(s.chapter, run);
    },

    storyDone() {
      const sc = get().scene;
      if (sc) after(sc.next);
    },

    begin() {
      if (!get().sealed) return;
      audio.door();
      after("scout");
    },

    scout(id) {
      if (get().status !== "scout") return;
      audio.select();
      const contact = get().contact;
      set({ plan: { scout: id, choices: [], contact }, contact: undefined, contactsUsed: contact ? [...get().contactsUsed, contact] : get().contactsUsed, status: "plan", tool: "team", selected: [] });
    },

    setTool(tool) {
      const s = get();
      if (s.busy || s.status !== "plan") return;
      if ((tool === "tail" || tool === "wiretap") && blackout(s.chapter?.jobs[s.job])) return void audio.error();
      set({ tool, selected: [] });
    },

    tap(id) {
      const s = get();
      if (s.busy || s.status !== "plan" || s.out.includes(id)) return;
      if (s.tool === "team" && (barred(s.chapter?.jobs[s.job], id) || s.benched.includes(id))) return void audio.error();
      const n = need(s.tool, s.chapter, s.job);
      let selected: number[];
      if (s.selected.includes(id)) selected = s.selected.filter((x) => x !== id);
      else if (n === 1) selected = [id];
      else if (s.selected.length >= n) return void audio.error();
      else selected = [...s.selected, id];
      if (selected.length > s.selected.length || n === 1) audio.select();
      else audio.deselect();
      haptics.tap();
      set({ selected });
    },

    async go() {
      const s = get();
      if (!s.chapter || s.busy || s.status !== "plan") return;
      if (s.selected.length !== need(s.tool, s.chapter, s.job)) return;
      if (s.tool === "team" && teamProblem(s.chapter.jobs[s.job], s.selected, away(s), s.crew)) return void audio.error();
      const my = run;
      const alive = () => my === run;
      try {
        await ACTIONS[s.tool]({ get, set, engine, alive, on: (phase) => alive() && set({ phase }), ask });
      } catch (e) {
        // Nothing is lost on a failed chain call: back to planning.
        if (!alive()) return;
        waiting = null;
        set({ busy: null, phase: undefined, prompt: undefined, cut: undefined, status: "plan", selected: [], note: { tone: "bad", title: "The move didn't go through.", body: plain(e as Error) } });
      }
    },

    async sitDown(go, member) {
      const s = get();
      if (s.status !== "scout" || s.voted) return;
      set({ voted: true });
      if (!go) {
        audio.error();
        set((st) => ({ loyalty: Math.max(0, st.loyalty - 20), note: { tone: "bad", title: "You overruled the table.", body: "They'll do the job. They won't forget it." } }));
        return;
      }
      set({ status: "plan", tool: "accuse", selected: [member] });
      await get().go();
      if (get().status === "plan") set({ status: "scout", tool: "team", selected: [] });
    },

    answer(v, at) {
      if (!waiting || (at !== undefined && get().prompt?.at !== at)) return;
      const w = waiting;
      waiting = null;
      set({ prompt: undefined });
      w?.(v);
    },

    rushOut() {
      const s = get();
      if (!s.chapter || s.busy || s.status !== "plan" || !s.chapter.jobs[s.job]) return;
      set({ tool: "team", selected: autoTeam(s.chapter, s.job, s.tool === "team" ? s.selected : [], away(s)) });
      void get().go();
    },

    next() {
      const s = get();
      if (s.status !== "aftermath" || !s.chapter || !s.after) return;
      const finished = s.job >= s.chapter.jobs.length;
      const raided = s.heat >= HEAT_MAX;
      if (s.chapter.prologue && (finished || raided)) {
        const progress = { ...s.progress, 0: { stars: 1, best: 0 } };
        save("snitch:progress", progress);
        set({ progress, after: undefined });
        return play(s.chapter.outro, "city");
      }
      if (finished || raided) {
        set({ after: undefined });
        return void get().walk();
      }
      const key = s.after.job.after;
      set({ after: undefined, memo: { job: s.after.job.name, take: "$" + s.after.gained.toLocaleString("en-US"), heat: String(s.heat) } });
      if (key) play(key, "scout");
      else after("scout");
    },

    async walk() {
      const s = get();
      if (!s.chapter || s.busy || s.status === "ended" || s.status === "brief" || s.status === "story") return;
      const my = run;
      const raided = s.heat >= HEAT_MAX;
      if (raided) {
        audio.setScene("raid");
        set({ cue: { name: "raid", at: now() } });
      }
      set({ busy: "end", selected: [] });
      let r: Reveal;
      try {
        r = await engine.walkAway((phase) => my === run && set({ phase }));
      } catch (e) {
        // The run is still on-chain; walking away again resumes it.
        if (my === run) set({ busy: null, phase: undefined, note: { tone: "bad", title: "The reveal didn't come through.", body: plain(e as Error) + " Press Walk away again to finish." } });
        return;
      }
      if (my !== run) return;
      // Settle just recorded stars; refresh so the next chapter unlocks.
      if (s.onChain) {
        void useChain.getState().refresh();
        // public nodes can lag a block or two
        setTimeout(() => void useChain.getState().refresh(), 8000);
      }
      const stars = starsFor(s.chapter, r.bag, raided);
      const prev = get().progress[s.chapter.id] ?? { stars: 0, best: 0 };
      // Daily and endless keep their own bests and don't count toward story progress.
      const side = isSideMode(s.chapter.id);
      const best = side && recordBest(s.chapter.id, r.payout, s.job);
      const progress = side ? get().progress : { ...get().progress, [s.chapter.id]: { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, r.payout) } };
      if (!side) save("snitch:progress", progress);
      if (best) set({ newBest: true });
      if (ticket) {
        try {
          localStorage.removeItem(snapKey(ticket.address));
        } catch {
          /* private mode */
        }
        ticket = null;
      }
      audio.setScene("reveal");
      set({ busy: null, phase: undefined, status: "ended", progress, ending: { ...r, stars, raided, caught: s.caught }, cue: { name: "reveal", at: now(), member: r.snitch } });
      haptics.reveal();
    },

    finish() {
      const s = get();
      if (!s.chapter || s.status !== "ended") return;
      if ((s.ending?.stars ?? 0) > 0 && s.chapter.outro) play(s.chapter.outro, "city");
      else after("city");
    },

    setDifficulty(d) {
      save("snitch:difficulty", d);
      set({ difficulty: d, mode: MODES[d] });
    },

    leave() {
      run++;
      waiting = null;
      set({ chapter: undefined, crew: [], status: "story", busy: null, cut: undefined, ending: undefined, note: undefined, selected: [], out: [], benched: [], heat: 0, bag: 0, prompt: undefined, after: undefined, scene: undefined, done: undefined });
    },
  };
});

export const totalRep = (p: Record<number, { stars: number; best: number }>) => Object.values(p).reduce((a, b) => a + b.best, 0);
export const seat = (id: number) => useSnitch.getState().crew[id];

// Snapshot on-chain runs at quiet moments so a reload can resume.
let lastSnap = "";
useSnitch.subscribe((s) => {
  if (!ticket || !s.onChain || s.busy || !s.chapter || !(s.status === "scout" || s.status === "plan" || s.status === "aftermath")) return;
  const snap: Snapshot = { run: ticket.run, chapter: s.chapter.id, job: s.job, log: s.log, loyalty: s.loyalty, benched: s.benched, voted: s.voted, caught: s.caught, memo: s.memo };
  const json = JSON.stringify(snap);
  if (json === lastSnap) return;
  lastSnap = json;
  try {
    localStorage.setItem(snapKey(ticket.address), json);
  } catch {
    /* private mode */
  }
});

// Dev only: exposed for browser tests.
if (import.meta.env.DEV && typeof window !== "undefined") Object.assign(window, { snitch: useSnitch, snitchChain: useChain });
