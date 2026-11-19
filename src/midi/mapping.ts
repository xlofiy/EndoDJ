/**
 * Generic MIDI → control mapping engine with MIDI Learn.
 * Pure logic (no Web MIDI objects) so it is unit-testable.
 */

export type ControlKind =
  /** note on/off or CC 0/127 → value 1 (pressed) / 0 (released) */
  | 'button'
  /** absolute 7-bit or 14-bit value → 0..1 */
  | 'knob'
  /** relative, two's complement (1 = +1, 127 = -1) → signed delta */
  | 'encoder'
  /** relative, centred on 64 (65 = +1, 63 = -1) → signed delta (Pioneer jog wheels) */
  | 'jog';

export interface MidiBinding {
  type: 'note' | 'cc';
  /** 0-15 */
  channel: number;
  /** note or CC number (MSB for 14-bit controls) */
  number: number;
  /** CC number carrying the low 7 bits of a 14-bit control */
  lsb?: number;
  control: string;
  kind: ControlKind;
  invert?: boolean;
}

export interface ControlEvent {
  control: string;
  kind: ControlKind;
  /** button: 0|1 · knob: 0..1 · encoder/jog: signed delta */
  value: number;
}

export interface ParsedMidi {
  type: 'note' | 'cc' | 'other';
  channel: number;
  number: number;
  value: number;
  /** true for note-on with velocity > 0 */
  on: boolean;
}

export function parseMidi(data: ArrayLike<number>): ParsedMidi {
  const status = data[0] ?? 0;
  const hi = status & 0xf0;
  const channel = status & 0x0f;
  const number = data[1] ?? 0;
  const value = data[2] ?? 0;
  if (hi === 0x90) return { type: 'note', channel, number, value, on: value > 0 };
  if (hi === 0x80) return { type: 'note', channel, number, value: 0, on: false };
  if (hi === 0xb0) return { type: 'cc', channel, number, value, on: value > 0 };
  return { type: 'other', channel, number, value, on: false };
}

export function describeMidi(data: ArrayLike<number>): string {
  const p = parseMidi(data);
  const hex = Array.from(data as ArrayLike<number>, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  if (p.type === 'other') return hex;
  return `${hex}  ${p.type === 'note' ? 'Note' : 'CC'} ch${p.channel + 1} #${p.number} = ${p.value}`;
}

function key(type: 'note' | 'cc', channel: number, number: number): string {
  return `${type}:${channel}:${number}`;
}

export class MidiMapper {
  private bindings: MidiBinding[] = [];
  private index = new Map<string, { binding: MidiBinding; part: 'msb' | 'lsb' | 'single' }[]>();
  private msb = new Map<string, number>();
  private learn: { control: string; kind: ControlKind; done: (b: MidiBinding) => void } | null = null;

  constructor(bindings: MidiBinding[] = []) {
    this.setBindings(bindings);
  }

  getBindings(): MidiBinding[] {
    return this.bindings.map((b) => ({ ...b }));
  }

  setBindings(bindings: MidiBinding[]): void {
    this.bindings = bindings.map((b) => ({ ...b }));
    this.index.clear();
    this.msb.clear();
    for (const b of this.bindings) {
      const add = (k: string, part: 'msb' | 'lsb' | 'single') => {
        const list = this.index.get(k) ?? [];
        list.push({ binding: b, part });
        this.index.set(k, list);
      };
      if (b.type === 'cc' && b.kind === 'knob' && b.lsb !== undefined) {
        add(key('cc', b.channel, b.number), 'msb');
        add(key('cc', b.channel, b.lsb), 'lsb');
      } else {
        add(key(b.type, b.channel, b.number), 'single');
      }
    }
  }

  bindingsFor(control: string): MidiBinding[] {
    return this.bindings.filter((b) => b.control === control);
  }

  /** Arm MIDI Learn: the next note-on / CC message is bound to `control`. */
  startLearn(control: string, kind: ControlKind, done: (b: MidiBinding) => void): void {
    this.learn = { control, kind, done };
  }

  cancelLearn(): void {
    this.learn = null;
  }

  get learning(): string | null {
    return this.learn?.control ?? null;
  }

  /** Feed a raw MIDI message; returns the resulting control events. */
  handle(data: ArrayLike<number>): ControlEvent[] {
    const m = parseMidi(data);
    if (m.type === 'other') return [];

    if (this.learn) {
      // ignore note-offs / zero values so a button release does not get learned
      if ((m.type === 'note' && !m.on) || (m.type === 'cc' && this.learn.kind === 'button' && m.value === 0)) {
        return [];
      }
      const { control, kind, done } = this.learn;
      this.learn = null;
      const binding: MidiBinding = { type: m.type, channel: m.channel, number: m.number, control, kind };
      const others = this.bindings.filter(
        (b) =>
          b.control !== control &&
          !(b.type === binding.type && b.channel === binding.channel && b.number === binding.number),
      );
      this.setBindings([...others, binding]);
      done(binding);
      return [];
    }

    const entries = this.index.get(key(m.type, m.channel, m.number));
    if (!entries) return [];
    const events: ControlEvent[] = [];
    for (const { binding: b, part } of entries) {
      let value: number;
      switch (b.kind) {
        case 'button':
          value = m.type === 'note' ? (m.on ? 1 : 0) : m.value > 0 ? 1 : 0;
          break;
        case 'knob': {
          if (part === 'msb') {
            this.msb.set(b.control, m.value);
            // emit coarse value immediately; the LSB that follows refines it
            value = (m.value << 7) / 16383;
          } else if (part === 'lsb') {
            const hi = this.msb.get(b.control) ?? 0;
            value = ((hi << 7) | m.value) / 16383;
          } else {
            value = m.value / 127;
          }
          if (b.invert) value = 1 - value;
          break;
        }
        case 'encoder':
          value = m.value < 64 ? m.value : m.value - 128;
          if (b.invert) value = -value;
          break;
        case 'jog':
          value = m.value - 64;
          if (b.invert) value = -value;
          break;
      }
      events.push({ control: b.control, kind: b.kind, value });
    }
    return events;
  }

  /** MIDI bytes to light an LED for a button control (Pioneer: same note, 0x7F on / 0x00 off). */
  ledMessages(control: string, on: boolean): number[][] {
    return this.bindingsFor(control)
      .filter((b) => b.kind === 'button')
      .map((b) => [(b.type === 'note' ? 0x90 : 0xb0) | b.channel, b.number, on ? 0x7f : 0x00]);
  }
}
