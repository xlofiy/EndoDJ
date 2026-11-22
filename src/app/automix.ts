/**
 * Automix: plays through the "Automix queue" playlist, beat-matching and crossfading
 * from one deck to the other before each track ends.
 *
 * Tracks alternate decks: the 1st, 3rd, 5th … track play on deck A, the 2nd, 4th … on deck B.
 * Loop Lab entries in the queue are *layers*: they take no deck, but play on top of the
 * transition into the track after them, tempo- and bar-synced to the outgoing deck.
 */
import type { Deck } from '../audio/deck';
import { keyName } from '../audio/key';
import { beatAt, timeOfBeat } from '../audio/mixmath';
import { detectSections } from '../audio/sections';
import { findLoop } from '../loops/catalog';
import { AUTOMIX_ID } from '../library/library';
import type { App } from './app';
import { blendPosition, planMixOut, type MixPlan } from './mixplan';
import { genreOf, keyMatch, loopsFor, LOOP_PREFIX } from './suggest';

export interface AutomixSettings {
  /** 'fade': crossfade of `fadeSeconds`; 'layer': both songs play together for `blendBars` */
  style: 'fade' | 'layer';
  fadeSeconds: number;
  blendBars: number;
  /** shift the incoming track's key when the two keys clash */
  harmonic: boolean;
  /** a drum loop of the genre on every mix (third channel), not only queued layers */
  loopEveryMix: boolean;
}
const SETTINGS_KEY = 'endodj.automix.v1';
const DEFAULTS: AutomixSettings = { style: 'layer', fadeSeconds: 12, blendBars: 16, harmonic: true, loopEveryMix: false };

/** a layer keeps playing over the incoming song for this many bars after the crossfade */
const LAYER_TAIL_BARS = 16;
const LAYER_GAIN = 0.55;

export class Automix {
  enabled = false;
  settings: AutomixSettings = Automix.loadSettings();
  /** the planned (or running) blend out of the playing deck, in its track time — drawn on the waveforms */
  plan: (MixPlan & { deck: number; next: string }) | null = null;
  private planKey = '';
  private transition: { from: Deck; to: Deck; start: number; end: number; startX: number; lows: [number, number]; swapped: boolean } | null = null;
  private loading = false;
  private timer: number | null = null;
  /** per deck: Loop Lab layer to play when that deck comes in */
  private layers: (string | null)[] = [null, null];
  private layerSrc: AudioBufferSourceNode | null = null;
  onChange: (() => void) | null = null;

  constructor(private app: App) {}

  static loadSettings(): AutomixSettings {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AutomixSettings>) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  setSettings(patch: Partial<AutomixSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.planKey = ''; // re-plan with the new blend
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
    this.onChange?.();
  }

  /** Where to mix out of `from` (cached per track and settings). */
  private planFor(from: Deck, to: Deck): MixPlan & { deck: number; next: string } {
    const s = this.settings;
    const bpm = from.grid?.bpm ?? 0;
    const len = s.style === 'layer' && bpm > 0 ? (s.blendBars * 240) / bpm : s.fadeSeconds * Math.abs(from.tempoFactor);
    const key = `${from.track?.id}|${to.track?.id}|${s.style}|${len.toFixed(2)}|${from.grid?.firstBeat}`;
    if (key !== this.planKey || !this.plan) {
      const sections = from.grid && from.waveform ? detectSections(from.waveform, from.grid, from.duration) : [];
      const p = planMixOut(from.duration, from.grid, sections, len);
      this.plan = { ...p, deck: from.index, next: to.track?.title ?? '' };
      this.planKey = key;
    }
    return this.plan;
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && this.timer === null) this.timer = window.setInterval(() => void this.tick(), 100);
    if (!on && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.finishTransition();
      this.plan = null;
      this.stopLayer();
    }
    if (on) void this.tick();
    this.onChange?.();
  }

  /**
   * Start a fresh mix of the queue: with both decks stopped, the first track goes on deck A
   * and the second on deck B, then Automix plays A and alternates from there. If a deck is
   * playing, the first queued track goes on the other deck and the mix continues from it.
   */
  async startQueue(): Promise<boolean> {
    const [a, b] = this.app.engine.decks;
    while (this.loading) await new Promise((r) => setTimeout(r, 50)); // a load the timer started
    this.finishTransition(); // a new set mid-blend: land the blend cleanly first
    this.plan = null;
    this.planKey = '';
    this.layers = [null, null];
    if (!a.playing && !b.playing) {
      if (!(await this.loadNext(a))) return false;
      await this.loadNext(b);
      this.app.engine.setCrossfader(0);
    } else {
      // the deck that is not on air (with both playing: the side the crossfader is away from)
      const free = a.playing && b.playing ? (this.app.engine.crossfader <= 0.5 ? b : a) : a.playing ? b : a;
      if (!(await this.loadNext(free))) return false;
    }
    this.setEnabled(true);
    return true;
  }

  private queueLength(): number {
    return this.app.library.queueRemaining(AUTOMIX_ID);
  }

  /** End a running blend now: incoming deck fully in, outgoing stopped, EQ restored. */
  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    const eng = this.app.engine;
    eng.setCrossfader(tr.to.index === 0 ? 0 : 1);
    tr.from.pause();
    for (const i of [0, 1]) eng.strips[i].set('low', tr.lows[i]);
    this.transition = null;
    this.plan = null;
    this.planKey = '';
    this.app.onControl?.();
  }

  /** Load the next queued track on `deck`, cue it at its first beat. Layers on the way are kept for the transition. */
  private async loadNext(deck: Deck): Promise<boolean> {
    if (this.loading) return false;
    this.loading = true;
    let layer: string | null = null;
    try {
      while (this.queueLength() > 0) {
        const id = await this.app.library.nextInQueue(AUTOMIX_ID);
        if (!id) break;
        if (id.startsWith(LOOP_PREFIX)) {
          layer = id.slice(LOOP_PREFIX.length);
          continue;
        }
        if (await this.app.loadTrack(deck.index, id)) {
          if (deck.grid) deck.seek(deck.grid.firstBeat);
          this.layers[deck.index] = layer;
          return true;
        }
      }
      return false;
    } finally {
      this.loading = false;
    }
  }

  /** Play a Loop Lab loop on top of the mix, at the lead deck's tempo, starting on its next bar. */
  private async startLayer(loopId: string, lead: Deck, blendSec: number): Promise<void> {
    const def = findLoop(loopId);
    if (!def || def.bpm <= 0) return;
    let buf: AudioBuffer;
    try {
      buf = await this.app.looplab.buffer(loopId);
    } catch {
      return; // a missing layer must not stop the mix
    }
    const eng = this.app.engine;
    const ctx = eng.ctx;
    const bpm = lead.effectiveBpm > 0 ? lead.effectiveBpm : def.bpm;
    let delay = 0;
    if (lead.grid && lead.playing) {
      const bar = Math.ceil(beatAt(lead.grid, lead.time) / 4) * 4;
      delay = Math.max(0, (timeOfBeat(lead.grid, bar) - lead.time) / Math.max(0.01, lead.tempoFactor));
    }
    // shortcut: rate-based tempo match (pitch moves with tempo); fine for the unpitched drum loops Auto-set picks
    this.stopLayer();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = bpm / def.bpm;
    const gain = ctx.createGain();
    const barSec = (4 * 60) / bpm;
    const t0 = ctx.currentTime + delay;
    const end = t0 + blendSec + LAYER_TAIL_BARS * barSec;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(LAYER_GAIN, t0);
    gain.gain.setValueAtTime(LAYER_GAIN, end - barSec);
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain).connect(eng.masterBus);
    src.start(t0);
    src.stop(end + 0.05);
    src.onended = () => {
      gain.disconnect();
      if (this.layerSrc === src) this.layerSrc = null;
    };
    this.layerSrc = src;
  }

  /** start the layer queued for `deck` (if any), synced to `lead` */
  private playLayer(deck: Deck, lead: Deck, blendSec = 0): void {
    const id = this.layers[deck.index];
    this.layers[deck.index] = null;
    if (id) void this.startLayer(id, lead, blendSec);
  }

  private stopLayer(): void {
    try {
      this.layerSrc?.stop();
    } catch {
      /* not started yet */
    }
    this.layerSrc = null;
  }

  private async tick(): Promise<void> {
    if (!this.enabled || this.loading) return;
    const eng = this.app.engine;
    const [a, b] = eng.decks;

    if (this.transition) {
      const tr = this.transition;
      const { from, to, start, end, startX, lows } = tr;
      // progress follows the outgoing track's own time, so the blend stays on its phrases
      const t = Math.min(1, Math.max(0, (from.time - start) / Math.max(0.1, end - start)));
      const target = to.index === 0 ? 0 : 1;
      eng.setCrossfader(startX + (target - startX) * blendPosition(t, this.settings.style));
      // bass swap halfway, like a DJ: never two kick drums / bass lines at full level at once
      if (t >= 0.5 && !tr.swapped) {
        tr.swapped = true;
        eng.strips[from.index].set('low', 0);
        eng.strips[to.index].set('low', lows[to.index]);
      }
      this.app.onControl?.();
      if (!to.playing) {
        // the DJ stopped the incoming track: abandon the blend, the outgoing one carries on
        eng.setCrossfader(from.index === 0 ? 0 : 1);
        for (const i of [0, 1]) eng.strips[i].set('low', lows[i]);
        this.transition = null;
        this.plan = null;
        this.planKey = '';
        return;
      }
      if (t >= 1 || !from.playing) {
        this.finishTransition();
        // the finished deck gets the next track right away, so it is clear what plays next
        if (this.queueLength() > 0) await this.loadNext(from);
      }
      return;
    }

    const playing = eng.decks.filter((d) => d.playing);
    if (playing.length === 0) {
      // start the mix
      const deck = a.loaded && a.time < a.duration - 1 ? a : b.loaded && b.time < b.duration - 1 ? b : null;
      const target = deck ?? a;
      if (!deck && !(await this.loadNext(target))) {
        this.app.toast('Automix: end of the queue. Add tracks, build an Auto-set, or press "From the top".');
        this.setEnabled(false);
        return;
      }
      eng.setCrossfader(target.index === 0 ? 0 : 1);
      eng.strips[target.index].set('volume', Math.max(eng.strips[target.index].values.volume, 0.8));
      target.play();
      this.playLayer(target, target);
      this.app.onControl?.();
      return;
    }

    // with both decks running, the one on air is the side the crossfader is on
    const from = playing.length > 1 ? eng.decks[eng.crossfader <= 0.5 ? 0 : 1] : playing[0];
    const to = eng.otherDeck(from);
    if (!to.loaded || to.time >= to.duration - 1) {
      this.plan = null;
      if (this.queueLength() > 0) await this.loadNext(to);
      return;
    }
    const plan = this.planFor(from, to);
    // the DJ started the other deck by hand: blend into it now instead of leaving it silent
    const manual = to.playing;
    if (!manual && from.time < plan.start) return;
    // started late (seeked past the plan): blend over what is left, at least 4 s
    const start = from.time;
    const end = Math.min(from.duration, Math.max(plan.end, start + 4));
    this.plan = { ...plan, start, end, deck: from.index, next: plan.next };
    if (!manual) {
      if (to.grid && from.grid) to.syncTo(from);
      const fk = from.effectiveKey;
      if (this.settings.harmonic && fk && to.key && keyMatch(keyName(fk), keyName(to.key)) < 0.8) to.keySyncTo(from);
      eng.strips[to.index].set('volume', Math.max(eng.strips[to.index].values.volume, 0.8));
      to.play();
      if (to.grid && from.grid) to.alignPhase(from);
    }
    const lows: [number, number] = [eng.strips[0].values.low, eng.strips[1].values.low];
    eng.strips[to.index].set('low', 0); // incoming bass stays out until the swap
    this.transition = { from, to, start, end, startX: eng.crossfader, lows, swapped: false };
    const blendSec = (end - start) / Math.max(0.01, Math.abs(from.tempoFactor));
    if (!this.layers[to.index] && this.settings.loopEveryMix) this.layers[to.index] = this.everyMixLoop(to, from);
    this.playLayer(to, from, blendSec);
  }

  /** a drum loop (no key, so it never clashes) of the incoming or outgoing track's genre */
  private everyMixLoop(to: Deck, from: Deck): string | null {
    const lib = this.app.library;
    const path = (d: Deck) => (d.track ? (lib.tracks.get(d.track.id)?.path ?? '') : '');
    const loops = loopsFor(genreOf(path(to)) ?? genreOf(path(from)), undefined).filter((l) => !l.key);
    return loops.length ? loops[Math.floor(Math.random() * loops.length)].id : null;
  }
}
