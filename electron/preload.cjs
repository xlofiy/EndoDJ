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
  midi: {
    /** @returns {Promise<{inputs: string[], outputs: string[], error: string|null, input: string|null, output: string|null}>} */
    state: () => ipcRenderer.invoke('endodj:midi-state'),
    /** name '' = disconnect, undefined = pick the controller automatically */
    open: (name) => ipcRenderer.invoke('endodj:midi-open', name),
    send: (bytes) => ipcRenderer.send('endodj:midi-send', bytes),
    onMessage: (cb) => {
      const fn = (_e, msg) => cb(msg);
      ipcRenderer.on('endodj:midi-message', fn);
      return () => ipcRenderer.removeListener('endodj:midi-message', fn);
    },
    onPorts: (cb) => {
      const fn = (_e, state) => cb(state);
      ipcRenderer.on('endodj:midi-ports', fn);
      return () => ipcRenderer.removeListener('endodj:midi-ports', fn);
    },
  },
  updates: {
    /** @returns {Promise<{status, version, percent, error, current}>} */
    state: () => ipcRenderer.invoke('endodj:update-state'),
    check: () => ipcRenderer.invoke('endodj:update-check'),
    install: () => ipcRenderer.invoke('endodj:update-install'),
    /** @returns {() => void} unsubscribe */
    onChange: (cb) => {
      const fn = (_e, state) => cb(state);
      ipcRenderer.on('endodj:update', fn);
      return () => ipcRenderer.removeListener('endodj:update', fn);
    },
  },
});
