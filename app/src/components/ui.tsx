import clsx from "clsx";
import { motion } from "motion/react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { Wordmark } from "../brand/Mark";
import { audio } from "../fx/audio";
import { haptics } from "../fx/haptics";
import { SettingsButton } from "../settings/SettingsPanel";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "cyan" | "mist" | "ghost" | "heat"; size?: "md" | "lg" };

export function Button({ kind = "mist", size = "md", className, onClick, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        audio.unlock();
        audio.click();
        haptics.tap();
        onClick?.(e);
      }}
      className={clsx(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[transform,background,box-shadow,color,border-color] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35",
        size === "lg" ? "h-14 px-8 text-base" : "h-11 px-5 text-sm",
        kind === "cyan" && "bg-cyan text-ink shadow-[0_0_0_1px_rgb(0_229_255/0.5),0_0_34px_-6px_rgb(0_229_255/0.75)] hover:bg-cyan-hot",
        kind === "mist" && "bg-mist text-ink hover:bg-white",
        kind === "ghost" && "border border-line bg-ink/50 text-mist hover:border-violet hover:bg-amethyst/30",
        kind === "heat" && "border border-heat/60 bg-heat/10 text-heat hover:bg-heat/20",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MuteButton() {
  const [muted, setMuted] = useState(audio.isMuted());
  return (
    <button
      onClick={() => {
        audio.setMuted(!muted);
        setMuted(!muted);
        if (muted) {
          audio.unlock();
          audio.click();
        }
      }}
      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-ink/50 text-mist-dim hover:text-mist"
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      aria-pressed={!muted}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
        {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
      </svg>
    </button>
  );
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="pointer-events-auto relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-8">
      <Link to="/" aria-label="SNITCH home">
        <Wordmark />
      </Link>
      <div className="flex items-center gap-2">
        {right ?? <SettingsButton />}
        <MuteButton />
      </div>
    </header>
  );
}

const PHASE_COPY: Record<string, string> = {
  signing: "Confirming",
  sending: "Sending the order",
  sealing: "Working in the dark",
  decrypting: "Word is coming back, for your eyes only",
};

export function Ritual({ phase, label }: { phase?: string; label?: string }) {
  if (!phase || phase === "done") return null;
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <span className="text-sm text-mist">{label ?? PHASE_COPY[phase]}</span>
      <span className="relative h-[2px] w-44 overflow-hidden rounded-full bg-line">
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-cyan shadow-[0_0_12px_rgb(0_229_255)]"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
    </div>
  );
}


export function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
            fill={i < n ? "#00e5ff" : "none"}
            stroke={i < n ? "#00e5ff" : "#5f5673"}
            strokeWidth="1.6"
          />
        </svg>
      ))}
    </span>
  );
}

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
