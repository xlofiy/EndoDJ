# EndoDJ

*Endo* — from the Greek ἔνδον, "inside, within".

EndoDJ is free, open source DJ software that runs in your browser (Chrome / Edge), built first and
foremost for the **Pioneer DJ / AlphaTheta DDJ-FLX2** controller — no license fees, no subscriptions.

> Status: **v0.1 — early development.** Everything below works in the browser; the DDJ-FLX2 MIDI
> mapping has not been verified on the physical controller yet (see
> [`docs/HANDOFF.md`](docs/HANDOFF.md#️-hardware-verification-checklist-needs-the-real-ddj-flx2)).
> Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Quick start

Requirements: [Node.js](https://nodejs.org) 20+ and **Google Chrome or Microsoft Edge**
(Web MIDI — needed to talk to the controller — is only available in Chromium-based browsers).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) in Chrome/Edge, click **Start EndoDJ**,
plug in the DDJ-FLX2 and allow MIDI access when the browser asks. Click **Add folder** to import music.

## Features

- **2 decks** — waveform overview + scrolling beat-grid waveform, CDJ-style CUE, play, reverse,
  pitch fader (±6/10/16/50 %), nudge, scratch & pitch-bend with the jog wheels
- **Auto BPM** detection and beat grid (½ / ×2 correction, "set grid here"), **sync** (tempo + phase)
- **8 hot cues** per deck (saved per track), **loops** (1/4–32 beats, in/out, halve/double, reloop),
  **beat jump**, quantize
- **Mixer** — trim, 3-band EQ with kill, filter knob, channel faders, crossfader (smooth / linear / cut), meters
- **Beat FX** — echo, reverb, flanger, phaser, trans, bitcrusher on deck A, deck B or master
- **Library** — import folders or files, drag & drop, search and sort, BPM batch analysis
- **Playlists / setlists**, play **history**, export to TXT / M3U / CSV
- **Automix** through a queue, **record** your mix, 8-slot **sampler**
- **Headphone cueing** — stereo, split-cable or 4-channel output
- **DDJ-FLX2** mapping, **MIDI Learn** for every control, MIDI monitor, mapping import/export
- Keyboard shortcuts (press **?** in the app)

## Development

```bash
npm test          # unit tests (BPM detection, MIDI mapping, sync math, ...)
npm run typecheck # TypeScript checks
npm run build     # production build into dist/
```

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the architecture and code map.

## License

MIT — see [LICENSE](LICENSE).
