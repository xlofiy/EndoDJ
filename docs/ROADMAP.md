# EndoDJ Roadmap

Goal: feature parity with the core of commercial DJ software (VirtualDJ, rekordbox, Serato)
for a 2-deck DDJ-FLX2 setup, completely free.

Legend: `[x]` done · `[~]` partial · `[ ]` not started

## Phase 1 — Playable core (v0.1)
- [ ] Audio engine (Web Audio) with AudioWorklet deck player (variable speed, reverse, scratch)
- [ ] 2 decks: load, play/pause, cue (CDJ style), seek, pitch fader, pitch range, nudge
- [ ] Waveforms: overview + zoomed scrolling waveform with beat grid
- [ ] Auto BPM detection + beat grid (first-beat offset)
- [ ] Sync (tempo + phase)
- [ ] 8 hot cues / deck, persisted per track
- [ ] Loops: auto loop (1/8–32 beats), manual in/out, halve/double, exit/reloop; beat jump
- [ ] Mixer: trim, 3-band EQ, Color FX filter, channel fader, crossfader + curve, master volume
- [ ] Headphone cue (PFL) with cue/master mix, output modes: stereo / split / 4-channel
- [ ] Effects: echo, reverb, flanger, phaser, bitcrusher — beat synced, wet/dry
- [ ] Library: add folder (File System Access API), drag & drop files, search, sort
- [ ] Analysis cache (BPM, grid, waveform, duration) in IndexedDB
- [ ] Playlists / setlists, history, export (TXT / M3U / CSV)
- [ ] Automix from a playlist
- [ ] Record mix to file
- [ ] Web MIDI: device selection, MIDI monitor
- [ ] DDJ-FLX2 default mapping (needs verification on real hardware — see below)
- [ ] MIDI Learn + export/import of mappings
- [ ] Keyboard shortcuts

## Phase 2 — Pro features
- [ ] Key detection (Camelot notation) + harmonic-mix hints
- [ ] Key lock / master tempo (pitch-preserving time-stretch, WSOLA in the worklet)
- [ ] Sampler (pads mode) with user-loadable samples
- [ ] Slicer / beat roll / pad FX
- [ ] Quantize for cues & loops
- [ ] Controller LED feedback (play/cue/sync/hot-cue LEDs)
- [ ] Desktop packaging (Electron or Tauri) with native file access and audio device routing
- [ ] Waveform colouring by frequency band
- [ ] Track metadata reading (ID3 / MP4 tags, artwork)

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
