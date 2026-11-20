// Procedural Web Audio, no samples. Nothing touches the AudioContext until `unlock()`
// runs from a user gesture; before that (or outside a browser) every call is a no-op.
//
//   scene voices -> scene {dry, rev, dly} -> music lowpass -> compressor -> master
//   sfx voices   -> sfx   {dry, rev, dly}                  -> compressor -> master

export type Scene =
  | "title"
  | "hideout"
  | "planning"
  | "job"
  | "police"
  | "clean"
  | "raid"
  | "reveal"
  | "win"
  | "lose";

interface Chan {
  dry: GainNode;
  rev: GainNode;
  dly: GainNode;
}

interface Live {
  name: Scene;
  def: SceneDef;
  ch: Chan;
  /** Looping sources to stop when the scene ends. */
  loops: AudioScheduledSourceNode[];
  /** Next 16th-note index and its context time. */
  step: number;
  next: number;
  /** Seconds per 16th note. */
  sd: number;
}

interface SceneDef {
  bpm: number;
  /** Master music lowpass target (Hz). */
  lp?: number;
  rain?: number;
  rainLp?: number;
  room?: number;
  vinyl?: number;
  step(L: Live, i: number, t: number): void;
}

const MUTE_KEY = "snitch:muted";
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const XFADE = 1.2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let comp: DynamicsCompressorNode | null = null;
let musicLp: BiquadFilterNode | null = null;
let reverbIn: GainNode | null = null;
let delayIn: GainNode | null = null;
let delayNode: DelayNode | null = null;
let sfx: Chan | null = null;
let white: AudioBuffer | null = null;
let brown: AudioBuffer | null = null;
let crackle: AudioBuffer | null = null;

let unlocked = false;
let volume = 0.8;
let muted = false;
let mutedLoaded = false;
let wanted: Scene = "title";
let live: Live | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let autoInstalled = false;
let lastType = 0;

const hasWindow = () => typeof window !== "undefined";
const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = Math.random;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;

function loadMuted(): boolean {
  if (!mutedLoaded) {
    mutedLoaded = true;
    try {
      muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}


function makeNoise(c: AudioContext, seconds: number, kind: "white" | "brown" | "crackle"): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  } else if (kind === "brown") {
    let y = 0;
    for (let i = 0; i < len; i++) {
      y = (y + 0.02 * (rnd() * 2 - 1)) / 1.02;
      d[i] = y * 3.5;
    }
    // Soften the loop seam.
    const edge = Math.floor(c.sampleRate * 0.05);
    for (let i = 0; i < edge; i++) {
      const k = i / edge;
      d[i] = (d[i] as number) * k;
      d[len - 1 - i] = (d[len - 1 - i] as number) * k;
    }
  } else {
    // Vinyl: hiss plus sparse pops.
    let pop = 0;
    for (let i = 0; i < len; i++) {
      if (rnd() < 0.00035) pop = (rnd() * 2 - 1) * (0.3 + rnd() * 0.7);
      d[i] = (rnd() * 2 - 1) * 0.015 + pop;
      pop *= 0.82;
    }
  }
  return buf;
}

function makeImpulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let chn = 0; chn < 2; chn++) {
    const d = buf.getChannelData(chn);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // The lowpass closes over time so the tail darkens.
      const coef = 0.85 - 0.65 * k;
      y += (rnd() * 2 - 1 - y) * coef;
      d[i] = y * Math.pow(1 - k, 2.8) * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}

function init(): AudioContext | null {
  if (ctx) return ctx;
  if (!hasWindow()) return null;
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    const c = new AC({ latencyHint: "interactive" });

    master = c.createGain();
    master.gain.value = loadMuted() ? 0 : volume;
    master.connect(c.destination);

    comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(master);

    musicLp = c.createBiquadFilter();
    musicLp.type = "lowpass";
    musicLp.frequency.value = 18000;
    musicLp.Q.value = 0.5;
    musicLp.connect(comp);

    const conv = c.createConvolver();
    conv.buffer = makeImpulse(c, 2.8);
    const revOut = c.createGain();
    revOut.gain.value = 0.55;
    reverbIn = c.createGain();
    reverbIn.connect(conv);
    conv.connect(revOut);
    revOut.connect(comp);

    delayNode = c.createDelay(1.5);
    delayNode.delayTime.value = 0.4;
    const fbLp = c.createBiquadFilter();
    fbLp.type = "lowpass";
    fbLp.frequency.value = 2200;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const dlyOut = c.createGain();
    dlyOut.gain.value = 0.8;
    const dlyRev = c.createGain();
    dlyRev.gain.value = 0.25;
    delayIn = c.createGain();
    delayIn.connect(delayNode);
    delayNode.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(delayNode);
    delayNode.connect(dlyOut);
    dlyOut.connect(comp);
    delayNode.connect(dlyRev);
    dlyRev.connect(reverbIn);

    white = makeNoise(c, 2, "white");
    brown = makeNoise(c, 3, "brown");
    crackle = makeNoise(c, 5, "crackle");

    ctx = c;
    sfx = makeChan(comp, 1);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return c;
  } catch {
    ctx = null;
    return null;
  }
}

function makeChan(dryDest: AudioNode, level: number): Chan {
  const c = ctx as AudioContext;
  const dry = c.createGain();
  const rev = c.createGain();
  const dly = c.createGain();
  dry.gain.value = level;
  rev.gain.value = level;
  dly.gain.value = level;
  dry.connect(dryDest);
  rev.connect(reverbIn as GainNode);
  dly.connect(delayIn as GainNode);
  return { dry, rev, dly };
}

function fadeChan(ch: Chan, to: number, t: number): void {
  for (const g of [ch.dry, ch.rev, ch.dly]) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(to, t, XFADE / 3.5);
  }
}


function panner(pan: number): AudioNode {
  const c = ctx as AudioContext;
  if (typeof c.createStereoPanner === "function") {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }
  return c.createGain();
}

function send(node: AudioNode, ch: Chan, rev = 0, dly = 0, pan = 0): void {
  const c = ctx as AudioContext;
  let n = node;
  if (pan !== 0) {
    n = panner(pan);
    node.connect(n);
  }
  n.connect(ch.dry);
  if (rev > 0) {
    const g = c.createGain();
    g.gain.value = rev;
    n.connect(g);
    g.connect(ch.rev);
  }
  if (dly > 0) {
    const g = c.createGain();
    g.gain.value = dly;
    n.connect(g);
    g.connect(ch.dly);
  }
}

function osc(type: OscillatorType, f: number, t: number, end: number, detune = 0): OscillatorNode {
  const o = (ctx as AudioContext).createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.value = detune;
  o.start(t);
  o.stop(end);
  return o;
}

function noiseSrc(t: number, end: number, buf: AudioBuffer | null = white): AudioBufferSourceNode {
  const s = (ctx as AudioContext).createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(t, rnd() * (buf ? buf.duration * 0.9 : 0));
  s.stop(end);
  return s;
}

function filt(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = (ctx as AudioContext).createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** Gain with a fast attack and exponential decay. */
function perc(t: number, peak: number, attack: number, decay: number): GainNode {
  const g = (ctx as AudioContext).createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}


function kick(ch: Chan, t: number, vel: number, f0 = 125, f1 = 42, dur = 0.34): void {
  const o = osc("sine", f0, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  const g = perc(t, vel, 0.003, dur);
  o.connect(g);
  send(g, ch, 0.06);
}

function hat(ch: Chan, t: number, vel: number, dur = 0.04, pan = 0): void {
  const n = noiseSrc(t, t + dur + 0.03);
  const hp = filt("highpass", 7600, 0.8);
  const g = perc(t, vel, 0.001, dur);
  n.connect(hp);
  hp.connect(g);
  send(g, ch, 0.08, 0, pan);
}

function rim(ch: Chan, t: number, vel: number): void {
  const n = noiseSrc(t, t + 0.14);
  const bp = filt("bandpass", 1750, 1.6);
  const g = perc(t, vel, 0.001, 0.1);
  n.connect(bp);
  bp.connect(g);
  const o = osc("triangle", 330, t, t + 0.08);
  const og = perc(t, vel * 0.6, 0.001, 0.05);
  o.connect(og);
  og.connect(g);
  send(g, ch, 0.3);
}

function tick(ch: Chan, t: number, vel: number, f = 4200): void {
  const n = noiseSrc(t, t + 0.04);
  const bp = filt("bandpass", f, 5);
  const g = perc(t, vel, 0.0008, 0.022);
  n.connect(bp);
  bp.connect(g);
  send(g, ch, 0.05);
}

function bass(ch: Chan, t: number, m: number, dur: number, vel: number, cut: number, q = 6): void {
  const end = t + dur + 0.3;
  const f = mtof(m);
  const lp = filt("lowpass", cut, q);
  lp.frequency.setValueAtTime(Math.min(9000, cut * 3.2), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, cut), t + Math.min(dur, 0.16));
  const g = (ctx as AudioContext).createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.006);
  g.gain.setTargetAtTime(0, t + dur * 0.7, Math.max(0.015, dur * 0.12));
  osc("sawtooth", f, t, end, -7).connect(lp);
  osc("sawtooth", f, t, end, 7).connect(lp);
  const sub = osc("sine", f, t, end);
  const sg = (ctx as AudioContext).createGain();
  sg.gain.value = 0.9;
  sub.connect(sg);
  sg.connect(g);
  lp.connect(g);
  send(g, ch);
}

interface PluckOpts {
  cut?: number;
  rev?: number;
  dly?: number;
  pan?: number;
}

function pluck(ch: Chan, t: number, m: number, dur: number, vel: number, o: PluckOpts = {}): void {
  const cut = o.cut ?? 2600;
  const f = mtof(m);
  const end = t + dur + 0.1;
  const lp = filt("lowpass", cut, 3);
  lp.frequency.setValueAtTime(cut, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.25), t + dur * 0.8);
  const g = perc(t, vel, 0.004, dur);
  osc("sawtooth", f, t, end, -6).connect(lp);
  osc("triangle", f, t, end, 9).connect(lp);
  lp.connect(g);
  send(g, ch, o.rev ?? 0.35, o.dly ?? 0.3, o.pan ?? 0);
}

/** Two detuned saws per note, panned apart, through one lowpass. */
function pad(
  ch: Chan,
  t: number,
  notes: readonly number[],
  dur: number,
  vel: number,
  cut: number,
  atk = 1.2,
  rel = 2.5,
  sweep?: number,
): void {
  const c = ctx as AudioContext;
  const end = t + dur + rel;
  const lp = filt("lowpass", cut, 0.6);
  lp.frequency.setValueAtTime(cut, t);
  if (sweep) lp.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + atk);
  g.gain.setTargetAtTime(0, t + dur, rel / 4);
  const l = panner(-0.45);
  const r = panner(0.45);
  l.connect(lp);
  r.connect(lp);
  for (const m of notes) {
    const f = mtof(m);
    osc("sawtooth", f, t, end, -8).connect(l);
    osc("sawtooth", f, t, end, 8).connect(r);
  }
  lp.connect(g);
  send(g, ch, 0.45);
}

function bell(ch: Chan, t: number, f: number, dur: number, vel: number, ratios: readonly number[] = [1, 2.01, 3.02], rev = 0.45, dly = 0): void {
  const c = ctx as AudioContext;
  const out = c.createGain();
  ratios.forEach((r, k) => {
    const d = dur / (1 + k * 0.55);
    const o = osc("sine", f * r, t, t + d + 0.05);
    const g = perc(t, vel / (k + 1.2), 0.002, d);
    o.connect(g);
    g.connect(out);
  });
  send(out, ch, rev, dly);
}

function metallic(ch: Chan, t: number, f: number, dur: number, vel: number): void {
  bell(ch, t, f, dur, vel, [1, 2.76, 5.4, 8.93, 11.34], 0.6, 0.15);
  const n = noiseSrc(t, t + 0.35);
  const hp = filt("highpass", 6000);
  const g = perc(t, vel * 0.35, 0.001, 0.28);
  n.connect(hp);
  hp.connect(g);
  send(g, ch, 0.5);
}

function stab(ch: Chan, t: number, notes: readonly number[], dur: number, vel: number, cut: number): void {
  const end = t + dur + 0.1;
  const lp = filt("lowpass", cut, 2);
  lp.frequency.setValueAtTime(cut, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(150, cut * 0.2), t + dur);
  const g = perc(t, vel, 0.006, dur);
  for (const m of notes) {
    osc("sawtooth", mtof(m), t, end, -9).connect(lp);
    osc("sawtooth", mtof(m), t, end, 9).connect(lp);
  }
  lp.connect(g);
  send(g, ch, 0.6, 0.2);
}

function riser(ch: Chan, t: number, dur: number, vel: number): void {
  const c = ctx as AudioContext;
  const n = noiseSrc(t, t + dur + 0.1);
  const bp = filt("bandpass", 250, 1.3);
  bp.frequency.setValueAtTime(250, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  n.connect(bp);
  bp.connect(g);
  send(g, ch, 0.4);
}

function hit(ch: Chan, t: number, vel: number): void {
  const o = osc("sine", 105, t, t + 1.7);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
  const g = perc(t, vel, 0.003, 1.6);
  o.connect(g);
  send(g, ch, 0.45);
  const n = noiseSrc(t, t + 0.6);
  const lp = filt("lowpass", 750);
  const ng = perc(t, vel * 0.6, 0.002, 0.5);
  n.connect(lp);
  lp.connect(ng);
  send(ng, ch, 0.6);
}

/** `cycles` wails between f1 and f2 over `dur`; `stepped` gives a two-tone hi-lo. */
function siren(ch: Chan, t: number, dur: number, f1: number, f2: number, vel: number, cycles: number, stepped = false): void {
  const c = ctx as AudioContext;
  const o = osc("sawtooth", f1, t, t + dur + 0.05);
  const seg = dur / cycles;
  for (let k = 0; k < cycles; k++) {
    const a = t + k * seg;
    if (stepped) {
      o.frequency.setValueAtTime(f1, a);
      o.frequency.setValueAtTime(f2, a + seg / 2);
    } else {
      o.frequency.setValueAtTime(f1, a);
      o.frequency.exponentialRampToValueAtTime(f2, a + seg * 0.45);
      o.frequency.exponentialRampToValueAtTime(f1, a + seg);
    }
  }
  const bp = filt("bandpass", 1000, 0.9);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.06);
  g.gain.setValueAtTime(vel, t + dur - 0.08);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(bp);
  bp.connect(g);
  send(g, ch, 0.7, 0.15, -0.3);
}

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  dur: number;
  vel: number;
  atk?: number;
  cut?: number;
  rev?: number;
  dly?: number;
  detune?: number;
}

function tone(ch: Chan, t: number, o: ToneOpts): void {
  const src = osc(o.type ?? "sine", o.f, t, t + o.dur + (o.atk ?? 0.003) + 0.05, o.detune ?? 0);
  if (o.f2) src.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = perc(t, o.vel, o.atk ?? 0.003, o.dur);
  if (o.cut) {
    const lp = filt("lowpass", o.cut, 1);
    src.connect(lp);
    lp.connect(g);
  } else {
    src.connect(g);
  }
  send(g, ch, o.rev ?? 0, o.dly ?? 0);
}


const DM_CH = [
  [50, 53, 57, 64], // Dm add9
  [46, 53, 57, 62], // Bbmaj7
  [43, 50, 58, 65], // Gm7
  [45, 52, 57, 62], // Asus4
] as const;
const DM_ROOTS = [38, 34, 31, 33] as const;

const HIDE_CH = [
  [50, 53, 57, 60], // Dm7
  [46, 50, 53, 57], // Bbmaj7
  [43, 50, 53, 58], // Gm7
  [45, 48, 52, 55], // Am7
] as const;
const TENSE_CH = [
  [50, 52, 53, 57], // Dm add9 (close cluster)
  [46, 52, 53, 57], // Bbmaj7#11
  [43, 52, 55, 58], // Gm6
  [45, 49, 55, 58], // A7b9
] as const;
const BASS_PAT: Readonly<Record<number, readonly [number, number]>> = {
  0: [0, 3],
  6: [0, 1.5],
  8: [12, 1.5],
  11: [7, 2],
  14: [0, 1.5],
};

/** Slow two-chord pad used after stingers. */
function calm(L: Live, j: number, t: number, chords: readonly (readonly number[])[], roots: readonly number[], cut: number): void {
  const n = 48;
  const k = j % n;
  const ci = Math.floor(j / n) % chords.length;
  const chord = chords[ci] as readonly number[];
  if (k === 0) {
    pad(L.ch, t, chord, n * L.sd, 0.1, cut, 2, 3);
    pad(L.ch, t, [roots[ci] as number], n * L.sd, 0.13, 230, 1.5, 2);
  }
  if ((k === 10 || k === 26 || k === 40) && rnd() < 0.6) {
    pluck(L.ch, t, pick(chord) + 12, 1.6, 0.045, { rev: 0.6, dly: 0.5, pan: rnd() - 0.5 });
  }
}

function hideoutStep(tense: boolean) {
  return (L: Live, i: number, t: number): void => {
    const ch = L.ch;
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const ci = Math.floor(i / 32) % 4;
    const chord = (tense ? TENSE_CH : HIDE_CH)[ci] as readonly number[];
    const root = DM_ROOTS[ci] as number;
    if (i % 32 === 0) pad(ch, t, chord, 32 * L.sd, tense ? 0.12 : 0.11, tense ? 1100 : 800, 1, 2);
    if (s === 0) kick(ch, t, 0.5);
    else if (s === 10) kick(ch, t, 0.38);
    else if (s === 7 && bar % 2 === 1) kick(ch, t, 0.25);
    if (s === 4 || s === 12) rim(ch, t, 0.12);
    // Slight swing on the off 16ths.
    const sw = s % 2 === 1 ? L.sd * 0.12 : 0;
    if (tense) {
      hat(ch, t + sw, s % 4 === 2 ? 0.09 : s % 4 === 0 ? 0.05 : 0.032, 0.03, 0.2);
      if (s % 8 === 2) pluck(ch, t, 81, 0.5, 0.03, { cut: 3200, rev: 0.4, dly: 0.5, pan: -0.3 });
    } else if (s % 2 === 0) {
      hat(ch, t, s % 4 === 2 ? 0.07 : 0.04, 0.035, 0.2);
    }
    const b = BASS_PAT[s];
    if (b) bass(ch, t, root + b[0], b[1] * L.sd, 0.3, tense ? 420 : 320);
    if (s === 4 && bar % 2 === 1 && rnd() < 0.8) {
      pluck(ch, t, (chord[3] as number) + 12, 1.2, 0.05, { rev: 0.5, dly: 0.45, pan: 0.3 });
    }
  };
}

const JOB_ROOTS = [38, 38, 34, 36] as const;
const JOB_CH: Readonly<Record<number, readonly number[]>> = {
  38: [50, 57, 62, 65],
  34: [46, 53, 58, 62],
  36: [48, 55, 60, 64],
};
const JOB_ARP = [62, 65, 69, 65, 72, 69, 65, 69] as const;

const SCENES: Record<Scene, SceneDef> = {
  title: {
    bpm: 60,
    rain: 0.5,
    vinyl: 0.25,
    step(L, i, t) {
      const k = i % 32;
      const ci = Math.floor(i / 32) % 4;
      const chord = DM_CH[ci] as readonly number[];
      if (k === 0) {
        pad(L.ch, t, chord, 32 * L.sd, 0.15, 900, 2.5, 3);
        pad(L.ch, t, [DM_ROOTS[ci] as number], 32 * L.sd, 0.16, 240, 1.5, 2.5);
        tone(L.ch, t, { f: mtof(DM_ROOTS[ci] as number), dur: 30 * L.sd, vel: 0.2, atk: 1.2 });
      }
      if ((k === 6 || k === 14 || k === 22 || k === 27) && rnd() < 0.75) {
        pluck(L.ch, t, pick(chord) + (rnd() < 0.5 ? 12 : 24), 1.4, 0.065, {
          cut: 3000,
          rev: 0.6,
          dly: 0.5,
          pan: rnd() * 1.2 - 0.6,
        });
      }
    },
  },

  hideout: { bpm: 84, rain: 0.2, rainLp: 2500, room: 0.35, vinyl: 0.3, step: hideoutStep(false) },
  planning: { bpm: 84, rain: 0.2, rainLp: 2500, room: 0.35, vinyl: 0.3, step: hideoutStep(true) },

  job: {
    bpm: 112,
    rain: 0.1,
    vinyl: 0.12,
    step(L, i, t) {
      const ch = L.ch;
      const s = i % 16;
      const bar = Math.floor(i / 16);
      // Builds over ~12 bars (~26 s), then eases off so long waits don't wear.
      const inten = bar < 12 ? bar / 12 : 0.85 + 0.15 * Math.cos(((bar - 12) * Math.PI) / 8);
      const root = JOB_ROOTS[Math.floor(bar / 2) % 4] as number;
      if (!(s === 14 && bar % 4 === 3)) {
        const acc = s % 4 === 0;
        const note = root + (s === 7 || s === 15 ? 12 : 0);
        const cut = 160 + inten * 700 + (acc ? 120 : 0) + 60 * Math.sin(i * 0.05);
        bass(ch, t, note, L.sd * 0.9, (acc ? 0.3 : 0.2) * (0.75 + 0.25 * inten), cut, 8);
      }
      // Heartbeat: lub-dub twice a bar.
      if (s === 0) kick(ch, t, 0.7, 100, 38);
      else if (s === 3) kick(ch, t, 0.4, 100, 38);
      else if (s === 8) kick(ch, t, 0.6, 100, 38);
      else if (s === 11) kick(ch, t, 0.35, 100, 38);
      if (bar >= 2 && s % 4 === 2) hat(ch, t, 0.06, 0.05, 0.25);
      else if (bar >= 6) hat(ch, t, 0.022, 0.025, -0.25);
      if (bar >= 6 && (s === 4 || s === 12)) rim(ch, t, 0.1 * inten);
      if (bar >= 4 && bar % 4 >= 2 && s % 2 === 0) {
        pluck(ch, t, JOB_ARP[s / 2] as number, 0.3, 0.045 + 0.03 * inten, {
          cut: 1800 + 1800 * inten,
          rev: 0.3,
          dly: 0.4,
          pan: s % 4 === 0 ? -0.35 : 0.35,
        });
      }
      if (bar % 2 === 0 && s === 0) {
        pad(ch, t, JOB_CH[root] ?? [50, 57, 62, 65], 32 * L.sd, 0.05 + 0.04 * inten, 500 + 900 * inten, 1.5, 2);
      }
      if (bar >= 7 && bar % 8 === 7 && s === 0) riser(ch, t, 16 * L.sd, 0.07);
    },
  },

  police: {
    bpm: 128,
    rain: 0.25,
    step(L, i, t) {
      const ch = L.ch;
      const s = i % 16;
      const bar = Math.floor(i / 16);
      if (i % 32 === 0) {
        if (bar % 8 === 6) siren(ch, t, 32 * L.sd, 660, 880, 0.08, 4, true);
        else siren(ch, t, 32 * L.sd, 620, 1180, 0.085, 3);
      }
      if (s % 4 === 0) kick(ch, t, 0.6);
      if (s % 2 === 0) bass(ch, t, bar % 4 === 3 ? 39 : 38, L.sd * 1.6, s % 4 === 0 ? 0.28 : 0.22, 520);
      hat(ch, t, s % 4 === 2 ? 0.08 : 0.035, 0.03, 0.2);
      if (s === 4 || s === 12) rim(ch, t, 0.14);
      if (bar % 4 === 0 && s === 0) stab(ch, t, [62, 63, 68, 69], 0.5, 0.13, 1800);
      else if (bar % 4 === 2 && s === 6) stab(ch, t, [62, 63, 68], 0.3, 0.08, 1400);
    },
  },

  clean: {
    bpm: 96,
    vinyl: 0.2,
    step(L, i, t) {
      const ch = L.ch;
      const s = i % 16;
      const bar = Math.floor(i / 16);
      if (bar >= 4) {
        const j = i - 64;
        calm(L, j, t, [DM_CH[0], HIDE_CH[1]], [38, 34], 800);
        if (j % 16 === 0) kick(ch, t, 0.28);
        return;
      }
      if (i === 0) {
        pad(ch, t, [46, 53, 58, 62], 16 * L.sd, 0.14, 1500, 0.3, 1);
        bass(ch, t, 34, 14 * L.sd, 0.3, 400);
      } else if (i === 16) {
        pad(ch, t, [48, 55, 60, 64], 16 * L.sd, 0.14, 1900, 0.3, 1);
        bass(ch, t, 36, 14 * L.sd, 0.3, 450);
      } else if (i === 32) {
        // Picardy lift: Bb -> C -> D major.
        pad(ch, t, [50, 57, 62, 66, 69], 32 * L.sd, 0.15, 2600, 0.2, 3);
        bass(ch, t, 38, 30 * L.sd, 0.32, 500);
        bell(ch, t, mtof(86), 2.2, 0.12, [1, 2.01, 3.02], 0.5, 0.3);
        bell(ch, t + 0.07, mtof(93), 1.8, 0.07);
      }
      if (bar < 2) {
        tick(ch, t, 0.07 + (s % 4 === 0 ? 0.04 : 0), 3600 + i * 70);
        if (s % 8 === 0) kick(ch, t, 0.5);
      } else {
        if (s % 4 === 0) kick(ch, t, 0.45);
        if (s % 2 === 0) {
          const n = [62, 66, 69, 74, 78, 81, 86, 90][((i - 32) / 2) % 8] as number;
          pluck(ch, t, n, 0.5, 0.075 * (1 - (i - 32) / 40), { cut: 4200, rev: 0.45, dly: 0.4, pan: s % 4 === 0 ? -0.3 : 0.3 });
        }
      }
    },
  },

  raid: {
    bpm: 100,
    lp: 900,
    room: 0.5,
    step(L, i, t) {
      const ch = L.ch;
      const s = i % 16;
      const bar = Math.floor(i / 16);
      if (i === 0) hit(ch, t, 0.9);
      else if (bar % 4 === 0 && s === 0) hit(ch, t, 0.5);
      if (i % 32 === 0) pad(ch, t, [26, 38, 45], 32 * L.sd, 0.24, 320, 0.6, 1.5);
      if (s === 0 || s === 2 || s === 8 || s === 10) {
        tone(ch, t, { type: "square", f: 740, dur: 0.13, vel: 0.07, atk: 0.005, rev: 0.4 });
        tone(ch, t, { type: "square", f: 370, dur: 0.13, vel: 0.05, atk: 0.005 });
      }
      if (s === 0 || s === 8) kick(ch, t, 0.75, 110, 36, 0.45);
      else if (s === 6) kick(ch, t, 0.45, 110, 36, 0.3);
      if (s % 2 === 0) bass(ch, t, 38, L.sd * 1.5, 0.24, 300);
    },
  },

  reveal: {
    bpm: 60,
    rain: 0.3,
    room: 0.3,
    step(L, i, t) {
      const ch = L.ch;
      if (i === 0) {
        // Suspended chord and riser for 6 s, a second of silence, then the sting.
        pad(ch, t, [50, 55, 57, 64], 5.5, 0.13, 700, 1.5, 0.4, 2600);
        riser(ch, t, 6, 0.09);
        tone(ch, t, { type: "sawtooth", f: 110, f2: 440, dur: 5.9, vel: 0.05, atk: 5.8, cut: 1400, rev: 0.4 });
        tone(ch, t, { f: mtof(87), dur: 5.9, vel: 0.02, atk: 4, rev: 0.6, detune: 30 });
      }
      if (i < 24 && (i % 4 === 0 || (i >= 16 && i % 2 === 0))) kick(ch, t, 0.25 + i * 0.015, 90, 40);
      if (i === 28) {
        hit(ch, t, 0.85);
        stab(ch, t, [50, 53, 57, 61, 64], 2.6, 0.17, 2300);
        metallic(ch, t + 0.02, 520, 2.2, 0.1);
      }
      if (i >= 32) {
        const j = i - 32;
        if (j % 32 === 0) pad(ch, t, [38, 45, 50, 53, 61], 32 * L.sd, 0.1, 600, 2, 3);
        if (j % 8 === 0) kick(ch, t, 0.3, 90, 40);
        else if (j % 8 === 1) kick(ch, t, 0.18, 90, 40);
      }
    },
  },

  win: {
    bpm: 72,
    vinyl: 0.15,
    rain: 0.1,
    step(L, i, t) {
      const ch = L.ch;
      if (i === 0) {
        kick(ch, t, 0.7);
        pad(ch, t, [50, 54, 57, 62, 66], 15 * L.sd, 0.16, 2400, 0.05, 3);
        bass(ch, t, 38, 12 * L.sd, 0.32, 500);
      }
      if (i < 6) {
        pluck(ch, t, [62, 66, 69, 74, 78, 81][i] as number, 0.7, 0.1, { cut: 4500, rev: 0.5, dly: 0.35, pan: i % 2 ? 0.3 : -0.3 });
        if (i === 5) bell(ch, t, mtof(86), 2.5, 0.12, [1, 2.01, 3.02], 0.55, 0.3);
      }
      if (i >= 16) calm(L, i - 16, t, [[50, 54, 57, 64], [43, 50, 54, 59]], [38, 31], 900);
    },
  },

  lose: {
    bpm: 60,
    rain: 0.5,
    vinyl: 0.2,
    step(L, i, t) {
      const ch = L.ch;
      if (i === 0) {
        hit(ch, t, 0.6);
        stab(ch, t, [50, 53, 56, 61], 2.6, 0.13, 1200);
        tone(ch, t, { type: "sawtooth", f: 73.4, f2: 36.7, dur: 2.6, vel: 0.16, atk: 0.02, cut: 300 });
      }
      if (i === 0 || i === 2 || i === 4) pluck(ch, t, [69, 65, 62][i / 2] as number, 1, 0.09, { cut: 1800, rev: 0.6, dly: 0.4 });
      if (i === 6) pluck(ch, t, 58, 2.4, 0.09, { cut: 1400, rev: 0.7, dly: 0.4 });
      if (i >= 16) calm(L, i - 16, t, [HIDE_CH[0], HIDE_CH[1]], [38, 34], 600);
    },
  },
};


function ambience(L: Live, t: number): void {
  const c = ctx as AudioContext;
  const d = L.def;
  const far = t + 1e6;
  if (d.rain) {
    const n = noiseSrc(t, far);
    const hp = filt("highpass", 900);
    const lp = filt("lowpass", d.rainLp ?? 6000);
    const g = c.createGain();
    g.gain.value = d.rain * 0.09;
    // Gusts so the rain isn't a static hiss.
    const lfo = osc("sine", 0.13, t, far);
    const depth = c.createGain();
    depth.gain.value = d.rain * 0.03;
    lfo.connect(depth);
    depth.connect(g.gain);
    n.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    send(g, L.ch, 0.25);
    L.loops.push(n, lfo);
  }
  if (d.room) {
    const n = noiseSrc(t, far, brown);
    const lp = filt("lowpass", 240);
    const g = c.createGain();
    g.gain.value = d.room * 0.22;
    n.connect(lp);
    lp.connect(g);
    send(g, L.ch);
    L.loops.push(n);
  }
  if (d.vinyl) {
    const n = noiseSrc(t, far, crackle);
    const hp = filt("highpass", 1200);
    const g = c.createGain();
    g.gain.value = d.vinyl * 0.22;
    n.connect(hp);
    hp.connect(g);
    send(g, L.ch);
    L.loops.push(n);
  }
}

function endScene(old: Live, t: number): void {
  fadeChan(old.ch, 0, t);
  for (const s of old.loops) {
    try {
      s.stop(t + XFADE * 1.6);
    } catch {
      /* already stopped */
    }
  }
  setTimeout(() => {
    try {
      old.ch.dry.disconnect();
      old.ch.rev.disconnect();
      old.ch.dly.disconnect();
    } catch {
      /* ignore */
    }
  }, XFADE * 2500);
}

function startScene(name: Scene): void {
  const c = ctx;
  if (!c || !musicLp || !delayNode) return;
  const t = c.currentTime;
  if (live) endScene(live, t);
  const def = SCENES[name];
  const sd = 60 / def.bpm / 4;
  const ch = makeChan(musicLp, 0);
  fadeChan(ch, 1, t);
  musicLp.frequency.cancelScheduledValues(t);
  musicLp.frequency.setTargetAtTime(def.lp ?? 18000, t, 0.35);
  // Dotted-eighth echo locked to the scene tempo.
  delayNode.delayTime.cancelScheduledValues(t);
  delayNode.delayTime.setTargetAtTime(Math.min(1.2, sd * 3), t, 0.2);
  live = { name, def, ch, loops: [], step: 0, next: t + 0.06, sd };
  ambience(live, t);
}

function tickScheduler(): void {
  const c = ctx;
  const L = live;
  if (!c || !L || c.state !== "running") return;
  const now = c.currentTime;
  // After a stall (throttled timers) skip ahead instead of playing every late note.
  if (L.next < now - 0.2) {
    const missed = Math.ceil((now + 0.05 - L.next) / L.sd);
    L.step += missed;
    L.next += missed * L.sd;
  }
  while (L.next < now + LOOKAHEAD) {
    if (!muted) {
      try {
        L.def.step(L, L.step, Math.max(L.next, now));
      } catch {
        /* never let one bad voice kill the sequencer */
      }
    }
    L.step++;
    L.next += L.sd;
  }
}

function startTimer(): void {
  if (timer !== null || isHidden()) return;
  timer = setInterval(tickScheduler, TICK_MS);
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function onVisibility(): void {
  const c = ctx;
  if (!c) return;
  if (isHidden()) {
    stopTimer();
    void c.suspend().catch(() => undefined);
  } else if (unlocked) {
    void c.resume().catch(() => undefined);
    startTimer();
  }
}

function unlock(): void {
  const c = init();
  if (!c) return;
  try {
    if (c.state !== "running" && !isHidden()) void c.resume().catch(() => undefined);
  } catch {
    /* ignore */
  }
  unlocked = true;
  if (!live || live.name !== wanted) startScene(wanted);
  startTimer();
}

/** Context and sfx channel, or null when sound can't play. */
function fx(): { c: AudioContext; ch: Chan; t: number } | null {
  if (!unlocked || muted || !ctx || !sfx || ctx.state !== "running") return null;
  return { c: ctx, ch: sfx, t: ctx.currentTime + 0.005 };
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* audio must never break gameplay */
  }
}


export const audio = {
  /** Must run from a user gesture. */
  unlock(): void {
    safe(unlock);
  },

  /** Starts sound on the first pointerdown or keydown. */
  autoUnlock(): void {
    if (!hasWindow() || autoInstalled) return;
    autoInstalled = true;
    const off = () => {
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
    const handler = () => {
      safe(unlock);
      const c = ctx;
      if (!c) return;
      if (c.state === "running") off();
      else if (!isHidden()) {
        c.resume().then(
          () => {
            if (c.state === "running") off();
          },
          () => undefined,
        );
      }
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("keydown", handler, true);
  },

  /** ~1.2 s crossfade. Before unlock the scene is stored and applied on unlock. */
  setScene(scene: Scene): void {
    if (!(scene in SCENES)) return;
    wanted = scene;
    if (!unlocked || !ctx) return;
    if (live && live.name === scene) return;
    safe(() => startScene(scene));
  },

  getScene(): Scene {
    return wanted;
  },

  setMuted(m: boolean): void {
    muted = m;
    mutedLoaded = true;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.05);
  },

  isMuted(): boolean {
    return loadMuted();
  },

  setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.8));
    if (ctx && master && !loadMuted()) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  },


  click(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      tick(a.ch, a.t, 0.16, 3000);
      tone(a.ch, a.t, { type: "triangle", f: 1500, f2: 800, dur: 0.045, vel: 0.1 });
    });
  },

  select(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      pluck(a.ch, a.t, 69, 0.18, 0.12, { cut: 3200, rev: 0.2, dly: 0 });
      pluck(a.ch, a.t + 0.07, 74, 0.25, 0.13, { cut: 3600, rev: 0.25, dly: 0.12 });
    });
  },

  deselect(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      pluck(a.ch, a.t, 74, 0.16, 0.1, { cut: 2400, rev: 0.2, dly: 0 });
      pluck(a.ch, a.t + 0.07, 69, 0.22, 0.1, { cut: 1800, rev: 0.2, dly: 0 });
    });
  },

  /** `steps` rising ticks, then a register bell. */
  cash(steps = 6): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const n = Math.max(1, Math.min(24, Math.floor(steps)));
      for (let k = 0; k < n; k++) {
        const t = a.t + k * 0.055;
        tick(a.ch, t, 0.14, 3200 + k * 180);
        tone(a.ch, t, { type: "square", f: 900 + k * 60, dur: 0.03, vel: 0.035, cut: 3000 });
      }
      const t = a.t + n * 0.055 + 0.03;
      bell(a.ch, t, 2093, 0.9, 0.14, [1, 1.5, 2.99], 0.4, 0.15);
      tick(a.ch, t, 0.12, 5200);
    });
  },

  /** Siren chirp and thud. */
  heat(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      siren(a.ch, a.t, 0.42, 700, 1350, 0.12, 1);
      const o = osc("sine", 115, a.t, a.t + 0.5);
      o.frequency.exponentialRampToValueAtTime(42, a.t + 0.2);
      const g = perc(a.t, 0.5, 0.003, 0.4);
      o.connect(g);
      send(g, a.ch, 0.2);
    });
  },

  /** Phone vibrating on a table. */
  phone(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      for (let k = 0; k < 2; k++) {
        const t = a.t + k * 0.34;
        const dur = 0.22;
        const o = osc("sawtooth", 155, t, t + dur + 0.05);
        const lp = filt("lowpass", 700, 2);
        const am = a.c.createGain();
        am.gain.value = 0.6;
        const lfo = osc("square", 31, t, t + dur + 0.05);
        const depth = a.c.createGain();
        depth.gain.value = 0.4;
        lfo.connect(depth);
        depth.connect(am.gain);
        const g = a.c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.012);
        g.gain.setValueAtTime(0.16, t + dur - 0.03);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(lp);
        lp.connect(am);
        am.connect(g);
        const n = noiseSrc(t, t + dur + 0.05);
        const bp = filt("bandpass", 2400, 3);
        const ng = a.c.createGain();
        ng.gain.value = 0.12;
        n.connect(bp);
        bp.connect(ng);
        ng.connect(am);
        send(g, a.ch, 0.12);
      }
    });
  },

  shutter(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      tick(a.ch, a.t, 0.3, 2800);
      tick(a.ch, a.t + 0.012, 0.18, 1200);
      tick(a.ch, a.t + 0.075, 0.24, 2100);
      const n = noiseSrc(a.t + 0.09, a.t + 0.3);
      const bp = filt("bandpass", 1600, 6);
      bp.frequency.setValueAtTime(1100, a.t + 0.09);
      bp.frequency.linearRampToValueAtTime(2200, a.t + 0.26);
      const g = perc(a.t + 0.09, 0.07, 0.02, 0.16);
      n.connect(bp);
      bp.connect(g);
      send(g, a.ch, 0.15);
    });
  },

  /** Air sweep for scene cuts. */
  whoosh(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const dur = 0.6;
      const n = noiseSrc(a.t, a.t + dur + 0.05);
      const bp = filt("bandpass", 400, 1.4);
      bp.frequency.setValueAtTime(320, a.t);
      bp.frequency.exponentialRampToValueAtTime(2400, a.t + dur * 0.55);
      bp.frequency.exponentialRampToValueAtTime(700, a.t + dur);
      const g = perc(a.t, 0.16, dur * 0.5, dur * 0.5);
      n.connect(bp);
      bp.connect(g);
      send(g, a.ch, 0.25);
    });
  },

  staticBurst(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const dur = 0.55;
      const n = noiseSrc(a.t, a.t + dur + 0.05);
      const bp = filt("bandpass", 1800, 0.8);
      bp.frequency.setValueAtTime(900 + rnd() * 600, a.t);
      bp.frequency.exponentialRampToValueAtTime(3200 + rnd() * 1500, a.t + dur * 0.5);
      bp.frequency.exponentialRampToValueAtTime(1200, a.t + dur);
      const g = a.c.createGain();
      const curve: number[] = [0];
      for (let k = 0; k < 22; k++) curve.push(rnd() < 0.25 ? 0.02 : 0.08 + rnd() * 0.14);
      curve.push(0);
      g.gain.setValueCurveAtTime(curve, a.t, dur);
      n.connect(bp);
      bp.connect(g);
      send(g, a.ch, 0.1);
      const o = osc("sine", 1900, a.t, a.t + dur);
      o.frequency.linearRampToValueAtTime(2600, a.t + dur * 0.4);
      o.frequency.linearRampToValueAtTime(1400, a.t + dur);
      const og = perc(a.t, 0.02, 0.05, dur - 0.08);
      o.connect(og);
      send(og, a.ch);
    });
  },

  /** Gavel hit, then a tension riser. */
  accuse(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const o = osc("sine", 190, a.t, a.t + 0.6);
      o.frequency.exponentialRampToValueAtTime(58, a.t + 0.12);
      const g = perc(a.t, 0.7, 0.002, 0.5);
      o.connect(g);
      send(g, a.ch, 0.5);
      const n = noiseSrc(a.t, a.t + 0.15);
      const bp = filt("bandpass", 950, 2.5);
      const ng = perc(a.t, 0.4, 0.001, 0.09);
      n.connect(bp);
      bp.connect(ng);
      send(ng, a.ch, 0.6);
      riser(a.ch, a.t + 0.15, 1.1, 0.09);
      tone(a.ch, a.t + 0.15, { type: "sawtooth", f: 110, f2: 440, dur: 1.1, vel: 0.07, atk: 1.0, cut: 1600, rev: 0.4 });
    });
  },

  badge(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      metallic(a.ch, a.t, 520, 1.6, 0.16);
      metallic(a.ch, a.t + 0.09, 780, 1.2, 0.08);
      const o = osc("sine", 90, a.t, a.t + 0.8);
      o.frequency.exponentialRampToValueAtTime(40, a.t + 0.3);
      const g = perc(a.t, 0.45, 0.003, 0.7);
      o.connect(g);
      send(g, a.ch, 0.4);
    });
  },

  /** Creak then slam. */
  door(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const o = osc("sawtooth", 240, a.t, a.t + 0.22);
      o.frequency.linearRampToValueAtTime(170, a.t + 0.18);
      const bp = filt("bandpass", 900, 7);
      const cg = perc(a.t, 0.06, 0.04, 0.14);
      o.connect(bp);
      bp.connect(cg);
      send(cg, a.ch, 0.3);
      const t = a.t + 0.2;
      const th = osc("sine", 98, t, t + 0.5);
      th.frequency.exponentialRampToValueAtTime(48, t + 0.15);
      const g = perc(t, 0.6, 0.002, 0.4);
      th.connect(g);
      send(g, a.ch, 0.35);
      const n = noiseSrc(t, t + 0.25);
      const lp = filt("lowpass", 900);
      const ng = perc(t, 0.3, 0.001, 0.16);
      n.connect(lp);
      lp.connect(ng);
      send(ng, a.ch, 0.4);
      tick(a.ch, t + 0.05, 0.1, 2200);
    });
  },

  /** `far` muffles it, as if through a wall. */
  gunshot(far = false): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const n = noiseSrc(a.t, a.t + 0.22);
      const f = filt(far ? "lowpass" : "highpass", far ? 700 : 900, 0.6);
      const ng = perc(a.t, far ? 0.35 : 0.9, 0.001, far ? 0.2 : 0.12);
      n.connect(f);
      f.connect(ng);
      send(ng, a.ch, 0.45);
      const th = osc("sine", 150, a.t, a.t + 0.3);
      th.frequency.exponentialRampToValueAtTime(42, a.t + 0.12);
      const g = perc(a.t, far ? 0.4 : 0.8, 0.001, 0.22);
      th.connect(g);
      send(g, a.ch, 0.3);
    });
  },

  /** Van starting, about 1.5 s. */
  engine(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      for (let k = 0; k < 5; k++) {
        const t = a.t + k * 0.09;
        const n = noiseSrc(t, t + 0.08);
        const bp = filt("bandpass", 800 + k * 40, 2);
        const g = perc(t, 0.13, 0.004, 0.055);
        n.connect(bp);
        bp.connect(g);
        send(g, a.ch, 0.1);
        tone(a.ch, t, { type: "sawtooth", f: 85 + k * 5, dur: 0.06, vel: 0.08, cut: 500 });
      }
      const t = a.t + 0.45;
      const end = a.t + 1.65;
      const lp = filt("lowpass", 520, 1.5);
      for (const [mult, det] of [
        [1, 0],
        [2, 14],
      ] as const) {
        const o = osc("sawtooth", 38 * mult, t, end, det);
        o.frequency.exponentialRampToValueAtTime(76 * mult, t + 0.3);
        o.frequency.exponentialRampToValueAtTime(54 * mult, t + 1.0);
        o.connect(lp);
      }
      const rumble = noiseSrc(t, end, brown);
      const rg = a.c.createGain();
      rg.gain.value = 0.8;
      rumble.connect(rg);
      rg.connect(lp);
      const am = a.c.createGain();
      am.gain.value = 0.7;
      const lfo = osc("sine", 22, t, end);
      lfo.frequency.linearRampToValueAtTime(30, t + 0.3);
      lfo.frequency.linearRampToValueAtTime(24, t + 1.0);
      const depth = a.c.createGain();
      depth.gain.value = 0.3;
      lfo.connect(depth);
      depth.connect(am.gain);
      const g = a.c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.34, t + 0.12);
      g.gain.setValueAtTime(0.3, t + 0.8);
      g.gain.linearRampToValueAtTime(0, end - 0.02);
      lp.connect(am);
      am.connect(g);
      send(g, a.ch, 0.15);
    });
  },

  /** Chime for star index 0..2. */
  star(i: number): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      const k = Math.max(0, Math.min(2, Math.floor(Number.isFinite(i) ? i : 0)));
      const m = [74, 81, 86][k] as number;
      bell(a.ch, a.t, mtof(m), 1.3, 0.16, [1, 2.01, 3.02, 4.2], 0.5, 0.25);
      bell(a.ch, a.t + 0.05, mtof(m + 12), 0.8, 0.06);
      if (k === 2) {
        [90, 93, 98].forEach((n, j) => bell(a.ch, a.t + 0.12 + j * 0.07, mtof(n), 0.9, 0.05, [1, 2.01], 0.6, 0.3));
      }
    });
  },

  /** Text tick, rate-limited. */
  type(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      if (a.t - lastType < 0.028) return;
      lastType = a.t;
      tick(a.ch, a.t, 0.05 + rnd() * 0.02, 3400 + rnd() * 1600);
    });
  },

  error(): void {
    safe(() => {
      const a = fx();
      if (!a) return;
      for (const [k, m] of [51, 50].entries()) {
        const t = a.t + k * 0.12;
        tone(a.ch, t, { type: "sawtooth", f: mtof(m), dur: 0.16, vel: 0.13, cut: 900, rev: 0.15 });
        tone(a.ch, t, { type: "square", f: mtof(m - 12), dur: 0.16, vel: 0.07, cut: 600, detune: 18 });
      }
    });
  },
};

export type SnitchAudio = typeof audio;
