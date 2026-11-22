/**
 * Beat-synced effects built from native Web Audio nodes.
 * Each effect exposes input → output and a `wet` mix; the FX unit inserts it into a channel.
 */

export type EffectType =
  | 'echo'
  | 'pingpong'
  | 'reverb'
  | 'flanger'
  | 'phaser'
  | 'wah'
  | 'trans'
  | 'tremolo'
  | 'distortion'
  | 'bitcrusher'
  | 'noise';

export const EFFECT_TYPES: { id: EffectType; name: string }[] = [
  { id: 'echo', name: 'Echo' },
  { id: 'pingpong', name: 'Ping-Pong (echo)' },
  { id: 'reverb', name: 'Reverb' },
  { id: 'flanger', name: 'Flanger' },
  { id: 'phaser', name: 'Phaser' },
  { id: 'wah', name: 'Wah (auto filter)' },
  { id: 'trans', name: 'Trans (gate)' },
  { id: 'tremolo', name: 'Tremolo' },
  { id: 'distortion', name: 'Distortion' },
  { id: 'bitcrusher', name: 'Bitcrusher' },
  { id: 'noise', name: 'Noise (sweep)' },
];

export const BEAT_FRACTIONS = [1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16];

export interface Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  /** effects with a tail (echo, reverb) keep ringing after they are switched off */
  readonly hasTail: boolean;
  /** set the beat-synced time parameter */
  setBeat(seconds: number): void;
  /** 0..1 depth / wet level */
  setLevel(level: number): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

const RAMP = 0.02;

abstract class BaseEffect implements Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  protected readonly dry: GainNode;
  protected readonly send: GainNode; // input → effect chain
  protected readonly wet: GainNode; // effect chain → output
  protected level = 0.5;
  protected enabled = false;
  abstract readonly hasTail: boolean;
  protected nodes: AudioNode[] = [];

  constructor(protected ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.send = ctx.createGain();
    this.wet = ctx.createGain();
    this.send.gain.value = 0;
    this.wet.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(this.send);
    this.wet.connect(this.output);
  }

  abstract setBeat(seconds: number): void;

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    this.update();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.update();
  }

  protected update(): void {
    const t = this.ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    if (this.hasTail) {
      // dry always full; send gates the input; wet stays up so tails decay naturally
      this.dry.gain.setTargetAtTime(1, t, RAMP);
      this.send.gain.setTargetAtTime(on, t, RAMP);
      this.wet.gain.setTargetAtTime(this.level, t, RAMP);
    } else {
      // crossfade dry/wet by level
      this.send.gain.setTargetAtTime(on, t, RAMP);
      this.wet.gain.setTargetAtTime(on * this.level, t, RAMP);
      this.dry.gain.setTargetAtTime(1 - on * this.level * this.dryDuck(), t, RAMP);
    }
  }

  /** how much the dry signal is reduced at full level (1 = fully replaced). */
  protected dryDuck(): number {
    return 0.5;
  }

  dispose(): void {
    for (const n of [this.input, this.output, this.dry, this.send, this.wet, ...this.nodes]) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
      if (n instanceof AudioScheduledSourceNode) n.stop();
    }
  }
}

class Echo extends BaseEffect {
  readonly hasTail = true;
  private delay: DelayNode;
  private feedback: GainNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.delay = ctx.createDelay(10);
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 6000;
    this.send.connect(this.delay);
    this.delay.connect(tone).connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet);
    this.nodes.push(this.delay, this.feedback, tone);
  }
  setBeat(seconds: number): void {
    this.delay.delayTime.setTargetAtTime(Math.min(10, seconds), this.ctx.currentTime, 0.05);
  }
}

class Reverb extends BaseEffect {
  readonly hasTail = true;
  private conv: ConvolverNode;
  private lastDecay = 0;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.conv = ctx.createConvolver();
    this.send.connect(this.conv).connect(this.wet);
    this.nodes.push(this.conv);
    this.setBeat(2);
  }
  setBeat(seconds: number): void {
    const decay = Math.max(0.5, Math.min(6, seconds * 2));
    if (Math.abs(decay - this.lastDecay) < 0.05) return;
    this.lastDecay = decay;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * decay);
    const ir = this.ctx.createBuffer(2, len, sr);
    let seed = 12345;
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const noise = (seed / 0x7fffffff) * 2 - 1;
        d[i] = noise * Math.pow(1 - i / len, 3);
      }
    }
    this.conv.buffer = ir;
  }
}

class Flanger extends BaseEffect {
  readonly hasTail = false;
  private lfo: OscillatorNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.004;
    const depth = ctx.createGain();
    depth.gain.value = 0.003;
    const fb = ctx.createGain();
    fb.gain.value = 0.6;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.connect(depth).connect(delay.delayTime);
    this.send.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.wet);
    this.lfo.start();
    this.nodes.push(delay, depth, fb, this.lfo);
  }
  protected dryDuck(): number {
    return 0.3;
  }
  setBeat(seconds: number): void {
    // one sweep every 4× the selected beat length feels right for flangers
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.05, seconds * 4), this.ctx.currentTime, 0.05);
  }
}

class Phaser extends BaseEffect {
  readonly hasTail = false;
  private lfo: OscillatorNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 800;
    this.lfo.connect(depth);
    let prev: AudioNode = this.send;
    for (let i = 0; i < 4; i++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 1000;
      ap.Q.value = 0.7;
      depth.connect(ap.frequency);
      prev.connect(ap);
      prev = ap;
      this.nodes.push(ap);
    }
    prev.connect(this.wet);
    this.lfo.start();
    this.nodes.push(depth, this.lfo);
  }
  protected dryDuck(): number {
    return 0.5;
  }
  setBeat(seconds: number): void {
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.05, seconds * 4), this.ctx.currentTime, 0.05);
  }
}

class Trans extends BaseEffect {
  readonly hasTail = false;
  private lfo: OscillatorNode;
  /** square = hard gate (trans), sine = smooth tremolo */
  constructor(ctx: AudioContext, wave: OscillatorType = 'square') {
    super(ctx);
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    this.lfo = ctx.createOscillator();
    this.lfo.type = wave;
    this.lfo.connect(depth).connect(gate.gain); // gain swings 0..1
    this.send.connect(gate).connect(this.wet);
    this.lfo.start();
    this.nodes.push(gate, depth, this.lfo);
  }
  protected dryDuck(): number {
    return 1;
  }
  setBeat(seconds: number): void {
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.02, seconds), this.ctx.currentTime, 0.01);
  }
}

class Bitcrusher extends BaseEffect {
  readonly hasTail = false;
  private shaper: WaveShaperNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.send.connect(this.shaper).connect(this.wet);
    this.nodes.push(this.shaper);
    this.setBits(6);
  }
  protected dryDuck(): number {
    return 1;
  }
  private setBits(bits: number): void {
    const n = 4096;
    const curve = new Float32Array(n);
    const steps = Math.pow(2, bits);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    this.shaper.curve = curve;
  }
  setBeat(seconds: number): void {
    // map the beat knob to resolution: shorter = crunchier
    const bits = Math.round(Math.max(2, Math.min(10, 4 + Math.log2(Math.max(0.125, seconds * 2)))));
    this.setBits(bits);
  }
}

/** Stereo echo: repeats alternate left and right. */
class PingPong extends BaseEffect {
  readonly hasTail = true;
  private left: DelayNode;
  private right: DelayNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.left = ctx.createDelay(10);
    this.right = ctx.createDelay(10);
    const fb = ctx.createGain();
    fb.gain.value = 0.55;
    const merge = ctx.createChannelMerger(2); // each input is mixed down to mono
    this.send.connect(this.left);
    this.left.connect(this.right).connect(fb).connect(this.left);
    this.left.connect(merge, 0, 0);
    this.right.connect(merge, 0, 1);
    merge.connect(this.wet);
    this.nodes.push(this.left, this.right, fb, merge);
  }
  setBeat(seconds: number): void {
    const t = Math.min(10, seconds);
    this.left.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05);
    this.right.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05);
  }
}

/** Band-pass filter swept by a beat-synced LFO. */
class Wah extends BaseEffect {
  readonly hasTail = false;
  private lfo: OscillatorNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 4;
    const depth = ctx.createGain();
    depth.gain.value = 700; // 200 … 1600 Hz
    this.lfo = ctx.createOscillator();
    this.lfo.connect(depth).connect(bp.frequency);
    const makeUp = ctx.createGain();
    makeUp.gain.value = 2.5;
    this.send.connect(bp).connect(makeUp).connect(this.wet);
    this.lfo.start();
    this.nodes.push(bp, depth, makeUp, this.lfo);
  }
  protected dryDuck(): number {
    return 0.85;
  }
  setBeat(seconds: number): void {
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.05, seconds), this.ctx.currentTime, 0.05);
  }
}

/** Overdrive; the beat knob sets the drive (longer = dirtier). */
class Distortion extends BaseEffect {
  readonly hasTail = false;
  private shaper: WaveShaperNode;
  private lastDrive = 0;
  constructor(ctx: AudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    const trim = ctx.createGain();
    trim.gain.value = 0.6;
    this.send.connect(this.shaper).connect(tone).connect(trim).connect(this.wet);
    this.nodes.push(this.shaper, tone, trim);
    this.setBeat(1);
  }
  protected dryDuck(): number {
    return 1;
  }
  setBeat(seconds: number): void {
    const drive = Math.max(2, Math.min(40, seconds * 8));
    if (Math.abs(drive - this.lastDrive) < 0.5) return;
    this.lastDrive = drive;
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive);
    this.shaper.curve = curve;
  }
}

/** White noise through a band-pass that sweeps up and down; the music stays untouched. */
class NoiseSweep extends BaseEffect {
  readonly hasTail = false;
  private lfo: OscillatorNode;
  constructor(ctx: AudioContext) {
    super(ctx);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 987654;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 1.5;
    const depth = ctx.createGain();
    depth.gain.value = 2500; // 500 … 5500 Hz
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'triangle';
    this.lfo.connect(depth).connect(bp.frequency);
    const level = ctx.createGain();
    level.gain.value = 0.3;
    src.connect(bp).connect(level).connect(this.wet);
    src.start();
    this.lfo.start();
    this.nodes.push(src, bp, depth, level, this.lfo);
  }
  protected dryDuck(): number {
    return 0;
  }
  setBeat(seconds: number): void {
    // one sweep up and down every 4× the beat length
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.1, seconds * 4), this.ctx.currentTime, 0.05);
  }
}

export function createEffect(ctx: AudioContext, type: EffectType): Effect {
  switch (type) {
    case 'echo':
      return new Echo(ctx);
    case 'pingpong':
      return new PingPong(ctx);
    case 'wah':
      return new Wah(ctx);
    case 'tremolo':
      return new Trans(ctx, 'sine');
    case 'distortion':
      return new Distortion(ctx);
    case 'noise':
      return new NoiseSweep(ctx);
    case 'reverb':
      return new Reverb(ctx);
    case 'flanger':
      return new Flanger(ctx);
    case 'phaser':
      return new Phaser(ctx);
    case 'trans':
      return new Trans(ctx);
    case 'bitcrusher':
      return new Bitcrusher(ctx);
  }
}
