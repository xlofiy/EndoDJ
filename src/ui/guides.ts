/**
 * Settings → Guides: one short guide per part of EndoDJ, each with a diagram.
 * Diagrams are inline SVG (no image files). The Camelot wheel and the crossfader curves are
 * generated from the same code the app uses, so the pictures can never disagree with the sound.
 */
import { crossfaderGains, type CrossfaderCurve } from '../audio/mixmath';
import { camelot, keyName, type MusicalKey } from '../audio/key';

export interface Guide {
  id: string;
  title: string;
  /** CSS selector of the control "Show me" highlights */
  target?: string;
  figure: () => string;
  caption: string;
  body: string;
}

// diagram palette (drawn on the dark "screen" background)
const C = { aqua: '#4cc6ff', grass: '#8fd63f', amber: '#ffc44d', text: '#dbeeff', muted: '#7fa3c7', line: '#24476e', red: '#ff6b7d' };
const svg = (w: number, h: number, inner: string) =>
  `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif" font-size="12" role="img">${inner}</svg>`;
const t = (x: number, y: number, s: string, fill = C.text, extra = '') =>
  `<text x="${x}" y="${y}" fill="${fill}" text-anchor="middle" ${extra}>${s}</text>`;
const box = (x: number, y: number, w: number, h: number, label: string, stroke = C.aqua) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0b2746" stroke="${stroke}"/>${t(x + w / 2, y + h / 2 + 4, label)}`;
const arrow = (x1: number, y1: number, x2: number, y2: number, color = C.muted) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - 8 * Math.cos(a - 0.4);
  const hy = y2 - 8 * Math.sin(a - 0.4);
  const kx = x2 - 8 * Math.cos(a + 0.4);
  const ky = y2 - 8 * Math.sin(a + 0.4);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/><path d="M${x2} ${y2} L${hx} ${hy} L${kx} ${ky}Z" fill="${color}"/>`;
};

/** Beat ticks along a line; bars (every 4th) taller. */
function beats(x0: number, y: number, n: number, step: number, color = C.muted): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const bar = i % 4 === 0;
    s += `<line x1="${x0 + i * step}" y1="${y - (bar ? 14 : 8)}" x2="${x0 + i * step}" y2="${y + (bar ? 14 : 8)}" stroke="${color}" stroke-width="${bar ? 2 : 1}"/>`;
  }
  return s;
}

/** Camelot wheel: outer ring = major (B), inner ring = minor (A). Highlights 8A and its neighbours. */
export function camelotWheelSvg(): string {
  const cx = 160;
  const cy = 160;
  const sector = (r0: number, r1: number, i: number, fill: string) => {
    const a0 = ((i * 30 - 105) * Math.PI) / 180;
    const a1 = ((i * 30 - 75) * Math.PI) / 180;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z" fill="${fill}" stroke="#061a31" stroke-width="2"/>`;
  };
  let s = '';
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const k: MusicalKey = { tonic, minor };
      const code = camelot(k);
      const num = parseInt(code, 10);
      const i = num % 12; // 12 at the top
      const highlight = code === '8A' ? C.aqua : ['7A', '9A', '8B'].includes(code) ? C.grass : minor ? '#123a63' : '#0f2f52';
      const [r0, r1] = minor ? [62, 108] : [108, 152];
      s += sector(r0, r1, i, highlight);
      const a = ((i * 30 - 90) * Math.PI) / 180;
      const r = (r0 + r1) / 2;
      const dark = highlight === C.aqua || highlight === C.grass;
      s += t(cx + r * Math.cos(a), cy + r * Math.sin(a) - 1, code, dark ? '#062033' : C.text, 'font-weight="700" font-size="11"');
      s += t(cx + r * Math.cos(a), cy + r * Math.sin(a) + 11, keyName(k), dark ? '#062033' : C.muted, 'font-size="9.5"');
    }
  }
  s += `<circle cx="${cx}" cy="${cy}" r="60" fill="#061a31"/>`;
  s += t(cx, cy - 4, 'Inner: minor (A)', C.muted, 'font-size="10"') + t(cx, cy + 12, 'Outer: major (B)', C.muted, 'font-size="10"');
  return svg(320, 320, s);
}

/** The three crossfader curves, plotted from crossfaderGains(). */
export function crossfaderCurvesSvg(): string {
  const curves: [CrossfaderCurve, string][] = [
    ['smooth', 'Smooth'],
    ['linear', 'Linear'],
    ['sharp', 'Cut (scratch)'],
  ];
  let s = '';
  curves.forEach(([curve, label], k) => {
    const x0 = 20 + k * 200;
    const y0 = 20;
    const w = 160;
    const h = 90;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${C.line}"/>`;
    for (const [idx, color] of [
      [0, C.aqua],
      [1, C.grass],
    ] as const) {
      let d = '';
      for (let i = 0; i <= 100; i++) {
        const x = i / 100;
        const g = crossfaderGains(x, curve)[idx];
        d += `${i ? 'L' : 'M'}${(x0 + x * w).toFixed(1)} ${(y0 + h - g * h).toFixed(1)}`;
      }
      s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    }
    s += t(x0 + w / 2, y0 + h + 18, label, C.text, 'font-weight="600"');
    s += t(x0 + 8, y0 + h + 34, 'A', C.aqua, 'font-size="10"') + t(x0 + w - 8, y0 + h + 34, 'B', C.grass, 'font-size="10"');
  });
  return svg(620, 160, s);
}

function controllerSvg(): string {
  let s = `<rect x="10" y="10" width="600" height="220" rx="16" fill="#0b2746" stroke="${C.line}"/>`;
  for (const [cx, side] of [
    [130, 'A'],
    [490, 'B'],
  ] as const) {
    s += `<circle cx="${cx}" cy="95" r="62" fill="#061a31" stroke="${C.aqua}" stroke-width="2"/><circle cx="${cx}" cy="95" r="44" fill="none" stroke="${C.line}"/>`;
    s += t(cx, 92, 'JOG', C.text, 'font-weight="700"') + t(cx, 108, `deck ${side}`, C.muted, 'font-size="10"');
    for (let i = 0; i < 8; i++) {
      const px = cx - 66 + (i % 4) * 34;
      const py = 172 + Math.floor(i / 4) * 24;
      s += `<rect x="${px}" y="${py}" width="28" height="18" rx="4" fill="#123a63" stroke="${C.grass}"/>`;
    }
    const fx = side === 'A' ? 34 : 586;
    s += `<rect x="${fx - 6}" y="40" width="12" height="110" rx="6" fill="#061a31" stroke="${C.muted}"/><rect x="${fx - 10}" y="88" width="20" height="10" rx="3" fill="${C.amber}"/>`;
  }
  s += `<rect x="248" y="30" width="124" height="190" rx="10" fill="#0f2f52" stroke="${C.line}"/>`;
  s += t(310, 50, 'HI · MID · LOW · CFX', C.muted, 'font-size="9" font-weight="700"');
  for (const x of [282, 338]) s += `<circle cx="${x}" cy="76" r="9" fill="none" stroke="${C.aqua}"/><circle cx="${x}" cy="102" r="9" fill="none" stroke="${C.aqua}"/><rect x="${x - 5}" y="122" width="10" height="56" rx="5" fill="#061a31" stroke="${C.muted}"/>`;
  s += `<rect x="270" y="196" width="80" height="10" rx="5" fill="#061a31" stroke="${C.muted}"/><rect x="304" y="193" width="12" height="16" rx="3" fill="${C.amber}"/>`;
  s += t(34, 168, 'TEMPO', C.muted, 'font-size="9"') + t(586, 168, 'TEMPO', C.muted, 'font-size="9"');
  s += t(130, 236, 'PADS', C.grass, 'font-size="10"') + t(490, 236, 'PADS', C.grass, 'font-size="10"');
  return svg(620, 250, s);
}

function waveformSvg(): string {
  let s = `<rect x="10" y="10" width="600" height="90" rx="8" fill="#020c1a"/>`;
  for (let i = 0; i < 120; i++) {
    const x = 14 + i * 5;
    const h = 8 + 30 * Math.abs(Math.sin(i * 0.7)) * (i % 8 === 0 ? 1.2 : 0.6);
    s += `<rect x="${x}" y="${55 - h / 2}" width="3" height="${h}" fill="${i % 8 < 2 ? '#ff9a4d' : '#5fb0ff'}" opacity="${x < 310 ? 0.55 : 1}"/>`;
  }
  s += beats(14, 55, 16, 40, 'rgb(255 255 255 / 0.35)');
  s += `<line x1="310" y1="10" x2="310" y2="100" stroke="${C.aqua}" stroke-width="3"/>`;
  s += `<line x1="134" y1="10" x2="134" y2="100" stroke="${C.amber}" stroke-width="2"/>${t(150, 24, 'CUE', C.amber, 'font-size="10" font-weight="700"')}`;
  s += `<line x1="454" y1="10" x2="454" y2="100" stroke="#ff4d5e" stroke-width="2"/>${t(462, 24, '1', '#ff4d5e', 'font-size="10" font-weight="700"')}`;
  s += t(310, 118, 'playhead (now)', C.aqua, 'font-size="11"') + t(134, 118, 'cue point', C.amber, 'font-size="11"') + t(454, 118, 'hot cue 1', '#ff4d5e', 'font-size="11"');
  s += t(560, 118, 'tall line = bar', C.muted, 'font-size="11"');
  return svg(620, 128, s);
}

function syncSvg(): string {
  let s = t(60, 40, 'Deck A', C.aqua, 'font-weight="600"') + beats(110, 35, 12, 40, C.aqua);
  s += t(60, 90, 'Deck B', C.grass, 'font-weight="600"') + beats(126, 85, 12, 44, C.grass);
  s += t(60, 150, 'after SYNC', C.text, 'font-weight="600"') + beats(110, 145, 12, 40, C.grass);
  s += arrow(560, 95, 560, 130, C.text);
  s += t(560, 60, 'tempo + beats', C.muted, 'font-size="10"') + t(560, 74, 'line up', C.muted, 'font-size="10"');
  return svg(620, 175, s);
}

function platterSvg(): string {
  let s = `<circle cx="150" cy="120" r="100" fill="#061a31" stroke="${C.aqua}" stroke-width="10"/><circle cx="150" cy="120" r="70" fill="#0b2746"/>`;
  s += `<line x1="150" y1="120" x2="205" y2="45" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  s += t(150, 118, '128.0', C.text, 'font-size="20" font-weight="700"') + t(150, 136, 'BPM · 8A', C.muted, 'font-size="10"');
  s += `<path d="M90 60 A85 85 0 0 1 210 60" fill="none" stroke="${C.grass}" stroke-width="3"/>`;
  s += t(345, 70, 'Touch the top + turn = scratch', C.grass, 'text-anchor="start" font-weight="600"');
  s += t(345, 120, 'Turn the outer ring = nudge', C.aqua, 'text-anchor="start" font-weight="600"');
  s += t(345, 170, 'SHIFT + turn = fast search', C.amber, 'text-anchor="start" font-weight="600"');
  s += t(150, 245, 'Marker turns at 33⅓ RPM, ring shows time played', C.muted, 'font-size="11"');
  return svg(620, 255, s);
}

function loopSvg(): string {
  let s = beats(30, 60, 15, 40, C.muted);
  s += `<rect x="190" y="38" width="160" height="44" rx="6" fill="rgb(143 214 63 / 0.25)" stroke="${C.grass}"/>`;
  s += t(270, 30, '4-beat loop', C.grass, 'font-weight="600"');
  s += `<rect x="190" y="96" width="80" height="20" rx="4" fill="rgb(143 214 63 / 0.25)" stroke="${C.grass}"/>${t(230, 131, '½ → 2 beats', C.muted, 'font-size="11"')}`;
  s += `<rect x="190" y="140" width="320" height="20" rx="4" fill="rgb(143 214 63 / 0.15)" stroke="${C.grass}"/>${t(350, 175, '×2 → 8 beats', C.muted, 'font-size="11"')}`;
  s += arrow(400, 110, 470, 110, C.amber) + t(435, 100, 'JUMP 4 ▶', C.amber, 'font-size="11"');
  return svg(620, 190, s);
}

function eqSvg(): string {
  let s = `<line x1="40" y1="90" x2="400" y2="90" stroke="${C.line}"/>`;
  s += `<path d="M40 90 C90 90 110 40 160 40 L 160 40" fill="none" stroke="${C.red}" stroke-width="2"/>`;
  s += t(100, 120, 'LOW (bass, kick)', C.red, 'font-size="11"') + t(220, 120, 'MID (vocals, synths)', C.amber, 'font-size="11"') + t(340, 120, 'HI (hats, air)', C.aqua, 'font-size="11"');
  s += `<path d="M160 90 Q220 50 280 90" fill="none" stroke="${C.amber}" stroke-width="2"/><path d="M280 90 C320 90 330 50 400 50" fill="none" stroke="${C.aqua}" stroke-width="2"/>`;
  s += t(220, 30, 'knob left = cut (far left = kill), middle = flat, right = boost', C.muted, 'font-size="11"');
  s += `<circle cx="520" cy="70" r="30" fill="none" stroke="${C.aqua}" stroke-width="3"/><line x1="520" y1="70" x2="520" y2="44" stroke="#fff" stroke-width="3"/>`;
  s += t(470, 120, '◀ low-pass', C.muted, 'font-size="11"') + t(575, 120, 'high-pass ▶', C.muted, 'font-size="11"') + t(520, 30, 'FILTER', C.text, 'font-weight="600"');
  return svg(620, 135, s);
}

function fxSvg(): string {
  let s = beats(40, 100, 13, 44, C.muted);
  s += `<rect x="40" y="40" width="14" height="50" fill="${C.aqua}"/>`;
  [0.7, 0.49, 0.34, 0.24, 0.17].forEach((g, i) => {
    s += `<rect x="${40 + (i + 1) * 44}" y="${90 - 50 * g}" width="14" height="${50 * g}" fill="${C.aqua}" opacity="${0.4 + g * 0.6}"/>`;
  });
  s += t(330, 50, 'Echo at 1 beat: repeats land on the beat and fade out', C.text, 'text-anchor="start" font-size="11"');
  s += t(330, 70, 'Echo and reverb keep their tail when you switch them off', C.muted, 'text-anchor="start" font-size="11"');
  return svg(620, 125, s);
}

function loopLabSvg(): string {
  let s = box(20, 30, 170, 60, 'Loop: 140 BPM, Dm', C.grass);
  s += box(430, 30, 170, 60, 'Playing: 128 BPM, Am', C.aqua);
  s += arrow(195, 60, 425, 60, C.text);
  s += t(310, 48, 'auto-match', C.text, 'font-weight="600"') + t(310, 80, 'tempo −8.6 %, key −5 semitones', C.muted, 'font-size="11"');
  s += t(310, 120, 'Key lock stays on, so later tempo changes keep it in key.', C.muted, 'font-size="11"');
  return svg(620, 135, s);
}

function libraryFlowSvg(): string {
  let s = box(10, 40, 110, 44, 'Music folder');
  s += box(150, 40, 110, 44, 'Library');
  s += box(290, 10, 130, 44, 'Playlist / setlist', C.grass);
  s += box(290, 70, 130, 44, 'Automix queue', C.grass);
  s += box(450, 40, 70, 44, 'Decks', C.amber);
  s += box(540, 40, 70, 44, 'History');
  s += arrow(122, 62, 148, 62) + arrow(262, 55, 288, 35) + arrow(262, 70, 288, 90) + arrow(422, 32, 448, 55) + arrow(422, 92, 448, 70) + arrow(522, 62, 538, 62);
  s += t(310, 140, 'Drag tracks onto a playlist · export setlists as TXT, M3U or CSV', C.muted, 'font-size="11"');
  return svg(620, 150, s);
}

function routingSvg(): string {
  const rows: [string, string, string][] = [
    ['Stereo', 'Master → speakers (1/2)', 'no separate cue'],
    ['Split cable', 'Master → right (mono)', 'Cue → left (mono)'],
    ['4 channels', 'Master → outputs 1/2', 'Cue → outputs 3/4'],
  ];
  let s = '';
  rows.forEach(([name, a, b], i) => {
    const y = 20 + i * 48;
    s += t(70, y + 20, name, C.text, 'font-weight="600"');
    s += `<rect x="140" y="${y}" width="220" height="32" rx="6" fill="#0b2746" stroke="${C.aqua}"/>${t(250, y + 20, a, C.aqua, 'font-size="11"')}`;
    s += `<rect x="380" y="${y}" width="220" height="32" rx="6" fill="#0b2746" stroke="${C.amber}"/>${t(490, y + 20, b, C.amber, 'font-size="11"')}`;
  });
  return svg(620, 170, s);
}

function midiLearnSvg(): string {
  let s = box(10, 40, 170, 50, 'Monitor: Note ch1 0x0B', C.muted);
  s += box(225, 40, 150, 50, 'Click “Learn”', C.amber);
  s += box(420, 40, 190, 50, 'Press the button = bound', C.grass);
  s += arrow(182, 65, 222, 65) + arrow(377, 65, 417, 65);
  s += t(310, 125, 'Export the mapping to keep a backup or share it', C.muted, 'font-size="11"');
  return svg(620, 140, s);
}

function startSvg(): string {
  const steps = ['Plug in FLX2', 'Start EndoDJ', 'Allow MIDI', 'Add folder', 'Load + play'];
  let s = '';
  steps.forEach((label, i) => {
    const x = 10 + i * 122;
    s += box(x, 30, 104, 44, label, i === 4 ? C.grass : C.aqua);
    if (i < 4) s += arrow(x + 106, 52, x + 120, 52);
    s += t(x + 52, 98, String(i + 1), C.muted, 'font-weight="700"');
  });
  return svg(620, 110, s);
}

export const GUIDES: Guide[] = [
  {
    id: 'start',
    title: 'Getting started',
    figure: startSvg,
    caption: 'From plugging in to the first track.',
    body: `<ol>
      <li>Connect the DDJ-FLX2 with USB, then click <b>Start EndoDJ</b>. Allow MIDI access if the browser asks.</li>
      <li>The controller chip in the top bar shows a green dot when EndoDJ hears the controller.</li>
      <li>Click <b>Add folder</b> below the decks and pick your music folder. Nothing is copied; EndoDJ remembers where the files are. Its sub-folders (genres) appear under <b>Folders</b> on the left.</li>
      <li>Load a track onto deck A with its <b>A</b> button (or drag it onto the deck), then press <b>▶</b>.</li>
      <li>EndoDJ detects BPM, key and length of every track in the background as soon as you add it (progress shows next to the search box).</li>
    </ol>`,
  },
  {
    id: 'controller',
    title: 'Your DDJ-FLX2',
    target: '#midi-status',
    figure: controllerSvg,
    caption: 'DDJ-FLX2 layout, simplified from the official manual.',
    body: `<ul>
      <li><b>Jog wheels</b>: touch and turn the top to scratch, turn the outer section to nudge, SHIFT + top to search.</li>
      <li><b>TEMPO</b>: pull towards you to play faster (Pioneer style). If yours runs the other way, tick “invert
        direction” in the Controller window.</li>
      <li><b>8 Performance Pads</b> per deck. Choose the mode with <b>SHIFT + BEAT SYNC</b>, then pad 1 (Hot Cue), 2 (Pad FX),
        3 (Beat Loop) or 4 (Sampler). SHIFT + pad clears a hot cue or stops a sample.</li>
      <li><b>Mixer</b>: HI / MID / LOW, CFX (EndoDJ's filter), headphone CUE, channel faders, crossfader, MASTER CUE.
        Master and headphone volume are the knobs on the side of the unit.</li>
      <li>The FLX2 has no browse knob or LOAD buttons: load tracks with the mouse (A / B buttons, drag and drop).</li>
    </ul>
    <p class="tip">First time? Open the Controller window and run <b>Test controller</b> — it checks every control and fixes
      anything that is mapped wrong.</p>`,
  },
  {
    id: 'decks',
    title: 'Play, cue and waveforms',
    target: '#deck-0 .transport',
    figure: waveformSvg,
    caption: 'The scrolling waveform: left of the playhead has already played.',
    body: `<ul>
      <li><b>CUE</b> works like a club player. While paused it sets the cue point. Hold it at the cue point to preview,
        and let go to jump back. While playing, it returns to the cue point and stops.</li>
      <li><b>Drag</b> the scrolling waveform to scrub, and use the <b>mouse wheel</b> on it to zoom. Click the small
        overview to jump anywhere.</li>
      <li>Orange parts are bass-heavy (kicks, bass), blue parts are bright (hats, vocals).</li>
      <li>The scrolling waveform shows every beat (ticks), every bar (line + bar number) and every 8-bar phrase
        (gold line), so you can count into a mix.</li>
      <li>The coloured strip on top of the overview marks the song's sections: <b>intro</b>, <b>drop</b>,
        <b>break</b>, <b>outro</b>. Click the strip to jump to the start of a section, so you can skip a part.</li>
      <li><b>PARTS</b> cuts parts of the track: BASS (kick + bass), VOCAL (the centre of the mids, where lead vocals
        sit), INSTRU (the stereo sides) and HATS (highs). It is a frequency and stereo split, not AI stem
        separation, so a centred synth also goes with VOCAL.</li>
      <li><b>REV</b> plays backwards. <b>Q</b> (quantize) snaps cues and loops to the beat grid.</li>
    </ul>`,
  },
  {
    id: 'tempo',
    title: 'Tempo, BPM and sync',
    target: '#deck-0 .pitch',
    figure: syncSvg,
    caption: 'SYNC matches tempo and lines up the beats with the other deck.',
    body: `<ul>
      <li>The pitch fader changes tempo. The range menu above it sets how far it goes (±6, 10, 16 or 50 %).</li>
      <li><b>◀◀ / ▶▶</b> nudge a drifting mix back in time while held.</li>
      <li><b>SYNC</b> matches tempo and beat phase to the other deck. It also handles half and double time
        (87 vs 174 BPM).</li>
      <li>Wrong BPM? <b>½</b> and <b>×2</b> fix half or double readings. <b>GRID</b> puts a downbeat at the
        current position if the beat grid is off.</li>
    </ul>`,
  },
  {
    id: 'platters',
    title: 'Platters and scratching',
    target: '#deck-0 canvas.platter',
    figure: platterSvg,
    caption: 'The on-screen platter mirrors the jog wheel.',
    body: `<ul>
      <li>On the controller: touch the top of the jog wheel and move it to scratch. Let go and the track carries on at
        normal speed.</li>
      <li>The outer ring bends the tempo for a moment — perfect for nudging. SHIFT + jog searches fast.</li>
      <li>On screen: drag the platter with the mouse to scratch, and use the mouse wheel on it to nudge.</li>
      <li>The ring fills as the track plays and turns red in the last 30 seconds. Dots show your hot cues.</li>
    </ul>
    <p class="tip">Platters can be turned off in General settings.</p>`,
  },
  {
    id: 'pads',
    title: 'Hot cues, loops and pads',
    target: '#deck-0 .perf',
    figure: loopSvg,
    caption: 'Loops snap to the beat grid; halve, double and beat jump keep them in time.',
    body: `<ul>
      <li><b>Hot cues</b>: press an empty pad to set it, press again to jump there. Right-click (or SHIFT + pad on the
        controller) clears it. Hot cues are saved with the track.</li>
      <li><b>LOOP 1/4 … 32</b> starts a loop of that many beats on the current beat. Press again to leave it.</li>
      <li><b>IN / OUT</b> set a loop by hand, <b>RELOOP</b> leaves or re-enters it, and <b>½ / ×2</b> resize it.</li>
      <li><b>JUMP</b> moves forwards or backwards by whole beats, taking an active loop with it.</li>
      <li>The <b>Pads</b> menu switches the 8 pads between hot cues, beat loops, beat jump and sampler.</li>
    </ul>`,
  },
  {
    id: 'mixer',
    title: 'Mixer: EQ, filter, faders',
    target: '#mixer .channels',
    figure: eqSvg,
    caption: 'Three EQ bands per channel, plus a one-knob filter.',
    body: `<ul>
      <li><b>TRIM</b> sets the channel's input level — keep the meter out of the red.</li>
      <li><b>HI / MID / LOW</b>: middle is flat, left cuts, far left kills the band. A classic move is swapping the bass:
        LOW down on the outgoing track as the new one comes in.</li>
      <li><b>FILTER</b>: turn left for a low-pass (muffled), right for a high-pass (thin). The middle is off.</li>
      <li><b>CUE</b> (per channel) sends the channel to your headphones before the fader.</li>
      <li>Double-click any knob to reset it.</li>
    </ul>`,
  },
  {
    id: 'crossfader',
    title: 'Crossfader curves',
    target: '#xfader',
    figure: crossfaderCurvesSvg,
    caption: 'Plotted from the mixer code: deck A (aqua) and deck B (green) volume across the fader.',
    body: `<ul>
      <li><b>Smooth</b> keeps the overall loudness even. Best for long blends.</li>
      <li><b>Linear</b> fades straight across.</li>
      <li><b>Cut</b> keeps both decks at full volume except at the very edges. Best for scratching and quick cuts.</li>
    </ul>`,
  },
  {
    id: 'fx',
    title: 'Beat FX',
    target: '#mixer .fx',
    figure: fxSvg,
    caption: 'Effect timing follows the BPM, so repeats always land on the beat.',
    body: `<ol>
      <li>Pick an effect: echo, ping-pong echo, reverb, flanger, phaser, wah, trans (gate), tremolo, distortion,
        bitcrusher or noise sweep.</li>
      <li>Pick where it goes: deck A, deck B or the master.</li>
      <li>Pick a beat length (1/8 to 16 beats) — the time the effect follows.</li>
      <li>Set LEVEL / DEPTH, then press <b>FX ON</b>. Echo and reverb tails ring out after you switch them off.</li>
      <li>Pads in <b>Pad FX</b> mode play an effect while you hold them: echo, ping-pong, reverb, flanger,
        <b>beat roll</b> (loops while held, then carries on where the track would have been),
        <b>brake</b> (slows to a stop) and <b>backspin</b>.</li>
    </ol>`,
  },
  {
    id: 'key',
    title: 'Key and harmonic mixing',
    target: '#deck-0 .keyrow',
    figure: camelotWheelSvg,
    caption: 'Camelot wheel: from 8A you can mix into 8A, 7A, 9A or 8B without clashing.',
    body: `<ul>
      <li>The key chip shows the key you hear right now, in Camelot code and as a name (for example <b>8A Am</b>).
        It turns <b>green</b> when both decks are in key.</li>
      <li>Keys that mix well: the same code, one step around the wheel (7A ↔ 8A ↔ 9A), or the same number in the
        other ring (8A ↔ 8B).</li>
      <li><b>KEY SYNC</b> shifts this deck's key to match the other deck by the smallest step. <b>♭ / ♯</b> move a
        semitone, and <b>0</b> resets.</li>
      <li><b>KEY LOCK</b> keeps the pitch when you change tempo, so a track sped up 8 % does not go up in key.</li>
    </ul>`,
  },
  {
    id: 'looplab',
    title: 'Loop Lab',
    target: '#lib-sidebar [data-view="__looplab__"]',
    figure: loopLabSvg,
    caption: 'Loops adjust BPM and key to the deck that is playing.',
    body: `<ul>
      <li>Open <b>Loop Lab</b> in the left column below the decks. Filter by genre, and press <b>Preview</b> to hear a
        loop in your headphones.</li>
      <li><b>→ A / → B</b> loads it onto a deck. It loops seamlessly on an exact grid and automatically matches the
        playing deck's <b>BPM and key</b>.</li>
      <li><b>→ Pad</b> puts a sound on a sampler pad. Switch that deck's pads to “Sampler” to fire it.</li>
      <li><b>Import loop pack</b> adds your own loops. A tempo in the file name (“128bpm”) is used as a hint.</li>
    </ul>`,
  },
  {
    id: 'library',
    title: 'Library, playlists and Automix',
    target: '#lib-sidebar',
    figure: libraryFlowSvg,
    caption: 'How music moves through EndoDJ.',
    body: `<ul>
      <li>Search finds titles, artists and BPMs. Click a column header to sort (Key sorts around the Camelot wheel).</li>
      <li><b>+ New playlist</b> makes a setlist. Drag tracks onto it from All tracks, and reorder with ↑ ↓.</li>
      <li><b>Folders</b> lists the sub-folders of your music folder (your genres). Click one to see only its tracks.</li>
      <li><b>Q</b> adds a track to the Automix queue. Open <b>Automix queue</b> and switch <b>Automix on</b>: with both
        decks stopped, track 1 goes on deck A and track 2 on deck B, and the mix alternates from there (odd tracks on A,
        even tracks on B), with matched tempo, a crossfade and a bass swap halfway. As soon as a track has finished, the
        next one is loaded on that deck, so you can always see what plays next.</li>
      <li><b>Auto-set</b> builds a new set from a folder each time you press it: it starts slow, then picks a good tempo
        and key match each time, loads it onto A and B and starts Automix. Pick a second folder under <b>mixed with</b>
        and the set alternates between the two. <b>Save set</b> keeps it.</li>
      <li><b>Layers</b>: a Loop Lab loop in the queue takes no deck. It comes in with the transition and keeps playing
        over the next song for 16 bars, in time with the mix. Auto-set adds drum-loop layers.</li>
      <li><b>Suggestions</b> (a tab in the Automix queue) lists the tracks that mix best after deck A or B, with the
        reason, leaving out what is queued or already played, plus loop layers that fit.</li>
      <li><b>Save set</b> keeps the queue as a playlist; <b>Load set</b> puts a saved set back in the queue.</li>
      <li>History lists everything you played this session. Export it as your setlist.</li>
      <li>The <b>Layout</b> button (top bar) or the bar above the song list gives the list more room.</li>
    </ul>`,
  },
  {
    id: 'audio',
    title: 'Headphones, outputs and recording',
    target: '#rec-btn',
    figure: routingSvg,
    caption: 'Headphone cue needs a separate output: split cable or a 4-channel sound card.',
    body: `<ul>
      <li>In <b>Audio</b> settings, choose the output device and how headphone cue is routed.</li>
      <li><b>4 channels</b> is for sound cards with separate headphone outputs. The FLX2 has a MASTER output and a
        headphones output (per the manual), so pick the FLX2 as output device and choose 4 channels. If your browser
        shows fewer than 4 outputs for it, use Split instead.</li>
      <li>The headphone knobs in the mixer blend cue and master, and set the level.</li>
      <li><b>Rec</b> in the top bar records the master output. Press it again to save the file to your downloads.</li>
    </ul>`,
  },
  {
    id: 'learn',
    title: 'Fixing a control (MIDI Learn)',
    target: '#midi-status',
    figure: midiLearnSvg,
    caption: 'Any control can be re-assigned in a few seconds.',
    body: `<p><b>Quickest:</b> Controller window → <b>Test controller</b> walks through every FLX2 control and offers
      “Use this” whenever a control sends something unexpected. To fix one control by hand:</p>
    <ol>
      <li>Open the <b>Controller</b> window (the controller chip in the top bar) and tick “show incoming messages”.</li>
      <li>Press the control that does not work — you should see a message appear.</li>
      <li>Open “All controls”, click <b>Learn</b> next to the function you want, and press the control again.</li>
      <li><b>Export…</b> saves your mapping to a file. <b>Reset</b> brings back the default.</li>
    </ol>`,
  },
];

/** Render the guides browser into `root`. */
export function renderGuides(root: HTMLElement, onShow: (selector: string) => void, startId = GUIDES[0].id): void {
  root.innerHTML = `<div class="guides"><nav></nav><article class="guide"></article></div>`;
  const nav = root.querySelector('nav')!;
  const article = root.querySelector('article')!;
  const open = (id: string) => {
    const g = GUIDES.find((x) => x.id === id) ?? GUIDES[0];
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.guide === g.id));
    article.innerHTML = `<h3>${g.title}</h3>
      <figure>${g.figure()}<figcaption>${g.caption}</figcaption></figure>
      ${g.body}
      ${g.target ? '<p><button class="show-me">Show me</button></p>' : ''}`;
    article.querySelector<HTMLButtonElement>('.show-me')?.addEventListener('click', () => onShow(g.target!));
  };
  nav.innerHTML = GUIDES.map((g) => `<button data-guide="${g.id}">${g.title}</button>`).join('');
  nav.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => open(b.dataset.guide!)));
  open(startId);
}
