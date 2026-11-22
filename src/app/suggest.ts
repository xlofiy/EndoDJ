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

/**
 * Tracks that mix well after `seed`, best first. `also` (the track on the other deck) adds a
 * smaller share, so between equal matches the one that also fits the other deck wins.
 */
export function suggestTracks(seed: MixTrack, tracks: Iterable<MixTrack>, max = 50, also?: MixTrack): Match[] {
  const out: Match[] = [];
  for (const t of tracks) {
    if (t.id === seed.id || t.id === also?.id || !(t.bpm > 0)) continue;
    const m = matchScore(seed, t);
    if (also) m.score += 0.2 * matchScore(also, t).score;
    out.push(m);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}

// keyword → Loop Lab genre; checked in order, so specific names come first
const GENRE_WORDS: [Genre, RegExp][] = [
  ['Eurobeat', /euro ?beat|para ?para|initial ?d/],
  ['Aero', /aero|frutiger|vapou?r ?wave|chill ?wave|lo-?fi|ambient/],
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
 * Auto-set: start with one of the slowest tracks (warm-up), then keep picking a well-matching
 * unused track, preferring a steady or rising tempo. Each build picks randomly among the near-best
 * candidates, so pressing Build again gives a new set. Tracks with a `group` (the folder they were
 * picked from) alternate between groups when there are two, for a mixed set.
 * With `loops`, a drum loop of the genre is queued as a layer (no deck) over the next song: always
 * where key or tempo do not match well, otherwise before every other track.
 */
export function buildSet(
  tracks: (MixTrack & { group?: string })[],
  length: number,
  loops: LoopDef[] = [],
  rng: () => number = Math.random,
): string[] {
  const pool = tracks.filter((t) => t.bpm > 0);
  if (!pool.length) return [];
  const pick = <T>(list: T[]) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const mixed = new Set(pool.map((t) => t.group)).size > 1;
  const slowest = [...pool].sort((a, b) => a.bpm - b.bpm).slice(0, Math.max(1, Math.ceil(pool.length / 4)));
  let cur = pick(slowest);
  const used = new Set([cur.id]);
  const out = [cur.id];
  const bridges = loops.filter((l) => !l.key);
  for (let count = 1; count < length; count++) {
    const scored = pool
      .filter((t) => !used.has(t.id))
      .map((t) => ({
        t,
        s: matchScore(cur, t).score + (t.bpm >= cur.bpm ? 0.05 : 0) + (mixed && t.group !== cur.group ? 0.4 : 0),
      }))
      .sort((a, b) => b.s - a.s);
    if (!scored.length) break;
    // near-best candidates (within 0.08 of the best, at most 4) are equally good mixes
    const best = pick(scored.filter((x, i) => i < 4 && x.s >= scored[0].s - 0.08)).t;
    const clash = keyMatch(cur.key, best.key) < 0.8 || tempoGap(cur.bpm, best.bpm) > 3;
    if (bridges.length && (clash || count % 2 === 0)) out.push(LOOP_PREFIX + pick(bridges).id);
    used.add(best.id);
    out.push(best.id);
    cur = best;
  }
  return out;
}
