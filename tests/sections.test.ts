import { describe, expect, it } from 'vitest';
import { detectSections } from '../src/audio/sections';

/** waveform with `bass` level per 4-bar block (120 BPM: 8 s per block), 10 bins per second */
function wf(blocks: number[]) {
  const n = blocks.length * 80;
  const peaks = new Float32Array(n);
  const lows = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    peaks[i] = 0.8;
    lows[i] = blocks[Math.floor(i / 80)];
  }
  return { binsPerSec: 10, peaks, lows };
}

describe('song sections', () => {
  it('finds intro, drops, break and outro from the bass level', () => {
    const s = detectSections(wf([0.2, 0.2, 0.9, 0.9, 0.3, 0.95, 0.9, 0.1]), { bpm: 120, firstBeat: 0 }, 64);
    expect(s.map((x) => [x.label, x.start, x.end])).toEqual([
      ['Intro', 0, 16],
      ['Drop', 16, 32],
      ['Break', 32, 40],
      ['Drop', 40, 56],
      ['Outro', 56, 64],
    ]);
  });

  it('calls a track without contrast "Main" and handles silence', () => {
    expect(detectSections(wf([0.8, 0.8, 0.8]), { bpm: 120, firstBeat: 0 }, 24)).toEqual([{ start: 0, end: 24, label: 'Main' }]);
    expect(detectSections(wf([0, 0]), { bpm: 120, firstBeat: 0 }, 16)).toEqual([{ start: 0, end: 16, label: 'Main' }]);
  });

  it('starts the first section at 0 even when the first beat is later', () => {
    const s = detectSections(wf([0.1, 0.9, 0.9]), { bpm: 120, firstBeat: 0.5 }, 24);
    expect(s[0]).toMatchObject({ label: 'Intro', start: 0 });
    expect(s[1].start).toBeCloseTo(8.5);
  });
});
