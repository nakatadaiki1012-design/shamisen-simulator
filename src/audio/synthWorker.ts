/**
 * 画面とは別のスレッドで三味線の音を計算する係。
 * 前もって作っておく音（事前準備）をここで作ると、計算中もタップの反応が遅れない。
 */
import { renderShamisen, ShamisenSynthOptions } from './shamisenSynth';

export interface SynthRequest {
  key: string;
  sampleRate: number;
  options: ShamisenSynthOptions;
}

self.onmessage = (e: MessageEvent<SynthRequest>) => {
  const { key, sampleRate, options } = e.data;
  const data = renderShamisen(sampleRate, options);
  (self as unknown as Worker).postMessage({ key, data }, [data.buffer]);
};
