/** Setlist / playlist export formats (pure). */

export interface ExportTrack {
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  path?: string;
  playedAt?: number;
}

export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function label(t: ExportTrack): string {
  return t.artist ? `${t.artist} - ${t.title}` : t.title;
}

export function toText(name: string, tracks: ExportTrack[]): string {
  const lines = [name, '='.repeat(Math.max(3, name.length)), ''];
  tracks.forEach((t, i) => {
    const time = t.playedAt ? new Date(t.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '  ' : '';
    const bpm = t.bpm ? `  [${t.bpm.toFixed(1)} BPM]` : '';
    lines.push(`${String(i + 1).padStart(2, '0')}. ${time}${label(t)}${bpm}`);
  });
  return lines.join('\n') + '\n';
}

export function toM3U(tracks: ExportTrack[]): string {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    lines.push(`#EXTINF:${Math.round(t.duration)},${label(t)}`);
    lines.push(t.path || `${label(t)}`);
  }
  return lines.join('\n') + '\n';
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(tracks: ExportTrack[]): string {
  const rows = [['#', 'Artist', 'Title', 'BPM', 'Duration', 'Played at']];
  tracks.forEach((t, i) =>
    rows.push([
      String(i + 1),
      t.artist,
      t.title,
      t.bpm ? t.bpm.toFixed(2) : '',
      formatDuration(t.duration),
      t.playedAt ? new Date(t.playedAt).toISOString() : '',
    ]),
  );
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "Artist - Title.mp3" → { artist, title } */
export function parseFileName(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'mp4', 'webm', 'aif', 'aiff'];

export function isAudioFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.includes(ext);
}

export function trackId(name: string, size: number, lastModified: number): string {
  return `${name}|${size}|${lastModified}`;
}
