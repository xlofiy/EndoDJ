/**
 * Automix: plays through the "Automix queue" playlist, beat-matching and crossfading
 * from one deck to the other before each track ends.
 *
 * Tracks alternate decks: the 1st, 3rd, 5th … track play on deck A, the 2nd, 4th … on deck B.
 * Loop Lab entries in the queue are *layers*: they take no deck, but play on top of the
 * transition into the track after them, tempo- and bar-synced to the outgoing deck.
 */
import type { Deck } from '../audio/deck';
import { beatAt, timeOfBeat } from '../audio/mixmath';
import { findLoop } from '../loops/catalog';
import { AUTOMIX_ID } from '../library/library';
import type { App } from './app';
import { LOOP_PREFIX } from './suggest';

/** a layer keeps playing over the incoming song for this many bars after the crossfade */
const LAYER_TAIL_BARS = 16;
const LAYER_GAIN = 0.55;

export class Automix {
  enabled = false;
  /** crossfade length in seconds of real time */
  fadeSeconds = 12;
  private transition: { from: Deck; to: Deck; start: number; startX: number; lows: [number, number]; swapped: boolean } | null = null;
  private loading = false;
  private timer: number | null = null;
  /** per deck: Loop Lab layer to play when that deck comes in */
  private layers: (string | null)[] = [null, null];
  private layerSrc: AudioBufferSourceNode | null = null;
  onChange: (() => void) | null = null;

  constructor(private app: App) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && this.timer === null) this.timer = window.setInterval(() => void this.tick(), 100);
    if (!on && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      if (this.transition) for (const i of [0, 1]) this.app.engine.strips[i].set('low', this.transition.lows[i]);
      this.transition = null;
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
    this.transition = null;
    this.layers = [null, null];
    if (!a.playing && !b.playing) {
      if (!(await this.loadNext(a))) return false;
      await this.loadNext(b);
      this.app.engine.setCrossfader(0);
    } else {
      const free = a.playing ? b : a;
      if (!(await this.loadNext(free))) return false;
    }
    this.setEnabled(true);
    return true;
  }

  private queueLength(): number {
    return this.app.library.playlist(AUTOMIX_ID)?.trackIds.length ?? 0;
  }

  /** Load the next queued track on `deck`, cue it at its first beat. Layers on the way are kept for the transition. */
  private async loadNext(deck: Deck): Promise<boolean> {
    if (this.loading) return false;
    this.loading = true;
    let layer: string | null = null;
    try {
      while (this.queueLength() > 0) {
        const id = await this.app.library.shiftPlaylist(AUTOMIX_ID);
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

  /** seconds of real time until the end of the deck's track */
  private remaining(deck: Deck): number {
    return (deck.duration - deck.time) / Math.max(0.01, Math.abs(deck.tempoFactor));
  }

  /** Play a Loop Lab loop on top of the mix, at the lead deck's tempo, starting on its next bar. */
  private async startLayer(loopId: string, lead: Deck): Promise<void> {
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
    const end = t0 + this.fadeSeconds + LAYER_TAIL_BARS * barSec;
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
  private playLayer(deck: Deck, lead: Deck): void {
    const id = this.layers[deck.index];
    this.layers[deck.index] = null;
    if (id) void this.startLayer(id, lead);
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
      const { from, to, start, startX, lows } = tr;
      const t = Math.min(1, (eng.ctx.currentTime - start) / this.fadeSeconds);
      const target = to.index === 0 ? 0 : 1;
      eng.setCrossfader(startX + (target - startX) * t);
      // bass swap halfway, like a DJ: never two kick drums / bass lines at full level at once
      if (t >= 0.5 && !tr.swapped) {
        tr.swapped = true;
        eng.strips[from.index].set('low', 0);
        eng.strips[to.index].set('low', lows[to.index]);
      }
      this.app.onControl?.();
      if (t >= 1 || !from.playing) {
        eng.setCrossfader(target);
        from.pause();
        eng.strips[from.index].set('low', lows[from.index]);
        eng.strips[to.index].set('low', lows[to.index]);
        this.transition = null;
        this.app.onControl?.();
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
        this.app.toast('Automix: the queue is empty. Add tracks to "Automix queue".');
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

    const from = playing[0];
    const to = eng.otherDeck(from);
    if (!to.loaded || to.time >= to.duration - 1) {
      if (this.queueLength() > 0) await this.loadNext(to);
      return;
    }
    if (this.remaining(from) <= this.fadeSeconds && !to.playing) {
      if (to.grid && from.grid) to.syncTo(from);
      eng.strips[to.index].set('volume', Math.max(eng.strips[to.index].values.volume, 0.8));
      to.play();
      if (to.grid && from.grid) to.alignPhase(from);
      const lows: [number, number] = [eng.strips[0].values.low, eng.strips[1].values.low];
      eng.strips[to.index].set('low', 0); // incoming bass stays out until the swap
      this.transition = { from, to, start: eng.ctx.currentTime, startX: eng.crossfader, lows, swapped: false };
      this.playLayer(to, from);
    }
  }
}
