/// <reference lib="webworker" />
/** Web Worker: BPM/beat-grid detection and waveform computation off the UI thread. */
import { detectBeatGrid } from './bpm';
import { computeWaveform } from './waveform';

export interface AnalysisRequest {
  id: number;
  channels: Float32Array[];
  sampleRate: number;
  /** skip BPM detection when the result is already cached */
  skipBpm: boolean;
}

export interface AnalysisResponse {
  id: number;
  bpm: number;
  firstBeat: number;
  confidence: number;
  waveform: { binsPerSec: number; peaks: Float32Array; lows: Float32Array };
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, channels, sampleRate, skipBpm } = e.data;
  const waveform = computeWaveform(channels, sampleRate);
  const grid = skipBpm ? { bpm: 0, firstBeat: 0, confidence: 0 } : detectBeatGrid(channels, sampleRate);
  const res: AnalysisResponse = { id, ...grid, waveform };
  (self as unknown as Worker).postMessage(res, [waveform.peaks.buffer, waveform.lows.buffer]);
};
