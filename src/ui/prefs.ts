/** Per-viewer UI preferences, kept in localStorage (best effort — works without it). */

export interface Prefs {
  theme: 'endo' | 'classic';
  platters: boolean;
  lowFx: boolean;
  compact: boolean;
  /** song list height in px (0 = automatic) */
  libraryHeight: number;
}

const KEY = 'endodj.prefs.v1';
const DEFAULTS: Prefs = { theme: 'endo', platters: false, lowFx: false, compact: false, libraryHeight: 0 };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* storage unavailable or corrupt */
  }
  return { ...DEFAULTS };
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

/** Apply the visual preferences to the document. */
export function applyPrefs(p: Prefs): void {
  document.documentElement.dataset.theme = p.theme;
  document.body.classList.toggle('lowfx', p.lowFx);
  document.body.classList.toggle('compact', p.compact);
  document.body.classList.toggle('platters', p.platters);
}
