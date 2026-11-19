'use strict';
/** Exposes a minimal, explicit API to the page (no Node.js access in the renderer). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('endodjNative', {
  platform: process.platform,
  /** @returns {Promise<{root: string|null, files: {path,name,size,lastModified,relativePath}[]} | null>} */
  pickFolder: () => ipcRenderer.invoke('endodj:pick-folder'),
  pickFiles: () => ipcRenderer.invoke('endodj:pick-files'),
  /** @returns {Promise<ArrayBuffer>} */
  readFile: (path) => ipcRenderer.invoke('endodj:read-file', path),
  exists: (path) => ipcRenderer.invoke('endodj:exists', path),
});
