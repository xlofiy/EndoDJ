/** Optional round "jog platter" display per deck (like VirtualDJ / Serato), drag to scratch. */
import { JOG_TICKS_PER_REV, type Deck } from '../audio/deck';
import { fitCanvas, HOTCUE_COLORS } from './waveform-view';

const REV_PER_SEC = 100 / 3 / 60; // 33⅓ RPM

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export class PlatterView {
  private last = '';
  private drag: { angle: number } | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private deck: Deck,
    private color: string,
  ) {
    const angleAt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.deck.loaded || e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.drag = { angle: angleAt(e) };
      this.deck.jogTouch(true);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const a = angleAt(e);
      let d = a - this.drag.angle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      this.drag.angle = a;
      this.deck.jogScratch((d / (2 * Math.PI)) * JOG_TICKS_PER_REV);
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.deck.jogTouch(false);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.deck.jogBend(Math.sign(e.deltaY) * -8);
      },
      { passive: false },
    );
  }

  draw(): void {
    const { canvas, deck } = this;
    if (canvas.offsetParent === null) return; // hidden
    const resized = fitCanvas(canvas);
    const t = deck.time;
    const sig = `${t.toFixed(3)}|${deck.effectiveBpm.toFixed(2)}|${deck.tempoFactor.toFixed(4)}|${deck.hotcues.join(',')}|${deck.track?.id}|${deck.loopActive}`;
    if (!resized && sig === this.last) return;
    this.last = sig;

    const g = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 2;
    g.clearRect(0, 0, W, H);

    // platter body
    const body = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R);
    body.addColorStop(0, '#2a3f6b');
    body.addColorStop(0.6, '#0b1631');
    body.addColorStop(1, '#050b1c');
    g.fillStyle = body;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();

    // progress ring
    const ringW = R * 0.12;
    g.lineWidth = ringW;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(cx, cy, R - ringW / 2, 0, Math.PI * 2);
    g.stroke();
    if (deck.duration > 0) {
      const p = t / deck.duration;
      const remaining = deck.duration - t;
      g.strokeStyle = remaining < 30 && deck.playing ? '#ff3d5a' : this.color;
      g.beginPath();
      g.arc(cx, cy, R - ringW / 2, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      g.stroke();
      // hot cue dots
      deck.hotcues.forEach((h, i) => {
        if (h === null) return;
        const a = -Math.PI / 2 + (h / deck.duration) * Math.PI * 2;
        g.fillStyle = HOTCUE_COLORS[i];
        g.beginPath();
        g.arc(cx + Math.cos(a) * (R - ringW / 2), cy + Math.sin(a) * (R - ringW / 2), ringW * 0.32, 0, Math.PI * 2);
        g.fill();
      });
    }

    // spinning marker (follows the track position, so it scratches with the audio)
    const angle = -Math.PI / 2 + t * REV_PER_SEC * Math.PI * 2;
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(2, R * 0.035);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + Math.cos(angle) * R * 0.55, cy + Math.sin(angle) * R * 0.55);
    g.lineTo(cx + Math.cos(angle) * (R - ringW * 1.2), cy + Math.sin(angle) * (R - ringW * 1.2));
    g.stroke();

    // gloss highlight (aero)
    const gloss = g.createLinearGradient(0, cy - R, 0, cy);
    gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gloss;
    g.beginPath();
    g.ellipse(cx, cy - R * 0.45, R * 0.7, R * 0.4, 0, 0, Math.PI * 2);
    g.fill();

    // centre read-out
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `italic 800 ${Math.round(R * 0.3)}px system-ui, sans-serif`;
    g.fillText(deck.grid ? deck.effectiveBpm.toFixed(1) : '—', cx, cy - R * 0.3);
    g.font = `${Math.round(R * 0.12)}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(234,246,255,0.7)';
    const pct = (deck.tempoFactor - 1) * 100;
    g.fillText(`BPM  ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, cx, cy - R * 0.08);
    g.font = `${Math.round(R * 0.17)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = '#ffffff';
    g.fillText(fmt(t), cx, cy + R * 0.18);
    g.fillStyle = 'rgba(234,246,255,0.7)';
    g.fillText('-' + fmt(deck.duration - t), cx, cy + R * 0.4);
  }
}
