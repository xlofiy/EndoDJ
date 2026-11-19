/** Tiny promise wrapper around IndexedDB for the EndoDJ library. */

export interface TrackRecord {
  id: string;
  fileName: string;
  title: string;
  artist: string;
  size: number;
  lastModified: number;
  duration: number;
  bpm: number;
  firstBeat: number;
  bpmConfidence: number;
  cuePoint: number;
  hotcues: (number | null)[];
  addedAt: number;
  playCount: number;
  lastPlayed: number;
  /** relative path inside the imported folder, if known */
  path: string;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface HistoryRecord {
  id?: number;
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  playedAt: number;
  sessionId: string;
  deck: number;
}

const DB_NAME = 'endodj';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class LibraryDB {
  private constructor(private db: IDBDatabase) {}

  static open(): Promise<LibraryDB> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('history')) {
          const h = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          h.createIndex('sessionId', 'sessionId');
        }
      };
      r.onsuccess = () => resolve(new LibraryDB(r.result));
      r.onerror = () => reject(r.error);
    });
  }

  private store(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  getAll<T>(store: string): Promise<T[]> {
    return req(this.store(store).getAll() as IDBRequest<T[]>);
  }

  get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return req(this.store(store).get(key) as IDBRequest<T | undefined>);
  }

  async put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
    await req(this.store(store, 'readwrite').put(value, key));
  }

  async delete(store: string, key: IDBValidKey): Promise<void> {
    await req(this.store(store, 'readwrite').delete(key));
  }

  async putMany(store: string, values: unknown[]): Promise<void> {
    if (!values.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      for (const v of values) s.put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async add(store: string, value: unknown): Promise<void> {
    await req(this.store(store, 'readwrite').add(value));
  }
}
