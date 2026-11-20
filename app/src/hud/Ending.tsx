import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, money } from "../components/ui";
import { audio } from "../fx/audio";
import { CHAPTERS, totalTake } from "../game/data";
import { useSnitch } from "../game/store";
import { useChain } from "../chain/store";
import { isSideMode } from "../game/modes";
import { shareCard } from "./shareCard";

function StarRow({ n }: { n: number }) {
  useEffect(() => {
    const ts = [0, 1, 2].filter((i) => i < n).map((i) => setTimeout(() => audio.star(i), 900 + i * 300));
    return () => ts.forEach(clearTimeout);
  }, [n]);
  return (
    <div className="flex justify-center gap-2" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <motion.svg key={i} width={42} height={42} viewBox="0 0 24 24" aria-hidden initial={{ scale: 0.3, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.9 + i * 0.3 }}>
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill={i < n ? "#00e5ff" : "none"} stroke={i < n ? "#00e5ff" : "#5f5673"} strokeWidth="1.4" />
        </motion.svg>
      ))}
    </div>
  );
}

export function Ending() {
  const e = useSnitch((s) => s.ending)!;
  const chapter = useSnitch((s) => s.chapter)!;
  const mode = useSnitch((s) => s.mode);
  const start = useSnitch((s) => s.start);
  const crew = useSnitch((s) => s.crew);
  const finish = useSnitch((s) => s.finish);
  const nav = useNavigate();
  const names = e.snitches.map((i) => crew[i]?.name).filter(Boolean);
  const nobody = names.length === 0;
  const next = CHAPTERS.find((c) => c.id === chapter.id + 1 && c.open);
  const title = e.raided ? "Raided." : e.payout > 0 ? "You walked." : "Empty-handed.";
  const onChain = useSnitch((s) => s.onChain);
  const newBest = useSnitch((s) => s.newBest);
  const address = useChain((s) => s.wallet?.address);
  const side = isSideMode(chapter.id);
  const [shared, setShared] = useState<string>();
  const share = async () => {
    audio.select();
    const r = await shareCard({
      chapter: side ? chapter.name : chapter.prologue ? "Prologue" : `Chapter ${chapter.id}: ${chapter.name}`,
      difficulty: mode.name,
      title,
      payout: money(e.payout),
      stars: e.stars,
      snitch: nobody ? "Nobody at the table" : `The snitch: ${names.join(" & ")}`,
      onChain,
      link: onChain && address ? `${location.origin}/record/${address}` : undefined,
    }).catch(() => undefined);
    setShared(r === "saved" ? "Card saved, text copied." : r === "shared" ? "Shared." : "Couldn't make the card.");
  };

  return (
    <motion.div className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 26, delay: 1.2 }}>
      <div className="panel mx-auto w-full max-w-md rounded-3xl p-6 text-center">
        <p className="eyebrow text-heat">{nobody ? "Nobody at your table" : e.caught ? "You caught them" : names.length > 1 ? "The snitches were" : "The snitch was"}</p>
        <h2 className="display mt-1 text-5xl text-mist" style={{ textShadow: "0 0 36px rgb(255 45 111 / 0.55)" }}>
          {nobody ? "Clean table." : names.join(" & ")}
        </h2>
        <p className="mt-1 text-sm text-mist-dim">
          {nobody
            ? "The tip-offs came from outside the crew. Everyone you accused was loyal."
            : names.length > 1
              ? `${names[1]} ${chapter.rules?.recruitAt !== undefined ? "was turned partway through" : "was talking too"}. ${e.caught ? "You caught one in time." : "Neither was caught."}`
              : `${crew[e.snitch]?.role}. ${e.caught ? "You saw it in time." : "It was them all along."}`}
          {e.skimmer !== null && ` The skimmer was ${crew[e.skimmer]?.name}.`}
        </p>

        <div className="my-5 h-px bg-line" />
        <p className="display-soft text-2xl text-mist">{title}</p>
        <p className="num neon-cyan mt-1 text-4xl text-cyan">{money(e.payout)}</p>
        <p className="mt-1 text-xs text-mist-faint">
          {e.raided ? `Three heat. They took the ${money(e.bag)} you were carrying.` : `${money(e.bag)} of ${money(totalTake(chapter))} possible${mode.mult > 1 ? ` · ${mode.name} x${mode.mult}` : ""}`}
        </p>
        <div className="mt-4">
          <StarRow n={e.stars} />
        </div>
        {side && newBest && <p className="eyebrow mt-3 text-cyan">New best in this browser</p>}
        <p className="mt-3 text-[11px] text-mist-faint">
          {side ? "Practice table: the same rules as the contract." : "The snitch was sealed before your first move. This reveal comes with proof."}
          {onChain && address && (
            <>
              {" "}
              <button onClick={() => nav(`/record/${address}`)} className="text-cyan underline-offset-2 hover:underline">
                See it on the record
              </button>
            </>
          )}
        </p>
        <button onClick={() => void share()} className="mt-3 text-sm text-mist underline-offset-4 hover:text-cyan hover:underline">
          {shared ?? "Share this run"}
        </button>

        <div className="mt-5 flex gap-2.5">
          <Button kind="ghost" className="flex-1" onClick={() => nav("/city")}>
            City
          </Button>
          <Button kind={e.stars > 0 && next ? "ghost" : "cyan"} className="flex-1" onClick={() => start(chapter.id)}>
            Run it back
          </Button>
          {e.stars > 0 && next && (
            <Button kind="cyan" className="flex-[1.4]" onClick={finish}>
              What happens next
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
