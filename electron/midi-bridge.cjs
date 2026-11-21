'use strict';
/**
 * Native MIDI for the desktop app (RtMidi via @julusian/midi — prebuilt, N-API, ships in the
 * installer). Windows only lets one program open a MIDI port, and Chromium's Web MIDI does not
 * always see USB controllers there, so the desktop app talks to the DDJ-FLX2 through this bridge
 * and the page never opens Web MIDI ports itself.
 */

/** Port-name helpers (pure, unit-tested). */
function pickController(names) {
  return names.find((n) => /DDJ-?FLX2/i.test(n)) ?? names.find((n) => /DDJ/i.test(n)) ?? names[0] ?? null;
}

/** The output that belongs to an input: same name, else one that contains / is contained in it. */
function pickOutput(inputName, outputs) {
  if (!inputName) return null;
  const base = inputName.replace(/\s*\d+$/, '').trim().toLowerCase();
  return (
    outputs.find((o) => o === inputName) ??
    outputs.find((o) => o.toLowerCase().includes(base) || base.includes(o.replace(/\s*\d+$/, '').trim().toLowerCase())) ??
    null
  );
}

class MidiBridge {
  /** @param {(channel: string, payload: unknown) => void} send */
  constructor(send) {
    this.send = send;
    this.lib = null;
    this.input = null;
    this.output = null;
    this.inputName = null;
    this.outputName = null;
    this.ports = { inputs: [], outputs: [], error: null };
    this.timer = null;
  }

  load() {
    if (this.lib) return this.lib;
    this.lib = require('@julusian/midi');
    return this.lib;
  }

  list() {
    try {
      const { Input, Output } = this.load();
      return { inputs: Input.getPortNames(), outputs: Output.getPortNames(), error: null };
    } catch (e) {
      return { inputs: [], outputs: [], error: `MIDI system unavailable: ${e && e.message ? e.message : e}` };
    }
  }

  state() {
    return { ...this.ports, input: this.inputName, output: this.outputName };
  }

  close() {
    for (const p of [this.input, this.output]) {
      try {
        p && p.closePort();
        p && p.destroy && p.destroy();
      } catch {
        /* already closed */
      }
    }
    this.input = this.output = null;
    this.inputName = this.outputName = null;
  }

  /** Open an input by name ('' = none; undefined = pick the controller automatically). */
  open(name) {
    this.close();
    this.ports = this.list();
    const target = name === undefined ? pickController(this.ports.inputs) : name;
    if (!target) return this.state();
    try {
      const { Input, Output } = this.load();
      const input = new Input();
      input.ignoreTypes(true, true, true); // sysex, clock, active sensing
      input.on('message', (_dt, msg) => this.send('endodj:midi-message', msg));
      input.openPortByName(target);
      this.input = input;
      this.inputName = target;
      const outName = pickOutput(target, this.ports.outputs);
      if (outName) {
        const output = new Output();
        output.openPortByName(outName);
        this.output = output;
        this.outputName = outName;
      }
      this.ports.error = null;
    } catch (e) {
      this.close();
      this.ports.error = `Could not open “${target}”: ${e && e.message ? e.message : e}. Close other DJ software (rekordbox, Serato) that may be using the controller, then replug it.`;
    }
    return this.state();
  }

  sendOut(bytes) {
    if (!this.output || !Array.isArray(bytes) || bytes.length > 3 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return;
    try {
      this.output.sendMessage(bytes);
    } catch {
      /* device gone */
    }
  }

  /** Watch for plugging / unplugging; reconnect automatically to the controller. */
  watch() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = this.list();
      const changed = now.inputs.join('|') !== this.ports.inputs.join('|') || now.outputs.join('|') !== this.ports.outputs.join('|');
      if (!changed) return;
      const lost = this.inputName && !now.inputs.includes(this.inputName);
      this.ports = { ...now, error: this.ports.error };
      if (lost) this.close();
      if (!this.inputName && pickController(now.inputs)) this.open(undefined);
      this.send('endodj:midi-ports', this.state());
    }, 2000);
  }

  dispose() {
    clearInterval(this.timer);
    this.close();
  }
}

module.exports = { MidiBridge, pickController, pickOutput };
