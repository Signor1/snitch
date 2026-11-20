import { decodeEventLog, type Abi, type Address, type Hex } from "viem";
import { MODES, type Difficulty } from "../game/data";
import type { JobOdds, TableEngine } from "../game/engine";
import roomsAbi from "./abi/SnitchRooms.json";
import addresses from "./abi/addresses.json";
import { bool, decryptFor, moverFor, num, retry, revealFor, sdkFor, within, type OnPhase } from "./tx";
import type { Wallet } from "./wallet";

// SnitchRooms.sol. Only the snitch's sealed word counts, and no one can tell whose it was.
export const ROOMS = (addresses as Record<string, { SnitchRooms: Address }>)["11155111"].SnitchRooms;
const abi = roomsAbi as Abi;

export const ROOM = { None: 0, Open: 1, Playing: 2, Ended: 3, Settled: 4 } as const;
// Must match the contract: after this the boss may resolve without missing words.
export const SEAL_TIMEOUT_S = 600;

export interface RoomView {
  host: Address;
  chapter: number;
  difficulty: number;
  stage: number;
  crew: number;
  job: number;
  seats: Address[];
  humans: number;
  out: number;
  favors: number;
  wiretapUsed: boolean;
  pending: boolean;
  team: number;
  rung: number;
  takeBps: number;
  sealedMask: number;
  proposedAt: number;
}

const NOBODY = "0x0000000000000000000000000000000000000000";
export const isSeat = (a?: string) => !!a && a.toLowerCase() !== NOBODY;
export const maskOf = (seats: number[]) => seats.reduce((m, i) => m | (1 << i), 0);
export const seatsOf = (mask: number) => Array.from({ length: 16 }, (_, i) => i).filter((i) => mask & (1 << i));

// Chain codes are the room id; practice codes always contain a letter.
export const isChainCode = (code: string) => /^\d+$/.test(code);

export async function readRoom(w: Wallet, id: number, blockNumber?: bigint): Promise<RoomView> {
  const v = (await within(retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "roomOf", args: [BigInt(id)], ...(blockNumber ? { blockNumber } : {}) })), 30_000, "Reading the room")) as Record<string, unknown>;
  return {
    host: v.host as Address,
    chapter: num(v.chapter),
    difficulty: num(v.difficulty),
    stage: num(v.stage),
    crew: num(v.crew),
    job: num(v.job),
    seats: [...(v.seats as Address[])],
    humans: num(v.humans),
    out: num(v.out),
    favors: num(v.favors),
    wiretapUsed: bool(v.wiretapUsed),
    pending: bool(v.pending),
    team: num(v.team),
    rung: num(v.rung),
    takeBps: num(v.takeBps),
    sealedMask: num(v.sealedMask),
    proposedAt: num(v.proposedAt),
  };
}

const send = (w: Wallet, fn: string, args: unknown[], on: OnPhase) => moverFor(w).send(ROOMS, abi, fn, args, on);
const quiet: OnPhase = () => {};

/** Returns the room id, which is also the invite code. */
export async function openRoom(w: Wallet, chapter: number, difficulty: Difficulty, on: OnPhase = quiet): Promise<number> {
  const r = await send(w, "createRoom", [chapter, difficulty], on);
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ROOMS.toLowerCase()) continue;
    try {
      const e = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (e.eventName === "RoomCreated") return Number((e.args as unknown as { id: bigint }).id);
    } catch {
      /* another event */
    }
  }
  throw new Error("The room was opened but its number didn't come back. Try again.");
}

export const takeSeat = (w: Wallet, id: number, seat: number, on: OnPhase = quiet) => send(w, "join", [BigInt(id), seat], on);
export const leaveSeat = (w: Wallet, id: number, on: OnPhase = quiet) => send(w, "leave", [BigInt(id)], on);

/** True if this player is the snitch. Only they can decrypt it. */
export async function myRole(w: Wallet, id: number): Promise<boolean | undefined> {
  const h = (await retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "myRole", args: [BigInt(id)], account: w.address }))) as Hex;
  const get = await decryptFor(w, ROOMS, [h], quiet);
  const v = get(h);
  return v === undefined ? undefined : bool(v);
}

/** talk = true tips the police. */
export async function sealWord(w: Wallet, id: number, talk: boolean, on: OnPhase = quiet) {
  on("sealing");
  const enc = await within(sdkFor(w).encrypt({ values: [{ type: "ebool", value: talk }], contractAddress: ROOMS, userAddress: w.address }), 120_000, "Sealing your word");
  await send(w, "seal", [BigInt(id), enc.encryptedValues[0], enc.inputProof], on);
}

/** Values every player in the room may decrypt. */
export async function shared(w: Wallet, id: number) {
  const [bag, heat, tipped, , , right] = (await retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "handlesOf", args: [BigInt(id)] }))) as Hex[];
  const get = await decryptFor(w, ROOMS, [bag, heat, tipped, right], quiet);
  return { bag: num(get(bag)), heat: num(get(heat)), tipped: get(tipped) === undefined ? undefined : bool(get(tipped)), right: get(right) === undefined ? undefined : bool(get(right)) };
}

export async function resultOf(w: Wallet, id: number) {
  const r = (await retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "resultOf", args: [BigInt(id)] }))) as Record<string, unknown>;
  return { payout: num(r.payout), snitch: num(r.snitch), heat: num(r.heat), snitchWon: bool(r.snitchWon) };
}

/** Host-side table: propose a job, wait for the team's sealed words, resolve. */
export function createRoomTable(w: Wallet, id: number, onWait?: (waitingOn: number[]) => void, picked?: { bag: number; difficulty: number }): TableEngine {
  const room = BigInt(id);
  let difficulty = (picked?.difficulty ?? 0) as Difficulty;
  let bagNow = picked?.bag ?? 0;
  // Reads are pinned to our last receipt's block because public RPCs lag.
  let seen: bigint | undefined;
  const go = async (fn: string, args: unknown[], on: OnPhase) => {
    const r = await send(w, fn, [room, ...args], on);
    seen = r.blockNumber;
  };
  const handles = () => within(retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "handlesOf", args: [room], ...(seen ? { blockNumber: seen } : {}) }) as Promise<Hex[]>), 60_000, "Reading the table");
  const read = (hs: Hex[], on: OnPhase) => decryptFor(w, ROOMS, hs, on);

  // The contract lets the boss go on without missing words after SEAL_TIMEOUT_S.
  async function words(team: number) {
    for (;;) {
      const r = await readRoom(w, id);
      const missing = seatsOf(team & r.humans & ~r.sealedMask);
      onWait?.(missing);
      if (!missing.length || Date.now() / 1000 > r.proposedAt + SEAL_TIMEOUT_S + 20) return;
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }

  return {
    async start(_chapter, d, on) {
      const r = await readRoom(w, id);
      difficulty = r.difficulty as Difficulty;
      void d;
      if (r.stage === ROOM.Open) {
        await go("startRoom", [], on);
        bagNow = 0;
      }
    },
    async runJob(team, odds: JobOdds, on) {
      const mask = maskOf(team);
      const r = await readRoom(w, id, seen);
      if (!r.pending) await go("propose", [mask, odds.rung ?? 1, odds.bps ?? 10000], on);
      if (mask & r.humans) {
        on("sealing");
        await words(mask);
        onWait?.([]);
      }
      await go("resolve", [], on);
      const [bag, heat, tipped] = await handles();
      const get = await read([bag, heat, tipped], on);
      const now = num(get(bag));
      const gained = Math.max(0, now - bagNow);
      bagNow = now;
      return { tipped: bool(get(tipped)), bag: now, heat: num(get(heat)), gained };
    },
    async tail(member, on) {
      await go("tail", [member], on);
      const h = (await handles())[3];
      return { seen: bool((await read([h], on))(h)) };
    },
    async wiretap(a, b, on) {
      await go("wiretap", [maskOf([a, b])], on);
      const h = (await handles())[4];
      return { hit: bool((await read([h], on))(h)) };
    },
    async accuse(member, on) {
      await go("accuse", [member], on);
      const [bag, heat, , , , right] = await handles();
      const get = await read([bag, heat, right], on);
      bagNow = num(get(bag));
      return { right: bool(get(right)), bag: bagNow, heat: num(get(heat)) };
    },
    async walkAway(on) {
      // Idempotent: skip steps that already went through.
      const r = await readRoom(w, id, seen);
      if (r.stage === ROOM.Playing) await go("walkAway", [], on);
      const hs = (await within(retry(() => w.pub.readContract({ address: ROOMS, abi, functionName: "revealHandles", args: [room], ...(seen ? { blockNumber: seen } : {}) })), 60_000, "Reading the reveal")) as Hex[];
      on("decrypting");
      const pub = await revealFor(w, hs);
      if (r.stage !== ROOM.Settled) await go("settle", [pub.abiEncodedClearValues, pub.decryptionProof], on);
      const [payout, snitch, heat] = hs.map((h) => num(pub.clearValues[h]));
      const bag = payout > 0 ? Math.floor(payout / MODES[difficulty].mult) : bagNow;
      return { snitch, snitches: [snitch], skimmer: null, bag, heat, payout };
    },
  };
}
