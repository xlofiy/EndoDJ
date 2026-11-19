/**
 * Application glue: connects the audio engine, library, analysis worker and MIDI controller,
 * and dispatches control events (from MIDI, keyboard or screen) to the right action.
 */
import AnalysisWorker from '../audio/analysis-worker.ts?worker';
import type { AnalysisRequest, AnalysisResponse } from '../audio/analysis-worker';
import { AudioEngine } from '../audio/engine';
import type { Deck } from '../audio/deck';
import { EFFECT_TYPES } from '../audio/effects';
import { Library } from '../library/library';
import { MidiController } from '../midi/midi';
import type { ControlEvent } from '../midi/mapping';
import { Automix } from './automix';
import { Sampler } from './sampler';

export const BEATLOOP_PAD_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
export const BEATJUMP_PAD_SIZES = [-1, 1, -2, 2, -4, 4, -8, 8];

export class App {
  engine!: AudioEngine;
  library!: Library;
  midi = new MidiController();
  automix!: Automix;
  sampler!: Sampler;
  private worker = new AnalysisWorker();
  private nextJob = 1;
  private jobs = new Map<number, (r: AnalysisResponse) => void>();
  private loggedPlay: (string | null)[] = [null, null];
  private loadSeq = [0, 0];

  /** library selection, used by the controller's browse encoder and LOAD buttons */
  selectedTrackId: string | null = null;
  /** registered by the UI so the browse encoder can move the selection */
  onBrowse: ((delta: number) => void) | null = null;
  onToast: ((msg: string, error?: boolean) => void) | null = null;
  /** generic "something changed" hook for the UI (e.g. after MIDI moved a knob) */
  onControl: (() => void) | null = null;

  async init(): Promise<void> {
    this.engine = await AudioEngine.create();
    this.library = await Library.open();
    await this.library.restoreHandles();
    this.automix = new Automix(this);
    this.sampler = new Sampler(this.engine);
    this.worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
      const cb = this.jobs.get(e.data.id);
      this.jobs.delete(e.data.id);
      cb?.(e.data);
    };
    this.worker.onerror = (e) => this.toast(`Analysis failed: ${e.message}`, true);

    for (const deck of this.engine.decks) {
      deck.onCuesChanged = (d) => {
        if (d.track) void this.library.update(d.track.id, d.serialize());
      };
      deck.on(() => {
        const id = deck.track?.id ?? null;
        if (deck.playing && id && this.loggedPlay[deck.index] !== id) {
          this.loggedPlay[deck.index] = id;
          void this.library.logPlay(id, deck.index);
        }
        this.updateLeds(deck);
      });
    }

    this.midi.onEvent = (e) => this.handleControl(e);
    await this.midi.init();
  }

  toast(msg: string, error = false): void {
    this.onToast?.(msg, error);
  }

  // ------------------------------------------------------------------ loading & analysis

  analyse(buffer: AudioBuffer, skipBpm: boolean): Promise<AnalysisResponse> {
    const id = this.nextJob++;
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
    const req: AnalysisRequest = { id, channels, sampleRate: buffer.sampleRate, skipBpm };
    return new Promise((resolve) => {
      this.jobs.set(id, resolve);
      this.worker.postMessage(req, channels.map((c) => c.buffer));
    });
  }

  async decode(trackId: string): Promise<AudioBuffer> {
    const file = await this.library.getFile(trackId);
    const data = await file.arrayBuffer();
    return this.engine.ctx.decodeAudioData(data);
  }

  async loadTrack(deckIndex: number, trackId: string, opts: { force?: boolean } = {}): Promise<boolean> {
    const deck = this.engine.decks[deckIndex];
    const rec = this.library.tracks.get(trackId);
    if (!rec) return false;
    if (deck.playing && !opts.force) {
      this.toast(`Deck ${deckIndex === 0 ? 'A' : 'B'} is playing — stop it before loading a new track.`, true);
      return false;
    }
    const seq = ++this.loadSeq[deckIndex];
    let buffer: AudioBuffer;
    try {
      buffer = await this.decode(trackId);
    } catch (e) {
      this.toast(`Could not load "${rec.title}": ${(e as Error).message}`, true);
      return false;
    }
    if (seq !== this.loadSeq[deckIndex]) return false; // a newer load replaced this one
    if (deck.playing && !opts.force) {
      this.toast('Deck started playing while loading — load cancelled.', true);
      return false;
    }
    deck.load({ id: rec.id, title: rec.title, artist: rec.artist }, buffer, {
      cuePoint: rec.cuePoint,
      hotcues: rec.hotcues,
    });
    this.loggedPlay[deckIndex] = null;
    if (rec.bpm > 0) deck.setAnalysis({ bpm: rec.bpm, firstBeat: rec.firstBeat }, null);
    const res = await this.analyse(buffer, rec.bpm > 0);
    if (seq !== this.loadSeq[deckIndex]) return true;
    deck.setAnalysis(rec.bpm > 0 ? null : { bpm: res.bpm, firstBeat: res.firstBeat }, res.waveform);
    const patch: Parameters<Library['update']>[1] = { duration: buffer.duration };
    if (rec.bpm <= 0 && res.bpm > 0) {
      patch.bpm = res.bpm;
      patch.firstBeat = res.firstBeat;
      patch.bpmConfidence = res.confidence;
    }
    await this.library.update(trackId, patch);
    this.engine.fx.updateParams();
    return true;
  }

  /** Analyse BPM for every library track that has none yet (sequentially). */
  async analyseLibrary(progress: (done: number, total: number) => void): Promise<void> {
    const todo = [...this.library.tracks.values()].filter((t) => t.bpm <= 0 && this.library.isAvailable(t.id));
    let done = 0;
    for (const t of todo) {
      try {
        const buf = await this.decode(t.id);
        const res = await this.analyse(buf, false);
        await this.library.update(t.id, {
          duration: buf.duration,
          bpm: res.bpm,
          firstBeat: res.firstBeat,
          bpmConfidence: res.confidence,
        });
      } catch (e) {
        console.warn('analysis failed for', t.fileName, e);
      }
      progress(++done, todo.length);
    }
  }

  /** Correct a deck's BPM (e.g. halve/double) and store it. */
  async setDeckBpm(deck: Deck, bpm: number): Promise<void> {
    if (!deck.track || !deck.grid || bpm <= 0) return;
    deck.setAnalysis({ bpm, firstBeat: deck.grid.firstBeat % (60 / bpm) }, null);
    await this.library.update(deck.track.id, { bpm, firstBeat: deck.grid?.firstBeat ?? 0 });
  }

  /** Move the beat grid so that a beat falls on the current play position. */
  async setGridHere(deck: Deck): Promise<void> {
    if (!deck.track || !deck.grid) return;
    const beat = 60 / deck.grid.bpm;
    const firstBeat = ((deck.time % beat) + beat) % beat;
    deck.setAnalysis({ bpm: deck.grid.bpm, firstBeat }, null);
    await this.library.update(deck.track.id, { firstBeat });
  }

  // ------------------------------------------------------------------ control dispatch

  private updateLeds(deck: Deck): void {
    const n = deck.index + 1;
    this.midi.setLed(`deck${n}.play`, deck.playing);
    this.midi.setLed(`deck${n}.cue`, deck.loaded && Math.abs(deck.time - deck.cuePoint) < 0.02);
    this.midi.setLed(`deck${n}.sync`, deck.synced);
    deck.hotcues.forEach((h, i) => this.midi.setLed(`deck${n}.hotcue${i + 1}`, h !== null));
  }

  /** Load the library selection onto the deck that is not playing (BROWSE push). */
  loadSelectedToFreeDeck(): void {
    if (!this.selectedTrackId) return;
    const free = this.engine.decks.find((d) => !d.playing);
    if (free) void this.loadTrack(free.index, this.selectedTrackId);
  }

  handleControl(e: ControlEvent): void {
    const [scope, action] = e.control.split('.');
    const press = e.kind === 'button' && e.value === 1;
    const release = e.kind === 'button' && e.value === 0;
    const eng = this.engine;

    if (scope === 'deck1' || scope === 'deck2') {
      const di = scope === 'deck1' ? 0 : 1;
      const deck = eng.decks[di];
      const strip = eng.strips[di];
      const num = (prefix: string) => parseInt(action.slice(prefix.length), 10) - 1;

      if (action.startsWith('hotcueClear')) {
        if (press) deck.clearHotcue(num('hotcueClear'));
      } else if (action.startsWith('hotcue')) {
        if (press) deck.hotcueDown(num('hotcue'));
        else if (release) deck.hotcueUp(num('hotcue'));
      } else if (action.startsWith('beatloop')) {
        if (press) deck.beatloop(BEATLOOP_PAD_SIZES[num('beatloop')] ?? 4);
      } else if (action.startsWith('beatjump')) {
        if (press) deck.beatjump(BEATJUMP_PAD_SIZES[num('beatjump')] ?? 1);
      } else if (action.startsWith('sampler')) {
        if (press) this.sampler.trigger(num('sampler'));
      } else {
        switch (action) {
          case 'play':
            if (press) deck.togglePlay();
            break;
          case 'cue':
            if (press) deck.cueDown();
            else if (release) deck.cueUp();
            break;
          case 'sync':
            if (press) {
              if (!deck.syncTo(eng.otherDeck(deck))) this.toast('Sync needs a BPM on both decks.', true);
            }
            break;
          case 'syncOff':
            if (press) {
              deck.synced = false;
              this.updateLeds(deck);
            }
            break;
          case 'reverse':
            if (press) deck.setReverse(!deck.reverse);
            break;
          case 'start':
            if (press) deck.toStart();
            break;
          case 'jogTouch':
            deck.jogTouch(e.value === 1);
            break;
          case 'jogScratch':
            deck.jogScratch(e.value);
            break;
          case 'jogBend':
            deck.jogBend(e.value);
            break;
          case 'jogSeek':
            deck.jogSeek(e.value);
            break;
          case 'tempo':
            // Pioneer convention: fader towards you (+) = faster
            deck.setTempoFader((e.value - 0.5) * 2);
            if (deck.synced) deck.synced = false;
            break;
          case 'volume':
            strip.set('volume', e.value);
            break;
          case 'trim':
            strip.set('trim', e.value);
            break;
          case 'eqHigh':
            strip.set('high', e.value);
            break;
          case 'eqMid':
            strip.set('mid', e.value);
            break;
          case 'eqLow':
            strip.set('low', e.value);
            break;
          case 'filter':
            strip.set('filter', e.value);
            break;
          case 'pfl':
            if (press) strip.set('pfl', !strip.values.pfl);
            break;
          case 'load':
            if (press && this.selectedTrackId) void this.loadTrack(di, this.selectedTrackId);
            break;
          case 'loopIn':
            if (press) deck.loopIn();
            break;
          case 'loopOut':
            if (press) deck.loopOut();
            break;
          case 'reloop':
            if (press) deck.reloop();
            break;
          case 'loopHalve':
            if (press) deck.loopResize(0.5);
            break;
          case 'loopDouble':
            if (press) deck.loopResize(2);
            break;
          case 'nudgeDown':
            deck.nudge(press ? -0.04 : 0);
            break;
          case 'nudgeUp':
            deck.nudge(press ? 0.04 : 0);
            break;
          case 'beatjumpBack':
            if (press) deck.beatjump(-4);
            break;
          case 'beatjumpFwd':
            if (press) deck.beatjump(4);
            break;
          case 'shift':
            break;
        }
      }
      // synced decks follow the tempo of the deck whose tempo fader moved (no phase jump)
      if (action === 'tempo') {
        for (const d of eng.decks) if (d !== deck && d.synced) d.followTempo(deck);
      }
      eng.fx.updateParams();
    } else if (scope === 'mixer') {
      if (action === 'crossfader') eng.setCrossfader(e.value);
    } else if (scope === 'browser') {
      if (action === 'scroll') this.onBrowse?.(e.value);
      else if (action === 'push' && press) this.loadSelectedToFreeDeck();
    } else if (scope === 'fx') {
      const fx = eng.fx;
      if (action === 'toggle' && press) fx.setEnabled(!fx.enabled);
      else if (action === 'beatDown' && press) fx.stepBeats(-1);
      else if (action === 'beatUp' && press) fx.stepBeats(1);
      else if (action === 'next' && press) {
        const i = EFFECT_TYPES.findIndex((t) => t.id === fx.type);
        fx.setType(EFFECT_TYPES[(i + 1) % EFFECT_TYPES.length].id);
      } else if (action === 'level') fx.setLevel(e.value);
    }
    this.onControl?.();
  }
}
