/** Web MIDI device handling: input/output selection, monitor, mapping persistence. */
import { describeMidi, MidiMapper, type ControlEvent, type MidiBinding } from './mapping';
import { ddjFlx2Bindings, DDJ_FLX2_NAME_PATTERN } from './ddj-flx2';

const STORAGE_KEY = 'endodj.midi.bindings.v1';

export class MidiController {
  readonly mapper: MidiMapper;
  access: MIDIAccess | null = null;
  input: MIDIInput | null = null;
  output: MIDIOutput | null = null;
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
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* corrupt or unavailable storage → defaults */
    }
    return ddjFlx2Bindings();
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
    return typeof navigator.requestMIDIAccess === 'function';
  }

  async init(): Promise<void> {
    if (!this.supported) {
      this.error = 'Web MIDI is not available in this browser. Use Google Chrome or Microsoft Edge.';
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
      if (!this.input || this.input.state === 'disconnected') this.autoSelect();
      this.onChange?.();
    };
    this.autoSelect();
  }

  inputs(): MIDIInput[] {
    return this.access ? Array.from(this.access.inputs.values()) : [];
  }

  outputs(): MIDIOutput[] {
    return this.access ? Array.from(this.access.outputs.values()) : [];
  }

  private autoSelect(): void {
    const ins = this.inputs().filter((i) => i.state === 'connected');
    const pick = ins.find((i) => DDJ_FLX2_NAME_PATTERN.test(i.name ?? '')) ?? ins.find((i) => /DDJ/i.test(i.name ?? '')) ?? ins[0];
    this.selectInput(pick?.id ?? '');
  }

  selectInput(id: string): void {
    if (this.input) this.input.onmidimessage = null;
    this.input = this.inputs().find((i) => i.id === id) ?? null;
    if (this.input) {
      this.input.onmidimessage = (e) => this.handle(e.data);
      // matching output (LED feedback) usually has the same name
      this.output = this.outputs().find((o) => o.name === this.input!.name) ?? null;
    } else this.output = null;
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
        this.output.send(msg);
      } catch {
        /* device gone */
      }
    }
  }
}
