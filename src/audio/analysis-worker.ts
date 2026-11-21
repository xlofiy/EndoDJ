/// <reference lib="webworker" />
/** Web Worker: BPM/beat-grid detection and waveform computation off the UI thread. */
import { detectBeatGrid, mixToMono } from './bpm';
import { detectKey, keyName } from './key';
import { computeWaveform } from './waveform';

export interface AnalysisRequest {
  id: number;
  channels: Float32Array[];
  sampleRate: number;
  /** skip BPM detection when the result is already cached */
  skipBpm: boolean;
  /** skip key detection when the result is already cached */
  skipKey: boolean;
}

export interface AnalysisResponse {
  id: number;
  bpm: number;
  firstBeat: number;
  confidence: number;
  /** e.g. "Am"; null = no clear key (drums, noise) or skipped */
  key: string | null;
  waveform: { binsPerSec: number; peaks: Float32Array; lows: Float32Array };
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, channels, sampleRate, skipBpm, skipKey } = e.data;
  const waveform = computeWaveform(channels, sampleRate);
  const grid = skipBpm ? { bpm: 0, firstBeat: 0, confidence: 0 } : detectBeatGrid(channels, sampleRate);
  const k = skipKey ? null : detectKey(mixToMono(channels), sampleRate).key;
  const res: AnalysisResponse = { id, ...grid, key: k ? keyName(k) : null, waveform };
  (self as unknown as Worker).postMessage(res, [waveform.peaks.buffer, waveform.lows.buffer]);
};
