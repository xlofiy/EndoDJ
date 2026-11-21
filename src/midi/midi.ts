/**
 * MIDI device handling: input/output selection, monitor, mapping persistence.
 * Desktop app: native MIDI through the main process (see electron/midi-bridge.cjs).
 * Browser: Web MIDI.
 */
import { describeMidi, MidiMapper, type ControlEvent, type MidiBinding } from './mapping';
import { ddjFlx2Bindings, DDJ_FLX2_NAME_PATTERN } from './ddj-flx2';
import { native, type NativeMidiState } from '../library/library';

export interface MidiPort {
  id: string;
  name: string;
}

const STORAGE_KEY = 'endodj.midi.bindings.v1';
const XFADE_FIX_KEY = 'endodj.midi.xfadeFix';

export class MidiController {
  readonly mapper: MidiMapper;
  access: MIDIAccess | null = null;
  input: MidiPort | null = null;
  output: MidiPort | null = null;
  /** true when the desktop app's native MIDI is in use (falls back to Web MIDI if it cannot start) */
  useNative = !!native;
  private nativeState: NativeMidiState | null = null;
  private webInput: MIDIInput | null = null;
  private webOutput: MIDIOutput | null = null;
  monitor = false;
  monitorLog: string[] = [];
  onEvent: ((e: ControlEvent) => void) | null = null;
  /** While set (controller test), messages go here instead of driving the app. */
  onTest: ((raw: Uint8Array, events: ControlEvent[]) => void) | null = null;
  onChange: (() => void) | null = null;
  error = '';

  constructor() {
    this.mapper = new MidiMapper(MidiController.loadBindings());
  }

  static loadBindings(): MidiBinding[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MidiBinding[];
        if (Array.isArray(parsed)) return MidiController.migrate(parsed);
      }
    } catch {
      /* corrupt or unavailable storage → defaults */
    }
    return ddjFlx2Bindings();
  }

  /** One-time fixes for mappings saved by older versions. */
  static migrate(bindings: MidiBinding[]): MidiBinding[] {
    try {
      if (localStorage.getItem(XFADE_FIX_KEY)) return bindings;
      localStorage.setItem(XFADE_FIX_KEY, '1');
    } catch {
      return bindings;
    }
    // the FLX2 crossfader runs B→A: saved mappings from before that was known get it flipped once
    const fixed = bindings.map((b) => (b.control === 'mixer.crossfader' && b.channel === 6 && b.number === 0x1f ? { ...b, invert: !b.invert } : b));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed));
    } catch {
      /* storage unavailable */
    }
    return fixed;
  }

  saveBindings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mapper.getBindings()));
    } catch {
      /* storage unavailable */
    }
  }

  resetBindings(): void {
    this.mapper.setBindings(ddjFlx2Bindings());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.onChange?.();
  }

  importBindings(json: string): void {
    const parsed = JSON.parse(json) as MidiBinding[];
    if (!Array.isArray(parsed) || parsed.some((b) => typeof b.control !== 'string' || typeof b.number !== 'number')) {
      throw new Error('Not a valid EndoDJ mapping file.');
    }
    this.mapper.setBindings(parsed);
    this.saveBindings();
    this.onChange?.();
  }

  exportBindings(): string {
    return JSON.stringify(this.mapper.getBindings(), null, 2);
  }

  get supported(): boolean {
    return !!native || typeof navigator.requestMIDIAccess === 'function';
  }

  async init(): Promise<void> {
    if (native) {
      native.midi.onMessage((msg) => this.handle(new Uint8Array(msg)));
      native.midi.onPorts((st) => this.applyNative(st));
      this.applyNative(await native.midi.state());
      if (!this.input) this.applyNative(await native.midi.open());
      if (!this.nativeState?.error?.startsWith('MIDI system unavailable')) return;
      this.useNative = false; // native MIDI could not start on this machine: try Web MIDI
      this.error = '';
    }
    if (!this.supported) {
      this.error = 'Web MIDI is not available in this browser. Use Google Chrome, Microsoft Edge or the EndoDJ desktop app.';
      this.onChange?.();
      return;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = `MIDI access was refused: ${(e as Error).message}`;
      this.onChange?.();
      return;
    }
    this.access.onstatechange = () => {
      // re-pick the controller on hot-plug
      if (!this.webInput || this.webInput.state === 'disconnected') this.autoSelect();
      this.onChange?.();
    };
    this.autoSelect();
  }

  private applyNative(st: NativeMidiState | null): void {
    if (!st || !this.useNative) return;
    this.nativeState = st;
    this.error = st.error ?? '';
    this.input = st.input ? { id: st.input, name: st.input } : null;
    this.output = st.output ? { id: st.output, name: st.output } : null;
    this.onChange?.();
  }

  inputs(): MidiPort[] {
    if (this.useNative) return (this.nativeState?.inputs ?? []).map((n) => ({ id: n, name: n }));
    return this.access
      ? Array.from(this.access.inputs.values())
          .filter((i) => i.state === 'connected')
          .map((i) => ({ id: i.id, name: i.name ?? i.id }))
      : [];
  }

  private autoSelect(): void {
    const ins = this.inputs();
    const pick = ins.find((i) => DDJ_FLX2_NAME_PATTERN.test(i.name)) ?? ins.find((i) => /DDJ/i.test(i.name)) ?? ins[0];
    void this.selectInput(pick?.id ?? '');
  }

  async selectInput(id: string): Promise<void> {
    if (native && this.useNative) {
      this.applyNative(await native.midi.open(id));
      return;
    }
    if (this.webInput) this.webInput.onmidimessage = null;
    this.webInput = this.access?.inputs.get(id) ?? null;
    this.webOutput = null;
    if (this.webInput) {
      this.webInput.onmidimessage = (e) => this.handle(e.data);
      // matching output (LED feedback) usually has the same name
      this.webOutput = Array.from(this.access!.outputs.values()).find((o) => o.name === this.webInput!.name) ?? null;
    }
    this.input = this.webInput ? { id: this.webInput.id, name: this.webInput.name ?? this.webInput.id } : null;
    this.output = this.webOutput ? { id: this.webOutput.id, name: this.webOutput.name ?? '' } : null;
    this.onChange?.();
  }

  private handle(data: Uint8Array | null): void {
    if (!data) return;
    if (this.monitor) {
      this.monitorLog.push(describeMidi(data));
      if (this.monitorLog.length > 200) this.monitorLog.shift();
      this.onChange?.();
    }
    const wasLearning = this.mapper.learning;
    const events = this.mapper.handle(data);
    if (this.onTest) this.onTest(data, events);
    else for (const ev of events) this.onEvent?.(ev);
    if (wasLearning && !this.mapper.learning) {
      this.saveBindings();
      this.onChange?.();
    }
  }

  setLed(control: string, on: boolean): void {
    if (!this.output) return;
    for (const msg of this.mapper.ledMessages(control, on)) {
      try {
        if (native && this.useNative) native.midi.send(msg);
        else this.webOutput?.send(msg);
      } catch {
        /* device gone */
      }
    }
  }
}
