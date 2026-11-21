/**
 * Track parts: splits a deck into Bass, Vocal, Instru(ments) and Highs that can be cut one by one.
 *
 * Not AI stem separation: a frequency + stereo split (Linkwitz-Riley crossovers, so with every
 * part on the level is flat — only the phase shifts slightly around the crossover points).
 *  - Bass:   below ~150 Hz (kick + bass line)
 *  - Highs:  above ~7 kHz of the rest (hi-hats, cymbals, air)
 *  - Vocal:  the centre (mid) of what is left — lead vocals sit in the centre, as do some leads/snares
 *  - Instru: the sides of what is left (stereo pads, synths, guitars, reverb)
 */
export type Part = 'bass' | 'vocal' | 'instru' | 'highs';
export const PARTS: { id: Part; name: string; title: string }[] = [
  { id: 'bass', name: 'BASS', title: 'Kick and bass line (below ~150 Hz)' },
  { id: 'vocal', name: 'VOCAL', title: 'Centre of the mids: lead vocals (and anything else mixed in the centre)' },
  { id: 'instru', name: 'INSTRU', title: 'Sides of the mids: stereo synths, pads, guitars, reverb' },
  { id: 'highs', name: 'HATS', title: 'Hi-hats, cymbals and air (above ~7 kHz)' },
];

/** all-pass Q matching the sum of a 4th-order Linkwitz-Riley low- and high-pass */
const ALLPASS_Q = 0.5;

export class PartSplitter {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly on: Record<Part, boolean> = { bass: true, vocal: true, instru: true, highs: true };
  private gains: Record<Part, GainNode>;

  constructor(private ctx: AudioContext) {
    const gain = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // 4th-order (Linkwitz-Riley style) filters: two 2nd-order Butterworth stages
    const filter = (type: BiquadFilterType, freq: number): [BiquadFilterNode, BiquadFilterNode] => {
      const a = ctx.createBiquadFilter();
      const b = ctx.createBiquadFilter();
      for (const f of [a, b]) {
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = 20 * Math.log10(Math.SQRT1_2); // Butterworth; Web Audio takes low/high-pass Q in dB
      }
      a.connect(b);
      return [a, b];
    };
    this.input = gain();
    this.output = gain();
    this.gains = { bass: gain(), vocal: gain(), instru: gain(), highs: gain() };

    // Linkwitz-Riley crossovers: LP + HP of one crossover = an all-pass (flat level). The bass
    // branch gets the same all-pass as the 7 kHz split, so all parts stay in phase.
    const [lp1, lp2] = filter('lowpass', 150);
    const ap = ctx.createBiquadFilter();
    ap.type = 'allpass';
    ap.frequency.value = 7000;
    ap.Q.value = ALLPASS_Q;
    this.input.connect(lp1);
    lp2.connect(ap).connect(this.gains.bass);
    const [hp1, hp2] = filter('highpass', 150);
    this.input.connect(hp1);
    const [hh1, hh2] = filter('highpass', 7000);
    const [ml1, ml2] = filter('lowpass', 7000);
    hp2.connect(hh1);
    hp2.connect(ml1);
    hh2.connect(this.gains.highs);
    const rest2 = ml2;

    // vocal = centre (L+R)/2 on both sides; instru = rest2 - centre
    const centre = ctx.createGain();
    centre.channelCount = 1;
    centre.channelCountMode = 'explicit'; // speakers down-mix: (L + R) / 2; up-mix copies it to L and R
    rest2.connect(centre).connect(this.gains.vocal);
    const sides = gain();
    rest2.connect(sides);
    centre.connect(gain(-1)).connect(sides);
    sides.connect(this.gains.instru);

    for (const g of Object.values(this.gains)) g.connect(this.output);
  }

  set(part: Part, on: boolean): void {
    this.on[part] = on;
    this.gains[part].gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
  }
}
