/** Loop Lab runtime: renders (and caches) built-in loops, previews them, sends them to decks / pads. */
import LoopWorker from './loop-worker.ts?worker';
import type { LoopRenderRequest, LoopRenderResponse } from './loop-worker';
import { findLoop, type LoopDef } from './catalog';
import type { AudioEngine } from '../audio/engine';

export class LoopLab {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (b: AudioBuffer) => void; reject: (e: Error) => void }>();
  private cache = new Map<string, Promise<AudioBuffer>>();
  private preview: AudioBufferSourceNode | null = null;
  private previewGain: GainNode;
  previewing: string | null = null;
  onChange: (() => void) | null = null;

  constructor(private engine: AudioEngine) {
    this.previewGain = engine.ctx.createGain();
    this.previewGain.gain.value = 0.8;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new LoopWorker();
      this.worker.onmessage = (e: MessageEvent<LoopRenderResponse>) => {
        const p = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        if (!p) return;
        if (!e.data.channels) {
          p.reject(new Error(e.data.error ?? 'Render failed'));
          return;
        }
        const ch = e.data.channels;
        const buf = this.engine.ctx.createBuffer(ch.length, ch[0].length, this.engine.ctx.sampleRate);
        ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
        p.resolve(buf);
      };
    }
    return this.worker;
  }

  /** Rendered buffer for a built-in loop (rendered once per session, then cached). */
  buffer(loopId: string): Promise<AudioBuffer> {
    let p = this.cache.get(loopId);
    if (!p) {
      p = new Promise<AudioBuffer>((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, { resolve, reject });
        const req: LoopRenderRequest = { id, loopId, sampleRate: this.engine.ctx.sampleRate };
        this.getWorker().postMessage(req);
      });
      p.catch(() => this.cache.delete(loopId));
      this.cache.set(loopId, p);
    }
    return p;
  }

  def(loopId: string): LoopDef | undefined {
    return findLoop(loopId);
  }

  /**
   * Preview in the headphones (cue bus) when a headphone output is configured,
   * otherwise on the master output.
   */
  async togglePreview(loopId: string): Promise<void> {
    const wasThis = this.previewing === loopId;
    this.stopPreview();
    if (wasThis) return;
    const buf = await this.buffer(loopId);
    const src = this.engine.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = (this.def(loopId)?.bpm ?? 0) > 0;
    this.previewGain.disconnect();
    this.previewGain.connect(this.engine.outputMode === 'stereo' ? this.engine.masterBus : this.engine.cueBus);
    src.connect(this.previewGain);
    src.onended = () => {
      if (this.preview === src) {
        this.preview = null;
        this.previewing = null;
        this.onChange?.();
      }
    };
    src.start();
    this.preview = src;
    this.previewing = loopId;
    this.onChange?.();
  }

  stopPreview(): void {
    if (this.preview) {
      this.preview.onended = null;
      this.preview.stop();
      this.preview = null;
    }
    this.previewing = null;
    this.onChange?.();
  }
}
