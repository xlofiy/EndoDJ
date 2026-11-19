# EndoDJ Roadmap

Goal: feature parity with the core of commercial DJ software (VirtualDJ, rekordbox, Serato)
for a 2-deck DDJ-FLX2 setup, completely free.

Legend: `[x]` done · `[~]` partial · `[ ]` not started

## Phase 1 — Playable core (v0.1)
- [x] Audio engine (Web Audio) with AudioWorklet deck player (variable speed, reverse, scratch)
- [x] 2 decks: load, play/pause, cue (CDJ style), seek, pitch fader, pitch range, nudge
- [x] Waveforms: overview + zoomed scrolling waveform with beat grid
- [x] Auto BPM detection + beat grid (first-beat offset)
- [x] Sync (tempo + phase)
- [x] 8 hot cues / deck, persisted per track
- [x] Loops: auto loop (1/8–32 beats), manual in/out, halve/double, exit/reloop; beat jump
- [x] Mixer: trim, 3-band EQ, Color FX filter, channel fader, crossfader + curve, master volume
- [~] Headphone cue (PFL) with cue/master mix, output modes: stereo / split / 4-channel (built; 4-channel needs testing on the FLX2's sound card)
- [x] Effects: echo, reverb, flanger, phaser, trans (gate), bitcrusher — beat synced, wet/dry
- [x] Library: add folder (File System Access API), drag & drop files, search, sort
- [x] Analysis cache (BPM, grid, cues, duration) in IndexedDB — waveforms are recomputed on load (fast)
- [x] Playlists / setlists, history, export (TXT / M3U / CSV)
- [x] Automix from a playlist
- [x] Record mix to file
- [x] Web MIDI: device selection, MIDI monitor
- [~] DDJ-FLX2 default mapping (written, **needs verification on real hardware** — see below)
- [x] MIDI Learn + export/import of mappings
- [x] Keyboard shortcuts

## Phase 2 — Pro features
- [ ] Key detection (Camelot notation) + harmonic-mix hints
- [ ] Key lock / master tempo (pitch-preserving time-stretch, WSOLA in the worklet)
- [x] Sampler (pads mode) with user-loadable samples
- [ ] Slicer / beat roll / pad FX
- [x] Quantize for cues & loops
- [~] Controller LED feedback (play/cue/sync/hot-cue LEDs) — implemented, unverified on hardware
- [x] Desktop packaging (Electron) with native file access; installers for Windows/macOS/Linux built in CI (unsigned)
- [x] Waveform colouring by frequency band (bass = warm, highs = cool)
- [ ] Track metadata reading (ID3 / MP4 tags, artwork)

## Phase 2.5 — Scene features
- [x] Loop Lab: built-in genre loops + FX one-shots, preview, load to deck/pads, loop-pack import
- [x] Themes (Endo / Classic), round jog platters, compact layout, resizable song list
- [x] Virtualised song list (tested with 20 000 tracks)
- [ ] More Loop Lab content: curated CC0 packs from Freesound/OpenGameArt (needs network access + licence review)
- [ ] Code-signed installers (Windows certificate, Apple Developer ID) and auto-update

## Phase 3 — Beyond
- [ ] Stem separation (vocals / instruments) — ML model in WebGPU/ONNX
- [ ] Video mixing
- [ ] Streaming-service integration (requires licensed APIs)
- [ ] Broadcasting / live streaming output

## DDJ-FLX2 mapping verification
The default MIDI mapping in `src/midi/ddj-flx2.ts` follows the message layout used by Pioneer's
DDJ-FLX4 / DDJ-400 family. It has **not yet been verified on a real DDJ-FLX2**. To verify:
1. Open EndoDJ → *Controller* panel → enable the **MIDI monitor**.
2. Move each control and compare the message with the table in `src/midi/ddj-flx2.ts`.
3. Fix any mismatch with **MIDI Learn** (per control, saved in the browser) and, ideally,
   update `src/midi/ddj-flx2.ts` and commit so the default is correct for everyone.
