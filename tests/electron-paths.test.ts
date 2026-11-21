import { describe, expect, it } from 'vitest';
// @ts-ignore — CommonJS module shared with the Electron main process
import { isAudioPath, isInside, mayRead, posix, win32 } from '../electron/paths.cjs';

describe('desktop file-access rules', () => {
  const P = posix;
  const W = win32;

  it('recognises audio files only', () => {
    expect(isAudioPath('/music/a.MP3')).toBe(true);
    expect(isAudioPath('/music/a.flac')).toBe(true);
    expect(isAudioPath('/etc/passwd')).toBe(false);
    expect(isAudioPath('/music/cover.jpg')).toBe(false);
  });

  it('allows files inside granted folders (POSIX)', () => {
    expect(mayRead(['/home/dj/Music'], '/home/dj/Music/House/a.mp3', P)).toBe(true);
    expect(mayRead(['/home/dj/Music/one.wav'], '/home/dj/Music/one.wav', P)).toBe(true);
  });

  it('blocks traversal, siblings and non-audio files', () => {
    expect(mayRead(['/home/dj/Music'], '/home/dj/Music/../secret.mp3', P)).toBe(false);
    expect(mayRead(['/home/dj/Music'], '/home/dj/Music2/a.mp3', P)).toBe(false);
    expect(mayRead(['/home/dj/Music'], '/home/dj/Music/notes.txt', P)).toBe(false);
    expect(mayRead([], '/home/dj/Music/a.mp3', P)).toBe(false);
    expect(mayRead(['/home/dj/Music'], 42 as unknown as string, P)).toBe(false);
  });

  it('works with Windows paths', () => {
    expect(mayRead(['C:\\Users\\dj\\Music'], 'C:\\Users\\dj\\Music\\set\\a.mp3', W)).toBe(true);
    expect(mayRead(['C:\\Users\\dj\\Music'], 'D:\\Music\\a.mp3', W)).toBe(false);
    expect(isInside('C:\\Users\\dj\\Music', 'C:\\Users\\dj\\Music\\..\\x.mp3', W)).toBe(false);
  });
});
