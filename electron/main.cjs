'use strict';
/**
 * EndoDJ desktop app (Electron main process).
 *
 * - Serves the built web app (dist/) from a private, secure `app://endodj` origin so
 *   AudioWorklets, Web Workers, IndexedDB and Web MIDI behave exactly like in Chrome.
 * - Grants MIDI (the DDJ-FLX2) and audio-device permissions to that origin only.
 * - Gives the page native folder/file pickers and read access limited to what the user picked.
 */
const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { AUDIO_EXTENSIONS, isAudioPath, isInside, mayRead } = require('./paths.cjs');
const { autoUpdater } = require('electron-updater');

const ORIGIN = 'app://endodj';
const DIST = path.join(__dirname, '..', 'dist');
const ALLOWED_PERMISSIONS = new Set(['midi', 'media', 'speaker-selection', 'fileSystem', 'clipboard-sanitized-write']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// DJ software must be able to start audio as soon as the user presses play on the controller.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ------------------------------------------------------------------ granted folders / files

const grantsFile = () => path.join(app.getPath('userData'), 'granted-paths.json');
let grants = [];

function loadGrants() {
  try {
    const list = JSON.parse(fs.readFileSync(grantsFile(), 'utf8'));
    if (Array.isArray(list)) grants = list.filter((g) => typeof g === 'string');
  } catch {
    grants = [];
  }
}

function addGrant(p) {
  if (grants.some((g) => isInside(g, p))) return;
  grants = grants.filter((g) => !isInside(p, g)).concat(p);
  try {
    fs.mkdirSync(path.dirname(grantsFile()), { recursive: true });
    fs.writeFileSync(grantsFile(), JSON.stringify(grants, null, 2));
  } catch (e) {
    console.error('Could not save granted paths', e);
  }
}

async function describe(file, root) {
  const st = await fs.promises.stat(file);
  return {
    path: file,
    name: path.basename(file),
    size: st.size,
    lastModified: Math.round(st.mtimeMs),
    relativePath: root ? path.relative(path.dirname(root), file).split(path.sep).join('/') : path.basename(file),
  };
}

async function walk(dir, root, out, depth = 0) {
  if (depth > 20 || out.length > 200000) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable folder
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out, depth + 1);
    else if (e.isFile() && isAudioPath(full)) {
      try {
        out.push(await describe(full, root));
      } catch {
        /* vanished while scanning */
      }
    }
  }
}

function fromOurPage(event) {
  return event.senderFrame && event.senderFrame.url.startsWith(`${ORIGIN}/`);
}

ipcMain.handle('endodj:pick-folder', async (event) => {
  if (!fromOurPage(event)) return null;
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, { title: 'Add music folder', properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  const root = res.filePaths[0];
  addGrant(root);
  const files = [];
  await walk(root, root, files);
  return { root, files };
});

ipcMain.handle('endodj:pick-files', async (event) => {
  if (!fromOurPage(event)) return null;
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Add audio files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (res.canceled) return null;
  const files = [];
  for (const f of res.filePaths) {
    if (!isAudioPath(f)) continue;
    addGrant(f);
    files.push(await describe(f, null));
  }
  return { root: null, files };
});

ipcMain.handle('endodj:read-file', async (event, file) => {
  if (!fromOurPage(event)) throw new Error('Not allowed');
  if (!mayRead(grants, file)) throw new Error('EndoDJ is not allowed to read that file. Re-add its folder.');
  const buf = await fs.promises.readFile(file);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('endodj:exists', async (event, file) => {
  if (!fromOurPage(event) || !mayRead(grants, file)) return false;
  try {
    await fs.promises.access(file, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
});

// ------------------------------------------------------------------ auto-update
// New versions are published as GitHub Releases (xlofiy/EndoDJ) by the "Desktop installers"
// workflow on every push to main. electron-updater checks them, downloads in the background
// (verifying the sha512 from latest.yml) and installs on restart / quit.

let update = { status: 'idle', version: null, percent: 0, error: null };

function setUpdate(patch) {
  update = { ...update, ...patch };
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('endodj:update', update);
}

function checkForUpdates() {
  if (!app.isPackaged) return setUpdate({ status: 'dev' });
  autoUpdater.checkForUpdates().catch((e) => setUpdate({ status: 'error', error: String(e?.message ?? e) }));
}

function setupUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => setUpdate({ status: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => setUpdate({ status: 'current' }));
  autoUpdater.on('download-progress', (p) => setUpdate({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => setUpdate({ status: 'ready', version: i.version, percent: 100 }));
  autoUpdater.on('error', (e) => setUpdate({ status: 'error', error: String(e?.message ?? e) }));
  checkForUpdates();
  setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

ipcMain.handle('endodj:update-state', (event) => (fromOurPage(event) ? { ...update, current: app.getVersion() } : null));
ipcMain.handle('endodj:update-check', (event) => {
  if (fromOurPage(event)) checkForUpdates();
});
ipcMain.handle('endodj:update-install', (event) => {
  if (fromOurPage(event) && update.status === 'ready') autoUpdater.quitAndInstall();
});

// ------------------------------------------------------------------ window

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#030a1c',
    title: 'EndoDJ',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep audio/UI timing steady when the window is in the background
    },
  });
  // open external links in the browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) e.preventDefault();
  });
  void win.loadURL(`${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  loadGrants();

  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'endodj') return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(DIST, rel);
    if (!isInside(DIST, file)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const isOurs = (origin) => typeof origin === 'string' && origin.startsWith(ORIGIN);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(isOurs(details.requestingUrl) && ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    return isOurs(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
  });

  createWindow();
  setupUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
