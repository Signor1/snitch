import { create } from "zustand";

/** Whether the intro film is playing. The world and the music follow it. */
export const useFilm = create<{ playing: boolean; play(): void; stop(): void }>((set) => ({
  playing: false,
  play: () => set({ playing: true }),
  stop: () => set({ playing: false }),
}));
