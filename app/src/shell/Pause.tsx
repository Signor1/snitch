import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { audio } from "../fx/audio";
import { SettingsScreen } from "../settings/SettingsPanel";
import { HowTo } from "./HowTo";
import { Hints, Menu } from "./Menu";

/** Opened with Esc. Nothing on the table changes while paused. */
export function Pause({ onRestart }: { onRestart(): void }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"settings" | "how" | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open) return;
      audio.click();
      setOpen(true);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const close = () => (setPanel(null), setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Pause" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-ink/50 text-mist-dim hover:text-mist">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
          <rect x="8.500" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="pointer-events-auto fixed inset-0 z-40 flex h-[100dvh] w-[100vw] flex-col justify-[safe_center] overflow-y-auto bg-ink/85 px-6 py-8 backdrop-blur-md sm:px-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Paused">
            <p className="eyebrow text-violet">Paused</p>
            <h2 className="display neon-violet mt-1 text-6xl text-mist">The table waits.</h2>
            {panel === "how" ? (
              <HowTo onBack={() => setPanel(null)} />
            ) : (
              <div className="mt-8">
                <Menu
                  size="md"
                  onBack={close}
                  items={[
                    { label: "Resume", hint: "Back to the table.", run: close },
                    { label: "How to play", hint: "The whole game in four lines.", run: () => setPanel("how") },
                    { label: "Settings", hint: "Sound, graphics and accessibility.", run: () => setPanel("settings") },
                    { label: "Restart run", hint: "A fresh crew and a new hidden snitch. This run is lost.", run: () => (close(), onRestart()) },
                    { label: "Quit to city", hint: "Leave this run. Anything in the bag is lost.", run: () => nav("/city") },
                  ]}
                />
              </div>
            )}
            <div className="mt-8">
              <Hints back />
            </div>
            {panel === "settings" && <SettingsScreen onClose={() => setPanel(null)} />}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
