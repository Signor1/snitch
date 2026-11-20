import type { ZamaSDK } from "@zama-fhe/sdk";
import type { Abi, Address, Hex } from "viem";
import { MODES, type Difficulty } from "../game/data";
import type { JobOdds, TableEngine } from "../game/engine";
import snitchAbi from "./abi/Snitch.json";
import addresses from "./abi/addresses.json";
import { bool, decryptFor, moverFor, num, retry, revealFor, sdkFor, within, type OnPhase } from "./tx";
import type { Wallet } from "./wallet";

export const SNITCH = (addresses as Record<string, { Snitch: Address }>)["11155111"].Snitch;

/** stage: 1 playing, 2 walked away, 3 settled. */
export interface LiveRun {
  run: number;
  chapter: number;
  difficulty: number;
  job: number;
  favors: number;
  out: number;
  wiretapUsed: boolean;
  stage: number;
}

const abi = snitchAbi as Abi;

export type ChainTable = TableEngine & {
  sdk: ZamaSDK;
  live(): Promise<LiveRun>;
  /** Restores bag and heat after a reload. */
  resume(r: LiveRun, on: OnPhase): Promise<{ bag: number; heat: number }>;
};

export function createChainTable(w: Wallet): ChainTable {
  const sdk = sdkFor(w);
  const mover = moverFor(w);
  let difficulty: Difficulty = 0;
  let hasSkimmer = false;
  // Last decrypted bag, used to work out what each job added.
  let bagNow = 0;

  async function send(fn: string, args: unknown[], on: OnPhase) {
    const r = await mover.send(SNITCH, abi, fn, args, on);
    seen = r.blockNumber;
    return r;
  }

  // Reads are pinned to our last receipt's block because public RPCs lag.
  let seen: bigint | undefined;
  const view = <T,>(functionName: string, args: unknown[]) =>
    within(retry(() => w.pub.readContract({ address: SNITCH, abi, functionName, args, ...(seen ? { blockNumber: seen } : {}) }) as Promise<T>), 60_000, "Reading the table");

  // [bag, heat, tipped, seen, tapped, right, heard]
  const handles = () => view<Hex[]>("handlesOf", [w.address]);
  const read = (hs: Hex[], on: OnPhase) => decryptFor(w, SNITCH, hs, on);

  return {
    sdk,
    async live() {
      const r = await view<unknown[]>("runOf", [w.address]);
      return { run: num(r[0]), chapter: num(r[1]), difficulty: num(r[2]), job: num(r[3]), favors: num(r[4]), out: num(r[5]), wiretapUsed: bool(r[6]), stage: num(r[7]) };
    },
    async resume(r, on) {
      difficulty = r.difficulty as Difficulty;
      const c = (await w.pub.readContract({ address: SNITCH, abi, functionName: "chapterOf", args: [r.chapter] })) as { hasSkimmer: boolean };
      hasSkimmer = c.hasSkimmer;
      const [bag, heat] = await handles();
      const get = await read([bag, heat], on);
      bagNow = num(get(bag));
      return { bag: bagNow, heat: num(get(heat)) };
    },
    async start(chapter, d, on) {
      difficulty = d;
      const c = (await w.pub.readContract({ address: SNITCH, abi, functionName: "chapterOf", args: [chapter] })) as { hasSkimmer: boolean };
      hasSkimmer = c.hasSkimmer;
      bagNow = 0;
      await send("start", [chapter, d], on);
    },
    async runJob(team, odds: JobOdds, on) {
      const mask = team.reduce((m, i) => m | (1 << i), 0);
      // Share is in basis points (see mission.ts).
      await send("runJob", [mask, odds.rung ?? 1, odds.bps ?? 10000], on);
      const [bag, heat, tipped] = await handles();
      const get = await read([bag, heat, tipped], on);
      const now = num(get(bag));
      const gained = Math.max(0, now - bagNow);
      bagNow = now;
      return { tipped: bool(get(tipped)), bag: now, heat: num(get(heat)), gained };
    },
    async rumour(member, on) {
      await send("rumour", [member], on);
      const h = (await handles())[6];
      return { seen: bool((await read([h], on))(h)) };
    },
    async tail(member, on) {
      await send("tail", [member], on);
      const h = (await handles())[3];
      return { seen: bool((await read([h], on))(h)) };
    },
    async wiretap(a, b, on) {
      await send("wiretap", [(1 << a) | (1 << b)], on);
      const h = (await handles())[4];
      return { hit: bool((await read([h], on))(h)) };
    },
    async accuse(member, on) {
      await send("accuse", [member], on);
      const [bag, heat, , , , right] = await handles();
      const get = await read([bag, heat, right], on);
      bagNow = num(get(bag));
      return { right: bool(get(right)), bag: bagNow, heat: num(get(heat)) };
    },
    async walkAway(on) {
      // Idempotent: skip steps that already went through.
      const stage = Number((await view<unknown[]>("runOf", [w.address]))[7]);
      if (stage === 1) await send("walkAway", [], on);
      // settle verifies the KMS proof on-chain.
      const hs = await view<Hex[]>("revealHandles", [w.address]);
      on("decrypting");
      const pub = await revealFor(w, hs);
      if (stage !== 3) await send("settle", [w.address, pub.abiEncodedClearValues, pub.decryptionProof], on);
      // Reveal order: payout, first snitch, heat, skimmer, second snitch (255 = nobody).
      const [payout, first, heat, skimmer, second] = hs.map((h) => num(pub.clearValues[h]));
      const NOBODY = 255;
      // On a raid the payout is 0, so report the bag that was lost.
      const bag = payout > 0 ? Math.floor(payout / MODES[difficulty].mult) : bagNow;
      const snitches = [first, second].filter((x) => x !== NOBODY);
      return { snitch: first === NOBODY ? -1 : first, snitches, skimmer: hasSkimmer && skimmer !== NOBODY ? skimmer : null, bag, heat, payout };
    },
  };
}
