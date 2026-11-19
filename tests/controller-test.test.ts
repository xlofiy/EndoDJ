import { describe, expect, it } from 'vitest';
import { evaluate, FLX2_TEST_STEPS, testReport } from '../src/midi/controller-test';
import { ddjFlx2Bindings, UNBOUND_FLX2_CONTROLS } from '../src/midi/ddj-flx2';
import { MidiMapper } from '../src/midi/mapping';

const step = (control: string) => FLX2_TEST_STEPS.find((s) => s.control === control)!;
const mapper = () => new MidiMapper(ddjFlx2Bindings());

describe('DDJ-FLX2 controller test', () => {
  it('covers every default binding and the unbound FLX2 controls, with unique steps', () => {
    const tested = new Set(FLX2_TEST_STEPS.map((s) => s.control));
    expect(tested.size).toBe(FLX2_TEST_STEPS.length);
    const bound = new Set(ddjFlx2Bindings().map((b) => b.control));
    for (const s of FLX2_TEST_STEPS) expect(bound.has(s.control) || (UNBOUND_FLX2_CONTROLS as readonly string[]).includes(s.control)).toBe(true);
  });

  it('passes when the message maps to the expected control', () => {
    const m = mapper();
    const raw = [0x90, 0x0b, 0x7f];
    expect(evaluate(step('deck1.play'), raw, m.handle(raw))).toMatchObject({ status: 'pass' });
  });

  it('reports a mismatch with what the message maps to, or "not mapped"', () => {
    const m = mapper();
    const wrong = [0x90, 0x0c, 0x7f]; // CUE
    expect(evaluate(step('deck1.play'), wrong, m.handle(wrong))).toEqual({ status: 'mismatch', raw: wrong, got: 'deck1.cue' });
    const unknown = [0x9f, 0x70, 0x7f];
    expect(evaluate(step('deck1.play'), unknown, m.handle(unknown))).toEqual({ status: 'mismatch', raw: unknown, got: 'not mapped' });
  });

  it('ignores releases, SHIFT, jog touch and pad-mode selection', () => {
    const m = mapper();
    const release = [0x90, 0x0b, 0x00];
    expect(evaluate(step('deck1.play'), release, m.handle(release))).toBeNull();
    const shift = [0x90, 0x3f, 0x7f];
    expect(evaluate(step('deck1.hotcueClear1'), shift, m.handle(shift))).toBeNull();
    const touch = [0x90, 0x36, 0x7f];
    expect(evaluate(step('deck1.jogScratch'), touch, m.handle(touch))).toBeNull();
    const sync = [0x90, 0x58, 0x7f];
    expect(evaluate(step('deck1.beatloop1'), sync, m.handle(sync))).toBeNull();
    const modePad = [0x97, 0x02, 0x7f]; // pad 3 while choosing BEAT LOOP mode
    expect(evaluate(step('deck1.beatloop1'), modePad, m.handle(modePad))).toBeNull();
  });

  it('writes a readable report', () => {
    const r = testReport('DDJ-FLX2', [{ status: 'pass', raw: [0x90, 0x0b, 0x7f] }, { status: 'mismatch', raw: [0x90, 0x0c, 0x7f], got: 'deck1.cue' }]);
    expect(r).toContain('DDJ-FLX2');
    expect(r).toMatch(/\[ OK \] deck1\.play/);
    expect(r).toMatch(/\[FAIL\] deck1\.cue\s+→ deck1\.cue/);
    expect(r).toContain(`untested ${FLX2_TEST_STEPS.length - 2}`);
  });
});
