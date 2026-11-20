import clsx from "clsx";
import { motion } from "motion/react";
import { HEAT_MAX, jobTake, taskCopy } from "../game/data";
import { useSnitch } from "../game/store";
import { money } from "../components/ui";

function Heat({ heat }: { heat: number }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Heat ${heat} of ${HEAT_MAX}`}>
      {[...Array(HEAT_MAX)].map((_, i) => (
        <motion.span
          key={i}
          animate={i < heat ? { scale: [1.5, 1] } : { scale: 1 }}
          className={clsx("h-3 w-6 rounded-sm border", i < heat ? "border-heat bg-heat shadow-[0_0_14px_#ff2d6f]" : "border-mist-faint/60")}
        />
      ))}
    </div>
  );
}

export function StatusBar() {
  const chapter = useSnitch((s) => s.chapter)!;
  const job = useSnitch((s) => s.job);
  const bag = useSnitch((s) => s.bag);
  const heat = useSnitch((s) => s.heat);
  const mode = useSnitch((s) => s.mode);
  const caught = useSnitch((s) => s.caught);
  const crew = useSnitch((s) => s.crew);
  const loyalty = useSnitch((s) => (s.chapter?.rules?.loyalty ? s.loyalty : null));
  const over = useSnitch((s) => s.status === "ended");
  const next = over ? undefined : chapter.jobs[job];
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 sm:px-8">
      <div>
        <p className="eyebrow text-violet">
          {chapter.prologue ? "Prologue" : `Chapter ${chapter.id}`} · {chapter.name} · {mode.name}
        </p>
        <h1 className="display-soft text-xl text-mist sm:text-2xl">
          {next ? (
            <>
              <span className="text-mist-faint">Job {job + 1}/{chapter.jobs.length}</span> {next.name}
              <span className="num ml-2 text-cyan">{money(jobTake(next))}</span>
            </>
          ) : (
            over ? "Run over" : "All jobs done"
          )}
        </h1>
        {next && next.task.kind !== "plain" && (
          <p className="mt-1 max-w-md text-xs text-mist-dim">
            <span className="eyebrow mr-2 rounded-full border border-cyan/50 px-2 py-0.5 text-cyan">{taskCopy(next.task, crew).title}</span>
            {taskCopy(next.task, crew).body}
          </p>
        )}
        {caught && <p className="mt-0.5 text-xs text-cyan">Snitch caught. Only bad luck can hurt you.</p>}
      </div>
      <div className="flex items-center gap-5">
        {loyalty !== null && (
          <div className="text-right">
            <p className="eyebrow text-mist-faint">Loyalty</p>
            <div className="mt-1.5 h-3 w-20 overflow-hidden rounded-sm border border-mist-faint/60">
              <div className={clsx("h-full transition-[width] duration-500", loyalty < 40 ? "bg-heat" : "bg-violet")} style={{ width: `${loyalty}%` }} />
            </div>
          </div>
        )}
        <div className="text-right">
          <p className="eyebrow text-mist-faint">Heat</p>
          <div className="mt-1.5">
            <Heat heat={heat} />
          </div>
        </div>
        <div className="text-right">
          <p className="eyebrow text-mist-faint">In the bag</p>
          <motion.p key={bag} initial={{ scale: 1.25, color: "#00e5ff" }} animate={{ scale: 1, color: "#ece6f7" }} className="num text-2xl leading-tight">
            {money(bag)}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
