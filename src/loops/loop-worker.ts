/// <reference lib="webworker" />
/** Renders Loop Lab sounds off the UI thread. */
import { findLoop, renderLoop } from './catalog';

export interface LoopRenderRequest {
  id: number;
  loopId: string;
  sampleRate: number;
}

export interface LoopRenderResponse {
  id: number;
  channels: Float32Array[] | null;
  error?: string;
}

self.onmessage = (e: MessageEvent<LoopRenderRequest>) => {
  const { id, loopId, sampleRate } = e.data;
  const def = findLoop(loopId);
  if (!def) {
    (self as unknown as Worker).postMessage({ id, channels: null, error: `Unknown loop ${loopId}` } satisfies LoopRenderResponse);
    return;
  }
  const channels = renderLoop(def, sampleRate);
  (self as unknown as Worker).postMessage({ id, channels } satisfies LoopRenderResponse, channels.map((c) => c.buffer));
};
