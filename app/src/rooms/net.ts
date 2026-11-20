// Practice rooms use a BroadcastChannel, so only tabs in this browser can join.
// In practice the host's tab holds the secrets; on Sepolia they live in SnitchRooms.sol.

export type Msg =
  | { k: "hello"; from: string; name: string }
  | { k: "lobby"; from: string; host: string; hostName: string; chapter: number; difficulty: number; seats: (Seat | null)[]; started: boolean }
  | { k: "take"; from: string; name: string; seat: number }
  | { k: "leave"; from: string }
  | { k: "role"; from: string; to: string; snitch: boolean }
  | { k: "ask"; from: string; job: number; name: string; seats: number[]; until: number }
  /** The host only reads it if the seat is the snitch. */
  | { k: "word"; from: string; job: number; seat: number; talk: boolean }
  | { k: "feed"; from: string; tone: "good" | "bad" | "info"; title: string; body: string }
  | { k: "end"; from: string; snitch: number; snitchWon: boolean; payout: number };

export interface Seat {
  id: string;
  name: string;
}

export interface Net {
  send(m: Msg): void;
  close(): void;
}

export function connect(room: string, on: (m: Msg) => void): Net {
  const ch = new BroadcastChannel("snitch-room-" + room);
  ch.onmessage = (e) => on(e.data as Msg);
  return { send: (m) => ch.postMessage(m), close: () => ch.close() };
}

/** Stable per tab, different in every tab. */
export const me = (() => {
  try {
    const k = "snitch:tab";
    const v = sessionStorage.getItem(k) ?? Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(k, v);
    return v;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
})();

export const newRoomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
