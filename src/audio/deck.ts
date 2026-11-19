/**
 * Main-thread deck controller: transport logic (CDJ-style cue, hot cues, loops, beat jump,
 * tempo, jog wheel scratch/bend, sync) on top of the AudioWorklet player.
 */
import type { DeckCommand, DeckStatus } from './deck-processor';
import type { WaveformData } from './waveform';
import { beatAt, clamp, phaseCorrection, quantize, syncTempo, timeOfBeat, type Grid } from './mixmath';
import { keySyncShift, transpose, type MusicalKey } from './key';

export const HOTCUE_COUNT = 8;
export const TEMPO_RANGES = [0.06, 0.1, 0.16, 0.5] as const;
/** Jog wheel ticks per platter revolution (Pioneer DDJ family ≈ 720 — verify on FLX2). */
export const JOG_TICKS_PER_REV = 720;
/** Audio seconds per platter revolution at 33⅓ RPM. */
const SECONDS_PER_REV = 1.8;

export interface DeckTrack {
  id: string;
  title: string;
  artist: string;
}

export interface DeckPersistedState {
  cuePoint: number;
  hotcues: (number | null)[];
}

type Listener = () => void;

export class Deck {
  readonly node: AudioWorkletNode;
  readonly index: number; // 0 = A, 1 = B

  track: DeckTrack | null = null;
  buffer: AudioBuffer | null = null;
  waveform: WaveformData | null = null;
  grid: Grid | null = null;

  /** tempo fader position -1..1 (negative = slower) and range */
  tempoFader = 0;
  tempoRange: number = TEMPO_RANGES[1];
  synced = false;
  quantize = true;
  reverse = false;
  /** detected key of the loaded track (null = unknown / unpitched) */
  key: MusicalKey | null = null;
  /** key shift in semitones, independent of tempo */
  keyShift = 0;
  /** master tempo: tempo changes keep the pitch */
  keyLock = false;

  cuePoint = 0;
  hotcues: (number | null)[] = new Array(HOTCUE_COUNT).fill(null);
  loop: { start: number; end: number; beats: number | null } | null = null;
  loopActive = false;
  private pendingLoopIn: number | null = null;

  private status: DeckStatus = { type: 'status', position: 0, rate: 0, playing: false, time: 0 };
  private cueHeld = false;
  private hotcueHeld: number | null = null;
  private listeners = new Set<Listener>();
  private endedListeners = new Set<Listener>();

  // jog
  private jogTouched = false;
  private scratchTicks = 0;
  private scratchTimer: number | null = null;
  private scratchLast = 0;
  private scratchRate = 0;
  private bendTimer: number | null = null;

  /** called when cues change so the library can persist them */
  onCuesChanged: ((d: Deck) => void) | null = null;

  constructor(
    readonly ctx: AudioContext,
    index: number,
  ) {
    this.index = index;
    this.node = new AudioWorkletNode(ctx, 'endodj-deck', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e: MessageEvent<DeckStatus | { type: 'ended' }>) => {
      if (e.data.type === 'status') this.status = e.data;
      else if (e.data.type === 'ended') {
        this.loopActive = false;
        this.endedListeners.forEach((l) => l());
        this.emit();
      }
    };
  }

  private send(cmd: DeckCommand, transfer: Transferable[] = []): void {
    this.node.port.postMessage(cmd, transfer);
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onEnded(l: Listener): () => void {
    this.endedListeners.add(l);
    return () => this.endedListeners.delete(l);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------------ loading

  get loaded(): boolean {
    return this.buffer !== null;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  load(track: DeckTrack, buffer: AudioBuffer, saved?: Partial<DeckPersistedState>): void {
    this.track = track;
    this.buffer = buffer;
    this.waveform = null;
    this.grid = null;
    this.loop = null;
    this.loopActive = false;
    this.pendingLoopIn = null;
    this.cuePoint = saved?.cuePoint ?? 0;
    this.hotcues = Array.from({ length: HOTCUE_COUNT }, (_, i) => saved?.hotcues?.[i] ?? null);
    this.synced = false;
    this.key = null;
    this.keyShift = 0;
    this.sendKey();
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
    this.send({ type: 'load', channels, sampleRate: buffer.sampleRate }, channels.map((c) => c.buffer));
    this.send({ type: 'tempo', value: this.tempoFactor });
    this.status = { type: 'status', position: 0, rate: 0, playing: false, time: this.ctx.currentTime };
    if (this.cuePoint > 0) this.seek(this.cuePoint);
    this.emit();
  }

  setAnalysis(grid: Grid | null, waveform: WaveformData | null): void {
    if (grid && grid.bpm > 0) this.grid = grid;
    if (waveform) this.waveform = waveform;
    this.emit();
  }

  unload(): void {
    this.send({ type: 'unload' });
    this.track = null;
    this.buffer = null;
    this.waveform = null;
    this.grid = null;
    this.loop = null;
    this.loopActive = false;
    this.status = { type: 'status', position: 0, rate: 0, playing: false, time: 0 };
    this.emit();
  }

  // ------------------------------------------------------------------ time / tempo

  /** Current track position in seconds, extrapolated between worklet reports. */
  get time(): number {
    if (!this.buffer) return 0;
    const sr = this.buffer.sampleRate;
    const dt = Math.max(0, Math.min(0.1, this.ctx.currentTime - this.status.time));
    let frames = this.status.position + this.status.rate * dt * this.ctx.sampleRate;
    if (this.loopActive && this.loop) {
      const s = this.loop.start * sr;
      const e = this.loop.end * sr;
      if (frames >= e && e > s) frames = s + ((frames - s) % (e - s));
    }
    return clamp(frames / sr, 0, this.duration);
  }

  get playing(): boolean {
    return this.status.playing;
  }

  get tempoFactor(): number {
    return 1 + this.tempoFader * this.tempoRange;
  }

  get effectiveBpm(): number {
    return this.grid ? this.grid.bpm * this.tempoFactor : 0;
  }

  /** @param v fader -1..1 */
  setTempoFader(v: number): void {
    this.tempoFader = clamp(v, -1, 1);
    this.send({ type: 'tempo', value: this.tempoFactor * (this.reverse ? -1 : 1) });
    this.emit();
  }

  /** Set an exact tempo factor (used by sync); widens the pitch range if needed. */
  setTempoFactor(f: number): void {
    const needed = Math.abs(f - 1);
    if (needed > this.tempoRange) {
      this.tempoRange = TEMPO_RANGES.find((r) => r >= needed) ?? TEMPO_RANGES[TEMPO_RANGES.length - 1];
    }
    this.setTempoFader((f - 1) / this.tempoRange);
  }

  setTempoRange(r: number): void {
    const f = this.tempoFactor;
    this.tempoRange = r;
    // keep the current speed if it still fits, otherwise clamp
    this.setTempoFader((f - 1) / r);
  }

  setReverse(on: boolean): void {
    this.reverse = on;
    this.setTempoFader(this.tempoFader);
  }

  // ------------------------------------------------------------------ key

  private sendKey(): void {
    this.send({ type: 'key', shift: this.keyShift, keyLock: this.keyLock });
  }

  setKey(key: MusicalKey | null): void {
    this.key = key;
    this.emit();
  }

  /** @param semitones absolute key shift, clamped to ±12 */
  setKeyShift(semitones: number): void {
    this.keyShift = clamp(Math.round(semitones), -12, 12);
    this.sendKey();
    this.emit();
  }

  setKeyLock(on: boolean): void {
    this.keyLock = on;
    this.sendKey();
    this.emit();
  }

  /** Semitones the pitch currently differs from the original (key shift + tempo without key lock). */
  get pitchOffset(): number {
    const tempoSemis = this.keyLock ? 0 : 12 * Math.log2(Math.max(0.01, Math.abs(this.tempoFactor)));
    return this.keyShift + tempoSemis;
  }

  /** The key you hear right now. */
  get effectiveKey(): MusicalKey | null {
    return this.key ? transpose(this.key, this.pitchOffset) : null;
  }

  /** Shift this deck's key so it mixes harmonically with `other` (same Camelot number). */
  keySyncTo(other: Deck): boolean {
    const target = other.effectiveKey;
    if (!this.key || !target) return false;
    // turn key lock on so later tempo changes cannot pull the deck out of key
    this.keyLock = true;
    this.setKeyShift(keySyncShift(this.key, target));
    return true;
  }

  // ------------------------------------------------------------------ transport

  play(): void {
    if (!this.buffer) return;
    if (this.time >= this.duration - 0.01) return;
    this.send({ type: 'play' });
    this.status = { ...this.status, playing: true };
    this.emit();
  }

  pause(): void {
    this.send({ type: 'pause' });
    this.status = { ...this.status, playing: false };
    this.emit();
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(sec: number): void {
    if (!this.buffer) return;
    sec = clamp(sec, 0, this.duration);
    const frame = sec * this.buffer.sampleRate;
    this.send({ type: 'seek', frame });
    this.status = { ...this.status, position: frame, time: this.ctx.currentTime };
    this.emit();
  }

  private q(sec: number): number {
    return this.quantize && this.grid ? quantize(this.grid, sec) : sec;
  }

  /** CDJ-style cue button. */
  cueDown(): void {
    if (!this.buffer) return;
    if (this.playing && !this.cueHeld) {
      // return to cue and stop
      this.pause();
      this.seek(this.cuePoint);
      return;
    }
    const t = this.time;
    if (Math.abs(t - this.cuePoint) > 0.01) {
      // paused away from cue point → set a new cue point here
      this.cuePoint = this.q(t);
      this.seek(this.cuePoint);
      this.onCuesChanged?.(this);
      this.emit();
    } else {
      // paused at cue point → preview while held
      this.cueHeld = true;
      this.play();
    }
  }

  cueUp(): void {
    if (this.cueHeld) {
      this.cueHeld = false;
      this.pause();
      this.seek(this.cuePoint);
    }
  }

  /** Jump to the track start (SHIFT+CUE). */
  toStart(): void {
    this.seek(0);
  }

  hotcueDown(i: number): void {
    if (!this.buffer || i < 0 || i >= HOTCUE_COUNT) return;
    const pos = this.hotcues[i];
    if (pos === null) {
      this.hotcues[i] = this.q(this.time);
      this.onCuesChanged?.(this);
      this.emit();
      return;
    }
    this.seek(pos);
    if (!this.playing) {
      // stutter-preview while held when paused
      this.hotcueHeld = i;
      this.play();
    }
  }

  hotcueUp(i: number): void {
    if (this.hotcueHeld === i) {
      this.hotcueHeld = null;
      this.pause();
      const pos = this.hotcues[i];
      if (pos !== null) this.seek(pos);
    }
  }

  clearHotcue(i: number): void {
    if (i < 0 || i >= HOTCUE_COUNT) return;
    this.hotcues[i] = null;
    this.onCuesChanged?.(this);
    this.emit();
  }

  // ------------------------------------------------------------------ loops

  private beatLen(): number {
    return this.grid ? 60 / this.grid.bpm : 0.5; // fall back to 120 BPM
  }

  private applyLoop(): void {
    if (!this.buffer || !this.loop || !this.loopActive) {
      this.send({ type: 'loopOff' });
      return;
    }
    const sr = this.buffer.sampleRate;
    this.send({ type: 'loop', start: this.loop.start * sr, end: this.loop.end * sr });
  }

  /** Auto loop of `beats` beats starting at the current (quantized) position. Toggles off if same. */
  beatloop(beats: number): void {
    if (!this.buffer) return;
    if (this.loopActive && this.loop?.beats === beats) {
      this.exitLoop();
      return;
    }
    const t = this.time;
    let start: number;
    if (this.grid && this.quantize) {
      // start on the current beat (floor) so the loop includes the playhead
      const b = beatAt(this.grid, t);
      const div = beats < 1 ? 1 / beats : 1;
      start = timeOfBeat(this.grid, Math.floor(b * div) / div);
    } else start = t;
    const end = Math.min(this.duration, start + beats * this.beatLen());
    this.loop = { start, end, beats };
    this.loopActive = true;
    this.applyLoop();
    this.emit();
  }

  loopIn(): void {
    if (!this.buffer) return;
    this.pendingLoopIn = this.q(this.time);
    if (this.loopActive) this.exitLoop();
    this.emit();
  }

  loopOut(): void {
    if (!this.buffer) return;
    const start = this.pendingLoopIn ?? this.loop?.start;
    if (start === undefined || start === null) return;
    const end = this.q(this.time);
    if (end - start < 0.01) return;
    this.loop = { start, end, beats: this.grid ? Math.round(((end - start) / this.beatLen()) * 1000) / 1000 : null };
    this.loopActive = true;
    this.pendingLoopIn = null;
    this.applyLoop();
    this.emit();
  }

  exitLoop(): void {
    this.loopActive = false;
    this.applyLoop();
    this.emit();
  }

  /** RELOOP/EXIT: exit an active loop, or re-enable (and jump into) the last loop. */
  reloop(): void {
    if (!this.loop) return;
    if (this.loopActive) {
      this.exitLoop();
      return;
    }
    this.loopActive = true;
    this.applyLoop();
    if (this.time < this.loop.start || this.time > this.loop.end) this.seek(this.loop.start);
    this.emit();
  }

  loopResize(factor: number): void {
    if (!this.loop) return;
    const len = (this.loop.end - this.loop.start) * factor;
    if (len < 0.005 || this.loop.start + len > this.duration) return;
    this.loop = {
      start: this.loop.start,
      end: this.loop.start + len,
      beats: this.loop.beats !== null ? this.loop.beats * factor : null,
    };
    // if halving left the playhead outside the loop, jump back in
    if (this.loopActive && this.time >= this.loop.end) this.seek(this.loop.start);
    this.applyLoop();
    this.emit();
  }

  /** Jump by a number of beats (negative = back). Moves an active loop along. */
  beatjump(beats: number): void {
    if (!this.buffer) return;
    const d = beats * this.beatLen();
    if (this.loop && this.loopActive) {
      this.loop = { ...this.loop, start: this.loop.start + d, end: this.loop.end + d };
      this.applyLoop();
    }
    this.seek(this.time + d);
  }

  // ------------------------------------------------------------------ jog wheel

  jogTouch(down: boolean): void {
    this.jogTouched = down;
    if (down) {
      this.scratchTicks = 0;
      this.scratchRate = 0;
      this.scratchLast = performance.now();
      this.send({ type: 'scratch', active: true, rate: 0 });
      if (this.scratchTimer === null) {
        this.scratchTimer = window.setInterval(() => this.scratchTick(), 10);
      }
    } else {
      if (this.scratchTimer !== null) {
        clearInterval(this.scratchTimer);
        this.scratchTimer = null;
      }
      this.send({ type: 'scratch', active: false, rate: 0 });
    }
  }

  private scratchTick(): void {
    const now = performance.now();
    const dt = (now - this.scratchLast) / 1000;
    this.scratchLast = now;
    if (dt <= 0) return;
    const seconds = (this.scratchTicks / JOG_TICKS_PER_REV) * SECONDS_PER_REV;
    this.scratchTicks = 0;
    const instant = seconds / dt;
    // alpha smoothing to hide MIDI message jitter
    this.scratchRate += (instant - this.scratchRate) * 0.35;
    if (Math.abs(this.scratchRate) < 0.001) this.scratchRate = 0;
    this.send({ type: 'scratch', active: true, rate: this.scratchRate });
  }

  /** Top of the platter moved while touched. */
  jogScratch(ticks: number): void {
    if (this.jogTouched) this.scratchTicks += ticks;
    else this.jogBend(ticks);
  }

  /** Outer ring: pitch bend when playing, fine scrub when paused. */
  jogBend(ticks: number): void {
    if (!this.buffer) return;
    if (this.playing) {
      this.send({ type: 'bend', value: clamp(ticks * 0.01, -0.5, 0.5) });
      if (this.bendTimer !== null) clearTimeout(this.bendTimer);
      this.bendTimer = window.setTimeout(() => {
        this.send({ type: 'bend', value: 0 });
        this.bendTimer = null;
      }, 60);
    } else {
      this.seek(this.time + (ticks / JOG_TICKS_PER_REV) * SECONDS_PER_REV);
    }
  }

  /** SHIFT + jog: fast search. */
  jogSeek(ticks: number): void {
    this.seek(this.time + ticks * 0.25);
  }

  /** Temporary pitch bend for the on-screen nudge buttons. */
  nudge(amount: number): void {
    this.send({ type: 'bend', value: amount });
  }

  // ------------------------------------------------------------------ sync

  /** Match tempo and beat phase to `leader`. */
  syncTo(leader: Deck): boolean {
    if (!this.grid || !leader.grid || !leader.loaded) return false;
    this.setTempoFactor(syncTempo(this.grid.bpm, leader.effectiveBpm));
    // align beat phase (when the leader is playing, or both decks are paused)
    if (leader.playing || !this.playing) this.alignPhase(leader);
    this.synced = true;
    this.emit();
    return true;
  }

  /** Match only the tempo of `leader` (used while the leader's pitch fader moves). */
  followTempo(leader: Deck): void {
    if (!this.grid || !leader.grid) return;
    this.setTempoFactor(syncTempo(this.grid.bpm, leader.effectiveBpm));
  }

  alignPhase(leader: Deck): void {
    if (!this.grid || !leader.grid) return;
    const corr = phaseCorrection(leader.grid, leader.time, this.grid, this.time);
    if (Math.abs(corr) > 0.002) this.seek(this.time + corr);
  }

  serialize(): DeckPersistedState {
    return { cuePoint: this.cuePoint, hotcues: [...this.hotcues] };
  }
}
