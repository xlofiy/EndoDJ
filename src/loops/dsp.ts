/**
 * Tiny offline synthesis toolkit (pure TypeScript, no Web Audio) used to render the
 * Loop Lab's built-in loops and sound effects. Everything is deterministic (seeded noise),
 * so a loop sounds identical on every machine and nothing has to be downloaded.
 */

export const TAU = Math.PI * 2;

/** Deterministic PRNG (mulberry32) → white noise in [-1, 1]. */
export function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export function midiToHz(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** Topology-preserving-transform state-variable filter (stable at any cutoff/resonance). */
export class SVF {
  private ic1 = 0;
  private ic2 = 0;
  private g = 0;
  private k = 0;
  constructor(private sr: number) {}
  set(cutoff: number, q: number): void {
    const fc = Math.min(Math.max(cutoff, 10), this.sr * 0.45);
    this.g = Math.tan((Math.PI * fc) / this.sr);
    this.k = 1 / Math.max(0.05, q);
  }
  /** returns [low, band, high] */
  process(x: number): [number, number, number] {
    const { g, k } = this;
    const a1 = 1 / (1 + g * (g + k));
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + g * a1 * v3;
    const v2 = this.ic2 + g * v1;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return [v2, v1, x - k * v1 - v2];
  }
}

export function softClip(x: number, drive = 1): number {
  return Math.tanh(x * drive);
}

/** Reduce bit depth (hyperpop / scene crunch). */
export function crush(x: number, bits: number): number {
  const s = Math.pow(2, bits - 1);
  return Math.round(x * s) / s;
}

/** Polyblep-free naive oscillators are fine at these (short, filtered) uses. */
export function saw(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}
export function square(phase: number, pw = 0.5): number {
  return phase - Math.floor(phase) < pw ? 1 : -1;
}
export function tri(phase: number): number {
  const p = phase - Math.floor(phase);
  return 4 * Math.abs(p - 0.5) - 1;
}

/** A stereo render target that wraps sounds past the end back to the start (seamless loops). */
export class Canvas {
  readonly L: Float32Array;
  readonly R: Float32Array;
  constructor(
    readonly sr: number,
    readonly length: number,
    readonly wrap: boolean,
  ) {
    this.L = new Float32Array(length);
    this.R = new Float32Array(length);
  }
  add(i: number, l: number, r = l): void {
    if (i < 0) return;
    if (i >= this.length) {
      if (!this.wrap) return;
      i %= this.length;
    }
    this.L[i] += l;
    this.R[i] += r;
  }
  /** Normalise to a peak level (default -1 dBFS). */
  normalize(peak = 0.89): void {
    let m = 0;
    for (let i = 0; i < this.length; i++) m = Math.max(m, Math.abs(this.L[i]), Math.abs(this.R[i]));
    if (m < 1e-9) return;
    const k = peak / m;
    for (let i = 0; i < this.length; i++) {
      this.L[i] *= k;
      this.R[i] *= k;
    }
  }
}

// ------------------------------------------------------------------ instruments

export interface KickOpts {
  f0?: number; // start pitch Hz
  f1?: number; // end pitch Hz
  sweep?: number; // pitch sweep time constant (s)
  decay?: number; // amplitude decay (s)
  drive?: number;
  click?: number;
  gain?: number;
}

export function kick(c: Canvas, t: number, o: KickOpts = {}): void {
  const { f0 = 160, f1 = 48, sweep = 0.035, decay = 0.28, drive = 1.5, click = 0.3, gain = 1 } = o;
  const start = Math.round(t * c.sr);
  const n = Math.round(decay * 5 * c.sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const s = i / c.sr;
    const f = f1 + (f0 - f1) * Math.exp(-s / sweep);
    phase += f / c.sr;
    const env = Math.exp(-s / decay);
    let x = Math.sin(TAU * phase) * env;
    if (i < c.sr * 0.004) x += click * (1 - i / (c.sr * 0.004)) * (i % 2 ? 1 : -1) * 0.5;
    const y = softClip(x, drive) * gain;
    c.add(start + i, y);
  }
}

export function snare(c: Canvas, t: number, seed: number, o: { tone?: number; decay?: number; gain?: number; bright?: number } = {}): void {
  const { tone = 190, decay = 0.13, gain = 0.8, bright = 2500 } = o;
  const rnd = noise(seed);
  const f = new SVF(c.sr);
  f.set(bright, 0.8);
  const start = Math.round(t * c.sr);
  const n = Math.round(decay * 5 * c.sr);
  for (let i = 0; i < n; i++) {
    const s = i / c.sr;
    const body = Math.sin(TAU * tone * s) * Math.exp(-s / 0.04) * 0.6;
    const [, band, high] = f.process(rnd());
    const nz = (band + high * 0.5) * Math.exp(-s / decay);
    c.add(start + i, (body + nz) * gain);
  }
}

/** Hand clap: 3 quick noise bursts + tail. */
export function clap(c: Canvas, t: number, seed: number, gain = 0.8): void {
  const rnd = noise(seed);
  const f = new SVF(c.sr);
  f.set(1400, 1.2);
  const start = Math.round(t * c.sr);
  const n = Math.round(0.35 * c.sr);
  for (let i = 0; i < n; i++) {
    const s = i / c.sr;
    let env = Math.exp(-s / 0.09);
    for (const off of [0, 0.011, 0.022]) if (s >= off && s < off + 0.01) env += Math.exp(-(s - off) / 0.004);
    const [, band] = f.process(rnd());
    c.add(start + i, band * env * gain * 1.6, band * env * gain * 1.4);
  }
}

export function hat(c: Canvas, t: number, seed: number, o: { decay?: number; gain?: number; pan?: number } = {}): void {
  const { decay = 0.03, gain = 0.35, pan = 0 } = o;
  const rnd = noise(seed);
  const f = new SVF(c.sr);
  f.set(8000, 0.7);
  const start = Math.round(t * c.sr);
  const n = Math.round(decay * 6 * c.sr);
  for (let i = 0; i < n; i++) {
    const [, , high] = f.process(rnd());
    const v = high * Math.exp(-i / (decay * c.sr)) * gain;
    c.add(start + i, v * (1 - pan * 0.5), v * (1 + pan * 0.5));
  }
}

/** Ride / crash-ish metallic noise. */
export function cymbal(c: Canvas, t: number, seed: number, decay = 0.6, gain = 0.25): void {
  const rnd = noise(seed);
  const f = new SVF(c.sr);
  f.set(6000, 0.5);
  const start = Math.round(t * c.sr);
  const n = Math.round(decay * 5 * c.sr);
  for (let i = 0; i < n; i++) {
    const s = i / c.sr;
    const metal = square(5170 * s) * square(7230 * s) * 0.3;
    const [, band, high] = f.process(rnd() + metal);
    const v = (band * 0.4 + high) * Math.exp(-s / decay) * gain;
    c.add(start + i, v, v * 0.9);
  }
}

export interface SynthNote {
  t: number; // start time (s)
  dur: number; // seconds
  note: number; // MIDI note
  vel?: number;
  slide?: number; // glide from this MIDI note (acid slides / 808 glides)
  accent?: boolean;
}

export interface VoiceOpts {
  wave: 'saw' | 'square' | 'sine' | 'tri' | 'supersaw' | 'pulse';
  cutoff: number;
  res?: number;
  envMod?: number; // filter envelope amount (Hz)
  envDecay?: number; // s
  attack?: number;
  release?: number;
  gain?: number;
  drive?: number;
  detune?: number; // cents, for supersaw / hoover
  voices?: number;
  bits?: number; // bitcrush
  glide?: number; // s
  pump?: { beat: number; depth: number }; // sidechain duck every `beat` seconds
  width?: number; // stereo spread 0..1
  vibrato?: number; // semitones
}

/** Render a monophonic or chord part with a resonant filter + envelopes. */
export function synth(c: Canvas, notes: SynthNote[], o: VoiceOpts, seed = 1): void {
  const rnd = noise(seed);
  const voices = o.wave === 'supersaw' ? (o.voices ?? 7) : o.wave === 'pulse' ? 2 : 1;
  for (const nt of notes) {
    const fl = new SVF(c.sr);
    const fr = new SVF(c.sr);
    const start = Math.round(nt.t * c.sr);
    const rel = o.release ?? 0.05;
    const n = Math.round((nt.dur + rel) * c.sr);
    const phases = Array.from({ length: voices }, () => (rnd() + 1) / 2);
    const vel = nt.vel ?? 1;
    const accent = nt.accent ? 1.6 : 1;
    for (let i = 0; i < n; i++) {
      const s = i / c.sr;
      const glideT = o.glide ?? 0.06;
      const pitch = nt.slide !== undefined ? nt.note + (nt.slide - nt.note) * Math.exp(-s / glideT) : nt.note;
      const vib = o.vibrato ? o.vibrato * Math.sin(TAU * 5.5 * s) * Math.min(1, s / 0.2) : 0;
      const f = midiToHz(pitch + vib);
      let l = 0;
      let r = 0;
      for (let v = 0; v < voices; v++) {
        const spread = voices > 1 ? (v / (voices - 1)) * 2 - 1 : 0;
        const det = Math.pow(2, ((o.detune ?? 0) * spread) / 1200);
        phases[v] += (f * det) / c.sr;
        const p = phases[v];
        let x: number;
        switch (o.wave) {
          case 'square':
            x = square(p);
            break;
          case 'pulse':
            x = square(p, 0.25 + 0.2 * Math.sin(TAU * 0.7 * s + v));
            break;
          case 'sine':
            x = Math.sin(TAU * p);
            break;
          case 'tri':
            x = tri(p);
            break;
          default:
            x = saw(p);
        }
        const pan = spread * (o.width ?? 0.6);
        l += x * (1 - pan) / voices;
        r += x * (1 + pan) / voices;
      }
      const fenv = Math.exp(-s / (o.envDecay ?? 0.15));
      const cutoff = o.cutoff + (o.envMod ?? 0) * fenv * accent;
      fl.set(cutoff, o.res ?? 0.8);
      fr.set(cutoff, o.res ?? 0.8);
      let yl = fl.process(l)[0];
      let yr = fr.process(r)[0];
      const att = o.attack ?? 0.003;
      let amp = s < att ? s / att : 1;
      if (s > nt.dur) amp *= Math.max(0, 1 - (s - nt.dur) / rel);
      amp *= vel * (nt.accent ? 1.2 : 1) * (o.gain ?? 0.5);
      if (o.pump) {
        const ph = ((nt.t + s) % o.pump.beat) / o.pump.beat;
        amp *= 1 - o.pump.depth * Math.exp(-ph * 6);
      }
      if (o.drive) {
        yl = softClip(yl, o.drive);
        yr = softClip(yr, o.drive);
      }
      if (o.bits) {
        yl = crush(yl, o.bits);
        yr = crush(yr, o.bits);
      }
      c.add(start + i, yl * amp, yr * amp);
    }
  }
}

/** Filtered noise sweep (risers, downlifters, wind). */
export function sweep(
  c: Canvas,
  t: number,
  dur: number,
  seed: number,
  o: { from: number; to: number; gainFrom?: number; gainTo?: number; res?: number },
): void {
  const rnd = noise(seed);
  const f = new SVF(c.sr);
  const start = Math.round(t * c.sr);
  const n = Math.round(dur * c.sr);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    f.set(o.from * Math.pow(o.to / o.from, p), o.res ?? 2);
    const [, band] = f.process(rnd());
    const g = (o.gainFrom ?? 0.1) + ((o.gainTo ?? 1) - (o.gainFrom ?? 0.1)) * p;
    c.add(start + i, band * g, band * g * 0.95);
  }
}
