import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { fill } from "../game/actions";
import { useSnitch } from "../game/store";
import { useProfile } from "../settings/store";
import { NAMES, SCENES, type Line, type Speaker } from "./script";
import { FILES } from "./evidence";
import { useStage } from "./stage";

const TYPE_MS = 24;
const ease = [0.22, 1, 0.36, 1] as const;

function useTyped(text: string, on = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!on) return;
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), TYPE_MS);
    return () => clearInterval(id);
  }, [text, on]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

const TONE: Partial<Record<Speaker, string>> = { echo: "#ff2d6f", hale: "#6fa8ff", ash: "#ffc98a", juno: "#9d5cff" };

function Subtitle({ who, text, onDone, register }: { who?: Speaker; text: string; onDone(): void; register(f: () => boolean): void }) {
  const t = useTyped(text);
  useEffect(() => register(() => (t.done ? false : (t.finish(), true))), [t, register]);
  return (
    <motion.div key={text} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }} className="mx-auto w-full max-w-3xl text-center">
      {who && (
        <p className="eyebrow mb-2" style={{ color: TONE[who] ?? "#00e5ff" }}>
          {NAMES[who]}
        </p>
      )}
      <p className={clsx("text-xl leading-snug text-mist sm:text-[1.65rem]", !who && "italic text-mist/90")} style={{ textShadow: "0 2px 18px rgb(0 0 0 / 0.9)" }}>
        {t.shown}
        <span className="opacity-0">{text.slice(t.shown.length)}</span>
      </p>
      <button onClick={onDone} className={clsx("eyebrow mt-4 text-mist-faint transition-opacity", t.done ? "opacity-100" : "opacity-0")} aria-label="Next line">
        Tap to continue ▸
      </button>
    </motion.div>
  );
}

function TitleCard({ text, sub, onDone }: { text: string; sub?: string; onDone(): void }) {
  useEffect(() => {
    audio.whoosh();
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div className="fixed inset-0 grid place-items-center bg-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} onClick={onDone}>
      <div className="text-center">
        <motion.h2 initial={{ letterSpacing: "0.5em", opacity: 0 }} animate={{ letterSpacing: "0.14em", opacity: 1 }} transition={{ duration: 2.4, ease }} className="display neon-violet text-4xl text-mist sm:text-7xl">
          {text}
        </motion.h2>
        {sub && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1 }} className="eyebrow mt-5 text-cyan">
            {sub}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

function PhoneThread({ who, texts, onDone }: { who: Speaker; texts: string[]; onDone(): void }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    setTyping(true);
    const a = setTimeout(() => {
      setTyping(false);
      setShown((n) => Math.max(n, texts.length));
      audio.phone();
      haptics.stamp();
    }, 1100);
    return () => clearTimeout(a);
  }, [texts.length]);
  const unknown = who === "echo";
  return (
    <motion.div initial={{ x: 120, opacity: 0, rotate: 4 }} animate={{ x: 0, opacity: 1, rotate: 0 }} exit={{ x: 120, opacity: 0 }} transition={{ type: "spring", stiffness: 160, damping: 20 }} className="pointer-events-auto mx-auto w-[min(22rem,92vw)] rounded-[2.2rem] border border-white/10 bg-[#0b0a10] p-2.5 shadow-[0_30px_80px_-20px_#000]">
      <div className="rounded-[1.8rem] bg-gradient-to-b from-[#16121f] to-[#0c0b11] px-4 pt-3 pb-4">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/10" />
        <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
          <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-ink" style={{ background: TONE[who] ?? "#00e5ff" }}>
            {unknown ? "?" : NAMES[who][0]}
          </span>
          <div>
            <p className="text-sm font-semibold text-mist">{unknown ? "Unknown number" : NAMES[who]}</p>
            <p className="text-[11px] text-mist-faint">{unknown ? "No caller ID" : "Mobile"}</p>
          </div>
        </div>
        <div className="mt-3 flex min-h-28 flex-col gap-2">
          {texts.slice(0, shown).map((t, i) => (
            <motion.p key={i} initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-[15px] leading-snug text-mist">
              {t}
            </motion.p>
          ))}
          {typing && (
            <span className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-3" aria-label="Typing">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-mist-dim" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.18 }} />
              ))}
            </span>
          )}
        </div>
        <button onClick={onDone} disabled={typing} className="eyebrow mt-4 w-full text-center text-mist-faint disabled:opacity-0">
          Tap to continue ▸
        </button>
      </div>
    </motion.div>
  );
}

function Call({ who, lines, onDone, register }: { who: Speaker; lines: string[]; onDone(): void; register(f: () => boolean): void }) {
  const [answered, setAnswered] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (answered) return;
    audio.phone();
    const id = setInterval(() => (audio.phone(), haptics.stamp()), 1600);
    return () => clearInterval(id);
  }, [answered]);
  const next = useCallback(() => (i + 1 < lines.length ? setI(i + 1) : onDone()), [i, lines.length, onDone]);
  if (!answered)
    return (
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto mx-auto flex w-[min(22rem,92vw)] flex-col items-center rounded-[2.2rem] border border-white/10 bg-[#0b0a10]/95 px-6 py-8 text-center shadow-[0_30px_80px_-20px_#000]">
        <p className="eyebrow text-mist-faint">Incoming call</p>
        <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="mt-5 grid h-20 w-20 place-items-center rounded-full text-3xl font-bold text-ink" style={{ background: TONE[who] ?? "#00e5ff" }}>
          {NAMES[who][0]}
        </motion.span>
        <p className="display-soft mt-4 text-2xl text-mist">{NAMES[who]}</p>
        <button
          autoFocus
          onClick={() => {
            audio.click();
            setAnswered(true);
          }}
          className="mt-7 h-14 w-full rounded-full bg-[#2bd36b] text-base font-bold text-ink shadow-[0_0_30px_-6px_#2bd36b]"
        >
          Answer
        </button>
      </motion.div>
    );
  return (
    <div className="w-full">
      <p className="eyebrow mb-3 text-center" style={{ color: TONE[who] ?? "#00e5ff" }}>
        ☎ On the line · {NAMES[who]}
      </p>
      <AnimatePresence mode="wait">
        <Subtitle key={i} text={lines[i]} onDone={next} register={register} />
      </AnimatePresence>
    </div>
  );
}

function Photo({ caption, note, onDone }: { caption: string; note: string; onDone(): void }) {
  useEffect(() => audio.shutter(), []);
  const stamp = useMemo(() => {
    const d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 31);
    return `CAM 04 · ${d.toISOString().slice(0, 10)} 23:41:07`;
  }, []);
  return (
    <motion.div initial={{ scale: 0.86, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -2.5, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 140, damping: 16 }} className="pointer-events-auto mx-auto w-[min(26rem,90vw)] bg-[#e9e4d8] p-3 pb-5 shadow-[0_40px_90px_-20px_#000]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#1a1c1e]">
        {/* a figure by a gate under a lamp, from a high camera */}
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <radialGradient id="lamp" cx="62%" cy="18%" r="60%">
              <stop offset="0" stopColor="#b9b29a" stopOpacity="0.85" />
              <stop offset="1" stopColor="#1a1c1e" stopOpacity="0" />
            </radialGradient>
            <filter id="grain">
              <feTurbulence baseFrequency="0.9" numOctaves="2" />
              <feColorMatrix values="0 0 0 0 0.6  0 0 0 0 0.6  0 0 0 0 0.6  0 0 0 0.35 0" />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          <rect width="400" height="300" fill="url(#lamp)" />
          {[...Array(14)].map((_, i) => (
            <rect key={i} x={20 + i * 26} y="70" width="4" height="200" fill="#0d0e10" opacity="0.8" />
          ))}
          <rect x="20" y="66" width="360" height="6" fill="#0d0e10" />
          <ellipse cx="248" cy="272" rx="40" ry="7" fill="#000" opacity="0.5" />
          <path d="M236 270 L240 205 Q236 168 248 160 Q262 168 258 205 L262 270 Z" fill="#050506" />
          <circle cx="249" cy="150" r="12" fill="#050506" />
          <rect width="400" height="300" filter="url(#grain)" />
        </svg>
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgb(0_0_0/0.25)_50%)] bg-[length:100%_3px] mix-blend-multiply" />
        <p className="num absolute top-2 left-2 text-[11px] text-[#e6e0c9]/80">{stamp}</p>
        <p className="num absolute right-2 bottom-2 text-[11px] text-[#ff4040]/80">● REC</p>
      </div>
      <p className="mt-3 font-[cursive] text-[15px] leading-snug text-[#2a2620]">{caption}</p>
      <p className="mt-1 text-sm font-semibold text-[#9a1b1b]">{note}</p>
      <button onClick={onDone} className="eyebrow mt-3 w-full text-center text-[#6b6455]">
        Tap to continue ▸
      </button>
    </motion.div>
  );
}

export function ScenePlayer() {
  const scene = useSnitch((s) => s.scene);
  const crew = useSnitch((s) => s.crew);
  const memo = useSnitch((s) => s.memo);
  const done = useSnitch((s) => s.storyDone);
  const me = useProfile((s) => s.identity);
  const setSpeaker = useStage((s) => s.setSpeaker);
  const allFiles = useSnitch((s) => s.evidence.length >= FILES.length);
  const src = scene ? SCENES[scene.key] : undefined;
  const vars = useMemo(() => ({ boss: me?.boss || "boss", crew: me?.crew || "the crew", ...memo }), [me, memo]);

  // Choices splice their answer into the queue.
  const [queue, setQueue] = useState<Line[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    setQueue(src?.lines ?? []);
    setI(0);
  }, [src, scene?.at]);

  useEffect(() => {
    if (src) audio.setScene(src.mood === "title" ? "title" : src.mood);
  }, [src]);

  const line = queue[i];
  const thread = useMemo(() => {
    if (line?.t !== "text") return [];
    let j = i;
    while (j > 0 && queue[j - 1].t === "text" && (queue[j - 1] as { who: Speaker }).who === line.who) j--;
    const out: string[] = [];
    for (let k = j; k <= i; k++) out.push(fill((queue[k] as { text: string }).text, vars));
    return out;
  }, [line, i, queue, vars]);

  const finisher = useRef<() => boolean>(() => false);
  const register = useCallback((f: () => boolean) => void (finisher.current = f), []);
  const advance = useCallback(() => {
    finisher.current = () => false;
    if (i + 1 >= queue.length) {
      setSpeaker(undefined);
      done();
    } else setI(i + 1);
  }, [i, queue.length, done, setSpeaker]);

  useEffect(() => {
    if (line?.t === "say") {
      const seat = crew.findIndex((m) => m.key === line.who);
      setSpeaker(seat >= 0 ? seat : undefined);
      audio.type();
    } else setSpeaker(undefined);
  }, [line, crew, setSpeaker]);

  useEffect(() => {
    if (line?.t !== "ending") return;
    try {
      const seen = JSON.parse(localStorage.getItem("snitch:endings") ?? "[]") as string[];
      if (!seen.includes(line.id)) localStorage.setItem("snitch:endings", JSON.stringify([...seen, line.id]));
    } catch {
      /* private mode */
    }
    advance();
  }, [line, advance]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (line?.t === "choice" || line?.t === "call") return;
      e.preventDefault();
      if (!finisher.current()) advance();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [advance, line]);

  if (!scene || !src || !line) return null;
  const black = src.place === "black" || line.t === "title";

  return (
    <div className="pointer-events-auto fixed inset-0 z-40" onClick={() => line.t !== "choice" && line.t !== "call" && line.t !== "text" && line.t !== "photo" && (!finisher.current() ? advance() : null)}>
      <motion.div className="absolute inset-0 bg-ink" initial={false} animate={{ opacity: black ? 1 : 0.28 }} transition={{ duration: 0.9 }} />
      <motion.div className="absolute inset-x-0 top-0 bg-ink" initial={{ height: 0 }} animate={{ height: "11dvh" }} transition={{ duration: 0.8, ease }} />
      <motion.div className="absolute inset-x-0 bottom-0 bg-ink" initial={{ height: 0 }} animate={{ height: "11dvh" }} transition={{ duration: 0.8, ease }} />

      <button
        onClick={(e) => {
          e.stopPropagation();
          setSpeaker(undefined);
          done();
        }}
        className="eyebrow absolute top-[calc(11dvh+0.75rem)] right-5 z-10 rounded-full border border-line bg-ink/60 px-3 py-1.5 text-mist-dim hover:text-mist"
      >
        Skip scene
      </button>

      <AnimatePresence mode="wait">
        {line.t === "title" ? (
          <TitleCard key={i} text={fill(line.text, vars)} sub={line.sub && fill(line.sub, vars)} onDone={advance} />
        ) : (
          <motion.div key={line.t === "text" ? `thread-${line.who}-${i - thread.length + 1}` : i} className="absolute inset-x-0 bottom-[calc(11dvh+1.5rem)] flex justify-center px-5" onClick={(e) => (line.t === "text" || line.t === "photo") && e.stopPropagation()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {line.t === "say" && <Subtitle who={line.who} text={fill(line.text, vars)} onDone={advance} register={register} />}
            {line.t === "narr" && <Subtitle text={fill(line.text, vars)} onDone={advance} register={register} />}
            {line.t === "text" && <PhoneThread who={line.who} texts={thread} onDone={advance} />}
            {line.t === "call" && <Call who={line.who} lines={line.lines.map((l) => fill(l, vars))} onDone={advance} register={register} />}
            {line.t === "photo" && <Photo caption={fill(line.caption, vars)} note={fill(line.note, vars)} onDone={advance} />}
            {line.t === "choice" && (
              <div className="w-full max-w-xl text-center" onClick={(e) => e.stopPropagation()}>
                <p className="eyebrow mb-4 text-violet">{fill(line.prompt, vars)}</p>
                <div className="grid gap-2.5">
                  {line.options.filter((o) => !o.needsAllFiles || allFiles).map((o, k) => (
                    <motion.button
                      key={o.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + k * 0.12 }}
                      autoFocus={k === 0}
                      onClick={() => {
                        audio.select();
                        setQueue((q) => [...q.slice(0, i + 1), ...o.then, ...q.slice(i + 1)]);
                        setI(i + 1);
                      }}
                      className="panel rounded-2xl px-5 py-4 text-left text-lg text-mist transition-colors hover:border-cyan focus-visible:border-cyan"
                    >
                      <span className="mr-3 text-cyan">{k + 1}</span>
                      {/^["“]/.test(o.label) ? o.label : `“${o.label}”`}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
