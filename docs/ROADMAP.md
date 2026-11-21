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
- [x] Effects: echo, ping-pong, reverb, flanger, phaser, wah, trans (gate), tremolo, distortion, bitcrusher, noise sweep — beat synced, wet/dry
- [x] Library: add folder (File System Access API), drag & drop files, search, sort
- [x] Analysis cache (BPM, grid, cues, duration) in IndexedDB — waveforms are recomputed on load (fast)
- [x] Playlists / setlists, history, export (TXT / M3U / CSV)
- [x] Automix from a playlist (controls in the Automix queue view), Loop Lab bridges
- [x] Automatic background analysis (BPM, key, length); music sub-folders in the library
- [x] Mix suggestions (tempo, Camelot key, genre folder) + Auto-set from a folder
- [x] Record mix to file
- [x] MIDI: native RtMidi bridge in the desktop app (Web MIDI in the browser), device selection, MIDI monitor
- [~] DDJ-FLX2 default mapping (written, **needs verification on real hardware** — see below)
- [x] MIDI Learn + export/import of mappings
- [x] Keyboard shortcuts

## Phase 2 — Pro features
- [x] Key detection (Camelot notation) + harmonic-mix hints (key chip turns green when decks match)
- [~] Key lock / master tempo and key shift — granular pitch shifter in the worklet; upgrade to WSOLA/phase vocoder for studio quality
- [x] Sampler (pads mode) with user-loadable samples
- [x] Pad FX incl. beat roll (slip), brake, backspin
- [ ] Slicer
- [x] Quantize for cues & loops
- [~] Controller LED feedback (play/cue/sync/hot-cue LEDs) — implemented, unverified on hardware
- [x] Desktop packaging (Electron) with native file access; installers for Windows/macOS/Linux built in CI (unsigned)
- [x] Waveform colouring by frequency band (bass = warm, highs = cool)
- [~] Track metadata: cover art from ID3 / FLAC / MP4 (title/artist still from file names)
- [x] Beat / bar / phrase markers on the waveforms; song sections (intro / drop / break / outro) with jump

## Phase 2.5 — Scene features
- [x] Loop Lab: built-in genre loops + FX one-shots, preview, load to deck/pads, loop-pack import
- [x] Themes (Endo / Classic), round jog platters, compact layout, resizable song list
- [x] Virtualised song list (tested with 20 000 tracks)
- [x] CC0 loops & FX from OpenGameArt (5 loops, 12 FX), verified and credited
- [ ] More CC0 content from Freesound (needs a Freesound API key)
- [x] Auto-update from GitHub Releases
- [ ] Code-signed installers (Windows certificate)
- [x] 101 Loop Lab sounds incl. Aero, Eurobeat, Hardstyle and Jersey Club (synthesised; no usable CC0 loops found for those)

## Phase 3 — Beyond
- [~] Track parts: PARTS cuts bass / vocal (centre) / instru (sides) / hats with a frequency + stereo split
- [ ] Real stem separation (vocals / drums / bass / other) — ML model (e.g. Demucs) in WebGPU/ONNX, pre-computed per track
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
