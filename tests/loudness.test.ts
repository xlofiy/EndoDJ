import { describe, expect, it } from 'vitest';
import { autoGainDb, loudnessDb } from '../src/audio/loudness';
import { trimDbToKnob, trimKnobToGain } from '../src/audio/mixmath';

const SR = 8000;
const sine = (amp: number, seconds: number) => Float32Array.from({ length: SR * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / SR));

describe('loudness', () => {
  it('measures the mean power of the music, ignoring silence', () => {
    const tone = sine(0.5, 4);
    expect(loudnessDb([tone], SR)).toBeCloseTo(10 * Math.log10(0.125), 1); // -9.03 dB
    const withGap = new Float32Array(SR * 8);
    withGap.set(tone, 0); // 4 s of tone, 4 s of silence
    expect(loudnessDb([withGap], SR)).toBeCloseTo(-9.03, 1);
    expect(loudnessDb([new Float32Array(SR * 2)], SR)).toBeNull();
  });

  it('a quieter track gets more gain, within limits', () => {
    expect(autoGainDb(-16)).toBe(6);
    expect(autoGainDb(-6)).toBe(-4);
    expect(autoGainDb(-40)).toBe(9);
    expect(autoGainDb(5)).toBe(-12);
  });

  it('TRIM knob position round-trips through the trim law', () => {
    for (const db of [-12, -4, 0, 3, 9]) expect(20 * Math.log10(trimKnobToGain(trimDbToKnob(db)))).toBeCloseTo(db, 6);
  });
});
