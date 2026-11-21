import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckCommand } from '../src/audio/deck-processor';
import { parseKey } from '../src/audio/key';

// Minimal stand-ins for the Web Audio objects the deck talks to.
let sent: DeckCommand[] = [];
class FakeWorkletNode {
  port = { postMessage: (m: DeckCommand) => sent.push(m), onmessage: null as unknown };
}
(globalThis as unknown as { AudioWorkletNode: unknown }).AudioWorkletNode = FakeWorkletNode;
const { Deck } = await import('../src/audio/deck');

const SR = 48000;
const ctx = { currentTime: 0, sampleRate: SR } as unknown as AudioContext;
const buffer = (seconds: number) =>
  ({ sampleRate: SR, duration: seconds, numberOfChannels: 1, getChannelData: () => new Float32Array(16) }) as unknown as AudioBuffer;

function loaded() {
  const d = new Deck(ctx, 0);
  d.load({ id: 't', title: 't', artist: '' }, buffer(120));
  d.setAnalysis({ bpm: 120, firstBeat: 0 }, null); // one beat = 0.5 s
  sent = [];
  return d;
}

describe('Deck transport', () => {
  beforeEach(() => {
    sent = [];
  });

  it('CDJ cue: set while paused, preview while held, return on release', () => {
    const d = loaded();
    d.seek(10.1);
    d.cueDown(); // paused away from the cue point → new (quantised) cue point
    expect(d.cuePoint).toBe(10);
    expect(d.playing).toBe(false);
    d.cueDown(); // at the cue point → preview
    expect(d.playing).toBe(true);
    d.cueUp();
    expect(d.playing).toBe(false);
    expect(d.time).toBe(10);
  });

  it('CUE while playing jumps back to the cue point and stops', () => {
    const d = loaded();
    d.cuePoint = 4;
    d.seek(30);
    d.play();
    d.cueDown();
    expect(d.playing).toBe(false);
    expect(d.time).toBe(4);
  });

  it('beat loop starts on the current beat; halve, beat jump and reloop move it correctly', () => {
    const d = loaded();
    d.seek(10.3);
    d.beatloop(4);
    expect(d.loop).toMatchObject({ start: 10, end: 12, beats: 4 });
    expect(sent.at(-1)).toEqual({ type: 'loop', start: 10 * SR, end: 12 * SR });
    d.loopResize(0.5);
    expect(d.loop).toMatchObject({ start: 10, end: 11, beats: 2 });
    d.beatjump(4); // 4 beats = 2 s, the active loop moves along
    expect(d.loop).toMatchObject({ start: 12, end: 13 });
    expect(d.time).toBeCloseTo(12.3);
    d.reloop(); // exit
    expect(d.loopActive).toBe(false);
    expect(sent.at(-1)).toEqual({ type: 'loopOff' });
    d.seek(50);
    d.reloop(); // re-enter: jumps back into the loop
    expect(d.loopActive).toBe(true);
    expect(d.time).toBe(12);
  });

  it('hot cues: set on first press (quantised), jump on the next', () => {
    const d = loaded();
    d.seek(20.2);
    d.hotcueDown(0);
    expect(d.hotcues[0]).toBe(20);
    d.seek(60);
    d.play();
    d.hotcueDown(0);
    expect(d.time).toBe(20);
    d.clearHotcue(0);
    expect(d.hotcues[0]).toBeNull();
  });

  it('sync matches tempo and beat phase of the other deck', () => {
    const a = loaded();
    const b = new Deck(ctx, 1);
    b.load({ id: 'u', title: 'u', artist: '' }, buffer(120));
    b.setAnalysis({ bpm: 125, firstBeat: 0.1 }, null);
    a.seek(10.25); // half way through a beat
    b.seek(3.0);
    expect(b.syncTo(a)).toBe(true);
    expect(b.effectiveBpm).toBeCloseTo(120);
    const phase = (d: InstanceType<typeof Deck>) => {
      const x = (d.time - d.grid!.firstBeat) / (60 / d.grid!.bpm);
      return x - Math.floor(x);
    };
    expect(phase(b)).toBeCloseTo(phase(a), 5);
  });

  it('key sync shifts to the other deck’s key and turns key lock on', () => {
    const a = loaded();
    const b = new Deck(ctx, 1);
    b.load({ id: 'u', title: 'u', artist: '' }, buffer(60));
    a.setKey(parseKey('Am'));
    b.setKey(parseKey('Dm'));
    sent = [];
    expect(b.keySyncTo(a)).toBe(true);
    expect(b.keyShift).toBe(-5);
    expect(b.keyLock).toBe(true);
    expect(sent.at(-1)).toEqual({ type: 'key', shift: -5, keyLock: true });
    // without a key on one side there is nothing to sync
    b.setKey(null);
    expect(b.keySyncTo(a)).toBe(false);
  });
});

describe('deck effects', () => {
  (globalThis as unknown as { window: unknown }).window ??= globalThis;
  const scratches = () => sent.filter((m) => m.type === 'scratch') as Extract<DeckCommand, { type: 'scratch' }>[];

  it('brake slows the platter to a stop, then pauses', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const d = loaded();
    d.play();
    d.brake(1);
    expect(scratches()[0]).toEqual({ type: 'scratch', active: true, rate: 1 });
    vi.advanceTimersByTime(500);
    expect(scratches().at(-1)!.rate).toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(600);
    expect(d.playing).toBe(false);
    expect(sent.at(-1)).toEqual({ type: 'scratch', active: false, rate: 0 });
    vi.useRealTimers();
  });

  it('backspin runs backwards and stops when the platter is grabbed', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const d = loaded();
    d.play();
    d.backspin(2);
    expect(scratches()[0].rate).toBe(-3);
    d.jogTouch(true);
    const n = scratches().length;
    vi.advanceTimersByTime(500);
    expect(scratches().filter((m) => m.rate < 0).length).toBe(n - 2); // no more spin steps after the grab
    d.jogTouch(false);
    vi.useRealTimers();
  });

  it('beat roll loops while held and slips back to where the track would be', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const d = loaded();
    d.seek(10.2);
    d.play();
    d.roll(1);
    expect(d.loop).toMatchObject({ start: 10, end: 10.5 });
    expect(d.loopActive).toBe(true);
    vi.advanceTimersByTime(2000);
    d.roll(null);
    expect(d.loopActive).toBe(false);
    expect(d.time).toBeCloseTo(12.2, 2);
    vi.useRealTimers();
  });
});
