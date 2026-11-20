import { create } from "zustand";

/** Shared fade for scene cuts: close to black, move the camera, open. */
interface Curtain {
  /** 0 = open, 1 = black. */
  shut: number;
  close(): void;
  open(): void;
}

export const CLOSE_MS = 280;
export const OPEN_MS = 650;

export const useCurtain = create<Curtain>((set) => ({
  shut: 0,
  close: () => set({ shut: 1 }),
  open: () => set({ shut: 0 }),
}));
