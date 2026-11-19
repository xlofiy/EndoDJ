/**
 * Library browser: sidebar, virtualised track table (only visible rows are in the DOM, so
 * libraries with tens of thousands of tracks stay smooth) and the Loop Lab view.
 */
import type { App } from '../app/app';
import { GENRES, LOOPS, loopLengthSeconds, type Genre } from '../loops/catalog';
import type { TrackRecord } from '../library/db';
import { formatDuration, toCSV, toM3U, toText, type ExportTrack } from '../library/export';
import { AUTOMIX_ID, HISTORY_ID, Library } from '../library/library';
import { SAMPLER_SLOTS } from '../app/sampler';

export const LOOPLAB_VIEW = '__looplab__';
const MY_LOOPS_NAME = 'My Loops';
const ROW_H = 26;
const OVERSCAN = 12;

const GENRE_COLORS: Record<Genre, string> = {
  EDM: '#19c3ff',
  Rave: '#ffd23f',
  Techno: '#9aa7ff',
  Scene: '#ff3fb4',
  Breakcore: '#ff6b3d',
  Hyperpop: '#b6ff3b',
  FX: '#c9d6ea',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
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

  private wrap = el('#lib-table-wrap');
  private tbody = el('#lib-table tbody');

  constructor(
    private app: App,
    private toast: (m: string, e?: boolean) => void,
  ) {}

  get rowIds(): string[] {
    return this.rows.map((r) => r.id);
  }

  init(): void {
    const lib = this.app.library;
    lib.on(() => this.schedule());
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
    el('#add-files-btn').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      if (fileInput.files) {
        const n = await lib.importFiles(Array.from(fileInput.files));
        this.toast(`Added ${n} tracks.`);
      }
      fileInput.value = '';
    };
    el('#analyze-btn').onclick = async () => {
      const status = el('#lib-status');
      await this.app.analyseLibrary((d, t) => (status.textContent = `Analysing ${d}/${t}…`));
      status.textContent = '';
      this.toast('BPM analysis finished.');
    };

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
      if (!th || this.view !== 'all') return;
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
      : this.view === 'all'
        ? lib.tracks.size
          ? 'No tracks match your search.'
          : 'Your library is empty. Click "Add folder" or "Add files", or drop audio files here. Want loops? Open Loop Lab on the left.'
        : 'Nothing here yet. Drag tracks from "All tracks" onto a playlist in the sidebar.';
  }

  // ------------------------------------------------------------------ sidebar & toolbar

  private renderSidebar(): void {
    const lib = this.app.library;
    const side = el('#lib-sidebar');
    const item = (id: string, name: string, count: number | string, droppable: boolean) =>
      `<div class="item ${this.view === id ? 'active' : ''}" data-view="${esc(id)}" ${droppable ? 'data-drop="1"' : ''}>
        <span>${esc(name)}</span><span class="count">${count}</span></div>`;
    side.innerHTML =
      item('all', '🎵 All tracks', lib.tracks.size, false) +
      item(LOOPLAB_VIEW, '🫧 Loop Lab', LOOPS.length, false) +
      item(HISTORY_ID, '🕘 History (this session)', lib.sessionHistory().length, false) +
      '<div class="muted group">PLAYLISTS / SETLISTS</div>' +
      lib.playlists.map((p) => item(p.id, (p.id === AUTOMIX_ID ? '🔁 ' : '📃 ') + p.name, p.trackIds.length, true)).join('') +
      '<div class="item" id="new-playlist"><span>＋ New playlist</span></div>';
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
    el('#new-playlist').onclick = async () => {
      const name = prompt('Playlist name', `Set ${new Date().toLocaleDateString()}`);
      if (name) {
        const p = await lib.createPlaylist(name);
        this.view = p.id;
        this.render();
      }
    };
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
      this.view !== 'all'
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
    } else if (this.view === HISTORY_ID) {
      list = lib
        .sessionHistory()
        .map((h, index) => ({ id: h.trackId, rec: lib.tracks.get(h.trackId)!, index, playedAt: h.playedAt }))
        .filter((x) => x.rec);
    } else {
      list = (lib.playlist(this.view)?.trackIds ?? [])
        .map((id, index) => ({ id, rec: lib.tracks.get(id)!, index }))
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
    if (this.view === 'all') {
      const k = this.sortKey;
      const dir = this.sortDir;
      list.sort((a, b) => {
        const va = a.rec[k];
        const vb = b.rec[k];
        if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
        return ((va as number) - (vb as number)) * dir;
      });
    }
    return list;
  }

  private renderHead(): void {
    const sortable = (k: keyof TrackRecord, label: string, w: string) =>
      `<th data-sort="${k}" style="width:${w}">${label}${this.view === 'all' && this.sortKey === k ? (this.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    el('#lib-table thead').innerHTML = `<tr><th style="width:64px">${this.view === HISTORY_ID ? 'Played' : '#'}</th>${sortable('title', 'Title', '38%')}${sortable('artist', 'Artist', '24%')}${sortable('bpm', 'BPM', '64px')}${sortable('duration', 'Time', '60px')}${sortable('playCount', 'Plays', '54px')}<th style="width:${this.app.library.playlist(this.view) ? 190 : 110}px"></th></tr>`;
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
    const inPlaylist = !!lib.playlist(this.view);
    const parts: string[] = [`<tr class="spacer"><td colspan="7" style="height:${first * ROW_H}px"></td></tr>`];
    for (let i = first; i < last; i++) {
      const x = this.rows[i];
      const r = x.rec;
      const cls = [
        this.app.selectedTrackId === x.id ? 'selected' : '',
        lib.isAvailable(x.id) ? '' : 'unavailable',
        loaded[0] === x.id ? 'loaded-0' : '',
        loaded[1] === x.id ? 'loaded-1' : '',
      ].join(' ');
      const firstCol = x.playedAt ? new Date(x.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(i + 1);
      parts.push(`<tr class="${cls}" draggable="true" data-id="${esc(x.id)}" data-index="${x.index}">
        <td class="muted">${firstCol}</td><td title="${esc(r.fileName)}">${esc(r.title)}</td><td>${esc(r.artist)}</td>
        <td class="mono">${r.bpm > 0 ? r.bpm.toFixed(1) : ''}</td><td class="mono">${r.duration ? formatDuration(r.duration) : ''}</td>
        <td class="mono">${r.playCount || ''}</td>
        <td><button data-load="0" title="Load to deck A">A</button><button data-load="1" title="Load to deck B">B</button><button data-queue title="Add to Automix queue">Q</button>${
          inPlaylist ? '<button data-up title="Move up">↑</button><button data-down title="Move down">↓</button><button data-remove title="Remove from playlist">✕</button>' : ''
        }</td></tr>`);
    }
    parts.push(`<tr class="spacer"><td colspan="7" style="height:${(n - last) * ROW_H}px"></td></tr>`);
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
    } else if (t.dataset.up !== undefined) void lib.moveInPlaylist(this.view, index, index - 1);
    else if (t.dataset.down !== undefined) void lib.moveInPlaylist(this.view, index, index + 1);
    else if (t.dataset.remove !== undefined) void lib.removeFromPlaylist(this.view, index);
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
    root.innerHTML = `
      <div class="genres">${(['All', ...GENRES] as const)
        .map((g) => `<button data-genre="${g}" class="${this.genre === g ? 'on' : ''}">${g === 'FX' ? 'FX & one-shots' : g}</button>`)
        .join('')}
        <button id="import-loops" title="Import your own loop pack (WAV/MP3/…) into the playlist “${MY_LOOPS_NAME}”">＋ Import loop pack</button></div>
      <p class="note">Original loops synthesised by EndoDJ — free to use in mixes, streams and releases. Load one onto a deck:
        it loops seamlessly, has an exact beat grid, and syncs to the other deck automatically. ▶ previews in your headphones
        (or on the master when no headphone output is set up).</p>
      <div class="grid">${loops
        .map(
          (l) => `<div class="card ${previewing === l.id ? 'playing' : ''}" data-loop="${l.id}">
            <div class="name">${esc(l.name)}</div>
            <div class="meta"><span class="tag" style="background:${GENRE_COLORS[l.genre]}">${l.genre}</span>${l.kind}
              · ${l.bpm > 0 ? `${l.bpm} BPM · ${l.bars} bars` : `${loopLengthSeconds(l).toFixed(1)} s`}</div>
            <div class="actions">
              <button data-act="preview">${previewing === l.id ? '■ Stop' : '▶ Preview'}</button>
              <button data-act="deck" data-deck="0" title="Load onto deck A">→ A</button>
              <button data-act="deck" data-deck="1" title="Load onto deck B">→ B</button>
              <select data-act="pad" title="Put on a sampler pad"><option value="">→ Pad…</option>${Array.from(
                { length: SAMPLER_SLOTS },
                (_, i) => `<option value="${i}">Pad ${i + 1}</option>`,
              ).join('')}</select>
            </div></div>`,
        )
        .join('')}</div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-genre]').forEach((b) => {
      b.onclick = () => {
        this.genre = b.dataset.genre as Genre | 'All';
        this.renderLoopLab();
      };
    });
    root.querySelector<HTMLButtonElement>('#import-loops')!.onclick = () => this.importLoopPack();
    root.querySelectorAll<HTMLElement>('.card').forEach((card) => {
      const id = card.dataset.loop!;
      card.querySelector<HTMLButtonElement>('[data-act="preview"]')!.onclick = () =>
        void this.app.looplab.togglePreview(id).catch((e: Error) => this.toast(e.message, true));
      card.querySelectorAll<HTMLButtonElement>('[data-act="deck"]').forEach((b) => {
        b.onclick = () => void this.app.loadLoop(parseInt(b.dataset.deck!, 10), id);
      });
      const pad = card.querySelector<HTMLSelectElement>('[data-act="pad"]')!;
      pad.onchange = async () => {
        if (pad.value === '') return;
        const slot = parseInt(pad.value, 10);
        await this.app.loopToSampler(slot, id);
        this.toast(`Pad ${slot + 1}: ${this.app.looplab.def(id)?.name} (pads mode “Sampler”)`);
        pad.value = '';
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
