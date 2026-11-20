import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { encodeFunctionData, keccak256, toFunctionSelector, type Abi, type Address, type Hex } from "viem";
import snitchAbiForErrors from "./abi/Snitch.json";
import roomsAbiForErrors from "./abi/SnitchRooms.json";
import passAbiForErrors from "./abi/SnitchPass.json";
import potsAbiForErrors from "./abi/SnitchPots.json";
import wardrobeAbiForErrors from "./abi/SnitchWardrobe.json";
import type { Phase } from "../game/engine";
import { sponsored, sponsorshipReady } from "./sponsored";
import type { Wallet } from "./wallet";

export type OnPhase = (p: Phase) => void;
export const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

// A mined receipt doesn't mean results are decryptable yet, and some nodes lag a block: retry.
export async function retry<T>(f: () => Promise<T>, tries = 6, gap = 1500): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, gap));
    }
  }
}

export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`${what} timed out: the network didn't answer`)), ms))]);
}

// Cached per wallet so the decryption permit is signed once.
const sdks = new Map<string, ZamaSDK>();
export function sdkFor(w: Wallet) {
  let sdk = sdks.get(w.address);
  if (!sdk) {
    sdk = new ZamaSDK(createConfig({ chains: [fheSepolia], publicClient: w.pub, walletClient: w.wallet, relayers: { [fheSepolia.id]: web() } }));
    sdks.set(w.address, sdk);
  }
  return sdk;
}

export interface Mover {
  send(to: Address, abi: Abi, fn: string, args: unknown[], on: OnPhase): Promise<{ blockNumber: bigint; logs: { address: Address; data: Hex; topics: Hex[] }[] }>;
}

// One mover per wallet so all contracts share one nonce counter.
const movers = new Map<string, Mover>();
export function moverFor(w: Wallet): Mover {
  const known = movers.get(w.address);
  if (known) return known;
  // Counted locally so a lagging RPC can't hand out a stale nonce.
  let nonce: number | undefined;

  // Idempotent: "already known" or "nonce too low" from a fallback RPC means it went through.
  async function sendRaw(to: Address, data: Hex): Promise<Hex> {
    const account = w.wallet.account!;
    const fresh = await w.pub.getTransactionCount({ address: w.address, blockTag: "pending" });
    nonce = Math.max(nonce ?? 0, fresh);
    const req = await w.wallet.prepareTransactionRequest({ account, chain: w.wallet.chain, to, data, nonce });
    const raw = await w.wallet.signTransaction(req as Parameters<typeof w.wallet.signTransaction>[0]);
    const hash = keccak256(raw);
    try {
      await w.pub.sendRawTransaction({ serializedTransaction: raw });
    } catch (e) {
      if (!/already known|known transaction|nonce too low|lower than the current nonce/i.test((e as Error).message)) throw e;
    }
    nonce += 1;
    return hash;
  }

  const mover: Mover = {
    async send(to, abi, fn, args, on) {
      on("signing");
      const data = encodeFunctionData({ abi, functionName: fn, args });
      const hash =
        w.kind === "game"
          ? sponsorshipReady()
            ? await (await sponsored(w.pub))({ to, data })
            : await sendRaw(to, data)
          : await w.wallet.writeContract({ address: to, abi, functionName: fn, args, account: w.wallet.account!, chain: w.wallet.chain });
      on("sending");
      const r = await w.pub.waitForTransactionReceipt({ hash, timeout: 150_000 });
      if (r.status !== "success") throw new Error(`${fn} failed on-chain`);
      on("sealing");
      return r as unknown as Awaited<ReturnType<Mover["send"]>>;
    },
  };
  movers.set(w.address, mover);
  return mover;
}

export async function decryptFor(w: Wallet, contract: Address, hs: Hex[], on: OnPhase) {
  on("decrypting");
  const live = [...new Set(hs.filter((h) => h && h !== ZERO))];
  const out = live.length ? await within(retry(() => sdkFor(w).decryption.decryptValues(live.map((encryptedValue) => ({ encryptedValue, contractAddress: contract }))), 15, 4000), 120_000, "Decryption") : {};
  return (h: Hex) => (h && h !== ZERO ? (out as Record<string, unknown>)[h] : undefined);
}

/** Public decryption: clear values plus the KMS proof `settle` checks. */
export const revealFor = (w: Wallet, hs: Hex[]) => within(retry(() => sdkFor(w).decryption.decryptPublicValues(hs), 15, 4000), 120_000, "The reveal");

export const num = (v: unknown) => Number(v ?? 0);
export const bool = (v: unknown) => v === true || v === 1n || v === 1;

// Bundlers often pass reverts on as a bare 4-byte selector, so match it against our ABIs' errors.
let errorNames: Map<string, string> | undefined;
export function revertName(e: unknown): string | undefined {
  const text = String((e as Error)?.message ?? e);
  errorNames ??= new Map(
    [snitchAbiForErrors, roomsAbiForErrors, passAbiForErrors, potsAbiForErrors, wardrobeAbiForErrors]
      .flat()
      .filter((x) => (x as { type: string }).type === "error")
      .map((x) => x as { name: string; inputs: { type: string }[] })
      .map((x) => [toFunctionSelector(`${x.name}(${x.inputs.map((i) => i.type).join(",")})`).toLowerCase(), x.name]),
  );
  for (const [sel, name] of errorNames) if (text.toLowerCase().includes(sel)) return name;
  for (const name of errorNames.values()) if (text.includes(name)) return name;
  return undefined;
}
