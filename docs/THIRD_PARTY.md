# Third-party material

## Ponytail (agent coding rules)
`AGENTS.md` contains the Ponytail ruleset from https://github.com/dietrichgebert/ponytail.

```
MIT License

Copyright (c) 2026 DietrichGebert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bundled sounds (`public/loops/`)

All bundled audio is **CC0 1.0 (public domain dedication)**, published on OpenGameArt.org.
Credit is not required by CC0; we give it anyway. Each loop was cut by script: tempo and beat grid
measured with EndoDJ's own detector (globally and on 40 s around the section), an exact whole
number of bars cut from a downbeat, 3 ms edge fades, normalised to −1 dBFS, encoded as Ogg Vorbis
(q5). Each encoded loop was decoded again and kept only if its tempo still matched and its length
was sample-exact. Five other candidate tracks failed that check and were left out.
Keys are labelled only where detection was confident (margin ≥ 0.05).

### Loops
| File | Source (title — author) | Cut | BPM | Key |
|------|-------------------------|-----|-----|-----|
| `cc0-techno-oioioi.ogg` | [OIOIOIOIOIOI](https://opengameart.org/content/oioioioioioi) — cinameng | 8 bars from 270.599 s | 110 | Bm |
| `cc0-techno-tense-drums.ogg` | [Tense Bass Boost Drum Loop 140 BPM](https://opengameart.org/content/tense-bass-boost-drum-loop-140-bpm) — Fupi | 2 bars from 0.171 s | 140 | D |
| `cc0-edm-technomania.ogg` | [Technomania101 - 2000's europop electronic dance music](https://opengameart.org/content/technomania101-2000s-europop-electronic-dance-music) (no-tempo-change version) — Fupi | 8 bars from 115.143 s | 142 | Bm |
| `cc0-eurobeat-fever-stadium.ogg` | [Fever Stadium](https://opengameart.org/content/fever-stadium) (bpm165 version) — MintoDog | 8 bars from 64.001 s | 165 | — (unclear) |
| `cc0-eurobeat-fever-climax.ogg` | [Fever Stadium](https://opengameart.org/content/fever-stadium) (climax, bpm180 version) — MintoDog | 8 bars from 64.004 s | 180 | — (unclear) |
| `cc0-eurobeat-super-santa.ogg` | [Super Santa Claus](https://opengameart.org/content/super-santa-claus) — MintoDog | 8 bars from 84.854 s | 170 | Am |
| `cc0-edm-simple-drumbeat.ogg` | [simple drumbeat](https://opengameart.org/content/simple-drumbeat) (body) — Turnovus | 8 bars from 20.578 s | 140 | — |
| `cc0-rave-wuffly.ogg` | [Things Got a Bit Ravey in Wuffly Land Tonight](https://opengameart.org/content/things-got-a-bit-ravey-in-wuffly-land-tonight) — Spring Spring | 8 bars from 268.865 s | 125 | — (unclear) |

### Sound effects (leading silence trimmed, at most 4.4 s, normalised)
| File | Source (title — author) |
|------|-------------------------|
| `cc0-vinyl-start-aidanwalker.ogg` | [Vinyl](https://opengameart.org/content/vinyl) — Aidan_Walker |
| `cc0-siren-aquinn.ogg` | [Sirens and Alarm Noise](https://opengameart.org/content/sirens-and-alarm-noise) (first 4 s) — aquinn |
| `cc0-distant-boom-nenadsimic.ogg` | [Muffled Distant Explosion](https://opengameart.org/content/muffled-distant-explosion) — NenadSimic |
| `cc0-laser-cannon-tad.ogg` | [Doomsday Laser Cannon Sound Effect](https://opengameart.org/content/doomsday-laser-cannon-sound-effect) (short) — TAD |
| `cc0-laser-kenney.ogg`, `cc0-zap-up-kenney.ogg`, `cc0-phaser-up-kenney.ogg`, `cc0-phaser-down-kenney.ogg` | [63 Digital sound effects](https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc) (laser1, zapThreeToneUp, phaserUp3, phaserDown2) — Kenney (www.kenney.nl) |
| `cc0-synth-laser-rubberduck.ogg`, `cc0-retro-explosion-rubberduck.ogg`, `cc0-power-up-rubberduck.ogg` | [50 CC0 retro / synth SFX](https://opengameart.org/content/50-cc0-retro-synth-sfx) (synth_laser_03, retro_explosion_02, power_up_04) — rubberduck |
| `cc0-swish-artisticdude.ogg` | [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) (swish-9) — artisticdude |

### Not found
No CC0 breakcore, hyperpop or scene loops passed the checks; those genres use EndoDJ's own
synthesised loops (`src/loops/catalog.ts`, MIT). The same goes for Hardstyle and Jersey Club: the only
CC0 hardstyle material found (OpenGameArt, "Hardstyler" by Of Far Different Nature) is a 28 s track
without a clear, loopable tempo, so it is not bundled. Freesound.org was not usable from the build
environment (it rejects automated requests; its API needs a personal key).
