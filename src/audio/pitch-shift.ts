/**
 * Real-time pitch shifter (two crossfaded read heads on a short delay line). Changes key
 * without changing tempo: used for key shift / key sync and for key lock (master tempo).
 *
 * shortcut: granular delay-line shifting adds slight phasing on long sustained sounds;
 * upgrade to WSOLA or a phase vocoder if users ask for studio-quality key lock.
 */
export class PitchShifter {
  private readonly size: number;
  private readonly bufL: Float32Array;
  private readonly bufR: Float32Array;
  private write = 0;
  private phase = 0; // 0..1 position of read head A within the grain window
  private mix = 0; // 0 = dry (bypass), 1 = shifted; ramps to avoid clicks

  /** @param windowSec grain length; ~50 ms suits mixed DJ material */
  constructor(
    private readonly sampleRate: number,
    windowSec = 0.05,
  ) {
    this.size = Math.max(64, Math.round(sampleRate * windowSec));
    // delay line holds two windows so read heads never pass the write head
    this.bufL = new Float32Array(this.size * 2);
    this.bufR = new Float32Array(this.size * 2);
  }

  private read(buf: Float32Array, delay: number): number {
    const len = buf.length;
    let pos = this.write - delay;
    while (pos < 0) pos += len;
    const i = Math.floor(pos);
    const t = pos - i;
    return buf[i % len] * (1 - t) + buf[(i + 1) % len] * t;
  }

  /**
   * Process a block in place.
   * @param ratio pitch factor (2 = one octave up, 1 = unchanged → passes the signal through)
   */
  process(L: Float32Array, R: Float32Array | null, frames: number, ratio: number): void {
    const active = Math.abs(ratio - 1) > 1e-4;
    const W = this.size;
    const len = this.bufL.length;
    const step = (1 - ratio) / W; // how fast the grain delay sweeps
    const mixStep = 1 / (0.01 * this.sampleRate); // 10 ms crossfade into / out of the shifter
    for (let f = 0; f < frames; f++) {
      const l = L[f];
      const r = R ? R[f] : l;
      this.bufL[this.write] = l;
      this.bufR[this.write] = r;

      const target = active ? 1 : 0;
      if (this.mix !== target) this.mix = Math.max(0, Math.min(1, this.mix + (target > this.mix ? mixStep : -mixStep)));

      if (this.mix > 0) {
        this.phase += step;
        this.phase -= Math.floor(this.phase);
        const pB = (this.phase + 0.5) % 1;
        // sin² windows on heads half a grain apart always sum to 1
        const gA = Math.sin(Math.PI * this.phase) ** 2;
        const gB = 1 - gA;
        const dA = 1 + this.phase * W;
        const dB = 1 + pB * W;
        const sl = this.read(this.bufL, dA) * gA + this.read(this.bufL, dB) * gB;
        const sr = this.read(this.bufR, dA) * gA + this.read(this.bufR, dB) * gB;
        L[f] = l + (sl - l) * this.mix;
        if (R) R[f] = r + (sr - r) * this.mix;
      }
      this.write = (this.write + 1) % len;
    }
  }

  reset(): void {
    this.bufL.fill(0);
    this.bufR.fill(0);
    this.phase = 0;
    this.mix = 0;
  }
}

/** Pitch factor for a key shift in semitones, optionally cancelling the tempo's pitch change. */
export function pitchRatio(semitones: number, tempo: number, keyLock: boolean): number {
  const shift = Math.pow(2, semitones / 12);
  const t = Math.abs(tempo);
  return keyLock && t > 0.01 ? shift / t : shift;
}
