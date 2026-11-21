/**
 * Default MIDI mapping for the Pioneer DJ / AlphaTheta DDJ-FLX2.
 *
 * Controls: taken from the official DDJ-FLX2 manual (DRI1917A, "Part names and functions"):
 *   per deck — jog wheel (top = scratch, outer = pitch bend, SHIFT + top = search), 8 Performance
 *   Pads (modes: Hot Cue, Pad FX, Beat Loop, Sampler; SHIFT + BEAT SYNC then pad 1-4 selects the
 *   mode), SHIFT, CUE (SHIFT = back to start), PLAY/PAUSE, BEAT SYNC, TEMPO slider;
 *   mixer — MASTER CUE, EQ HI/MID/LOW, CFX knob, headphone CUE, channel faders, SMART FADER,
 *   crossfader. Master/headphone level knobs are analog (no MIDI). There is no trim, no loop
 *   section, no browse encoder / LOAD buttons and no Beat FX section on this unit.
 *
 * ⚠️ MIDI numbers: NOT verified against the official "List of MIDI Messages" (not publicly
 * reachable from the build environment). They follow the layout Pioneer uses across the
 * DDJ-200 / DDJ-400 / DDJ-FLX4 family. Run Controller → "Test controller" in EndoDJ to check
 * every control and fix mismatches in one click, then update this file.
 *
 * Channels below are 0-based (0 = MIDI channel 1).
 */
import type { MidiBinding } from './mapping';

const DECK_CH = [0, 1];
const PAD_CH = [7, 9]; // pads, deck 1 / deck 2
const PAD_SHIFT_CH = [8, 10]; // pads with SHIFT held
const MIXER_CH = 6;

function deckBindings(d: 0 | 1): MidiBinding[] {
  const n = d + 1;
  const ch = DECK_CH[d];
  const b: MidiBinding[] = [
    { type: 'note', channel: ch, number: 0x0b, control: `deck${n}.play`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x0c, control: `deck${n}.cue`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x48, control: `deck${n}.start`, kind: 'button' }, // SHIFT+CUE
    { type: 'note', channel: ch, number: 0x58, control: `deck${n}.sync`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x3f, control: `deck${n}.shift`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x36, control: `deck${n}.jogTouch`, kind: 'button' },
    { type: 'note', channel: ch, number: 0x67, control: `deck${n}.jogTouch`, kind: 'button' }, // touch w/ SHIFT
    { type: 'cc', channel: ch, number: 0x21, control: `deck${n}.jogBend`, kind: 'jog' }, // outer section
    { type: 'cc', channel: ch, number: 0x22, control: `deck${n}.jogScratch`, kind: 'jog' }, // top, touched
    { type: 'cc', channel: ch, number: 0x23, control: `deck${n}.jogBend`, kind: 'jog' }, // top, not scratching
    { type: 'cc', channel: ch, number: 0x29, control: `deck${n}.jogSeek`, kind: 'jog' }, // SHIFT + top
    { type: 'cc', channel: ch, number: 0x00, lsb: 0x20, control: `deck${n}.tempo`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x13, lsb: 0x33, control: `deck${n}.volume`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x07, lsb: 0x27, control: `deck${n}.eqHigh`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x0b, lsb: 0x2b, control: `deck${n}.eqMid`, kind: 'knob' },
    { type: 'cc', channel: ch, number: 0x0f, lsb: 0x2f, control: `deck${n}.eqLow`, kind: 'knob' },
    { type: 'note', channel: ch, number: 0x54, control: `deck${n}.pfl`, kind: 'button' },
    // CFX knob (EndoDJ: filter) lives on the mixer channel
    { type: 'cc', channel: MIXER_CH, number: 0x17 + d, lsb: 0x37 + d, control: `deck${n}.filter`, kind: 'knob' },
  ];
  for (let i = 0; i < 8; i++) {
    b.push(
      { type: 'note', channel: PAD_CH[d], number: 0x00 + i, control: `deck${n}.hotcue${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_SHIFT_CH[d], number: 0x00 + i, control: `deck${n}.hotcueClear${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x10 + i, control: `deck${n}.padfx${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x60 + i, control: `deck${n}.beatloop${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_CH[d], number: 0x30 + i, control: `deck${n}.sampler${i + 1}`, kind: 'button' },
      { type: 'note', channel: PAD_SHIFT_CH[d], number: 0x30 + i, control: `deck${n}.samplerStop${i + 1}`, kind: 'button' },
    );
  }
  return b;
}

export const DDJ_FLX2_NAME_PATTERN = /DDJ-?FLX2/i;

/** FLX2 controls with no default binding yet (assign them with Learn / the controller test). */
export const UNBOUND_FLX2_CONTROLS = ['mixer.masterCue'] as const;

export function ddjFlx2Bindings(): MidiBinding[] {
  return [
    ...deckBindings(0),
    ...deckBindings(1),
    // reported on a real DDJ-FLX2: the crossfader sends its maximum at the A side
    { type: 'cc', channel: MIXER_CH, number: 0x1f, lsb: 0x3f, control: 'mixer.crossfader', kind: 'knob', invert: true },
  ];
}
