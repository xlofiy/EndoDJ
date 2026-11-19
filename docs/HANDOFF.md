# EndoDJ — Development Handoff

Read this first when resuming work (human or AI).

## How to resume
```bash
git clone https://github.com/xlofiy/EndoDJ.git && cd EndoDJ
git checkout claude/epic-dijkstra-m4lk0o   # development branch
npm install
npm test        # all tests should pass
npm run dev     # open the printed URL in Chrome / Edge
```
Then look at the "Next steps" list below and at `docs/ROADMAP.md`.

## Tech choices (and why)
- **TypeScript + Vite, no UI framework** — fast to build, easy to read, runs in any Chromium browser.
- **Web Audio API** for the mixer/effects graph, **AudioWorklet** (`src/audio/deck-processor.ts`)
  for the decks so we get sample-accurate variable-speed playback, reverse and scratching.
- **Web MIDI API** for the DDJ-FLX2 (Chrome/Edge only — Firefox/Safari don't support it well).
- **IndexedDB** for the library cache (analysis results, cue points, playlists).
- Desktop packaging (Electron/Tauri) is planned later; the web app is the core.

## Code map
| Path | What |
|------|------|
| `src/audio/bpm.ts` | BPM + beat-grid detection (pure, tested) |
| `src/audio/player-core.ts` | Deck playback DSP (pure, tested) — used by the worklet |
| `src/audio/mixmath.ts` | Crossfader curves, EQ/filter knob laws, sync/quantize math (pure, tested) |
| `src/midi/mapping.ts` | MIDI → control-event engine, 14-bit knobs, jog decoding, MIDI Learn (tested) |
| `src/midi/ddj-flx2.ts` | Default DDJ-FLX2 mapping (**unverified on hardware**) |
| `tests/` | Vitest unit tests |

## Design rules
- Keep DSP / math / mapping logic in **pure modules** with unit tests; keep Web Audio / DOM glue thin.
- Control ids (`deck1.play`, `mixer.crossfader`, …) are the contract between MIDI, keyboard and UI.
- Never claim hardware behaviour that hasn't been verified on a real DDJ-FLX2.

## Next steps
See the unchecked items in `docs/ROADMAP.md`. The progress log below is updated as work lands.

## Progress log
- Session 1: scaffold, BPM detection, player core, mixer/sync math, MIDI mapping + learn.
