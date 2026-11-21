import { describe, expect, it } from 'vitest';
import { formatDuration, isAudioFile, parseFileName, toCSV, toM3U, toText } from '../src/library/export';

const tracks = [
  { title: 'Song A', artist: 'Artist 1', bpm: 128, duration: 245.4, path: 'House/a.mp3' },
  { title: 'Song, "B"', artist: '', bpm: 0, duration: 61 },
];

describe('export', () => {
  it('formats durations', () => {
    expect(formatDuration(245.4)).toBe('4:05');
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('parses artist - title file names', () => {
    expect(parseFileName('Daft Punk - One More Time.mp3')).toEqual({ artist: 'Daft Punk', title: 'One More Time' });
    expect(parseFileName('just_a_title.wav')).toEqual({ artist: '', title: 'just a title' });
  });

  it('recognises audio files', () => {
    expect(isAudioFile('x.MP3')).toBe(true);
    expect(isAudioFile('cover.jpg')).toBe(false);
  });

  it('writes text, M3U and CSV setlists', () => {
    expect(toText('My Set', tracks)).toContain('01. Artist 1 - Song A  [128.0 BPM]');
    const m3u = toM3U(tracks);
    expect(m3u.startsWith('#EXTM3U\n#EXTINF:245,Artist 1 - Song A\nHouse/a.mp3\n')).toBe(true);
    const csv = toCSV(tracks);
    expect(csv).toContain('2,,"Song, ""B""",,1:01,');
  });
});
