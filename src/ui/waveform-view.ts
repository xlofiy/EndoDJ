/** Canvas renderers for the overview and scrolling (zoomed) waveforms. */
import type { Deck } from '../audio/deck';
import { timeOfBeat } from '../audio/mixmath';

export const HOTCUE_COLORS = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#3ddc84', '#00d1b2', '#3da5ff', '#a06cff', '#ff6bd6'];

function waveColor(low: number, alpha = 1): string {
  // bass-heavy → warm orange, bright → cool blue
  const r = Math.round(60 + 195 * low);
  const g = Math.round(140 + 30 * (1 - low));
  const b = Math.round(255 - 200 * low);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

  constructor(readonly canvas: HTMLCanvasElement, private deck: Deck) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.deck.loaded) return;
      const r = canvas.getBoundingClientRect();
      this.deck.seek(((e.clientX - r.left) / r.width) * this.deck.duration);
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
  }

  draw(): void {
    const { canvas, deck } = this;
    const resized = fitCanvas(canvas);
    if (resized || this.cachedFor !== deck.waveform) {
      this.renderCache();
      this.cachedFor = deck.waveform;
    }
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
  private dragging: { x: number; wasPlaying: boolean } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private deck: Deck, private color: string) {
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.span = Math.max(1, Math.min(16, this.span * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
    });
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
      const secPerPx = (this.span * 2) / canvas.clientWidth;
      this.deck.seek(this.deck.time - dx * secPerPx);
    });
    const end = () => {
      if (this.dragging?.wasPlaying) this.deck.play();
      this.dragging = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  draw(): void {
    const { canvas, deck } = this;
    fitCanvas(canvas);
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
    const t0 = t - this.span;
    const pxPerSec = W / (this.span * 2);
    const wf = deck.waveform;

    // loop region
    if (deck.loop) {
      g.fillStyle = deck.loopActive ? 'rgba(61,220,132,0.18)' : 'rgba(138,150,168,0.12)';
      g.fillRect((deck.loop.start - t0) * pxPerSec, 0, (deck.loop.end - deck.loop.start) * pxPerSec, H);
    }

    // beat grid
    if (deck.grid) {
      const beat = 60 / deck.grid.bpm;
      const first = Math.ceil((t0 - deck.grid.firstBeat) / beat);
      for (let i = first; ; i++) {
        const bt = timeOfBeat(deck.grid, i);
        if (bt > t + this.span) break;
        if (bt < 0) continue;
        const x = (bt - t0) * pxPerSec;
        const bar = ((i % 4) + 4) % 4 === 0;
        g.fillStyle = bar ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)';
        g.fillRect(Math.round(x), 0, bar ? 2 : 1, H);
      }
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
