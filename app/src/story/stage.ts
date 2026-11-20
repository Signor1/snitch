import { create } from "zustand";

/** Seat of the current speaker, for the camera to follow. */
export const useStage = create<{ speaker?: number; setSpeaker(s?: number): void }>((set) => ({
  setSpeaker: (speaker) => set({ speaker }),
}));
