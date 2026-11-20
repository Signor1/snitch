import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { Logo, Mark } from "../brand/Mark";
import { audio } from "../fx/audio";
import { useFilm } from "./film";

/** started = past the loading and title screens. On the home page the intro film starts in the same step, so the menu never flashes first. */
export const useBoot = create<{ started: boolean; start(): void }>((set) => ({
  started: false,
  start: () => {
    if (location.pathname === "/") useFilm.getState().play();
    set({ started: true });
  },
}));

const TIPS = [
  "Police after a job usually means the snitch was on that team. Usually.",
  "A clean job does not clear anyone. The snitch sometimes keeps quiet.",
  "Accuse the right person and your bag doubles.",
  "Three heat and the crew is raided. You lose everything you carried.",
  "Tails can be wrong. The wiretap never is.",
  "You can always walk away with what's in the bag.",
  "The big jobs need more people. Find the snitch before then.",
];

// The first key or click also unlocks audio, since browsers block autoplay.
export function Boot() {
  const started = useBoot((s) => s.started);
  const [gone, setGone] = useState(false);
  // Fully unmount after the fade so the loader stops listening to asset progress.
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => setGone(true), 1200);
    return () => clearTimeout(t);
  }, [started]);
  return gone ? null : <BootScreen />;
}

const ART = [
  { src: "/art/crew.jpg", title: "The crew", line: "Six faces. One of them is wearing a wire.", focus: "50% 35%" },
  { src: "/art/job.jpg", title: "The job", line: "Send them in. Cash comes back, or sirens do.", focus: "60% 50%" },
  { src: "/art/law.jpg", title: "The law", line: "Detective Hale already knows about the next one.", focus: "45% 50%" },
];

function BootScreen() {
  const started = useBoot((s) => s.started);
  const start = useBoot((s) => s.start);
  const [load, setLoad] = useState({ progress: 0, active: true });
  const [minTime, setMinTime] = useState(false);
  const [tip, setTip] = useState(0);
  const [slide, setSlide] = useState(0);
  const [shown, setShown] = useState(0);
  const ready = minTime && load.progress >= 100 && !load.active;

  // Polled: hundreds of files can finish in one frame, more renders than React allows.
  useEffect(() => {
    const id = setInterval(() => {
      const { progress, active } = useProgress.getState();
      setLoad((p) => (p.progress === progress && p.active === active ? p : { progress, active }));
    }, 120);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setMinTime(true), 3200);
    const a = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 4200);
    const b = setInterval(() => setSlide((x) => (x + 1) % ART.length), 5200);
    return () => (clearTimeout(t), clearInterval(a), clearInterval(b));
  }, []);
  // Never runs backwards, never sits at 100 while still loading.
  useEffect(() => setShown((p) => Math.max(p, ready ? 100 : Math.min(96, load.progress))), [load.progress, ready]);

  useEffect(() => {
    if (!ready || started) return;
    const go = () => {
      audio.unlock();
      audio.door();
      start();
    };
    window.addEventListener("keydown", go, { once: true });
    window.addEventListener("pointerdown", go, { once: true });
    return () => (window.removeEventListener("keydown", go), window.removeEventListener("pointerdown", go));
  }, [ready, started, start]);

  const art = ART[slide];
  return (
    <AnimatePresence>
      {!started && (
        <motion.div className="fixed inset-0 z-[60] overflow-hidden bg-ink" exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-label="Loading SNITCH">
          {ART.map((a, i) => (
            <motion.img
              key={a.src}
              src={a.src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: a.focus }}
              initial={false}
              animate={{ opacity: i === slide ? 1 : 0, scale: i === slide ? 1.09 : 1.02, x: i === slide ? "-1.5%" : "0%" }}
              transition={{ opacity: { duration: 1.4 }, scale: { duration: 7, ease: "linear" }, x: { duration: 7, ease: "linear" } }}
            />
          ))}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgb(5_5_5/0.96)_0%,rgb(5_5_5/0.55)_30%,transparent_58%),linear-gradient(90deg,rgb(5_5_5/0.75)_0%,transparent_45%)]" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(255_255_255/0.03)_0_1px,transparent_1px_3px)]" />
          <div className="absolute inset-x-0 top-0 h-[5dvh] bg-ink" />

          <div className="absolute inset-0 flex flex-col justify-between p-6 pt-[8dvh] sm:p-10 sm:pt-[9dvh]">
            <div className="flex items-start justify-between">
              <AnimatePresence mode="wait">
                <motion.div key={slide} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.5 }}>
                  <p className="eyebrow text-cyan">
                    {String(slide + 1).padStart(2, "0")} / {String(ART.length).padStart(2, "0")}
                  </p>
                  <p className="display mt-1 text-3xl text-mist uppercase sm:text-5xl" style={{ textShadow: "0 4px 30px rgb(0 0 0 / 0.9)" }}>
                    {art.title}
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-mist sm:text-base" style={{ textShadow: "0 2px 12px rgb(0 0 0)" }}>
                    {art.line}
                  </p>
                </motion.div>
              </AnimatePresence>
              <span className="eyebrow text-mist-dim">Build 0.3 · Practice</span>
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
                  <div className="flex items-center gap-4">
                    <Mark size={76} className="max-sm:h-12 max-sm:w-12" />
                    <Logo height={104} className="h-auto max-w-[68vw] drop-shadow-[0_8px_40px_rgb(0_0_0/0.9)] sm:max-w-[34rem]" />
                  </div>
                  <h1 className="sr-only">SNITCH</h1>
                  <p className="display-soft mt-3 text-lg text-mist sm:text-2xl">
                    Someone at your table is <span className="neon-cyan text-cyan">talking.</span>
                  </p>
                </motion.div>

                {ready ? (
                  <motion.button className="display rounded-full border-2 border-cyan bg-cyan/10 px-7 py-3 text-lg tracking-[0.12em] text-cyan uppercase shadow-[0_0_40px_-8px_#00e5ff] backdrop-blur-sm sm:text-xl" animate={{ opacity: [1, 0.45, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <span className="max-sm:hidden">Press any key</span>
                    <span className="sm:hidden">Tap to start</span>
                  </motion.button>
                ) : (
                  <p className="num text-right text-mist" aria-live="polite">
                    <span className="eyebrow block text-mist-dim">Loading Port Solace</span>
                    <span className="display text-4xl">{Math.round(shown)}%</span>
                  </p>
                )}
              </div>

              <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(shown)} aria-valuemin={0} aria-valuemax={100}>
                <motion.div className="h-full rounded-full bg-cyan shadow-[0_0_16px_#00e5ff]" animate={{ width: `${shown}%` }} transition={{ ease: "easeOut", duration: 0.5 }} />
              </div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-1">
                <AnimatePresence mode="wait">
                  <motion.p key={tip} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl text-sm text-mist">
                    <span className="eyebrow mr-2 text-cyan">Tip</span>
                    {TIPS[tip]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
