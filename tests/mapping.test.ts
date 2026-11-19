import { describe, expect, it } from 'vitest';
import { MidiMapper, parseMidi } from '../src/midi/mapping';
import { ddjFlx2Bindings } from '../src/midi/ddj-flx2';

describe('parseMidi', () => {
  it('treats note-on velocity 0 as note-off', () => {
    expect(parseMidi([0x90, 0x0b, 0]).on).toBe(false);
    expect(parseMidi([0x80, 0x0b, 0x40]).on).toBe(false);
    expect(parseMidi([0x91, 0x0b, 0x7f])).toMatchObject({ type: 'note', channel: 1, on: true });
  });
});

describe('MidiMapper', () => {
  const mapper = () => new MidiMapper(ddjFlx2Bindings());

  it('maps buttons with press and release', () => {
    const m = mapper();
    expect(m.handle([0x90, 0x0b, 0x7f])).toEqual([{ control: 'deck1.play', kind: 'button', value: 1 }]);
    expect(m.handle([0x91, 0x0b, 0x00])).toEqual([{ control: 'deck2.play', kind: 'button', value: 0 }]);
  });

  it('combines 14-bit MSB/LSB knobs', () => {
    const m = mapper();
    const coarse = m.handle([0xb0, 0x13, 0x40]);
    expect(coarse[0].value).toBeCloseTo((0x40 << 7) / 16383);
    const fine = m.handle([0xb0, 0x33, 0x7f]);
    expect(fine[0]).toMatchObject({ control: 'deck1.volume' });
    expect(fine[0].value).toBeCloseTo(((0x40 << 7) | 0x7f) / 16383);
    // full scale
    m.handle([0xb6, 0x1f, 0x7f]);
    expect(m.handle([0xb6, 0x3f, 0x7f])[0]).toEqual({ control: 'mixer.crossfader', kind: 'knob', value: 1 });
  });

  it('decodes jog wheel (centred on 64) and browse encoder (two’s complement)', () => {
    const m = mapper();
    expect(m.handle([0xb0, 0x22, 0x43])[0]).toMatchObject({ control: 'deck1.jogScratch', value: 3 });
    expect(m.handle([0xb1, 0x21, 0x3e])[0]).toMatchObject({ control: 'deck2.jogBend', value: -2 });
    expect(m.handle([0xb6, 0x40, 0x01])[0]).toMatchObject({ control: 'browser.scroll', value: 1 });
    expect(m.handle([0xb6, 0x40, 0x7f])[0]).toMatchObject({ control: 'browser.scroll', value: -1 });
  });

  it('maps pads per deck and shift layer', () => {
    const m = mapper();
    expect(m.handle([0x97, 0x02, 0x7f])[0].control).toBe('deck1.hotcue3');
    expect(m.handle([0x99, 0x07, 0x7f])[0].control).toBe('deck2.hotcue8');
    expect(m.handle([0x98, 0x00, 0x7f])[0].control).toBe('deck1.hotcueClear1');
  });

  it('ignores unmapped messages', () => {
    expect(mapper().handle([0x9f, 0x7e, 0x7f])).toEqual([]);
    expect(mapper().handle([0xf8])).toEqual([]);
  });

  it('MIDI Learn rebinds a control and removes the old binding', () => {
    const m = mapper();
    let learned = false;
    m.startLearn('deck1.play', 'button', () => (learned = true));
    expect(m.handle([0x90, 0x01, 0x00])).toEqual([]); // note-off ignored while learning
    expect(m.learning).toBe('deck1.play');
    m.handle([0x9e, 0x01, 0x7f]);
    expect(learned).toBe(true);
    expect(m.learning).toBeNull();
    expect(m.handle([0x9e, 0x01, 0x7f])[0].control).toBe('deck1.play');
    expect(m.handle([0x90, 0x0b, 0x7f])).toEqual([]);
  });

  it('builds LED messages for buttons', () => {
    expect(mapper().ledMessages('deck2.play', true)).toEqual([[0x91, 0x0b, 0x7f]]);
  });
});
