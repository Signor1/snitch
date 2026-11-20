import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { money, Ritual } from "../components/ui";
import type { Target } from "../game/data";
import { useSnitch } from "../game/store";

const INSIDE_LINE: Record<Target, string> = {
  safe: "{lead} is on the safe.",
  vault: "{lead} is working the vault door.",
  cases: "{lead} is clearing the cases.",
  table: "{lead} is sweeping the table.",
};

export function NoteCard() {
  const note = useSnitch((s) => s.note);
  const busy = useSnitch((s) => s.busy);
  return (
    <AnimatePresence mode="wait">
      {note && !busy && (
        <motion.div
          key={note.title}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={clsx("panel mx-auto w-full max-w-xl rounded-2xl px-4 py-3", note.tone === "bad" && "!border-heat/60", note.tone === "good" && "!border-cyan/50")}
          role="status"
        >
          <p className={clsx("display-soft text-base", note.tone === "bad" ? "text-heat" : note.tone === "good" ? "text-cyan" : "text-mist")}>{note.title}</p>
          <p className="mt-0.5 text-sm text-mist-dim">{note.body}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Phone() {
  const taunt = useSnitch((s) => s.taunt);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!taunt) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, [taunt?.at]);
  return (
    <AnimatePresence>
      {show && taunt && (
        <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} className="panel pointer-events-none fixed top-28 right-4 z-30 w-64 rounded-2xl px-3.5 py-2.5 sm:right-8">
          <p className="eyebrow text-heat">{taunt.from === "echo" ? "Unknown number" : "Det. Insp. Hale"}</p>
          <p className="mt-1 text-sm text-mist">“{taunt.text}”</p>
          <p className="mt-1 text-[11px] text-mist-faint">{taunt.from === "echo" ? "Echo" : "Hale"}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function JobBanner() {
  const cut = useSnitch((s) => s.cut);
  const phase = useSnitch((s) => s.phase);
  const crew = useSnitch((s) => s.crew);
  const prompt = useSnitch((s) => s.prompt);
  if (!cut) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <motion.div className="fixed inset-x-0 top-0 -z-10 bg-ink" initial={{ height: 0 }} animate={{ height: "9dvh" }} />
      <motion.div className="fixed inset-x-0 bottom-0 -z-10 bg-ink" initial={{ height: 0 }} animate={{ height: "9dvh" }} />
      {cut.state === "tipped" && <div className="police-flash fixed inset-0 -z-10" />}
      <AnimatePresence mode="wait">
        {prompt ? null : cut.state === "go" ? (
          <motion.div key={cut.beat} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
            <p className="eyebrow text-violet">{cut.job}</p>
            <p className="display-soft text-2xl text-mist">{cut.beat === "arrive" ? "Rolling up." : INSIDE_LINE[cut.target].replace("{lead}", crew[cut.team[0]]?.name ?? "The crew")}</p>
            <Ritual phase={phase ?? "sending"} label={phase === "decrypting" ? "Word is coming back, for your eyes only" : "Nobody can see how this ends. Not even us."} />
          </motion.div>
        ) : cut.state === "clean" ? (
          <motion.div key="clean" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <p className="display neon-cyan text-5xl text-cyan sm:text-7xl">+{money(cut.gained)}</p>
            <p className="display-soft mt-2 text-xl text-mist">Clean getaway.</p>
          </motion.div>
        ) : (
          <motion.div key="tipped" initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <p className="display text-5xl text-heat sm:text-7xl" style={{ textShadow: "0 0 40px rgb(255 45 111 / 0.7)" }}>
              POLICE
            </p>
            <p className="display-soft mt-2 text-xl text-mist">{cut.beat === "payoff" ? "They were waiting. The crew shoots its way out the back." : "Someone talked. Or was it bad luck?"}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
