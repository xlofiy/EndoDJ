# EndoDJ

*Endo* — from the Greek ἔνδον, "inside, within".

EndoDJ is free, open source DJ software that runs in your browser (Chrome / Edge) or as a desktop app,
built first and foremost for the **Pioneer DJ / AlphaTheta DDJ-FLX2** controller — no license fees,
no subscriptions.

> Status: **early development (v0.1)**. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what works today
> and what is planned, and [`docs/HANDOFF.md`](docs/HANDOFF.md) for how to pick development back up.

## Quick start

Requirements: [Node.js](https://nodejs.org) 20+ and **Google Chrome or Microsoft Edge**
(Web MIDI — needed to talk to the controller — is only available in Chromium-based browsers).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) in Chrome/Edge, plug in the DDJ-FLX2,
and allow MIDI access when the browser asks.

## Features (v0.1 target)

- 2 decks with waveform display, play/cue/sync, pitch fader (±6/10/16/50 %), nudge, scratch via jog wheels
- Automatic BPM detection and beat grid, beat-matching sync
- 8 hot cues per deck (saved per track), auto loops, loop halve/double, beat jump
- Mixer: trim, 3-band EQ, filter (Color FX) knob, channel faders, crossfader with curve
- Beat-synced effects: echo, reverb, flanger, phaser, bitcrusher
- Library: import a music folder, search & sort, analysis cached in the browser
- Playlists / setlists, play history, export to text/M3U/CSV
- Automix, recording of your mix
- Headphone cue (pre-fader listen) on multi-channel or split outputs
- DDJ-FLX2 MIDI mapping + **MIDI Learn** to remap any control, and a MIDI monitor

## Development

```bash
npm test          # unit tests (BPM detection, MIDI mapping, sync math, ...)
npm run typecheck # TypeScript checks
npm run build     # production build into dist/
```

## License

MIT — see [LICENSE](LICENSE).
