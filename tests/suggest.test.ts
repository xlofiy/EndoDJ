import { describe, expect, it } from 'vitest';
import { buildSet, genreOf, keyMatch, loopsFor, matchScore, suggestTracks, tempoGap, LOOP_PREFIX } from '../src/app/suggest';
import type { LoopDef } from '../src/loops/catalog';

const t = (id: string, bpm: number, key: string | undefined, path: string) => ({ id, bpm, key, path });

describe('mix suggestions', () => {
  it('measures tempo distance including half / double time', () => {
    expect(tempoGap(128, 128)).toBe(0);
    expect(tempoGap(87, 174)).toBe(0);
    expect(tempoGap(128, 132)).toBeCloseTo(3.125);
    expect(tempoGap(0, 128)).toBe(Infinity);
  });

  it('rates keys on the Camelot wheel', () => {
    expect(keyMatch('Am', 'Am')).toBe(1);
    expect(keyMatch('Am', 'C')).toBe(0.85); // relative major
    expect(keyMatch('Am', 'Em')).toBe(0.8); // 8A → 9A
    expect(keyMatch('Am', 'Bm')).toBe(0.4); // 8A → 10A
    expect(keyMatch('Am', 'F#')).toBe(0);
    expect(keyMatch('Am', '')).toBe(0.3);
  });

  it('ranks the best mix first and explains why', () => {
    const seed = t('s', 128, 'Am', 'Music/House/a.mp3');
    const list = suggestTracks(seed, [
      t('clash', 128, 'F#', 'Music/Techno/b.mp3'),
      t('far', 100, 'Am', 'Music/Techno/c.mp3'), // key sync can fix a key, not a 22 % tempo jump
      t('best', 127, 'Em', 'Music/House/Deep/d.mp3'),
      t('s', 128, 'Am', 'Music/House/a.mp3'),
      t('unanalysed', 0, undefined, 'Music/House/e.mp3'),
    ]);
    expect(list.map((m) => m.id)).toEqual(['best', 'clash', 'far']);
    expect(matchScore(seed, t('best', 127, 'Em', 'Music/House/Deep/d.mp3')).reasons).toEqual([
      'tempo 0.8 % apart',
      'key mixes',
      'same folder',
    ]);
  });

  it('guesses the Loop Lab genre from folder names', () => {
    expect(genreOf('Song MP3s/Hardstyle/x.mp3')).toBe('Hardstyle');
    expect(genreOf('Song MP3s/Jersey Club/x.mp3')).toBe('Jersey Club');
    expect(genreOf('Song MP3s/Eurobeat/x.mp3')).toBe('Eurobeat');
    expect(genreOf('Song MP3s/House/Deep/x.mp3')).toBe('EDM');
    expect(genreOf('Song MP3s/Drum and Bass/x.mp3')).toBe('Rave');
    expect(genreOf('Song MP3s/Misc/x.mp3')).toBe(null);
    expect(genreOf('Techno.mp3')).toBe(null); // file names are not folders
  });

  it('builds a set that starts slow, never repeats and bridges key clashes with drum loops', () => {
    const tracks = [
      t('a', 124, 'Am', 'M/House/a.mp3'),
      t('b', 125, 'Em', 'M/House/b.mp3'),
      t('c', 126, 'Bm', 'M/House/c.mp3'),
      t('d', 128, 'F#', 'M/House/d.mp3'),
      t('slow', 120, 'Am', 'M/House/s.mp3'),
    ];
    const set = buildSet(tracks, 4, [], () => 0);
    expect(set[0]).toBe('slow');
    expect(set).toHaveLength(4);
    expect(new Set(set).size).toBe(4);
    const drums = { id: 'drum', name: 'D', genre: 'EDM', kind: 'drums', bpm: 128, bars: 2, steadyBeat: true } as LoopDef;
    const withLoops = buildSet(tracks, 5, [drums]);
    expect(withLoops.filter((x) => !x.startsWith(LOOP_PREFIX))).toHaveLength(5);
    expect(withLoops).toContain(LOOP_PREFIX + 'drum');
    expect(withLoops[0]).not.toContain(LOOP_PREFIX);
  });

  /** small seeded random generator so the tests are repeatable */
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('builds a different set on each press, from the same tracks', () => {
    const tracks = Array.from({ length: 12 }, (_, i) => t(`t${i}`, 124 + (i % 4), ['Am', 'Em', 'C', 'G'][i % 4], `M/House/${i}.mp3`));
    const sets = new Set([1, 2, 3, 4, 5, 6].map((seed) => buildSet(tracks, 6, [], seeded(seed)).join(',')));
    expect(sets.size).toBeGreaterThan(3);
    for (const s of sets) expect(new Set(s.split(',')).size).toBe(6);
  });

  it('alternates between two folders for a mixed set', () => {
    const tracks = [
      ...['h1', 'h2', 'h3'].map((id) => ({ ...t(id, 126, 'Am', `M/House/${id}.mp3`), group: 'M/House' })),
      ...['d1', 'd2', 'd3'].map((id) => ({ ...t(id, 128, 'Am', `M/Techno/${id}.mp3`), group: 'M/Techno' })),
    ];
    const set = buildSet(tracks, 6, [], seeded(7));
    const groups = set.map((id) => id[0]);
    for (let i = 1; i < groups.length; i++) expect(groups[i]).not.toBe(groups[i - 1]);
  });

  it('offers only loops of the genre that fit the key', () => {
    const l = (id: string, key?: string) => ({ id, name: id, genre: 'Techno', kind: key ? 'synth' : 'drums', bpm: 130, bars: 4, steadyBeat: true, key }) as LoopDef;
    const loops = [l('synthAm', 'Am'), l('synthF#', 'F#'), l('drums')];
    expect(loopsFor('Techno', 'Am', loops).map((x) => x.id)).toEqual(['drums', 'synthAm']);
    expect(loopsFor(null, 'Am', loops)).toEqual([]);
  });
});

describe('suggestions for two decks', () => {
  it('prefers the track that also fits the other deck, and never suggests the decks themselves', () => {
    const a = t('a', 128, 'Am', 'M/House/a.mp3');
    const b = t('b', 128, 'Em', 'M/House/b.mp3');
    const list = suggestTracks(a, [a, b, t('x', 128, 'Dm', 'M/House/x.mp3'), t('y', 128, 'Em', 'M/House/y.mp3')], 50, b);
    // Dm (7A) and Em (9A) both sit one step from Am (8A); only Em also fits deck B
    expect(list.map((m) => m.id)).toEqual(['y', 'x']);
  });
});
