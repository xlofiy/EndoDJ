import { describe, expect, it } from 'vitest';
import { folderTree, inFolder } from '../src/library/folders';

describe('folder tree', () => {
  it('lists every sub-folder with nested track counts, parents first', () => {
    const tree = folderTree([
      'Song MP3s/House/a.mp3',
      'Song MP3s/House/Deep/b.mp3',
      'Song MP3s/Dubstep/c.mp3',
      'Song MP3s/d.mp3',
      'single.mp3',
    ]);
    expect(tree.map((f) => [f.path, f.depth, f.count])).toEqual([
      ['Song MP3s', 0, 4],
      ['Song MP3s/Dubstep', 1, 1],
      ['Song MP3s/House', 1, 2],
      ['Song MP3s/House/Deep', 2, 1],
    ]);
  });

  it('matches tracks by folder prefix, not by similar names', () => {
    expect(inFolder('Song MP3s/House/Deep/b.mp3', 'Song MP3s/House')).toBe(true);
    expect(inFolder('Song MP3s/House Classics/x.mp3', 'Song MP3s/House')).toBe(false);
  });
});
