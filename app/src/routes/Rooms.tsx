import clsx from "clsx";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Ritual, TopBar } from "../components/ui";
import { sponsorshipReady } from "../chain/sponsored";
import { ROOM_CHAPTERS as ON_CHAIN } from "../game/store";
import { audio } from "../fx/audio";
import { CHAPTERS, MODES, type Difficulty } from "../game/data";
import { useSnitch } from "../game/store";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { newRoomCode } from "../rooms/net";
import { useRoom } from "../rooms/store";
import { useProfile } from "../settings/store";

export default function Rooms() {
  const nav = useNavigate();
  const me = useProfile((s) => s.identity);
  const progress = useSnitch((s) => s.progress);
  const hostRoom = useRoom((s) => s.hostRoom);
  const hostChainRoom = useRoom((s) => s.hostChainRoom);
  const working = useRoom((s) => s.working);
  const error = useRoom((s) => s.error);
  // Practice rooms only sync between tabs of this browser; chain rooms work across devices.
  const [where, setWhere] = useState<"chain" | "practice">(sponsorshipReady() ? "chain" : "practice");
  const [chapter, setChapter] = useState(1);
  const [difficulty, setDifficulty] = useState(1);
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("snitch:friendName") ?? "";
    } catch {
      return "";
    }
  });
  useSceneAudio("city");
  const open = CHAPTERS.filter((c) => c.open && !c.prologue && (c.id <= 1 || (progress[c.id - 1]?.stars ?? 0) > 0) && (where === "practice" || ON_CHAIN.includes(c.id)));

  const host = async () => {
    audio.select();
    if (where === "chain") {
      const c = await hostChainRoom(chapter, difficulty as Difficulty);
      if (c) nav(`/room/${c}`);
      return;
    }
    const c = newRoomCode();
    hostRoom(c, me?.boss || "The boss", chapter, difficulty);
    nav(`/room/${c}`);
  };
  const join = () => {
    const c = code.trim().toUpperCase();
    const chainCode = /^\d+$/.test(c);
    if (!c || (!chainCode && (c.length < 4 || !name.trim()))) return audio.error();
    try {
      localStorage.setItem("snitch:friendName", name.trim());
    } catch {
      /* private mode */
    }
    audio.select();
    nav(`/room/${c}`);
  };

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgb(5_5_5/0.95)_0%,rgb(5_5_5/0.82)_55%,rgb(5_5_5/0.4)_100%)]" />
      <TopBar />
      <main className="pointer-events-auto relative mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <p className="eyebrow text-violet">Play with friends</p>
        <h1 className="display neon-violet mt-2 text-[2.7rem] text-mist sm:text-6xl">One of your friends is talking.</h1>
        <p className="mt-3 max-w-2xl text-mist-dim">
          You are the boss. Your friends take seats in the crew; the computer fills the rest. One seat, maybe a friend's, is secretly the snitch. On every job, everyone on the team seals a word. Only the snitch's word counts. Nobody can tell whose it was.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel rounded-3xl p-6">
            <p className="eyebrow text-cyan">Open a room</p>
            <p className="mt-1 text-sm text-mist-dim">You run the table. Share the code; friends join from their own phone or browser.</p>
            <p className="eyebrow mt-5 text-mist-faint">Where</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["chain", "On Sepolia", "Friends join from their own phones. Roles and words are encrypted on-chain. No gas, no setup."],
                  ["practice", "Practice room", "Tabs of this browser. Try it alone, or with a friend at your desk."],
                ] as const
              ).map(([id, t, b]) => (
                <button key={id} onClick={() => (setWhere(id), id === "chain" && !ON_CHAIN.includes(chapter) && setChapter(1))} className={clsx("rounded-xl border px-3 py-2.5 text-left", where === id ? "border-cyan bg-cyan/10" : "border-line bg-ink/50 hover:border-violet")}>
                  <span className="display-soft block text-mist">{t}</span>
                  <span className="block text-xs text-mist-dim">{b}</span>
                </button>
              ))}
            </div>
            <p className="eyebrow mt-5 text-mist-faint">Chapter</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {open.map((c) => (
                <button key={c.id} onClick={() => setChapter(c.id)} className={clsx("rounded-xl border px-3 py-2.5 text-left", chapter === c.id ? "border-cyan bg-cyan/10" : "border-line bg-ink/50 hover:border-violet")}>
                  <span className="display-soft block text-mist">
                    {c.id}. {c.name}
                  </span>
                  <span className="block text-xs text-mist-dim">{c.cast.length} seats · {c.jobs.length} jobs</span>
                </button>
              ))}
            </div>
            <p className="eyebrow mt-5 text-mist-faint">Difficulty</p>
            <div className="mt-2 inline-flex rounded-full border border-line bg-ink/60 p-1">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => setDifficulty(m.id)} className={clsx("h-9 rounded-full px-4 text-sm font-semibold", difficulty === m.id ? "bg-mist text-ink" : "text-mist-dim hover:text-mist")}>
                  {m.name}
                </button>
              ))}
            </div>
            {working ? (
              <div className="mt-6 flex min-h-14 items-center justify-center">
                <Ritual phase="sending" label={working} />
              </div>
            ) : (
              <Button kind="cyan" size="lg" className="mt-6 w-full" onClick={() => void host()}>
                Open the room
              </Button>
            )}
            {error && <p className="mt-3 text-sm text-heat">{error}</p>}
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="panel rounded-3xl p-6">
            <p className="eyebrow text-violet">Join a room</p>
            <p className="mt-1 text-sm text-mist-dim">Got a code from a friend? Sit at their table. Codes that are only numbers are rooms on Sepolia: you don't need a name or a wallet for those.</p>
            <label className="mt-5 block">
              <span className="eyebrow text-mist-faint">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} placeholder="Kelvin" className="mt-2 h-12 w-full rounded-xl border border-line bg-ink/70 px-4 text-mist outline-none focus:border-cyan" />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow text-mist-faint">Room code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder="AB12C" className="num mt-2 h-12 w-full rounded-xl border border-line bg-ink/70 px-4 text-lg tracking-[0.3em] text-mist outline-none focus:border-cyan" />
            </label>
            <Button kind="mist" size="lg" className="mt-6 w-full" onClick={join}>
              Take a seat
            </Button>
          </motion.section>
        </div>
        <p className="mt-6 text-xs text-mist-faint">
          On Sepolia the room lives in a contract: the snitch's seat is drawn with encrypted randomness, each friend can decrypt only their own role, and every sealed word stays encrypted. Rooms play chapters 1 to 3 on-chain; the later chapters' twists (two snitches, the recruit) are solo for now.
        </p>
      </main>
    </div>
  );
}
