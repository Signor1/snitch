import clsx from "clsx";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import type { GameKind } from "../game/mission";
import { useSnitch } from "../game/store";

/** score is 0..100. `easy` = plans bought, `skilled` = the right specialist is on the job. */
interface GameProps {
  easy: boolean;
  skilled: boolean;
  done(score: number): void;
}

const rand = (n: number) => Math.floor(Math.random() * n);

function useClock(seconds: number, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const l = seconds - (performance.now() - t0) / 1000;
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        end.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [seconds]);
  return Math.max(0, left);
}

function Frame({ title, how, left, total, children }: { title: string; how: string; left: number; total: number; children: React.ReactNode }) {
  return (
    <div className="panel w-full max-w-xl rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-cyan">{title}</p>
        <span className={clsx("num rounded-full border px-2.5 py-0.5 text-sm", left < 4 ? "border-heat text-heat" : "border-line text-mist")}>{left.toFixed(1)}s</span>
      </div>
      <p className="mt-1 text-sm text-mist-dim">{how}</p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-cyan" style={{ width: `${(left / total) * 100}%` }} />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Safe: listen for the click on each number. */
function Dial({ easy, skilled, done }: GameProps) {
  const total = skilled ? 30 : 24;
  const combo = useMemo(() => [5 + rand(90), 5 + rand(90), 5 + rand(90)], []);
  const tol = skilled ? 3 : 2;
  const [n, setN] = useState(0);
  const [locked, setLocked] = useState(0);
  const [wrong, setWrong] = useState(false);
  const finish = useCallback((k: number, left: number) => done(Math.round((k / 3) * (0.7 + (0.3 * left) / total) * 100)), [done, total]);
  const left = useClock(total, () => finish(locked, 0));
  const target = combo[locked];
  const dist = Math.min(Math.abs(n - target), 100 - Math.abs(n - target));
  const near = Math.max(0, 1 - dist / 25);
  const on = dist <= tol;
  const last = useRef(n);
  useEffect(() => {
    if (n === last.current) return;
    last.current = n;
    if (on) {
      audio.click();
      haptics.tick();
    }
  }, [n, on]);
  const turn = (d: number) => setN((x) => (x + d + 100) % 100);
  const lock = () => {
    if (on) {
      audio.select();
      const k = locked + 1;
      setLocked(k);
      if (k >= 3) finish(3, left);
    } else {
      audio.error();
      setWrong(true);
      setTimeout(() => setWrong(false), 400);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") turn(e.shiftKey ? 5 : 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") turn(e.shiftKey ? -5 : -1);
      else if (e.key === " " || e.key === "Enter") lock();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const angle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  return (
    <Frame title="Crack the safe" how={easy ? "The plans give you the numbers. Turn to each one and lock it." : "Turn the dial. When the needle jumps and you hear the click, lock the number. Arrow keys work too."} left={left} total={total}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <svg
          ref={ref}
          viewBox="-110 -110 220 220"
          className={clsx("h-56 w-56 touch-none select-none", wrong && "animate-[shake_0.3s]")}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            drag.current = angle(e);
          }}
          onPointerMove={(e) => {
            if (drag.current === null) return;
            const a = angle(e);
            let d = a - drag.current;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            const steps = Math.round((d / (2 * Math.PI)) * 100);
            if (steps) {
              turn(steps);
              drag.current = a;
            }
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => turn(e.deltaY > 0 ? 1 : -1)}
        >
          <circle r="104" fill="#16181c" stroke="#3a3d44" strokeWidth="4" />
          <g transform={`rotate(${-n * 3.6})`}>
            <circle r="92" fill="url(#steel)" />
            {[...Array(100)].map((_, i) => (
              <line key={i} x1="0" y1={-90} x2="0" y2={i % 10 ? -84 : -78} stroke="#d9dce2" strokeWidth={i % 10 ? 1 : 2} transform={`rotate(${i * 3.6})`} />
            ))}
            {[...Array(10)].map((_, i) => (
              <text key={i} x="0" y="-64" fill="#e8eaee" fontSize="12" textAnchor="middle" transform={`rotate(${i * 36})`}>
                {i * 10}
              </text>
            ))}
            <circle r="26" fill="#2a2d33" stroke="#9aa0a8" />
          </g>
          <path d="M0 -108 L-7 -96 L7 -96 Z" fill={on ? "#00e5ff" : "#ff2d6f"} />
          <defs>
            <radialGradient id="steel">
              <stop offset="0" stopColor="#5a5f68" />
              <stop offset="1" stopColor="#2b2e34" />
            </radialGradient>
          </defs>
        </svg>
        <div className="flex flex-col items-center gap-3">
          <p className="num text-4xl text-mist">{String(n).padStart(2, "0")}</p>
          <div className="flex h-12 items-end gap-1" aria-label="How close you are">
            {[...Array(8)].map((_, i) => (
              <span key={i} className={clsx("w-2.5 rounded-sm transition-colors", near * 8 > i ? (on ? "bg-cyan" : "bg-violet") : "bg-line")} style={{ height: `${20 + i * 10}%` }} />
            ))}
          </div>
          <div className="flex gap-2">
            {combo.map((c, i) => (
              <span key={i} className={clsx("num rounded-lg border px-2.5 py-1 text-sm", i < locked ? "border-cyan text-cyan" : "border-line text-mist-faint")}>
                {i < locked || easy ? String(c).padStart(2, "0") : "··"}
              </span>
            ))}
          </div>
          <button onClick={lock} className="h-11 rounded-full bg-cyan px-6 font-semibold text-ink">
            Lock number
          </button>
        </div>
      </div>
    </Frame>
  );
}

/** Display cases: smash three, two are alarmed. */
function Smash({ easy, skilled, done }: GameProps) {
  const total = 12;
  const wired = useMemo(() => {
    const s = new Set<number>();
    while (s.size < 2) s.add(rand(6));
    return s;
  }, []);
  const [hit, setHit] = useState<number[]>([]);
  const [blink, setBlink] = useState(false);
  const score = (h: number[]) => Math.round((h.filter((i) => !wired.has(i)).length / 3) * 100 * (h.some((i) => wired.has(i)) ? 0.5 : 1));
  const left = useClock(total, () => done(score(hit)));
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), skilled ? 600 : 220);
    }, 1800);
    return () => clearInterval(id);
  }, [skilled]);
  const smash = (i: number) => {
    if (hit.includes(i) || hit.length >= 3) return;
    const h = [...hit, i];
    setHit(h);
    if (wired.has(i)) {
      audio.heat();
      haptics.stamp();
    } else {
      audio.shutter();
      audio.cash(2);
    }
    if (h.length >= 3) setTimeout(() => done(score(h)), 500);
  };
  return (
    <Frame title="Smash the cases" how={easy ? "The plans mark the two wired cases. Smash the other three." : "Smash three. Two are wired to the alarm: watch for a red light blinking on the lock."} left={left} total={total}>
      <div className="grid grid-cols-3 gap-2.5">
        {[...Array(6)].map((_, i) => {
          const w = wired.has(i);
          const done_ = hit.includes(i);
          return (
            <button key={i} onClick={() => smash(i)} className={clsx("relative h-24 rounded-xl border-2 transition-colors", done_ ? (w ? "border-heat bg-heat/20" : "border-cyan/40 bg-ink/40") : "border-[#9fc4e8]/40 bg-gradient-to-b from-[#9fc4e8]/15 to-[#3a2616]/60 hover:border-cyan")}>
              {!done_ && <span className="absolute inset-x-4 bottom-4 h-1.5 rounded-full bg-[#e2b84e]/80 shadow-[0_0_10px_#e2b84e]" />}
              {done_ && <span className="display-soft text-sm">{w ? "ALARM" : "Cleared"}</span>}
              <span className={clsx("absolute top-2 right-2 h-2 w-2 rounded-full", w && (easy || blink) ? "bg-[#ff3030] shadow-[0_0_8px_#ff3030]" : "bg-[#3dff8a]/40")} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-mist-dim">{hit.length}/3 smashed</p>
    </Frame>
  );
}

/** Card table: grab the stacks before time runs out. */
function Sweep({ easy, skilled, done }: GameProps) {
  const total = 10;
  const life = (easy ? 1.6 : 1.15) + (skilled ? 0.35 : 0);
  const [stacks, setStacks] = useState<{ id: number; x: number; y: number; at: number }[]>([]);
  const [got, setGot] = useState(0);
  const spawned = useRef(0);
  const left = useClock(total, () => done(Math.min(100, Math.round((got / Math.max(1, spawned.current)) * 110))));
  useEffect(() => {
    let k = 0;
    const id = setInterval(() => {
      spawned.current++;
      const s = { id: k++, x: 8 + rand(80), y: 10 + rand(72), at: performance.now() };
      setStacks((xs) => [...xs.filter((x) => performance.now() - x.at < life * 1000), s]);
    }, 520);
    return () => clearInterval(id);
  }, [life]);
  const now = performance.now();
  return (
    <Frame title="Sweep the table" how="Grab every stack of cash before it's gone. Fast hands." left={left} total={total}>
      <div className="relative h-60 overflow-hidden rounded-[50%] border-8 border-[#3a2412] bg-[radial-gradient(circle,#1f5a3a,#0f2f1e)]">
        {stacks
          .filter((s) => now - s.at < life * 1000)
          .map((s) => (
            <motion.button
              key={s.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onPointerDown={() => {
                setStacks((xs) => xs.filter((x) => x.id !== s.id));
                setGot((g) => g + 1);
                audio.cash(1);
                haptics.tick();
              }}
              className="absolute h-10 w-14 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#cfe3c9]/50 bg-[#7d9a82] shadow-[0_4px_0_#4f6a55]"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              aria-label="Cash"
            >
              <span className="num text-xs text-[#132a1c]">$</span>
            </motion.button>
          ))}
      </div>
      <p className="mt-3 text-center text-sm text-mist-dim">{got} stacks</p>
    </Frame>
  );
}

/** Vault: watch the code, then repeat it. */
function Code({ easy, skilled, done }: GameProps) {
  const len = 5;
  const code = useMemo(() => [...Array(len)].map(() => 1 + rand(9)), []);
  const [show, setShow] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState<number[]>([]);
  const [tries, setTries] = useState(skilled ? 2 : 1);
  const total = 20;
  const best = useRef(0);
  const left = useClock(total, () => done(best.current));
  const replay = useCallback(() => {
    setEntering(false);
    setTyped([]);
    const step = easy ? 900 : 620;
    code.forEach((d, i) => {
      setTimeout(() => {
        setShow(d);
        audio.click();
      }, 500 + i * step);
      setTimeout(() => setShow(null), 500 + i * step + step * 0.7);
    });
    setTimeout(() => setEntering(true), 500 + code.length * step);
  }, [code, easy]);
  useEffect(() => replay(), [replay]);
  const press = (d: number) => {
    if (!entering) return;
    audio.type();
    const t = [...typed, d];
    setTyped(t);
    if (t.length < len) return;
    const right = t.filter((x, i) => x === code[i]).length;
    best.current = Math.max(best.current, Math.round((right / len) * 100));
    if (right === len) {
      audio.badge();
      done(100);
    } else if (tries > 1) {
      audio.error();
      setTries(tries - 1);
      replay();
    } else {
      audio.error();
      done(best.current);
    }
  };
  return (
    <Frame title="Open the vault" how={skilled ? "Your hacker caught the code twice. Watch the keypad, then type it back. Two tries." : "Watch the keypad light up, then type the code back. One try."} left={left} total={total}>
      <div className="flex flex-col items-center">
        <div className="num mb-3 flex h-10 gap-2">
          {[...Array(len)].map((_, i) => (
            <span key={i} className={clsx("grid w-8 place-items-center rounded-md border text-lg", i < typed.length ? "border-cyan text-cyan" : "border-line text-mist-faint")}>
              {i < typed.length ? typed[i] : "·"}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(d)} disabled={!entering} className={clsx("num h-14 w-14 rounded-xl border text-xl transition-colors", show === d ? "border-cyan bg-cyan text-ink shadow-[0_0_24px_#00e5ff]" : "border-line bg-ink/60 text-mist enabled:hover:border-cyan")}>
              {d}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-mist-dim">{entering ? "Your turn." : "Watch…"}</p>
      </div>
    </Frame>
  );
}

const GAMES: Record<GameKind, (p: GameProps) => React.ReactNode> = { dial: Dial, smash: Smash, sweep: Sweep, code: Code };

export function HandsOn() {
  const prompt = useSnitch((s) => s.prompt);
  const answer = useSnitch((s) => s.answer);
  if (prompt?.kind !== "game") return null;
  const G = GAMES[prompt.game];
  return (
    <motion.div key={prompt.at} className="overlay pointer-events-auto z-30 bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-xl">
        <G easy={prompt.easy} skilled={prompt.skilled} done={(n) => answer(n, prompt.at)} />
        {prompt.skilled && <p className="mt-2 text-center text-xs text-cyan">The right person is on this: it's easier.</p>}
      </motion.div>
    </motion.div>
  );
}
