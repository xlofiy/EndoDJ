import { describe, expect, it } from 'vitest';
// @ts-ignore — CommonJS module of the Electron main process
import { MidiBridge, pickController, pickOutput } from '../electron/midi-bridge.cjs';

class FakePort {
  static names: string[] = [];
  static failOpen = false;
  static getPortNames() {
    return this.names;
  }
  opened: string | null = null;
  sent: number[][] = [];
  handlers: ((dt: number, msg: number[]) => void)[] = [];
  ignoreTypes() {}
  on(_e: string, cb: (dt: number, msg: number[]) => void) {
    this.handlers.push(cb);
  }
  openPortByName(n: string) {
    if (FakePort.failOpen) throw new Error('MMSYSERR_ALLOCATED');
    this.opened = n;
  }
  closePort() {
    this.opened = null;
  }
  sendMessage(b: number[]) {
    this.sent.push(b);
  }
}
class FakeInput extends FakePort {}
class FakeOutput extends FakePort {
  static names: string[] = [];
}

function bridge(inputs: string[], outputs: string[]) {
  FakeInput.names = inputs;
  FakeOutput.names = outputs;
  FakePort.failOpen = false;
  const events: [string, unknown][] = [];
  const b = new MidiBridge((ch: string, p: unknown) => events.push([ch, p]));
  b.lib = { Input: FakeInput, Output: FakeOutput };
  return { b, events };
}

describe('native MIDI bridge', () => {
  it('picks the DDJ-FLX2 and its matching output', () => {
    expect(pickController(['Microsoft GS Wavetable', 'DDJ-FLX2'])).toBe('DDJ-FLX2');
    expect(pickController(['loopMIDI', 'DDJ-400'])).toBe('DDJ-400');
    expect(pickController([])).toBeNull();
    expect(pickOutput('DDJ-FLX2', ['Microsoft GS Wavetable Synth', 'DDJ-FLX2'])).toBe('DDJ-FLX2');
    expect(pickOutput('DDJ-FLX2', ['MIDIOUT2 (DDJ-FLX2)'])).toBe('MIDIOUT2 (DDJ-FLX2)');
    expect(pickOutput('DDJ-FLX2 0', ['DDJ-FLX2 1'])).toBe('DDJ-FLX2 1');
  });

  it('opens the controller automatically and forwards messages', () => {
    const { b, events } = bridge(['Microsoft GS Wavetable', 'DDJ-FLX2'], ['DDJ-FLX2']);
    const st = b.open(undefined);
    expect(st).toMatchObject({ input: 'DDJ-FLX2', output: 'DDJ-FLX2', error: null });
    (b.input as FakePort).handlers[0](0, [0x90, 0x0b, 0x7f]);
    expect(events).toContainEqual(['endodj:midi-message', [0x90, 0x0b, 0x7f]]);
  });

  it('only sends valid 1-3 byte messages to the LEDs', () => {
    const { b } = bridge(['DDJ-FLX2'], ['DDJ-FLX2']);
    b.open(undefined);
    b.sendOut([0x90, 0x0b, 0x7f]);
    b.sendOut([0x90, 0x0b, 300]);
    b.sendOut('nope');
    b.sendOut([1, 2, 3, 4]);
    expect((b.output as FakePort).sent).toEqual([[0x90, 0x0b, 0x7f]]);
  });

  it('explains a busy port (Windows allows one program per MIDI port)', () => {
    const { b } = bridge(['DDJ-FLX2'], ['DDJ-FLX2']);
    FakePort.failOpen = true;
    const st = b.open(undefined);
    expect(st.input).toBeNull();
    expect(st.error).toMatch(/Close other DJ software/);
  });

  it('reports a missing MIDI system instead of crashing', () => {
    const { b } = bridge([], []);
    b.lib = {
      Input: { getPortNames: () => { throw new Error('no ALSA'); } },
      Output: { getPortNames: () => [] },
    };
    expect(b.list().error).toMatch(/MIDI system unavailable/);
  });
});
