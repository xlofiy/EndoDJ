# EndoDJ — Development Handoff

Read this first when resuming work (human or AI).

## How to resume
```bash
git clone https://github.com/xlofiy/EndoDJ.git && cd EndoDJ
git checkout claude/epic-dijkstra-m4lk0o   # development branch (not merged to main yet)
npm install
npm test        # unit tests, all should pass
npm run dev     # open the printed URL in Chrome / Edge, click "Start EndoDJ"
npm run desktop # or run it as the desktop app (needs the Electron download)
```
Installers: see `docs/INSTALL.md` (built by `.github/workflows/desktop.yml`).

## Current state (end of session 1)
Working and verified end-to-end in headless Chromium (load → BPM → play → sync → loop → hot cue →
FX → history → automix crossfade), with no console errors:

- 2 decks (AudioWorklet player: variable speed, reverse, scratch, sample-accurate loops)
- BPM + beat-grid detection in a Web Worker (exact on test material, cached per track)
- CDJ-style CUE, 8 hot cues (saved per track), quantize, auto/manual loops, beat jump, nudge,
  pitch ranges ±6/10/16/50 %, sync (tempo + phase, half/double-time aware), BPM ½/×2, set grid
- Mixer: trim, 3-band EQ with kill, filter knob, faders, crossfader (smooth/linear/cut), meters
- Beat FX: echo, reverb, flanger, phaser, trans, bitcrusher on deck A / deck B / master
- Headphone cue routing: stereo, split cable, 4-channel interface
- Library (IndexedDB): folder import (Chrome/Edge), file import, drag & drop, search/sort,
  playlists/setlists, session history, TXT/M3U/CSV export, BPM batch analysis
- Automix from the "Automix queue" playlist, mix recording (WebM/Opus), sampler (8 slots)
- Web MIDI with DDJ-FLX2 default mapping, MIDI monitor, MIDI Learn, mapping import/export,
  LED feedback, keyboard shortcuts

## Session 2 additions
- **Loop Lab** (`src/loops/`): `dsp.ts` (pure synthesis toolkit), `catalog.ts` (18 loops + 8 FX,
  rendered deterministically), `loop-worker.ts` (renders off the UI thread), `looplab.ts` (cache,
  preview, deck/pad loading). Free sample sites were unreachable from the build environment, so all
  sounds are synthesised in code (MIT, no licence questions). Tests check every loop renders cleanly
  and that auto-BPM finds its exact tempo.
- **BPM detection rewrite** (`src/audio/bpm.ts`): metrical comb scan over three 10-s windows +
  octave rule. The old autocorrelation stage mis-read busy drum loops (e.g. 106.67 for 128).
- **UI**: new theme (`src/style.css`, `src/ui/prefs.ts`), round platters (`src/ui/platter-view.ts`),
  virtualised library + Loop Lab view (`src/ui/library-view.ts`), compact layout + splitter,
  redraw-skipping canvases. Verified at 60 fps with 20 000 tracks, both decks + platters running.
- **Desktop app** (`electron/`): `main.cjs` (app:// origin, permissions, native pickers, path-guarded
  file reads), `preload.cjs`, `paths.cjs` (tested). Packaging config lives in `package.json` → `build`.
  The Electron binary could not be downloaded in the build environment, so the desktop app itself
  was verified only through CI builds — **test-run the installer on a real machine**.

## Session 3 additions
- **Ponytail** (https://github.com/dietrichgebert/ponytail, MIT): its agent ruleset lives in
  `AGENTS.md` (loaded by `CLAUDE.md`), so every future AI session follows it. A Ponytail-style audit
  was run; fixed: duplicate per-deck track memory, per-track startup reads, silent Loop Lab load
  failures, untested deck logic (`tests/deck.test.ts`), dead `removeTrack` (now wired), MIDI monitor
  redraw rate.
- **Key**: `src/audio/key.ts` (harmonic-folded chromagram + EDM key profiles, Camelot, key-sync
  math), `src/audio/pitch-shift.ts` (granular pitch shifter in the worklet → key shift independent of
  tempo, key lock). Deck key row: chip, ♭/♯/0, KEY SYNC, KEY LOCK (also MIDI-learnable). Loop Lab
  loops auto-match the playing deck's BPM **and** key.
- **CC0 sounds**: 5 loops + 12 FX from OpenGameArt in `public/loops/`, credited in
  `docs/THIRD_PARTY.md` with how they were cut and verified. Freesound needs an API key (not set up).
- **Look**: superseded in session 4 by the Frutiger Aero redesign.

## Session 4 additions
- **Frutiger Aero redesign** (`src/style.css`, rewritten): design tokens, light glass panels over a CSS
  sky (`#sky` in `index.html`: sun, moon, stars, clouds, bubbles, hill). `data-mode="light|dark"`
  switches day/night (top-bar switch + General settings). Persona/scene styling, emoji and inline hint
  text removed. Platters are on by default (prefs key bumped to `endodj.prefs.v2`).
- **Guides** (`src/ui/guides.ts`, tested): 14 guides with inline-SVG diagrams; the Camelot wheel and
  crossfader curves are generated from `key.ts` / `mixmath.ts`. "Show me" closes Settings and
  highlights the control (`.spotlight`). Settings now has General / Audio / Guides tabs.

## ⚠️ Hardware verification checklist (needs the real DDJ-FLX2)
Nothing below has been tested on the physical controller yet:
1. **MIDI mapping** (`src/midi/ddj-flx2.ts`) — based on Pioneer's DDJ-FLX4/DDJ-400 layout.
   Use Controller → MIDI monitor, press/move every control, fix mismatches with Learn, then
   export the mapping and update `ddj-flx2.ts` so the defaults are right.
2. **Tempo fader direction** — toggle "invert direction" in the Controller dialog if needed.
3. **Jog wheel resolution** — `JOG_TICKS_PER_REV` in `src/audio/deck.ts` (720 assumed).
   If scratching moves too fast/slow, adjust it.
4. **Audio output** — does the OS expose the FLX2's sound card with 4 output channels?
   If yes, Settings → "4 channels" gives headphone cueing on the controller's headphone jack.
5. **LEDs** — do the play/cue/hot-cue LEDs follow the app state?

## Tech choices (and why)
- **TypeScript + Vite, no UI framework** — fast to build, easy to read, runs in any Chromium browser.
- **Web Audio API** for the mixer/effects graph, **AudioWorklet** (`src/audio/deck-processor.ts`)
  for the decks so we get sample-accurate variable-speed playback, reverse and scratching.
- **Web MIDI API** for the DDJ-FLX2 (Chrome/Edge only — Firefox/Safari don't support it well).
- **IndexedDB** for the library (track records, cues, playlists, history, file handles).
  Audio files are never copied; the File System Access API keeps handles to them.

## Code map
| Path | What |
|------|------|
| `src/main.ts` | Entry point (start button → App + UI) |
| `src/app/app.ts` | Glue: loading/analysis, control-event dispatcher (MIDI, keyboard, screen) |
| `src/app/automix.ts` | Automix (queue → load, sync, crossfade) |
| `src/app/sampler.ts` | 8-slot sampler |
| `src/audio/engine.ts` | AudioContext, channel strips, FX unit, output routing, recorder |
| `src/audio/deck.ts` | Deck transport logic (cue, hot cues, loops, jog, sync) |
| `src/audio/deck-processor.ts` | AudioWorklet wrapper around `player-core.ts` |
| `src/audio/player-core.ts` | Playback DSP (pure, tested) |
| `src/audio/bpm.ts` | BPM + beat-grid detection (pure, tested) |
| `src/audio/key.ts` | Key detection, Camelot, key-sync math (pure, tested) |
| `src/audio/pitch-shift.ts` | Real-time pitch shifter for key shift / key lock (pure, tested) |
| `src/audio/waveform.ts` / `analysis-worker.ts` | Waveform summary + analysis worker |
| `src/audio/effects.ts` | Beat FX implementations |
| `src/audio/mixmath.ts` | Crossfader/EQ/filter laws, sync & quantize math (pure, tested) |
| `src/library/*` | IndexedDB, library model, export formats (tested) |
| `src/midi/mapping.ts` | MIDI → control engine, 14-bit, jog decoding, MIDI Learn (tested) |
| `src/midi/ddj-flx2.ts` | Default DDJ-FLX2 mapping (**unverified on hardware**) |
| `src/midi/midi.ts` | Web MIDI device handling, persistence |
| `src/ui/*` | DOM UI, library/Loop Lab view, canvas waveform + platter renderers, prefs |
| `src/loops/*` | Loop Lab synthesis, catalogue, worker, runtime |
| `electron/*` | Desktop app main process, preload, file-access rules |
| `tests/` | Vitest unit tests |

## Control ids
`deck{1,2}.{play,cue,sync,syncOff,reverse,start,shift,jogTouch,jogScratch,jogBend,jogSeek,tempo,
volume,trim,eqHigh,eqMid,eqLow,filter,pfl,load,loopIn,loopOut,reloop,loopHalve,loopDouble,
nudgeDown,nudgeUp,beatjumpBack,beatjumpFwd,hotcueN,hotcueClearN,beatloopN,beatjumpN,samplerN}`,
`mixer.crossfader`, `browser.{scroll,push}`, `fx.{toggle,beatDown,beatUp,next,level}`.
These are the contract between MIDI, keyboard and UI (`App.handleControl`).

## Design rules
- Keep DSP / math / mapping logic in **pure modules** with unit tests; keep Web Audio / DOM glue thin.
- Never claim hardware behaviour that hasn't been verified on a real DDJ-FLX2.

## Suggested next steps (in order)
1. Hardware verification checklist above.
2. Key detection + Camelot display (`src/audio/key.ts`, run in the analysis worker).
3. Key lock / master tempo: WSOLA time-stretch inside `player-core.ts`.
4. Read ID3/MP4 tags for title/artist/artwork.
5. Desktop packaging (Electron or Tauri) so it runs as an app without a dev server.
6. End-to-end test suite with Playwright (scripts used in session 1 are described below).

## How session 1 was verified
- `npm test` — unit tests for BPM detection, player core, mixer/sync math, MIDI mapping, exports.
- A Playwright script against `npm run build && npx vite preview` that imports two generated
  click tracks (124 & 128 BPM), loads them, checks BPM (exact), plays, syncs (tempo factor
  0.96875, phase error < 0.01 beat), checks audio reaches the master bus, loops, hot cues, FX,
  history, MIDI control dispatch, and an automix transition.

## Progress log
- Session 1: complete v0.1 feature set (see "Current state"); hardware verification pending.
- Session 2: Loop Lab, BPM detection rewrite, new theme/platters/compact layout, virtualised list,
  Electron desktop app + CI installers.
- Session 3: Ponytail rules + audit fixes, key detection / shift / lock / sync, bundled CC0 loops & FX,
  Aero Scene (Vista) theme.
- Session 4: Frutiger Aero redesign with day/night sky, platters by default, Settings tabs + Guides.
