/**
 * 音を鳴らす係。
 * - 三味線は 1 本の糸で同時に 1 音しか出ないので、同じ糸で次の音を弾いたら前の音を止める
 * - スリ: 同じ糸の前の音の高さから、すべるように目的の音へ
 * - 軽い残響（ホールっぽさ）とコンプレッサーで音量をそろえる
 */
import { StringNo, Technique } from '../data/notation';
import { synthesizeShamisen } from './shamisenSynth';
import { unlockWebAudio } from './audioUnlock';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  freq: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<StringNo, Voice>();
  private cache = new Map<string, AudioBuffer[]>();
  sawari = true;

  init() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp);

      // 残響（減衰するノイズのインパルス応答）
      const reverb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.4);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
      }
      reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      master.connect(reverb);
      reverb.connect(wet);
      wet.connect(comp);

      this.ctx = ctx;
      this.master = master;
    }
    unlockWebAudio(this.ctx);
  }

  private getBuffer(freq: number, technique: Technique, ichiFreq: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${freq.toFixed(2)}|${technique}|${ichiFreq.toFixed(2)}|${this.sawari}`;
    let list = this.cache.get(key);
    if (!list) {
      list = [];
      this.cache.set(key, list);
    }
    // 毎回少し違う音になるよう、3 種類まで作ってローテーション
    if (list.length < 3) {
      const buf = synthesizeShamisen(ctx, { frequency: freq, technique, ichiFrequency: ichiFreq, sawari: this.sawari });
      list.push(buf);
      return buf;
    }
    list.push(list.shift()!);
    return list[0];
  }

  /** 糸の音を止める（短くフェードアウト） */
  private release(s: StringNo, time: number) {
    const v = this.voices.get(s);
    if (!v) return;
    v.gain.gain.cancelScheduledValues(time);
    v.gain.gain.setValueAtTime(v.gain.gain.value, time);
    v.gain.gain.linearRampToValueAtTime(0, time + 0.04);
    try {
      v.source.stop(time + 0.05);
    } catch {
      /* すでに止まっている */
    }
    this.voices.delete(s);
  }

  play(s: StringNo, freq: number, technique: Technique, ichiFreq: number, velocity = 1) {
    this.init();
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const prev = this.voices.get(s);
    const slideFrom = technique === 'suri' && prev ? prev.freq : null;
    this.release(s, now);

    const source = ctx.createBufferSource();
    source.buffer = this.getBuffer(freq, technique, ichiFreq);
    const gain = ctx.createGain();
    gain.gain.value = velocity;
    source.connect(gain);
    gain.connect(this.master!);

    if (slideFrom) {
      source.playbackRate.setValueAtTime(slideFrom / freq, now);
      source.playbackRate.linearRampToValueAtTime(1, now + 0.14);
    }
    source.start(now);
    source.onended = () => {
      if (this.voices.get(s)?.source === source) this.voices.delete(s);
    };
    this.voices.set(s, { source, gain, freq });
  }

  stopAll() {
    if (!this.ctx) return;
    for (const s of [...this.voices.keys()]) this.release(s, this.ctx.currentTime);
  }

  setSawari(on: boolean) {
    this.sawari = on;
  }
}

export const soundEngine = new SoundEngine();
