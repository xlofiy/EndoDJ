/** DOM user interface. Plain TypeScript, no framework. */
import type { App } from '../app/app';
import { BEATJUMP_PAD_SIZES, BEATLOOP_PAD_SIZES } from '../app/app';
import { HOTCUE_COUNT, TEMPO_RANGES, type Deck } from '../audio/deck';
import { BEAT_FRACTIONS, EFFECT_TYPES, type EffectType } from '../audio/effects';
import { meterLevel, type FxTarget, type OutputMode } from '../audio/engine';
import type { CrossfaderCurve } from '../audio/mixmath';
import type { TrackRecord } from '../library/db';
import { formatDuration, toCSV, toM3U, toText, type ExportTrack } from '../library/export';
import { AUTOMIX_ID, HISTORY_ID, Library } from '../library/library';
import { ddjFlx2Bindings } from '../midi/ddj-flx2';
import type { ControlKind, MidiBinding } from '../midi/mapping';
import { HOTCUE_COLORS, OverviewView, ZoomView, fitCanvas } from './waveform-view';

type PadMode = 'hotcue' | 'beatloop' | 'beatjump' | 'sampler';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`UI element not found: ${sel}`);
  return el;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function fmtBeats(b: number): string {
  if (b === 0.125) return '1/8';
  if (b === 0.25) return '1/4';
  if (b === 0.5) return '1/2';
  if (b === 0.75) return '3/4';
  return String(b);
}

function download(name: string, content: string | Blob, type = 'text/plain'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

interface DeckUI {
  root: HTMLElement;
  overview: OverviewView;
  zoom: ZoomView;
  padMode: PadMode;
  pads: HTMLButtonElement[];
}

export class UI {
  private decks: DeckUI[] = [];
  private view: string = 'all';
  private search = '';
  private sortKey: keyof TrackRecord = 'addedAt';
  private sortDir = -1;
  private rows: string[] = [];
  private meterBuf = new Float32Array(1024);
  private frame = 0;
  private recStart = 0;

  constructor(private app: App) {}

  init(): void {
    this.app.onToast = (m, e) => this.toast(m, e);
    this.app.onBrowse = (d) => this.browse(d);
    this.app.onControl = () => this.syncControls();
    for (let i = 0; i < 2; i++) this.buildDeck(i);
    this.buildMixer();
    this.buildTopbar();
    this.buildLibrary();
    this.buildDialogs();
    this.bindKeyboard();
    this.app.library.on(() => this.renderLibrary());
    this.app.midi.onChange = () => {
      this.renderMidiStatus();
      if (($('#controller-dlg') as HTMLDialogElement).open) this.renderController(false);
    };
    this.renderMidiStatus();
    this.renderLibrary();
    this.syncControls();
    requestAnimationFrame(() => this.tick());
  }

  toast(msg: string, error = false): void {
    const t = $('#toast');
    t.textContent = msg;
    setClass(t, 'error', error);
    t.classList.add('show');
    clearTimeout((t as HTMLElement & { _h?: number })._h);
    (t as HTMLElement & { _h?: number })._h = window.setTimeout(() => t.classList.remove('show'), error ? 5000 : 2500);
  }

  // ================================================================== decks

  private control(control: string, value: number, kind: ControlKind = 'button'): void {
    this.app.handleControl({ control, kind, value });
  }

  private buildDeck(i: number): void {
    const deck = this.app.engine.decks[i];
    const root = $(`#deck-${i}`);
    const n = i + 1;
    root.innerHTML = `
      <div class="main-col">
        <div class="info">
          <div style="min-width:0">
            <div class="title">No track loaded</div>
            <div class="artist">Deck ${i === 0 ? 'A' : 'B'}</div>
          </div>
          <div class="bpm"><span class="big mono bpm-val">—</span> <span class="muted">BPM</span>
            <div class="muted mono bpm-orig"></div></div>
        </div>
        <canvas class="overview"></canvas>
        <div class="times mono"><span class="elapsed">0:00.0</span><span class="tempo-val muted"></span><span class="remain">-0:00.0</span></div>
        <div class="transport">
          <button class="cue" title="CUE (hold to preview)">CUE</button>
          <button class="play" title="Play / pause">▶ ❚❚</button>
          <button class="sync" title="Sync tempo and beat to the other deck">SYNC</button>
          <button class="rev" title="Reverse playback">REV</button>
          <button class="quant on" title="Quantize cues and loops to the beat grid">Q</button>
          <button class="bpm-half" title="Halve the detected BPM">½</button>
          <button class="bpm-double" title="Double the detected BPM">×2</button>
          <button class="grid-here" title="Put a downbeat at the current position">GRID</button>
        </div>
        <div class="row">
          <span class="label">PADS</span>
          <select class="pad-mode">
            <option value="hotcue">Hot cue</option>
            <option value="beatloop">Beat loop</option>
            <option value="beatjump">Beat jump</option>
            <option value="sampler">Sampler</option>
          </select>
          <span class="muted pad-hint">right-click a pad to clear</span>
        </div>
        <div class="pads"></div>
        <div class="row loops">
          <span class="label">LOOP</span>
          ${BEATLOOP_PAD_SIZES.map((b) => `<button data-beatloop="${b}">${fmtBeats(b)}</button>`).join('')}
        </div>
        <div class="row loops">
          <button class="loop-in">IN</button><button class="loop-out">OUT</button>
          <button class="reloop">RELOOP</button><button class="loop-half">½</button><button class="loop-double">×2</button>
          <span class="label" style="margin-left:8px">JUMP</span>
          <button data-jump="-16">◀16</button><button data-jump="-4">◀4</button><button data-jump="-1">◀1</button>
          <button data-jump="1">1▶</button><button data-jump="4">4▶</button><button data-jump="16">16▶</button>
        </div>
      </div>
      <div class="pitch">
        <select class="range" title="Pitch range">${TEMPO_RANGES.map((r) => `<option value="${r}">±${Math.round(r * 100)}%</option>`).join('')}</select>
        <span class="val mono">0.00%</span>
        <input class="pitch-fader" type="range" min="-1" max="1" step="0.0005" value="0" title="Tempo (down = faster, like Pioneer)" />
        <button class="pitch-reset" title="Reset tempo">0</button>
        <button class="nudge-down" title="Nudge slower (hold)">◀◀</button>
        <button class="nudge-up" title="Nudge faster (hold)">▶▶</button>
      </div>`;

    const overviewCanvas = $<HTMLCanvasElement>('canvas.overview', root);
    const zoomCanvas = $<HTMLCanvasElement>(`#zoom-${i}`);
    const ui: DeckUI = {
      root,
      overview: new OverviewView(overviewCanvas, deck),
      zoom: new ZoomView(zoomCanvas, deck, i === 0 ? '#3da5ff' : '#ff6b3d'),
      padMode: 'hotcue',
      pads: [],
    };
    this.decks.push(ui);

    const hold = (el: HTMLElement, control: string) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        el.setPointerCapture(e.pointerId);
        this.control(control, 1);
      });
      const up = () => this.control(control, 0);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold($('.cue', root), `deck${n}.cue`);
    hold($('.play', root), `deck${n}.play`);
    hold($('.sync', root), `deck${n}.sync`);
    hold($('.nudge-down', root), `deck${n}.nudgeDown`);
    hold($('.nudge-up', root), `deck${n}.nudgeUp`);
    $('.rev', root).onclick = () => deck.setReverse(!deck.reverse);
    $('.quant', root).onclick = () => {
      deck.quantize = !deck.quantize;
    };
    $('.bpm-half', root).onclick = () => deck.grid && void this.app.setDeckBpm(deck, deck.grid.bpm / 2);
    $('.bpm-double', root).onclick = () => deck.grid && void this.app.setDeckBpm(deck, deck.grid.bpm * 2);
    $('.grid-here', root).onclick = () => void this.app.setGridHere(deck);
    root.querySelectorAll<HTMLButtonElement>('[data-beatloop]').forEach((b) => {
      b.onclick = () => deck.beatloop(parseFloat(b.dataset.beatloop!));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((b) => {
      b.onclick = () => deck.beatjump(parseFloat(b.dataset.jump!));
    });
    $('.loop-in', root).onclick = () => deck.loopIn();
    $('.loop-out', root).onclick = () => deck.loopOut();
    $('.reloop', root).onclick = () => deck.reloop();
    $('.loop-half', root).onclick = () => deck.loopResize(0.5);
    $('.loop-double', root).onclick = () => deck.loopResize(2);

    const range = $<HTMLSelectElement>('.range', root);
    range.value = String(deck.tempoRange);
    range.onchange = () => deck.setTempoRange(parseFloat(range.value));
    const fader = $<HTMLInputElement>('.pitch-fader', root);
    fader.oninput = () => this.control(`deck${n}.tempo`, (parseFloat(fader.value) + 1) / 2, 'knob');
    fader.ondblclick = () => this.control(`deck${n}.tempo`, 0.5, 'knob');
    $('.pitch-reset', root).onclick = () => this.control(`deck${n}.tempo`, 0.5, 'knob');

    // pads
    const padsEl = $('.pads', root);
    for (let p = 0; p < HOTCUE_COUNT; p++) {
      const b = document.createElement('button');
      padsEl.appendChild(b);
      ui.pads.push(b);
      const padControl = () => {
        switch (ui.padMode) {
          case 'hotcue':
            return `deck${n}.hotcue${p + 1}`;
          case 'beatloop':
            return `deck${n}.beatloop${p + 1}`;
          case 'beatjump':
            return `deck${n}.beatjump${p + 1}`;
          case 'sampler':
            return `deck${n}.sampler${p + 1}`;
        }
      };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (ui.padMode === 'hotcue' && e.shiftKey) {
          deck.clearHotcue(p);
          return;
        }
        if (ui.padMode === 'sampler' && !this.app.sampler.slots[p]) {
          this.pickSample(p);
          return;
        }
        b.setPointerCapture(e.pointerId);
        this.control(padControl(), 1);
      });
      const up = () => {
        if (ui.padMode === 'hotcue') this.control(padControl(), 0);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (ui.padMode === 'hotcue') deck.clearHotcue(p);
        else if (ui.padMode === 'sampler') this.pickSample(p);
      });
    }
    const modeSel = $<HTMLSelectElement>('.pad-mode', root);
    modeSel.onchange = () => {
      ui.padMode = modeSel.value as PadMode;
      setText(
        $('.pad-hint', root),
        ui.padMode === 'hotcue'
          ? 'right-click a pad to clear'
          : ui.padMode === 'sampler'
            ? 'right-click a pad to load a sample'
            : '',
      );
    };

    // drag & drop a library row or an audio file onto the deck
    for (const target of [root, zoomCanvas]) {
      target.addEventListener('dragover', (e) => e.preventDefault());
      target.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = e.dataTransfer?.getData('application/x-endodj-track');
        if (id) {
          void this.app.loadTrack(i, id);
          return;
        }
        const files = e.dataTransfer?.files;
        if (files && files.length) {
          void this.app.library.importFiles(Array.from(files)).then(() => {
            const f = files[0];
            const tid = [...this.app.library.tracks.values()].find(
              (t) => t.fileName === f.name && t.size === f.size && t.lastModified === f.lastModified,
            )?.id;
            if (tid) void this.app.loadTrack(i, tid);
          });
        }
      });
    }
  }

  private pickSample(slot: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        await this.app.sampler.loadFile(slot, f);
        this.toast(`Sample ${slot + 1}: ${f.name}`);
      } catch (e) {
        this.toast(`Could not load sample: ${(e as Error).message}`, true);
      }
    };
    input.click();
  }

  private renderDeck(ui: DeckUI, deck: Deck): void {
    const r = ui.root;
    setText($('.title', r), deck.track?.title ?? 'No track loaded');
    setText($('.artist', r), deck.track?.artist || (deck.track ? '' : `Deck ${deck.index === 0 ? 'A' : 'B'}`));
    setText($('.bpm-val', r), deck.grid ? deck.effectiveBpm.toFixed(2) : '—');
    setText($('.bpm-orig', r), deck.grid ? `orig ${deck.grid.bpm.toFixed(2)}` : deck.loaded ? 'analysing…' : '');
    const t = deck.time;
    setText($('.elapsed', r), fmtTime(t));
    setText($('.remain', r), '-' + fmtTime(deck.duration - t));
    const pct = (deck.tempoFactor - 1) * 100;
    const pctText = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    setText($('.val', r), pctText);
    setText($('.tempo-val', r), deck.reverse ? 'REVERSE' : deck.synced ? 'SYNC' : '');
    setClass($('.play', r), 'on', deck.playing);
    setClass($('.cue', r), 'on', deck.loaded && Math.abs(t - deck.cuePoint) < 0.02);
    setClass($('.sync', r), 'on', deck.synced);
    setClass($('.rev', r), 'on', deck.reverse);
    setClass($('.quant', r), 'on', deck.quantize);
    setClass($('.reloop', r), 'on', deck.loopActive);
    r.querySelectorAll<HTMLButtonElement>('[data-beatloop]').forEach((b) =>
      setClass(b, 'on', deck.loopActive && deck.loop?.beats === parseFloat(b.dataset.beatloop!)),
    );
    const fader = $<HTMLInputElement>('.pitch-fader', r);
    if (document.activeElement !== fader) fader.value = String(deck.tempoFader);
    const range = $<HTMLSelectElement>('.range', r);
    if (range.value !== String(deck.tempoRange)) range.value = String(deck.tempoRange);

    ui.pads.forEach((b, p) => {
      let label = '';
      let bg = '';
      switch (ui.padMode) {
        case 'hotcue': {
          const h = deck.hotcues[p];
          label = h === null ? `${p + 1}` : `${p + 1} · ${fmtTime(h)}`;
          bg = h === null ? '' : HOTCUE_COLORS[p];
          break;
        }
        case 'beatloop':
          label = `${fmtBeats(BEATLOOP_PAD_SIZES[p])} beat`;
          bg = deck.loopActive && deck.loop?.beats === BEATLOOP_PAD_SIZES[p] ? '#3ddc84' : '';
          break;
        case 'beatjump': {
          const j = BEATJUMP_PAD_SIZES[p];
          label = j < 0 ? `◀ ${-j}` : `${j} ▶`;
          break;
        }
        case 'sampler': {
          const s = this.app.sampler.slots[p];
          label = s ? s.name.slice(0, 12) : `+ sample ${p + 1}`;
          bg = s ? (this.app.sampler.isPlaying(p) ? '#3ddc84' : '#a06cff') : '';
          break;
        }
      }
      setText(b, label);
      if (b.style.background !== bg) b.style.background = bg;
      setClass(b, 'set', bg !== '');
    });
  }

  // ================================================================== mixer

  private buildMixer(): void {
    const eng = this.app.engine;
    const m = $('#mixer');
    const knob = (ch: number, param: string, label: string) =>
      `<label class="knob">${label}<input type="range" min="0" max="1" step="0.001" data-ch="${ch}" data-param="${param}" /></label>`;
    const channel = (ch: number) => `
      <div class="ch">
        ${knob(ch, 'trim', 'TRIM')}${knob(ch, 'high', 'HI')}${knob(ch, 'mid', 'MID')}${knob(ch, 'low', 'LOW')}${knob(ch, 'filter', 'FILTER')}
        <button class="pfl" data-ch="${ch}" title="Headphone cue">CUE 🎧</button>
        <div class="fader"><input type="range" min="0" max="1" step="0.001" data-ch="${ch}" data-param="volume" /></div>
      </div>`;
    m.innerHTML = `
      <h3>Mixer</h3>
      <div class="channels">${channel(0)}<div class="meters"><canvas id="meter-0"></canvas><canvas id="meter-1"></canvas></div>${channel(1)}</div>
      <div class="xfader"><b style="color:var(--deck-a)">A</b><input id="xfader" type="range" min="0" max="1" step="0.001" /><b style="color:var(--deck-b)">B</b>
        <select id="xf-curve" title="Crossfader curve"><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="sharp">Cut</option></select></div>
      <div class="xfader"><span class="muted">🎧 CUE</span><input id="hp-mix" type="range" min="0" max="1" step="0.001" title="Headphone cue/master mix" /><span class="muted">MST</span>
        <input id="hp-level" type="range" min="0" max="1" step="0.001" title="Headphone level" style="max-width:60px" /></div>
      <div class="fx">
        <h3 class="wide">Beat FX</h3>
        <select id="fx-type">${EFFECT_TYPES.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        <select id="fx-target"><option value="master">Master</option><option value="deck1">Deck A</option><option value="deck2">Deck B</option></select>
        <select id="fx-beats">${BEAT_FRACTIONS.map((b) => `<option value="${b}">${fmtBeats(b)} beat</option>`).join('')}</select>
        <button id="fx-on">FX ON</button>
        <label class="knob wide">LEVEL / DEPTH<input id="fx-level" type="range" min="0" max="1" step="0.001" /></label>
      </div>`;

    m.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((inp) => {
      const ch = parseInt(inp.dataset.ch!, 10);
      const param = inp.dataset.param!;
      const controlName =
        param === 'high' ? 'eqHigh' : param === 'mid' ? 'eqMid' : param === 'low' ? 'eqLow' : param;
      inp.oninput = () => this.control(`deck${ch + 1}.${controlName}`, parseFloat(inp.value), 'knob');
      if (param !== 'volume') inp.ondblclick = () => this.control(`deck${ch + 1}.${controlName}`, 0.5, 'knob');
    });
    m.querySelectorAll<HTMLButtonElement>('button.pfl').forEach((b) => {
      b.onclick = () => this.control(`deck${parseInt(b.dataset.ch!, 10) + 1}.pfl`, 1);
    });
    const xf = $<HTMLInputElement>('#xfader');
    xf.oninput = () => this.control('mixer.crossfader', parseFloat(xf.value), 'knob');
    xf.ondblclick = () => this.control('mixer.crossfader', 0.5, 'knob');
    const curve = $<HTMLSelectElement>('#xf-curve');
    curve.onchange = () => eng.setCrossfaderCurve(curve.value as CrossfaderCurve);
    const hpMix = $<HTMLInputElement>('#hp-mix');
    const hpLevel = $<HTMLInputElement>('#hp-level');
    const hp = () => eng.setHeadphones(parseFloat(hpMix.value), parseFloat(hpLevel.value));
    hpMix.oninput = hp;
    hpLevel.oninput = hp;
    const fxType = $<HTMLSelectElement>('#fx-type');
    fxType.onchange = () => eng.fx.setType(fxType.value as EffectType);
    const fxTarget = $<HTMLSelectElement>('#fx-target');
    fxTarget.onchange = () => eng.fx.setTarget(fxTarget.value as FxTarget);
    const fxBeats = $<HTMLSelectElement>('#fx-beats');
    fxBeats.onchange = () => eng.fx.setBeats(parseFloat(fxBeats.value));
    $('#fx-on').onclick = () => this.control('fx.toggle', 1);
    const fxLevel = $<HTMLInputElement>('#fx-level');
    fxLevel.oninput = () => this.control('fx.level', parseFloat(fxLevel.value), 'knob');
  }

  /** Push engine state into the on-screen controls (after MIDI / automix changes). */
  syncControls(): void {
    const eng = this.app.engine;
    const set = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      if (document.activeElement !== el && el.value !== v) el.value = v;
    };
    document.querySelectorAll<HTMLInputElement>('#mixer input[data-param]').forEach((inp) => {
      const strip = eng.strips[parseInt(inp.dataset.ch!, 10)];
      set(inp, String(strip.values[inp.dataset.param as 'trim']));
    });
    document.querySelectorAll<HTMLButtonElement>('#mixer button.pfl').forEach((b) =>
      setClass(b, 'on', eng.strips[parseInt(b.dataset.ch!, 10)].values.pfl),
    );
    set($<HTMLInputElement>('#xfader'), String(eng.crossfader));
    set($<HTMLSelectElement>('#xf-curve'), eng.crossfaderCurve);
    set($<HTMLInputElement>('#hp-mix'), String(eng.headphoneMix));
    set($<HTMLInputElement>('#hp-level'), String(eng.headphoneLevel));
    set($<HTMLSelectElement>('#fx-type'), eng.fx.type);
    set($<HTMLSelectElement>('#fx-target'), eng.fx.target);
    set($<HTMLSelectElement>('#fx-beats'), String(eng.fx.beats));
    set($<HTMLInputElement>('#fx-level'), String(eng.fx.level));
    setClass($('#fx-on'), 'on', eng.fx.enabled);
    set($<HTMLInputElement>('#master-level'), String(eng.masterLevel));
    setClass($('#automix-btn'), 'on', this.app.automix.enabled);
  }

  private drawMeter(canvas: HTMLCanvasElement, level: number, horizontal = false): void {
    fitCanvas(canvas);
    const g = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    const db = 20 * Math.log10(Math.max(level, 1e-5));
    const v = Math.max(0, Math.min(1, (db + 48) / 48));
    const grad = horizontal ? g.createLinearGradient(0, 0, W, 0) : g.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, '#3ddc84');
    grad.addColorStop(0.75, '#ffd23f');
    grad.addColorStop(1, '#ff4d5e');
    g.fillStyle = grad;
    if (horizontal) g.fillRect(0, 0, W * v, H);
    else g.fillRect(0, H * (1 - v), W, H * v);
  }

  // ================================================================== top bar & dialogs

  private buildTopbar(): void {
    const eng = this.app.engine;
    $('#midi-status').onclick = () => this.openController();
    $('#settings-btn').onclick = () => this.openSettings();
    $('#help-btn').onclick = () => ($('#help-dlg') as HTMLDialogElement).showModal();
    const ml = $<HTMLInputElement>('#master-level');
    ml.oninput = () => eng.setMasterLevel(parseFloat(ml.value));
    $('#automix-btn').onclick = () => {
      this.app.automix.setEnabled(!this.app.automix.enabled);
      this.syncControls();
    };
    $('#rec-btn').onclick = async () => {
      if (eng.recording) {
        const blob = await eng.stopRecording();
        const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
        download(`EndoDJ-mix-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`, blob);
        this.toast('Recording saved to your downloads.');
      } else {
        try {
          eng.startRecording();
          this.recStart = performance.now();
        } catch (e) {
          this.toast(`Recording failed: ${(e as Error).message}`, true);
        }
      }
    };
  }

  private renderMidiStatus(): void {
    const midi = this.app.midi;
    const el = $('#midi-status');
    if (midi.error) {
      setText(el, 'MIDI: unavailable');
      el.title = midi.error;
    } else if (midi.input) {
      setText(el, `🎛 ${midi.input.name}`);
      el.title = 'Controller settings';
    } else {
      setText(el, 'MIDI: no controller');
      el.title = 'Plug in your DDJ-FLX2';
    }
    setClass(el, 'connected', !!midi.input);
  }

  private openController(): void {
    this.renderController(true);
    ($('#controller-dlg') as HTMLDialogElement).showModal();
  }

  private learnableControls(): { control: string; kind: ControlKind }[] {
    const seen = new Map<string, ControlKind>();
    for (const b of ddjFlx2Bindings()) if (!seen.has(b.control)) seen.set(b.control, b.kind);
    for (const b of this.app.midi.mapper.getBindings()) if (!seen.has(b.control)) seen.set(b.control, b.kind);
    for (const n of [1, 2]) {
      seen.set(`deck${n}.nudgeDown`, 'button');
      seen.set(`deck${n}.nudgeUp`, 'button');
      seen.set(`deck${n}.beatjumpBack`, 'button');
      seen.set(`deck${n}.beatjumpFwd`, 'button');
    }
    return [...seen].map(([control, kind]) => ({ control, kind }));
  }

  private describeBinding(b: MidiBinding): string {
    const hex = (x: number) => '0x' + x.toString(16).toUpperCase().padStart(2, '0');
    return `${b.type === 'note' ? 'Note' : 'CC'} ch${b.channel + 1} ${hex(b.number)}${b.lsb !== undefined ? `/${hex(b.lsb)}` : ''}${b.invert ? ' (inv)' : ''}`;
  }

  /** @param full rebuild everything (false = only status + monitor, keeps scroll position) */
  private renderController(full: boolean): void {
    const midi = this.app.midi;
    const body = $('#controller-body');
    if (full || !body.querySelector('#midi-monitor')) {
      const tempoInverted = midi.mapper.bindingsFor('deck1.tempo').some((b) => b.invert);
      body.innerHTML = `
        ${midi.error ? `<p class="error">${esc(midi.error)}</p>` : ''}
        <div class="field"><span>MIDI input</span><select id="midi-input"></select></div>
        <p class="warn">The built-in DDJ-FLX2 mapping follows Pioneer's DDJ-FLX4/DDJ-400 MIDI layout and has
          <b>not been verified on a real DDJ-FLX2 yet</b>. Turn on the monitor, move each control, and use <b>Learn</b>
          to fix anything that does not respond.</p>
        <div class="field"><span>MIDI monitor</span><label class="inline"><input type="checkbox" id="midi-mon" ${midi.monitor ? 'checked' : ''}/> show incoming messages</label>
          <button id="midi-mon-clear">Clear</button></div>
        <pre id="midi-monitor" class="mono"></pre>
        <div class="field"><span>Tempo faders</span><label class="inline"><input type="checkbox" id="tempo-inv" ${tempoInverted ? 'checked' : ''}/> invert direction</label></div>
        <h3>Mapping</h3>
        <div class="field"><button id="map-reset">Reset to DDJ-FLX2 default</button><button id="map-export">Export…</button><button id="map-import">Import…</button>
          <span id="learn-status" class="muted"></span></div>
        <details><summary>All controls (${this.learnableControls().length})</summary>
          <table id="map-table"><thead><tr><th>Control</th><th>MIDI</th><th></th></tr></thead><tbody></tbody></table>
        </details>`;
      const sel = $<HTMLSelectElement>('#midi-input', body);
      sel.onchange = () => midi.selectInput(sel.value);
      const mon = $<HTMLInputElement>('#midi-mon', body);
      mon.onchange = () => {
        midi.monitor = mon.checked;
      };
      $('#midi-mon-clear', body).onclick = () => {
        midi.monitorLog = [];
        this.renderController(false);
      };
      const inv = $<HTMLInputElement>('#tempo-inv', body);
      inv.onchange = () => {
        const bs = midi.mapper.getBindings().map((b) => (/^deck\d\.tempo$/.test(b.control) ? { ...b, invert: inv.checked } : b));
        midi.mapper.setBindings(bs);
        midi.saveBindings();
        this.renderController(true);
      };
      $('#map-reset', body).onclick = () => {
        if (confirm('Replace your MIDI mapping with the DDJ-FLX2 default?')) {
          midi.resetBindings();
          this.renderController(true);
        }
      };
      $('#map-export', body).onclick = () => download('endodj-mapping.json', midi.exportBindings(), 'application/json');
      $('#map-import', body).onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          try {
            midi.importBindings(await f.text());
            this.toast('Mapping imported.');
            this.renderController(true);
          } catch (e) {
            this.toast((e as Error).message, true);
          }
        };
        input.click();
      };
      const tbody = $('#map-table tbody', body);
      tbody.innerHTML = this.learnableControls()
        .map(({ control, kind }) => {
          const bs = midi.mapper.bindingsFor(control);
          return `<tr><td class="mono">${esc(control)}</td><td class="mono">${bs.map((b) => esc(this.describeBinding(b))).join('<br>') || '<span class="muted">—</span>'}</td>
            <td><button data-learn="${esc(control)}" data-kind="${kind}">Learn</button></td></tr>`;
        })
        .join('');
      tbody.querySelectorAll<HTMLButtonElement>('[data-learn]').forEach((b) => {
        b.onclick = () => {
          const control = b.dataset.learn!;
          midi.mapper.startLearn(control, b.dataset.kind as ControlKind, () => {
            this.toast(`Learned ${control}`);
            this.renderController(true);
          });
          setText($('#learn-status', body), `Move/press the control for ${control} on your controller… (Esc to cancel)`);
        };
      });
    }
    const sel = $<HTMLSelectElement>('#midi-input', body);
    const opts = ['<option value="">— none —</option>']
      .concat(midi.inputs().map((i) => `<option value="${esc(i.id)}">${esc(i.name ?? i.id)}</option>`))
      .join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    sel.value = midi.input?.id ?? '';
    const monEl = $('#midi-monitor', body);
    monEl.textContent = midi.monitorLog.slice(-60).join('\n');
    monEl.scrollTop = monEl.scrollHeight;
  }

  private async openSettings(): Promise<void> {
    const eng = this.app.engine;
    const body = $('#settings-body');
    const devices = await eng.listOutputDevices();
    const multiOk = eng.maxOutputChannels >= 4;
    body.innerHTML = `
      <h3>Audio output</h3>
      <div class="field"><span>Output device</span>
        ${
          eng.canSelectOutput
            ? `<select id="out-dev">${devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Output ${i + 1}`)}</option>`).join('')}</select>
               <button id="dev-names" title="Browsers hide device names until microphone permission is granted">Show names</button>`
            : '<span class="muted">Your browser uses the system default output.</span>'
        }</div>
      <div class="field"><span>Headphone cue routing</span><select id="out-mode">
        <option value="stereo">Stereo — master only</option>
        <option value="split">Split — left: headphones (cue), right: master (mono)</option>
        <option value="multi" ${multiOk ? '' : 'disabled'}>4 channels — 1/2 master, 3/4 headphones${multiOk ? '' : ' (device has < 4 outputs)'}</option>
      </select></div>
      <p class="muted">Device reports ${eng.maxOutputChannels} output channels. Sample rate ${eng.ctx.sampleRate} Hz, base latency ${Math.round(eng.ctx.baseLatency * 1000)} ms.</p>
      <h3>Mixing</h3>
      <div class="field"><span>Automix crossfade</span><input id="am-fade" type="number" min="2" max="60" step="1" value="${this.app.automix.fadeSeconds}" /> seconds</div>
      <div class="field"><span>Sampler volume</span><input id="smp-vol" type="range" min="0" max="1" step="0.01" value="${this.app.sampler.volume}" /></div>
      <h3>Library</h3>
      <div class="field"><span>Tracks</span><span>${this.app.library.tracks.size}</span></div>`;
    const mode = $<HTMLSelectElement>('#out-mode', body);
    mode.value = eng.outputMode;
    mode.onchange = () => eng.setOutputMode(mode.value as OutputMode);
    const dev = body.querySelector<HTMLSelectElement>('#out-dev');
    if (dev) {
      const cur = (eng.ctx as AudioContext & { sinkId?: string }).sinkId;
      if (typeof cur === 'string' && cur) dev.value = cur;
      dev.onchange = async () => {
        try {
          await eng.setOutputDevice(dev.value);
          this.toast('Output device changed.');
          void this.openSettings();
        } catch (e) {
          this.toast((e as Error).message, true);
        }
      };
      $('#dev-names', body).onclick = async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach((t) => t.stop());
          void this.openSettings();
        } catch {
          this.toast('Permission denied — device names stay hidden.', true);
        }
      };
    }
    const fade = $<HTMLInputElement>('#am-fade', body);
    fade.onchange = () => {
      this.app.automix.fadeSeconds = Math.max(2, Math.min(60, parseFloat(fade.value) || 12));
    };
    const vol = $<HTMLInputElement>('#smp-vol', body);
    vol.oninput = () => this.app.sampler.setVolume(parseFloat(vol.value));
    const dlg = $('#settings-dlg') as HTMLDialogElement;
    if (!dlg.open) dlg.showModal();
  }

  private buildDialogs(): void {
    $('#help-body').innerHTML = `
      <table>
        <tr><th></th><th>Deck A</th><th>Deck B</th></tr>
        <tr><td>Play / pause</td><td><kbd>X</kbd></td><td><kbd>.</kbd></td></tr>
        <tr><td>Cue</td><td><kbd>Z</kbd></td><td><kbd>,</kbd></td></tr>
        <tr><td>Sync</td><td><kbd>C</kbd></td><td><kbd>/</kbd></td></tr>
        <tr><td>Hot cues 1–4 (Shift = clear)</td><td><kbd>1</kbd>–<kbd>4</kbd></td><td><kbd>7</kbd>–<kbd>0</kbd></td></tr>
        <tr><td>Nudge slower / faster (hold)</td><td><kbd>A</kbd> / <kbd>S</kbd></td><td><kbd>K</kbd> / <kbd>L</kbd></td></tr>
        <tr><td>Beat jump −4 / +4</td><td><kbd>Q</kbd> / <kbd>W</kbd></td><td><kbd>O</kbd> / <kbd>P</kbd></td></tr>
        <tr><td>4-beat loop on/off</td><td><kbd>F</kbd></td><td><kbd>J</kbd></td></tr>
        <tr><td>Crossfader</td><td colspan="2"><kbd>←</kbd> / <kbd>→</kbd></td></tr>
        <tr><td>Browse library / load to free deck</td><td colspan="2"><kbd>↑</kbd> / <kbd>↓</kbd> / <kbd>Enter</kbd></td></tr>
      </table>
      <p class="muted">Mouse: drag the scrolling waveform to scrub, mouse-wheel on it to zoom, click the overview to seek,
        double-click a knob to reset it, right-click a hot cue pad to clear it.</p>`;
    $('#controller-dlg').addEventListener('close', () => this.app.midi.mapper.cancelLearn());
  }

  // ================================================================== keyboard

  private bindKeyboard(): void {
    const keys: Record<string, string> = {
      KeyX: 'deck1.play',
      KeyZ: 'deck1.cue',
      KeyC: 'deck1.sync',
      KeyA: 'deck1.nudgeDown',
      KeyS: 'deck1.nudgeUp',
      KeyQ: 'deck1.beatjumpBack',
      KeyW: 'deck1.beatjumpFwd',
      KeyF: 'deck1.beatloop5',
      Digit1: 'deck1.hotcue1',
      Digit2: 'deck1.hotcue2',
      Digit3: 'deck1.hotcue3',
      Digit4: 'deck1.hotcue4',
      Period: 'deck2.play',
      Comma: 'deck2.cue',
      Slash: 'deck2.sync',
      KeyK: 'deck2.nudgeDown',
      KeyL: 'deck2.nudgeUp',
      KeyO: 'deck2.beatjumpBack',
      KeyP: 'deck2.beatjumpFwd',
      KeyJ: 'deck2.beatloop5',
      Digit7: 'deck2.hotcue1',
      Digit8: 'deck2.hotcue2',
      Digit9: 'deck2.hotcue3',
      Digit0: 'deck2.hotcue4',
    };
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' ? true : t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.app.midi.mapper.cancelLearn();
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      let control = keys[e.code];
      if (control) {
        e.preventDefault();
        if (e.repeat) return;
        if (e.shiftKey && control.includes('.hotcue')) control = control.replace('.hotcue', '.hotcueClear');
        this.control(control, 1);
        return;
      }
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const d = e.code === 'ArrowLeft' ? -0.05 : 0.05;
          this.control('mixer.crossfader', Math.max(0, Math.min(1, this.app.engine.crossfader + d)), 'knob');
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          this.browse(e.code === 'ArrowUp' ? -1 : 1);
          break;
        case 'Enter':
          e.preventDefault();
          this.app.loadSelectedToFreeDeck();
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      const control = keys[e.code];
      if (!control || isTyping(e)) return;
      if (control.endsWith('nudgeDown') || control.endsWith('nudgeUp') || control.endsWith('.cue') || control.includes('.hotcue')) {
        this.control(control, 0);
      }
    });
  }

  // ================================================================== library

  private buildLibrary(): void {
    const lib = this.app.library;
    const search = $<HTMLInputElement>('#lib-search');
    search.oninput = () => {
      this.search = search.value.trim().toLowerCase();
      this.renderLibrary();
    };
    const folderBtn = $('#add-folder-btn');
    if (!Library.canPickFolders) folderBtn.title = 'Needs Chrome or Edge — use "Add files" instead';
    folderBtn.onclick = async () => {
      if (!Library.canPickFolders) {
        this.toast('Folder import needs Chrome or Edge. Use "Add files" instead.', true);
        return;
      }
      try {
        const n = await lib.importFolder();
        this.toast(`Added ${n} tracks.`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') this.toast(`Import failed: ${(e as Error).message}`, true);
      }
    };
    const fileInput = $<HTMLInputElement>('#file-input');
    $('#add-files-btn').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      if (fileInput.files) {
        const n = await lib.importFiles(Array.from(fileInput.files));
        this.toast(`Added ${n} tracks.`);
      }
      fileInput.value = '';
    };
    $('#analyze-btn').onclick = async () => {
      const status = $('#lib-status');
      await this.app.analyseLibrary((d, t) => setText(status, `Analysing ${d}/${t}…`));
      setText(status, '');
      this.toast('BPM analysis finished.');
    };

    const wrap = $('#lib-table-wrap');
    wrap.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        wrap.classList.add('dragover');
      }
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
    wrap.addEventListener('drop', async (e) => {
      wrap.classList.remove('dragover');
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      const n = await lib.importFiles(Array.from(e.dataTransfer.files));
      this.toast(`Added ${n} tracks.`);
    });
  }

  private currentTracks(): { id: string; rec: TrackRecord; index: number; playedAt?: number }[] {
    const lib = this.app.library;
    let list: { id: string; rec: TrackRecord; index: number; playedAt?: number }[];
    if (this.view === 'all') {
      list = [...lib.tracks.values()].map((rec, index) => ({ id: rec.id, rec, index }));
    } else if (this.view === HISTORY_ID) {
      list = lib
        .sessionHistory()
        .map((h, index) => ({ id: h.trackId, rec: lib.tracks.get(h.trackId)!, index, playedAt: h.playedAt }))
        .filter((x) => x.rec);
    } else {
      const p = lib.playlist(this.view);
      list = (p?.trackIds ?? [])
        .map((id, index) => ({ id, rec: lib.tracks.get(id)!, index }))
        .filter((x) => x.rec);
    }
    if (this.search) {
      const q = this.search;
      list = list.filter(
        (x) =>
          x.rec.title.toLowerCase().includes(q) ||
          x.rec.artist.toLowerCase().includes(q) ||
          x.rec.fileName.toLowerCase().includes(q) ||
          (x.rec.bpm > 0 && x.rec.bpm.toFixed(0).startsWith(q)),
      );
    }
    if (this.view === 'all') {
      const k = this.sortKey;
      list.sort((a, b) => {
        const va = a.rec[k];
        const vb = b.rec[k];
        if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * this.sortDir;
        return ((va as number) - (vb as number)) * this.sortDir;
      });
    }
    return list;
  }

  renderLibrary(): void {
    const lib = this.app.library;
    // sidebar
    const side = $('#lib-sidebar');
    const item = (id: string, name: string, count: number | string, droppable: boolean) =>
      `<div class="item ${this.view === id ? 'active' : ''}" data-view="${esc(id)}" ${droppable ? 'data-drop="1"' : ''}>
        <span>${esc(name)}</span><span class="count">${count}</span></div>`;
    side.innerHTML =
      item('all', '🎵 All tracks', lib.tracks.size, false) +
      item(HISTORY_ID, '🕘 History (this session)', lib.sessionHistory().length, false) +
      '<div class="muted" style="padding:8px 8px 2px">PLAYLISTS / SETLISTS</div>' +
      lib.playlists.map((p) => item(p.id, (p.id === AUTOMIX_ID ? '🔁 ' : '📃 ') + p.name, p.trackIds.length, true)).join('') +
      '<div class="item" id="new-playlist"><span>＋ New playlist</span></div>';
    side.querySelectorAll<HTMLElement>('[data-view]').forEach((el) => {
      el.onclick = () => {
        this.view = el.dataset.view!;
        this.renderLibrary();
      };
      if (el.dataset.drop) {
        el.addEventListener('dragover', (e) => {
          if (e.dataTransfer?.types.includes('application/x-endodj-track')) {
            e.preventDefault();
            el.classList.add('drop');
          }
        });
        el.addEventListener('dragleave', () => el.classList.remove('drop'));
        el.addEventListener('drop', (e) => {
          el.classList.remove('drop');
          const id = e.dataTransfer?.getData('application/x-endodj-track');
          if (id) {
            e.preventDefault();
            void lib.addToPlaylist(el.dataset.view!, [id]);
          }
        });
      }
      if (el.dataset.view !== 'all' && el.dataset.view !== HISTORY_ID && el.dataset.view !== AUTOMIX_ID) {
        el.ondblclick = () => {
          const name = prompt('Rename playlist', lib.playlist(el.dataset.view!)?.name);
          if (name) void lib.renamePlaylist(el.dataset.view!, name);
        };
      }
    });
    $('#new-playlist').onclick = async () => {
      const name = prompt('Playlist name', `Set ${new Date().toLocaleDateString()}`);
      if (name) {
        const p = await lib.createPlaylist(name);
        this.view = p.id;
        this.renderLibrary();
      }
    };

    // export / playlist tools
    const isList = this.view !== 'all';
    const exp = $('#lib-export');
    const playlist = lib.playlist(this.view);
    exp.innerHTML = isList
      ? `Export: <button data-exp="txt">TXT</button><button data-exp="m3u">M3U</button><button data-exp="csv">CSV</button>
         ${playlist && playlist.id !== AUTOMIX_ID ? '<button id="del-playlist">Delete playlist</button>' : ''}`
      : `<select id="add-to"><option value="">Add selected to…</option>${lib.playlists.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`;
    exp.querySelectorAll<HTMLButtonElement>('[data-exp]').forEach((b) => {
      b.onclick = () => this.exportCurrent(b.dataset.exp as 'txt' | 'm3u' | 'csv');
    });
    exp.querySelector<HTMLButtonElement>('#del-playlist')?.addEventListener('click', () => {
      if (playlist && confirm(`Delete playlist "${playlist.name}"?`)) {
        void lib.deletePlaylist(playlist.id);
        this.view = 'all';
      }
    });
    const addTo = exp.querySelector<HTMLSelectElement>('#add-to');
    if (addTo)
      addTo.onchange = () => {
        if (addTo.value && this.app.selectedTrackId) {
          void lib.addToPlaylist(addTo.value, [this.app.selectedTrackId]);
          this.toast('Added to playlist.');
        } else if (addTo.value) this.toast('Select a track first.', true);
        addTo.value = '';
      };

    // table
    const list = this.currentTracks();
    this.rows = list.map((x) => x.id);
    const head = $('#lib-table thead');
    const sortable = (k: keyof TrackRecord, label: string) =>
      `<th data-sort="${k}">${label}${this.view === 'all' && this.sortKey === k ? (this.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    head.innerHTML = `<tr>${this.view === HISTORY_ID ? '<th>Played</th>' : '<th>#</th>'}${sortable('title', 'Title')}${sortable('artist', 'Artist')}${sortable('bpm', 'BPM')}${sortable('duration', 'Time')}${sortable('playCount', 'Plays')}<th></th></tr>`;
    head.querySelectorAll<HTMLElement>('[data-sort]').forEach((th) => {
      th.onclick = () => {
        if (this.view !== 'all') return;
        const k = th.dataset.sort as keyof TrackRecord;
        if (this.sortKey === k) this.sortDir = -this.sortDir;
        else {
          this.sortKey = k;
          this.sortDir = 1;
        }
        this.renderLibrary();
      };
    });
    const loaded = this.app.engine.decks.map((d) => d.track?.id);
    const inPlaylist = !!playlist;
    $('#lib-table tbody').innerHTML = list
      .map((x, i) => {
        const r = x.rec;
        const cls = [
          this.app.selectedTrackId === x.id ? 'selected' : '',
          lib.isAvailable(x.id) ? '' : 'unavailable',
          loaded[0] === x.id ? 'loaded-0' : '',
          loaded[1] === x.id ? 'loaded-1' : '',
        ].join(' ');
        const first = x.playedAt ? new Date(x.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(i + 1);
        return `<tr class="${cls}" draggable="true" data-id="${esc(x.id)}" data-index="${x.index}">
          <td class="muted">${first}</td><td title="${esc(r.fileName)}">${esc(r.title)}</td><td>${esc(r.artist)}</td>
          <td class="mono">${r.bpm > 0 ? r.bpm.toFixed(1) : ''}</td><td class="mono">${r.duration ? formatDuration(r.duration) : ''}</td>
          <td class="mono">${r.playCount || ''}</td>
          <td><button data-load="0" title="Load to deck A">A</button><button data-load="1" title="Load to deck B">B</button>
            <button data-queue title="Add to Automix queue">Q</button>
            ${inPlaylist ? '<button data-up title="Move up">↑</button><button data-down title="Move down">↓</button><button data-remove title="Remove from playlist">✕</button>' : ''}
          </td></tr>`;
      })
      .join('');
    setText(
      $('#lib-empty'),
      list.length
        ? ''
        : this.view === 'all'
          ? lib.tracks.size
            ? 'No tracks match your search.'
            : 'Your library is empty. Click "Add folder" (Chrome/Edge) or "Add files", or drop audio files here.'
          : 'Nothing here yet. Drag tracks from "All tracks" onto a playlist in the sidebar.',
    );
    $('#lib-table tbody')
      .querySelectorAll<HTMLTableRowElement>('tr')
      .forEach((tr) => {
        const id = tr.dataset.id!;
        const index = parseInt(tr.dataset.index!, 10);
        tr.onclick = (e) => {
          const t = e.target as HTMLElement;
          if (t.dataset.load !== undefined) void this.app.loadTrack(parseInt(t.dataset.load, 10), id);
          else if (t.dataset.queue !== undefined) {
            void lib.addToPlaylist(AUTOMIX_ID, [id]);
            this.toast('Added to Automix queue.');
          } else if (t.dataset.up !== undefined) void lib.moveInPlaylist(this.view, index, index - 1);
          else if (t.dataset.down !== undefined) void lib.moveInPlaylist(this.view, index, index + 1);
          else if (t.dataset.remove !== undefined) void lib.removeFromPlaylist(this.view, index);
          else {
            this.app.selectedTrackId = id;
            this.renderLibrary();
          }
        };
        tr.ondblclick = (e) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') return;
          this.app.selectedTrackId = id;
          this.app.loadSelectedToFreeDeck();
        };
        tr.ondragstart = (e) => {
          e.dataTransfer?.setData('application/x-endodj-track', id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        };
      });
  }

  private browse(delta: number): void {
    if (!this.rows.length) return;
    const cur = this.app.selectedTrackId ? this.rows.indexOf(this.app.selectedTrackId) : -1;
    const next = Math.max(0, Math.min(this.rows.length - 1, cur + delta));
    this.app.selectedTrackId = this.rows[next];
    this.renderLibrary();
    document.querySelector('#lib-table tr.selected')?.scrollIntoView({ block: 'nearest' });
  }

  private exportCurrent(fmt: 'txt' | 'm3u' | 'csv'): void {
    const lib = this.app.library;
    const list = this.currentTracks();
    const tracks: ExportTrack[] = list.map((x) => ({
      title: x.rec.title,
      artist: x.rec.artist,
      bpm: x.rec.bpm,
      duration: x.rec.duration,
      path: x.rec.path,
      playedAt: x.playedAt,
    }));
    const name =
      this.view === HISTORY_ID ? `EndoDJ set ${new Date().toLocaleDateString()}` : (lib.playlist(this.view)?.name ?? 'Playlist');
    const file = name.replace(/[^\w\- ]+/g, '_');
    if (fmt === 'txt') download(`${file}.txt`, toText(name, tracks));
    else if (fmt === 'm3u') download(`${file}.m3u`, toM3U(tracks), 'audio/x-mpegurl');
    else download(`${file}.csv`, toCSV(tracks), 'text/csv');
  }

  // ================================================================== render loop

  private tick(): void {
    const eng = this.app.engine;
    eng.decks.forEach((deck, i) => {
      const ui = this.decks[i];
      this.renderDeck(ui, deck);
      ui.overview.draw();
      ui.zoom.draw();
    });
    this.drawMeter($<HTMLCanvasElement>('#meter-0'), meterLevel(eng.strips[0].meter, this.meterBuf));
    this.drawMeter($<HTMLCanvasElement>('#meter-1'), meterLevel(eng.strips[1].meter, this.meterBuf));
    this.drawMeter($<HTMLCanvasElement>('#master-meter'), meterLevel(eng.masterMeter, this.meterBuf), true);
    setClass($('#rec-btn'), 'on', eng.recording);
    setText($('#rec-time'), eng.recording ? fmtTime((performance.now() - this.recStart) / 1000) : '');
    if (++this.frame % 15 === 0) this.syncControls();
    requestAnimationFrame(() => this.tick());
  }
}
