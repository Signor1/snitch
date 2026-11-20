import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button, money } from "../components/ui";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { HEAT_MAX, jobTake, taskCopy } from "../game/data";
import { CONTACTS, EVENTS, ROUTES, SCOUTS, hasSkill } from "../game/mission";
import { suspicion } from "../game/suspicion";
import { totalRep, useSnitch } from "../game/store";
import { FILES, fileFor } from "../story/evidence";

const ease = [0.22, 1, 0.36, 1] as const;
const NONE: number[] = [];

export function Scout() {
  const chapter = useSnitch((s) => s.chapter)!;
  const index = useSnitch((s) => s.job);
  const crew = useSnitch((s) => s.crew);
  const benched = useSnitch((s) => s.benched);
  const scout = useSnitch((s) => s.scout);
  const voted = useSnitch((s) => s.voted);
  const job = chapter.jobs[index];
  if (!job) return null;
  if (job.boss && chapter.rules?.loyalty && !voted) return <SitDown />;
  const task = taskCopy(job.task, crew);
  return (
    <motion.div className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.5, ease }}>
      <div className="mx-auto w-full max-w-4xl">
        {/* on phones the status bar already shows the job and take */}
        <div className="mb-3 text-center sm:mb-4">
          <p className="eyebrow text-violet max-sm:hidden">
            Job {index + 1} of {chapter.jobs.length}
            {job.boss && <span className="ml-2 rounded-full border border-heat/70 px-2 py-0.5 text-heat">Boss job</span>}
          </p>
          <h2 className="display neon-violet mt-1 text-4xl text-mist max-sm:hidden sm:text-5xl">{job.name}</h2>
          <p className="mx-auto mt-2 max-w-xl text-mist-dim max-sm:mt-0 max-sm:text-sm">{job.about}</p>
          <p className="mt-2 text-sm text-mist max-sm:hidden">
            <span className="num text-cyan">{money(jobTake(job))}</span> · team of {job.roles.length}: {job.roles.join(", ").toLowerCase()}
            {job.task.kind !== "plain" && <span className="ml-2 text-cyan">· {task.title}</span>}
          </p>
          {benched.length > 0 && <p className="mt-1 text-sm text-heat">{benched.map((b) => crew[b].name).join(", ")} got picked up last night: sits this one out.</p>}
        </div>
        <p className="eyebrow mb-2 text-center text-mist-faint">First, one move</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {SCOUTS.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              onClick={() => scout(s.id)}
              className="panel group rounded-2xl p-3 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-cyan sm:p-4"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="display-soft text-base text-mist group-hover:text-cyan sm:text-lg">{s.title}</span>
                <span className="num text-xs text-mist-faint">{s.cost ? `-${money(jobTake(job) * s.cost)}` : "free"}</span>
              </span>
              <span className="mt-1 block text-xs text-mist-dim sm:text-sm">{s.body}</span>
            </motion.button>
          ))}
        </div>
        <Contacts />
      </div>
    </motion.div>
  );
}

/** Earned with reputation; one call each per run. */
function Contacts() {
  const rep = useSnitch((s) => totalRep(s.progress));
  const used = useSnitch((s) => s.contactsUsed);
  const picked = useSnitch((s) => s.contact);
  const call = useSnitch((s) => s.callContact);
  return (
    <div className="mt-3">
      <p className="eyebrow mb-2 text-center text-mist-faint max-sm:hidden">Call a contact · once a run</p>
      <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {CONTACTS.map((c) => {
          const locked = rep < c.rep;
          const spent = used.includes(c.id);
          return (
            <button
              key={c.id}
              disabled={locked || spent}
              onClick={() => call(c.id)}
              title={c.body}
              className={clsx("rounded-full border px-3.5 py-1.5 text-left text-xs transition-colors", picked === c.id ? "border-cyan bg-cyan/15 text-mist" : "border-line bg-ink/70 text-mist-dim enabled:hover:border-violet", (locked || spent) && "opacity-45")}
            >
              <span className="font-semibold text-mist">{c.name}</span>
              <span className="ml-1.5">{locked ? `at ${money(c.rep)} rep` : spent ? "called" : picked === c.id ? "on this job" : <span className="max-sm:hidden">{c.body.split(":")[0].split(".")[0]}</span>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Loyalty chapters: the crew votes someone out before the boss job. */
function SitDown() {
  const crew = useSnitch((s) => s.crew);
  const out = useSnitch((s) => s.out);
  const log = useSnitch((s) => s.log);
  const mode = useSnitch((s) => s.mode);
  const rules = useSnitch((s) => s.chapter?.rules);
  const done = useSnitch((s) => s.job);
  const loyalty = useSnitch((s) => s.loyalty);
  const sitDown = useSnitch((s) => s.sitDown);
  const busy = useSnitch((s) => s.busy);
  // Votes use only the clues the player has seen.
  const odds = suspicion(crew.length, mode, log, rules, done);
  const present = crew.filter((m) => !out.includes(m.id));
  const pick = present.reduce((a, b) => (odds[b.id] > odds[a.id] ? b : a), present[0]);
  const votes = Math.max(2, Math.round((present.length - 1) * Math.min(0.9, 0.45 + odds[pick.id])));
  return (
    <motion.div className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease }}>
      <div className="panel mx-auto w-full max-w-2xl rounded-3xl p-6 text-center">
        <p className="eyebrow text-heat">The sit-down</p>
        <h2 className="display mt-1 text-4xl text-mist">The crew has voted.</h2>
        <p className="mt-2 text-mist-dim">
          Before the last job, they want someone gone. {votes} of {present.length - 1} point at <span className="font-semibold text-mist">{pick.name}</span>.
        </p>
        <p className="mt-1 text-xs text-mist-faint">Going with the vote is an accusation: right, the bag doubles; wrong, heat and a loyal friend walks. Overruling them costs loyalty ({loyalty} now).</p>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Button kind="heat" size="lg" disabled={!!busy} onClick={() => void sitDown(true, pick.id)}>
            Go with the vote: {pick.name} is out
          </Button>
          <Button kind="ghost" size="lg" disabled={!!busy} onClick={() => void sitDown(false, pick.id)}>
            Overrule them
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function Seats() {
  const chapter = useSnitch((s) => s.chapter)!;
  const job = chapter.jobs[useSnitch((s) => s.job)];
  const crew = useSnitch((s) => s.crew);
  const selected = useSnitch((s) => s.selected);
  const tool = useSnitch((s) => s.tool);
  const tap = useSnitch((s) => s.tap);
  if (!job || tool !== "team") return null;
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2" aria-label="Roles on this job">
      {job.roles.map((r, i) => {
        const id = selected[i];
        const m = id !== undefined ? crew[id] : undefined;
        const right = m?.role === r;
        return (
          <button
            key={i}
            disabled={!m}
            onClick={() => m && tap(m.id)}
            className={clsx("min-w-[7.5rem] rounded-xl border px-3 py-2 text-left transition-colors", !m ? "border-dashed border-line bg-ink/50" : right ? "border-cyan bg-cyan/10" : "border-violet/70 bg-amethyst/30")}
          >
            <span className="eyebrow block text-mist-faint">{r}</span>
            <span className={clsx("display-soft block text-sm", m ? "text-mist" : "text-mist-faint")}>{m ? m.name : i === selected.length ? "Tap someone" : "Empty"}</span>
            {m && <span className={clsx("block text-[11px]", right ? "text-cyan" : "text-mist-dim")}>{right ? "Right skill · +12%" : `A ${m.role.toLowerCase()}`}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Timed; silence picks the safe default. */
function Decision() {
  const prompt = useSnitch((s) => s.prompt);
  const answer = useSnitch((s) => s.answer);
  const crew = useSnitch((s) => s.crew);
  const team = useSnitch((s) => s.cut?.team ?? NONE);
  const job = useSnitch((s) => s.chapter?.jobs[s.job]);
  const p = prompt?.kind === "choice" ? prompt : undefined;
  const ev = p ? EVENTS[p.event] : undefined;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!p || !ev) return;
    setLeft(p.seconds);
    audio.staticBurst();
    haptics.stamp();
    const id = setInterval(() => setLeft((x) => x - 0.1), 100);
    return () => clearInterval(id);
  }, [p?.at]);
  useEffect(() => {
    if (p && ev && left <= 0 && p.seconds > 0) answer(ev.fallback, p.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left <= 0]);
  if (!p || !ev || !job) return null;
  const seat = ev.from === "radio" ? -1 : job.roles.findIndex((r) => r === ev.from);
  const speaker = seat >= 0 && team[seat] !== undefined ? crew[team[seat]] : undefined;
  const who = ev.from === "radio" ? "Police radio" : speaker ? `${speaker.name} · ${ev.from.toLowerCase()}` : "Your crew";
  return (
    <motion.div key={p.at} className="pointer-events-auto fixed inset-x-0 bottom-[11dvh] z-30 flex justify-center px-4" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.35, ease }}>
      <div className="panel max-h-[calc(100dvh-24dvh)] w-full max-w-2xl overflow-y-auto rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-cyan">📻 {who}</p>
          <span className={clsx("num rounded-full border px-2.5 py-0.5 text-sm", left < 3 ? "border-heat text-heat" : "border-line text-mist")}>{Math.max(0, left).toFixed(1)}s</span>
        </div>
        <p className="display-soft mt-2 text-xl text-mist sm:text-2xl">“{ev.line}”</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-cyan transition-[width] duration-100 ease-linear" style={{ width: `${(Math.max(0, left) / p.seconds) * 100}%` }} />
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {ev.choices.map((c, i) => (
            <button key={c.label} autoFocus={i === ev.fallback} onClick={() => (audio.select(), answer(i, p.at))} className="rounded-2xl border border-line bg-ink/60 p-4 text-left transition-colors hover:border-cyan focus-visible:border-cyan">
              <span className="display-soft block text-lg text-mist">
                <span className="num mr-2 text-cyan">{i + 1}</span>
                {c.label}
              </span>
              <span className="mt-1 block text-sm text-mist-dim">{c.hint}</span>
              {p.known && (
                <span className="num mt-1.5 block text-[11px] text-mist-faint">
                  take {c.take >= 1 ? "+" : ""}
                  {Math.round((c.take - 1) * 100)}% · risk {c.risk > 0 ? "up" : c.risk < 0 ? "down" : "same"}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-mist-faint">If you say nothing, the crew goes with “{ev.choices[ev.fallback].label.toLowerCase()}”.</p>
      </div>
    </motion.div>
  );
}

function Getaway() {
  const prompt = useSnitch((s) => s.prompt);
  const answer = useSnitch((s) => s.answer);
  const crew = useSnitch((s) => s.crew);
  const team = useSnitch((s) => s.cut?.team ?? NONE);
  const job = useSnitch((s) => s.chapter?.jobs[s.job]);
  if (prompt?.kind !== "route" || !job) return null;
  const driver = hasSkill(job, team, crew, "Driver");
  return (
    <motion.div className="pointer-events-auto fixed inset-x-0 bottom-[11dvh] z-30 flex justify-center px-4" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="panel max-h-[calc(100dvh-24dvh)] w-full max-w-3xl overflow-y-auto rounded-3xl p-5">
        <p className="eyebrow text-heat">Getaway</p>
        <p className="display-soft mt-1 text-2xl text-mist">Sirens on both ends of the street. Which way?</p>
        <p className="mt-1 text-sm text-mist-dim">{driver ? "Your driver is at the wheel." : "Nobody who can really drive is at the wheel."} Get it wrong and someone gets picked up: out for the next job.</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {ROUTES.map((r, i) => (
            <button key={r.id} autoFocus={i === 0} onClick={() => (audio.select(), answer(r.id, prompt.at))} className="rounded-2xl border border-line bg-ink/60 p-4 text-left transition-colors hover:border-heat focus-visible:border-heat">
              <span className="display-soft block text-lg text-mist">{r.title}</span>
              <span className="mt-1 block text-sm text-mist-dim">{r.body}</span>
              <span className="num mt-2 block text-[11px] text-mist-faint">{Math.round(r.lift[driver ? 1 : 0] * 100)}% someone's caught</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function JobPrompts() {
  return (
    <AnimatePresence>
      <Decision key="d" />
      <Getaway key="g" />
    </AnimatePresence>
  );
}

export function Aftermath() {
  const a = useSnitch((s) => s.after);
  const crew = useSnitch((s) => s.crew);
  const heat = useSnitch((s) => s.heat);
  const bag = useSnitch((s) => s.bag);
  const next = useSnitch((s) => s.next);
  const chapter = useSnitch((s) => s.chapter)!;
  const evidence = useSnitch((s) => s.evidence);
  if (!a) return null;
  const last = a.index + 1 >= chapter.jobs.length;
  const rumour = a.rumour && crew[a.rumour.member];
  return (
    <motion.div className="overlay pointer-events-auto z-30 bg-ink/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel w-full max-w-lg rounded-3xl p-6" initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 24 }}>
        <p className="eyebrow text-violet">Aftermath · {a.job.name}</p>
        <h2 className={clsx("display mt-1 text-[1.85rem] leading-tight sm:text-4xl", a.tipped ? "text-heat" : "text-cyan")}>{a.tipped ? "The police were waiting." : a.short ? "Clean, but short." : "Clean."}</h2>
        <p className="mt-1 text-sm text-mist-dim">
          {a.tipped
            ? a.job.forced
              ? "Somebody talked. Tonight you'll never know who."
              : `Heat ${heat} of ${HEAT_MAX}. Either someone on that team talked, or it was plain bad luck (${Math.round(a.odds.badLuck * 100)}% tonight).`
            : a.short
              ? "The count came back short. Someone on that team is skimming."
              : "Either the snitch stayed home, or kept quiet this time."}
        </p>

        <div className="mt-4 rounded-2xl border border-line bg-ink/50 p-3.5">
          {a.odds.parts.map((p) => (
            <p key={p.label} className="flex justify-between text-sm">
              <span className="text-mist-dim">{p.label}</span>
              <span className="num text-mist">{p.value}</span>
            </p>
          ))}
          <div className="my-2 h-px bg-line" />
          <p className="flex justify-between">
            <span className="text-mist">Brought home</span>
            <span className={clsx("num", a.tipped ? "text-heat" : "text-cyan")}>{a.tipped ? "$0" : money(a.gained)}</span>
          </p>
          <p className="flex justify-between text-sm">
            <span className="text-mist-dim">In the bag</span>
            <span className="num text-mist">{money(bag)}</span>
          </p>
        </div>

        {a.lifted !== undefined && (
          <p className="mt-3 rounded-xl border border-heat/50 bg-heat/10 px-3.5 py-2.5 text-sm text-mist">
            <span className="font-semibold text-heat">{crew[a.lifted].name} got picked up</span> on the way out. They'll be out by tomorrow night, but they miss the next job.
          </p>
        )}

        {rumour && (
          <div className="mt-3 rounded-xl border border-violet/50 bg-amethyst/25 px-3.5 py-2.5">
            <p className="eyebrow text-violet">Word on the street</p>
            <p className="mt-1 text-mist">
              {a.rumour!.seen ? `${rumour.name} was seen near the precinct last night.` : `${rumour.name} was drinking at Mickey's all night. Nothing odd.`}
            </p>
            <p className="mt-0.5 text-xs text-mist-faint">Rumours are usually right, not always. Sealed like a tail: only you can read it.</p>
          </div>
        )}

        {a.file ? (
          <motion.div initial={{ rotate: -4, scale: 0.9, opacity: 0 }} animate={{ rotate: -1.5, scale: 1, opacity: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 160, damping: 14 }} className="mt-3 bg-[#e9e4d8] px-4 py-3 text-[#2a2620] shadow-[0_20px_40px_-14px_#000]">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#9a1b1b] uppercase">New evidence · {FILES.findIndex((f) => f.id === a.file) + 1} of {FILES.length}</p>
            <p className="mt-1 font-semibold">{FILES.find((f) => f.id === a.file)?.title}</p>
            <p className="mt-0.5 font-[cursive] text-[15px] leading-snug">{FILES.find((f) => f.id === a.file)?.text}</p>
          </motion.div>
        ) : (
          fileFor(chapter.id, a.index) &&
          !evidence.includes(fileFor(chapter.id, a.index)!.id) &&
          !a.tipped && <p className="mt-3 text-xs text-mist-faint">There was something else in there worth finding. A perfect job (clean, nothing skimmed, inside work 80% or better) turns up the evidence.</p>
        )}

        <Button kind="cyan" size="lg" className="mt-5 w-full" autoFocus onClick={next}>
          {heat >= HEAT_MAX ? "They're at the door" : last ? (chapter.prologue ? "What happened next" : "Count the bag") : "Back to the hideout"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
