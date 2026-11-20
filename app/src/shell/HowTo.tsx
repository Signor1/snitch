import { useEffect } from "react";

const LINES = [
  ["Send a team", "Pick who goes on each job. A clean job brings cash back. Police mean heat."],
  ["Work out who's talking", "Police usually mean the snitch was on that team. Tail people, or use the wiretap, to learn more."],
  ["Accuse, or don't", "Right: the snitch is out and your bag doubles. Wrong: a loyal friend leaves and the heat rises."],
  ["Get out in time", "Walk away whenever you like and keep the bag. Three heat and you lose it all."],
];

export function HowTo({ onBack }: { onBack(): void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onBack]);
  return (
    <div className="panel mt-8 max-w-xl rounded-3xl p-6">
      <h2 className="display-soft text-2xl text-mist">How to play</h2>
      <ol className="mt-4 space-y-3">
        {LINES.map(([t, b], i) => (
          <li key={t} className="flex gap-3 text-sm">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan text-xs text-ink">{i + 1}</span>
            <span>
              <span className="font-semibold text-mist">{t}.</span> <span className="text-mist-dim">{b}</span>
            </span>
          </li>
        ))}
      </ol>
      <button onClick={onBack} className="mt-5 h-10 rounded-full border border-line px-5 text-sm text-mist hover:border-violet">
        Back
      </button>
    </div>
  );
}
