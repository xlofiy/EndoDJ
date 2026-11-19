/**
 * Audio engine: owns the AudioContext, the two decks, the mixer, the Beat FX unit,
 * headphone cue routing and the recorder.
 *
 *  deck → trim → EQ low/mid/high → filter → [FX insert] → channel fader → crossfader ─┐
 *                                         └→ PFL (cue) gain ───────────→ cue bus      │
 *  master bus ← ────────────────────────────────────────────────────────────────────────┘
 *  master bus → [FX insert] → master gain → limiter → output routing / recorder / meter
 */
import processorUrl from './deck-processor.ts?worker&url';
import { Deck } from './deck';
import { BEAT_FRACTIONS, createEffect, type Effect, type EffectType } from './effects';
import { PartSplitter } from './parts';
import {
  crossfaderGains,
  eqKnobToDb,
  faderToGain,
  filterKnob,
  trimKnobToGain,
  type CrossfaderCurve,
} from './mixmath';

export type OutputMode = 'stereo' | 'split' | 'multi';
export type FxTarget = 'deck1' | 'deck2' | 'master';

export class ChannelStrip {
  readonly trim: GainNode;
  readonly low: BiquadFilterNode;
  readonly mid: BiquadFilterNode;
  readonly high: BiquadFilterNode;
  readonly filter: BiquadFilterNode;
  readonly fxIn: GainNode;
  readonly fxOut: GainNode;
  readonly fader: GainNode;
  readonly xfade: GainNode;
  readonly pfl: GainNode;
  readonly meter: AnalyserNode;
  readonly parts: PartSplitter;

  values = { trim: 0.5, low: 0.5, mid: 0.5, high: 0.5, filter: 0.5, volume: 0.8, pfl: false };

  constructor(private ctx: AudioContext, input: AudioNode, master: AudioNode, cue: AudioNode) {
    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 200;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 3500;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'allpass';
    this.fxIn = ctx.createGain();
    this.fxOut = ctx.createGain();
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.pfl = ctx.createGain();
    this.pfl.gain.value = 0;
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;

    this.parts = new PartSplitter(ctx);
    input.connect(this.parts.input);
    this.parts.output.connect(this.trim).connect(this.low).connect(this.mid).connect(this.high).connect(this.filter);
    this.filter.connect(this.fxIn);
    this.fxIn.connect(this.fxOut); // direct until an effect is inserted
    this.fxOut.connect(this.fader).connect(this.xfade).connect(master);
    this.fxOut.connect(this.pfl).connect(cue);
    this.fader.connect(this.meter);
    this.apply();
  }

  set(param: keyof ChannelStrip['values'], value: number | boolean): void {
    (this.values as Record<string, number | boolean>)[param] = value;
    this.apply();
  }

  apply(): void {
    const t = this.ctx.currentTime;
    const v = this.values;
    this.trim.gain.setTargetAtTime(trimKnobToGain(v.trim), t, 0.01);
    this.low.gain.setTargetAtTime(eqKnobToDb(v.low), t, 0.01);
    this.mid.gain.setTargetAtTime(eqKnobToDb(v.mid), t, 0.01);
    this.high.gain.setTargetAtTime(eqKnobToDb(v.high), t, 0.01);
    const f = filterKnob(v.filter);
    if (f.type === 'off') {
      this.filter.type = 'allpass';
      this.filter.frequency.setTargetAtTime(20000, t, 0.01);
      this.filter.Q.setTargetAtTime(0.0001, t, 0.01);
    } else {
      this.filter.type = f.type;
      this.filter.frequency.setTargetAtTime(f.frequency, t, 0.01);
      this.filter.Q.setTargetAtTime(f.q, t, 0.01);
    }
    this.fader.gain.setTargetAtTime(faderToGain(v.volume), t, 0.01);
    this.pfl.gain.setTargetAtTime(v.pfl ? 1 : 0, t, 0.01);
  }
}

export class FxUnit {
  type: EffectType = 'echo';
  target: FxTarget = 'master';
  beats = 1;
  level = 0.5;
  enabled = false;
  private effect: Effect | null = null;

  constructor(private engine: AudioEngine) {}

  private slot(target: FxTarget): { fxIn: GainNode; fxOut: GainNode } {
    if (target === 'master') return { fxIn: this.engine.masterFxIn, fxOut: this.engine.masterFxOut };
    return this.engine.strips[target === 'deck1' ? 0 : 1];
  }

  private rebuild(): void {
    const ctx = this.engine.ctx;
    if (this.effect) {
      const old = this.slot(this.target);
      old.fxIn.disconnect();
      old.fxIn.connect(old.fxOut);
      this.effect.dispose();
      this.effect = null;
    }
    const slot = this.slot(this.target);
    const fx = createEffect(ctx, this.type);
    slot.fxIn.disconnect();
    slot.fxIn.connect(fx.input);
    fx.output.connect(slot.fxOut);
    this.effect = fx;
    this.updateParams();
    fx.setEnabled(this.enabled);
  }

  init(): void {
    this.rebuild();
  }

  setType(type: EffectType): void {
    this.type = type;
    this.rebuild();
  }

  setTarget(target: FxTarget): void {
    if (this.effect) {
      const old = this.slot(this.target);
      old.fxIn.disconnect();
      old.fxIn.connect(old.fxOut);
      this.effect.dispose();
      this.effect = null;
    }
    this.target = target;
    this.rebuild();
  }

  setBeats(beats: number): void {
    this.beats = beats;
    this.updateParams();
  }

  stepBeats(dir: number): void {
    const i = BEAT_FRACTIONS.indexOf(this.beats);
    const j = Math.max(0, Math.min(BEAT_FRACTIONS.length - 1, (i < 0 ? 4 : i) + dir));
    this.setBeats(BEAT_FRACTIONS[j]);
  }

  setLevel(level: number): void {
    this.level = level;
    this.effect?.setLevel(level);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.updateParams();
    this.effect?.setEnabled(on);
  }

  /** BPM source: the target deck, or for master the playing deck with the loudest fader. */
  bpm(): number {
    const decks = this.engine.decks;
    if (this.target === 'deck1') return decks[0].effectiveBpm || 120;
    if (this.target === 'deck2') return decks[1].effectiveBpm || 120;
    const playing = decks.filter((d) => d.playing && d.effectiveBpm > 0);
    if (playing.length === 0) return decks.find((d) => d.effectiveBpm > 0)?.effectiveBpm || 120;
    return playing.sort(
      (a, b) => this.engine.strips[b.index].values.volume - this.engine.strips[a.index].values.volume,
    )[0].effectiveBpm;
  }

  updateParams(): void {
    if (!this.effect) return;
    this.effect.setBeat((60 / this.bpm()) * this.beats);
    this.effect.setLevel(this.level);
  }
}

export class AudioEngine {
  readonly ctx: AudioContext;
  decks: Deck[] = [];
  strips: ChannelStrip[] = [];
  fx!: FxUnit;
  readonly masterBus: GainNode;
  readonly cueBus: GainNode;
  readonly masterFxIn: GainNode;
  readonly masterFxOut: GainNode;
  readonly masterGain: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly masterMeter: AnalyserNode;
  private recordDest: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];

  // output routing
  private merger: ChannelMergerNode | null = null;
  private routingNodes: AudioNode[] = [];
  private hpCueAmt: GainNode | null = null;
  private hpMasterAmt: GainNode | null = null;
  outputMode: OutputMode = 'stereo';
  crossfader = 0.5;
  crossfaderCurve: CrossfaderCurve = 'smooth';
  headphoneMix = 0.5; // 0 = cue only, 1 = master only
  headphoneLevel = 0.8;
  masterLevel = 0.8;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterBus = ctx.createGain();
    this.cueBus = ctx.createGain();
    this.masterFxIn = ctx.createGain();
    this.masterFxOut = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 1024;
    this.recordDest = ctx.createMediaStreamDestination();

    this.masterBus.connect(this.masterFxIn);
    this.masterFxIn.connect(this.masterFxOut);
    this.masterFxOut.connect(this.masterGain).connect(this.limiter);
    this.limiter.connect(this.masterMeter);
    this.limiter.connect(this.recordDest);
  }

  static async create(): Promise<AudioEngine> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(processorUrl);
    const engine = new AudioEngine(ctx);
    for (let i = 0; i < 2; i++) {
      const deck = new Deck(ctx, i);
      engine.decks.push(deck);
      engine.strips.push(new ChannelStrip(ctx, deck.node, engine.masterBus, engine.cueBus));
    }
    engine.fx = new FxUnit(engine);
    engine.fx.init();
    engine.applyCrossfader();
    engine.setMasterLevel(engine.masterLevel);
    engine.setOutputMode('stereo');
    return engine;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  // ------------------------------------------------------------------ mixer

  setCrossfader(x: number): void {
    this.crossfader = x;
    this.applyCrossfader();
  }

  setCrossfaderCurve(c: CrossfaderCurve): void {
    this.crossfaderCurve = c;
    this.applyCrossfader();
  }

  private applyCrossfader(): void {
    const [a, b] = crossfaderGains(this.crossfader, this.crossfaderCurve);
    const t = this.ctx.currentTime;
    this.strips[0]?.xfade.gain.setTargetAtTime(a, t, 0.005);
    this.strips[1]?.xfade.gain.setTargetAtTime(b, t, 0.005);
  }

  setMasterLevel(v: number): void {
    this.masterLevel = v;
    this.masterGain.gain.setTargetAtTime(faderToGain(v) * 1.25, this.ctx.currentTime, 0.01);
  }

  setHeadphones(mix: number, level: number): void {
    this.headphoneMix = mix;
    this.headphoneLevel = level;
    const t = this.ctx.currentTime;
    this.hpCueAmt?.gain.setTargetAtTime((1 - mix) * level, t, 0.01);
    this.hpMasterAmt?.gain.setTargetAtTime(mix * level, t, 0.01);
  }

  // ------------------------------------------------------------------ output routing

  get maxOutputChannels(): number {
    return this.ctx.destination.maxChannelCount;
  }

  /**
   * stereo: master on outputs 1/2 (no separate headphone cue)
   * split:  mono cue/headphone mix on the left, mono master on the right (split cable)
   * multi:  master on 1/2, headphones on 3/4 (4-channel audio interface, e.g. a controller's
   *         built-in sound card when the OS exposes all 4 channels)
   */
  setOutputMode(mode: OutputMode): void {
    if (mode === 'multi' && this.maxOutputChannels < 4) mode = 'stereo';
    this.outputMode = mode;
    const ctx = this.ctx;
    // tear down previous routing
    try {
      this.limiter.disconnect(ctx.destination);
    } catch {
      /* not connected */
    }
    for (const n of this.routingNodes) {
      try {
        this.limiter.disconnect(n);
      } catch {
        /* limiter did not feed this node */
      }
      n.disconnect();
    }
    this.routingNodes = [];
    this.cueBus.disconnect(); // the cue bus only ever feeds routing nodes
    this.hpCueAmt = null;
    this.hpMasterAmt = null;
    if (this.merger) {
      this.merger.disconnect();
      this.merger = null;
    }

    if (mode === 'stereo') {
      ctx.destination.channelCount = 2;
      ctx.destination.channelCountMode = 'explicit';
      ctx.destination.channelInterpretation = 'speakers';
      this.limiter.connect(ctx.destination);
      return;
    }

    // headphone signal = cue bus ⨉ (1-mix) + master ⨉ mix, scaled by level
    const hp = ctx.createGain();
    const cueAmt = ctx.createGain();
    const mstAmt = ctx.createGain();
    cueAmt.gain.value = (1 - this.headphoneMix) * this.headphoneLevel;
    mstAmt.gain.value = this.headphoneMix * this.headphoneLevel;
    this.cueBus.connect(cueAmt).connect(hp);
    this.limiter.connect(mstAmt).connect(hp);
    this.routingNodes.push(hp, cueAmt, mstAmt);
    this.hpCueAmt = cueAmt;
    this.hpMasterAmt = mstAmt;

    if (mode === 'split') {
      ctx.destination.channelCount = 2;
      ctx.destination.channelCountMode = 'explicit';
      ctx.destination.channelInterpretation = 'discrete';
      const merger = ctx.createChannelMerger(2);
      const hpMono = ctx.createGain();
      hpMono.channelCount = 1;
      hpMono.channelCountMode = 'explicit';
      hpMono.channelInterpretation = 'speakers';
      const mMono = ctx.createGain();
      mMono.channelCount = 1;
      mMono.channelCountMode = 'explicit';
      mMono.channelInterpretation = 'speakers';
      hp.connect(hpMono).connect(merger, 0, 0);
      this.limiter.connect(mMono).connect(merger, 0, 1);
      merger.connect(ctx.destination);
      this.routingNodes.push(hpMono, mMono);
      this.merger = merger;
      return;
    }

    // multi
    ctx.destination.channelCount = 4;
    ctx.destination.channelCountMode = 'explicit';
    ctx.destination.channelInterpretation = 'discrete';
    const split = ctx.createChannelSplitter(2);
    const hpSplit = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(4);
    this.limiter.connect(split);
    split.connect(merger, 0, 0);
    split.connect(merger, 1, 1);
    hp.connect(hpSplit);
    hpSplit.connect(merger, 0, 2);
    hpSplit.connect(merger, 1, 3);
    merger.connect(ctx.destination);
    this.routingNodes.push(split, hpSplit);
    this.merger = merger;
  }

  async listOutputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audiooutput');
  }

  get canSelectOutput(): boolean {
    return 'setSinkId' in this.ctx;
  }

  async setOutputDevice(id: string): Promise<void> {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!c.setSinkId) throw new Error('This browser cannot choose the audio output device.');
    await c.setSinkId(id);
    // the new device may have a different channel count
    this.setOutputMode(this.outputMode);
  }

  // ------------------------------------------------------------------ recording

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  startRecording(): void {
    if (this.recording) return;
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
    this.recordChunks = [];
    this.recorder = new MediaRecorder(this.recordDest.stream, mimeType ? { mimeType, audioBitsPerSecond: 256000 } : {});
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordChunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || rec.state === 'inactive') {
        resolve(new Blob(this.recordChunks));
        return;
      }
      rec.onstop = () => resolve(new Blob(this.recordChunks, { type: rec.mimeType || 'audio/webm' }));
      rec.stop();
    });
  }

  // ------------------------------------------------------------------ helpers

  otherDeck(d: Deck): Deck {
    return this.decks[d.index === 0 ? 1 : 0];
  }
}

/** RMS level 0..1 of an analyser (for VU meters). */
export function meterLevel(an: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  an.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  return peak;
}
