import { create } from "zustand";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { CHAPTERS, castOf } from "../game/data";
import { connect, me, type Msg, type Net, type Seat } from "./net";
import { useChain } from "../chain/store";
import type { Wallet } from "../chain/wallet";
import type { Difficulty } from "../game/data";

export interface FeedItem {
  tone: "good" | "bad" | "info";
  title: string;
  body: string;
  at: number;
}

interface RoomState {
  code?: string;
  host: boolean;
  hostName: string;
  chapter: number;
  difficulty: number;
  seats: (Seat | null)[];
  started: boolean;
  /** Guest only. */
  mySeat?: number;
  snitch?: boolean;
  /** Guest only. */
  ask?: { job: number; name: string; seats: number[]; until: number };
  sealedJob?: number;
  feed: FeedItem[];
  end?: { snitch: number; snitchWon: boolean; payout: number };
  /** Room lives in SnitchRooms on Sepolia. */
  chain: boolean;
  /** Pending lobby transaction. */
  working?: string;
  error?: string;
  /** Host, on-chain: seats on the current job still to seal. */
  waitingOn: number[];
  /** Resolves to the room code (its contract id). */
  hostChainRoom(chapter: number, difficulty: Difficulty): Promise<string | undefined>;
  hostRoom(code: string, name: string, chapter: number, difficulty: number): void;
  joinRoom(code: string, name: string): void;
  take(seat: number): void;
  seal(talk: boolean): void;
  close(): void;
}

let net: Net | null = null;
/** Host only: job -> seat -> talk. */
const words = new Map<number, Map<number, boolean>>();
const waiters = new Set<() => void>();

export const useRoom = create<RoomState>((set, get) => {
  const lobby = () => {
    const s = get();
    net?.send({ k: "lobby", from: me, host: me, hostName: s.hostName, chapter: s.chapter, difficulty: s.difficulty, seats: s.seats, started: s.started });
  };
  const onHost = (m: Msg) => {
    const s = get();
    if (m.k === "hello") lobby();
    else if (m.k === "take" && !s.started) {
      if (s.seats[m.seat] || m.seat >= s.seats.length) return lobby();
      const seats = s.seats.map((x) => (x?.id === m.from ? null : x));
      seats[m.seat] = { id: m.from, name: m.name.slice(0, 16) || "Friend" };
      set({ seats });
      audio.select();
      lobby();
    } else if (m.k === "leave" && !s.started) {
      set({ seats: s.seats.map((x) => (x?.id === m.from ? null : x)) });
      lobby();
    } else if (m.k === "word") {
      const seat = s.seats[m.seat];
      if (!seat || seat.id !== m.from) return; // only the person in that seat can seal for it
      if (!words.has(m.job)) words.set(m.job, new Map());
      words.get(m.job)!.set(m.seat, m.talk);
      waiters.forEach((w) => w());
    }
  };
  const onGuest = (m: Msg) => {
    const s = get();
    if (m.k === "lobby") {
      const mine = m.seats.findIndex((x) => x?.id === me);
      set({ hostName: m.hostName, chapter: m.chapter, difficulty: m.difficulty, seats: m.seats, started: m.started, mySeat: mine >= 0 ? mine : undefined });
    } else if (m.k === "role" && m.to === me) {
      set({ snitch: m.snitch, started: true });
      haptics.reveal();
    } else if (m.k === "ask" && s.mySeat !== undefined && m.seats.includes(s.mySeat)) {
      set({ ask: { job: m.job, name: m.name, seats: m.seats, until: m.until } });
      audio.phone();
      haptics.stamp();
    } else if (m.k === "feed") {
      set({ feed: [{ tone: m.tone, title: m.title, body: m.body, at: Date.now() }, ...s.feed].slice(0, 30) });
    } else if (m.k === "end") set({ end: { snitch: m.snitch, snitchWon: m.snitchWon, payout: m.payout } });
  };

  return {
    chain: false,
    waitingOn: [],
    host: false,
    hostName: "",
    chapter: 1,
    difficulty: 0,
    seats: [],
    started: false,
    feed: [],

    hostRoom(code, name, chapter, difficulty) {
      net?.close();
      words.clear();
      const c = CHAPTERS.find((x) => x.id === chapter)!;
      stopWatch();
      set({ chain: false, code, host: true, hostName: name, chapter, difficulty, seats: Array(c.cast.length).fill(null), started: false, mySeat: undefined, snitch: undefined, ask: undefined, feed: [], end: undefined });
      net = connect(code, (m) => m.from !== me && onHost(m));
      lobby();
    },

    async hostChainRoom(chapter, difficulty) {
      set({ working: "Opening the room on Sepolia", error: undefined });
      try {
        const w = await wallet();
        const { openRoom } = await import("../chain/rooms");
        const id = await openRoom(w, chapter, difficulty);
        net?.close();
        net = null;
        const c = CHAPTERS.find((x) => x.id === chapter)!;
        set({ code: String(id), chain: true, host: true, hostName: "You", chapter, difficulty, seats: Array(c.cast.length).fill(null), started: false, mySeat: undefined, snitch: undefined, ask: undefined, feed: [], end: undefined, working: undefined });
        watch(id, w);
        return String(id);
      } catch (e) {
        set({ working: undefined, error: plainRoom(e as Error) });
      }
    },

    joinRoom(code, name) {
      if (/^\d+$/.test(code)) {
        net?.close();
        net = null;
        set({ code, chain: true, host: false, hostName: "", seats: [], started: false, mySeat: undefined, snitch: undefined, ask: undefined, sealedJob: undefined, feed: [], end: undefined, error: undefined });
        void wallet()
          .then((w) => watch(Number(code), w))
          .catch((e: Error) => set({ error: plainRoom(e) }));
        return;
      }
      void name;
      net?.close();
      stopWatch();
      set({ chain: false, code, host: false, hostName: "", seats: [], started: false, mySeat: undefined, snitch: undefined, ask: undefined, feed: [], end: undefined });
      net = connect(code, (m) => m.from !== me && onGuest(m));
      net.send({ k: "hello", from: me, name });
    },

    take(seat) {
      const s = get();
      if (s.host || s.started) return;
      if (s.chain) {
        if (s.working || s.mySeat !== undefined) return;
        set({ working: "Taking the seat", error: undefined });
        void (async () => {
          const w = await wallet();
          const m = await import("../chain/rooms");
          await m.takeSeat(w, Number(s.code), seat);
          set({ working: undefined });
          audio.select();
          await poll();
        })().catch((e: Error) => set({ working: undefined, error: plainRoom(e) }));
        return;
      }
      net?.send({ k: "take", from: me, name: localName(), seat });
    },

    seal(talk) {
      const a = get().ask;
      const seat = get().mySeat;
      if (!a || seat === undefined) return;
      if (get().chain) {
        if (get().working) return;
        set({ working: "Sealing your word, encrypted in your browser", error: undefined });
        void (async () => {
          const w = await wallet();
          const m = await import("../chain/rooms");
          await m.sealWord(w, Number(get().code), talk);
          audio.shutter();
          set({ working: undefined, ask: undefined, sealedJob: a.job });
        })().catch((e: Error) => set({ working: undefined, error: plainRoom(e) }));
        return;
      }
      net?.send({ k: "word", from: me, job: a.job, seat, talk });
      audio.shutter();
      set({ ask: undefined, sealedJob: a.job });
    },

    close() {
      const s = get();
      stopWatch();
      if (s.chain && !s.host && !s.started && s.mySeat !== undefined) {
        void wallet()
          .then(async (w) => (await import("../chain/rooms")).leaveSeat(w, Number(s.code)))
          .catch(() => {});
      }
      set({ chain: false, working: undefined, error: undefined, waitingOn: [], sealedJob: undefined });
      if (!get().host && !get().started) net?.send({ k: "leave", from: me });
      net?.close();
      net = null;
      words.clear();
      set({ code: undefined, host: false, seats: [], started: false, mySeat: undefined, snitch: undefined, ask: undefined, feed: [], end: undefined });
    },
  };
});

/** The gasless game wallet unless one is connected. */
async function wallet(): Promise<Wallet> {
  const c = useChain.getState();
  if (c.wallet) return c.wallet;
  await c.connect("game");
  const w = useChain.getState().wallet;
  if (!w) throw new Error(useChain.getState().error ?? "No wallet");
  return w;
}

function plainRoom(e: Error) {
  if (import.meta.env.DEV) console.error("[room]", e);
  const m = e.message ?? "";
  if (/SeatTaken/.test(m)) return "Someone just took that seat. Pick another.";
  if (/AlreadySeated/.test(m)) return "You already have a seat at this table.";
  if (/WrongStage|BadRoom/.test(m)) return "This room has already started, or it doesn't exist.";
  if (/user rejected|denied/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(m)) return "This wallet has no test ETH, and gasless play isn't switched on for this site.";
  return "The network didn't answer in time. Try again.";
}

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

// On-chain rooms have no messages: every screen polls the contract.
let watching: { id: number; w: Wallet; timer: ReturnType<typeof setInterval>; job?: number; out?: number; ended?: boolean; role?: boolean } | null = null;
let polling = false;

function watch(id: number, w: Wallet) {
  stopWatch();
  watching = { id, w, timer: setInterval(() => void poll(), 4000) };
  void poll();
}
function stopWatch() {
  if (watching) clearInterval(watching.timer);
  watching = null;
}

async function poll() {
  const at = watching;
  if (!at || polling) return;
  polling = true;
  try {
    const m = await import("../chain/rooms");
    const r = await m.readRoom(at.w, at.id);
    if (watching !== at) return;
    // The boss after a reload.
    if (!useRoom.getState().host && r.host.toLowerCase() === at.w.address.toLowerCase()) useRoom.setState({ host: true });
    const s = useRoom.getState();
    const mine = r.seats.findIndex((a) => a.toLowerCase() === at.w.address.toLowerCase());
    const seats = r.seats.map((a, i) => (m.isSeat(a) ? { id: a, name: i === mine ? "You" : `Friend ${short(a)}` } : null));
    const started = r.stage >= m.ROOM.Playing;
    const chapter = CHAPTERS.find((c) => c.id === r.chapter);
    useRoom.setState({ chapter: r.chapter, difficulty: r.difficulty, seats, started, mySeat: mine >= 0 ? mine : undefined, hostName: s.host ? "You" : `Boss ${short(r.host)}` });
    if (r.stage === m.ROOM.None) return void useRoom.setState({ error: "There's no room with that code." });
    // Once the run has started the boss's table reads the contract itself.
    if (s.host && started) return stopWatch();
    if (s.host || mine < 0) return;

    if (started && at.role === undefined) {
      const role = await m.myRole(at.w, at.id);
      if (role !== undefined && watching === at) {
        at.role = role;
        useRoom.setState({ snitch: role });
        haptics.reveal();
      }
    }
    const feed = (tone: FeedItem["tone"], title: string, body: string) => useRoom.setState((st) => ({ feed: [{ tone, title, body, at: Date.now() }, ...st.feed].slice(0, 30) }));
    const name = (i: number) => (chapter ? castOf(chapter)[i]?.name : undefined) ?? `Seat ${i + 1}`;

    const bit = 1 << mine;
    const st = useRoom.getState();
    if (r.pending && r.team & bit && !(r.sealedMask & bit) && st.sealedJob !== r.job) {
      if (st.ask?.job !== r.job) {
        useRoom.setState({ ask: { job: r.job, name: chapter?.jobs[r.job]?.name ?? "The job", seats: m.seatsOf(r.team), until: (r.proposedAt + m.SEAL_TIMEOUT_S) * 1000 } });
        feed("info", `${chapter?.jobs[r.job]?.name ?? "A job"}: the crew is going in`, `On the job: ${m.seatsOf(r.team).map(name).join(", ")}.`);
        audio.phone();
        haptics.stamp();
      }
    } else if (st.ask) useRoom.setState({ ask: undefined });

    const newJob = at.job !== undefined && r.job > at.job;
    const newOut = at.out !== undefined && (r.out & ~at.out) !== 0;
    if (newJob || newOut) {
      const t = await m.shared(at.w, at.id);
      if (newJob) {
        const j = chapter?.jobs[r.job - 1]?.name ?? "The job";
        feed(t.tipped ? "bad" : "good", t.tipped ? `${j}: the police were waiting` : `${j}: clean`, t.tipped ? `Heat ${t.heat} of 3. Somebody on that team talked, or it was bad luck.` : `$${t.bag.toLocaleString("en-US")} in the bag.`);
      }
      if (newOut) {
        const who = m.seatsOf(r.out & ~(at.out ?? 0))[0];
        feed(t.right ? "good" : "bad", `The boss accused ${name(who)}`, t.right ? "It was them. They're out, and the bag doubled." : "They were loyal. They walked out, and the heat went up.");
      }
    }
    at.job = r.job;
    at.out = r.out;

    if (r.stage === m.ROOM.Ended && !at.ended) {
      at.ended = true;
      feed("info", "The boss walked away", "The reveal is on its way, with a proof the contract checks.");
    }
    if (r.stage === m.ROOM.Settled) {
      const res = await m.resultOf(at.w, at.id);
      useRoom.setState({ end: { snitch: res.snitch, snitchWon: res.snitchWon, payout: res.payout }, ask: undefined });
      stopWatch();
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[room poll]", e);
  } finally {
    polling = false;
  }
}

const localName = () => {
  try {
    return localStorage.getItem("snitch:friendName") || "Friend";
  } catch {
    return "Friend";
  }
};

/** Missing words count as stay quiet. */
export const roomHost = {
  active: () => useRoom.getState().host && !!useRoom.getState().code,
  /** Room id on Sepolia, for on-chain rooms. */
  chainId: () => (roomHost.active() && useRoom.getState().chain ? Number(useRoom.getState().code) : undefined),
  humanSeats: () => useRoom.getState().seats.flatMap((s, i) => (s ? [i] : [])),
  begin(snitch: number) {
    const s = useRoom.getState();
    useRoom.setState({ started: true });
    s.seats.forEach((seat, i) => seat && net?.send({ k: "role", from: me, to: seat.id, snitch: i === snitch }));
    net?.send({ k: "lobby", from: me, host: me, hostName: s.hostName, chapter: s.chapter, difficulty: s.difficulty, seats: s.seats, started: true });
  },
  async words(job: number, name: string, seats: number[], ms = 45000): Promise<Map<number, boolean>> {
    const until = Date.now() + ms;
    net?.send({ k: "ask", from: me, job, name, seats, until });
    const got = () => words.get(job) ?? new Map<number, boolean>();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (seats.every((x) => got().has(x)) || Date.now() >= until) {
          waiters.delete(check);
          clearTimeout(t);
          resolve();
        }
      };
      const t = setTimeout(check, ms + 50);
      waiters.add(check);
      check();
    });
    return got();
  },
  feed(tone: FeedItem["tone"], title: string, body: string) {
    net?.send({ k: "feed", from: me, tone, title, body });
  },
  end(snitch: number, snitchWon: boolean, payout: number) {
    net?.send({ k: "end", from: me, snitch, snitchWon, payout });
  },
};
