import { create } from "zustand";

/** Whether the intro film is playing. The world and the music follow it. */
export const useFilm = create<{ playing: boolean; empty: boolean; play(): void; stop(): void }>((set) => ({
  playing: false,
  /** "Ten years later": the hideout with nobody in it. */
  empty: false,
  play: () => set({ playing: true, empty: false }),
  stop: () => set({ playing: false, empty: false }),
}));
