import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Ritual, TopBar } from "../components/ui";
import { audio } from "../fx/audio";
import { CHAPTERS, MODES, castOf } from "../game/data";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { useRoom } from "../rooms/store";
import { PotPanel } from "../rooms/PotPanel";

export default function Room() {
  const code = (useParams().code ?? "").toUpperCase();
  const nav = useNavigate();
  const r = useRoom();
  useSceneAudio("city");
  const name = (() => {
    try {
      return localStorage.getItem("snitch:friendName") ?? "";
    } catch {
      return "";
    }
  })();

  // Arriving by link: join as a guest. The host's tab already has the room.
  useEffect(() => {
    if (r.code === code) return;
    // Chain rooms show wallets, so only practice rooms need a name.
    if (!name && !/^\d+$/.test(code)) return void nav("/rooms");
    r.joinRoom(code, name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const chapter = CHAPTERS.find((c) => c.id === r.chapter);
  const cast = chapter ? castOf(chapter) : [];
  const link = `${location.origin}/room/${code}`;

  if (!r.host && r.started && r.mySeat !== undefined) return <FriendView />;

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 bg-ink/80" />
      <TopBar />
      <main className="pointer-events-auto relative mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
        <p className="eyebrow text-violet">Room {code}</p>
        <h1 className="display neon-violet mt-2 text-4xl text-mist sm:text-5xl">{r.host ? "Your table" : r.hostName ? `${r.hostName}'s table` : "Finding the table…"}</h1>
        {chapter && (
          <p className="mt-2 text-mist-dim">
            Chapter {chapter.id} · {chapter.name} · {MODES[r.difficulty]?.name}. {r.host ? "Friends take seats; empty seats are played by the computer." : "Pick a seat. You'll play that member of the crew."}
          </p>
        )}

        {r.host && (
          <div className="panel mt-5 flex flex-wrap items-center gap-3 rounded-2xl p-4">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-mist-faint">Invite</p>
              <p className="num truncate text-lg text-cyan">{code}</p>
              <p className="truncate text-xs text-mist-dim">{link}</p>
            </div>
            <Button
              kind="mist"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                audio.select();
              }}
            >
              Copy link
            </Button>
          </div>
        )}

        {r.chain && (
          <p className="mt-3 text-xs text-mist-faint">
            On Sepolia. {r.host ? "Friends open the link on their own phone and tap a seat. It's gasless: no wallet or ETH needed." : "Your seat is held by a game wallet in this browser. It's gasless: no ETH needed."}
          </p>
        )}
        {r.working && (
          <div className="mt-4 flex justify-center">
            <Ritual phase="sending" label={r.working} />
          </div>
        )}
        {r.error && <p className="mt-3 text-sm text-heat">{r.error}</p>}

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {cast.map((m, i) => {
            const seat = r.seats[i];
            const mine = !r.host && r.mySeat === i;
            return (
              <li key={i}>
                <button
                  disabled={r.host || r.started || (!!seat && !mine) || !!r.working || (r.chain && r.mySeat !== undefined)}
                  onClick={() => r.take(i)}
                  className={clsx("flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors", mine ? "border-cyan bg-cyan/10" : seat ? "border-violet/60 bg-amethyst/25" : "border-line bg-ink/60 enabled:hover:border-cyan")}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-sm text-mist">{m.name[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="display-soft block text-mist">{m.name}</span>
                    <span className="block truncate text-xs text-mist-dim">{m.role}</span>
                  </span>
                  <span className={clsx("eyebrow shrink-0", seat ? "text-cyan" : "text-mist-faint")}>{mine ? "You" : seat ? seat.name : "Computer"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <PotPanel />

        {r.host ? (
          <Button kind="cyan" size="lg" className="mt-6 w-full" onClick={() => nav(`/run/${r.chapter}`)}>
            {r.started ? "Back to the table" : `Start the run (${r.seats.filter(Boolean).length} ${r.seats.filter(Boolean).length === 1 ? "friend" : "friends"})`}
          </Button>
        ) : (
          <p className="mt-6 text-center text-sm text-mist-dim">{r.mySeat === undefined ? "Tap a seat to sit down." : r.started ? "The run has started." : "Seated. Waiting for the boss to start."}</p>
        )}
        <Button kind="ghost" className="mt-3 w-full" onClick={() => (r.close(), nav("/rooms"))}>
          Leave the room
        </Button>
      </main>
    </div>
  );
}

function FriendView() {
  const r = useRoom();
  const nav = useNavigate();
  const chapter = CHAPTERS.find((c) => c.id === r.chapter)!;
  const me = castOf(chapter)[r.mySeat!];
  const [peek, setPeek] = useState(false);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!r.ask) return;
    const id = setInterval(() => setLeft(Math.max(0, Math.round((r.ask!.until - Date.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [r.ask]);

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none fixed inset-0 bg-ink/85" />
      <TopBar />
      <main className="pointer-events-auto relative mx-auto w-full max-w-md px-5 pb-16">
        <p className="eyebrow text-violet">
          {r.hostName}'s crew · Chapter {chapter.id}
        </p>
        <h1 className="display mt-1 text-4xl text-mist">You are {me.name}.</h1>
        <p className="text-sm text-mist-dim">{me.role}. {me.line}</p>

        {/* hold to reveal, so people nearby can't see it */}
        <button
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onKeyDown={(e) => e.key === " " && setPeek(true)}
          onKeyUp={() => setPeek(false)}
          className={clsx("mt-5 w-full select-none rounded-3xl border p-6 text-left transition-colors", peek ? (r.snitch ? "border-heat bg-heat/15" : "border-cyan bg-cyan/10") : "border-line bg-ink/70")}
        >
          <p className="eyebrow text-mist-faint">Your role · press and hold</p>
          {peek && r.snitch === undefined ? (
            <p className="display-soft mt-2 text-xl text-mist-dim">Decrypting your role, for your eyes only…</p>
          ) : peek ? (
            r.snitch ? (
              <>
                <p className="display mt-2 text-3xl text-heat">You are the snitch.</p>
                <p className="mt-2 text-sm text-mist">Hale is paying you. When you're sent on a job, you can tip off the police. Do it too often and they'll catch you. Win: get the crew raided, or never get caught while they stay poor.</p>
              </>
            ) : (
              <>
                <p className="display mt-2 text-3xl text-cyan">You are loyal.</p>
                <p className="mt-2 text-sm text-mist">Somebody at this table isn't. Watch the jobs, tell the boss who you suspect. Win: the crew gets rich.</p>
              </>
            )
          ) : (
            <p className="display-soft mt-2 text-2xl text-mist-dim">● ● ● ● ●</p>
          )}
        </button>

        <AnimatePresence>
          {r.ask && (
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="panel mt-4 rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-cyan">You're on the job · {r.ask.name}</p>
                <span className={clsx("num rounded-full border px-2.5 py-0.5 text-sm", left < 6 ? "border-heat text-heat" : "border-line text-mist")}>{left}s</span>
              </div>
              <p className="display-soft mt-2 text-xl text-mist">Seal your word.</p>
              <p className="mt-1 text-sm text-mist-dim">Everyone on the team seals one. Only the snitch's counts, and nobody can tell whose it was. Hold the card above if you need to check who you are.</p>
              {r.working ? (
                <div className="mt-4 flex justify-center">
                  <Ritual phase="sealing" label={r.working} />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Button kind="heat" onClick={() => r.seal(true)}>
                    Talk
                  </Button>
                  <Button kind="mist" onClick={() => r.seal(false)}>
                    Stay quiet
                  </Button>
                </div>
              )}
              {r.error && <p className="mt-3 text-sm text-heat">{r.error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <PotPanel />
        {r.end && (
          <div className={clsx("panel mt-4 rounded-3xl p-5 text-center", r.end.snitchWon ? "!border-heat/60" : "!border-cyan/60")}>
            <p className="eyebrow text-mist-faint">It's over</p>
            <p className="display mt-1 text-3xl text-mist">{r.end.snitch < 0 ? "No snitch at the table." : `The snitch was ${castOf(chapter)[r.end.snitch]?.name}${r.end.snitch === r.mySeat ? " (you)" : ""}.`}</p>
            <p className={clsx("display-soft mt-2 text-xl", r.end.snitchWon ? "text-heat" : "text-cyan")}>{r.end.snitchWon ? "The snitch wins." : "The crew wins."}</p>
          </div>
        )}

        <p className="eyebrow mt-6 text-mist-faint">On the street</p>
        <ul className="mt-2 space-y-2">
          {r.feed.length === 0 && <li className="text-sm text-mist-dim">Nothing yet. The boss is planning.</li>}
          {r.feed.map((f) => (
            <li key={f.at + f.title} className={clsx("rounded-2xl border px-4 py-3", f.tone === "bad" ? "border-heat/50" : f.tone === "good" ? "border-cyan/40" : "border-line")}>
              <p className={clsx("display-soft", f.tone === "bad" ? "text-heat" : f.tone === "good" ? "text-cyan" : "text-mist")}>{f.title}</p>
              <p className="text-sm text-mist-dim">{f.body}</p>
            </li>
          ))}
        </ul>
        <Button kind="ghost" className="mt-6 w-full" onClick={() => (r.close(), nav("/"))}>
          Leave
        </Button>
      </main>
    </div>
  );
}
