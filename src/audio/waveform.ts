/** Waveform summary used for drawing (pure, worker-safe). */

export interface WaveformData {
  /** bins per second of track time */
  binsPerSec: number;
  /** peak absolute amplitude per bin, 0..1 */
  peaks: Float32Array;
  /** share of low-frequency energy per bin, 0..1 (used for colouring) */
  lows: Float32Array;
}

export const WAVEFORM_BINS_PER_SEC = 150;

export function computeWaveform(
  channels: Float32Array[],
  sampleRate: number,
  binsPerSec = WAVEFORM_BINS_PER_SEC,
): WaveformData {
  const len = channels.length ? channels[0].length : 0;
  const binSize = Math.max(1, Math.floor(sampleRate / binsPerSec));
  const bins = Math.ceil(len / binSize);
  const peaks = new Float32Array(bins);
  const lows = new Float32Array(bins);
  const a = Math.exp((-2 * Math.PI * 200) / sampleRate);
  let lp = 0;
  const nCh = channels.length;
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    let eAll = 0;
    let eLow = 0;
    const end = Math.min(len, (b + 1) * binSize);
    for (let i = b * binSize; i < end; i++) {
      let x = 0;
      for (let c = 0; c < nCh; c++) x += channels[c][i];
      x /= nCh;
      const ax = x < 0 ? -x : x;
      if (ax > peak) peak = ax;
      lp = (1 - a) * x + a * lp;
      eAll += x * x;
      eLow += lp * lp;
    }
    peaks[b] = Math.min(1, peak);
    lows[b] = eAll > 1e-12 ? Math.min(1, eLow / eAll) : 0;
  }
  return { binsPerSec: sampleRate / binSize, peaks, lows };
}
