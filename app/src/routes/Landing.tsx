import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Logo, Mark } from "../brand/Mark";
import { CHAPTERS } from "../game/data";
import { DAILY_ID, ENDLESS_ID, bestOf, dayNumber } from "../game/modes";
import { money } from "../components/ui";
import { useSnitch } from "../game/store";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { SettingsScreen } from "../settings/SettingsPanel";
import { useProfile } from "../settings/store";
import { HowTo } from "../shell/HowTo";
import { Hints, Menu, type MenuItem } from "../shell/Menu";
import { useFilm } from "../shell/film";

export default function Landing() {
  const nav = useNavigate();
  const me = useProfile((s) => s.identity);
  const progress = useSnitch((s) => s.progress);
  const played = Object.keys(progress).length > 0;
  const resume = CHAPTERS.find((c) => c.open && !(progress[c.id]?.stars ?? 0));
  const day = dayNumber();
  const daily = bestOf(DAILY_ID, day);
  const endless = bestOf(ENDLESS_ID);
  const [panel, setPanel] = useState<"settings" | "how" | "credits" | null>(null);
  useSceneAudio("title");
  const film = useFilm((s) => s.playing);

  const intro: MenuItem = { label: "Watch the intro", hint: "The night Ash went down, ten years ago. Under a minute.", run: () => useFilm.getState().play() };
  const items: MenuItem[] = [
    ...(me && played ? [{ label: "Continue", hint: resume ? `Pick up the story: ${resume.prologue ? "the Prologue" : `Chapter ${resume.id}`}, ${resume.name}.` : `Back to the city as ${me.boss}, boss of ${me.crew}.`, run: () => nav(resume ? `/run/${resume.id}` : "/city") }] : []),
    { label: me ? "Chapters" : "New game", hint: me ? "Replay any chapter you've opened, on any difficulty." : "Ten years ago, someone sold out your partner. Start the story.", run: () => nav(me ? "/city" : "/identity") },
    ...(played ? [] : [intro]),
    ...(played ? [{ label: "Evidence board", hint: "Every file you've found. Who is Echo?", run: () => nav("/evidence") }] : []),
    { label: "Play with friends", hint: "Open a room and invite friends to sit in your crew. One of them might be the snitch.", run: () => nav("/rooms") },
    { label: `Daily job #${day}`, hint: `Four jobs, the same table and the same snitch for everyone today.${daily ? ` Your best today: ${money(daily.payout)}.` : ""}`, run: () => nav(`/run/${DAILY_ID}`) },
    { label: "Endless night", hint: `Twenty jobs, each bigger than the last. Know when to walk.${endless ? ` Your best: ${money(endless.payout)} after ${endless.jobs} jobs.` : ""}`, run: () => nav(`/run/${ENDLESS_ID}`) },
    { label: "The record", hint: "The leaderboard, written by the contract after it checks every proof.", run: () => nav("/record") },
    { label: "The shop", hint: "The Boss Pass, paid in a confidential dollar, and cosmetics you earn with stars.", run: () => nav("/shop") },
    ...(me ? [{ label: "Identity", hint: "Change your name, your look and your crew.", run: () => nav("/identity") }] : []),
    ...(played ? [intro] : []),
    { label: "How to play", hint: "The whole game in four lines.", run: () => setPanel("how") },
    { label: "Settings", hint: "Sound, graphics, difficulty and accessibility.", run: () => setPanel("settings") },
    { label: "About the game", hint: "What SNITCH is, and why nobody can cheat, not even us.", run: () => nav("/about") },
    { label: "Credits", hint: "The people and free libraries behind this game.", run: () => setPanel("credits") },
  ];

  if (film) return null;
  return (
    <div className="pointer-events-none relative flex min-h-dvh flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(90deg,rgb(5_5_5/0.94)_0%,rgb(5_5_5/0.62)_40%,transparent_70%)] max-lg:bg-[linear-gradient(0deg,rgb(5_5_5/0.96)_0%,rgb(5_5_5/0.6)_60%,rgb(5_5_5/0.3)_100%)]" />
      <div className="fixed inset-x-0 top-0 h-[5dvh] bg-ink" />
      <div className="fixed inset-x-0 bottom-0 h-[5dvh] bg-ink" />

      <main className="pointer-events-auto relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-6 pt-[8dvh] pb-[8dvh] sm:px-10 lg:justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
          <div className="flex items-center gap-3">
            <Mark size={56} />
            <Logo height={64} />
          </div>
          <p className="display-soft mt-2 text-lg text-mist-dim">
            Someone at your table is <span className="neon-cyan text-cyan">talking.</span>
          </p>
        </motion.div>

        {panel === null && (
          <div className="mt-7">
            <Menu items={items} />
          </div>
        )}
        {panel === "how" && <HowTo onBack={() => setPanel(null)} />}
        {panel === "credits" && (
          <div className="panel mt-8 max-w-lg rounded-3xl p-6">
            <h2 className="display-soft text-2xl text-mist">Credits</h2>
            <p className="mt-3 text-sm text-mist-dim">Built for the Zama Developer Program, Season 5. Encryption by the Zama Protocol (FHEVM) on Ethereum Sepolia.</p>
            <p className="mt-2 text-sm text-mist-dim">People: MakeHuman / MPFB (CC0) on Quaternius animations (CC0). Props, textures and night sky: Poly Haven (CC0). Vehicles: Gazebo / Open Robotics (CC0). Music and sound are generated live in your browser. Full list in CREDITS.md.</p>
            <p className="mt-4 text-[11px] text-mist-faint">This project is not audited, endorsed or operated by Zama. Use at your own risk.</p>
            <button onClick={() => setPanel(null)} className="mt-5 h-10 rounded-full border border-line px-5 text-sm text-mist hover:border-violet">
              Back
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <Hints back={panel !== null} />
        </div>
      </main>
      {panel === "settings" && <SettingsScreen onClose={() => setPanel(null)} />}
    </div>
  );
}
