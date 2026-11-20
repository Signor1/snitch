import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button, Ritual, TopBar } from "../components/ui";
import { useChain } from "../chain/store";
import { buyPass, claimItem, dollarBalance, dollars, getTestDollars, passState, shopReady, wardrobe, type Item, type PassState } from "../chain/shop";
import type { Phase } from "../game/engine";
import { audio } from "../fx/audio";
import { useSceneAudio } from "../hooks/useSceneAudio";

export default function Shop() {
  const c = useChain();
  const w = c.wallet;
  const [cash, setCash] = useState<number>();
  const [pass, setPass] = useState<PassState>();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<{ what: string; phase?: Phase }>();
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string }>();
  useSceneAudio("city");
  const stars = c.stars.reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!w && !c.connecting) void c.connect("game");
  }, [w, c]);

  // `tick` bumps after a purchase or claim to refetch.
  const [tick, setTick] = useState(0);
  const refresh = c.refresh;
  useEffect(() => {
    if (!w) return;
    let live = true;
    Promise.all([passState(w), wardrobe(w), refresh()])
      .then(([p, it]) => {
        if (!live) return;
        setPass(p);
        setItems(it);
      })
      .catch((e) => import.meta.env.DEV && console.warn("[shop]", e));
    return () => {
      live = false;
    };
  }, [w, refresh, tick]);
  const load = () => setTick((t) => t + 1);

  const run = async (what: string, f: (on: (p: Phase) => void) => Promise<unknown>, done: string) => {
    if (!w || busy) return;
    setNote(undefined);
    setBusy({ what });
    try {
      await f((phase) => setBusy({ what, phase }));
      audio.select();
      setNote({ tone: "good", text: done });
    } catch (e) {
      if (import.meta.env.DEV) console.error("[shop]", e);
      audio.error();
      setNote({ tone: "bad", text: plain(e as Error) });
    }
    setBusy(undefined);
    load();
  };

  if (!shopReady()) return null;

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgb(5_5_5/0.95)_0%,rgb(5_5_5/0.85)_60%,rgb(5_5_5/0.6)_100%)]" />
      <TopBar />
      <main className="pointer-events-auto relative mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <p className="eyebrow text-violet">The shop · Ethereum Sepolia</p>
        <h1 className="display neon-violet mt-2 text-[2.6rem] text-mist sm:text-6xl">Paid in the dark.</h1>
        <p className="mt-3 max-w-2xl text-mist-dim">
          Prices are public. Balances aren't. You pay in a confidential dollar: the contract learns only whether the full price arrived, never what's in your wallet. Test money only.
        </p>

        {(busy || note) && (
          <div className="mt-5 flex min-h-12 items-center">
            {busy ? <Ritual phase={busy.phase ?? "sending"} label={busy.phase === "decrypting" ? "Checking the payment with Zama's proof" : busy.what} /> : note && <p className={clsx("text-sm", note.tone === "good" ? "text-cyan" : "text-heat")}>{note.text}</p>}
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel rounded-3xl p-6">
            <p className="eyebrow text-cyan">Your dollars</p>
            <p className="num mt-2 text-4xl text-mist">{cash === undefined ? "● ● ●" : dollars(cash)}</p>
            <p className="mt-1 text-xs text-mist-dim">Encrypted on-chain. Only you can read it.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button kind="ghost" disabled={!w || !!busy} onClick={() => void run("Decrypting your balance, for your eyes only", async () => w && setCash(await dollarBalance(w)), "That's your balance. Nobody else can see it.")}>
                Show balance
              </Button>
              <Button kind="mist" disabled={!w || !!busy} onClick={() => void run("Minting test dollars and wrapping them", (on) => getTestDollars(w!, undefined, on), "$20 of test dollars are in your wallet, encrypted.")}>
                Get $20 test money
              </Button>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="panel rounded-3xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-violet">Boss Pass · season {pass?.season ?? "…"}</p>
                <p className="display-soft mt-2 text-2xl text-mist">{pass?.has ? "You're the boss." : "Every chapter, every season."}</p>
              </div>
              <span className="num shrink-0 text-2xl text-cyan">{pass ? dollars(pass.price) : "…"}</span>
            </div>
            <p className="mt-2 text-sm text-mist-dim">An ERC-721 that is your boss identity: it can't be sold or moved. It pays for your gas for the season.</p>
            {pass?.has ? (
              <p className="mt-5 rounded-xl border border-cyan/40 bg-cyan/5 px-3.5 py-2.5 text-sm text-mist">Your pass is on-chain. Welcome back, boss.</p>
            ) : (
              <Button
                kind="cyan"
                size="lg"
                className="mt-5 w-full"
                disabled={!w || !!busy || !pass}
                onClick={() =>
                  void run(
                    pass?.pending ? "Finishing your order" : "Paying, confidentially",
                    async (on) => {
                      const ok = await buyPass(w!, on);
                      if (!ok) throw new Error("short");
                    },
                    "Paid in full. The pass is yours.",
                  )
                }
              >
                {pass?.pending ? "Finish the purchase" : "Buy the pass"}
              </Button>
            )}
          </motion.section>
        </div>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow text-cyan">The wardrobe</p>
              <h2 className="display-soft mt-1 text-2xl text-mist">Earned, not bought.</h2>
            </div>
            <p className="num text-sm text-mist-dim">{stars} stars won on-chain</p>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-mist-dim">Each piece unlocks with stars your runs earned on Sepolia. Stars are only recorded after the contract checks the reveal's proof, so they can't be faked.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((it) => {
              const ready = stars >= it.stars;
              return (
                <li key={it.id} className={clsx("rounded-2xl border p-4", it.owned ? "border-cyan bg-cyan/10" : "border-line bg-ink/60")}>
                  <p className="display-soft text-lg text-mist">{it.name}</p>
                  <p className="num text-xs text-mist-dim">{it.stars} stars</p>
                  {it.owned ? (
                    <p className="eyebrow mt-4 text-cyan">Yours</p>
                  ) : (
                    <Button kind={ready ? "mist" : "ghost"} className="mt-4 w-full" disabled={!ready || !!busy} onClick={() => void run(`Claiming the ${it.name.toLowerCase()}`, (on) => claimItem(w!, it.id, on), `The ${it.name.toLowerCase()} is yours.`)}>
                      {ready ? "Claim" : `${it.stars - stars} more stars`}
                    </Button>
                  )}
                </li>
              );
            })}
            {!items.length && <li className="text-sm text-mist-dim">Opening the wardrobe…</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}

function plain(e: Error) {
  const m = e.message ?? "";
  if (m === "short") return "The payment didn't go through: not enough dollars. Nothing left your wallet. Get test money and try again.";
  if (/user rejected|denied/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(m)) return "This wallet has no test ETH, and gasless play isn't switched on for this site.";
  if (/NotEnoughStars/.test(m)) return "Not enough stars yet. Win more chapters on Sepolia.";
  return "The network didn't answer in time. Nothing was lost: try again.";
}
