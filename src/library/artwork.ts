/**
 * Embedded cover art: MP3 (ID3v2.2 / 2.3 / 2.4 APIC/PIC), FLAC (PICTURE block) and
 * MP4/M4A (covr atom). Pure byte parsing — runs anywhere and is unit-tested.
 *
 * shortcut: Ogg Vorbis/Opus pictures (base64 METADATA_BLOCK_PICTURE comments) are not read;
 * add them if users ask.
 */

export interface Artwork {
  mime: string;
  data: Uint8Array;
}

const FRONT_COVER = 3;

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n && at + i < b.length; i++) s += String.fromCharCode(b[at + i]);
  return s;
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function synchsafe(b: Uint8Array, at: number): number {
  return ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);
}

/** Undo ID3 unsynchronisation (0xFF 0x00 → 0xFF). */
function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

/** Index just after a text terminator (1 byte for Latin-1/UTF-8, 2 aligned bytes for UTF-16). */
function skipText(b: Uint8Array, at: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = at; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
    return b.length;
  }
  const i = b.indexOf(0, at);
  return i < 0 ? b.length : i + 1;
}

function sniffMime(data: Uint8Array, declared: string): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  const d = declared.toLowerCase();
  if (d === 'png' || d.includes('png')) return 'image/png';
  return 'image/jpeg';
}

/** Walk the frames of an ID3v2 tag; `fn` gets each frame id and its (decoded) body. Return true to stop. */
function id3Frames(b: Uint8Array, fn: (id: string, body: Uint8Array) => boolean | void): void {
  const ver = b[3];
  const flags = b[5];
  const size = synchsafe(b, 6);
  let tag = b.subarray(10, Math.min(b.length, 10 + size));
  if (ver < 4 && flags & 0x80) tag = deunsync(tag); // whole-tag unsynchronisation (v2.2 / 2.3)
  let pos = 0;
  if (ver === 3 && flags & 0x40) pos = 4 + u32(tag, 0); // extended header
  if (ver === 4 && flags & 0x40) pos = synchsafe(tag, 0);
  const idLen = ver === 2 ? 3 : 4;
  const headLen = ver === 2 ? 6 : 10;
  while (pos + headLen <= tag.length) {
    const id = ascii(tag, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const fsize =
      ver === 2 ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5] : ver === 4 ? synchsafe(tag, pos + 4) : u32(tag, pos + 4);
    const fflags = ver === 2 ? 0 : (tag[pos + 8] << 8) | tag[pos + 9];
    let body = tag.subarray(pos + headLen, pos + headLen + fsize);
    pos += headLen + fsize;
    if (ver === 4) {
      if (fflags & 0x0001) body = body.subarray(4); // data length indicator
      if (fflags & 0x0002) body = deunsync(body);
    }
    if (fn(id, body)) return;
  }
}

function id3(b: Uint8Array): Artwork | null {
  let best: Artwork | null = null;
  let front: Artwork | null = null;
  id3Frames(b, (id, body) => {
    if (id !== 'APIC' && id !== 'PIC') return;
    const enc = body[0];
    let p = 1;
    let mime: string;
    if (id === 'PIC') {
      mime = ascii(body, 1, 3);
      p = 4;
    } else {
      const end = body.indexOf(0, 1);
      if (end < 0) return;
      mime = ascii(body, 1, end - 1);
      p = end + 1;
    }
    const type = body[p];
    p = skipText(body, p + 1, enc);
    const data = body.subarray(p);
    if (data.length < 8) return;
    const art = { mime: sniffMime(data, mime), data };
    if (type === FRONT_COVER) {
      front = art;
      return true;
    }
    best ??= art;
  });
  return front ?? best;
}

function flac(b: Uint8Array): Artwork | null {
  let pos = 4;
  let best: Artwork | null = null;
  while (pos + 4 <= b.length) {
    const head = b[pos];
    const len = (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3];
    const start = pos + 4;
    if ((head & 0x7f) === 6) {
      const type = u32(b, start);
      const mimeLen = u32(b, start + 4);
      const mime = ascii(b, start + 8, mimeLen);
      const descLen = u32(b, start + 8 + mimeLen);
      const dataAt = start + 8 + mimeLen + 4 + descLen + 16;
      const dataLen = u32(b, dataAt);
      const data = b.subarray(dataAt + 4, dataAt + 4 + dataLen);
      const art = { mime: sniffMime(data, mime), data };
      if (type === FRONT_COVER) return art;
      best ??= art;
    }
    if (head & 0x80) break; // last metadata block
    pos = start + len;
  }
  return best;
}

/** Payload of the MP4 box at `path` (e.g. moov > udta > meta > ilst > covr > data), or null. */
function mp4Box(b: Uint8Array, path: string[]): Uint8Array | null {
  const find = (from: number, to: number, depth: number): Uint8Array | null => {
    let pos = from;
    while (pos + 8 <= to) {
      let size = u32(b, pos);
      const type = ascii(b, pos + 4, 4);
      let header = 8;
      if (size === 1) {
        size = u32(b, pos + 8) * 2 ** 32 + u32(b, pos + 12);
        header = 16;
      } else if (size === 0) size = to - pos;
      if (size < header) return null;
      if (type === path[depth]) {
        if (depth === path.length - 1) return b.subarray(pos + header, pos + size);
        const inner = type === 'meta' ? pos + header + 4 : pos + header; // meta is a full box
        return find(inner, pos + size, depth + 1);
      }
      pos += size;
    }
    return null;
  };
  return find(0, b.length, 0);
}

function mp4(b: Uint8Array): Artwork | null {
  const box = mp4Box(b, ['moov', 'udta', 'meta', 'ilst', 'covr', 'data']);
  const data = box?.subarray(8); // 8 bytes: type indicator + locale
  return data && data.length >= 8 ? { mime: sniffMime(data, ''), data } : null;
}

/** Embedded cover art of an audio file, or null. Never throws on malformed input. */
export function extractArtwork(bytes: Uint8Array): Artwork | null {
  try {
    if (ascii(bytes, 0, 3) === 'ID3') return id3(bytes);
    if (ascii(bytes, 0, 4) === 'fLaC') return flac(bytes);
    if (ascii(bytes, 4, 4) === 'ftyp') return mp4(bytes);
  } catch {
    /* malformed tag: no artwork */
  }
  return null;
}

// ------------------------------------------------------------------ title / artist

export interface Tags {
  title?: string;
  artist?: string;
}

function decodeText(b: Uint8Array, encoding: number): string {
  let label = 'latin1';
  if (encoding === 1) label = b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-16le';
  else if (encoding === 2) label = 'utf-16be';
  else if (encoding === 3) label = 'utf-8';
  const bom = encoding === 1 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) ? 2 : 0;
  // several values are separated by NUL: keep the first, joined artists read better with " & "
  return new TextDecoder(label).decode(b.subarray(bom)).split('\0').filter(Boolean).join(' & ').trim();
}

function le32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

/** Title and artist from ID3v2 (TIT2/TPE1, v2.2 TT2/TP1), FLAC Vorbis comments or MP4 (©nam/©ART). Never throws. */
export function extractTags(bytes: Uint8Array): Tags {
  const tags: Tags = {};
  try {
    if (ascii(bytes, 0, 3) === 'ID3') {
      id3Frames(bytes, (id, body) => {
        if (id === 'TIT2' || id === 'TT2') tags.title ||= decodeText(body.subarray(1), body[0]);
        if (id === 'TPE1' || id === 'TP1') tags.artist ||= decodeText(body.subarray(1), body[0]);
      });
    } else if (ascii(bytes, 0, 4) === 'fLaC') {
      let pos = 4;
      while (pos + 4 <= bytes.length) {
        const head = bytes[pos];
        const len = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        if ((head & 0x7f) === 4) {
          let p = pos + 4;
          p += 4 + le32(bytes, p); // vendor string
          const count = le32(bytes, p);
          p += 4;
          for (let i = 0; i < count && p + 4 <= bytes.length; i++) {
            const n = le32(bytes, p);
            const c = new TextDecoder().decode(bytes.subarray(p + 4, p + 4 + n));
            p += 4 + n;
            const eq = c.indexOf('=');
            const key = c.slice(0, eq).toUpperCase();
            if (key === 'TITLE') tags.title ||= c.slice(eq + 1).trim();
            if (key === 'ARTIST') tags.artist ||= c.slice(eq + 1).trim();
          }
        }
        if (head & 0x80) break;
        pos += 4 + len;
      }
    } else if (ascii(bytes, 4, 4) === 'ftyp') {
      const text = (atom: string) => {
        const box = mp4Box(bytes, ['moov', 'udta', 'meta', 'ilst', atom, 'data']);
        return box ? new TextDecoder().decode(box.subarray(8)).trim() : undefined;
      };
      tags.title = text('\xa9nam') || undefined;
      tags.artist = text('\xa9ART') || undefined;
    }
  } catch {
    /* malformed tag: keep what was read */
  }
  return tags;
}
