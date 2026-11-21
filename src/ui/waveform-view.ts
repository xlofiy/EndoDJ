/** Canvas renderers for the overview and scrolling (zoomed) waveforms. */
import type { Deck } from '../audio/deck';
import { timeOfBeat } from '../audio/mixmath';
import { detectSections, SECTION_COLORS, type Section } from '../audio/sections';

export const HOTCUE_COLORS = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#3ddc84', '#00d1b2', '#3da5ff', '#a06cff', '#ff6bd6'];

function waveColor(low: number, alpha = 1): string {
  // bass-heavy → warm orange, bright → cool blue
  const r = Math.round(60 + 195 * low);
  const g = Math.round(140 + 30 * (1 - low));
  const b = Math.round(255 - 200 * low);
  return `rgba(${r},${g},${b},${alpha})`;
}

const barLabels: string[] = [];
/** cached so the per-frame grid drawing does not allocate strings */
function barLabel(n: number): string {
  return (barLabels[n] ??= String(n));
}

/** Automix's planned blend out of this deck (track seconds), or null */
export type MixMark = () => { start: number; end: number; next: string } | null;

/** Resize a canvas' backing store to its CSS size × devicePixelRatio. Returns true if resized. */
export function fitCanvas(c: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr));
  const h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    return true;
  }
  return false;
}

/** Overview waveform, cached in an offscreen canvas and redrawn only when needed. */
export class OverviewView {
  private cache = document.createElement('canvas');
  private cachedFor: unknown = null;
  private cachedGrid: unknown = null;

  /** intro / drop / break … of the loaded track (empty until the grid and waveform are known) */
  sections: Section[] = [];
  mixMark: MixMark = () => null;

  constructor(readonly canvas: HTMLCanvasElement, private deck: Deck) {
    canvas.title = 'Click to jump · click the coloured strip on top to jump to the start of a section';
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.deck.loaded) return;
      const r = canvas.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * this.deck.duration;
      const sec = e.clientY - r.top < r.height * 0.3 ? this.sections.find((s) => t >= s.start && t < s.end) : undefined;
      this.deck.seek(sec ? sec.start : t);
    });
  }

  private renderCache(): void {
    const { canvas, deck } = this;
    const wf = deck.waveform;
    this.cache.width = canvas.width;
    this.cache.height = canvas.height;
    const g = this.cache.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!wf || !deck.duration) return;
    const W = canvas.width;
    const H = canvas.height;
    const mid = H / 2;
    const binsPerPx = wf.peaks.length / W;
    for (let x = 0; x < W; x++) {
      const b0 = Math.floor(x * binsPerPx);
      const b1 = Math.max(b0 + 1, Math.floor((x + 1) * binsPerPx));
      let peak = 0;
      let low = 0;
      for (let b = b0; b < b1 && b < wf.peaks.length; b++) {
        if (wf.peaks[b] > peak) peak = wf.peaks[b];
        low += wf.lows[b];
      }
      low /= b1 - b0;
      const h = peak * mid * 0.95;
      g.fillStyle = waveColor(low);
      g.fillRect(x, mid - h, 1, h * 2);
    }
    // sections strip on top, a tick every 8 bars (32 beats) at the bottom
    this.sections = deck.grid ? detectSections(wf, deck.grid, deck.duration) : [];
    const dpr = window.devicePixelRatio || 1;
    const stripH = Math.round(H * 0.18);
    g.font = `bold ${8 * dpr}px system-ui`;
    for (const sec of this.sections) {
      const x0 = Math.round((sec.start / deck.duration) * W);
      const x1 = Math.round((sec.end / deck.duration) * W);
      g.fillStyle = SECTION_COLORS[sec.label];
      g.fillRect(x0, 0, Math.max(1, x1 - x0 - 1), stripH);
      if (x1 - x0 > 34 * dpr) {
        g.fillStyle = '#fff';
        g.fillText(sec.label.toUpperCase(), x0 + 3 * dpr, stripH + 9 * dpr);
      }
    }
    if (deck.grid) {
      g.fillStyle = 'rgba(255,196,64,0.8)';
      const phrase = (32 * 60) / deck.grid.bpm;
      for (let t = deck.grid.firstBeat; t < deck.duration; t += phrase) g.fillRect(Math.round((t / deck.duration) * W), H - H * 0.22, 1, H * 0.22);
    }
  }

  private last = '';

  draw(): void {
    const { canvas, deck } = this;
    const resized = fitCanvas(canvas);
    const cacheStale = resized || this.cachedFor !== deck.waveform || this.cachedGrid !== deck.grid;
    if (cacheStale) {
      this.renderCache();
      this.cachedFor = deck.waveform;
      this.cachedGrid = deck.grid;
    }
    // skip the redraw when nothing visible changed (paused decks cost nothing)
    const px = deck.duration ? Math.round((deck.time / deck.duration) * canvas.width) : -1;
    const mix = this.mixMark();
    const sig = `${px}|${mix?.start}|${mix?.end}|${deck.cuePoint}|${deck.hotcues.join(',')}|${deck.loop?.start}|${deck.loop?.end}|${deck.loopActive}|${deck.loaded}`;
    if (!cacheStale && sig === this.last) return;
    this.last = sig;
    const g = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.cache, 0, 0);
    if (!deck.loaded || !deck.duration) return;
    const x = (deck.time / deck.duration) * W;
    // dim the played part
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 0, x, H);
    // loop
    if (deck.loop) {
      g.fillStyle = deck.loopActive ? 'rgba(61,220,132,0.3)' : 'rgba(138,150,168,0.2)';
      const lx = (deck.loop.start / deck.duration) * W;
      g.fillRect(lx, 0, Math.max(2, ((deck.loop.end - deck.loop.start) / deck.duration) * W), H);
    }
    // Automix: where this track hands over to the next one
    if (mix) {
      const mx = (mix.start / deck.duration) * W;
      g.fillStyle = 'rgba(255,196,64,0.35)';
      g.fillRect(mx, 0, Math.max(3, ((mix.end - mix.start) / deck.duration) * W), H);
      g.fillStyle = '#ffc440';
      g.fillRect(mx - 1, 0, 2, H);
    }
    // cue + hot cues
    g.fillStyle = '#ffb020';
    g.fillRect((deck.cuePoint / deck.duration) * W - 1, 0, 2, H);
    deck.hotcues.forEach((h, i) => {
      if (h === null) return;
      g.fillStyle = HOTCUE_COLORS[i];
      g.fillRect((h / deck.duration) * W - 1, 0, 3, H * 0.35);
    });
    g.fillStyle = '#fff';
    g.fillRect(x - 1, 0, 2, H);
  }
}

/** Scrolling waveform centred on the playhead with beat grid. Drag to scrub. */
export class ZoomView {
  /** seconds visible on each side of the playhead */
  span = 4;
  mixMark: MixMark = () => null;
  private dragging: { x: number; wasPlaying: boolean } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private deck: Deck, private color: string) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.span = Math.max(1, Math.min(16, this.span * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.deck.loaded) return;
      canvas.setPointerCapture(e.pointerId);
      this.dragging = { x: e.clientX, wasPlaying: this.deck.playing };
      if (this.deck.playing) this.deck.pause();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x;
      this.dragging.x = e.clientX;
      const secPerPx = (this.span * 2 * Math.abs(this.deck.tempoFactor)) / canvas.clientWidth;
      this.deck.seek(this.deck.time - dx * secPerPx);
    });
    const end = () => {
      if (this.dragging?.wasPlaying) this.deck.play();
      this.dragging = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private last = '';

  draw(): void {
    const { canvas, deck } = this;
    const resized = fitCanvas(canvas);
    const mix = this.mixMark();
    const sig = `${deck.time.toFixed(4)}|${mix?.start}|${mix?.end}|${this.span}|${deck.tempoFactor}|${deck.waveform ? 1 : 0}|${deck.grid?.bpm}|${deck.grid?.firstBeat}|${deck.cuePoint}|${deck.hotcues.join(',')}|${deck.loop?.start}|${deck.loop?.end}|${deck.loopActive}|${deck.loaded}`;
    if (!resized && sig === this.last) return;
    this.last = sig;
    const g = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const mid = H / 2;
    g.clearRect(0, 0, W, H);
    if (!deck.loaded) {
      g.fillStyle = '#2a3342';
      g.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
      g.fillText(`Deck ${deck.index === 0 ? 'A' : 'B'} — drop a track here or use LOAD`, 10, mid + 4);
      return;
    }
    const t = deck.time;
    // `span` is in real (wall-clock) seconds; scale by tempo so synced decks line up visually
    const trackSpan = this.span * Math.max(0.05, Math.abs(deck.tempoFactor));
    const t0 = t - trackSpan;
    const pxPerSec = W / (trackSpan * 2);
    const wf = deck.waveform;

    // loop region
    if (deck.loop) {
      g.fillStyle = deck.loopActive ? 'rgba(61,220,132,0.18)' : 'rgba(138,150,168,0.12)';
      g.fillRect((deck.loop.start - t0) * pxPerSec, 0, (deck.loop.end - deck.loop.start) * pxPerSec, H);
    }

    // waveform
    if (wf) {
      const binsPerPx = wf.binsPerSec / pxPerSec;
      for (let x = 0; x < W; x++) {
        const b0 = Math.floor((t0 + x / pxPerSec) * wf.binsPerSec);
        const b1 = Math.max(b0 + 1, Math.floor(b0 + binsPerPx));
        if (b1 <= 0 || b0 >= wf.peaks.length) continue;
        let peak = 0;
        let low = 0;
        let n = 0;
        for (let b = Math.max(0, b0); b < b1 && b < wf.peaks.length; b++) {
          if (wf.peaks[b] > peak) peak = wf.peaks[b];
          low += wf.lows[b];
          n++;
        }
        if (!n) continue;
        const h = peak * mid * 0.95;
        g.fillStyle = waveColor(low / n, x < W / 2 ? 0.55 : 1);
        g.fillRect(x, mid - h, 1, h * 2);
      }
    } else {
      g.fillStyle = '#8a96a8';
      g.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
      g.fillText('Analysing…', 10, 16 * (window.devicePixelRatio || 1));
    }

    // beat grid on top of the waveform: beat ticks, bar lines with numbers, phrase (8-bar) lines
    if (deck.grid) {
      const dpr = window.devicePixelRatio || 1;
      const beat = 60 / deck.grid.bpm;
      const tick = Math.round(H * 0.16);
      g.font = `bold ${10 * dpr}px system-ui`;
      for (let i = Math.max(0, Math.ceil((t0 - deck.grid.firstBeat) / beat)); ; i++) {
        const bt = timeOfBeat(deck.grid, i);
        if (bt > t + trackSpan) break;
        const x = Math.round((bt - t0) * pxPerSec);
        if (i % 4) {
          g.fillStyle = 'rgba(255,255,255,0.1)';
          g.fillRect(x, tick, 1, H - 2 * tick);
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.fillRect(x, 0, 1, tick);
          g.fillRect(x, H - tick, 1, tick);
          continue;
        }
        const bar = i / 4;
        const phrase = bar % 8 === 0;
        g.fillStyle = phrase ? 'rgba(255,196,64,0.95)' : 'rgba(255,255,255,0.7)';
        g.fillRect(x - 1, 0, phrase ? 3 : 2, H);
        g.fillText(barLabel(bar + 1), x + 4, H - 4 * dpr);
      }
    }

    // Automix: the blend zone, labelled with the track that comes in
    if (mix) {
      const x0 = (mix.start - t0) * pxPerSec;
      const x1 = (mix.end - t0) * pxPerSec;
      if (x1 > 0 && x0 < W) {
        const dpr = window.devicePixelRatio || 1;
        g.fillStyle = 'rgba(255,196,64,0.16)';
        g.fillRect(x0, 0, x1 - x0, H);
        g.fillStyle = '#ffc440';
        g.fillRect(x0 - 1, 0, 3, H);
        g.font = `bold ${10 * dpr}px system-ui`;
        g.fillText(`MIX → ${mix.next}`, Math.max(2, x0 + 5), H - 16 * dpr);
      }
    }

    // cue markers
    const marker = (time: number, color: string, label: string) => {
      const x = (time - t0) * pxPerSec;
      if (x < -20 || x > W + 20) return;
      g.fillStyle = color;
      g.fillRect(x - 1, 0, 2, H);
      g.font = `bold ${10 * (window.devicePixelRatio || 1)}px system-ui`;
      g.fillText(label, x + 3, 11 * (window.devicePixelRatio || 1));
    };
    marker(deck.cuePoint, '#ffb020', 'CUE');
    deck.hotcues.forEach((h, i) => {
      if (h !== null) marker(h, HOTCUE_COLORS[i], String(i + 1));
    });

    // playhead
    g.fillStyle = this.color;
    g.fillRect(W / 2 - 1, 0, 3, H);
  }
}
