'use strict';
/**
 * File-access rules for the desktop app (pure functions, unit-tested).
 * The renderer may only read audio files that live inside folders (or are files)
 * the user explicitly picked in a native dialog.
 */
const path = require('node:path');

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'mp4', 'webm', 'aif', 'aiff'];

function isAudioPath(p) {
  const ext = path.extname(String(p)).slice(1).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

/** true if `target` is `root` itself or inside it (after resolving `..` etc.). */
function isInside(root, target, pathLib = path) {
  const r = pathLib.resolve(root);
  const t = pathLib.resolve(target);
  if (t === r) return true;
  const rel = pathLib.relative(r, t);
  return rel !== '' && !rel.startsWith('..') && !pathLib.isAbsolute(rel);
}

/** May the renderer read `target`, given the granted roots (folders or single files)? */
function mayRead(grants, target, pathLib = path) {
  if (typeof target !== 'string' || !target || !isAudioPath(target)) return false;
  return grants.some((g) => isInside(g, target, pathLib));
}

module.exports = { AUDIO_EXTENSIONS, isAudioPath, isInside, mayRead, posix: path.posix, win32: path.win32 };
