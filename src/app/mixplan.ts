/**
 * Where Automix mixes out of a track (pure, tested). Times are seconds of track time.
 * - With an outro (last section, in the second half), the blend starts where the outro starts:
 *   the next track takes over while the outgoing one winds down.
 * - Otherwise it starts on the last 8-bar phrase boundary that still leaves room for the whole
 *   blend, so both tracks change phrase together.
 * - The blend always ends before the track does.
 */
import type { Section } from '../audio/sections';

export interface MixPlan {
  start: number;
  end: number;
}

const PHRASE_BEATS = 32;

export function planMixOut(duration: number, grid: { bpm: number; firstBeat: number } | null, sections: Section[], lenSec: number): MixPlan {
  const margin = grid ? 60 / grid.bpm : 0.5; // finish a beat before the end
  const len = Math.max(1, Math.min(lenSec, duration * 0.5));
  const latest = Math.max(0, duration - len - margin);
  if (!grid) return { start: latest, end: latest + len };
  const outro = sections.length > 1 ? sections[sections.length - 1] : undefined;
  if (outro && outro.label === 'Outro' && outro.start >= duration * 0.5 && outro.start <= latest) {
    return { start: outro.start, end: outro.start + len };
  }
  const phrase = (PHRASE_BEATS * 60) / grid.bpm;
  const n = Math.floor((latest - grid.firstBeat) / phrase);
  const onPhrase = grid.firstBeat + n * phrase;
  // a phrase boundary far before the end would cut a lot of the track: fall back to the last bar
  const bar = (4 * 60) / grid.bpm;
  const start = n >= 0 && latest - onPhrase <= phrase / 2 ? onPhrase : grid.firstBeat + Math.max(0, Math.floor((latest - grid.firstBeat) / bar)) * bar;
  return { start, end: start + len };
}

/**
 * Crossfader position (0 = outgoing side … 1 = incoming side) at blend progress `t` (0…1).
 * 'fade': a straight move. 'layer': both tracks at full level through the middle half.
 */
export function blendPosition(t: number, style: 'fade' | 'layer'): number {
  t = Math.max(0, Math.min(1, t));
  if (style === 'fade') return t;
  if (t < 0.25) return (t / 0.25) * 0.5;
  if (t > 0.75) return 0.5 + ((t - 0.75) / 0.25) * 0.5;
  return 0.5;
}
