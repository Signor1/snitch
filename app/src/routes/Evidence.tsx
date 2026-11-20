import clsx from "clsx";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { Button, TopBar } from "../components/ui";
import { CHAPTERS } from "../game/data";
import { useSnitch } from "../game/store";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { FILES } from "../story/evidence";

export default function Evidence() {
  const nav = useNavigate();
  const found = useSnitch((s) => s.evidence);
  useSceneAudio("city");
  const chapters = CHAPTERS.filter((c) => FILES.some((f) => f.chapter === c.id));
  return (
    <div className="pointer-events-auto relative min-h-[100dvh] w-full bg-[#2b1d12]">
      <div className="pointer-events-none fixed inset-0 opacity-90" style={{ background: "radial-gradient(circle at 30% 20%, #8a6438 0%, #6e4c29 45%, #3a2614 100%)" }} />
      <div className="pointer-events-none fixed inset-0 opacity-40 mix-blend-multiply" style={{ backgroundImage: "radial-gradient(#2a1a0c 1px, transparent 1.4px)", backgroundSize: "7px 7px" }} />
      <div className="relative z-10">
        <TopBar />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-[#f2d9a6]">Who is Echo?</p>
            <h1 className="display mt-1 text-5xl text-[#fff3dc] sm:text-6xl" style={{ textShadow: "0 3px 0 #2a1a0c" }}>
              The evidence board
            </h1>
            <p className="mt-2 max-w-xl text-[#f2d9a6]">
              {found.length} of {FILES.length} files. A perfect job turns one up: clean, nothing skimmed, the inside work done well. Find them all to learn the truth.
            </p>
          </div>
          <Button kind="ghost" onClick={() => nav(-1)}>
            Back
          </Button>
        </div>

        {chapters.map((c) => (
          <section key={c.id} className="mt-10">
            <p className="eyebrow mb-3 text-[#f2d9a6]">{c.prologue ? "Prologue" : `Chapter ${c.id}`} · {c.name}</p>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {FILES.filter((f) => f.chapter === c.id).map((f, i) => {
                const have = found.includes(f.id);
                const tilt = ((f.job * 37 + c.id * 11) % 7) - 3;
                return (
                  <motion.article
                    key={f.id}
                    initial={{ opacity: 0, y: 14, rotate: tilt * 2 }}
                    animate={{ opacity: 1, y: 0, rotate: tilt }}
                    transition={{ delay: 0.04 * i, type: "spring", stiffness: 180, damping: 18 }}
                    className={clsx("relative min-h-36 px-4 pt-6 pb-4 shadow-[0_14px_24px_-10px_#000]", have ? "bg-[#ece6d6] text-[#2a2620]" : "border-2 border-dashed border-[#f2d9a6]/40 bg-[#000]/15 text-[#f2d9a6]/70")}
                  >
                    <span className="absolute top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-[#c4232b] shadow-[0_2px_0_#5e0d12,inset_0_-2px_0_#7e1218]" />
                    {have ? (
                      <>
                        <p className="text-[10px] font-bold tracking-[0.2em] text-[#9a1b1b] uppercase">File {FILES.indexOf(f) + 1}</p>
                        <p className="mt-1 font-semibold leading-tight">{f.title}</p>
                        <p className="mt-1.5 font-[cursive] text-[14px] leading-snug">{f.text}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase">File {FILES.indexOf(f) + 1} · missing</p>
                        <p className="mt-2 text-sm leading-snug">
                          A perfect job at <span className="font-semibold text-[#fff3dc]">{c.jobs[f.job]?.name}</span> turns this up.
                        </p>
                      </>
                    )}
                  </motion.article>
                );
              })}
            </div>
          </section>
        ))}
        {found.length === FILES.length && (
          <p className="display-soft mt-12 text-center text-2xl text-[#fff3dc]">Every file points the same way. You know who Echo is.</p>
        )}
      </main>
    </div>
  );
}
