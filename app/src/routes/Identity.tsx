import clsx from "clsx";
import { useSnitch } from "../game/store";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, TopBar } from "../components/ui";
import { audio } from "../fx/audio";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { SettingsFields } from "../settings/SettingsPanel";
import { BOSS_LOOKS, CREW_TAGS, useProfile } from "../settings/store";

const clean = (s: string) => s.replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 16);

export default function Identity() {
  const nav = useNavigate();
  const saved = useProfile((s) => s.identity);
  const setIdentity = useProfile((s) => s.setIdentity);
  const [boss, setBoss] = useState(saved?.boss ?? "");
  const [crew, setCrew] = useState(saved?.crew ?? "");
  const [look, setLook] = useState(saved?.look ?? 0);
  const [tag, setTag] = useState(saved?.tag ?? 0);
  useSceneAudio("city");
  const ok = boss.trim().length >= 2 && crew.trim().length >= 2;

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-0 bg-ink/80" />
      <TopBar />
      <main className="relative mx-auto grid w-full max-w-5xl gap-6 px-5 pb-16 sm:px-8 lg:grid-cols-[1.25fr_1fr]">
        <motion.section className="panel rounded-3xl p-6 sm:p-8" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="eyebrow text-violet">Step 1</p>
          <h1 className="display neon-violet mt-2 text-4xl text-mist sm:text-5xl">Who runs this crew?</h1>

          <label className="mt-6 block">
            <span className="eyebrow text-mist-faint">Your street name</span>
            <input value={boss} onChange={(e) => setBoss(clean(e.target.value))} placeholder="e.g. Kelvin" autoComplete="off" className="mt-1.5 h-12 w-full rounded-xl border border-line bg-ink/70 px-4 text-base text-mist placeholder:text-mist-faint focus:border-cyan focus:outline-none" />
          </label>
          <label className="mt-4 block">
            <span className="eyebrow text-mist-faint">Your crew's name</span>
            <input value={crew} onChange={(e) => setCrew(clean(e.target.value))} placeholder="e.g. Night Shift" autoComplete="off" className="mt-1.5 h-12 w-full rounded-xl border border-line bg-ink/70 px-4 text-base text-mist placeholder:text-mist-faint focus:border-cyan focus:outline-none" />
          </label>

          <p className="eyebrow mt-6 text-mist-faint">Your look</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Boss look">
            {BOSS_LOOKS.map((b, i) => (
              <button
                key={b.name}
                role="radio"
                aria-checked={look === i}
                onClick={() => {
                  audio.select();
                  setLook(i);
                }}
                className={clsx("rounded-2xl border p-3 text-left transition-colors", look === i ? "border-cyan bg-cyan/10" : "border-line bg-ink/60 hover:border-violet")}
              >
                <span className="display-soft block text-base text-mist">{b.name}</span>
                <span className="block text-xs text-mist-dim">{b.line}</span>
              </button>
            ))}
          </div>

          <p className="eyebrow mt-6 text-mist-faint">Crew colour</p>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Crew colour">
            {CREW_TAGS.map((t, i) => (
              <button
                key={t.name}
                role="radio"
                aria-checked={tag === i}
                aria-label={t.name}
                onClick={() => {
                  audio.select();
                  setTag(i);
                }}
                className={clsx("h-10 w-10 rounded-full border-2 transition-transform", tag === i ? "scale-110 border-mist" : "border-transparent")}
                style={{ background: t.color, boxShadow: tag === i ? `0 0 22px ${t.color}` : undefined }}
              />
            ))}
          </div>
        </motion.section>

        <motion.section className="panel h-fit rounded-3xl p-6 sm:p-8" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <p className="eyebrow text-violet">Step 2</p>
          <h2 className="display-soft mt-2 text-2xl text-mist">Set it up your way</h2>
          <div className="mt-3">
            <SettingsFields />
          </div>
          <Button
            kind="cyan"
            size="lg"
            className="mt-6 w-full"
            disabled={!ok}
            onClick={() => {
              setIdentity({ boss: boss.trim(), crew: crew.trim(), look, tag });
              nav(useSnitch.getState().progress[0] ? "/city" : "/run/0");
            }}
          >
            {ok ? "Enter Port Solace" : "Name yourself and your crew"}
          </Button>
          <p className="mt-3 text-xs text-mist-faint">You can change all of this later from the gear icon.</p>
        </motion.section>
      </main>
    </div>
  );
}
