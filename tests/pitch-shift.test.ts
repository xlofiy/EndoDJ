import { describe, expect, it } from 'vitest';
import { PitchShifter, pitchRatio } from '../src/audio/pitch-shift';

const SR = 44100;

function sine(freq: number, seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SR)).map((_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / SR));
}

/** Frequency from positive-going zero crossings over the second half of the buffer. */
function measureFreq(x: Float32Array): number {
  const from = Math.floor(x.length / 2);
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = from + 1; i < x.length; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) {
      if (first < 0) first = i;
      last = i;
      count++;
    }
  }
  return ((count - 1) * SR) / (last - first);
}

function shift(x: Float32Array, ratio: number): Float32Array {
  const out = x.slice();
  const ps = new PitchShifter(SR);
  for (let i = 0; i < out.length; i += 128) ps.process(out.subarray(i, i + 128), null, Math.min(128, out.length - i), ratio);
  return out;
}

describe('PitchShifter', () => {
  it('passes audio through unchanged at ratio 1', () => {
    const x = sine(440, 0.5);
    expect(shift(x, 1)).toEqual(x);
  });

  for (const semis of [12, 7, 2, -5, -12]) {
    it(`shifts a 440 Hz tone by ${semis} semitones`, () => {
      const ratio = Math.pow(2, semis / 12);
      const f = measureFreq(shift(sine(440, 2), ratio));
      expect(f / (440 * ratio)).toBeGreaterThan(0.97);
      expect(f / (440 * ratio)).toBeLessThan(1.03);
    });
  }

  it('keeps the level bounded', () => {
    const out = shift(sine(220, 1), 1.5);
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(0.51);
  });
});

describe('pitchRatio', () => {
  it('combines key shift and key lock', () => {
    expect(pitchRatio(0, 1.1, false)).toBe(1);
    expect(pitchRatio(0, 1.1, true)).toBeCloseTo(1 / 1.1);
    expect(pitchRatio(12, 1, true)).toBeCloseTo(2);
    expect(pitchRatio(-12, 1, false)).toBeCloseTo(0.5);
  });
});
