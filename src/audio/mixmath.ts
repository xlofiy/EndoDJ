/** Pure mixer / sync math. No Web Audio dependencies so it can be unit-tested. */

export type CrossfaderCurve = 'smooth' | 'linear' | 'sharp';

/**
 * Crossfader gains.
 * @param x position 0 (full deck A) .. 1 (full deck B)
 */
export function crossfaderGains(x: number, curve: CrossfaderCurve): [number, number] {
  x = clamp(x, 0, 1);
  switch (curve) {
    case 'linear':
      return [1 - x, x];
    case 'sharp': {
      // "scratch" curve: both decks at full volume except at the very edges
      const cut = 0.05;
      const a = x >= 1 - cut ? (1 - x) / cut : 1;
      const b = x <= cut ? x / cut : 1;
      return [a, b];
    }
    case 'smooth':
    default:
      // constant power
      return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
  }
}

/** Knob 0..1 → EQ gain in dB, centre (0.5) = 0 dB, full left = kill (-40 dB), full right = +6 dB. */
export function eqKnobToDb(v: number): number {
  v = clamp(v, 0, 1);
  if (Math.abs(v - 0.5) < 0.01) return 0;
  if (v < 0.5) {
    const t = v / 0.5; // 0..1
    // perceptual curve: most of the travel is the useful -12..0 range, last bit is the kill
    return t <= 0.1 ? -40 + (t / 0.1) * 28 : -12 * (1 - (t - 0.1) / 0.9);
  }
  return 6 * ((v - 0.5) / 0.5);
}

/** Trim knob 0..1 → linear gain, centre = 0 dB, range -inf..+12 dB. */
export function trimKnobToGain(v: number): number {
  v = clamp(v, 0, 1);
  if (v <= 0) return 0;
  const db = v < 0.5 ? -40 * (1 - v / 0.5) : 12 * ((v - 0.5) / 0.5);
  return Math.pow(10, db / 20);
}

export interface FilterSetting {
  type: 'off' | 'lowpass' | 'highpass';
  frequency: number;
  q: number;
}

/**
 * Colour-FX / filter knob 0..1. Centre (with small dead-zone) = off.
 * Left = low-pass sweeping down, right = high-pass sweeping up.
 */
export function filterKnob(v: number): FilterSetting {
  v = clamp(v, 0, 1);
  const dead = 0.02;
  if (Math.abs(v - 0.5) <= dead) return { type: 'off', frequency: 20000, q: 0.707 };
  if (v < 0.5) {
    const t = (0.5 - dead - v) / (0.5 - dead); // 0..1
    return { type: 'lowpass', frequency: 20000 * Math.pow(60 / 20000, t), q: 0.707 + t * 2 };
  }
  const t = (v - 0.5 - dead) / (0.5 - dead);
  return { type: 'highpass', frequency: 20 * Math.pow(8000 / 20, t), q: 0.707 + t * 2 };
}

/** Channel fader 0..1 → gain with a logarithmic-ish taper. */
export function faderToGain(v: number): number {
  v = clamp(v, 0, 1);
  return v * v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------- beat / sync math

export interface Grid {
  bpm: number; // original BPM of the track
  firstBeat: number; // seconds
}

export function beatLength(grid: Grid): number {
  return 60 / grid.bpm;
}

/** Fractional beat index at a track time (seconds). */
export function beatAt(grid: Grid, timeSec: number): number {
  return (timeSec - grid.firstBeat) / beatLength(grid);
}

/** Track time for a (fractional) beat index. */
export function timeOfBeat(grid: Grid, beat: number): number {
  return grid.firstBeat + beat * beatLength(grid);
}

/** Phase in [0,1). */
export function beatPhase(grid: Grid, timeSec: number): number {
  const b = beatAt(grid, timeSec);
  return b - Math.floor(b);
}

/** Snap a time to the nearest beat (quantize). */
export function quantize(grid: Grid, timeSec: number, division = 1): number {
  const b = beatAt(grid, timeSec) * division;
  return timeOfBeat(grid, Math.round(b) / division);
}

/** Tempo factor a follower deck needs so its effective BPM matches the leader's. */
export function syncTempo(followerBpm: number, leaderEffectiveBpm: number): number {
  if (followerBpm <= 0 || leaderEffectiveBpm <= 0) return 1;
  let target = leaderEffectiveBpm;
  // match half/double time if that is much closer (e.g. 87 vs 174)
  const ratio = target / followerBpm;
  if (ratio > 1.5) target /= 2;
  else if (ratio < 0.75) target *= 2;
  return target / followerBpm;
}

/**
 * Seconds (in follower track time) to add to the follower's position so its beat phase
 * matches the leader's. Result is the smallest correction, in (-beat/2, beat/2].
 */
export function phaseCorrection(
  leader: Grid,
  leaderTime: number,
  follower: Grid,
  followerTime: number,
): number {
  const diff = beatPhase(leader, leaderTime) - beatPhase(follower, followerTime);
  let d = diff - Math.round(diff); // (-0.5, 0.5]
  if (d <= -0.5) d += 1;
  return d * beatLength(follower);
}
