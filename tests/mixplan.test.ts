import { describe, expect, it } from 'vitest';
import { blendPosition, planMixOut } from '../src/app/mixplan';

const grid = { bpm: 120, firstBeat: 0 }; // bar = 2 s, phrase (8 bars) = 16 s

describe('mix-out planning', () => {
  it('starts the blend where the outro starts', () => {
    const sections = [
      { start: 0, end: 160, label: 'Drop' as const },
      { start: 160, end: 200, label: 'Outro' as const },
    ];
    expect(planMixOut(200, grid, sections, 16)).toEqual({ start: 160, end: 176 });
  });

  it('otherwise starts on the last phrase boundary that leaves room for the blend', () => {
    const p = planMixOut(200, grid, [], 16); // latest start 183.5 → phrase boundary 176
    expect(p).toEqual({ start: 176, end: 192 });
    expect(p.end).toBeLessThan(200);
  });

  it('falls back to the last bar when the phrase boundary is too early', () => {
    // latest start 199.5 - 30 = 169.5 → phrase 160 is 9.5 s away (> 8): use bar 168
    expect(planMixOut(200, grid, [], 30)).toEqual({ start: 168, end: 198 });
  });

  it('ignores an outro that is too short for the blend or too early', () => {
    const late = [{ start: 0, end: 190, label: 'Drop' as const }, { start: 190, end: 200, label: 'Outro' as const }];
    expect(planMixOut(200, grid, late, 16).start).toBe(176);
    const early = [{ start: 0, end: 40, label: 'Intro' as const }, { start: 40, end: 60, label: 'Outro' as const }];
    expect(planMixOut(200, grid, early, 16).start).toBe(176);
  });

  it('works without a beat grid and on very short tracks', () => {
    expect(planMixOut(100, null, [], 12)).toEqual({ start: 87.5, end: 99.5 });
    const p = planMixOut(10, grid, [], 16);
    expect(p.start).toBeGreaterThanOrEqual(0);
    expect(p.end).toBeLessThanOrEqual(10);
  });
});

describe('blend shapes', () => {
  it('fade moves straight across; layer holds both tracks through the middle', () => {
    expect([0, 0.5, 1].map((t) => blendPosition(t, 'fade'))).toEqual([0, 0.5, 1]);
    expect([0, 0.25, 0.5, 0.75, 1].map((t) => blendPosition(t, 'layer'))).toEqual([0, 0.5, 0.5, 0.5, 1]);
  });
});
