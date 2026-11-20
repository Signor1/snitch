import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { MODES } from "../game/data";
import { useSnitch } from "../game/store";
import { audio } from "../fx/audio";
import { useProfile, type Quality } from "./store";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-0">
      <div>
        <p className="text-sm font-semibold text-mist">{label}</p>
        {hint && <p className="text-xs text-mist-dim">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={clsx("relative h-7 w-12 shrink-0 rounded-full border transition-colors", on ? "border-cyan bg-cyan/30" : "border-line bg-ink")}>
      <span className={clsx("absolute top-0.5 h-5.5 w-5.5 rounded-full transition-[left,background]", on ? "left-[1.4rem] bg-cyan" : "left-0.5 bg-mist-faint")} />
    </button>
  );
}

type Tab = "Audio" | "Graphics" | "Gameplay" | "Accessibility";
const TABS: { id: Tab; about: string }[] = [
  { id: "Audio", about: "Music follows the scene: the hideout, the job, the police. It is made live in your browser." },
  { id: "Graphics", about: "High looks best. Pick Medium or Low on older laptops and phones." },
  { id: "Gameplay", about: "Difficulty changes how many tails you get, how often they are wrong, and how much bad luck there is." },
  { id: "Accessibility", about: "Make the game calmer to watch and easier to read." },
];

function Fields({ tab }: { tab: Tab }) {
  const s = useProfile((st) => st.settings);
  const set = useProfile((st) => st.set);
  const difficulty = useSnitch((st) => st.difficulty);
  const setDifficulty = useSnitch((st) => st.setDifficulty);
  if (tab === "Audio")
    return (
      <Row label="Volume" hint="Music and effects">
        <input type="range" min={0} max={1} step={0.05} value={s.volume} aria-label="Volume" onChange={(e) => set({ volume: Number(e.target.value) })} onPointerUp={() => audio.click()} className="w-40 accent-[#00e5ff]" />
      </Row>
    );
  if (tab === "Graphics")
    return (
      <Row label="Quality" hint="Lower it if the game feels slow">
        <div className="inline-flex rounded-full border border-line p-0.5" role="radiogroup" aria-label="Graphics quality">
          {(["low", "medium", "high"] as Quality[]).map((q) => (
            <button key={q} role="radio" aria-checked={s.quality === q} onClick={() => set({ quality: q })} className={clsx("h-8 rounded-full px-3 text-xs font-semibold capitalize", s.quality === q ? "bg-mist text-ink" : "text-mist-dim")}>
              {q}
            </button>
          ))}
        </div>
      </Row>
    );
  if (tab === "Gameplay")
    return (
      <>
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={difficulty === m.id} onClick={() => setDifficulty(m.id)} className={clsx("mb-2 block w-full rounded-2xl border p-3 text-left", difficulty === m.id ? "border-cyan bg-cyan/10" : "border-line hover:border-violet")}>
            <span className="display-soft block text-base text-mist">{m.name}</span>
            <span className="block text-xs text-mist-dim">{m.body}</span>
          </button>
        ))}
        <p className="text-xs text-mist-faint">Takes effect on your next run.</p>
      </>
    );
  return (
    <>
      <Row label="Calm motion" hint="Fewer camera moves and flashes">
        <Toggle on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} label="Calm motion" />
      </Row>
      <Row label="Larger text">
        <Toggle on={s.largeText} onChange={(v) => set({ largeText: v })} label="Larger text" />
      </Row>
    </>
  );
}

/** Used on the identity screen. */
export function SettingsFields() {
  return (
    <div>
      <Fields tab="Audio" />
      <Fields tab="Graphics" />
      <Fields tab="Accessibility" />
    </div>
  );
}

export function SettingsScreen({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<Tab>("Audio");
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const i = TABS.findIndex((t) => t.id === tab);
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") setTab(TABS[(i + 1) % TABS.length].id);
      else if (e.key === "ArrowUp") setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
      else return;
      audio.select();
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [tab, onClose]);
  return (
    <motion.div className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-ink/92 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Settings">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-[7dvh] sm:px-10">
        <p className="eyebrow text-violet">Options</p>
        <h2 className="display neon-violet mt-1 text-5xl text-mist">Settings</h2>
        <div className="mt-8 grid flex-1 gap-6 md:grid-cols-[14rem_1fr]">
          <div role="tablist" aria-orientation="vertical" className="flex gap-1 overflow-x-auto md:flex-col">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => (audio.select(), setTab(t.id))} className={clsx("display-soft flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-lg whitespace-nowrap transition-colors", tab === t.id ? "bg-amethyst/50 text-cyan" : "text-mist-dim hover:text-mist")}>
                <span className={clsx("h-[2px] rounded-full bg-cyan transition-[width]", tab === t.id ? "w-5" : "w-0")} />
                {t.id}
              </button>
            ))}
          </div>
          <div className="panel h-fit rounded-3xl p-6">
            <p className="mb-4 text-sm text-mist-dim">{TABS.find((t) => t.id === tab)!.about}</p>
            <Fields tab={tab} />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-mist-faint max-sm:hidden">↑ ↓ Category · Esc Back · Changes save by themselves</span>
          <button onClick={onClose} className="h-11 rounded-full bg-cyan px-7 text-sm font-semibold text-ink">
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-ink/50 text-mist-dim hover:text-mist">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
        </svg>
      </button>
      <AnimatePresence>{open && <SettingsScreen onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
