import clsx from "clsx";
import { useMemo } from "react";
import { suspicion } from "../game/suspicion";
import { useSnitch } from "../game/store";
import { barred, blackout } from "../game/tasks";

export function CrewDock() {
  const crew = useSnitch((s) => s.crew);
  const out = useSnitch((s) => s.out);
  const selected = useSnitch((s) => s.selected);
  const tool = useSnitch((s) => s.tool);
  const busy = useSnitch((s) => s.busy);
  const log = useSnitch((s) => s.log);
  const mode = useSnitch((s) => s.mode);
  const caught = useSnitch((s) => s.caught);
  const tap = useSnitch((s) => s.tap);
  const job = useSnitch((s) => s.chapter?.jobs[s.job]);
  const meter = mode.id < 2 && !caught && !blackout(job);
  const rules = useSnitch((s) => s.chapter?.rules);
  const done = useSnitch((s) => s.job);
  const odds = useMemo(() => suspicion(crew.length, mode, log, rules, done), [crew.length, mode, log, rules, done]);
  const top = Math.max(...odds);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:justify-center" role="list" aria-label="Your crew">
      {crew.map((m, i) => {
        const gone = out.includes(m.id);
        const sits = tool === "team" && barred(job, m.id);
        const must = tool === "team" && job?.task.kind === "need" && job.task.member === m.id && !gone;
        const on = selected.includes(m.id);
        const pct = Math.round(odds[i] * 100);
        return (
          <button
            key={m.id}
            role="listitem"
            disabled={gone || !!busy}
            onClick={() => tap(m.id)}
            aria-pressed={on}
            aria-label={`${m.name}, ${m.role}${gone ? ", gone" : ""}${meter && !gone ? `, ${pct}% suspicion` : ""}`}
            className={clsx(
              "relative min-w-[4.1rem] flex-1 rounded-2xl sm:w-[5.4rem] sm:flex-none border px-2.5 pt-2 pb-2.5 text-left transition-[border-color,background,transform,opacity] duration-150 active:scale-[0.97]",
              gone ? "border-line/50 opacity-30" : sits ? "border-line/50 opacity-45" : must && !on ? "border-cyan/70 bg-ink/70 animate-pulse" : on ? (tool === "accuse" ? "border-heat bg-heat/15" : "border-cyan bg-cyan/10 shadow-[0_0_24px_-8px_#00e5ff]") : "border-line bg-ink/70 hover:border-violet",
            )}
          >
            <span className="display-soft block truncate text-sm text-mist">{m.name}</span>
            <span className="block truncate text-[11px] text-mist-dim">{gone ? "Gone" : sits ? "Sits out" : must ? "Needed" : m.role}</span>
            {meter && !gone && (
              <>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-line">
                  <span className={clsx("block h-full rounded-full transition-[width] duration-500", odds[i] === top && log.length ? "bg-heat" : "bg-violet")} style={{ width: `${Math.max(4, pct)}%` }} />
                </span>
                <span className="num mt-1 block text-[10px] text-mist-faint">{pct}%<span className="max-sm:hidden"> suspect</span></span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
