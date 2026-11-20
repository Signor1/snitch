import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { ECHO_AFTER } from "../story/script";
import { fileFor } from "../story/evidence";
import { HEAT_MAX } from "./data";
import type { Phase, TableEngine } from "./engine";
import { GAME_FOR, GAME_SKILL, ROUTES, getaway, hasSkill, money, oddsFor } from "./mission";
import type { Prompt, State, Tool } from "./store";

/** Resolves to a choice index, a hands-on score (0..100) or a route id. */
export type Ask = (p: DistributiveOmit<Prompt, "at">) => Promise<number | string>;
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Actions never import the store, so each can be tested alone. */
export interface Ctx {
  get(): State;
  set(p: Partial<State> | ((s: State) => Partial<State>)): void;
  engine: TableEngine;
  /** False once the player has left or restarted: late results are dropped. */
  alive(): boolean;
  on(phase: Phase): void;
  ask: Ask;
}

const ESTABLISH_MS = 2600;
const DOOR_MS = 1500;
const INSIDE_MIN_MS = 2400;
const PAYOFF_MS = 4600;
const EXIT_MS = 2600;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

async function runJob({ get, set, engine, alive, on, ask }: Ctx) {
  const s = get();
  const chapter = s.chapter!;
  const team = s.selected;
  const j = chapter.jobs[s.job];
  if (!j) return;
  const plan = { ...s.plan, choices: [] as number[] };
  const known = plan.scout === "case";
  const seconds = s.mode.think + (known ? 4 : 0);
  audio.engine();
  engine.rollOut?.(team);
  set({ busy: "job", status: "job", note: undefined, plan, cut: { state: "go", beat: "arrive", beatAt: now(), target: j.target, venue: j.venue, at: now(), team, job: j.name, gained: 0 } });

  await wait(ESTABLISH_MS);
  if (!alive()) return;
  plan.choices[0] = Number(await ask({ kind: "choice", event: j.beats[0], seconds, known }));
  if (!alive()) return;

  audio.door();
  set((st) => (st.cut ? { cut: { ...st.cut, beat: "inside", beatAt: now() } } : {}));
  await wait(DOOR_MS);
  if (!alive()) return;
  const game = GAME_FOR[j.target];
  plan.game = Number(await ask({ kind: "game", game, easy: plan.scout === "plans", skilled: hasSkill(j, team, s.crew, GAME_SKILL[game]) })) / 100;
  if (!alive()) return;
  plan.choices[1] = Number(await ask({ kind: "choice", event: j.beats[1], seconds, known }));
  if (!alive()) return;
  set({ plan: { ...plan } });

  const odds = oddsFor(j, team, s.crew, s.mode, plan);
  const heatBefore = get().heat;
  const [r] = await Promise.all([engine.runJob(team, { badLuck: odds.badLuck, take: odds.take, rung: odds.rung, bps: odds.bps, hot: j.task.kind === "hot", raid: !!chapter.rules?.allIn && !!j.boss }, on), wait(INSIDE_MIN_MS)]);
  if (!alive()) return;
  set((st) => ({
    phase: undefined,
    cut: { ...st.cut!, state: r.tipped ? "tipped" : "clean", beat: "payoff", beatAt: now(), at: now(), gained: r.gained },
    cue: { name: r.tipped ? "tipped" : "clean", at: now() },
  }));
  if (r.tipped) {
    audio.heat();
    haptics.stamp();
  } else audio.cash(6);
  await wait(PAYOFF_MS);
  if (!alive()) return;
  if (!r.tipped) audio.engine();
  set((st) => (st.cut ? { cut: { ...st.cut, beat: "exit", beatAt: now() } } : {}));

  // A bad getaway pick benches a member for one job.
  let lifted: number | undefined;
  let route: string | undefined;
  if (r.tipped && !j.forced && r.heat < HEAT_MAX) {
    await wait(1200);
    if (!alive()) return;
    route = String(await ask({ kind: "route" }));
    if (!alive()) return;
    const rt = ROUTES.find((x) => x.id === route) ?? ROUTES[0];
    if (plan.contact !== "wheel" && getaway(rt, hasSkill(j, team, s.crew, "Driver"))) {
      lifted = team[Math.floor(Math.random() * team.length)];
      audio.badge();
    } else audio.engine();
    await wait(1400);
  } else await wait(EXIT_MS);
  if (!alive()) return;

  const pool = s.crew.map((m) => m.id).filter((id) => !get().out.includes(id));
  const target = pool[Math.floor(Math.random() * pool.length)];
  // The rooms contract has no rumour move.
  const rumour = j.forced || !engine.rumour ? undefined : await engine.rumour(target, on);
  if (!alive()) return;
  const short = !r.tipped && r.gained < odds.take;
  // Perfect job: clean, nothing skimmed, inside work done well.
  const found = !r.tipped && !short && (plan.game ?? 0) >= 0.8 ? fileFor(chapter.id, s.job) : undefined;
  const fresh = found && !get().evidence.includes(found.id) ? found.id : undefined;
  if (fresh) {
    try {
      localStorage.setItem("snitch:evidence", JSON.stringify([...get().evidence, fresh]));
    } catch {
      /* private mode */
    }
  }
  const echo = !j.after && Math.random() < 0.6 ? ECHO_AFTER[Math.floor(Math.random() * ECHO_AFTER.length)] : undefined;
  set((st) => ({
    busy: null,
    phase: undefined,
    status: "aftermath",
    cut: undefined,
    job: st.job + 1,
    bag: r.bag,
    heat: r.heat,
    selected: [],
    benched: lifted !== undefined ? [lifted] : [],
    loyalty: chapter.rules?.loyalty ? Math.max(0, Math.min(100, st.loyalty + (r.tipped ? -10 : 5) - (lifted !== undefined ? 5 : 0))) : st.loyalty,
    log: [
      ...st.log,
      { kind: "job", team, tipped: r.tipped, badLuck: odds.badLuck, t: st.job + 0.5 },
      ...(rumour ? [{ kind: "rumour" as const, member: target, seen: rumour.seen, t: st.job + 1 }] : []),
    ],
    after: { job: j, index: st.job, team, tipped: r.tipped, gained: r.gained, odds, heatBefore, lifted, route, rumour: rumour && { member: target, seen: rumour.seen }, short, file: fresh },
    evidence: fresh ? [...st.evidence, fresh] : st.evidence,
    taunt: echo ? { text: fill(echo, { job: j.name, how: r.tipped ? "loud" : "quiet", heat: String(r.heat), take: money(r.gained) }), from: "echo", at: now() + 1800 } : st.taunt,
  }));
}

export function fill(t: string, v: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
}

async function tail({ get, set, engine, alive, on }: Ctx) {
  const s = get();
  if (s.favors <= 0) return;
  const m = s.selected[0];
  const name = s.crew[m].name;
  set({ busy: "tail", note: undefined });
  const r = await engine.tail(m, on);
  if (!alive()) return;
  audio.shutter();
  set((st) => ({
    busy: null,
    phase: undefined,
    favors: st.favors - 1,
    selected: [],
    tool: "team",
    log: [...st.log, { kind: "tail", member: m, seen: r.seen, t: st.job }],
    cue: { name: r.seen ? "seen" : "quiet", at: now(), member: m },
    note: r.seen
      ? { tone: "bad", title: `${name} met someone with a badge.`, body: "That's what your tail says. Tails are usually right, not always." }
      : { tone: "good", title: `${name} went straight home.`, body: "Nothing odd, says your tail. Tails are usually right, not always." },
  }));
}

async function wiretap({ get, set, engine, alive, on }: Ctx) {
  const s = get();
  if (s.wiretapUsed || !s.chapter?.wiretap) return;
  const [a, b] = s.selected;
  const [na, nb] = [s.crew[a].name, s.crew[b].name];
  set({ busy: "wiretap", note: undefined });
  audio.staticBurst();
  const r = await engine.wiretap(a, b, on);
  if (!alive()) return;
  set((st) => ({
    busy: null,
    phase: undefined,
    wiretapUsed: true,
    selected: [],
    tool: "team",
    log: [...st.log, { kind: "wiretap", pair: [a, b], hit: r.hit, t: st.job }],
    cue: { name: r.hit ? "seen" : "quiet", at: now() },
    note: r.hit
      ? { tone: "bad", title: "The wire picked up a cop's voice.", body: `The snitch is ${na} or ${nb}. The wiretap never lies.` }
      : { tone: "good", title: "The line was clean.", body: `Neither ${na} nor ${nb} is the snitch. The wiretap never lies.` },
  }));
}

async function accuse({ get, set, engine, alive, on }: Ctx) {
  const s = get();
  const m = s.selected[0];
  const name = s.crew[m].name;
  set({ busy: "accuse", note: undefined });
  audio.accuse();
  const r = await engine.accuse(m, on);
  if (!alive()) return;
  if (r.right) audio.badge();
  else audio.heat();
  haptics.stamp();
  set((st) => ({
    busy: null,
    phase: undefined,
    out: [...st.out, m],
    loyalty: st.chapter?.rules?.loyalty && !r.right ? Math.max(0, st.loyalty - 25) : st.loyalty,
    bag: r.bag,
    heat: r.heat,
    caught: st.caught || r.right,
    selected: [],
    tool: "team",
    log: [...st.log, { kind: "accuse", member: m, right: r.right, t: st.job }],
    cue: { name: r.right ? "right" : "wrong", at: now(), member: m },
    note: r.right
      ? { tone: "good", title: `It was ${name}.`, body: "The snitch is out and your bag just doubled. Only bad luck can hurt you now." }
      : { tone: "bad", title: `${name} was loyal.`, body: `They walked out. The noise cost you: heat ${r.heat} of ${HEAT_MAX}. The snitch is still at the table.` },
  }));
  if (r.heat >= HEAT_MAX) await get().walk();
}

export const ACTIONS: Record<Tool, (ctx: Ctx) => Promise<void>> = { team: runJob, tail, wiretap, accuse };

