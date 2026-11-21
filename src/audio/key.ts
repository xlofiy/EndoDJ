/**
 * Musical key detection, Camelot notation and key-shift helpers. Pure functions: runs in
 * the analysis worker and in unit tests.
 *
 * Detection: a chromagram where each spectral bin also votes for the pitches it is the 2nd
 * and 3rd harmonic of (so saw/supersaw harmonics do not count as separate notes), matched
 * against key profiles for electronic dance music (after Faraldo et al., "Key Estimation in
 * Electronic Dance Music", ECIR 2016; values tuned against tests/key.test.ts and
 * tests/loops.test.ts).
 */

export interface MusicalKey {
  /** pitch class of the tonic, 0 = C … 11 = B */
  tonic: number;
  minor: boolean;
}

const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const MAJOR_PROFILE = [0.1652, 0.0475, 0.0829, 0.0669, 0.0999, 0.0927, 0.0529, 0.1316, 0.0522, 0.0744, 0.0694, 0.0643];
const MINOR_PROFILE = [0.1724, 0.0534, 0.0708, 0.1031, 0.0616, 0.0855, 0.05, 0.1214, 0.086, 0.0548, 0.0838, 0.0573];
/** each bin votes for f, f/2, f/3 with these weights */
const HARMONIC_WEIGHTS = [1, 0.6, 0.36];

export function keyName(k: MusicalKey): string {
  return k.minor ? `${MINOR_NAMES[k.tonic]}m` : MAJOR_NAMES[k.tonic];
}

/** "Am" / "F#" / "Bbm" → key (accepts sharps and flats). */
export function parseKey(s: string | undefined | null): MusicalKey | null {
  if (!s) return null;
  const m = s.trim().match(/^([A-Ga-g])([#b]?)(m?)$/);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase() as 'c'];
  const tonic = (base + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  return { tonic, minor: m[3] === 'm' };
}

/** Camelot wheel code: "8A" = A minor, "8B" = C major. Adjacent numbers mix harmonically. */
export function camelot(k: MusicalKey): string {
  const majorTonic = k.minor ? (k.tonic + 3) % 12 : k.tonic; // relative major
  const num = (((7 * majorTonic) % 12) + 7) % 12 + 1;
  return `${num}${k.minor ? 'A' : 'B'}`;
}

export function camelotNumber(k: MusicalKey): number {
  return parseInt(camelot(k), 10);
}

export function transpose(k: MusicalKey, semitones: number): MusicalKey {
  return { tonic: (((k.tonic + Math.round(semitones)) % 12) + 12) % 12, minor: k.minor };
}

/**
 * Smallest key shift (in semitones, −6…+5) that puts `from` on the same Camelot number as
 * `to` (same key, or its relative major/minor), so the two decks mix in key.
 */
export function keySyncShift(from: MusicalKey, to: MusicalKey): number {
  // one semitone up moves 7 steps around the Camelot wheel; 7 is its own inverse mod 12
  const diff = (((camelotNumber(to) - camelotNumber(from)) % 12) + 12) % 12;
  let s = (7 * diff) % 12;
  if (s > 5) s -= 12;
  return s;
}

// ------------------------------------------------------------------ detection

/** In-place iterative radix-2 complex FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** 12-bin pitch-class profile of the audio (55 Hz – 1.76 kHz), normalised to sum 1. */
export function chromagram(mono: Float32Array, sampleRate: number, maxSeconds = 120): Float64Array {
  // decimate to ~11 kHz (4-tap average is enough anti-aliasing for < 2 kHz content)
  const dec = Math.max(1, Math.round(sampleRate / 11025));
  const sr = sampleRate / dec;
  const total = Math.floor(mono.length / dec);
  const keep = Math.min(total, Math.round(maxSeconds * sr));
  const start = Math.floor((total - keep) / 2);
  const x = new Float32Array(keep);
  for (let i = 0; i < keep; i++) {
    let s = 0;
    const base = (start + i) * dec;
    for (let k = 0; k < dec; k++) s += mono[base + k] ?? 0;
    x[i] = s / dec;
  }
  const N = 8192;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  // bin → pitch class per harmonic (-1 = outside the analysed range)
  const H = HARMONIC_WEIGHTS.length;
  const pcOf = new Int8Array((N / 2) * H).fill(-1);
  for (let b = 1; b < N / 2; b++) {
    const f = (b * sr) / N;
    if (f < 55 || f > 1760) continue;
    for (let h = 0; h < H; h++) {
      const f0 = f / (h + 1);
      if (f0 < 27.5) break;
      const midi = 69 + 12 * Math.log2(f0 / 440);
      pcOf[b * H + h] = ((Math.round(midi) % 12) + 12) % 12;
    }
  }
  const chroma = new Float64Array(12);
  for (let off = 0; off + N <= x.length; off += N) {
    for (let i = 0; i < N; i++) {
      re[i] = x[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const frame = new Float64Array(12);
    let sum = 0;
    for (let b = 1; b < N / 2; b++) {
      if (pcOf[b * H] < 0) continue;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      for (let h = 0; h < H; h++) {
        const pc = pcOf[b * H + h];
        if (pc < 0) break;
        frame[pc] += mag * HARMONIC_WEIGHTS[h];
        sum += mag * HARMONIC_WEIGHTS[h];
      }
    }
    // each frame votes equally, so one loud section does not decide the key
    if (sum > 1e-9) for (let p = 0; p < 12; p++) chroma[p] += frame[p] / sum;
  }
  const total12 = chroma.reduce((a, b) => a + b, 0);
  if (total12 > 0) for (let p = 0; p < 12; p++) chroma[p] /= total12;
  return chroma;
}

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export interface KeyResult {
  key: MusicalKey | null;
  /** margin between the best and second-best key correlation (0 = ambiguous) */
  confidence: number;
}

export function detectKey(mono: Float32Array, sampleRate: number): KeyResult {
  const chroma = chromagram(mono, sampleRate);
  if (chroma.every((v) => v === 0)) return { key: null, confidence: 0 };
  const scores: { key: MusicalKey; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const prof = minor ? MINOR_PROFILE : MAJOR_PROFILE;
      const rotated = Array.from({ length: 12 }, (_, p) => prof[(p - tonic + 12) % 12]);
      scores.push({ key: { tonic, minor }, r: correlation(chroma, rotated) });
    }
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0];
  // drum-only material has a nearly flat chroma: report no key rather than a random one
  if (best.r < 0.5) return { key: null, confidence: 0 };
  return { key: best.key, confidence: best.r - scores[1].r };
}
