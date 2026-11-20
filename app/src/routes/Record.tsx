import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Address } from "viem";
import { Ritual, Stars, TopBar, money } from "../components/ui";
import { isNobody, settledRuns, short, standings, txLink, type SettledRun, type Standing } from "../chain/record";
import { useChain } from "../chain/store";
import { CHAPTERS, MODES, castOf } from "../game/data";
import { useSceneAudio } from "../hooks/useSceneAudio";

/** /record is the leaderboard; /record/:address lists one player's settled runs. */
export default function Record() {
  const who = useParams().address as Address | undefined;
  const mine = useChain((s) => s.wallet?.address);
  // Tagged with the address so switching pages shows the loader, not stale rows.
  const [data, setData] = useState<{ who?: string; runs?: SettledRun[]; error?: boolean }>({ who: "-" });
  useSceneAudio("city");

  useEffect(() => {
    let live = true;
    settledRuns(who)
      .then((r) => live && setData({ who, runs: r }))
      .catch(() => live && setData({ who, error: true }));
    return () => {
      live = false;
    };
  }, [who]);
  const current = data.who === who;
  const runs = current ? data.runs : undefined;
  const error = current && !!data.error;

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 bg-ink/85" />
      <TopBar />
      <main className="pointer-events-auto relative mx-auto w-full max-w-4xl px-5 pb-16 sm:px-8">
        <p className="eyebrow text-violet">The record · Ethereum Sepolia</p>
        <h1 className="display neon-violet mt-2 text-[2.4rem] text-mist sm:text-5xl">{who ? `${who.toLowerCase() === mine?.toLowerCase() ? "Your" : short(who) + "'s"} runs` : "Who got rich."}</h1>
        <p className="mt-3 max-w-2xl text-mist-dim">
          Every number here was written by the contract after it checked Zama's decryption proof of the reveal. Nobody can edit it, the developer included. {who ? "Each run links to its settle transaction." : "Score: the best payout on each chapter, added up."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {who && (
            <Link to="/record" className="rounded-full border border-line px-4 py-1.5 text-mist hover:border-violet">
              Leaderboard
            </Link>
          )}
          {mine && who?.toLowerCase() !== mine.toLowerCase() && (
            <Link to={`/record/${mine}`} className="rounded-full border border-line px-4 py-1.5 text-mist hover:border-violet">
              My runs
            </Link>
          )}
        </div>

        <div className="mt-8">
          {error ? (
            <p className="text-sm text-heat">The network didn't answer. Try again in a moment.</p>
          ) : !runs ? (
            <div className="flex justify-center py-10">
              <Ritual phase="sending" label="Reading the record from Sepolia" />
            </div>
          ) : who ? (
            <Runs runs={runs} />
          ) : (
            <Board rows={standings(runs)} mine={mine} />
          )}
        </div>
      </main>
    </div>
  );
}

function Board({ rows, mine }: { rows: Standing[]; mine?: string }) {
  if (!rows.length) return <p className="text-sm text-mist-dim">Nobody has settled a run yet. Be the first.</p>;
  return (
    <ol className="space-y-2">
      {rows.slice(0, 50).map((r, i) => (
        <motion.li key={r.player} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
          <Link to={`/record/${r.player}`} className={clsx("flex items-center gap-4 rounded-2xl border px-4 py-3 hover:border-cyan", r.player.toLowerCase() === mine?.toLowerCase() ? "border-cyan bg-cyan/10" : "border-line bg-ink/60")}>
            <span className={clsx("num w-8 text-lg", i < 3 ? "text-cyan" : "text-mist-faint")}>{i + 1}</span>
            <span className="num min-w-0 flex-1 truncate text-mist">{short(r.player)}{r.player.toLowerCase() === mine?.toLowerCase() && <span className="eyebrow ml-2 text-cyan">You</span>}</span>
            <span className="hidden text-xs text-mist-dim sm:block">{r.runs} runs</span>
            <span className="num text-sm text-mist-dim">★ {r.stars}</span>
            <span className="num w-28 text-right text-lg text-mist">{money(r.score)}</span>
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}

function Runs({ runs }: { runs: SettledRun[] }) {
  if (!runs.length) return <p className="text-sm text-mist-dim">No settled runs for this address yet.</p>;
  return (
    <ul className="space-y-2.5">
      {runs.map((r) => {
        const c = CHAPTERS.find((x) => x.id === r.chapter);
        const cast = c ? castOf(c) : [];
        const name = (s: number) => cast[s]?.name ?? `seat ${s + 1}`;
        const who = isNobody(r.snitch) ? "Nobody at the table: the tips came from outside" : isNobody(r.second) ? `The snitch was ${name(r.snitch)}` : `The snitches were ${name(r.snitch)} and ${name(r.second)}`;
        return (
          <li key={r.tx} className="panel rounded-2xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="display-soft text-lg text-mist">
                {c ? `Chapter ${c.id} · ${c.name}` : `Chapter ${r.chapter}`} <span className="eyebrow ml-1 text-mist-faint">{MODES[r.difficulty]?.name}</span>
              </p>
              <Stars n={r.stars} />
            </div>
            <p className="mt-1 text-sm text-mist-dim">
              {who}. {r.heat >= 3 ? "Raided: the bag was lost." : `Bag ${money(r.bag)}, paid ${money(r.payout)}.`}
            </p>
            <a href={txLink(r.tx)} target="_blank" rel="noreferrer" className="num mt-2 inline-block text-xs text-cyan hover:underline">
              Settled with proof · {short(r.tx)}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
