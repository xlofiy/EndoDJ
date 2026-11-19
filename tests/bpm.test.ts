import { describe, expect, it } from 'vitest';
import { detectBeatGrid } from '../src/audio/bpm';

const SR = 44100;

/** Synthetic track: a decaying low "kick" on every beat, a hat on the off-beat, plus noise. */
function makeTrack(bpm: number, firstBeat: number, seconds: number, seed = 1): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
  for (let i = 0; i < n; i++) out[i] = 0.02 * rnd();
  const beat = 60 / bpm;
  for (let t = firstBeat; t < seconds; t += beat) {
    const i0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.15 && i0 + k < n; k++) {
      const env = Math.exp(-k / (SR * 0.03));
      out[i0 + k] += 0.8 * env * Math.sin((2 * Math.PI * 55 * k) / SR);
    }
    const h0 = Math.round((t + beat / 2) * SR);
    for (let k = 0; k < SR * 0.03 && h0 + k < n; k++) {
      out[h0 + k] += 0.15 * Math.exp(-k / (SR * 0.005)) * rnd();
    }
  }
  return out;
}

describe('detectBeatGrid', () => {
  for (const [bpm, first] of [
    [128, 0.3],
    [174, 0.12],
    [90, 0.5],
    [122.5, 0.05],
  ] as const) {
    it(`detects ${bpm} BPM with first beat at ${first}s`, () => {
      const track = makeTrack(bpm, first, 40);
      const res = detectBeatGrid([track], SR);
      expect(Math.abs(res.bpm - bpm)).toBeLessThan(0.06);
      const beat = 60 / bpm;
      const expected = first % beat;
      // compare phases on the circle
      let d = Math.abs(res.firstBeat - expected) % beat;
      d = Math.min(d, beat - d);
      expect(d).toBeLessThan(0.015);
      expect(res.confidence).toBeGreaterThan(0.2);
    });
  }

  it('returns 0 for very short audio', () => {
    expect(detectBeatGrid([new Float32Array(1000)], SR).bpm).toBe(0);
  });
});
