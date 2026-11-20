import { CLOSE_MS, OPEN_MS, useCurtain } from "../fx/curtain";

/** Hides camera cuts. Sits above the 3D world, below the HUD. */
export function Curtain() {
  const shut = useCurtain((s) => s.shut);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] bg-ink"
      style={{ opacity: shut, transition: `opacity ${shut ? CLOSE_MS : OPEN_MS}ms ${shut ? "cubic-bezier(0.4,0,1,1)" : "cubic-bezier(0.22,1,0.36,1)"}` }}
    />
  );
}
