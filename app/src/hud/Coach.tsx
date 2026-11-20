import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useSnitch } from "../game/store";

// Shown once, the first time a player reaches each step. Ash says them in the prologue.
const TIPS: Record<string, string> = {
  scout: "Before every job, make one move. Not sure? Case the place: it's free, and you'll see what's coming.",
  plan: "Tap people to fill the seats, left to right. A seat turns cyan when the right skill sits in it. Then send the team.",
  choice: "Things go wrong on every job. Decide before the clock runs out, or the crew decides for you.",
  game: "This part's on you. Do it well and the take goes up. Do it badly and the street notices.",
  route: "The police are here. Pick the way out. A good driver at the wheel makes every route safer.",
  aftermath: "Read this every time. If the police were waiting, look hard at who was on that team. Rumours are a free clue.",
  tools: "Between jobs you can tail someone, or accuse the one you think is the snitch. Get it right and the bag doubles.",
};

const seen = (k: string) => {
  try {
    return localStorage.getItem("snitch:coach:" + k) === "1";
  } catch {
    return true;
  }
};
const mark = (k: string) => {
  try {
    localStorage.setItem("snitch:coach:" + k, "1");
  } catch {
    /* private mode */
  }
};

export function Coach() {
  const status = useSnitch((s) => s.status);
  const prompt = useSnitch((s) => s.prompt?.kind);
  const job = useSnitch((s) => s.job);
  const prologue = useSnitch((s) => !!s.chapter?.prologue);
  const step = prompt ?? (status === "plan" && job > 0 ? "tools" : status);
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    if (!TIPS[step] || seen(step)) return setTip(null);
    // "plan" and "tools" share a screen: show the team tip first.
    if (step === "tools" && !seen("plan")) return;
    setTip(step);
    mark(step);
  }, [step]);

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 9000);
    return () => clearTimeout(t);
  }, [tip]);

  return (
    <AnimatePresence>
      {tip && (
        <motion.button
          key={tip}
          onClick={() => setTip(null)}
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          className="pointer-events-auto fixed top-24 left-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 rounded-2xl border border-[#ffc98a]/50 bg-ink/90 px-4 py-3 text-left shadow-[0_20px_50px_-20px_#000] backdrop-blur"
        >
          <span className="eyebrow block text-[#ffc98a]">{prologue ? "Ash" : "Tip"}</span>
          <span className="mt-1 block text-sm text-mist">{TIPS[tip]}</span>
          <span className="mt-1 block text-[11px] text-mist-faint">Tap to close</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
