import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { audio } from "../fx/audio";
import { useBoot } from "./Boot";
import { useFilm } from "./film";

export interface MenuItem {
  label: string;
  hint: string;
  tag?: string;
  disabled?: boolean;
  run(): void;
}

/** Arrow keys or W/S to move, Enter to choose. */
export function Menu({ items, onBack, size = "lg" }: { items: MenuItem[]; onBack?: () => void; size?: "lg" | "md" }) {
  const first = items.findIndex((i) => !i.disabled);
  const [at, setAt] = useState(first);

  useEffect(() => {
    const step = (d: number) => {
      setAt((cur) => {
        let n = cur;
        for (let k = 0; k < items.length; k++) {
          n = (n + d + items.length) % items.length;
          if (!items[n].disabled) break;
        }
        if (n !== cur) audio.select();
        return n;
      });
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      // the key that leaves the title screen (and starts the intro) must not also pick a menu item
      if (!useBoot.getState().started || useFilm.getState().playing) return;
      if (e.key === "ArrowDown" || e.key === "s") step(1);
      else if (e.key === "ArrowUp" || e.key === "w") step(-1);
      else if (e.key === "Enter") {
        audio.click();
        items[at]?.run();
      } else if (e.key === "Escape") onBack?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [items, at, onBack]);

  return (
    <div>
      <ul role="menu" className={size === "lg" ? "space-y-1" : "space-y-0.5"}>
        {items.map((it, i) => {
          const on = i === at;
          return (
            <motion.li key={it.label} role="none" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}>
              <button
                role="menuitem"
                disabled={it.disabled}
                onMouseEnter={() => {
                  if (!it.disabled && !on) {
                    audio.select();
                    setAt(i);
                  }
                }}
                onFocus={() => !it.disabled && setAt(i)}
                onClick={() => {
                  audio.unlock();
                  audio.click();
                  it.run();
                }}
                className={clsx("group flex w-full items-center gap-3 text-left transition-[padding,color] duration-200", "py-1", it.disabled ? "cursor-not-allowed text-mist-faint" : on ? "pl-3 text-cyan" : "text-mist-dim hover:text-mist")}
              >
                <span className={clsx("h-[2px] rounded-full bg-cyan transition-[width] duration-200", on && !it.disabled ? "w-8 shadow-[0_0_10px_#00e5ff]" : "w-0")} />
                <span className={clsx("display", size === "lg" ? "text-[1.7rem] sm:text-[2.1rem]" : "text-2xl sm:text-3xl", on && !it.disabled && "neon-cyan")}>{it.label}</span>
                {it.tag && <span className="eyebrow rounded-full border border-line px-2 py-0.5 text-mist-faint">{it.tag}</span>}
              </button>
            </motion.li>
          );
        })}
      </ul>
      <p className="mt-5 min-h-6 max-w-md text-sm text-mist-dim" aria-live="polite">
        {items[at]?.hint}
      </p>
    </div>
  );
}

export function Hints({ back }: { back?: boolean }) {
  const K = ({ children }: { children: React.ReactNode }) => <kbd className="num rounded border border-line bg-ink/70 px-1.5 py-0.5 text-[11px] text-mist">{children}</kbd>;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-mist-faint max-sm:hidden">
      <span>
        <K>↑</K> <K>↓</K> Move
      </span>
      <span>
        <K>Enter</K> Select
      </span>
      {back && (
        <span>
          <K>Esc</K> Back
        </span>
      )}
    </div>
  );
}
