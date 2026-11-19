/**
 * Automix: plays through the "Automix queue" playlist, beat-matching and crossfading
 * from one deck to the other before each track ends.
 */
import type { Deck } from '../audio/deck';
import { AUTOMIX_ID } from '../library/library';
import type { App } from './app';
import { LOOP_PREFIX } from './suggest';

/** a Loop Lab bridge in the queue plays this many beats (fade in + solo + fade out) */
const BRIDGE_BEATS = 64;

export class Automix {
  enabled = false;
  /** crossfade length in seconds of real time */
  fadeSeconds = 12;
  private transition: { from: Deck; to: Deck; start: number; startX: number } | null = null;
  private loading = false;
  private timer: number | null = null;
  /** per deck: audio-clock time when a looping bridge should be over */
  private bridgeEnd = [0, 0];
  onChange: (() => void) | null = null;

  constructor(private app: App) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && this.timer === null) this.timer = window.setInterval(() => void this.tick(), 100);
    if (!on && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.transition = null;
    }
    if (on) void this.tick();
    this.onChange?.();
  }

  private queueLength(): number {
    return this.app.library.playlist(AUTOMIX_ID)?.trackIds.length ?? 0;
  }

  /** Load the next queued track on `deck`, cue it at its first beat. */
  private async loadNext(deck: Deck): Promise<boolean> {
    if (this.loading) return false;
    this.loading = true;
    try {
      while (this.queueLength() > 0) {
        const id = await this.app.library.shiftPlaylist(AUTOMIX_ID);
        if (!id) break;
        if (await this.app.loadTrack(deck.index, id)) {
          if (deck.grid) deck.seek(deck.grid.firstBeat);
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
    if (deck.track?.id.startsWith(LOOP_PREFIX)) return this.bridgeEnd[deck.index] - this.app.engine.ctx.currentTime;
    return (deck.duration - deck.time) / Math.max(0.01, Math.abs(deck.tempoFactor));
  }

  private start(deck: Deck): void {
    deck.play();
    this.bridgeEnd[deck.index] = this.app.engine.ctx.currentTime + (BRIDGE_BEATS * 60) / Math.max(60, deck.effectiveBpm || 120);
  }

  private async tick(): Promise<void> {
    if (!this.enabled || this.loading) return;
    const eng = this.app.engine;
    const [a, b] = eng.decks;

    if (this.transition) {
      const { from, to, start, startX } = this.transition;
      const t = Math.min(1, (eng.ctx.currentTime - start) / this.fadeSeconds);
      const target = to.index === 0 ? 0 : 1;
      eng.setCrossfader(startX + (target - startX) * t);
      this.app.onControl?.();
      if (t >= 1 || !from.playing) {
        eng.setCrossfader(target);
        from.pause();
        if (from.track?.id.startsWith(LOOP_PREFIX)) from.unload(); // a loop never ends: free the deck for the next track
        this.transition = null;
        this.app.onControl?.();
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
      this.start(target);
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
      this.start(to);
      if (to.grid && from.grid) to.alignPhase(from);
      this.transition = { from, to, start: eng.ctx.currentTime, startX: eng.crossfader };
    }
  }
}
