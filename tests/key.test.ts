import { describe, expect, it } from 'vitest';
import { camelot, detectKey, fft, keyName, keySyncShift, parseKey, transpose } from '../src/audio/key';

const SR = 44100;

/** Render a chord progression (MIDI note lists, one chord per second) with soft saw-ish tones. */
function progression(chords: number[][], repeats = 4): Float32Array {
  const secPer = 1;
  const out = new Float32Array(Math.round(chords.length * repeats * secPer * SR));
  chords.forEach((notes, ci) => {
    for (let r = 0; r < repeats; r++) {
      const t0 = Math.round((r * chords.length + ci) * secPer * SR);
      for (const n of notes) {
        const f = 440 * Math.pow(2, (n - 69) / 12);
        for (let i = 0; i < secPer * SR; i++) {
          const ph = (2 * Math.PI * f * i) / SR;
          out[t0 + i] += 0.1 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph));
        }
      }
    }
  });
  return out;
}

describe('key helpers', () => {
  it('names, parses and converts to Camelot', () => {
    expect(keyName({ tonic: 9, minor: true })).toBe('Am');
    expect(parseKey('Am')).toEqual({ tonic: 9, minor: true });
    expect(parseKey('F#')).toEqual({ tonic: 6, minor: false });
    expect(parseKey('Bbm')).toEqual({ tonic: 10, minor: true });
    expect(parseKey('H')).toBeNull();
    expect(camelot(parseKey('C')!)).toBe('8B');
    expect(camelot(parseKey('Am')!)).toBe('8A');
    expect(camelot(parseKey('G')!)).toBe('9B');
    expect(camelot(parseKey('Em')!)).toBe('9A');
    expect(camelot(parseKey('F')!)).toBe('7B');
    expect(camelot(parseKey('Fm')!)).toBe('4A');
    expect(camelot(parseKey('B')!)).toBe('1B');
  });

  it('transposes and finds the smallest key-sync shift', () => {
    expect(keyName(transpose(parseKey('Am')!, 2))).toBe('Bm');
    expect(keyName(transpose(parseKey('C')!, -1))).toBe('B');
    expect(keySyncShift(parseKey('Am')!, parseKey('Am')!)).toBe(0);
    expect(keySyncShift(parseKey('Am')!, parseKey('Bm')!)).toBe(2);
    expect(keySyncShift(parseKey('Am')!, parseKey('C')!)).toBe(0); // relative major: already in key
    expect(keySyncShift(parseKey('C')!, parseKey('Bb')!)).toBe(-2);
    // the shift really lands on the same Camelot number
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++) {
        const from = { tonic: a, minor: a % 2 === 0 };
        const to = { tonic: b, minor: b % 3 === 0 };
        const s = keySyncShift(from, to);
        expect(s).toBeGreaterThanOrEqual(-6);
        expect(s).toBeLessThanOrEqual(5);
        expect(parseInt(camelot(transpose(from, s)), 10)).toBe(parseInt(camelot(to), 10));
      }
  });

  it('FFT finds a pure tone', () => {
    const n = 1024;
    const re = new Float64Array(n).map((_, i) => Math.cos((2 * Math.PI * 37 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mags.indexOf(Math.max(...mags.slice(0, n / 2)))).toBe(37);
  });
});

describe('detectKey', () => {
  it('detects C major (C–F–G–C)', () => {
    const x = progression([
      [48, 60, 64, 67],
      [53, 60, 65, 69],
      [55, 59, 62, 67],
      [48, 60, 64, 67],
    ]);
    expect(keyName(detectKey(x, SR).key!)).toBe('C');
  });

  it('detects A minor (Am–Dm–E–Am)', () => {
    const x = progression([
      [45, 57, 60, 64],
      [50, 57, 62, 65],
      [52, 56, 59, 64],
      [45, 57, 60, 64],
    ]);
    expect(keyName(detectKey(x, SR).key!)).toBe('Am');
  });

  it('follows a transposition (F# minor)', () => {
    const x = progression(
      [
        [45, 57, 60, 64],
        [50, 57, 62, 65],
        [52, 56, 59, 64],
        [45, 57, 60, 64],
      ].map((c) => c.map((n) => n - 3)),
    );
    expect(keyName(detectKey(x, SR).key!)).toBe('F#m');
  });

  it('reports no key for unpitched noise', () => {
    let s = 1;
    const x = new Float32Array(SR * 6).map(() => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff - 0.5) * 0.5);
    expect(detectKey(x, SR).key).toBeNull();
  });
});
