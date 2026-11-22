/**
 * Programme loudness in dB (pure, tested): mean power of 400 ms blocks with an absolute gate
 * (-60 dB) and a relative gate (10 dB under the gated mean), like EBU R128 / LUFS but without the
 * K-weighting filter — enough to level tracks against each other. null for silence.
 */
export function loudnessDb(channels: Float32Array[], sampleRate: number): number | null {
  const n = channels[0]?.length ?? 0;
  const block = Math.max(1, Math.round(sampleRate * 0.4));
  const powers: number[] = [];
  for (let start = 0; start + block <= n; start += block) {
    let sum = 0;
    for (const ch of channels) for (let i = start; i < start + block; i++) sum += ch[i] * ch[i];
    powers.push(sum / (block * channels.length));
  }
  const gated = (ps: number[], floor: number) => ps.filter((p) => p > floor);
  const abs = gated(powers, 1e-6); // -60 dB
  if (!abs.length) return null;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = gated(abs, mean / 10); // -10 dB relative
  return 10 * Math.log10(rel.reduce((a, b) => a + b, 0) / rel.length);
}

/** Auto-gain: dB to add so a track at `loudness` plays at `target`, limited to -12 … +9 dB. */
export function autoGainDb(loudness: number, target = -10): number {
  return Math.max(-12, Math.min(9, target - loudness));
}
