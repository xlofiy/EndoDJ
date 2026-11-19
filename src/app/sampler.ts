/** 8-slot sampler (pad mode SAMPLER), played straight into the master bus. */
import type { AudioEngine } from '../audio/engine';

export const SAMPLER_SLOTS = 8;

export class Sampler {
  slots: ({ name: string; buffer: AudioBuffer } | null)[] = new Array(SAMPLER_SLOTS).fill(null);
  readonly output: GainNode;
  private playing: (AudioBufferSourceNode | null)[] = new Array(SAMPLER_SLOTS).fill(null);
  volume = 0.8;

  constructor(private engine: AudioEngine) {
    this.output = engine.ctx.createGain();
    this.output.gain.value = this.volume;
    this.output.connect(engine.masterBus);
  }

  setVolume(v: number): void {
    this.volume = v;
    this.output.gain.setTargetAtTime(v, this.engine.ctx.currentTime, 0.01);
  }

  async loadFile(slot: number, file: File): Promise<void> {
    const buffer = await this.engine.ctx.decodeAudioData(await file.arrayBuffer());
    this.setBuffer(slot, file.name.replace(/\.[^.]+$/, ''), buffer);
  }

  setBuffer(slot: number, name: string, buffer: AudioBuffer): void {
    if (this.playing[slot]) this.trigger(slot); // stop the old sound
    this.slots[slot] = { name, buffer };
  }

  /** Start the sample, or stop it if it is still playing. */
  trigger(slot: number): void {
    const s = this.slots[slot];
    if (!s) return;
    const cur = this.playing[slot];
    if (cur) {
      cur.stop();
      this.playing[slot] = null;
      return;
    }
    const src = this.engine.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.connect(this.output);
    src.onended = () => {
      if (this.playing[slot] === src) this.playing[slot] = null;
    };
    src.start();
    this.playing[slot] = src;
  }

  isPlaying(slot: number): boolean {
    return this.playing[slot] !== null;
  }
}
