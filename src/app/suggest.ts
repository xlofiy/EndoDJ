/**
 * Mix suggestions and auto-sets: which tracks (and Loop Lab loops) go well together, by tempo,
 * Camelot key and genre (= the music sub-folder a track is in, e.g. "Song MP3s/House").
 */
import { camelot, parseKey } from '../audio/key';
import { LOOPS, type Genre, type LoopDef } from '../loops/catalog';

export interface MixTrack {
  id: string;
  bpm: number;
  key?: string;
  /** relative path, "Song MP3s/House/Artist - Title.mp3" */
  path: string;
}

/** Tempo distance in percent, allowing half / double time (87 vs 174 BPM = 0 %). */
export function tempoGap(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return Infinity;
  return Math.min(Math.abs(b / a - 1), Math.abs((2 * b) / a - 1), Math.abs(b / (2 * a) - 1)) * 100;
}

/** Harmonic match on the Camelot wheel: 1 same key … 0 clash; 0.3 when a key is unknown. */
export function keyMatch(a?: string, b?: string): number {
  const ka = parseKey(a);
  const kb = parseKey(b);
  if (!ka || !kb) return 0.3;
  const ca = camelot(ka);
  const cb = camelot(kb);
  const d = Math.abs(parseInt(ca, 10) - parseInt(cb, 10));
  const steps = Math.min(d, 12 - d);
  const sameLetter = ca.slice(-1) === cb.slice(-1);
  if (steps === 0) return sameLetter ? 1 : 0.85; // same key / relative major-minor
  if (steps === 1 && sameLetter) return 0.8;
  if (steps === 2 && sameLetter) return 0.4; // energy boost
  return 0;
}

/** Genre folder: the first two folder levels ("Song MP3s/House" for ".../House/Deep/x.mp3"). */
export function genreFolder(path: string): string {
  const parts = path.split('/').slice(0, -1);
  return parts.slice(0, 2).join('/');
}

export interface Match {
  id: string;
  score: number;
  reasons: string[];
}

/** 0…1: tempo (within ±6 %) counts most, then key, then same genre folder. */
export function matchScore(a: MixTrack, b: MixTrack): Match {
  const gap = tempoGap(a.bpm, b.bpm);
  const tempo = gap <= 6 ? 1 - gap / 12 : 0;
  const key = keyMatch(a.key, b.key);
  const sameGenre = !!genreFolder(a.path) && genreFolder(a.path) === genreFolder(b.path);
  const reasons: string[] = [];
  if (tempo > 0) reasons.push(gap < 0.5 ? 'same tempo' : `tempo ${gap.toFixed(1)} % apart`);
  if (key >= 0.8) reasons.push(key === 1 ? 'same key' : 'key mixes');
  else if (key === 0.4) reasons.push('energy boost key');
  if (sameGenre) reasons.push('same folder');
  return { id: b.id, score: 0.5 * tempo + 0.35 * key + (sameGenre ? 0.15 : 0), reasons };
}

/** Tracks that mix well after `seed`, best first. */
export function suggestTracks(seed: MixTrack, tracks: Iterable<MixTrack>, max = 50): Match[] {
  const out: Match[] = [];
  for (const t of tracks) if (t.id !== seed.id && t.bpm > 0) out.push(matchScore(seed, t));
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}

// keyword → Loop Lab genre; checked in order, so specific names come first
const GENRE_WORDS: [Genre, RegExp][] = [
  ['Jersey Club', /jersey|baltimore|club ?music/],
  ['Hardstyle', /hardstyle|rawstyle|hard ?dance|gabber|hardcore/],
  ['Breakcore', /breakcore|amen|breaks/],
  ['Hyperpop', /hyperpop|digicore|pc ?music|nightcore/],
  ['Techno', /techno|minimal|industrial|acid/],
  ['Rave', /rave|jungle|d(rum)? ?(n|and|&) ?b(ass)?|dnb|trance/],
  ['EDM', /edm|house|dubstep|trap|big ?room|future|bass|dance|electronic/],
  ['Scene', /scene|electro|crunk|emo|myspace/],
];

/** Loop Lab genre for a track's folder path, or null if the folder name says nothing. */
export function genreOf(path: string): Genre | null {
  const folders = path.toLowerCase().split('/').slice(0, -1).reverse(); // innermost folder first
  for (const f of folders) for (const [g, re] of GENRE_WORDS) if (re.test(f)) return g;
  return null;
}

/** Beat loops of a genre that fit `key` (unpitched drum loops always fit), drums first. */
export function loopsFor(genre: Genre | null, key?: string, loops: LoopDef[] = LOOPS): LoopDef[] {
  if (!genre) return [];
  return loops
    .filter((l) => l.genre === genre && l.bpm > 0 && (!l.key || keyMatch(l.key, key) >= 0.8 || !parseKey(key)))
    .sort((a, b) => Number(b.kind === 'drums') - Number(a.kind === 'drums'));
}

/** Queue id of a Loop Lab loop in the Automix queue. */
export const LOOP_PREFIX = 'loop:';

/**
 * Auto-set: start with the slowest track (warm-up), then keep picking the best-matching unused
 * track, preferring a steady or rising tempo. With `loops`, a drum loop of the genre bridges
 * transitions whose key or tempo does not match well.
 */
export function buildSet(tracks: MixTrack[], length: number, loops: LoopDef[] = []): string[] {
  const pool = tracks.filter((t) => t.bpm > 0);
  if (!pool.length) return [];
  let cur = pool.reduce((a, b) => (b.bpm < a.bpm ? b : a));
  const used = new Set([cur.id]);
  const out = [cur.id];
  const bridges = loops.filter((l) => !l.key);
  let nextLoop = 0;
  for (let count = 1; count < length; count++) {
    let best: MixTrack | null = null;
    let bestScore = -1;
    for (const t of pool) {
      if (used.has(t.id)) continue;
      const s = matchScore(cur, t).score + (t.bpm >= cur.bpm ? 0.05 : 0);
      if (s > bestScore) [best, bestScore] = [t, s];
    }
    if (!best) break;
    if (bridges.length && (keyMatch(cur.key, best.key) < 0.8 || tempoGap(cur.bpm, best.bpm) > 3)) {
      out.push(LOOP_PREFIX + bridges[nextLoop++ % bridges.length].id);
    }
    used.add(best.id);
    out.push(best.id);
    cur = best;
  }
  return out;
}
