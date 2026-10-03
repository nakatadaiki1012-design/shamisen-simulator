/**
 * 画面とは別のスレッドで三味線の音を計算する係。
 *
 * - 「今すぐ必要な音」（弾いたのにまだ無い音）は列の先頭に入れて最優先で作る
 * - 「前もって作っておく音」（事前準備）は列の後ろに入れ、1 音ずつ作る
 * - 1 音作るごとにいったん手を離すので、新しい依頼（最優先の音や取り消し）がすぐ割り込める
 */
import { renderShamisen, ShamisenSynthOptions } from './shamisenSynth';

export type WorkerRequest =
  | { type: 'render'; key: string; sampleRate: number; options: ShamisenSynthOptions; urgent: boolean }
  | { type: 'clearQueued' };

export interface WorkerResponse {
  key: string;
  data: Float32Array;
}

const queue: Extract<WorkerRequest, { type: 'render' }>[] = [];
const queued = new Set<string>();
let running = false;

function pump() {
  const job = queue.shift();
  if (!job) {
    running = false;
    return;
  }
  queued.delete(job.key);
  const data = renderShamisen(job.sampleRate, job.options);
  const res: WorkerResponse = { key: job.key, data };
  (self as unknown as Worker).postMessage(res, [data.buffer]);
  // 次の 1 音の前に、届いている依頼を受け取れるようにいったん手を離す
  setTimeout(pump, 0);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'clearQueued') {
    // 事前準備の残りを取り消す（最優先の音は残す）
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!queue[i].urgent) {
        queued.delete(queue[i].key);
        queue.splice(i, 1);
      }
    }
    return;
  }
  if (queued.has(msg.key)) {
    if (msg.urgent) {
      // すでに列にあるなら先頭へ
      const i = queue.findIndex((j) => j.key === msg.key);
      if (i > 0) queue.unshift({ ...queue.splice(i, 1)[0], urgent: true });
    }
  } else {
    queued.add(msg.key);
    if (msg.urgent) queue.unshift(msg);
    else queue.push(msg);
  }
  if (!running) {
    running = true;
    setTimeout(pump, 0);
  }
};
