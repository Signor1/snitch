// 1200x630 is the size social sites use for previews.
export interface CardData {
  chapter: string;
  difficulty: string;
  title: string;
  payout: string;
  stars: number;
  snitch: string;
  onChain: boolean;
  link?: string;
}

const INK = "#050505";
const MIST = "#ece8f4";
const DIM = "#9a91ad";
const CYAN = "#00e5ff";
const VIOLET = "#9d5cff";
const HEAT = "#ff2d6f";

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = fill ? CYAN : "#5f5673";
  ctx.fillStyle = CYAN;
  if (fill) ctx.fill();
  ctx.stroke();
}

export async function drawCard(d: CardData): Promise<Blob> {
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d")!;
  const font = (w: number, size: number) => `${w} ${size}px "Archivo Variable", system-ui, sans-serif`;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, 1200, 630);
  const g = ctx.createRadialGradient(240, 80, 20, 240, 80, 700);
  g.addColorStop(0, "rgba(157,92,255,0.35)");
  g.addColorStop(1, "rgba(5,5,5,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = CYAN;
  ctx.fillRect(64, 560, 1072, 3);

  ctx.fillStyle = VIOLET;
  ctx.font = font(800, 26);
  ctx.fillText("SNITCH", 64, 92);
  ctx.fillStyle = DIM;
  ctx.font = font(600, 24);
  ctx.fillText(`${d.chapter} · ${d.difficulty}${d.onChain ? " · on Ethereum Sepolia" : ""}`, 64, 132);

  ctx.fillStyle = MIST;
  ctx.font = font(850, 92);
  ctx.fillText(d.title, 64, 250);
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 30;
  ctx.fillStyle = CYAN;
  ctx.font = font(800, 120);
  ctx.fillText(d.payout, 64, 390);
  ctx.shadowBlur = 0;

  for (let i = 0; i < 3; i++) star(ctx, 92 + i * 70, 460, 26, i < d.stars);

  ctx.fillStyle = HEAT;
  ctx.font = font(700, 30);
  ctx.fillText(d.snitch, 330, 472);

  ctx.fillStyle = DIM;
  ctx.font = font(600, 22);
  ctx.fillText(d.onChain ? "The snitch was sealed on-chain before the first move. Revealed with a proof." : "Someone at your table is talking.", 64, 605);

  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("canvas"))), "image/png"));
}

/** Native share sheet if it accepts files, otherwise download and copy the text. */
export async function shareCard(d: CardData): Promise<"shared" | "saved"> {
  const blob = await drawCard(d);
  const text = `${d.title} ${d.payout} on ${d.chapter} in SNITCH. ${d.snitch}.${d.link ? ` Check it: ${d.link}` : ""}`;
  const file = new File([blob], "snitch-run.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (x: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: "SNITCH" });
      return "shared";
    } catch {
      /* cancelled: fall through to saving */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "snitch-run.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await navigator.clipboard?.writeText(text).catch(() => {});
  return "saved";
}
