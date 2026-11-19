/**
 * Loop Lab catalogue: original, procedurally generated loops and sound effects for
 * EDM, rave, techno, scene/electro, breakcore and hyperpop. All sounds are synthesised
 * from code in this repository (MIT licensed) — free to use in mixes, streams and releases.
 */
import { Canvas, clap, crush, cymbal, hat, kick, noise, snare, sweep, synth, SVF, softClip, TAU, type SynthNote } from './dsp';

export type Genre = 'EDM' | 'Rave' | 'Techno' | 'Scene' | 'Breakcore' | 'Hyperpop' | 'FX';
export const GENRES: Genre[] = ['EDM', 'Rave', 'Techno', 'Scene', 'Breakcore', 'Hyperpop', 'FX'];

export interface LoopDef {
  id: string;
  name: string;
  genre: Genre;
  kind: 'drums' | 'bass' | 'synth' | 'build' | 'sfx';
  /** 0 for one-shot sound effects */
  bpm: number;
  bars: number;
  /** length in seconds for one-shots */
  seconds?: number;
  /** has a steady kick/snare pulse that BPM detection can lock onto */
  steadyBeat: boolean;
  render(c: Canvas, bpm: number): void;
}

/** Call fn for every step of a pattern string ('x' = hit, 'o' = accent, '.' = rest). */
function pattern(p: string, stepSec: number, bars: number, fn: (t: number, accent: boolean, i: number) => void): void {
  const steps = p.replace(/\s/g, '');
  const total = Math.round(bars * 16);
  for (let i = 0; i < total; i++) {
    const ch = steps[i % steps.length];
    if (ch === 'x' || ch === 'o') fn(i * stepSec, ch === 'o', i);
  }
}

const s16 = (bpm: number) => 60 / bpm / 4;

/** Chords → note list (root + intervals) on given 16th-step positions per bar. */
function chordStabs(roots: number[], intervals: number[], steps: number[], bpm: number, len16 = 1.5): SynthNote[] {
  const st = s16(bpm);
  const out: SynthNote[] = [];
  roots.forEach((root, bar) => {
    for (const s of steps) for (const iv of intervals) out.push({ t: (bar * 16 + s) * st, dur: st * len16, note: root + iv });
  });
  return out;
}

export const LOOPS: LoopDef[] = [
  // ---------------------------------------------------------------- EDM
  {
    id: 'edm-festival-drums',
    name: 'Festival Drums',
    genre: 'EDM',
    kind: 'drums',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 180, f1: 50, decay: 0.25, drive: 2.2 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 100 + i, 0.75));
      pattern('..x...x...x...x.', st, 4, (t, _a, i) => hat(c, t, 200 + i, { decay: 0.09, gain: 0.3 }));
      pattern('xxxxxxxxxxxxxxxx', st, 4, (t, _a, i) => hat(c, t, 300 + i, { decay: 0.015, gain: 0.12, pan: i % 2 ? 0.4 : -0.4 }));
    },
  },
  {
    id: 'edm-supersaw-drop',
    name: 'Supersaw Drop Chords',
    genre: 'EDM',
    kind: 'synth',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const notes = chordStabs([57, 53, 60, 55], [0, 12, 15, 19], [2, 6, 10, 14], bpm, 1.6);
      synth(c, notes, { wave: 'supersaw', cutoff: 2500, envMod: 4000, envDecay: 0.12, res: 0.9, detune: 22, gain: 0.55, width: 0.8, release: 0.06 });
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 170, f1: 52, decay: 0.2, drive: 2, gain: 0.8 }));
    },
  },
  {
    id: 'edm-pump-bass',
    name: 'Sidechain Pump Bass',
    genre: 'EDM',
    kind: 'bass',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      const roots = [33, 29, 36, 31];
      const notes: SynthNote[] = [];
      roots.forEach((r, bar) => {
        for (let b = 0; b < 4; b++) notes.push({ t: (bar * 4 + b + 0.5) * beat, dur: beat * 0.45, note: r + 12 });
      });
      synth(c, notes, { wave: 'saw', cutoff: 400, envMod: 1500, envDecay: 0.08, res: 1.2, gain: 0.8, drive: 1.5 });
      for (let b = 0; b < 16; b++) kick(c, b * beat, { f0: 160, f1: 48, decay: 0.22, drive: 1.8, gain: 0.9 });
    },
  },

  // ---------------------------------------------------------------- Rave
  {
    id: 'rave-hoover-rush',
    name: 'Hoover Rush',
    genre: 'Rave',
    kind: 'synth',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      const notes: SynthNote[] = [
        { t: 0, dur: beat * 3.5, note: 50, slide: 62 },
        { t: beat * 4, dur: beat * 3.5, note: 48, slide: 55 },
        { t: beat * 8, dur: beat * 3.5, note: 53, slide: 65 },
        { t: beat * 12, dur: beat * 3.5, note: 45, slide: 57 },
      ];
      synth(c, notes, { wave: 'pulse', cutoff: 1800, envMod: 1200, envDecay: 0.4, res: 0.7, detune: 35, gain: 0.5, glide: 0.25, vibrato: 0.15, drive: 1.3, release: 0.15, width: 0.9 });
      synth(
        c,
        notes.map((n) => ({ ...n, note: n.note + 12, slide: n.slide !== undefined ? n.slide + 12 : undefined })),
        { wave: 'saw', cutoff: 2200, res: 0.6, detune: 18, gain: 0.25, glide: 0.25, vibrato: 0.12, release: 0.15 },
      );
      for (let b = 0; b < 16; b++) kick(c, b * beat, { f0: 150, f1: 50, decay: 0.18, drive: 1.6, gain: 0.85 });
    },
  },
  {
    id: 'rave-breakbeat',
    name: 'Old-Skool Rave Break',
    genre: 'Rave',
    kind: 'drums',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.........x.....x.........x..x..', st, 4, (t) => kick(c, t, { f0: 140, f1: 55, decay: 0.16, drive: 1.4 }));
      pattern('....x..x.x..x.......x..x.x..x..x', st, 4, (t, _a, i) => snare(c, t, 400 + i, { gain: i % 3 ? 0.55 : 0.8, tone: 210 }));
      pattern('x.x.x.x.x.x.x.x.', st, 4, (t, _a, i) => hat(c, t, 500 + i, { decay: 0.035, gain: 0.25 }));
      cymbal(c, 0, 9, 1.2, 0.18);
    },
  },
  {
    id: 'rave-organ-stabs',
    name: 'Rave Organ Stabs',
    genre: 'Rave',
    kind: 'synth',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const notes = chordStabs([62, 62, 60, 65], [0, 3, 7, 12], [0, 3, 6, 10, 12], bpm, 1.2);
      synth(c, notes, { wave: 'square', cutoff: 3000, envMod: 2500, envDecay: 0.08, res: 0.8, gain: 0.32, width: 0.4, release: 0.04 });
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 150, f1: 50, decay: 0.18, drive: 1.6, gain: 0.85 }));
    },
  },

  // ---------------------------------------------------------------- Techno
  {
    id: 'techno-warehouse-rumble',
    name: 'Warehouse Rumble',
    genre: 'Techno',
    kind: 'drums',
    bpm: 132,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      for (let b = 0; b < 16; b++) {
        kick(c, b * beat, { f0: 130, f1: 45, decay: 0.22, drive: 2.5 });
        // rumble: dark, distorted, delayed kick tails between the kicks
        kick(c, b * beat + beat * 0.5, { f0: 70, f1: 42, decay: 0.12, drive: 3, gain: 0.25, click: 0 });
        kick(c, b * beat + beat * 0.75, { f0: 60, f1: 40, decay: 0.08, drive: 3, gain: 0.15, click: 0 });
        hat(c, b * beat + beat / 2, 600 + b, { decay: 0.05, gain: 0.3 });
      }
      cymbal(c, beat * 15.5, 7, 0.4, 0.12);
    },
  },
  {
    id: 'techno-acid-line',
    name: 'Acid Line 303',
    genre: 'Techno',
    kind: 'bass',
    bpm: 132,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const st = s16(bpm);
      const seq = [36, 36, 48, 36, 39, 36, 46, 36, 36, 43, 36, 48, 36, 41, 39, 36];
      const accents = [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
      const slides = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0];
      const notes: SynthNote[] = [];
      for (let i = 0; i < 64; i++) {
        const k = i % 16;
        const prev = seq[(k + 15) % 16];
        notes.push({ t: i * st, dur: st * (slides[k] ? 1.05 : 0.6), note: seq[k], accent: !!accents[k], slide: slides[(k + 15) % 16] ? prev : undefined });
      }
      synth(c, notes, { wave: 'saw', cutoff: 380, envMod: 2600, envDecay: 0.1, res: 7, gain: 0.55, drive: 2.2, glide: 0.03, release: 0.01 });
    },
  },
  {
    id: 'techno-hypnotic-perc',
    name: 'Hypnotic Perc',
    genre: 'Techno',
    kind: 'drums',
    bpm: 132,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 140, f1: 48, decay: 0.2, drive: 2 }));
      pattern('o.x.o.xxo.x.o.x.', st, 4, (t, a, i) => hat(c, t, 700 + i, { decay: a ? 0.05 : 0.02, gain: a ? 0.3 : 0.15, pan: Math.sin(i) * 0.6 }));
      pattern('......x.....x..x', st, 4, (t, _a, i) => snare(c, t, 800 + i, { tone: 420, decay: 0.03, gain: 0.35, bright: 4000 }));
    },
  },

  // ---------------------------------------------------------------- Scene / electro
  {
    id: 'scene-electro-fidget',
    name: 'Electro Fidget Bass',
    genre: 'Scene',
    kind: 'bass',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      const st = s16(bpm);
      const roots = [40, 40, 43, 38];
      const notes: SynthNote[] = [];
      roots.forEach((r, bar) => {
        for (let k = 0; k < 16; k += 2) notes.push({ t: (bar * 16 + k) * st, dur: st * 1.8, note: r + (k === 10 ? 12 : 0), accent: k % 8 === 0 });
      });
      synth(c, notes, { wave: 'saw', cutoff: 300, envMod: 3500, envDecay: 0.06, res: 2.5, gain: 0.6, drive: 4, detune: 12, voices: 3, bits: 7, release: 0.02 });
      for (let b = 0; b < 16; b++) kick(c, b * beat, { f0: 170, f1: 50, decay: 0.2, drive: 2.5, gain: 0.9 });
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 900 + i, 0.7));
    },
  },
  {
    id: 'scene-bitcrush-drums',
    name: 'Bitcrush Club Drums',
    genre: 'Scene',
    kind: 'drums',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x...x..x', st, 4, (t) => kick(c, t, { f0: 200, f1: 52, decay: 0.2, drive: 3 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => snare(c, t, 1000 + i, { gain: 0.8, tone: 230 }));
      pattern('x.xxx.xxx.xxx.xo', st, 4, (t, a, i) => hat(c, t, 1100 + i, { decay: a ? 0.08 : 0.02, gain: 0.22 }));
      for (let i = 0; i < c.length; i++) {
        c.L[i] = crush(c.L[i], 8);
        c.R[i] = crush(c.R[i], 8);
      }
    },
  },
  {
    id: 'scene-snare-build',
    name: 'Snare Roll Build',
    genre: 'Scene',
    kind: 'build',
    bpm: 128,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const beat = 60 / bpm;
      const bar = beat * 4;
      // 1 bar of quarters, 1 of 8ths, 1 of 16ths, 1 of 32nds — rising in pitch and level
      const divs = [1, 2, 4, 8];
      divs.forEach((d, b) => {
        for (let k = 0; k < 4 * d; k++) {
          const t = b * bar + (k * beat) / d;
          const p = (b * bar + (k * beat) / d) / (4 * bar);
          snare(c, t, 1200 + b * 64 + k, { tone: 180 + 260 * p, gain: 0.35 + 0.55 * p, decay: 0.08 });
        }
      });
      sweep(c, 0, 4 * bar, 77, { from: 300, to: 9000, gainFrom: 0.02, gainTo: 0.6, res: 3 });
    },
  },

  // ---------------------------------------------------------------- Breakcore
  {
    id: 'breakcore-choppy-break',
    name: 'Choppy Break 180',
    genre: 'Breakcore',
    kind: 'drums',
    bpm: 180,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.x.......x.....x.........xx....x.x...x...x.x.....x.x...x.....xx', st, 4, (t) => kick(c, t, { f0: 160, f1: 55, decay: 0.12, drive: 2.4 }));
      pattern('....x..x.x..x.x.....x.xx..x.x..x....x..x.x.xx.x.....x.x..xxxxxxx', st, 4, (t, _a, i) =>
        snare(c, t, 1300 + i, { gain: i % 4 === 0 ? 0.95 : 0.6, tone: 200 + (i % 5) * 25, decay: 0.09 }),
      );
      pattern('x.x.x.x.x.x.x.x.', st, 4, (t, _a, i) => hat(c, t, 1400 + i, { decay: 0.02, gain: 0.2, pan: i % 2 ? 0.5 : -0.5 }));
      cymbal(c, 0, 13, 0.9, 0.2);
      // stutter: repeat the first 1/32 of the last beat 4 times
      const len = Math.round((st / 2) * c.sr);
      const from = Math.round(st * 60 * c.sr);
      for (let k = 1; k < 4; k++)
        for (let i = 0; i < len; i++) {
          const j = from + k * len + i;
          if (j < c.length) {
            c.L[j] = c.L[from + i];
            c.R[j] = c.R[from + i];
          }
        }
    },
  },
  {
    id: 'breakcore-gabber-run',
    name: 'Gabber Kick Run',
    genre: 'Breakcore',
    kind: 'drums',
    bpm: 180,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      for (let b = 0; b < 16; b++) {
        if (b === 15) {
          for (let k = 0; k < 3; k++) kick(c, (b + k / 3) * beat, { f0: 220, f1: 60, decay: 0.08, drive: 8, gain: 0.85 });
        } else kick(c, b * beat, { f0: 240, f1: 58, decay: 0.16, drive: 9 });
        hat(c, (b + 0.5) * beat, 1500 + b, { decay: 0.04, gain: 0.25 });
      }
    },
  },
  {
    id: 'breakcore-reese',
    name: 'Reese Pressure',
    genre: 'Breakcore',
    kind: 'bass',
    bpm: 180,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const beat = 60 / bpm;
      const notes: SynthNote[] = [
        { t: 0, dur: beat * 6, note: 31 },
        { t: beat * 6.5, dur: beat * 1.3, note: 34 },
        { t: beat * 8, dur: beat * 6, note: 29 },
        { t: beat * 14.5, dur: beat * 1.3, note: 26 },
      ];
      synth(c, notes, { wave: 'supersaw', voices: 2, detune: 28, cutoff: 600, envMod: 300, envDecay: 1, res: 1.2, gain: 0.8, drive: 2, width: 0.7, attack: 0.02, release: 0.1 });
    },
  },

  // ---------------------------------------------------------------- Hyperpop
  {
    id: 'hyperpop-glitter-808',
    name: 'Glitter 808',
    genre: 'Hyperpop',
    kind: 'bass',
    bpm: 160,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      const notes: SynthNote[] = [
        { t: 0, dur: st * 6, note: 37 },
        { t: st * 6, dur: st * 4, note: 44, slide: 37 },
        { t: st * 12, dur: st * 4, note: 41 },
        { t: st * 16, dur: st * 6, note: 37 },
        { t: st * 22, dur: st * 2, note: 49, slide: 37 },
        { t: st * 26, dur: st * 6, note: 39 },
      ];
      const all = [...notes, ...notes.map((n) => ({ ...n, t: n.t + st * 32 }))];
      synth(c, all, { wave: 'sine', cutoff: 8000, gain: 1, drive: 3.5, glide: 0.05, bits: 6, release: 0.08 });
      pattern('x.....x.....x...', st, 4, (t) => kick(c, t, { f0: 200, f1: 60, decay: 0.08, drive: 2, gain: 0.7 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 1600 + i, 0.7));
    },
  },
  {
    id: 'hyperpop-bubblegum-arp',
    name: 'Bubblegum Arp',
    genre: 'Hyperpop',
    kind: 'synth',
    bpm: 160,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const st = s16(bpm);
      const chords = [
        [73, 77, 80, 85],
        [70, 73, 77, 82],
        [66, 70, 73, 78],
        [68, 72, 75, 80],
      ];
      const notes: SynthNote[] = [];
      for (let i = 0; i < 64; i++) {
        const ch = chords[Math.floor(i / 16)];
        const up = [0, 1, 2, 3, 2, 1][i % 6];
        notes.push({ t: i * st, dur: st * 0.7, note: ch[up] + (i % 8 === 7 ? 12 : 0), vel: i % 4 === 0 ? 1 : 0.7 });
      }
      synth(c, notes, { wave: 'square', cutoff: 2500, envMod: 5000, envDecay: 0.05, res: 1, gain: 0.3, width: 0.9, bits: 9, release: 0.03 });
      // ping-pong echo
      const d = Math.round(st * 3 * c.sr);
      for (let i = c.length - 1; i >= d; i--) {
        c.L[i] += c.R[i - d] * 0.35;
        c.R[i] += c.L[i - d] * 0.3;
      }
    },
  },
  {
    id: 'hyperpop-crushed-drums',
    name: 'Crushed Pop Drums',
    genre: 'Hyperpop',
    kind: 'drums',
    bpm: 160,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.........x.....x.....x...x.....', st, 4, (t) => kick(c, t, { f0: 220, f1: 55, decay: 0.15, drive: 3 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 1700 + i, 0.9));
      pattern('x.x.x.x.xxx.x.x.x.x.x.x.xxxxxxxx', st, 4, (t, _a, i) => hat(c, t, 1800 + i, { decay: 0.018, gain: 0.2, pan: ((i % 4) - 1.5) / 2 }));
      for (let i = 0; i < c.length; i++) {
        c.L[i] = crush(softClip(c.L[i], 1.5), 6);
        c.R[i] = crush(softClip(c.R[i], 1.5), 6);
      }
    },
  },

  // ---------------------------------------------------------------- FX one-shots
  {
    id: 'fx-air-horn',
    name: 'Air Horn',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 2.2,
    steadyBeat: false,
    render(c) {
      const blasts = [
        [0, 0.18],
        [0.25, 0.18],
        [0.5, 1.1],
      ];
      for (const [t, d] of blasts) {
        synth(
          c,
          [70, 74, 77].map((n) => ({ t, dur: d, note: n, slide: n + 0.6 })),
          { wave: 'square', cutoff: 3000, res: 1.5, gain: 0.45, drive: 2.5, detune: 15, glide: 0.08, release: 0.06 },
        );
      }
    },
  },
  {
    id: 'fx-riser',
    name: 'White Noise Riser',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 4,
    steadyBeat: false,
    render(c) {
      sweep(c, 0, 3.9, 21, { from: 200, to: 12000, gainFrom: 0.02, gainTo: 0.9, res: 2.5 });
      // rising saw
      let ph = 0;
      for (let i = 0; i < 3.8 * c.sr; i++) {
        const p = i / (3.8 * c.sr);
        ph += (110 * Math.pow(8, p)) / c.sr;
        const v = 2 * (ph - Math.floor(ph + 0.5)) * 0.15 * p;
        c.add(i, v, v);
      }
    },
  },
  {
    id: 'fx-downlifter',
    name: 'Downlifter',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 3,
    steadyBeat: false,
    render(c) {
      sweep(c, 0, 2.9, 31, { from: 10000, to: 150, gainFrom: 0.9, gainTo: 0.0, res: 2 });
    },
  },
  {
    id: 'fx-impact',
    name: 'Sub Impact',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 3,
    steadyBeat: false,
    render(c) {
      kick(c, 0, { f0: 140, f1: 28, sweep: 0.12, decay: 0.8, drive: 2, gain: 1 });
      cymbal(c, 0, 41, 1.4, 0.35);
    },
  },
  {
    id: 'fx-laser',
    name: 'Laser Zaps',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 1.2,
    steadyBeat: false,
    render(c) {
      for (const t0 of [0, 0.22, 0.44]) {
        let ph = 0;
        const n = Math.round(0.2 * c.sr);
        for (let i = 0; i < n; i++) {
          const s = i / c.sr;
          ph += (3200 * Math.exp(-s / 0.04) + 180) / c.sr;
          const v = Math.sin(TAU * ph) * Math.exp(-s / 0.08) * 0.6;
          c.add(Math.round(t0 * c.sr) + i, v, v * 0.7);
        }
      }
    },
  },
  {
    id: 'fx-siren',
    name: 'Rave Siren',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 3,
    steadyBeat: false,
    render(c) {
      let ph = 0;
      const n = Math.round(2.9 * c.sr);
      for (let i = 0; i < n; i++) {
        const s = i / c.sr;
        ph += (700 + 350 * Math.sin(TAU * 1.5 * s)) / c.sr;
        const env = Math.min(1, s / 0.05) * Math.min(1, (2.9 - s) / 0.2);
        const v = softClip(Math.sin(TAU * ph) * 2, 1.5) * 0.4 * env;
        c.add(i, v, v);
      }
    },
  },
  {
    id: 'fx-rewind',
    name: 'Rewind',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 1.4,
    steadyBeat: false,
    render(c) {
      const rnd = noise(55);
      const f = new SVF(c.sr);
      let ph = 0;
      const n = Math.round(1.3 * c.sr);
      for (let i = 0; i < n; i++) {
        const p = i / n;
        // fast backwards-spin wobble: pitch accelerates then drops
        const speed = Math.sin(Math.PI * p) * 12;
        ph += (60 * speed + 30) / c.sr;
        f.set(400 + 4000 * Math.sin(Math.PI * p), 2);
        const [, band] = f.process(rnd() * 0.5 + Math.sin(TAU * ph));
        const v = band * 0.6 * (1 - p * 0.6);
        c.add(i, v, v);
      }
    },
  },
  {
    id: 'fx-glitch',
    name: 'Glitch Stutter',
    genre: 'FX',
    kind: 'sfx',
    bpm: 0,
    bars: 0,
    seconds: 1,
    steadyBeat: false,
    render(c) {
      const rnd = noise(99);
      const grain = Math.round(0.03 * c.sr);
      for (let g = 0; g < 24; g++) {
        const f0 = 200 + ((g * 7919) % 2400);
        let ph = 0;
        const start = Math.round(g * grain * 1.35);
        for (let i = 0; i < grain; i++) {
          ph += f0 / c.sr;
          const v = crush(Math.sign(Math.sin(TAU * ph)) * 0.3 + rnd() * 0.1, 4) * (1 - i / grain);
          c.add(start + i, v * (g % 2 ? 1 : 0.4), v * (g % 2 ? 0.4 : 1));
        }
      }
    },
  },
];

export function loopLengthSeconds(def: LoopDef): number {
  return def.bpm > 0 ? (def.bars * 4 * 60) / def.bpm : (def.seconds ?? 2);
}

/** Render a loop to stereo channels. Beat loops wrap their tails so they repeat seamlessly. */
export function renderLoop(def: LoopDef, sampleRate: number): Float32Array[] {
  const len = Math.round(loopLengthSeconds(def) * sampleRate);
  const c = new Canvas(sampleRate, len, def.bpm > 0);
  def.render(c, def.bpm);
  c.normalize();
  return [c.L, c.R];
}

export function findLoop(id: string): LoopDef | undefined {
  return LOOPS.find((l) => l.id === id);
}

/** "Big Kick 128bpm.wav" / "loop_174_BPM" → 128 / 174 (common in loop pack file names). */
export function bpmFromName(name: string): number {
  const m = name.match(/(?:^|[^\d])(\d{2,3}(?:\.\d+)?)\s*-?_?bpm/i) ?? name.match(/bpm\s*-?_?(\d{2,3}(?:\.\d+)?)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return v >= 50 && v <= 250 ? v : 0;
}
