import { describe, expect, it } from 'vitest';
import { extractArtwork } from '../src/library/artwork';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 9, 9]);
const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ss = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];

function id3(ver: 2 | 3 | 4, frames: number[][]): Uint8Array {
  const body = frames.flat();
  return new Uint8Array([...enc('ID3'), ver, 0, 0, ...ss(body.length + 10), ...body, ...new Array(10).fill(0), 0xff, 0xfb]);
}
function frame(ver: 3 | 4, id: string, body: number[]): number[] {
  return [...enc(id), ...(ver === 4 ? ss(body.length) : be32(body.length)), 0, 0, ...body];
}
const apic = (type: number, img: Uint8Array, utf16 = false) => [
  utf16 ? 1 : 0,
  ...enc('image/png'),
  0,
  type,
  ...(utf16 ? [0xff, 0xfe, 0x41, 0x00, 0x00, 0x00] : [...enc('cover'), 0]),
  ...img,
];

describe('extractArtwork', () => {
  it('reads ID3v2.3 APIC (front cover preferred over other pictures)', () => {
    const bytes = id3(3, [frame(3, 'TIT2', [0, ...enc('Song')]), frame(3, 'APIC', apic(0, JPG)), frame(3, 'APIC', apic(3, PNG))]);
    const art = extractArtwork(bytes)!;
    expect(art.mime).toBe('image/png');
    expect(Array.from(art.data)).toEqual(Array.from(PNG));
  });

  it('reads ID3v2.4 (synchsafe frame sizes) with a UTF-16 description', () => {
    const art = extractArtwork(id3(4, [frame(4, 'APIC', apic(3, JPG, true))]))!;
    expect(art.mime).toBe('image/jpeg');
    expect(Array.from(art.data)).toEqual(Array.from(JPG));
  });

  it('reads ID3v2.2 PIC frames', () => {
    const body = [0, ...enc('JPG'), 3, ...enc('x'), 0, ...JPG];
    const f = [...enc('PIC'), (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
    expect(Array.from(extractArtwork(id3(2, [f]))!.data)).toEqual(Array.from(JPG));
  });

  it('reads FLAC PICTURE blocks', () => {
    const mime = enc('image/png');
    const pic = [...be32(3), ...be32(mime.length), ...mime, ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(PNG.length), ...PNG];
    const streaminfo = [0x00, 0, 0, 34, ...new Array(34).fill(0)];
    const bytes = new Uint8Array([...enc('fLaC'), ...streaminfo, 0x86, (pic.length >> 16) & 255, (pic.length >> 8) & 255, pic.length & 255, ...pic]);
    expect(Array.from(extractArtwork(bytes)!.data)).toEqual(Array.from(PNG));
  });

  it('reads MP4/M4A covr atoms', () => {
    const box = (type: string, inner: number[]) => [...be32(inner.length + 8), ...enc(type), ...inner];
    const data = box('data', [0, 0, 0, 13, 0, 0, 0, 0, ...JPG]);
    const meta = [...be32(0), ...box('hdlr', new Array(25).fill(0)), ...box('ilst', box('covr', data))];
    const bytes = new Uint8Array([...box('ftyp', enc('M4A isom')), ...box('moov', box('udta', box('meta', meta)))]);
    expect(Array.from(extractArtwork(bytes)!.data)).toEqual(Array.from(JPG));
  });

  it('returns null for files without art and for garbage', () => {
    expect(extractArtwork(id3(3, [frame(3, 'TIT2', [0, ...enc('Song')])]))).toBeNull();
    expect(extractArtwork(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]))).toBeNull();
    expect(extractArtwork(new Uint8Array([...enc('ID3'), 3, 0, 0, 127, 127, 127, 127, 1, 2]))).toBeNull();
    expect(extractArtwork(new Uint8Array(0))).toBeNull();
  });
});
