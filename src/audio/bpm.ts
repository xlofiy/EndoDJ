/**
 * Automatic BPM + beat-grid detection.
 *
 * Pipeline:
 *  1. Build an onset-strength envelope (half-wave rectified derivative of log energy,
 *     computed on the full band and a low band so kicks dominate).
 *  2. Autocorrelate the envelope to get a coarse tempo candidate.
 *  3. Refine the tempo with a comb score evaluated over the whole track in 0.01 BPM steps.
 *  4. Find the first-beat offset (phase) that best lines the grid up with onsets.
 *
 * Pure functions only (no DOM / Web Audio) so it can run in a Web Worker and in unit tests.
 */

export interface BpmOptions {
  minBpm?: number; // inclusive
  maxBpm?: number; // exclusive
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
    energyLow[f] = Math.log1p(1000 * (el / hop));
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
  return { env: out, envRate };
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
 * Phases are tested at envelope resolution.
 */
export function combScore(
  env: Float32Array,
  envRate: number,
  bpm: number,
): { score: number; phase: number } {
  const period = (60 / bpm) * envRate; // in envelope frames
  const steps = Math.max(1, Math.floor(period));
  let best = -1;
  let bestPhase = 0;
  for (let p = 0; p < steps; p++) {
    let sum = 0;
    let count = 0;
    for (let idx = p; idx < env.length - 1; idx += period) {
      // take the max of a small neighbourhood to tolerate jitter
      sum += Math.max(envAt(env, idx - 1), envAt(env, idx), envAt(env, idx + 1));
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

function foldIntoRange(bpm: number, minBpm: number, maxBpm: number): number {
  if (!(bpm > 0) || !isFinite(bpm)) return 0;
  while (bpm < minBpm) bpm *= 2;
  while (bpm >= maxBpm) bpm /= 2;
  return bpm;
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

  // --- 1. coarse autocorrelation (on at most 90 s from the middle of the track) ---
  const maxLen = Math.round(envRate * 90);
  const start = env.length > maxLen ? Math.floor((env.length - maxLen) / 2) : 0;
  const seg = env.subarray(start, start + Math.min(maxLen, env.length));
  const minLag = Math.floor((60 / 220) * envRate);
  const maxLag = Math.ceil((60 / 50) * envRate);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1 && lag < seg.length; lag++) {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag];
    ac[lag] = s / (seg.length - lag);
  }
  // harmonic-enhanced score: a true beat period also correlates at 2x and 4x the lag
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * envRate) / lag;
    if (bpm < 50 || bpm > 220) continue;
    const s =
      ac[lag] +
      0.5 * (2 * lag <= maxLag + 1 ? ac[2 * lag] : 0) +
      0.25 * (4 * lag <= maxLag + 1 ? ac[4 * lag] : 0);
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { bpm: 0, firstBeat: 0, confidence: 0 };
  let coarse = foldIntoRange((60 * envRate) / bestLag, minBpm, maxBpm);

  // --- 2. pick between octave candidates with the comb score ---
  const candidates = [coarse, coarse * 2, coarse / 2, coarse * 1.5, coarse / 1.5].filter(
    (b) => b >= minBpm && b < maxBpm,
  );
  let bestCand = coarse;
  let bestCandScore = -1;
  for (const c of candidates) {
    // slight preference for the autocorrelation winner
    const s = combScore(env, envRate, c).score * (c === coarse ? 1.05 : 1);
    if (s > bestCandScore) {
      bestCandScore = s;
      bestCand = c;
    }
  }
  coarse = bestCand;

  // --- 3. fine search ±2 BPM in 0.05 steps, then ±0.06 in 0.01 steps ---
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
  let bpm = search(coarse, 2, 0.05);
  bpm = search(bpm, 0.06, 0.01);

  // snap to an integer BPM if it scores (practically) as well — most dance music is integer BPM
  const rounded = Math.round(bpm);
  if (Math.abs(rounded - bpm) <= 0.1) {
    const sR = combScore(env, envRate, rounded).score;
    const sB = combScore(env, envRate, bpm).score;
    if (sR >= sB * 0.98) bpm = rounded;
  }
  bpm = Math.round(bpm * 100) / 100;

  // --- 4. phase ---
  const { score, phase } = combScore(env, envRate, bpm);
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;
  let max = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i];
  const confidence = max > mean ? Math.max(0, Math.min(1, (score - mean) / (max - mean))) : 0;

  return { bpm, firstBeat: phase, confidence };
}
