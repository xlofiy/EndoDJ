/**
 * Guided DDJ-FLX2 controller test: asks the user to press / move each control (as listed in the
 * official manual) and checks which control EndoDJ's mapping turns it into. Pure logic; the
 * Controller dialog drives it.
 */
import { describeMidi, parseMidi, type ControlEvent, type ControlKind } from './mapping';

export interface TestStep {
  control: string;
  kind: ControlKind;
  prompt: string;
}

export type StepResult =
  | { status: 'pass'; raw: number[] }
  /** the controller sent something, but it is not mapped to this step's control */
  | { status: 'mismatch'; raw: number[]; got: string }
  | { status: 'fixed'; raw: number[] }
  | { status: 'skipped' };

function deckSteps(n: 1 | 2): TestStep[] {
  const side = n === 1 ? 'left' : 'right';
  const d = `deck${n}`;
  return [
    { control: `${d}.play`, kind: 'button', prompt: `Deck ${n} (${side}): press PLAY/PAUSE` },
    { control: `${d}.cue`, kind: 'button', prompt: `Deck ${n}: press CUE` },
    { control: `${d}.sync`, kind: 'button', prompt: `Deck ${n}: press BEAT SYNC` },
    { control: `${d}.shift`, kind: 'button', prompt: `Deck ${n}: press SHIFT` },
    { control: `${d}.start`, kind: 'button', prompt: `Deck ${n}: hold SHIFT and press CUE` },
    { control: `${d}.jogTouch`, kind: 'button', prompt: `Deck ${n}: touch the top of the jog wheel (don't turn it)` },
    { control: `${d}.jogScratch`, kind: 'jog', prompt: `Deck ${n}: touch the top of the jog wheel and turn it` },
    { control: `${d}.jogBend`, kind: 'jog', prompt: `Deck ${n}: turn the outer section of the jog wheel` },
    { control: `${d}.jogSeek`, kind: 'jog', prompt: `Deck ${n}: hold SHIFT and turn the top of the jog wheel` },
    { control: `${d}.tempo`, kind: 'knob', prompt: `Deck ${n}: move the TEMPO slider` },
    { control: `${d}.hotcue1`, kind: 'button', prompt: `Deck ${n}: select HOT CUE pad mode (SHIFT + BEAT SYNC, then pad 1), then press pad 1` },
    { control: `${d}.hotcue8`, kind: 'button', prompt: `Deck ${n}: in HOT CUE mode, press pad 8 (bottom right)` },
    { control: `${d}.hotcueClear1`, kind: 'button', prompt: `Deck ${n}: in HOT CUE mode, hold SHIFT and press pad 1` },
    { control: `${d}.padfx1`, kind: 'button', prompt: `Deck ${n}: select PAD FX mode (SHIFT + BEAT SYNC, then pad 2), then press pad 1` },
    { control: `${d}.beatloop1`, kind: 'button', prompt: `Deck ${n}: select BEAT LOOP mode (SHIFT + BEAT SYNC, then pad 3), then press pad 1` },
    { control: `${d}.sampler1`, kind: 'button', prompt: `Deck ${n}: select SAMPLER mode (SHIFT + BEAT SYNC, then pad 4), then press pad 1` },
    { control: `${d}.eqHigh`, kind: 'knob', prompt: `Mixer, channel ${n}: turn HI` },
    { control: `${d}.eqMid`, kind: 'knob', prompt: `Mixer, channel ${n}: turn MID` },
    { control: `${d}.eqLow`, kind: 'knob', prompt: `Mixer, channel ${n}: turn LOW` },
    { control: `${d}.filter`, kind: 'knob', prompt: `Mixer, channel ${n}: turn CFX` },
    { control: `${d}.pfl`, kind: 'button', prompt: `Mixer, channel ${n}: press the headphones CUE button` },
    { control: `${d}.volume`, kind: 'knob', prompt: `Mixer, channel ${n}: move the channel fader` },
  ];
}

export const FLX2_TEST_STEPS: TestStep[] = [
  ...deckSteps(1),
  ...deckSteps(2),
  { control: 'mixer.crossfader', kind: 'knob', prompt: 'Mixer: move the crossfader' },
  { control: 'mixer.masterCue', kind: 'button', prompt: 'Mixer: press MASTER CUE' },
];

/** Controls that arrive alongside the one being tested and must not count as a mismatch. */
function incidental(step: TestStep, control: string): boolean {
  if (control === step.control) return false;
  if (control.endsWith('.shift')) return true; // SHIFT is held for SHIFT combinations
  if (control.endsWith('.jogTouch') && step.kind === 'jog') return true; // touching precedes turning
  if (control.endsWith('.sync') && /\.(hotcue|padfx|beatloop|sampler)/.test(step.control)) return true; // pad-mode selection
  return false;
}

/**
 * Judge one incoming message for a step. Returns null when the message should be ignored
 * (button releases, incidental SHIFT / jog touch / mode-selection presses, pad-mode selection).
 */
export function evaluate(step: TestStep, raw: ArrayLike<number>, events: ControlEvent[]): StepResult | null {
  const m = parseMidi(raw);
  if (m.type === 'other') return null;
  if (m.type === 'note' && !m.on) return null; // releases
  const bytes = Array.from(raw);
  if (events.some((e) => e.control === step.control)) return { status: 'pass', raw: bytes };
  const relevant = events.filter((e) => !incidental(step, e.control));
  if (events.length && !relevant.length) return null;
  // while selecting a pad mode the user presses pads 1-4 on the same deck: that is not the answer yet
  const deck = step.control.match(/^deck(\d)\./)?.[1];
  if (deck && relevant.some((e) => /^deck\d\.(hotcue|padfx|beatloop|sampler)[1-4]$/.test(e.control) && e.control.startsWith(`deck${deck}.`)) && /\.(hotcue|padfx|beatloop|sampler)\d/.test(step.control)) {
    return null;
  }
  return { status: 'mismatch', raw: bytes, got: relevant[0]?.control ?? 'not mapped' };
}

/** Plain-text report the user can paste back. */
export function testReport(deviceName: string, results: (StepResult | undefined)[]): string {
  const lines = [`EndoDJ controller test — ${deviceName || 'unknown device'} — ${new Date().toISOString()}`, ''];
  const counts = { pass: 0, fixed: 0, mismatch: 0, skipped: 0, untested: 0 };
  FLX2_TEST_STEPS.forEach((s, i) => {
    const r = results[i];
    if (!r) {
      counts.untested++;
      lines.push(`[ -- ] ${s.control.padEnd(22)} not tested`);
      return;
    }
    counts[r.status]++;
    const raw = 'raw' in r ? `  ${describeMidi(r.raw)}` : '';
    const label = { pass: ' OK ', fixed: 'FIX ', mismatch: 'FAIL', skipped: 'SKIP' }[r.status];
    lines.push(`[${label}] ${s.control.padEnd(22)}${r.status === 'mismatch' ? ` → ${r.got}` : ''}${raw}`);
  });
  lines.splice(1, 0, `pass ${counts.pass} · fixed ${counts.fixed} · fail ${counts.mismatch} · skipped ${counts.skipped} · untested ${counts.untested}`);
  return lines.join('\n') + '\n';
}
