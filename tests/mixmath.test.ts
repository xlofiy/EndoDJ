import { describe, expect, it } from 'vitest';
import {
  beatPhase,
  crossfaderGains,
  eqKnobToDb,
  filterKnob,
  phaseCorrection,
  quantize,
  syncTempo,
  trimKnobToGain,
} from '../src/audio/mixmath';
import { PlayerCore } from '../src/audio/player-core';

describe('crossfader', () => {
  it('smooth curve is constant power and hits the ends', () => {
    expect(crossfaderGains(0, 'smooth')[0]).toBeCloseTo(1);
    expect(crossfaderGains(0, 'smooth')[1]).toBeCloseTo(0);
    expect(crossfaderGains(1, 'smooth')[1]).toBeCloseTo(1);
    const [a, b] = crossfaderGains(0.5, 'smooth');
    expect(a * a + b * b).toBeCloseTo(1);
  });
  it('sharp curve keeps both decks loud in the middle', () => {
    expect(crossfaderGains(0.5, 'sharp')).toEqual([1, 1]);
    expect(crossfaderGains(0, 'sharp')[1]).toBe(0);
    expect(crossfaderGains(1, 'sharp')[0]).toBe(0);
  });
});

describe('knobs', () => {
  it('EQ centre is 0 dB, left is kill, right is boost', () => {
    expect(eqKnobToDb(0.5)).toBe(0);
    expect(eqKnobToDb(0)).toBe(-40);
    expect(eqKnobToDb(1)).toBeCloseTo(6);
    expect(eqKnobToDb(0.25)).toBeLessThan(0);
  });
  it('trim centre is unity', () => {
    expect(trimKnobToGain(0.5)).toBeCloseTo(1);
    expect(trimKnobToGain(0)).toBe(0);
    expect(trimKnobToGain(1)).toBeCloseTo(Math.pow(10, 12 / 20));
  });
  it('filter knob is off in the middle and sweeps outwards', () => {
    expect(filterKnob(0.5).type).toBe('off');
    expect(filterKnob(0.1).type).toBe('lowpass');
    expect(filterKnob(0.9).type).toBe('highpass');
    expect(filterKnob(0).frequency).toBeCloseTo(60);
    expect(filterKnob(1).frequency).toBeCloseTo(8000);
  });
});

describe('sync math', () => {
  const g128 = { bpm: 128, firstBeat: 0.1 };
  const g125 = { bpm: 125, firstBeat: 0.2 };

  it('computes tempo factor, handling double/half time', () => {
    expect(syncTempo(125, 128)).toBeCloseTo(128 / 125);
    expect(syncTempo(87, 174)).toBeCloseTo(1);
    expect(syncTempo(174, 87)).toBeCloseTo(1);
  });

  it('phase correction aligns follower to leader', () => {
    const leaderTime = 10.37;
    const followerTime = 33.91;
    const corr = phaseCorrection(g128, leaderTime, g125, followerTime);
    expect(Math.abs(corr)).toBeLessThanOrEqual(60 / 125 / 2 + 1e-9);
    expect(beatPhase(g125, followerTime + corr)).toBeCloseTo(beatPhase(g128, leaderTime), 6);
  });

  it('quantizes to the nearest beat', () => {
    const beat = 60 / 128;
    expect(quantize(g128, 0.1 + 4 * beat + 0.01)).toBeCloseTo(0.1 + 4 * beat);
  });
});

describe('PlayerCore', () => {
  const ramp = new Float32Array(1000).map((_, i) => i / 1000);

  it('plays forward at tempo 1 after the rate ramps up', () => {
    const p = new PlayerCore();
    p.load([new Float32Array(10000)], 48000, 48000);
    p.playing = true;
    const out = new Float32Array(2000);
    p.process(out, null, 2000);
    // ~2 ms ramp-up (smoothing), then exactly 1 source frame per output frame
    expect(p.position).toBeGreaterThan(1850);
    expect(p.position).toBeLessThan(2000);
    expect(p.rate).toBe(1);
  });

  it('wraps inside a loop', () => {
    const p = new PlayerCore();
    p.load([ramp], 48000, 48000);
    p.playing = true;
    p.loop = { start: 100, end: 200 };
    p.seek(150);
    const out = new Float32Array(2000);
    p.process(out, null, 2000);
    expect(p.position).toBeGreaterThanOrEqual(100);
    expect(p.position).toBeLessThan(200);
  });

  it('stops and flags end of track', () => {
    const p = new PlayerCore();
    p.load([ramp], 48000, 48000);
    p.playing = true;
    p.seek(990);
    const out = new Float32Array(2000);
    p.process(out, null, 2000);
    expect(p.playing).toBe(false);
    expect(p.ended).toBe(true);
  });

  it('can scratch backwards', () => {
    const p = new PlayerCore();
    p.load([ramp], 48000, 48000);
    p.seek(800);
    p.scratching = true;
    p.scratchRate = -1;
    const out = new Float32Array(1000);
    p.process(out, null, 1000);
    expect(p.position).toBeLessThan(800);
  });
});
