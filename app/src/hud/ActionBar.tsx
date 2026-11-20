import clsx from "clsx";
import { Button, Ritual } from "../components/ui";
import { useEffect, useState } from "react";
import { away, need, useSnitch, type Tool } from "../game/store";
import { teamSize } from "../game/data";
import { blackout, teamProblem } from "../game/tasks";

const BUSY_COPY: Record<string, string> = {
  tail: "Your tail is following them through the rain",
  wiretap: "Listening on the wire",
  accuse: "The room goes quiet",
  end: "Counting the bag. Opening the sealed truth",
};

export function ActionBar() {
  const s = useSnitch();
  const chapter = s.chapter!;
  const job = chapter.jobs[s.job];
  const left = s.crew.length - s.out.length;
  const n = need(s.tool, chapter, s.job);
  const stuck = !job || left - s.benched.length < (job ? teamSize(job) : 0);
  const problem = s.tool === "team" ? teamProblem(job, s.selected, away(s), s.crew) : null;
  const ready = s.selected.length === n && !problem;
  const dark = blackout(job);

  // Rush jobs: at zero the crew picks for you.
  const rush = job?.task.kind === "rush" && !stuck ? job.task.seconds : 0;
  const [left_s, setLeft] = useState(rush);
  useEffect(() => {
    setLeft(rush);
    if (!rush) return;
    const id = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(id);
  }, [rush, s.job]);
  useEffect(() => {
    if (rush && left_s <= 0 && !s.busy) s.rushOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left_s]);

  const tools: { id: Tool; label: string; hint: string; off: boolean; show: boolean }[] = [
    { id: "team", label: "Plan job", hint: "", off: stuck, show: true },
    { id: "tail", label: `Tail (${s.favors})`, hint: "Have someone followed. Usually right.", off: s.favors <= 0 || dark, show: true },
    { id: "wiretap", label: s.wiretapUsed ? "Wiretap used" : "Wiretap", hint: "Pick two. Never wrong. Once per run.", off: s.wiretapUsed || dark, show: chapter.wiretap },
    { id: "accuse", label: "Accuse", hint: "Right: bag doubles. Wrong: heat.", off: left <= 1 || s.caught, show: true },
  ];

  let prompt = "";
  let cta = "";
  if (s.tool === "team") {
    prompt = stuck ? "Not enough crew left for the next job. Walk away with the bag." : ready ? `Team ready for the ${job.name.toLowerCase()}.` : (problem ?? "");
    cta = "Send the team";
  } else if (s.tool === "tail") {
    prompt = ready ? "Have them followed tonight?" : "Tap the person you want followed.";
    cta = "Tail them";
  } else if (s.tool === "wiretap") {
    prompt = ready ? "Tap both phones?" : `Tap two people to listen in on (${s.selected.length}/2).`;
    cta = "Listen in";
  } else {
    prompt = ready ? "Sure? If you're wrong, a loyal friend walks and the heat goes up." : "Tap the one you think is the snitch.";
    cta = "Accuse";
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex min-h-10 items-center justify-center text-center" aria-live="polite">
        {s.busy && s.busy !== "job" ? <Ritual phase={s.phase ?? "sending"} label={BUSY_COPY[s.busy]} /> : (
          <p className="text-sm text-mist sm:text-base">
            {rush > 0 && s.tool === "team" && <span className={`num mr-2 rounded-full border px-2 py-0.5 ${left_s <= 8 ? "border-heat text-heat" : "border-cyan/60 text-cyan"}`}>0:{String(Math.max(0, left_s)).padStart(2, "0")}</span>}
            {prompt}
          </p>
        )}
      </div>
      <div className="panel flex flex-wrap items-center gap-1.5 rounded-[1.75rem] p-1.5">
        <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Actions">
          {tools
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={s.tool === t.id}
                disabled={!!s.busy || t.off}
                title={t.hint}
                onClick={() => s.setTool(t.id)}
                className={clsx(
                  "h-11 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-35",
                  s.tool === t.id ? (t.id === "accuse" ? "bg-heat/20 text-heat" : "bg-amethyst text-mist") : "text-mist-dim hover:text-mist",
                )}
              >
                {t.label}
              </button>
            ))}
        </div>
        <div className="flex w-full gap-1.5 sm:w-auto">
          <Button kind="ghost" className="flex-1 sm:flex-none" disabled={!!s.busy} onClick={() => void s.walk()} title="End the run and keep what's in the bag">
            Walk away
          </Button>
          <Button kind={s.tool === "accuse" ? "heat" : "cyan"} className="flex-[2] sm:min-w-40 sm:flex-none" disabled={!!s.busy || !ready || (s.tool === "team" && stuck)} onClick={() => void s.go()}>
            {cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
