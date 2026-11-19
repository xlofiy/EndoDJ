/**
 * Music library: tracks, file access, playlists (setlists), play history.
 * Audio files themselves are never copied — we keep File System Access handles (Chrome/Edge)
 * or, for drag & drop / file-picker imports, in-memory File objects for this session.
 */
import { LibraryDB, type HistoryRecord, type PlaylistRecord, type TrackRecord } from './db';
import { isAudioFile, parseFileName, trackId } from './export';

type Listener = () => void;

// File System Access API typings that are not yet in TypeScript's DOM lib everywhere.
interface FSHandlePermission {
  queryPermission?(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' }): Promise<PermissionState>;
}
type DirHandle = FileSystemDirectoryHandle & FSHandlePermission & {
  values(): AsyncIterable<FileSystemHandle>;
};
type FileHandle = FileSystemFileHandle & FSHandlePermission;

/** API exposed by the desktop app's preload script (undefined in the browser). */
export interface NativeFile {
  path: string;
  name: string;
  size: number;
  lastModified: number;
  relativePath: string;
}
interface NativeAPI {
  platform: string;
  pickFolder(): Promise<{ root: string | null; files: NativeFile[] } | null>;
  pickFiles(): Promise<{ root: string | null; files: NativeFile[] } | null>;
  readFile(path: string): Promise<ArrayBuffer>;
}
export const native: NativeAPI | undefined = (window as unknown as { endodjNative?: NativeAPI }).endodjNative;

export const HISTORY_ID = '__history__';
export const AUTOMIX_ID = '__automix__';

export class Library {
  tracks = new Map<string, TrackRecord>();
  playlists: PlaylistRecord[] = [];
  history: HistoryRecord[] = [];
  readonly sessionId = new Date().toISOString();
  private memoryFiles = new Map<string, File>();
  private handles = new Map<string, FileHandle>();
  private listeners = new Set<Listener>();

  private constructor(private db: LibraryDB) {}

  static async open(): Promise<Library> {
    const lib = new Library(await LibraryDB.open());
    for (const t of await lib.db.getAll<TrackRecord>('tracks')) lib.tracks.set(t.id, t);
    lib.playlists = (await lib.db.getAll<PlaylistRecord>('playlists')).sort((a, b) => a.createdAt - b.createdAt);
    if (!lib.playlists.find((p) => p.id === AUTOMIX_ID)) {
      lib.playlists.unshift({ id: AUTOMIX_ID, name: 'Automix queue', trackIds: [], createdAt: 0 });
    }
    lib.history = await lib.db.getAll<HistoryRecord>('history');
    return lib;
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  static get canPickFolders(): boolean {
    return !!native || 'showDirectoryPicker' in window;
  }

  private newRecord(id: string, name: string, size: number, lastModified: number, path: string): TrackRecord {
    const { artist, title } = parseFileName(name);
    return {
      id,
      fileName: name,
      title,
      artist,
      size,
      lastModified,
      duration: 0,
      bpm: 0,
      firstBeat: 0,
      bpmConfidence: 0,
      cuePoint: 0,
      hotcues: [],
      addedAt: Date.now(),
      playCount: 0,
      lastPlayed: 0,
      path,
    };
  }

  /** Desktop app: add files picked in a native dialog (persist across restarts by path). */
  private async addNative(files: NativeFile[]): Promise<number> {
    const added: TrackRecord[] = [];
    for (const f of files) {
      const id = trackId(f.name, f.size, f.lastModified);
      const rec = this.tracks.get(id) ?? this.newRecord(id, f.name, f.size, f.lastModified, f.relativePath);
      rec.nativePath = f.path;
      this.tracks.set(id, rec);
      added.push(rec);
    }
    await this.db.putMany('tracks', added);
    this.emit();
    return added.length;
  }

  /** "Add files": native dialog in the desktop app; returns null in the browser (use <input>). */
  async importFilesNative(): Promise<number | null> {
    if (!native) return null;
    const res = await native.pickFiles();
    return res ? this.addNative(res.files) : 0;
  }

  // ------------------------------------------------------------------ importing

  private async addFile(file: File, path: string, handle?: FileHandle): Promise<TrackRecord> {
    const id = trackId(file.name, file.size, file.lastModified);
    let rec = this.tracks.get(id);
    if (!rec) {
      rec = this.newRecord(id, file.name, file.size, file.lastModified, path);
      this.tracks.set(id, rec);
    }
    if (handle) {
      this.handles.set(id, handle);
      await this.db.put('handles', handle, id);
    } else {
      this.memoryFiles.set(id, file);
    }
    return rec;
  }

  /** Import files from drag & drop or an <input type=file>. */
  async importFiles(files: Iterable<File>): Promise<number> {
    const added: TrackRecord[] = [];
    for (const f of files) {
      if (!isAudioFile(f.name)) continue;
      added.push(await this.addFile(f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name));
    }
    await this.db.putMany('tracks', added);
    this.emit();
    return added.length;
  }

  /** Import a whole folder (recursively) with the File System Access API. */
  async importFolder(): Promise<number> {
    if (native) {
      const res = await native.pickFolder();
      return res ? this.addNative(res.files) : 0;
    }
    const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
    const dir = await picker({ id: 'endodj-music', mode: 'read' });
    const added: TrackRecord[] = [];
    const walk = async (d: DirHandle, prefix: string) => {
      for await (const entry of d.values()) {
        if (entry.kind === 'directory') await walk(entry as DirHandle, `${prefix}${entry.name}/`);
        else if (isAudioFile(entry.name)) {
          const fh = entry as FileHandle;
          const file = await fh.getFile();
          added.push(await this.addFile(file, prefix + entry.name, fh));
        }
      }
    };
    await walk(dir, `${dir.name}/`);
    await this.db.putMany('tracks', added);
    this.emit();
    return added.length;
  }

  /** Is the audio for this track reachable right now (without a permission prompt)? */
  isAvailable(id: string): boolean {
    if (native && this.tracks.get(id)?.nativePath) return true;
    return this.memoryFiles.has(id) || this.handles.has(id) || this.storedHandleIds.has(id);
  }

  private storedHandleIds = new Set<string>();

  /** Load persisted file handles so tracks from earlier sessions can be played again. */
  async restoreHandles(): Promise<void> {
    for (const id of this.tracks.keys()) {
      const h = await this.db.get<FileHandle>('handles', id);
      if (h) {
        this.handles.set(id, h);
        this.storedHandleIds.add(id);
      }
    }
    this.emit();
  }

  /** Get the File for a track, asking for permission again if the browser requires it. */
  async getFile(id: string): Promise<File> {
    const mem = this.memoryFiles.get(id);
    if (mem) return mem;
    const rec = this.tracks.get(id);
    if (native && rec?.nativePath) {
      const buf = await native.readFile(rec.nativePath);
      return new File([buf], rec.fileName, { lastModified: rec.lastModified });
    }
    const h = this.handles.get(id);
    if (!h) throw new Error('The audio file for this track is not available. Re-import its folder.');
    if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) !== 'granted') {
      const p = await h.requestPermission?.({ mode: 'read' });
      if (p !== 'granted') throw new Error('Permission to read the file was denied.');
    }
    return h.getFile();
  }

  // ------------------------------------------------------------------ track updates

  async update(id: string, patch: Partial<TrackRecord>): Promise<void> {
    const t = this.tracks.get(id);
    if (!t) return;
    Object.assign(t, patch);
    await this.db.put('tracks', t);
    this.emit();
  }

  async removeTrack(id: string): Promise<void> {
    this.tracks.delete(id);
    this.memoryFiles.delete(id);
    this.handles.delete(id);
    await this.db.delete('tracks', id);
    await this.db.delete('handles', id);
    for (const p of this.playlists) {
      if (p.trackIds.includes(id)) {
        p.trackIds = p.trackIds.filter((t) => t !== id);
        await this.db.put('playlists', p);
      }
    }
    this.emit();
  }

  async logPlay(id: string, deck: number): Promise<void> {
    const t = this.tracks.get(id);
    if (!t) return;
    t.playCount++;
    t.lastPlayed = Date.now();
    await this.db.put('tracks', t);
    const h: HistoryRecord = {
      trackId: id,
      title: t.title,
      artist: t.artist,
      bpm: t.bpm,
      playedAt: t.lastPlayed,
      sessionId: this.sessionId,
      deck,
    };
    await this.db.add('history', h);
    this.history.push(h);
    this.emit();
  }

  sessionHistory(): HistoryRecord[] {
    return this.history.filter((h) => h.sessionId === this.sessionId);
  }

  // ------------------------------------------------------------------ playlists

  playlist(id: string): PlaylistRecord | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  async createPlaylist(name: string): Promise<PlaylistRecord> {
    const p: PlaylistRecord = { id: crypto.randomUUID(), name, trackIds: [], createdAt: Date.now() };
    this.playlists.push(p);
    await this.db.put('playlists', p);
    this.emit();
    return p;
  }

  async renamePlaylist(id: string, name: string): Promise<void> {
    const p = this.playlist(id);
    if (!p) return;
    p.name = name;
    await this.db.put('playlists', p);
    this.emit();
  }

  async deletePlaylist(id: string): Promise<void> {
    if (id === AUTOMIX_ID) return;
    this.playlists = this.playlists.filter((p) => p.id !== id);
    await this.db.delete('playlists', id);
    this.emit();
  }

  async addToPlaylist(id: string, trackIds: string[]): Promise<void> {
    const p = this.playlist(id);
    if (!p) return;
    p.trackIds.push(...trackIds);
    await this.db.put('playlists', p);
    this.emit();
  }

  async removeFromPlaylist(id: string, index: number): Promise<void> {
    const p = this.playlist(id);
    if (!p) return;
    p.trackIds.splice(index, 1);
    await this.db.put('playlists', p);
    this.emit();
  }

  async moveInPlaylist(id: string, from: number, to: number): Promise<void> {
    const p = this.playlist(id);
    if (!p || from === to || from < 0 || to < 0 || from >= p.trackIds.length || to >= p.trackIds.length) return;
    const [x] = p.trackIds.splice(from, 1);
    p.trackIds.splice(to, 0, x);
    await this.db.put('playlists', p);
    this.emit();
  }

  /** Remove and return the first track of a playlist (used by automix). */
  async shiftPlaylist(id: string): Promise<string | undefined> {
    const p = this.playlist(id);
    if (!p || !p.trackIds.length) return undefined;
    const t = p.trackIds.shift();
    await this.db.put('playlists', p);
    this.emit();
    return t;
  }
}
