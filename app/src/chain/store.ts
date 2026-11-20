import type { Abi } from "viem";
import { create } from "zustand";
import { balance, gameWallet, ownWallet, type Kind, type Wallet } from "./wallet";

export type Mode = "practice" | "chain";

interface ChainState {
  mode: Mode;
  wallet?: Wallet;
  balance?: string;
  // index = chapter - 1. On-chain a chapter unlocks with a star on the previous one.
  stars: number[];
  connecting: boolean;
  error?: string;
  setMode(m: Mode): void;
  connect(kind: Kind): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}

const saved = (): Mode => {
  try {
    return localStorage.getItem("snitch:mode") === "chain" ? "chain" : "practice";
  } catch {
    return "practice";
  }
};

export const useChain = create<ChainState>((set, get) => ({
  mode: saved(),
  connecting: false,
  stars: [],
  setMode(mode) {
    try {
      localStorage.setItem("snitch:mode", mode);
    } catch {
      /* private mode */
    }
    set({ mode, error: undefined });
  },
  async connect(kind) {
    set({ connecting: true, error: undefined });
    try {
      const wallet = kind === "game" ? gameWallet() : await ownWallet();
      try {
        localStorage.setItem("snitch:walletKind", kind);
      } catch {
        /* private mode */
      }
      set({ wallet, connecting: false });
      await get().refresh();
    } catch (e) {
      set({ connecting: false, error: (e as Error).message });
    }
  },
  async refresh() {
    const w = get().wallet;
    if (!w) return;
    try {
      set({ balance: await balance(w) });
    } catch {
      /* offline: keep the last balance */
    }
    try {
      const { SNITCH } = await import("./engine");
      const abi = (await import("./abi/Snitch.json")).default as Abi;
      const [stars] = (await w.pub.readContract({ address: SNITCH, abi, functionName: "bestOf", args: [w.address] })) as [readonly number[]];
      set({ stars: stars.map(Number) });
    } catch {
      /* offline: keep what we had */
    }
  },
  disconnect() {
    set({ wallet: undefined, balance: undefined, stars: [] });
  },
}));

// Only the game wallet reconnects on load; an own wallet would prompt.
export function resumeWallet() {
  try {
    if (localStorage.getItem("snitch:walletKind") === "game" && saved() === "chain") void useChain.getState().connect("game");
  } catch {
    /* private mode */
  }
}
