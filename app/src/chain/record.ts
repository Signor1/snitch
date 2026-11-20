import { getAbiItem, type Abi, type Address, type Hex } from "viem";
import snitchAbi from "./abi/Snitch.json";
import addresses from "./abi/addresses.json";
import { publicClient } from "./wallet";

// Read from `Settled` events. A run only settles after the contract checks its KMS proof.
const A = (addresses as Record<string, Record<string, string | number>>)["11155111"];
const SNITCH = A.Snitch as Address;
const FROM = BigInt(A.snitchBlock ?? 0);
const NOBODY = 255;
const settled = getAbiItem({ abi: snitchAbi as Abi, name: "Settled" });

export interface SettledRun {
  player: Address;
  run: number;
  chapter: number;
  difficulty: number;
  payout: number;
  bag: number;
  snitch: number;
  second: number;
  heat: number;
  stars: number;
  tx: Hex;
  block: bigint;
}

/** Newest first. Reads in chunks because public nodes cap log ranges. */
export async function settledRuns(player?: Address): Promise<SettledRun[]> {
  const pub = publicClient();
  const latest = await pub.getBlockNumber();
  const out: SettledRun[] = [];
  const STEP = 40_000n;
  for (let from = FROM; from <= latest; from += STEP) {
    const to = from + STEP - 1n > latest ? latest : from + STEP - 1n;
    const logs = await pub.getLogs({ address: SNITCH, event: settled as never, args: player ? ({ player } as never) : undefined, fromBlock: from, toBlock: to });
    for (const l of logs as unknown as { args: Record<string, unknown>; transactionHash: Hex; blockNumber: bigint }[]) {
      const a = l.args;
      out.push({
        player: a.player as Address,
        run: Number(a.run),
        chapter: Number(a.chapter),
        difficulty: Number(a.difficulty),
        payout: Number(a.payout),
        bag: Number(a.bag),
        snitch: Number(a.snitch),
        second: Number(a.second),
        heat: Number(a.heat),
        stars: Number(a.stars),
        tx: l.transactionHash,
        block: l.blockNumber,
      });
    }
  }
  return out.sort((x, y) => Number(y.block - x.block));
}

export interface Standing {
  player: Address;
  score: number;
  stars: number;
  runs: number;
}

/** Score = sum of each player's best payout per chapter, as the contract scores it. */
export function standings(runs: SettledRun[]): Standing[] {
  const best = new Map<Address, Map<number, { payout: number; stars: number }>>();
  const count = new Map<Address, number>();
  for (const r of runs) {
    const p = best.get(r.player) ?? new Map();
    const b = p.get(r.chapter) ?? { payout: 0, stars: 0 };
    p.set(r.chapter, { payout: Math.max(b.payout, r.payout), stars: Math.max(b.stars, r.stars) });
    best.set(r.player, p);
    count.set(r.player, (count.get(r.player) ?? 0) + 1);
  }
  return [...best]
    .map(([player, ch]) => ({ player, score: [...ch.values()].reduce((a, b) => a + b.payout, 0), stars: [...ch.values()].reduce((a, b) => a + b.stars, 0), runs: count.get(player) ?? 0 }))
    .sort((a, b) => b.score - a.score || b.stars - a.stars);
}

export const isNobody = (seat: number) => seat === NOBODY;
export const txLink = (tx: Hex) => `https://sepolia.etherscan.io/tx/${tx}`;
export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
