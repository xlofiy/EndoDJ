/**
 * Automatic BPM + beat-grid detection.
 *
 * Pipeline:
 *  1. Build an onset-strength envelope (half-wave rectified derivative of log energy,
 *     computed on the full band and a low band so kicks dominate).
 *  2. Scan all tempos in range with a *metrical* comb (beats + 8ths + 16ths must line up),
 *     which rejects wrong ratios like 4/3 or 5/4 that plain autocorrelation falls for, then
 *     resolve the half/double-time ambiguity.
 *  3. Refine the tempo with a comb score evaluated over the whole track (0.005 BPM steps).
 *  4. Find the first-beat offset (phase) that best lines the grid up with onsets.
 *
 * Pure functions only (no DOM / Web Audio) so it can run in a Web Worker and in unit tests.
 */

export interface BpmOptions {
  minBpm?: number; // inclusive
  maxBpm?: number; // inclusive
}

export interface BeatGridResult {
  bpm: number;
  /** Time of the first beat in seconds (0 <= firstBeat < 60/bpm). */
  firstBeat: number;
  /** 0..1, how strongly the grid matches the onsets. */
  confidence: number;
}

/** Envelope sample rate is ~sampleRate / HOP. */
const TARGET_ENV_RATE = 400; // Hz → 2.5 ms resolution

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

export function onsetEnvelope(
  mono: Float32Array,
  sampleRate: number,
): { env: Float32Array; envRate: number } {
  const hop = Math.max(1, Math.round(sampleRate / TARGET_ENV_RATE));
  const envRate = sampleRate / hop;
  const frames = Math.floor(mono.length / hop);
  const energyFull = new Float32Array(frames);
  const energyLow = new Float32Array(frames);
  // one-pole low-pass at ~150 Hz
  const a = Math.exp((-2 * Math.PI * 150) / sampleRate);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let ef = 0;
    let el = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      const x = mono[base + i];
      lp = (1 - a) * x + a * lp;
      ef += x * x;
      el += lp * lp;
    }
    energyFull[f] = Math.log1p(1000 * (ef / hop));
    energyLow[f] = el / hop;
  }
  // a 2.5 ms frame is shorter than one cycle of a 40-60 Hz kick, so the low band's frame energy
  // ripples with the waveform itself: average it over ±10 ms (centred, so no lag) before the log
  const R = Math.round(envRate * 0.01);
  const lowRaw = energyLow.slice();
  let run = 0;
  for (let f = -R; f < frames; f++) {
    if (f + R < frames) run += lowRaw[f + R];
    if (f - R - 1 >= 0) run -= lowRaw[f - R - 1];
    if (f >= 0) energyLow[f] = Math.log1p((1000 * run) / (Math.min(frames - 1, f + R) - Math.max(0, f - R) + 1));
  }
  const env = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const dF = energyFull[f] - energyFull[f - 1];
    const dL = energyLow[f] - energyLow[f - 1];
    env[f] = (dF > 0 ? dF : 0) + 1.5 * (dL > 0 ? dL : 0);
  }
  // remove slowly varying mean so the comb score is not biased by loudness
  const win = Math.round(envRate); // 1 s
  const out = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += env[f];
    if (f >= win) acc -= env[f - win];
    const mean = acc / Math.min(f + 1, win);
    const v = env[f] - mean;
    out[f] = v > 0 ? v : 0;
  }
  // light binomial smoothing ([1 4 6 4 1]/16) so comb scores vary smoothly with tempo and phase
  const sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const at = (i: number) => (i >= 0 && i < frames ? out[i] : 0);
    sm[f] = (at(f - 2) + 4 * at(f - 1) + 6 * out[f] + 4 * at(f + 1) + at(f + 2)) / 16;
  }
  return { env: sm, envRate };
}

/** Linear interpolation of the envelope at a fractional index. */
function envAt(env: Float32Array, idx: number): number {
  const i = Math.floor(idx);
  if (i < 0 || i + 1 >= env.length) return 0;
  const t = idx - i;
  return env[i] * (1 - t) + env[i + 1] * t;
}

/**
 * Comb score for a tempo: for the best phase, the mean envelope value on the beat grid.
 * Phases are tested in half envelope-frame steps.
 */
export function combScore(
  env: Float32Array,
  envRate: number,
  bpm: number,
): { score: number; phase: number } {
  const period = (60 / bpm) * envRate; // in envelope frames
  const PHASE_STEP = 0.5; // envelope frames
  const steps = Math.max(1, Math.floor(period / PHASE_STEP));
  let best = -1;
  let bestPhase = 0;
  for (let step = 0; step < steps; step++) {
    const p = step * PHASE_STEP;
    let sum = 0;
    let count = 0;
    for (let idx = p; idx < env.length - 1; idx += period) {
      sum += envAt(env, idx);
      count++;
    }
    const s = count ? sum / count : 0;
    if (s > best) {
      best = s;
      bestPhase = p;
    }
  }
  return { score: best, phase: bestPhase / envRate };
}

/** Moving-average smoothing with the given radius (in frames). */
export function smooth(x: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(x.length);
  let acc = 0;
  const w = 2 * radius + 1;
  for (let i = -radius; i < x.length + radius; i++) {
    const add = i + radius < x.length ? x[i + radius] : 0;
    const sub = i - radius - 1 >= 0 ? x[i - radius - 1] : 0;
    acc += add - sub;
    if (i >= 0 && i < x.length) out[i] = acc / w;
  }
  return out;
}

/**
 * Metrical comb score: beat-grid energy plus (weighted) energy on the 8th and 16th
 * subdivisions, for the best phase. The true tempo's subdivisions also line up with
 * hi-hats / ghost notes; wrong ratios (4/3, 5/4, 6/5 …) do not, so they lose.
 */
export function metricalScore(env: Float32Array, envRate: number, bpm: number): number {
  const period = (60 / bpm) * envRate;
  const sub = period / 4;
  const steps = Math.max(1, Math.floor(period));
  let best = -1;
  for (let p = 0; p < steps; p++) {
    let s0 = 0;
    let n0 = 0;
    let s2 = 0;
    let n2 = 0;
    let s4 = 0;
    let n4 = 0;
    let k = 0;
    for (let idx = p; idx < env.length - 1; idx += sub, k++) {
      const v = envAt(env, idx);
      s4 += v;
      n4++;
      if (k % 2 === 0) {
        s2 += v;
        n2++;
      }
      if (k % 4 === 0) {
        s0 += v;
        n0++;
      }
    }
    if (!n0) continue;
    const sc = s0 / n0 + 0.5 * (s2 / n2) + 0.25 * (s4 / n4);
    if (sc > best) best = sc;
  }
  return best;
}

export function detectBeatGrid(
  channels: Float32Array[],
  sampleRate: number,
  opts: BpmOptions = {},
): BeatGridResult {
  const minBpm = opts.minBpm ?? 70;
  const maxBpm = opts.maxBpm ?? 180;
  const mono = mixToMono(channels);
  const { env, envRate } = onsetEnvelope(mono, sampleRate);
  if (env.length < envRate * 2) return { bpm: 0, firstBeat: 0, confidence: 0 };

  // --- 1. coarse tempo scan with a metrical comb ---
  // Scanned in 0.25-BPM steps on up to three 10-s windows spread over the track. Short
  // windows keep the grid drift between scan steps small (< 10 ms), several windows keep
  // the estimate robust against breakdowns and intros.
  const winLen = Math.round(envRate * 10);
  const windows: Float32Array[] = [];
  if (env.length <= winLen * 1.5) windows.push(smooth(env, 2));
  else {
    const count = Math.min(3, Math.floor(env.length / winLen));
    for (let w = 0; w < count; w++) {
      const centre = ((w + 1) / (count + 1)) * env.length;
      const from = Math.max(0, Math.min(env.length - winLen, Math.round(centre - winLen / 2)));
      windows.push(smooth(env.subarray(from, from + winLen), 2));
    }
  }
  const sumScore = (fn: (e: Float32Array) => number) => windows.reduce((acc, w) => acc + fn(w), 0);
  let coarse = 0;
  let coarseScore = -1;
  for (let b = minBpm; b <= maxBpm + 1e-9; b += 0.25) {
    const sc = sumScore((w) => metricalScore(w, envRate, b));
    if (sc > coarseScore) {
      coarseScore = sc;
      coarse = b;
    }
  }
  if (coarse === 0) return { bpm: 0, firstBeat: 0, confidence: 0 };
  // Octave decision: the metrical score cannot tell T from T/2 when every beat has a hit.
  // If the positions halfway between beats carry ≥ 60 % of the beats' energy, they are beats
  // (e.g. DnB reads 174, not 87; a 90 BPM groove with 8th-note hats stays 90 — see tests).
  while (coarse * 2 <= maxBpm) {
    const c = coarse;
    const here = sumScore((w) => combScore(w, envRate, c).score);
    const dbl = sumScore((w) => combScore(w, envRate, c * 2).score);
    if (dbl >= 0.6 * here) coarse *= 2;
    else break;
  }

  // --- 2. fine search on the whole track: ±0.3 BPM in 0.02 steps, then ±0.03 in 0.005 ---
  const search = (center: number, span: number, step: number): number => {
    let b = center;
    let bs = -1;
    for (let x = center - span; x <= center + span + 1e-9; x += step) {
      if (x <= 0) continue;
      const s = combScore(env, envRate, x).score;
      if (s > bs) {
        bs = s;
        b = x;
      }
    }
    return b;
  };
  let bpm = search(coarse, 0.3, 0.02);
  bpm = search(bpm, 0.03, 0.005);

  // snap to an integer BPM if it scores (practically) as well — most dance music is integer BPM
  // (within 0.05 BPM the grid drifts by only a few ms over a whole track, below comb resolution)
  const rounded = Math.round(bpm);
  if (Math.abs(rounded - bpm) <= 0.05) {
    const sR = combScore(env, envRate, rounded).score;
    const sB = combScore(env, envRate, bpm).score;
    if (sR >= sB * 0.95) bpm = rounded;
  }
  bpm = Math.round(bpm * 100) / 100;

  // --- 3. phase ---
  const { score, phase } = combScore(env, envRate, bpm);
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;
  let max = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i];
  const confidence = max > mean ? Math.max(0, Math.min(1, (score - mean) / (max - mean))) : 0;

  return { bpm, firstBeat: phase, confidence };
}
