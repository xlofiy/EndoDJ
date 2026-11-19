/**
 * Sample-accurate deck playback core. Runs inside the AudioWorklet (deck-processor.ts),
 * kept free of worklet globals so it can be unit-tested.
 *
 * Positions are in *source* frames (frames of the loaded track, at its own sample rate).
 */

export interface LoopRegion {
  start: number; // source frames
  end: number; // source frames, > start
}

export class PlayerCore {
  channels: Float32Array[] = [];
  /** source sample rate / output sample rate */
  private srcRatio = 1;
  length = 0;

  position = 0;
  playing = false;
  /** user tempo factor (1 = original speed). */
  tempo = 1;
  /** temporary additive rate offset from jog-bend / nudge. */
  bend = 0;
  /** While scratching, the platter speed in "rate" units replaces normal playback. */
  scratching = false;
  scratchRate = 0;
  loop: LoopRegion | null = null;

  /** the rate actually applied this frame (smoothed). */
  private currentRate = 0;
  /** reaching end-of-track sets this so the main thread can react */
  ended = false;

  load(channels: Float32Array[], srcSampleRate: number, outSampleRate: number): void {
    this.channels = channels;
    this.length = channels.length ? channels[0].length : 0;
    this.srcRatio = srcSampleRate / outSampleRate;
    this.position = 0;
    this.playing = false;
    this.loop = null;
    this.currentRate = 0;
    this.ended = false;
    this.scratching = false;
    this.bend = 0;
  }

  unload(): void {
    this.load([], 44100, 44100);
  }

  seek(frame: number): void {
    this.position = Math.max(0, Math.min(frame, Math.max(0, this.length - 1)));
    this.ended = false;
  }

  /** Target rate in source frames per output frame. */
  targetRate(): number {
    if (this.scratching) return this.scratchRate * this.srcRatio;
    if (!this.playing) return 0;
    return (this.tempo + this.bend) * this.srcRatio;
  }

  private read(ch: Float32Array, pos: number): number {
    // 4-point, 3rd-order Hermite interpolation
    const i = Math.floor(pos);
    const t = pos - i;
    const n = ch.length;
    const xm1 = i - 1 >= 0 && i - 1 < n ? ch[i - 1] : 0;
    const x0 = i >= 0 && i < n ? ch[i] : 0;
    const x1 = i + 1 >= 0 && i + 1 < n ? ch[i + 1] : 0;
    const x2 = i + 2 >= 0 && i + 2 < n ? ch[i + 2] : 0;
    const c1 = 0.5 * (x1 - xm1);
    const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    return ((c3 * t + c2) * t + c1) * t + x0;
  }

  /**
   * Render `frames` frames into the output channels (1 or 2).
   * @param smoothing 0..1 per-frame approach factor toward the target rate
   *   (lower = more "platter inertia"). Normal play uses fast smoothing; scratching slower.
   */
  process(outL: Float32Array, outR: Float32Array | null, frames: number): void {
    const hasAudio = this.length > 0;
    const left = this.channels[0];
    const right = this.channels.length > 1 ? this.channels[1] : this.channels[0];
    const target = this.targetRate();
    const smoothing = this.scratching ? 0.02 : 0.01;
    for (let f = 0; f < frames; f++) {
      this.currentRate += (target - this.currentRate) * smoothing;
      if (Math.abs(this.currentRate - target) < 1e-6) this.currentRate = target;
      if (!hasAudio || this.currentRate === 0) {
        outL[f] = 0;
        if (outR) outR[f] = 0;
        continue;
      }
      const pos = this.position;
      if (pos >= 0 && pos < this.length) {
        outL[f] = this.read(left, pos);
        if (outR) outR[f] = this.read(right, pos);
      } else {
        outL[f] = 0;
        if (outR) outR[f] = 0;
      }
      let next = pos + this.currentRate;
      const loop = this.loop;
      if (loop && loop.end > loop.start) {
        const len = loop.end - loop.start;
        if (this.currentRate > 0 && pos < loop.end && next >= loop.end) next -= len;
        else if (this.currentRate < 0 && pos >= loop.start && next < loop.start) next += len;
      }
      if (next < 0) next = 0;
      if (next >= this.length) {
        next = this.length;
        if (this.playing && !this.scratching) {
          this.playing = false;
          this.ended = true;
        }
      }
      this.position = next;
    }
  }

  /** Current rate (source frames per output frame), useful for UI extrapolation. */
  get rate(): number {
    return this.currentRate;
  }
}
