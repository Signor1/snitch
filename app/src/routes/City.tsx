import clsx from "clsx";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { money, Stars, TopBar } from "../components/ui";
import { audio } from "../fx/audio";
import { CHAPTERS, MODES, totalTake } from "../game/data";
import { totalRep, useSnitch } from "../game/store";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { FILES } from "../story/evidence";
import { ChainPanel } from "../chain/ChainPanel";
import { useChain } from "../chain/store";
import { ON_CHAIN } from "../game/store";
import { BOSS_LOOKS, CREW_TAGS, useProfile } from "../settings/store";

export default function City() {
  const nav = useNavigate();
  const progress = useSnitch((s) => s.progress);
  const difficulty = useSnitch((s) => s.difficulty);
  const setDifficulty = useSnitch((s) => s.setDifficulty);
  const me = useProfile((s) => s.identity);
  const evidence = useSnitch((s) => s.evidence.length);
  const chainMode = useChain((s) => s.mode);
  const chainStars = useChain((s) => s.stars);
  useSceneAudio("city");
  const unlocked = (id: number) => id <= 1 || (progress[id - 1]?.stars ?? 0) > 0;

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgb(5_5_5/0.95)_0%,rgb(5_5_5/0.8)_48%,transparent_76%)] max-lg:bg-ink/80" />
      <TopBar right={<span className="num rounded-full border border-line bg-ink/50 px-3 py-1.5 text-sm text-cyan">{money(totalRep(progress))}</span>} />
      <main className="relative mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow text-violet">Port Solace · after dark</p>
          {me && (
            <button onClick={() => nav("/identity")} className="mt-3 flex items-center gap-3 rounded-full border border-line bg-ink/60 py-1.5 pr-4 pl-1.5 text-left hover:border-violet">
              <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-ink" style={{ background: CREW_TAGS[me.tag].color }}>
                {me.boss[0]?.toUpperCase()}
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight text-mist">{me.boss} · {BOSS_LOOKS[me.look].name}</span>
                <span className="block text-xs leading-tight text-mist-dim">{me.crew}</span>
              </span>
            </button>
          )}
          <h1 className="display neon-violet mt-2 text-[2.7rem] text-mist sm:text-6xl">Pick your score.</h1>
          <button onClick={() => nav("/evidence")} className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#c4232b]/60 bg-ink/60 px-4 py-2 text-sm text-mist hover:border-[#ff4b55]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#c4232b]" />
            Evidence board · {evidence} of {FILES.length} files
          </button>

          <div className="mt-6" role="radiogroup" aria-label="Difficulty">
            <div className="inline-flex rounded-full border border-line bg-ink/60 p-1 backdrop-blur">
              {MODES.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={difficulty === d.id}
                  onClick={() => {
                    audio.unlock();
                    audio.click();
                    setDifficulty(d.id);
                  }}
                  className={clsx("h-9 rounded-full px-4 text-sm font-semibold transition-colors", difficulty === d.id ? "bg-mist text-ink" : "text-mist-dim hover:text-mist")}
                >
                  {d.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-mist-dim">{MODES[difficulty].body}</p>
          </div>
          <ChainPanel />

          <ul className="mt-8 space-y-3">
            {CHAPTERS.map((c, i) => {
              // The contract has its own unlock rule: a star on the previous chapter, won on-chain.
              const onChain = chainMode === "chain" && ON_CHAIN.includes(c.id);
              const chainOpen = c.id <= 1 || (chainStars[c.id - 2] ?? 0) > 0;
              const open = c.open && unlocked(c.id) && (!onChain || chainOpen);
              const p = progress[c.id];
              return (
                <motion.li key={c.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                  <button
                    disabled={!open}
                    onClick={() => {
                      audio.unlock();
                      audio.click();
                      nav(`/run/${c.id}`);
                    }}
                    className={clsx("panel group flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-[border-color,transform] duration-150", open ? "hover:border-cyan active:scale-[0.99]" : "cursor-not-allowed opacity-45")}
                  >
                    <span className={clsx("num grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-lg", open ? "border-cyan/60 text-cyan" : "border-line text-mist-faint")}>{c.prologue ? "P" : c.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="display-soft block text-lg text-mist">{c.name}</span>
                      <span className="block truncate text-sm text-mist-dim">{c.tagline}</span>
                      {c.open && (
                        <span className="num mt-1 block text-xs text-mist-faint">
                          {c.prologue ? `${c.jobs.length} jobs · where it all began` : `${c.cast.length} crew · ${c.jobs.length} jobs · up to ${money(totalTake(c) * 2)}`}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      {!c.open ? <span className="eyebrow text-mist-faint">Coming next</span> : chainMode === "chain" && !ON_CHAIN.includes(c.id) ? <span className="eyebrow text-mist-faint">Practice</span> : onChain && !chainOpen && unlocked(c.id) ? <span className="eyebrow block max-w-28 text-mist-faint">Win chapter {c.id - 1} on-chain</span> : !open ? <span className="eyebrow text-mist-faint">Locked</span> : <Stars n={p?.stars ?? 0} size={16} />}
                      {p?.best ? <span className="num mt-1 block text-xs text-cyan">{money(p.best)}</span> : null}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
