/**
 * Song sections (intro / break / drop / outro) from the waveform and beat grid: 4-bar blocks are
 * "full" when the bass (kick + bass line) is near its loudest, "thin" otherwise. Pure + tested.
 */
import type { WaveformData } from './waveform';

export type SectionLabel = 'Intro' | 'Break' | 'Drop' | 'Main' | 'Outro';
export interface Section {
  start: number;
  end: number;
  label: SectionLabel;
}

const BLOCK_BEATS = 16;

export function detectSections(wf: WaveformData, grid: { bpm: number; firstBeat: number }, duration: number): Section[] {
  const blockSec = (BLOCK_BEATS * 60) / grid.bpm;
  const starts: number[] = [];
  for (let t = grid.firstBeat; t < duration - blockSec / 4; t += blockSec) starts.push(t);
  if (!starts.length) return [];
  // bass level per block: mean of peak × low-frequency share
  const bass = starts.map((t0) => {
    const b0 = Math.floor(t0 * wf.binsPerSec);
    const b1 = Math.min(wf.peaks.length, Math.floor((t0 + blockSec) * wf.binsPerSec));
    let s = 0;
    for (let b = b0; b < b1; b++) s += wf.peaks[b] * wf.lows[b];
    return b1 > b0 ? s / (b1 - b0) : 0;
  });
  const max = Math.max(...bass);
  if (!(max > 0)) return [{ start: 0, end: duration, label: 'Main' }];
  const full = bass.map((v) => v >= 0.6 * max);
  // merge equal neighbours into segments
  const segs: { start: number; end: number; full: boolean }[] = [];
  starts.forEach((t, i) => {
    const last = segs.at(-1);
    if (last && last.full === full[i]) last.end = t + blockSec;
    else segs.push({ start: i === 0 ? 0 : t, end: t + blockSec, full: full[i] });
  });
  segs[segs.length - 1].end = duration;
  const contrast = segs.some((s) => !s.full);
  return segs.map((s, i) => ({
    start: s.start,
    end: s.end,
    label: s.full ? (contrast ? 'Drop' : 'Main') : i === 0 ? 'Intro' : i === segs.length - 1 ? 'Outro' : 'Break',
  }));
}

export const SECTION_COLORS: Record<SectionLabel, string> = {
  Intro: '#3da5ff',
  Break: '#a06cff',
  Drop: '#ff4d5e',
  Main: '#3ddc84',
  Outro: '#3da5ff',
};
