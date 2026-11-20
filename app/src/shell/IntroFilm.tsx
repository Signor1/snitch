import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Logo, Mark } from "../brand/Mark";
import { audio } from "../fx/audio";
import { castOf } from "../game/data";
import { outfitFor } from "../game/looks";
import { findChapter } from "../game/modes";
import { useSnitch, type Cut } from "../game/store";
import { Phone } from "../hud/Feed";
import { useStage } from "../story/stage";
import { useBoot } from "./Boot";
import { useFilm } from "./film";

// The opening film: the night Ash went down, played in the game's own sets by driving the same
// state a real job uses (crew, cut beats, raid style), then ten years later and Echo's first text.

const SEEN = "snitch:introSeen";


type Step = { at: number; caption?: string; run?: () => void };

const job = (beat: Cut["beat"], state: Cut["state"]): Partial<Cut> => ({ beat, state, beatAt: performance.now() });

function steps(): Step[] {
  const S = useSnitch;
  const cut = (patch: Partial<Cut>) => S.setState((s) => ({ cut: { ...(s.cut as Cut), ...patch } }));
  return [
    {
      at: 0,
      caption: "Port Solace. Ten years ago.",
      run: () => {
        const prologue = findChapter(0)!;
        S.setState({ chapter: prologue, crew: castOf(prologue).map((m) => ({ ...m, outfit: outfitFor(0, m.id) })), status: "brief", busy: null, cut: undefined, ending: undefined, taunt: undefined, scene: undefined });
        audio.setScene("planning");
      },
    },
    { at: 3500, caption: "Ash had one more job.", run: () => useStage.getState().setSpeaker(0) },
    {
      at: 7000,
      caption: "Container eleven. Two hundred grand in watches.",
      run: () => {
        useStage.getState().setSpeaker(undefined);
        const now = performance.now();
        S.setState({ status: "job", busy: "job", cut: { state: "go", beat: "arrive", beatAt: now, at: now, target: "vault", venue: "dock", bust: "harbour", team: [0, 1, 2, 3], job: "The Harbour", gained: 0 } });
        audio.setScene("job");
        audio.engine();
      },
    },
    { at: 13500, run: () => (cut(job("inside", "go")), audio.door()) },
    { at: 19000, caption: "Someone had made a call.", run: () => (cut(job("payoff", "tipped")), audio.setScene("police")) },
    { at: 27000, caption: "Ash didn't come home.", run: () => cut(job("exit", "tipped")) },
    {
      at: 34000,
      caption: "Ten years later.",
      run: () => {
        S.setState({ cut: undefined, busy: null, status: "brief", crew: [] });
        useFilm.setState({ empty: true });
        audio.setScene("hideout");
      },
    },
    {
      at: 38000,
      run: () => {
        S.setState({ taunt: { text: "One of them is mine.", from: "echo", at: performance.now() } });
        audio.phone();
      },
    },
    { at: 44000, run: () => audio.setScene("title") },
  ];
}

const LENGTH = 48500;

/** Plays the film once after the first "press any key", and again from the menu. */
export function IntroFilm() {
  const playing = useFilm((s) => s.playing);
  const started = useBoot((s) => s.started);
  useEffect(() => {
    if (!started) return;
    try {
      if (localStorage.getItem(SEEN)) return;
    } catch {
      /* private mode: play it */
    }
    const t = setTimeout(() => useFilm.getState().play(), 900);
    return () => clearTimeout(t);
  }, [started]);
  return <AnimatePresence>{playing && <Film />}</AnimatePresence>;
}

function Film() {
  const [caption, setCaption] = useState<string>();
  const [title, setTitle] = useState(false);

  useEffect(() => {
    const timers = steps().map((s) =>
      setTimeout(() => {
        s.run?.();
        if (s.caption) setCaption(s.caption);
      }, s.at),
    );
    // captions fade a few seconds after they appear
    const fades = steps()
      .filter((s) => s.caption)
      .map((s) => setTimeout(() => setCaption((c) => (c === s.caption ? undefined : c)), s.at + 3200));
    const t1 = setTimeout(() => setTitle(true), 44000);
    const t2 = setTimeout(end, LENGTH);
    const key = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && end();
    window.addEventListener("keydown", key);
    return () => {
      [...timers, ...fades, t1, t2].forEach(clearTimeout);
      window.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} aria-label="Intro film">
      <div className="absolute inset-x-0 top-0 h-[10dvh] bg-ink" />
      <div className="absolute inset-x-0 bottom-0 h-[10dvh] bg-ink" />
      <Phone />
      <AnimatePresence mode="wait">
        {caption && !title && (
          <motion.p
            key={caption}
            className="display-soft absolute inset-x-0 bottom-[14dvh] px-6 text-center text-2xl text-mist sm:text-4xl"
            style={{ textShadow: "0 2px 24px rgb(0 0 0 / 0.9)" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          >
            {caption}
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {title && (
          <motion.div className="absolute inset-0 grid place-items-center bg-ink/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="flex items-center gap-3">
                <Mark size={56} />
                <Logo height={64} />
              </div>
              <p className="display-soft text-lg text-mist-dim sm:text-xl">
                Someone at your table is <span className="neon-cyan text-cyan">talking.</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={end} className="pointer-events-auto absolute right-4 bottom-[calc(10dvh+1rem)] rounded-full border border-line bg-ink/60 px-4 py-2 text-sm text-mist hover:border-violet sm:right-8">
        Skip
      </button>
    </motion.div>
  );
}

function end() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    /* private mode */
  }
  useStage.getState().setSpeaker(undefined);
  useSnitch.getState().leave();
  useFilm.getState().stop();
  audio.setScene("title");
}
