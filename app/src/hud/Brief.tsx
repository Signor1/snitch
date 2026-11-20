import { motion } from "motion/react";
import { Button, Ritual } from "../components/ui";
import { MODES } from "../game/data";
import { useSnitch } from "../game/store";
import { useChain } from "../chain/store";

const STEPS = [
  ["Scout", "One move before each job: case it, buy the plans, or pay off a cop."],
  ["Plan", "Fill every seat. The right skill in the right seat pays more."],
  ["The job", "Make the calls when the radio crackles, and do the hands-on work yourself."],
  ["Get out", "If the police were waiting, pick the way out, or lose someone for a night."],
  ["Find the snitch", "Police on a job point at that team. Tails and rumours tell you more. Accuse right: the bag doubles. Three heat: you lose it all."],
];

export function Brief() {
  const chapter = useSnitch((s) => s.chapter)!;
  const sealed = useSnitch((s) => s.sealed);
  const phase = useSnitch((s) => s.phase);
  const begin = useSnitch((s) => s.begin);
  const difficulty = useSnitch((s) => s.difficulty);
  const error = useSnitch((s) => s.error);
  const onChain = useSnitch((s) => s.onChain);
  const start = useSnitch((s) => s.start);
  const open = useSnitch((s) => s.resumable);
  const busy = useSnitch((s) => s.busy);
  const pickUp = useSnitch((s) => s.pickUp);
  const startOver = useSnitch((s) => s.startOver);
  return (
    <motion.div className="overlay pointer-events-auto z-30 bg-ink/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel w-full max-w-lg rounded-3xl p-6 sm:p-8" initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 240, damping: 24 }}>
        <p className="eyebrow text-violet">
          {chapter.prologue ? "Prologue" : `Chapter ${chapter.id}`} · {MODES[difficulty].name} · {chapter.jobs.length} jobs · {onChain ? "on Sepolia" : "practice"}
        </p>
        <h2 className="display neon-violet mt-2 text-4xl text-mist sm:text-5xl">{chapter.name}</h2>
        <p className="mt-2 text-mist-dim">{chapter.tagline}</p>

        {chapter.twist && <p className="mt-4 rounded-xl border border-cyan/40 bg-cyan/5 px-3.5 py-2.5 text-sm text-mist">{chapter.twist}</p>}

        <p className="eyebrow mt-5 text-mist-faint">Every job</p>
        <ol className="mt-2 space-y-2">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="flex gap-3 text-sm">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan text-xs text-ink">{i + 1}</span>
              <span>
                <span className="font-semibold text-mist">{t}.</span> <span className="text-mist-dim">{b}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex min-h-14 items-center justify-center">
          {error ? (
            <div className="w-full text-center">
              <p className="text-sm text-heat">{error}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button kind="cyan" onClick={() => start(chapter.id)}>
                  Try again
                </Button>
                <Button kind="ghost" onClick={() => (useChain.getState().setMode("practice"), start(chapter.id))}>
                  Practise instead
                </Button>
              </div>
            </div>
          ) : open && !busy ? (
            <div className="w-full">
              <p className="rounded-xl border border-cyan/40 bg-cyan/5 px-3.5 py-2.5 text-sm text-mist">
                {open.stage === 2
                  ? "You walked away from this run, but the reveal never came through. It's waiting on-chain."
                  : `You have a run of this chapter still open on Sepolia: ${open.job >= chapter.jobs.length ? "every job done" : `job ${open.job + 1} of ${chapter.jobs.length} next`}. Pick it up where you left off, or start the chapter over.`}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button kind="cyan" autoFocus onClick={() => void pickUp()}>
                  {open.stage === 2 ? "See the reveal" : "Pick it up"}
                </Button>
                <Button kind="ghost" onClick={startOver}>
                  Start over
                </Button>
              </div>
            </div>
          ) : sealed ? (
            <Button kind="cyan" size="lg" className="w-full" autoFocus onClick={begin}>
              First job
            </Button>
          ) : (
            <Ritual phase={phase ?? "sending"} label={onChain && busy === "start" && !phase ? "Looking for your run on Sepolia." : open ? "Back to the table. Reading your bag and heat, for your eyes only." : onChain ? "Sealing the crew on Sepolia. The snitch is drawn on-chain, encrypted. Nobody can see who." : "Someone at the table is being turned. Nobody can see who."} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
