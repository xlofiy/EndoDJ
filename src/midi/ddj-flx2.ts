/**
 * Default MIDI mapping for the Pioneer DJ / AlphaTheta DDJ-FLX2.
 *
 * ⚠️  NOT YET VERIFIED ON REAL HARDWARE.
 * This table follows the MIDI layout Pioneer uses across its DDJ-200 / DDJ-400 / DDJ-FLX4
 * family (deck 1 on MIDI channel 1, deck 2 on channel 2, mixer/browser on channel 7,
 * performance pads on channels 8-11, Beat FX on channel 5).
 * Use the MIDI monitor + MIDI Learn in EndoDJ to check and correct it, then update this file.
 *
 * Channels below are 0-based (0 = MIDI channel 1).
 *
 * Control-id conventions (handled in src/app/controls.ts):
 *   deck{1|2}.<action>     per-deck controls
 *   mixer.<action>         crossfader etc.
 *   browser.<action>       library navigation
 *   fx.<action>            Beat FX unit
 */
import type { MidiBinding } from './mapping';

const DECK_CH = [0, 1];
const PAD_CH = [7, 9]; // pads, deck 1 / deck 2
const PAD_SHIFT_CH = [8, 10]; // pads with SHIFT held
const MIXER_CH = 6;
const FX_CH = 4;

function deckBindings(d: 0 | 1): MidiBinding[] {
  const n = d + 1;
  const ch = DECK_CH[d];
  const b: MidiBinding[] = [
    { type: 'note', channel: ch, number: 0x0b, control: `deck${n}.play`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x0c, control: `deck${n}.cue`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x58, control: `deck${n}.sync`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x5c, control: `deck${n}.syncOff`, kind: 'button' }, // SHIFT+SYNC
    { type: 'note', channel: ch, number: 0x47, control: `deck${n}.reverse`, kind: 'button' }, // SHIFT+PLAY
    { type: 'note', channel: ch, number: 0x48, control: `deck${n}.start`, kind: 'button' }, // SHIFT+CUE
    { type: 'note', channel: ch, number: 0x3f, control: `deck${n}.shift`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x36, control: `deck${n}.jogTouch`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x67, control: `deck${n}.jogTouch`, kind: 'button' }, // touch w/ SHIFT
    { type: 'cc', channel: ch, number: 0x21, control: `deck${n}.jogBend`, kind: 'jog' }, // outer ring
    { type: 'cc', channel: ch, number: 0x22, control: `deck${n}.jogScratch`, kind: 'jog' }, // top, touched
    { type: 'cc', channel: ch, number: 0x23, control: `deck${n}.jogBend`, kind: 'jog' }, // top, not vinyl
    { type: 'cc', channel: ch, number: 0x29, control: `deck${n}.jogSeek`, kind: 'jog' }, // with SHIFT
    { type: 'cc', channel: ch, number: 0x00, lsb: 0x20, control: `deck${n}.tempo`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x13, lsb: 0x33, control: `deck${n}.volume`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x04, lsb: 0x24, control: `deck${n}.trim`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x07, lsb: 0x27, control: `deck${n}.eqHigh`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x0b, lsb: 0x2b, control: `deck${n}.eqMid`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x0f, lsb: 0x2f, control: `deck${n}.eqLow`, kind: 'knob' },
    { type: 'note', channel: ch, number: 0x54, control: `deck${n}.pfl`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x10, control: `deck${n}.loopIn`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x11, control: `deck${n}.loopOut`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x4d, control: `deck${n}.reloop`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x51, control: `deck${n}.loopHalve`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x53, control: `deck${n}.loopDouble`, kind: 'button' },
    // filter / Color FX knob lives on the mixer channel
    { type: 'cc', channel: MIXER_CH, number: 0x17 + d, lsb: 0x37 + d, control: `deck${n}.filter`, kind: 'knob' },
    { type: 'note', channel: MIXER_CH, number: 0x46 + d, control: `deck${n}.load`, kind: 'button' },
  ];
  for (let i = 0; i < 8; i++) {
    b.push(
      { type: 'note', channel: PAD_CH[d], number: 0x00 + i, control: `deck${n}.hotcue${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_SHIFT_CH[d], number: 0x00 + i, control: `deck${n}.hotcueClear${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x60 + i, control: `deck${n}.beatloop${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x20 + i, control: `deck${n}.beatjump${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x30 + i, control: `deck${n}.sampler${i + 1}`, kind: 'button' },
    );
  }
  return b;
}

export const DDJ_FLX2_NAME_PATTERN = /DDJ-?FLX2/i;

export function ddjFlx2Bindings(): MidiBinding[] {
  return [
    ...deckBindings(0),
    ...deckBindings(1),
    { type: 'cc', channel: MIXER_CH, number: 0x1f, lsb: 0x3f, control: 'mixer.crossfader', kind: 'knob' },
    { type: 'cc', channel: MIXER_CH, number: 0x40, control: 'browser.scroll', kind: 'encoder' },
    { type: 'note', channel: MIXER_CH, number: 0x41, control: 'browser.push', kind: 'button' },
    { type: 'note', channel: FX_CH, number: 0x47, control: 'fx.toggle', kind: 'button' },
    { type: 'note', channel: FX_CH, number: 0x4a, control: 'fx.beatDown', kind: 'button' },
    { type: 'note', channel: FX_CH, number: 0x4b, control: 'fx.beatUp', kind: 'button' },
    { type: 'note', channel: FX_CH, number: 0x63, control: 'fx.next', kind: 'button' },
    { type: 'cc', channel: FX_CH, number: 0x02, lsb: 0x22, control: 'fx.level', kind: 'knob' },
  ];
}
