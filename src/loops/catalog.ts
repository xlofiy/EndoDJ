/**
 * Loop Lab catalogue for EDM, rave, techno, hardstyle, Jersey club, scene/electro, breakcore and hyperpop:
 *  - CC0 (public-domain) loops and FX from OpenGameArt, cut/verified by the pipeline described
 *    in docs/THIRD_PARTY.md and shipped in public/loops/ (first in the list), and
 *  - original loops and FX synthesised from code in this repository (MIT).
 * Everything is free to use in mixes, streams and releases.
 */
import { Canvas, clap, crush, cymbal, hat, kick, noise, snare, sweep, synth, SVF, softClip, TAU, type SynthNote } from './dsp';

export type Genre = 'EDM' | 'Rave' | 'Techno' | 'Hardstyle' | 'Jersey Club' | 'Scene' | 'Breakcore' | 'Hyperpop' | 'FX';
export const GENRES: Genre[] = ['EDM', 'Rave', 'Techno', 'Hardstyle', 'Jersey Club', 'Scene', 'Breakcore', 'Hyperpop', 'FX'];

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
  /** musical key ("Am", "F#"…); omitted for unpitched drums, FX and unclear material */
  key?: string;
  /** synthesised loops: draws the sound into the canvas */
  render?: (c: Canvas, bpm: number) => void;
  /** bundled recordings: file name in public/loops/ (starts on a downbeat, exact bar length) */
  file?: string;
  credit?: { title: string; author: string; url: string; license: 'CC0' };
}

const OGA = 'https://opengameart.org/content/';

/** Bundled CC0 material (BPM / key / length verified when cut — see docs/THIRD_PARTY.md). */
const BUNDLED: LoopDef[] = [
  {
    id: 'cc0-techno-oioioi',
    name: 'OIOI Warehouse',
    genre: 'Techno',
    kind: 'drums',
    bpm: 110,
    bars: 8,
    steadyBeat: true,
    key: 'Bm',
    file: 'cc0-techno-oioioi.ogg',
    credit: { title: 'OIOIOIOIOIOI', author: 'cinameng', url: `${OGA}oioioioioioi`, license: 'CC0' },
  },
  {
    id: 'cc0-techno-tense-drums',
    name: 'Tense Bass Drums',
    genre: 'Techno',
    kind: 'drums',
    bpm: 140,
    bars: 2,
    steadyBeat: true,
    key: 'D',
    file: 'cc0-techno-tense-drums.ogg',
    credit: { title: 'Tense Bass Boost Drum Loop 140 BPM', author: 'Fupi', url: `${OGA}tense-bass-boost-drum-loop-140-bpm`, license: 'CC0' },
  },
  {
    id: 'cc0-edm-technomania',
    name: 'Technomania Drop',
    genre: 'EDM',
    kind: 'synth',
    bpm: 142,
    bars: 8,
    steadyBeat: true,
    key: 'Bm',
    file: 'cc0-edm-technomania.ogg',
    credit: { title: "Technomania101 - 2000's europop electronic dance music", author: 'Fupi', url: `${OGA}technomania101-2000s-europop-electronic-dance-music`, license: 'CC0' },
  },
  {
    id: 'cc0-edm-simple-drumbeat',
    name: 'Simple Drumbeat',
    genre: 'EDM',
    kind: 'drums',
    bpm: 140,
    bars: 8,
    steadyBeat: true,
    file: 'cc0-edm-simple-drumbeat.ogg',
    credit: { title: 'simple drumbeat', author: 'Turnovus', url: `${OGA}simple-drumbeat`, license: 'CC0' },
  },
  {
    id: 'cc0-rave-wuffly',
    name: 'Ravey Wuffly Land',
    genre: 'Rave',
    kind: 'synth',
    bpm: 125,
    bars: 8,
    steadyBeat: true,
    file: 'cc0-rave-wuffly.ogg',
    credit: { title: 'Things Got a Bit Ravey in Wuffly Land Tonight', author: 'Spring Spring', url: `${OGA}things-got-a-bit-ravey-in-wuffly-land-tonight`, license: 'CC0' },
  },
  ...(
    [
      ['cc0-vinyl-start-aidanwalker', 'Vinyl Spin-Up', 4.1, 'Vinyl', 'Aidan_Walker', 'vinyl'],
      ['cc0-siren-aquinn', 'Alarm Siren', 4, 'Sirens and Alarm Noise', 'aquinn', 'sirens-and-alarm-noise'],
      ['cc0-distant-boom-nenadsimic', 'Distant Boom', 4, 'Muffled Distant Explosion', 'NenadSimic', 'muffled-distant-explosion'],
      ['cc0-laser-cannon-tad', 'Laser Cannon', 3.5, 'Doomsday Laser Cannon Sound Effect', 'TAD', 'doomsday-laser-cannon-sound-effect'],
      ['cc0-laser-kenney', 'Digital Laser', 1.53, '63 Digital sound effects', 'Kenney', '63-digital-sound-effects-lasers-phasers-space-etc'],
      ['cc0-zap-up-kenney', 'Zap Up', 1.09, '63 Digital sound effects', 'Kenney', '63-digital-sound-effects-lasers-phasers-space-etc'],
      ['cc0-phaser-up-kenney', 'Phaser Up', 0.42, '63 Digital sound effects', 'Kenney', '63-digital-sound-effects-lasers-phasers-space-etc'],
      ['cc0-phaser-down-kenney', 'Phaser Down', 0.25, '63 Digital sound effects', 'Kenney', '63-digital-sound-effects-lasers-phasers-space-etc'],
      ['cc0-synth-laser-rubberduck', 'Synth Laser', 0.22, '50 CC0 retro / synth SFX', 'rubberduck', '50-cc0-retro-synth-sfx'],
      ['cc0-retro-explosion-rubberduck', 'Retro Blast', 1.05, '50 CC0 retro / synth SFX', 'rubberduck', '50-cc0-retro-synth-sfx'],
      ['cc0-power-up-rubberduck', 'Power Up', 0.54, '50 CC0 retro / synth SFX', 'rubberduck', '50-cc0-retro-synth-sfx'],
      ['cc0-swish-artisticdude', 'Swish', 0.17, 'Swishes Sound Pack', 'artisticdude', 'swishes-sound-pack'],
    ] as const
  ).map(
    ([id, name, seconds, title, author, page]): LoopDef => ({
      id,
      name,
      genre: 'FX',
      kind: 'sfx',
      bpm: 0,
      bars: 0,
      seconds,
      steadyBeat: false,
      file: `${id}.ogg`,
      credit: { title, author, url: OGA + page, license: 'CC0' },
    }),
  ),
];

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

const MINOR = [0, 12, 15, 19];
const MAJOR = [0, 12, 16, 19];

/** Chords (root + intervals, one chord per bar) → notes on the given 16th-step positions. */
function chordStabs(chords: [number, number[]][], steps: number[], bpm: number, len16 = 1.5): SynthNote[] {
  const st = s16(bpm);
  const out: SynthNote[] = [];
  chords.forEach(([root, intervals], bar) => {
    for (const s of steps) for (const iv of intervals) out.push({ t: (bar * 16 + s) * st, dur: st * len16, note: root + iv });
  });
  return out;
}

export const LOOPS: LoopDef[] = [
  ...BUNDLED,
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
    key: 'Am',
    name: 'Supersaw Drop Chords',
    genre: 'EDM',
    kind: 'synth',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      // Am – F – C – G
      const notes = chordStabs([[57, MINOR], [53, MAJOR], [48, MAJOR], [55, MAJOR]], [2, 6, 10, 14], bpm, 1.6);
      synth(c, notes, { wave: 'supersaw', cutoff: 2500, envMod: 4000, envDecay: 0.12, res: 0.9, detune: 22, gain: 0.55, width: 0.8, release: 0.06 });
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 170, f1: 52, decay: 0.2, drive: 2, gain: 0.8 }));
    },
  },
  {
    id: 'edm-pump-bass',
    key: 'Am',
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
    key: 'Dm',
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
    key: 'Dm',
    name: 'Rave Organ Stabs',
    genre: 'Rave',
    kind: 'synth',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      // Dm – Dm – C – F
      const notes = chordStabs([[62, [0, 3, 7, 12]], [62, [0, 3, 7, 12]], [60, [0, 4, 7, 12]], [65, [0, 4, 7, 12]]], [0, 3, 6, 10, 12], bpm, 1.2);
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
    key: 'Cm',
    name: 'Acid Line 303',
    genre: 'Techno',
    kind: 'bass',
    bpm: 132,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const st = s16(bpm);
      // C minor: the Eb (39/51) carries the minor colour
      const seq = [36, 36, 48, 39, 36, 43, 46, 36, 39, 36, 48, 51, 36, 43, 39, 36];
      const accents = [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
      const slides = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0];
      const notes: SynthNote[] = [];
      for (let i = 0; i < 64; i++) {
        const k = i % 16;
        const prev = seq[(k + 15) % 16];
        notes.push({ t: i * st, dur: st * (slides[k] ? 1.05 : 0.6), note: seq[k], accent: !!accents[k], slide: slides[(k + 15) % 16] ? prev : undefined });
      }
      synth(c, notes, { wave: 'saw', cutoff: 380, envMod: 2600, envDecay: 0.1, res: 7, gain: 0.55, drive: 1.6, glide: 0.03, release: 0.01 });
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
    key: 'Em',
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
    key: 'Gm',
    name: 'Reese Pressure',
    genre: 'Breakcore',
    kind: 'bass',
    bpm: 180,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const beat = 60 / bpm;
      // G minor: G – Bb – Eb – D
      const notes: SynthNote[] = [
        { t: 0, dur: beat * 3.6, note: 31 },
        { t: beat * 4, dur: beat * 3.6, note: 34 },
        { t: beat * 8, dur: beat * 5.6, note: 27 },
        { t: beat * 14, dur: beat * 1.8, note: 26 },
      ];
      synth(c, notes, { wave: 'supersaw', voices: 2, detune: 28, cutoff: 600, envMod: 300, envDecay: 1, res: 1.2, gain: 0.8, drive: 2, width: 0.7, attack: 0.02, release: 0.1 });
    },
  },

  // ---------------------------------------------------------------- Hyperpop
  {
    id: 'hyperpop-glitter-808',
    key: 'Db',
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
    key: 'Db',
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

  // ---------------------------------------------------------------- more loops per genre
  {
    id: 'edm-house-groove',
    name: 'House Groove',
    genre: 'EDM',
    kind: 'drums',
    bpm: 124,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 150, f1: 48, decay: 0.24, drive: 1.6 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 700 + i, 0.6));
      pattern('..x...x...x...x.', st, 4, (t, _a, i) => hat(c, t, 710 + i, { decay: 0.16, gain: 0.28 }));
      pattern('x.xxx.xxx.xxx.xx', st, 4, (t, _a, i) => hat(c, t, 720 + i, { decay: 0.02, gain: 0.1, pan: Math.sin(i) * 0.5 }));
    },
  },
  {
    id: 'edm-big-room-lead',
    key: 'Em',
    name: 'Big Room Lead',
    genre: 'EDM',
    kind: 'synth',
    bpm: 128,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      // E minor off-beat hook (E G B G / E G D B)
      const riff = [52, 55, 59, 55, 52, 55, 62, 59];
      const notes: SynthNote[] = [];
      for (let i = 0; i < 32; i++) notes.push({ t: (4 * i + 2) * st, dur: st * 1.6, note: riff[i % 8] });
      synth(c, notes, { wave: 'square', cutoff: 1800, envMod: 2500, envDecay: 0.08, res: 0.8, gain: 0.35, drive: 1.6, width: 0.5 });
      pattern('..x...x...x...x.', st, 4, (t, _a, i) => hat(c, t, 690 + i, { decay: 0.06, gain: 0.3 }));
      synth(c, [0, 4, 8, 12].map((b) => ({ t: b * 4 * st, dur: st * 15, note: 40 })), { wave: 'saw', cutoff: 300, gain: 0.45 });
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 200, f1: 50, decay: 0.3, drive: 2.5, gain: 0.9 }));
    },
  },
  {
    id: 'rave-jungle-break',
    name: 'Jungle Break',
    genre: 'Rave',
    kind: 'drums',
    bpm: 170,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.x.......xx....x.x.......x.....', st, 4, (t) => kick(c, t, { f0: 130, f1: 52, decay: 0.15, drive: 1.3 }));
      pattern('....o..x.x..o.......o..x.x..o..x', st, 4, (t, a, i) => snare(c, t, 730 + i, { gain: a ? 0.85 : 0.45, tone: 230 }));
      pattern('x.x.x.x.x.x.x.x.', st, 4, (t, _a, i) => hat(c, t, 740 + i, { decay: 0.03, gain: 0.22 }));
    },
  },
  {
    id: 'rave-trance-gate',
    key: 'Am',
    name: 'Trance Gate Chords',
    genre: 'Rave',
    kind: 'synth',
    bpm: 138,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      // Am – Am – F – G, gated on 16ths
      const steps = [0, 2, 4, 6, 8, 10, 12, 14];
      const notes = chordStabs([[57, MINOR], [57, MINOR], [53, MAJOR], [55, MAJOR]], steps, bpm, 0.8);
      synth(c, notes, { wave: 'supersaw', cutoff: 3000, envMod: 2000, envDecay: 0.06, res: 0.6, detune: 18, gain: 0.45, width: 0.9 });
      synth(c, [0, 1, 2, 3].map((b) => ({ t: (b * 16 * 60) / bpm / 4, dur: (15 * 60) / bpm / 4, note: [33, 33, 29, 31][b] })), { wave: 'saw', cutoff: 350, gain: 0.5 });
      for (let b = 0; b < 16; b++) kick(c, (b * 60) / bpm, { f0: 160, f1: 50, decay: 0.2, drive: 1.8, gain: 0.85 });
    },
  },
  {
    id: 'techno-peak-time',
    name: 'Peak-Time Drums',
    genre: 'Techno',
    kind: 'drums',
    bpm: 132,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 140, f1: 45, decay: 0.3, drive: 3, gain: 0.95 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 750 + i, 0.5));
      pattern('..x...x...x...x.', st, 4, (t, _a, i) => cymbal(c, t, 760 + i, 0.25, 0.12));
      pattern('xxxxxxxxxxxxxxxx', st, 4, (t, _a, i) => hat(c, t, 770 + i, { decay: 0.012, gain: i % 4 === 2 ? 0.2 : 0.08 }));
    },
  },
  {
    id: 'techno-dark-stab',
    key: 'Fm',
    name: 'Dark Stab',
    genre: 'Techno',
    kind: 'synth',
    bpm: 130,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const notes = chordStabs([[53, MINOR], [53, MINOR], [53, MINOR], [56, MAJOR]], [2, 6, 10, 13], bpm, 1);
      synth(c, notes, { wave: 'saw', cutoff: 900, envMod: 2200, envDecay: 0.07, res: 1.4, gain: 0.5, drive: 1.4, width: 0.6 });
      synth(c, [0, 1, 2, 3].map((b) => ({ t: (b * 16 * 60) / bpm / 4, dur: (15 * 60) / bpm / 4, note: 29 })), { wave: 'sine', cutoff: 200, gain: 0.5 });
      for (let b = 0; b < 16; b++) kick(c, (b * 60) / bpm, { f0: 140, f1: 45, decay: 0.25, drive: 2.5, gain: 0.85 });
    },
  },
  {
    id: 'scene-crunk-bounce',
    name: 'Crunk Bounce',
    genre: 'Scene',
    kind: 'drums',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.....x...x.....x.....x.x.x.....', st, 4, (t) => kick(c, t, { f0: 120, f1: 42, decay: 0.4, drive: 2.2 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 780 + i, 0.8));
      pattern('x.x.x.x.x.x.x.xx', st, 4, (t, _a, i) => hat(c, t, 790 + i, { decay: 0.025, gain: 0.25 }));
    },
  },
  {
    id: 'scene-electro-bass',
    key: 'Gm',
    name: 'Electro Octave Bass',
    genre: 'Scene',
    kind: 'bass',
    bpm: 130,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      const line = [43, 55, 43, 55, 43, 55, 46, 58, 43, 55, 43, 55, 50, 62, 46, 58];
      const notes: SynthNote[] = [];
      for (let i = 0; i < 64; i++) notes.push({ t: i * st, dur: st * 0.7, note: line[i % 16] - 12 });
      synth(c, notes, { wave: 'square', cutoff: 700, envMod: 1800, envDecay: 0.05, res: 1.1, gain: 0.55, drive: 2.2, bits: 7 });
      // a square bass's 3rd harmonic is the fifth (D): a soft G minor chord keeps the key clear
      synth(c, chordStabs([[55, MINOR], [55, MINOR], [55, MINOR], [55, MINOR]], [0, 8], bpm, 6), { wave: 'tri', cutoff: 2000, gain: 0.4 });
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 170, f1: 50, decay: 0.2, drive: 2 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => snare(c, t, 800 + i, { gain: 0.6, bright: 0.8 }));
    },
  },
  {
    id: 'breakcore-amen-shred',
    name: 'Amen Shred',
    genre: 'Breakcore',
    kind: 'drums',
    bpm: 180,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x.x.......x.x...x.x.......x.....', st, 4, (t) => kick(c, t, { f0: 150, f1: 50, decay: 0.12, drive: 2.5 }));
      pattern('....o..x.x.xo.x.....o..xx.xxo.xx', st, 4, (t, a, i) => snare(c, t, 810 + i, { gain: a ? 0.9 : 0.5, tone: 250, decay: 0.08 }));
      pattern('x.x.x.x.x.x.x.x.', st, 4, (t, _a, i) => hat(c, t, 820 + i, { decay: 0.02, gain: 0.2 }));
      for (let i = 0; i < c.L.length; i++) {
        c.L[i] = softClip(c.L[i], 1.8);
        c.R[i] = softClip(c.R[i], 1.8);
      }
    },
  },
  {
    id: 'breakcore-sad-pad',
    key: 'Dm',
    name: 'Sad Pad Break',
    genre: 'Breakcore',
    kind: 'synth',
    bpm: 170,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const bar = (4 * 60) / bpm;
      // Dm – Bb – Dm – A (root-weighted pad)
      const chords: [number, number[]][] = [[50, MINOR], [46, MAJOR], [50, MINOR], [45, MAJOR]];
      const notes: SynthNote[] = [];
      chords.forEach(([r, iv], b) => iv.forEach((x) => notes.push({ t: b * bar, dur: bar * 0.95, note: r + x })));
      synth(c, notes, { wave: 'supersaw', cutoff: 1400, res: 0.5, detune: 14, gain: 0.4, attack: 0.08, release: 0.1, width: 0.9 });
      synth(c, chords.map(([r], b) => ({ t: b * bar, dur: bar * 0.95, note: r - 12 })), { wave: 'sine', cutoff: 300, gain: 0.5 });
      const st = s16(bpm);
      pattern('x.........x.....x.x.......x.....', st, 4, (t) => kick(c, t, { f0: 140, f1: 50, decay: 0.12, drive: 1.6, gain: 0.7 }));
      pattern('....x.......x.xx....x..x....x...', st, 4, (t, _a, i) => snare(c, t, 830 + i, { gain: 0.45, tone: 240 }));
    },
  },
  {
    id: 'hyperpop-sparkle-chords',
    key: 'C',
    name: 'Sparkle Chords',
    genre: 'Hyperpop',
    kind: 'synth',
    bpm: 160,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      // C – G – Am – F, bright and detuned
      const notes = chordStabs([[60, MAJOR], [55, MAJOR], [57, MINOR], [53, MAJOR]], [0, 3, 6, 8, 11, 14], bpm, 1.4);
      synth(c, notes, { wave: 'supersaw', cutoff: 5000, envMod: 3000, envDecay: 0.1, res: 0.5, detune: 30, gain: 0.45, width: 1 });
      synth(c, [0, 1, 2, 3].map((b) => ({ t: (b * 16 * 60) / bpm / 4, dur: (14 * 60) / bpm / 4, note: [36, 31, 33, 29][b] })), { wave: 'sine', cutoff: 400, gain: 0.55, drive: 1.5 });
      const st = s16(bpm);
      pattern('x.....x...x.....', st, 4, (t) => kick(c, t, { f0: 180, f1: 55, decay: 0.15, drive: 2 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 840 + i, 0.6));
    },
  },
  {
    id: 'hyperpop-blown-808',
    key: 'Em',
    name: 'Blown-Out 808',
    genre: 'Hyperpop',
    kind: 'bass',
    bpm: 150,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      const notes: SynthNote[] = [];
      [0, 6, 10, 16, 22, 26, 32, 38, 42, 48, 54, 58].forEach((s, i) => notes.push({ t: s * st, dur: st * 5, note: i % 3 === 2 ? 43 : 40, slide: i % 3 === 2 ? 40 : undefined }));
      synth(c, notes, { wave: 'sine', cutoff: 2000, gain: 0.8, drive: 4, glide: 0.05 });
      pattern('x.....x...x.....', st, 4, (t) => kick(c, t, { f0: 200, f1: 60, decay: 0.08, drive: 2, gain: 0.7 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => snare(c, t, 850 + i, { gain: 0.6, bright: 1 }));
      pattern('xxx.x.xxx.x.xx.x', st, 4, (t, _a, i) => hat(c, t, 860 + i, { decay: 0.015, gain: 0.18 }));
    },
  },

  // ---------------------------------------------------------------- Hardstyle (150 BPM)
  {
    id: 'hardstyle-kick-drums',
    name: 'Hardstyle Kick',
    genre: 'Hardstyle',
    kind: 'drums',
    bpm: 150,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      // punchy, heavily driven kick with a pitched tail
      pattern('x...x...x...x...', st, 4, (t) => kick(c, t, { f0: 300, f1: 55, sweep: 0.02, decay: 0.32, drive: 6, click: 0.6, gain: 0.95 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 870 + i, 0.55));
      pattern('..x...x...x...x.', st, 4, (t, _a, i) => hat(c, t, 880 + i, { decay: 0.08, gain: 0.3 }));
    },
  },
  {
    id: 'hardstyle-reverse-bass',
    key: 'Am',
    name: 'Reverse Bass',
    genre: 'Hardstyle',
    kind: 'bass',
    bpm: 150,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      // kick on the beat, a swelling ("reversed") bass note in between: the classic tok-woooh
      const roots = [45, 45, 41, 43];
      const notes: SynthNote[] = [];
      for (let b = 0; b < 16; b++) notes.push({ t: (b + 0.25) * beat, dur: beat * 0.72, note: roots[b >> 2] - 12 });
      synth(c, notes, { wave: 'saw', cutoff: 500, envMod: 0, res: 0.9, gain: 0.7, drive: 2.5, attack: beat * 0.6, release: 0.01 });
      for (let b = 0; b < 16; b++) kick(c, b * beat, { f0: 300, f1: 55, sweep: 0.02, decay: 0.18, drive: 6, click: 0.6, gain: 0.9 });
    },
  },
  {
    id: 'hardstyle-screech-lead',
    key: 'Am',
    name: 'Euphoric Lead',
    genre: 'Hardstyle',
    kind: 'synth',
    bpm: 150,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const beat = 60 / bpm;
      // A minor melody, held notes with glides
      const mel: [number, number, number][] = [
        [0, 2, 69], [2, 1, 72], [3, 1, 71], [4, 3, 69], [7, 1, 64], [8, 2, 65], [10, 2, 64], [12, 3, 69], [15, 1, 72],
      ];
      const notes = mel.map(([t, d, n], i) => ({ t: t * beat, dur: d * beat * 0.95, note: n, slide: i ? mel[i - 1][2] : undefined }));
      synth(c, notes, { wave: 'supersaw', cutoff: 4000, res: 0.6, detune: 25, gain: 0.45, glide: 0.04, vibrato: 0.12, width: 1 });
      synth(c, [0, 4, 8, 12].map((b, i) => ({ t: b * beat, dur: 4 * beat * 0.95, note: [45, 45, 41, 45][i] - 12 })), { wave: 'saw', cutoff: 250, gain: 0.5 });
      for (let b = 0; b < 16; b++) kick(c, b * beat, { f0: 300, f1: 55, sweep: 0.02, decay: 0.2, drive: 6, click: 0.6, gain: 0.8 });
    },
  },
  {
    id: 'hardstyle-build',
    name: 'Hardstyle Build',
    genre: 'Hardstyle',
    kind: 'build',
    bpm: 150,
    bars: 4,
    steadyBeat: false,
    render(c, bpm) {
      const st = s16(bpm);
      // snare roll: quarters → eighths → sixteenths, rising
      pattern('x...x...x...x...x.x.x.x.x.x.x.x.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', st, 4, (t, _a, i) =>
        snare(c, t, 890 + i, { gain: 0.3 + (i / 64) * 0.6, tone: 200 + i * 3 }),
      );
      sweep(c, 0, 16 * 4 * st, 77, { from: 300, to: 9000, gainFrom: 0.05, gainTo: 0.7, res: 3 });
    },
  },

  // ---------------------------------------------------------------- Jersey Club (140 BPM)
  {
    id: 'jersey-club-kicks',
    name: 'Jersey Club Kicks',
    genre: 'Jersey Club',
    kind: 'drums',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      // the signature bounce: two quarter kicks, then a quick 3-kick run
      pattern('x...x...x..x..x.', st, 4, (t) => kick(c, t, { f0: 170, f1: 50, decay: 0.18, drive: 2.2 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 900 + i, 0.75));
      pattern('x.x.x.x.x.x.x.x.', st, 4, (t, _a, i) => hat(c, t, 910 + i, { decay: 0.02, gain: 0.18 }));
    },
  },
  {
    id: 'jersey-club-squeak',
    name: 'Bed Squeak Bounce',
    genre: 'Jersey Club',
    kind: 'drums',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      pattern('x...x...x..x..x.', st, 4, (t) => kick(c, t, { f0: 170, f1: 50, decay: 0.18, drive: 2.2 }));
      // squeaks: short falling chirps on the off-steps
      pattern('..x...x...x.x..x', st, 4, (t, _a, i) => {
        const start = Math.round(t * c.sr);
        const n = Math.round(0.07 * c.sr);
        let ph = 0;
        for (let k = 0; k < n; k++) {
          ph += (2600 - 1400 * (k / n) + (i % 2) * 300) / c.sr;
          const v = Math.sin(TAU * ph) * Math.sin((Math.PI * k) / n) * 0.35;
          c.add(start + k, v * (i % 2 ? 0.7 : 1), v * (i % 2 ? 1 : 0.7));
        }
      });
      pattern('....x.......x...', st, 4, (t, _a, i) => snare(c, t, 920 + i, { gain: 0.55, bright: 0.9 }));
    },
  },
  {
    id: 'jersey-club-bass',
    key: 'Gm',
    name: 'Jersey Club 808',
    genre: 'Jersey Club',
    kind: 'bass',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      const st = s16(bpm);
      // the 808 follows the kick bounce
      const roots = [43, 43, 46, 43];
      const notes: SynthNote[] = [];
      for (let bar = 0; bar < 4; bar++) for (const s of [0, 4, 8, 11, 14]) notes.push({ t: (bar * 16 + s) * st, dur: st * 2.6, note: roots[bar] - 12 });
      synth(c, notes, { wave: 'sine', cutoff: 1500, gain: 0.85, drive: 2.5 });
      // a driven 808's 3rd harmonic is the fifth (D): a soft G minor chord keeps the key clear
      synth(c, chordStabs(roots.map((r) => [r + 12, r === 46 ? MAJOR : MINOR]), [0, 8], bpm, 6), { wave: 'tri', cutoff: 2000, gain: 0.25 });
      pattern('x...x...x..x..x.', st, 4, (t) => kick(c, t, { f0: 180, f1: 60, decay: 0.06, drive: 1.5, gain: 0.6 }));
      pattern('....x.......x...', st, 4, (t, _a, i) => clap(c, t, 930 + i, 0.7));
    },
  },
  {
    id: 'jersey-club-chords',
    key: 'Cm',
    name: 'Jersey Club Plucks',
    genre: 'Jersey Club',
    kind: 'synth',
    bpm: 140,
    bars: 4,
    steadyBeat: true,
    render(c, bpm) {
      // Cm – Cm – Ab – Bb, plucked on the bounce
      const notes = chordStabs([[60, MINOR], [60, MINOR], [56, MAJOR], [58, MAJOR]], [2, 6, 10, 14], bpm, 1.2);
      synth(c, notes, { wave: 'saw', cutoff: 1200, envMod: 3000, envDecay: 0.06, res: 0.7, gain: 0.45, width: 0.7 });
      synth(c, [0, 1, 2, 3].map((b) => ({ t: (b * 16 * 60) / bpm / 4, dur: (15 * 60) / bpm / 4, note: [36, 36, 32, 34][b] })), { wave: 'sine', cutoff: 300, gain: 0.5 });
      const st = s16(bpm);
      pattern('x...x...x..x..x.', st, 4, (t) => kick(c, t, { f0: 170, f1: 50, decay: 0.15, drive: 2, gain: 0.85 }));
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

/** Render a synthesised loop to stereo channels. Beat loops wrap their tails so they repeat seamlessly. */
export function renderLoop(def: LoopDef, sampleRate: number): Float32Array[] {
  if (!def.render) throw new Error(`${def.id} is a bundled file, not a synthesised loop`);
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

/**
 * Loop packs usually put the tempo in the file name ("Kick 128bpm.wav"). When the detected
 * tempo is the same tempo in another octave (64 / 256), use the octave the name says.
 */
export function withNameHint(detected: number, fileName: string): number {
  const hint = bpmFromName(fileName);
  if (!(hint > 0) || !(detected > 0)) return detected;
  const octave = Math.pow(2, Math.round(Math.log2(hint / detected)));
  const adjusted = detected * octave;
  return Math.abs(adjusted - hint) <= 1 ? Math.round(adjusted * 100) / 100 : detected;
}
