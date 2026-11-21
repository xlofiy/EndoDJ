/**
 * AudioWorklet processor for one deck. Thin message wrapper around PlayerCore.
 * Loaded with audioContext.audioWorklet.addModule(url).
 */
import { PlayerCore } from './player-core';

// Minimal typings for the AudioWorkletGlobalScope (not part of TS's DOM lib).
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export type DeckCommand =
  | { type: 'load'; channels: Float32Array[]; sampleRate: number }
  | { type: 'unload' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; frame: number }
  | { type: 'tempo'; value: number }
  | { type: 'bend'; value: number }
  | { type: 'scratch'; active: boolean; rate: number }
  | { type: 'loop'; start: number; end: number }
  | { type: 'loopOff' }
  | { type: 'key'; shift: number; keyLock: boolean };

export interface DeckStatus {
  type: 'status';
  /** source frame */
  position: number;
  /** source frames per output frame */
  rate: number;
  playing: boolean;
  /** AudioContext time the status refers to */
  time: number;
}

const REPORT_EVERY_BLOCKS = 3;

class DeckProcessor extends AudioWorkletProcessor {
  private core = new PlayerCore();
  private blocks = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<DeckCommand>) => this.command(e.data);
  }

  private command(m: DeckCommand): void {
    const c = this.core;
    switch (m.type) {
      case 'load':
        c.load(m.channels, m.sampleRate, sampleRate);
        break;
      case 'unload':
        c.unload();
        break;
      case 'play':
        c.playing = true;
        c.ended = false;
        break;
      case 'pause':
        c.playing = false;
        break;
      case 'seek':
        c.seek(m.frame);
        break;
      case 'tempo':
        c.tempo = m.value;
        break;
      case 'bend':
        c.bend = m.value;
        break;
      case 'scratch':
        c.scratching = m.active;
        c.scratchRate = m.rate;
        break;
      case 'loop':
        c.loop = { start: m.start, end: m.end };
        break;
      case 'loopOff':
        c.loop = null;
        break;
      case 'key':
        c.keyShift = m.shift;
        c.keyLock = m.keyLock;
        break;
    }
    this.report();
  }

  private report(): void {
    const status: DeckStatus = {
      type: 'status',
      position: this.core.position,
      rate: this.core.rate,
      playing: this.core.playing,
      time: currentTime,
    };
    this.port.postMessage(status);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (out && out.length) {
      this.core.process(out[0], out.length > 1 ? out[1] : null, out[0].length);
    }
    if (this.core.ended) {
      this.core.ended = false;
      this.port.postMessage({ type: 'ended' });
    }
    if (++this.blocks >= REPORT_EVERY_BLOCKS) {
      this.blocks = 0;
      this.report();
    }
    return true;
  }
}

registerProcessor('endodj-deck', DeckProcessor);
