import clsx from "clsx";
import { useEffect, useState } from "react";
import { Button, Ritual } from "../components/ui";
import { USD, claimPot, dollars, openPot, payPot, potOf, potShare, slotOf, type PotState } from "../chain/shop";
import { useChain } from "../chain/store";
import type { Phase } from "../game/engine";
import { audio } from "../fx/audio";
import { useRoom } from "./store";

const BUY_INS = [1, 2, 5];

/**
 * On-chain rooms only. Paid in a confidential dollar: nobody sees a balance, only that the full buy-in
 * arrived. Winners split it minus 5%.
 */
export function PotPanel() {
  const r = useRoom();
  const w = useChain((s) => s.wallet);
  const id = Number(r.code);
  const [pot, setPot] = useState<PotState>();
  const [share, setShare] = useState<{ share: number; takers: number }>();
  const [busy, setBusy] = useState<{ what: string; phase?: Phase }>();
  const [note, setNote] = useState<{ good: boolean; text: string }>();
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!w || !r.chain || !id) return;
    let live = true;
    const read = async () => {
      try {
        const { readRoom, ROOM } = await import("../chain/rooms");
        const [p, room] = await Promise.all([potOf(w, id), readRoom(w, id)]);
        const done = room.stage === ROOM.Settled;
        const s = done ? await potShare(w, id) : undefined;
        if (!live) return;
        setPot(p);
        setSettled(done);
        setShare(s);
      } catch {
        /* retried on the next read */
      }
    };
    void read();
    const t = setInterval(read, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [w, r.chain, id, tick]);

  if (!r.chain || !w) return null;
  const slot = slotOf(r.host ? undefined : r.mySeat);
  const bit = 1 << slot;
  const paid = !!pot && (pot.paidMask & bit) !== 0;
  const pending = !!pot && (pot.pendingMask & bit) !== 0;
  const claimed = !!pot && (pot.claimedMask & bit) !== 0;
  const payers = pot ? popcount(pot.paidMask) : 0;
  const canPay = !r.started && (r.host || r.mySeat !== undefined) && !paid;
  const mine = !!share && (share.takers & bit) !== 0;

  const run = async (what: string, f: (on: (p: Phase) => void) => Promise<unknown>, done: string) => {
    setNote(undefined);
    setBusy({ what });
    try {
      const ok = await f((phase) => setBusy({ what, phase }));
      if (ok === false) throw new Error("short");
      audio.select();
      setNote({ good: true, text: done });
    } catch (e) {
      if (import.meta.env.DEV) console.error("[pot]", e);
      audio.error();
      setNote({ good: false, text: (e as Error).message === "short" ? "Not enough dollars: nothing left your wallet. Get test money in the shop." : "The network didn't answer. Try again." });
    }
    setBusy(undefined);
    setTick((t) => t + 1);
  };

  return (
    <div className="panel mt-4 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow text-cyan">The pot</p>
        {pot?.buyIn ? <p className="num text-sm text-mist">{dollars(pot.buyIn)} buy-in · {payers} paid · {dollars(pot.buyIn * payers)}</p> : null}
      </div>
      {!pot ? (
        <p className="mt-2 text-sm text-mist-dim">Reading the pot…</p>
      ) : !pot.buyIn ? (
        r.host && !r.started ? (
          <>
            <p className="mt-1 text-sm text-mist-dim">Play for money? Everyone pays the same buy-in in a confidential dollar. Winners split it, minus 5%.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BUY_INS.map((d) => (
                <Button key={d} kind="ghost" disabled={!!busy} onClick={() => void run("Opening the pot", (on) => openPot(w, id, d * USD, on), `The pot is open: ${dollars(d * USD)} each.`)}>
                  {dollars(d * USD)} each
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-mist-dim">No pot at this table. Just for glory.</p>
        )
      ) : settled ? (
        mine && !claimed ? (
          <Button kind="cyan" className="mt-3 w-full" disabled={!!busy} onClick={() => void run("Taking your share", (on) => claimPot(w, id, on), "Your share is in your wallet, encrypted.")}>
            Claim {share ? dollars(share.share) : ""}
          </Button>
        ) : (
          <p className="mt-1 text-sm text-mist-dim">{claimed ? "You took your share." : paid ? "Not your night. The winners split the pot." : "You didn't buy in."}</p>
        )
      ) : (
        <>
          <p className="mt-1 text-sm text-mist-dim">Only whether the full buy-in arrived is ever made public. Never a balance.</p>
          {canPay && (
            <Button kind="mist" className="mt-3 w-full" disabled={!!busy} onClick={() => void run(pending ? "Confirming your buy-in" : "Paying in, confidentially", (on) => payPot(w, id, r.host ? undefined : r.mySeat, on), "You're in the pot.")}>
              {pending ? "Confirm the buy-in" : `Pay ${dollars(pot.buyIn)}`}
            </Button>
          )}
          {paid && <p className="eyebrow mt-3 text-cyan">You're in</p>}
        </>
      )}
      {busy && (
        <div className="mt-3 flex justify-center">
          <Ritual phase={busy.phase ?? "sending"} label={busy.phase === "decrypting" ? "Checking the payment with Zama's proof" : busy.what} />
        </div>
      )}
      {note && <p className={clsx("mt-2 text-sm", note.good ? "text-cyan" : "text-heat")}>{note.text}</p>}
    </div>
  );
}

function popcount(x: number) {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}
