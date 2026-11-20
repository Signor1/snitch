import clsx from "clsx";
import { useEffect, useState } from "react";
import { Button } from "../components/ui";
import { audio } from "../fx/audio";
import { sponsorshipReady } from "./sponsored";
import { exportGameKey } from "./wallet";
import { useChain } from "./store";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ChainPanel() {
  const c = useChain();
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (c.wallet) void c.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.wallet?.address]);

  return (
    <div className="mt-6">
      <div className="inline-flex rounded-full border border-line bg-ink/60 p-1 backdrop-blur" role="radiogroup" aria-label="Where to play">
        {(["practice", "chain"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={c.mode === m} onClick={() => (audio.click(), c.setMode(m))} className={clsx("h-9 rounded-full px-4 text-sm font-semibold", c.mode === m ? "bg-mist text-ink" : "text-mist-dim hover:text-mist")}>
            {m === "practice" ? "Practice" : "On-chain · Sepolia"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-mist-dim">
        {c.mode === "practice"
          ? "Plays instantly in your browser. Same rules, nothing recorded."
          : "Every move is a real transaction. The snitch is drawn on-chain and stays encrypted; the reveal comes with a proof anyone can check. Chapters 1–3."}
      </p>

      {c.mode === "chain" &&
        (c.wallet ? (
          <div className="panel mt-3 flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-mist-faint">{c.wallet.kind === "game" ? "Game wallet · gasless" : "Your wallet"}</p>
              <a className="num text-cyan hover:underline" href={`https://sepolia.etherscan.io/address/${c.wallet.address}`} target="_blank" rel="noreferrer">
                {short(c.wallet.address)}
              </a>
              {c.wallet.kind === "own" && <span className="num ml-2 text-xs text-mist-dim">{c.balance ? `${Number(c.balance).toFixed(4)} test ETH` : "…"}</span>}
              {c.wallet.kind === "game" && !sponsorshipReady() && <p className="mt-1 text-xs text-heat">Gasless play isn't switched on for this site yet.</p>}
            </div>
            {c.wallet.kind === "game" && (
              <>
                <Button kind="ghost" onClick={() => setShowKey((x) => !x)}>
                  {showKey ? "Hide key" : "Export key"}
                </Button>
              </>
            )}
            {showKey && (
              <p className="num w-full break-all rounded-xl border border-heat/50 bg-heat/10 p-2.5 text-[11px] text-mist">
                {exportGameKey()}
                <span className="mt-1 block font-sans text-mist-dim">This key controls your game wallet (test ETH only). Don't share it.</span>
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <button onClick={() => void c.connect("game")} disabled={c.connecting} className="panel rounded-2xl p-4 text-left hover:border-cyan">
              <span className="display-soft block text-lg text-mist">Play now</span>
              <span className="mt-1 block text-sm text-mist-dim">No wallet, no ETH needed. You get a game wallet, and every move is gasless.</span>
            </button>
            <button onClick={() => void c.connect("own")} disabled={c.connecting} className="panel rounded-2xl p-4 text-left hover:border-violet">
              <span className="display-soft block text-lg text-mist">Use my wallet</span>
              <span className="mt-1 block text-sm text-mist-dim">MetaMask or similar, on Sepolia. You approve each move and pay your own gas.</span>
            </button>
            {c.error && <p className="text-sm text-heat sm:col-span-2">{c.error}</p>}
          </div>
        ))}
    </div>
  );
}
