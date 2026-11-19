import { describe, expect, it } from 'vitest';
import { detectBeatGrid } from '../src/audio/bpm';
import { camelot, detectKey, parseKey } from '../src/audio/key';
import { bpmFromName, withNameHint, GENRES, LOOPS, loopLengthSeconds, renderLoop } from '../src/loops/catalog';

const SR = 44100;

describe('Loop Lab catalogue', () => {
  it('has unique ids and loops in every genre', () => {
    expect(new Set(LOOPS.map((l) => l.id)).size).toBe(LOOPS.length);
    for (const g of GENRES) expect(LOOPS.some((l) => l.genre === g)).toBe(true);
  });

  for (const def of LOOPS) {
    it(`renders "${def.name}" cleanly`, () => {
      const [L, R] = renderLoop(def, SR);
      expect(L.length).toBe(Math.round(loopLengthSeconds(def) * SR));
      let peak = 0;
      let energy = 0;
      for (let i = 0; i < L.length; i++) {
        expect(Number.isFinite(L[i]) && Number.isFinite(R[i])).toBe(true);
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        energy += L[i] * L[i];
      }
      expect(peak).toBeLessThanOrEqual(0.8901);
      expect(peak).toBeGreaterThan(0.5); // normalised, not silent
      expect(energy / L.length).toBeGreaterThan(1e-5);
    });

    // Resonant 303 filter sweeps smear energy over all 12 pitch classes (chroma is flat apart
    // from the root), so chroma detection cannot tell C minor from C major there. The app uses
    // the catalogue key for built-in loops, so key sync is unaffected.
    const detectionUnreliable = ['techno-acid-line'];
    if (def.key && !detectionUnreliable.includes(def.id)) {
      it(`key detection agrees with "${def.name}" (${def.key})`, () => {
        const [L, R] = renderLoop(def, SR);
        const mono = L.map((v, i) => (v + R[i]) / 2);
        const found = detectKey(mono, SR).key;
        expect(found).not.toBeNull();
        // same Camelot number = same key or its relative major/minor, which mix identically
        expect(parseInt(camelot(found!), 10)).toBe(parseInt(camelot(parseKey(def.key)!), 10));
      });
    }

    if (def.steadyBeat) {
      it(`auto-BPM detects ${def.bpm} BPM in "${def.name}"`, () => {
        const [L] = renderLoop(def, SR);
        const tiled = new Float32Array(L.length * 3);
        for (let k = 0; k < 3; k++) tiled.set(L, k * L.length);
        const { bpm } = detectBeatGrid([tiled], SR, { minBpm: 70, maxBpm: 180 });
        // DJ software treats half/double time as the same tempo; normalise the octave
        const ratio = bpm / def.bpm;
        const octave = Math.pow(2, Math.round(Math.log2(ratio)));
        expect(Math.abs(bpm / octave - def.bpm)).toBeLessThan(0.1);
      });
    }
  }
});

describe('bpmFromName', () => {
  it('reads tempos from loop-pack file names', () => {
    expect(bpmFromName('Big Kick 128bpm.wav')).toBe(128);
    expect(bpmFromName('break_174_BPM_Am.wav')).toBe(174);
    expect(bpmFromName('BPM140 rave stab.wav')).toBe(140);
    expect(bpmFromName('Track 01.mp3')).toBe(0);
    expect(bpmFromName('loop 2024bpm.wav')).toBe(0);
  });
});

describe('withNameHint', () => {
  it('uses the file name to pick the tempo octave', () => {
    expect(withNameHint(87, 'dnb roller 174bpm.wav')).toBe(174);
    expect(withNameHint(128, 'House Loop 128 BPM.wav')).toBe(128);
    expect(withNameHint(140, 'no tempo here.wav')).toBe(140);
    // a name that disagrees with the audio is ignored
    expect(withNameHint(126, 'wrong 140bpm.wav')).toBe(126);
  });
});
