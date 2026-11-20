import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Mark } from "../brand/Mark";
import { useBoot } from "./Boot";

export function ScreenLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="overlay pointer-events-auto z-[55] bg-ink/85 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-20 w-20">
          <motion.span className="absolute inset-0 rounded-full border-2 border-cyan/20 border-t-cyan" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} />
          <span className="absolute inset-3 grid place-items-center">
            <Mark size={44} />
          </span>
        </div>
        <p className="eyebrow text-mist-dim">{label}</p>
        <div className="h-[2px] w-40 overflow-hidden rounded-full bg-line">
          <motion.div className="h-full w-1/3 bg-cyan shadow-[0_0_10px_#00e5ff]" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }} />
        </div>
      </div>
    </div>
  );
}

/** Shown while models stream in after the opening loader. */
export function AssetBadge() {
  const started = useBoot((s) => s.started);
  const [load, setLoad] = useState({ active: false, progress: 100 });
  useEffect(() => {
    // Polled: drei's progress store updates too often to render on every change.
    const id = setInterval(() => {
      const { active, progress } = useProgress.getState();
      setLoad((p) => (p.active === active && Math.round(p.progress) === Math.round(progress) ? p : { active, progress }));
    }, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <AnimatePresence>
      {started && load.active && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none fixed right-4 bottom-4 z-[60] flex items-center gap-2.5 rounded-full border border-line bg-ink/85 px-3.5 py-2 backdrop-blur" role="status">
          <motion.span className="h-3.5 w-3.5 rounded-full border-2 border-cyan/25 border-t-cyan" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
          <span className="eyebrow text-mist-dim">Loading the scene · {Math.round(load.progress)}%</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
