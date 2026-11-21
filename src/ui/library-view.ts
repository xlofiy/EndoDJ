/**
 * Library browser: sidebar, virtualised track table (only visible rows are in the DOM, so
 * libraries with tens of thousands of tracks stay smooth) and the Loop Lab view.
 */
import type { App } from '../app/app';
import { findLoop, GENRES, LOOPS, loopLengthSeconds, type Genre } from '../loops/catalog';
import { buildSet, genreOf, loopsFor, LOOP_PREFIX, suggestTracks, type Match, type MixTrack } from '../app/suggest';
import { camelot, parseKey } from '../audio/key';
import type { TrackRecord } from '../library/db';
import { formatDuration, toCSV, toM3U, toText, type ExportTrack } from '../library/export';
import { AUTOMIX_ID, HISTORY_ID, Library } from '../library/library';
import { folderTree, inFolder, type Folder } from '../library/folders';

export const LOOPLAB_VIEW = '__looplab__';
/** view id prefix for a music sub-folder */
const FOLDER = 'folder:';

const mixTrack = (r: TrackRecord): MixTrack => ({ id: r.id, bpm: r.bpm, key: r.key, path: r.path });

/** A Loop Lab layer in the Automix queue (plays over the transition into the next track), shown like a track. */
function loopRecord(id: string): TrackRecord | undefined {
  const def = id.startsWith(LOOP_PREFIX) ? findLoop(id.slice(LOOP_PREFIX.length)) : undefined;
  if (!def) return undefined;
  const length = loopLengthSeconds(def);
  return { id, fileName: def.name, title: def.name, artist: `${def.genre} · Loop Lab layer over the next mix`, bpm: def.bpm, key: def.key, duration: length, playCount: 0, path: '' } as TrackRecord;
}
const MY_LOOPS_NAME = 'My Loops';
const ROW_H = 26;
const OVERSCAN = 12;

const GENRE_COLORS: Record<Genre, string> = {
  EDM: '#0d8fd6',
  Rave: '#d98a00',
  Techno: '#4c5fc7',
  Eurobeat: '#e0368c',
  Aero: '#22b8c9',
  Hardstyle: '#c62f3a',
  'Jersey Club': '#1d9e6a',
  Scene: '#d13b8f',
  Breakcore: '#d9542b',
  Hyperpop: '#8a4fd8',
  FX: '#5d7591',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "Am" → "8A Am" */
function keyCell(key: string | undefined): string {
  const k = parseKey(key);
  return k ? `${camelot(k)} ${esc(key!)}` : '';
}

export function download(name: string, content: string | Blob, type = 'text/plain'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

interface Row {
  id: string;
  rec: TrackRecord;
  index: number;
  playedAt?: number;
}

const el = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

export class LibraryView {
  view = 'all';
  private search = '';
  private sortKey: keyof TrackRecord = 'addedAt';
  private sortDir = -1;
  private rows: Row[] = [];
  private renderedRange = '';
  private scheduled = false;
  private genre: Genre | 'All' = 'All';
  /** Automix view tab */
  private amTab: 'queue' | 'suggest' = 'queue';
  /** Suggestions: deck the user picked to match (null = automatic), the track matched, and why each row matches */
  private seedDeck: number | null = null;
  private seedId: string | null = null;
  private matches = new Map<string, Match>();

  private wrap = el('#lib-table-wrap');
  private tbody = el('#lib-table tbody');

  constructor(
    private app: App,
    private toast: (m: string, e?: boolean) => void,
  ) {}

  /** Suggestions tab of the Automix view */
  private get suggesting(): boolean {
    return this.view === AUTOMIX_ID && this.amTab === 'suggest';
  }

  /** "All tracks" and folders are sortable lists; playlists keep their order */
  private get sortable(): boolean {
    return this.view === 'all' || this.view.startsWith(FOLDER);
  }

  get rowIds(): string[] {
    return this.rows.map((r) => r.id);
  }

  private lastRescan = 0;

  /** Pick up new files / sub-folders in the music folders (start-up, window focus, ⟳ button). */
  async rescan(manual = false): Promise<void> {
    if (!manual && Date.now() - this.lastRescan < 20000) return;
    this.lastRescan = Date.now();
    try {
      const n = await this.app.library.rescan();
      if (n || manual) this.toast(n ? `Found ${n} new or moved tracks.` : 'No new tracks.');
    } catch (e) {
      if (manual) this.toast(`Rescan failed: ${(e as Error).message}`, true);
    }
  }

  init(): void {
    const lib = this.app.library;
    window.setInterval(() => this.updateNext(), 500);
    el('#am-chip').onclick = () => {
      this.view = AUTOMIX_ID;
      this.amTab = 'queue';
      this.render();
    };
    void this.rescan();
    window.addEventListener('focus', () => void this.rescan());
    lib.on(() => this.schedule());
    this.app.automix.onChange = () => this.schedule();
    for (const d of this.app.engine.decks) {
      d.on(() => {
        if (this.suggesting && this.seed()?.id !== this.seedId) this.schedule();
      });
    }
    this.app.looplab.onChange = () => {
      if (this.view === LOOPLAB_VIEW) this.renderLoopLab();
    };

    const search = el<HTMLInputElement>('#lib-search');
    search.oninput = () => {
      this.search = search.value.trim().toLowerCase();
      this.schedule();
    };
    const folderBtn = el('#add-folder-btn');
    if (!Library.canPickFolders) folderBtn.title = 'Needs Chrome, Edge or the desktop app — use "Add files" instead';
    folderBtn.onclick = async () => {
      try {
        const n = await lib.importFolder();
        this.toast(`Added ${n} tracks.`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') this.toast(`Import failed: ${(e as Error).message}`, true);
      }
    };
    const fileInput = el<HTMLInputElement>('#file-input');
    el('#add-files-btn').onclick = async () => {
      const n = await lib.importFilesNative(); // desktop app: native dialog, remembered by path
      if (n === null) fileInput.click();
      else if (n > 0) this.toast(`Added ${n} tracks.`);
    };
    fileInput.onchange = async () => {
      if (fileInput.files) {
        const n = await lib.importFiles(Array.from(fileInput.files));
        this.toast(`Added ${n} tracks.`);
      }
      fileInput.value = '';
    };
    const status = el('#lib-status');
    this.app.onAnalysis = (d, t) => (status.textContent = d < t ? `Analysing BPM & key ${d + 1}/${t}…` : '');

    // drag & drop files into the library
    const wrap = this.wrap;
    wrap.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        wrap.classList.add('dragover');
      }
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
    wrap.addEventListener('drop', async (e) => {
      wrap.classList.remove('dragover');
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      const n = await lib.importFiles(Array.from(e.dataTransfer.files));
      this.toast(`Added ${n} tracks.`);
    });

    // virtual scrolling: re-render the visible slice on scroll / resize
    wrap.addEventListener('scroll', () => this.renderRows(), { passive: true });
    new ResizeObserver(() => this.renderRows()).observe(wrap);

    // one delegated listener set for all rows
    this.tbody.addEventListener('click', (e) => this.onRowClick(e));
    this.tbody.addEventListener('dblclick', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.id || (e.target as HTMLElement).tagName === 'BUTTON') return;
      this.select(tr.dataset.id);
      this.app.loadSelectedToFreeDeck();
    });
    this.tbody.addEventListener('dragstart', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.id || !e.dataTransfer) return;
      e.dataTransfer.setData('application/x-endodj-track', tr.dataset.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    el('#lib-table thead').addEventListener('click', (e) => {
      const th = (e.target as HTMLElement).closest<HTMLElement>('th[data-sort]');
      if (!th || !this.sortable) return;
      const k = th.dataset.sort as keyof TrackRecord;
      if (this.sortKey === k) this.sortDir = -this.sortDir;
      else {
        this.sortKey = k;
        this.sortDir = 1;
      }
      this.render();
    });

    this.render();
  }

  /** Coalesce bursts of library changes (e.g. batch analysis) into one render per frame. */
  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  render(): void {
    this.renderSidebar();
    this.renderToolbar();
    this.renderSubbar();
    const isLoopLab = this.view === LOOPLAB_VIEW;
    el('#lib-table-wrap').hidden = isLoopLab;
    el('#looplab').hidden = !isLoopLab;
    el<HTMLInputElement>('#lib-search').placeholder = isLoopLab ? 'Search loops…' : 'Search title, artist, BPM…';
    if (isLoopLab) {
      this.renderLoopLab();
      return;
    }
    this.rows = this.computeRows();
    this.renderHead();
    this.renderedRange = '';
    this.renderRows();
    const lib = this.app.library;
    el('#lib-empty').textContent = this.rows.length
      ? ''
      : this.sortable
        ? lib.tracks.size
          ? 'No tracks match your search.'
          : 'Your library is empty. Click "Add folder" or "Add files", or drop audio files here. Want loops? Open Loop Lab on the left.'
        : this.suggesting
          ? ''
          : 'Nothing here yet. Drag tracks from "All tracks" onto a playlist in the sidebar.';
  }

  // ------------------------------------------------------------------ sidebar & toolbar

  private renderSidebar(): void {
    const lib = this.app.library;
    const side = el('#lib-sidebar');
    const item = (id: string, name: string, count: number | string, droppable: boolean, depth = 0) =>
      `<div class="item ${this.view === id ? 'active' : ''}" data-view="${esc(id)}" ${droppable ? 'data-drop="1"' : ''}${depth ? ` style="padding-left:${10 + depth * 12}px"` : ''}>
        <span>${esc(name)}</span><span class="count">${count}</span></div>`;
    // top two levels always; deeper folders open below the selected folder
    const open = this.view.startsWith(FOLDER) ? this.view.slice(FOLDER.length) : '';
    const folders = folderTree([...lib.tracks.values()].map((t) => t.path)).filter(
      (f) => f.depth < 2 || open === f.path.slice(0, f.path.lastIndexOf('/')) || inFolder(open, f.path.slice(0, f.path.lastIndexOf('/'))),
    );
    side.innerHTML =
      item('all', 'All tracks', lib.tracks.size, false) +
      item(LOOPLAB_VIEW, 'Loop Lab', LOOPS.length, false) +
      item(HISTORY_ID, 'History', lib.sessionHistory().length, false) +
      (folders.length ? '<div class="label group folders-head">Folders<button id="rescan" title="Look for new files and sub-folders">⟳</button></div>' : '') +
      folders.map((f) => item(FOLDER + f.path, f.name, f.count, false, f.depth)).join('') +
      '<div class="label group">Playlists</div>' +
      lib.playlists
        .map((p) => item(p.id, p.id === AUTOMIX_ID && this.app.automix.enabled ? `${p.name} · on` : p.name, p.trackIds.length, true))
        .join('') +
      '<div class="item muted" id="new-playlist"><span>+ New playlist</span></div>';
    side.querySelectorAll<HTMLElement>('[data-view]').forEach((it) => {
      const id = it.dataset.view!;
      it.onclick = () => {
        this.view = id;
        if (id !== LOOPLAB_VIEW) this.app.looplab.stopPreview();
        this.render();
      };
      if (it.dataset.drop) {
        it.addEventListener('dragover', (e) => {
          if (e.dataTransfer?.types.includes('application/x-endodj-track')) {
            e.preventDefault();
            it.classList.add('drop');
          }
        });
        it.addEventListener('dragleave', () => it.classList.remove('drop'));
        it.addEventListener('drop', (e) => {
          it.classList.remove('drop');
          const tid = e.dataTransfer?.getData('application/x-endodj-track');
          if (tid) {
            e.preventDefault();
            void lib.addToPlaylist(id, [tid]);
          }
        });
      }
      if (lib.playlist(id) && id !== AUTOMIX_ID) {
        it.ondblclick = () => {
          const name = prompt('Rename playlist', lib.playlist(id)?.name);
          if (name) void lib.renamePlaylist(id, name);
        };
      }
    });
    side.querySelector<HTMLButtonElement>('#rescan')?.addEventListener('click', () => void this.rescan(true));
    el('#new-playlist').onclick = async () => {
      const name = prompt('Playlist name', `Set ${new Date().toLocaleDateString()}`);
      if (name) {
        const p = await lib.createPlaylist(name);
        this.view = p.id;
        this.render();
      }
    };
  }

  /**
   * Track to suggest a follow-up for: the deck the user picked, else the deck that is playing (the
   * louder one if both), else whatever is loaded on A, then B; else the selected library track.
   */
  private seed(): { id: string; deck: number | null } | null {
    const lib = this.app.library;
    const eng = this.app.engine;
    const onDeck = (i: number) => {
      const id = eng.decks[i].track?.id;
      return id && lib.tracks.has(id) ? id : null;
    };
    if (this.seedDeck !== null && onDeck(this.seedDeck)) return { id: onDeck(this.seedDeck)!, deck: this.seedDeck };
    const playing = eng.decks.filter((d) => d.playing && onDeck(d.index));
    playing.sort((a, b) => eng.strips[b.index].values.volume - eng.strips[a.index].values.volume);
    const deck = playing[0]?.index ?? (onDeck(0) ? 0 : onDeck(1) ? 1 : null);
    if (deck !== null) return { id: onDeck(deck)!, deck };
    const sel = this.app.selectedTrackId;
    return sel && lib.tracks.has(sel) ? { id: sel, deck: null } : null;
  }

  /** Second toolbar row: Automix controls + Auto-set (Automix queue), seed + fitting loops (Suggestions). */
  private renderSubbar(): void {
    const bar = el('#lib-subbar');
    const lib = this.app.library;
    bar.hidden = this.view !== AUTOMIX_ID;
    if (this.view !== AUTOMIX_ID) return;
    const am = this.app.automix;
    const queueLen = lib.queueRemaining(AUTOMIX_ID);
    const queueTotal = lib.playlist(AUTOMIX_ID)?.trackIds.length ?? 0;
    const saved = lib.playlists.filter((p) => p.id !== AUTOMIX_ID);
    let html = `
      <span class="tabs"><button data-tab="queue" class="${this.amTab === 'queue' ? 'on' : ''}" title="${queueLen} of ${queueTotal} still to play">Queue (${queueLen}/${queueTotal})</button><button data-tab="suggest" class="${this.amTab === 'suggest' ? 'on' : ''}" title="Tracks that mix well after what is on deck A / B">Suggestions</button></span>
      ${queueTotal > queueLen ? '<button id="am-top" title="Play the queue again from the first item">From the top</button>' : ''}
      <button id="am-toggle" class="chip ${am.enabled ? 'on' : ''}" title="Mix through this queue automatically: beat-matched crossfades before each track ends; tracks alternate between deck A and B">Automix ${am.enabled ? 'on' : 'off'}</button>
      <details class="am-settings" ${this.mixSettingsOpen ? 'open' : ''}><summary>Mix settings</summary>
        <label title="Layer songs: both songs play together for the whole blend (bass swapped halfway). Crossfade: a plain fade.">Style
          <select id="am-style"><option value="layer" ${am.settings.style === 'layer' ? 'selected' : ''}>Layer songs</option><option value="fade" ${am.settings.style === 'fade' ? 'selected' : ''}>Crossfade</option></select></label>
        ${
          am.settings.style === 'layer'
            ? `<label>Blend <select id="am-bars">${[8, 16, 32].map((b) => `<option value="${b}" ${am.settings.blendBars === b ? 'selected' : ''}>${b} bars</option>`).join('')}</select></label>`
            : `<label>Crossfade <input id="am-fade" type="number" min="2" max="60" step="1" value="${am.settings.fadeSeconds}" /> s</label>`
        }
        <label title="Shift the incoming track's key when it clashes with the playing one (key lock keeps the tempo)"><input id="am-harm" type="checkbox" ${am.settings.harmonic ? 'checked' : ''} /> Match keys</label>
        <label title="Play a drum loop of the genre over every mix: a third channel on top of the two songs"><input id="am-loopmix" type="checkbox" ${am.settings.loopEveryMix ? 'checked' : ''} /> Loop layer on every mix</label>
      </details>
      <span id="am-next" class="am-next"></span>
      <span class="sep"></span>
      <button id="am-save" title="Save the queue (tracks and layers) as a playlist">Save set</button>
      <select id="am-load" title="Put a saved set or playlist into the queue"><option value="">Load set…</option>${saved.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.trackIds.length})</option>`).join('')}</select>
      <span class="break"></span>`;
    if (this.amTab === 'queue') {
      const folders = folderTree([...lib.tracks.values()].map((t) => t.path)).filter((f) => f.depth < 3);
      const opt = (f: Folder, sel: string) => `<option value="${esc(f.path)}" ${f.path === sel ? 'selected' : ''}>${'  '.repeat(f.depth)}${esc(f.name)} (${f.count})</option>`;
      html += `
        <label title="Builds a set from tracks in this folder: starts slow, then picks the best tempo / key match each time">Auto-set from
          <select id="as-folder"><option value="">All tracks</option>${folders.map((f) => opt(f, this.setFolder)).join('')}</select></label>
        <label title="Mix in a second folder / genre: the set alternates between the two">mixed with
          <select id="as-folder2"><option value="">—</option>${folders.map((f) => opt(f, this.setFolder2)).join('')}</select></label>
        <label><input id="as-len" type="number" min="2" max="60" step="1" value="${this.setLength}" /> tracks</label>
        <label title="Play a drum loop of the folder's genre over transitions whose key or tempo do not match well"><input id="as-loops" type="checkbox" ${this.setLoops ? 'checked' : ''} /> Loop Lab layers</label>
        <button id="as-build" title="Fills the queue, puts track 1 on deck A and track 2 on deck B, saves the set and starts Automix">Build set &amp; play</button>`;
    } else {
      const seed = this.seed();
      const rec = seed ? lib.tracks.get(seed.id) : undefined;
      const deckBtn = (i: number) => {
        const t = this.app.engine.decks[i].track;
        const ok = t && lib.tracks.has(t.id);
        return `<button data-seed="${i}" class="${seed?.deck === i ? 'on' : ''}" ${ok ? '' : 'disabled'}>${i ? 'B' : 'A'}: ${ok ? esc(t!.title) : 'empty'}</button>`;
      };
      const genre = rec ? genreOf(rec.path) : null;
      const loops = rec ? loopsFor(genre, rec.key).slice(0, 6) : [];
      html += `<span class="muted">After</span>${deckBtn(0)}${deckBtn(1)}`;
      if (!rec) html += '<span class="muted">Load a track on deck A or B (or select one) to see what mixes well after it.</span>';
      else
        html += `<span class="sep"></span>${
          loops.length
            ? `<span class="muted">${genre} layers:</span>${loops
                .map((l) => `<span class="loop-chip" data-loop="${l.id}" title="Q: play this loop over the next transition">${esc(l.name)}<button data-q>Q</button></span>`)
                .join('')}`
            : `<span class="muted">${genre ? `No ${genre} loops fit this key.` : 'Put tracks in genre folders (e.g. Song MP3s/Techno) for loop layers.'}</span>`
        }`;
    }
    // re-rendered on every library change (e.g. each analysed track): keep the DOM (focus, open panel) when nothing changed
    if (html === this.subbarHtml) return;
    this.subbarHtml = html;
    bar.innerHTML = html;
    bar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.onclick = () => {
        this.amTab = b.dataset.tab as 'queue' | 'suggest';
        this.render();
      };
    });
    el('#am-toggle').onclick = () => (am.enabled ? am.setEnabled(false) : void this.startAutomix());
    const details = bar.querySelector<HTMLDetailsElement>('.am-settings')!;
    details.querySelector('summary')!.addEventListener('click', () => (this.mixSettingsOpen = !details.open));
    el<HTMLSelectElement>('#am-style').onchange = (e) => am.setSettings({ style: (e.target as HTMLSelectElement).value as 'fade' | 'layer' });
    bar.querySelector<HTMLSelectElement>('#am-bars')?.addEventListener('change', (e) => am.setSettings({ blendBars: parseInt((e.target as HTMLSelectElement).value, 10) }));
    bar.querySelector<HTMLInputElement>('#am-fade')?.addEventListener('change', (e) => {
      am.setSettings({ fadeSeconds: Math.max(2, Math.min(60, parseFloat((e.target as HTMLInputElement).value) || 12)) });
    });
    el<HTMLInputElement>('#am-harm').onchange = (e) => am.setSettings({ harmonic: (e.target as HTMLInputElement).checked });
    el<HTMLInputElement>('#am-loopmix').onchange = (e) => am.setSettings({ loopEveryMix: (e.target as HTMLInputElement).checked });
    this.updateNext();
    el('#am-save').onclick = () => void this.saveSet();
    bar.querySelector<HTMLButtonElement>('#am-top')?.addEventListener('click', () => void lib.setCursor(AUTOMIX_ID, 0));
    const load = el<HTMLSelectElement>('#am-load');
    load.onchange = () => void this.loadSet(load.value);
    bar.querySelectorAll<HTMLButtonElement>('[data-seed]').forEach((b) => {
      b.onclick = () => {
        this.seedDeck = parseInt(b.dataset.seed!, 10);
        this.render();
      };
    });
    bar.querySelectorAll<HTMLElement>('.loop-chip').forEach((chip) => {
      chip.querySelector<HTMLButtonElement>('[data-q]')!.onclick = () => {
        void lib.addToPlaylist(AUTOMIX_ID, [LOOP_PREFIX + chip.dataset.loop!]);
        this.toast('Layer added to the queue: it plays over the transition into the track after it.');
      };
    });
    if (this.amTab === 'queue') {
      const folder = el<HTMLSelectElement>('#as-folder');
      folder.onchange = () => (this.setFolder = folder.value);
      const folder2 = el<HTMLSelectElement>('#as-folder2');
      folder2.onchange = () => (this.setFolder2 = folder2.value);
      const len = el<HTMLInputElement>('#as-len');
      len.onchange = () => (this.setLength = Math.max(2, Math.min(60, parseInt(len.value, 10) || 8)));
      const loops = el<HTMLInputElement>('#as-loops');
      loops.onchange = () => (this.setLoops = loops.checked);
      el('#as-build').onclick = () => void this.autoSet(this.setFolder, this.setFolder2);
    }
  }

  /** Make queue item `index` the next one Automix loads (played items come back too). */
  private async playNext(index: number): Promise<void> {
    const lib = this.app.library;
    const cursor = lib.playlist(AUTOMIX_ID)?.cursor ?? 0;
    if (index < cursor) {
      await lib.moveInPlaylist(AUTOMIX_ID, index, cursor - 1);
      await lib.setCursor(AUTOMIX_ID, cursor - 1);
    } else await lib.moveInPlaylist(AUTOMIX_ID, index, cursor);
  }

  /** Automix on: a fresh start puts the first two queued tracks on A and B. */
  private async startAutomix(): Promise<void> {
    if (!(await this.app.automix.startQueue())) this.toast('The Automix queue is empty. Add tracks with Q, or build an Auto-set.', true);
  }

  private async saveSet(): Promise<void> {
    const lib = this.app.library;
    const ids = lib.playlist(AUTOMIX_ID)?.trackIds ?? [];
    if (!ids.length) return this.toast('The queue is empty.', true);
    const name = prompt('Save set as', `Set · ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    if (!name) return;
    const p = await lib.createPlaylist(name);
    await lib.addToPlaylist(p.id, [...ids]);
    this.toast(`Saved "${name}" (under Playlists).`);
  }

  private async loadSet(id: string): Promise<void> {
    const lib = this.app.library;
    const p = lib.playlist(id);
    if (!p) return;
    const queue = lib.playlist(AUTOMIX_ID)!;
    if (queue.trackIds.length && !confirm(`Replace the ${queue.trackIds.length} items in the queue with "${p.name}"?`)) return this.render();
    await lib.setPlaylist(AUTOMIX_ID, [...p.trackIds]);
    this.amTab = 'queue';
    this.toast(`"${p.name}" is in the queue. Switch Automix on to play it.`);
  }

  private mixSettingsOpen = false;
  private subbarHtml = '';

  /** "Next: … · mix in 0:42" in the Automix bar (called twice a second while the view is open) */
  updateNext(): void {
    const am = this.app.automix;
    const span = document.getElementById('am-next');
    const p = am.plan;
    let text = '';
    if (am.enabled && p) {
      const d = this.app.engine.decks[p.deck];
      const secs = (p.start - d.time) / Math.max(0.01, Math.abs(d.tempoFactor));
      const deck = p.deck ? 'A' : 'B';
      text =
        secs > 0
          ? `Next on ${deck}: ${p.next} · mix in ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
          : `Mixing into ${p.next} (${deck}) · ${Math.round(Math.min(1, (d.time - p.start) / Math.max(0.1, p.end - p.start)) * 100)} %`;
    } else if (am.enabled) text = 'Automix on';
    if (span && span.textContent !== text) span.textContent = text;
    // top-bar chip: visible from anywhere while Automix runs
    const chip = el('#am-chip');
    if (chip.hidden === am.enabled) chip.hidden = !am.enabled;
    const chipText = text.replace(/^Next on /, 'Automix · next on ').replace(/^Mixing/, 'Automix · mixing');
    if (am.enabled && chip.textContent !== chipText) chip.textContent = chipText;
  }

  private setFolder = '';
  private setFolder2 = '';
  private setLength = 8;
  private setLoops = true;

  /** Build a set from a folder, put it in the Automix queue and start Automix. */
  /** Build a new set (different on every press) from one folder, or alternating between two. */
  private async autoSet(folder: string, folder2: string): Promise<void> {
    const lib = this.app.library;
    const folders = folder2 && folder2 !== folder ? [folder, folder2] : [folder];
    const tracks = [...lib.tracks.values()].filter((t) => lib.isAvailable(t.id));
    const pool = folders.flatMap((f) => tracks.filter((t) => !f || inFolder(t.path, f)).map((t) => ({ ...mixTrack(t), group: f })));
    const seen = new Set<string>(); // a track in both folders counts once
    const unique = pool.filter((t) => !seen.has(t.id) && seen.add(t.id));
    const loops = this.setLoops ? folders.flatMap((f) => loopsFor(genreOf(`${f}/x`), undefined)) : [];
    const set = buildSet(unique, this.setLength, loops);
    if (!set.length) {
      this.toast('No analysed tracks there yet. Wait for the BPM analysis to finish (next to the search box).', true);
      return;
    }
    const queue = lib.playlist(AUTOMIX_ID)!;
    if (queue.trackIds.length && !confirm(`Replace the ${queue.trackIds.length} items in the Automix queue with the new set?`)) return;
    if (this.app.engine.decks.some((d) => d.playing) && !confirm('A deck is playing. The set will start on the other deck and mix in from what is playing. Continue?')) return;
    await lib.setPlaylist(AUTOMIX_ID, set);
    this.amTab = 'queue';
    const nLoops = set.filter((id) => id.startsWith(LOOP_PREFIX)).length;
    if (!(await this.app.automix.startQueue())) return this.toast('Could not load the set onto the decks.', true);
    this.toast(`Auto-set: ${set.length - nLoops} tracks${nLoops ? ` + ${nLoops} loop layers` : ''}, track 1 on A, track 2 on B. Save set keeps it.`);
  }

  private renderToolbar(): void {
    const lib = this.app.library;
    const exp = el('#lib-export');
    const playlist = lib.playlist(this.view);
    if (this.view === LOOPLAB_VIEW) {
      exp.innerHTML = '';
      return;
    }
    exp.innerHTML =
      !this.sortable
        ? `Export: <button data-exp="txt">TXT</button><button data-exp="m3u">M3U</button><button data-exp="csv">CSV</button>
         ${playlist && playlist.id !== AUTOMIX_ID ? '<button id="del-playlist">Delete playlist</button>' : ''}`
        : `<select id="add-to"><option value="">Add selected to…</option>${lib.playlists.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`;
    exp.querySelectorAll<HTMLButtonElement>('[data-exp]').forEach((b) => {
      b.onclick = () => this.exportCurrent(b.dataset.exp as 'txt' | 'm3u' | 'csv');
    });
    exp.querySelector('#del-playlist')?.addEventListener('click', () => {
      if (playlist && confirm(`Delete playlist "${playlist.name}"?`)) {
        void lib.deletePlaylist(playlist.id);
        this.view = 'all';
      }
    });
    const addTo = exp.querySelector<HTMLSelectElement>('#add-to');
    if (addTo)
      addTo.onchange = () => {
        if (addTo.value && this.app.selectedTrackId) {
          void lib.addToPlaylist(addTo.value, [this.app.selectedTrackId]);
          this.toast('Added to playlist.');
        } else if (addTo.value) this.toast('Select a track first.', true);
        addTo.value = '';
      };
  }

  // ------------------------------------------------------------------ track table

  private computeRows(): Row[] {
    const lib = this.app.library;
    let list: Row[];
    if (this.view === 'all') {
      list = [...lib.tracks.values()].map((rec, index) => ({ id: rec.id, rec, index }));
    } else if (this.suggesting) {
      const s = this.seed();
      this.seedId = s?.id ?? null;
      const seed = s ? lib.tracks.get(s.id) : undefined;
      const eng = this.app.engine;
      // the other deck's track counts a little too, so the pick fits both decks
      const otherId = s?.deck !== null && s ? eng.decks[1 - s.deck].track?.id : undefined;
      const other = otherId ? lib.tracks.get(otherId) : undefined;
      const exclude = new Set([
        ...eng.decks.map((d) => d.track?.id ?? ''),
        ...(lib.playlist(AUTOMIX_ID)?.trackIds ?? []),
        ...lib.sessionHistory().map((h) => h.trackId),
      ]);
      const pool = [...lib.tracks.values()].filter((t) => !exclude.has(t.id) && lib.isAvailable(t.id)).map(mixTrack);
      const matches = seed ? suggestTracks(mixTrack(seed), pool, 50, other && mixTrack(other)) : [];
      this.matches = new Map(matches.map((m) => [m.id, m]));
      list = matches.map((m, index) => ({ id: m.id, rec: lib.tracks.get(m.id)!, index }));
    } else if (this.view.startsWith(FOLDER)) {
      const f = this.view.slice(FOLDER.length);
      list = [...lib.tracks.values()].filter((rec) => inFolder(rec.path, f)).map((rec, index) => ({ id: rec.id, rec, index }));
    } else if (this.view === HISTORY_ID) {
      list = lib
        .sessionHistory()
        .map((h, index) => ({ id: h.trackId, rec: lib.tracks.get(h.trackId)!, index, playedAt: h.playedAt }))
        .filter((x) => x.rec);
    } else {
      list = (lib.playlist(this.view)?.trackIds ?? [])
        .map((id, index) => ({ id, rec: (lib.tracks.get(id) ?? loopRecord(id))!, index }))
        .filter((x) => x.rec);
    }
    if (this.search) {
      const q = this.search;
      list = list.filter(
        (x) =>
          x.rec.title.toLowerCase().includes(q) ||
          x.rec.artist.toLowerCase().includes(q) ||
          x.rec.fileName.toLowerCase().includes(q) ||
          (x.rec.bpm > 0 && x.rec.bpm.toFixed(0).startsWith(q)),
      );
    }
    if (this.sortable) {
      const k = this.sortKey;
      const dir = this.sortDir;
      // keys sort around the Camelot wheel (1A, 1B, 2A …), unknown keys last
      const val = (r: TrackRecord) => {
        if (k !== 'key') return r[k];
        const pk = parseKey(r.key);
        if (!pk) return 99;
        const c = camelot(pk);
        return parseInt(c, 10) + (c.endsWith('B') ? 0.5 : 0);
      };
      list.sort((a, b) => {
        const va = val(a.rec);
        const vb = val(b.rec);
        if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
        return ((va as number) - (vb as number)) * dir;
      });
    }
    return list;
  }

  private renderHead(): void {
    const sortable = (k: keyof TrackRecord, label: string, w: string) =>
      `<th data-sort="${k}" style="width:${w}">${label}${this.sortable && this.sortKey === k ? (this.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    el('#lib-table thead').innerHTML = `<tr><th style="width:64px">${this.view === HISTORY_ID ? 'Played' : '#'}</th>${sortable('title', 'Title', '38%')}${sortable('artist', 'Artist', '24%')}${sortable('bpm', 'BPM', '64px')}${sortable('key', 'Key', '72px')}${sortable('duration', 'Time', '60px')}${sortable('playCount', 'Plays', '54px')}<th style="width:${this.app.library.playlist(this.view) && !this.suggesting ? 190 : 140}px"></th></tr>`;
  }

  /** Render only the rows in (and just around) the viewport. */
  renderRows(force = false): void {
    if (this.view === LOOPLAB_VIEW) return;
    const n = this.rows.length;
    const top = this.wrap.scrollTop;
    const viewH = this.wrap.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    const last = Math.min(n, Math.ceil((top + viewH) / ROW_H) + OVERSCAN);
    const key = `${first}:${last}:${n}`;
    if (!force && key === this.renderedRange) return;
    this.renderedRange = key;
    const lib = this.app.library;
    const loaded = this.app.engine.decks.map((d) => d.track?.id);
    const inPlaylist = !!lib.playlist(this.view) && !this.suggesting;
    const queue = this.view === AUTOMIX_ID && !this.suggesting;
    const cursor = queue ? (lib.playlist(AUTOMIX_ID)?.cursor ?? 0) : -1;
    const parts: string[] = [`<tr class="spacer"><td colspan="8" style="height:${first * ROW_H}px"></td></tr>`];
    for (let i = first; i < last; i++) {
      const x = this.rows[i];
      const r = x.rec;
      const cls = [
        this.app.selectedTrackId === x.id ? 'selected' : '',
        lib.isAvailable(x.id) || x.id.startsWith(LOOP_PREFIX) ? '' : 'unavailable',
        loaded[0] === x.id ? 'loaded-0' : '',
        loaded[1] === x.id ? 'loaded-1' : '',
        queue && x.index < cursor ? 'played' : '',
        queue && x.index === cursor ? 'next' : '',
      ].join(' ');
      const why = this.suggesting ? this.matches.get(x.id)?.reasons.join(' · ') : '';
      const onDeck = queue && x.index < cursor ? loaded.indexOf(x.id) : -1;
      const firstCol = queue
        ? onDeck >= 0
          ? `${this.app.engine.decks[onDeck].playing ? '▶' : '●'} ${onDeck ? 'B' : 'A'}`
          : x.index < cursor
          ? '✓'
          : x.index === cursor
            ? 'NEXT'
            : String(x.index + 1)
        : x.playedAt ? new Date(x.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(i + 1);
      parts.push(`<tr class="${cls}" draggable="true" data-id="${esc(x.id)}" data-index="${x.index}">
        <td class="muted">${firstCol}</td><td title="${esc(r.fileName)}">${esc(r.title)}${why ? ` <small class="why">${esc(why)}</small>` : ''}</td><td>${esc(r.artist)}</td>
        <td class="mono">${r.bpm > 0 ? r.bpm.toFixed(1) : ''}</td><td class="mono">${keyCell(r.key)}</td><td class="mono">${r.duration ? formatDuration(r.duration) : ''}</td>
        <td class="mono">${r.playCount || ''}</td>
        <td><button data-load="0" title="Load to deck A">A</button><button data-load="1" title="Load to deck B">B</button><button data-queue title="Add to Automix queue">Q</button>${
          inPlaylist
            ? (queue ? '<button data-next title="Play next">⇥</button>' : '') +
              '<button data-up title="Move up">↑</button><button data-down title="Move down">↓</button><button data-remove title="Remove from playlist">✕</button>'
            : this.view === 'all'
              ? '<button data-delete title="Remove from library (the file stays on your disk)">✕</button>'
              : ''
        }</td></tr>`);
    }
    parts.push(`<tr class="spacer"><td colspan="8" style="height:${(n - last) * ROW_H}px"></td></tr>`);
    this.tbody.innerHTML = parts.join('');
  }

  private onRowClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const tr = t.closest('tr');
    const id = tr?.dataset.id;
    if (!tr || !id) return;
    const index = parseInt(tr.dataset.index!, 10);
    const lib = this.app.library;
    if (t.dataset.load !== undefined) void this.app.loadTrack(parseInt(t.dataset.load, 10), id);
    else if (t.dataset.queue !== undefined) {
      void lib.addToPlaylist(AUTOMIX_ID, [id]);
      this.toast('Added to Automix queue.');
    } else if (t.dataset.next !== undefined) void this.playNext(index);
    else if (t.dataset.up !== undefined) void lib.moveInPlaylist(this.view, index, index - 1);
    else if (t.dataset.down !== undefined) void lib.moveInPlaylist(this.view, index, index + 1);
    else if (t.dataset.remove !== undefined) void lib.removeFromPlaylist(this.view, index);
    else if (t.dataset.delete !== undefined) {
      const rec = lib.tracks.get(id);
      if (rec && confirm(`Remove "${rec.title}" from the library? Cue points and playlist entries are removed too; the file stays on your disk.`)) {
        void lib.removeTrack(id);
      }
    }
    else this.select(id);
  }

  select(id: string): void {
    this.app.selectedTrackId = id;
    this.renderRows(true);
  }

  /** Move the selection (controller browse encoder / arrow keys). */
  browse(delta: number): void {
    if (!this.rows.length || this.view === LOOPLAB_VIEW) return;
    const cur = this.app.selectedTrackId ? this.rows.findIndex((r) => r.id === this.app.selectedTrackId) : -1;
    const next = Math.max(0, Math.min(this.rows.length - 1, cur + delta));
    this.app.selectedTrackId = this.rows[next].id;
    // keep the selection in view
    const y = next * ROW_H;
    const headH = 26;
    if (y < this.wrap.scrollTop) this.wrap.scrollTop = y;
    else if (y + ROW_H > this.wrap.scrollTop + this.wrap.clientHeight - headH) this.wrap.scrollTop = y + ROW_H - this.wrap.clientHeight + headH;
    this.renderRows(true);
  }

  private exportCurrent(fmt: 'txt' | 'm3u' | 'csv'): void {
    const lib = this.app.library;
    const tracks: ExportTrack[] = this.rows.map((x) => ({
      title: x.rec.title,
      artist: x.rec.artist,
      bpm: x.rec.bpm,
      duration: x.rec.duration,
      path: x.rec.path,
      playedAt: x.playedAt,
    }));
    const name = this.view === HISTORY_ID ? `EndoDJ set ${new Date().toLocaleDateString()}` : (lib.playlist(this.view)?.name ?? 'Playlist');
    const file = name.replace(/[^\w\- ]+/g, '_');
    if (fmt === 'txt') download(`${file}.txt`, toText(name, tracks));
    else if (fmt === 'm3u') download(`${file}.m3u`, toM3U(tracks), 'audio/x-mpegurl');
    else download(`${file}.csv`, toCSV(tracks), 'text/csv');
  }

  // ------------------------------------------------------------------ Loop Lab

  private renderLoopLab(): void {
    const root = el('#looplab');
    const q = this.search;
    const loops = LOOPS.filter(
      (l) => (this.genre === 'All' || l.genre === this.genre) && (!q || `${l.name} ${l.genre} ${l.kind} ${l.bpm}`.toLowerCase().includes(q)),
    );
    const previewing = this.app.looplab.previewing;
    const slots = this.app.sampler.slots;
    const row = (l: (typeof LOOPS)[number]) => `
      <div class="ll-row ${previewing === l.id ? 'playing' : ''}" data-loop="${l.id}" draggable="true" title="Drag onto a pad above, or onto a deck">
        <button data-act="preview" class="pv" title="Preview in the headphones">${previewing === l.id ? '■' : '▶'}</button>
        <span class="name">${esc(l.name)}</span>
        <span class="meta">${l.kind === 'sfx' ? 'one-shot' : l.kind} · ${l.bpm > 0 ? `${l.bpm} BPM · ${l.bars} bars` : `${loopLengthSeconds(l).toFixed(1)} s`}${l.key ? ` · ${keyCell(l.key)}` : ''}</span>
        <span class="src">${l.credit ? `<a href="${esc(l.credit.url)}" target="_blank" rel="noopener noreferrer" title="CC0 — ${esc(l.credit.title)}">${esc(l.credit.author)} ↗</a>` : 'EndoDJ'}</span>
        <span class="acts"><button data-act="deck" data-deck="0" title="Load onto deck A">A</button><button data-act="deck" data-deck="1" title="Load onto deck B">B</button><button data-act="pad" title="Put on the next free sampler pad">+ Pad</button></span>
      </div>`;
    const sections = GENRES.map((g) => ({ g, list: loops.filter((l) => l.genre === g) })).filter((x) => x.list.length);
    root.innerHTML = `
      <div class="ll-head">
        <div class="genres">${(['All', ...GENRES] as const)
          .map((g) => `<button data-genre="${g}" class="${this.genre === g ? 'on' : ''}">${g === 'FX' ? 'FX' : g}</button>`)
          .join('')}<button id="import-loops" title="Import your own loop pack (WAV/MP3/…) into the playlist “${MY_LOOPS_NAME}”">＋ Import</button></div>
        <div class="ll-pads" title="Sampler pads: set a deck's PADS to Sampler to play them from the deck (or the controller)">
          <span class="label">PADS</span>${slots
            .map((sl, i) => `<button data-pad="${i}" class="${sl ? 'set' : ''}" title="${sl ? `Pad ${i + 1}: ${esc(sl.name)} — click to play` : `Pad ${i + 1}: empty — drop a loop here`}"><b>${i + 1}</b>${sl ? esc(sl.name) : ''}</button>`)
            .join('')}
        </div>
      </div>
      ${sections
        .map(
          ({ g, list }) => `<section><h4><i style="background:${GENRE_COLORS[g]}"></i>${g === 'FX' ? 'FX &amp; one-shots' : g}<span class="count">${list.length}</span></h4>${list.map(row).join('')}</section>`,
        )
        .join('')}
      <p class="note">Loops are CC0 (credited) or made by EndoDJ — free to use in mixes, streams and releases. Loaded on a deck they
        follow the playing deck's BPM and key.</p>`;
    root.querySelectorAll<HTMLButtonElement>('[data-genre]').forEach((b) => {
      b.onclick = () => {
        this.genre = b.dataset.genre as Genre | 'All';
        this.renderLoopLab();
      };
    });
    root.querySelector<HTMLButtonElement>('#import-loops')!.onclick = () => this.importLoopPack();
    const toPad = async (slot: number, id: string) => {
      if (await this.app.loopToSampler(slot, id)) {
        this.toast(`Pad ${slot + 1}: ${this.app.looplab.def(id)?.name}. Set a deck's PADS to Sampler to play it.`);
        this.renderLoopLab();
      }
    };
    root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach((b) => {
      const slot = parseInt(b.dataset.pad!, 10);
      b.onclick = () => this.app.sampler.trigger(slot);
      b.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types.includes('application/x-endodj-loop')) {
          e.preventDefault();
          b.classList.add('drop');
        }
      });
      b.addEventListener('dragleave', () => b.classList.remove('drop'));
      b.addEventListener('drop', (e) => {
        b.classList.remove('drop');
        const id = e.dataTransfer?.getData('application/x-endodj-loop');
        if (id) {
          e.preventDefault();
          void toPad(slot, id);
        }
      });
    });
    root.querySelectorAll<HTMLElement>('.ll-row').forEach((r) => {
      const id = r.dataset.loop!;
      r.addEventListener('dragstart', (e) => e.dataTransfer?.setData('application/x-endodj-loop', id));
      r.querySelector<HTMLButtonElement>('[data-act="preview"]')!.onclick = () =>
        void this.app.looplab.togglePreview(id).catch((e: Error) => this.toast(e.message, true));
      r.querySelectorAll<HTMLButtonElement>('[data-act="deck"]').forEach((b) => {
        b.onclick = () => void this.app.loadLoop(parseInt(b.dataset.deck!, 10), id);
      });
      r.querySelector<HTMLButtonElement>('[data-act="pad"]')!.onclick = () => {
        const free = slots.findIndex((sl) => !sl);
        if (free < 0) this.toast('All 8 pads are full. Drag the loop onto a pad to replace it.', true);
        else void toPad(free, id);
      };
    });
  }

  private importLoopPack(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      const lib = this.app.library;
      await lib.importFiles(files);
      const ids = files
        .map((f) => [...lib.tracks.values()].find((t) => t.fileName === f.name && t.size === f.size && t.lastModified === f.lastModified)?.id)
        .filter((x): x is string => !!x);
      const playlist = lib.playlists.find((p) => p.name === MY_LOOPS_NAME) ?? (await lib.createPlaylist(MY_LOOPS_NAME));
      await lib.addToPlaylist(playlist.id, ids.filter((id) => !playlist.trackIds.includes(id)));
      this.toast(`Imported ${ids.length} loops into “${MY_LOOPS_NAME}”. Click "Analyse BPM" to detect their tempo.`);
    };
    input.click();
  }
}
