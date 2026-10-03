/**
 * 音を鳴らす係。
 * - 三味線は 1 本の糸で同時に 1 音しか出ないので、同じ糸で次の音を弾いたら前の音を止める
 * - スリ: 同じ糸の前の音の高さから、すべるように目的の音へ
 * - 軽い残響（ホールっぽさ）とコンプレッサーで音量をそろえる
 */
import { StringNo, Technique } from '../data/notation';
import { synthesizeShamisen, toAudioBuffer } from './shamisenSynth';
import type { SynthRequest } from './synthWorker';
import { unlockWebAudio } from './audioUnlock';

/** 取っておく音の種類の上限（メモリを使いすぎないように） */
const MAX_CACHED_NOTES = 120;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  freq: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private output: AudioNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private recordChunks: Blob[] = [];
  private recordStart = 0;
  private voices = new Map<StringNo, Voice>();
  private cache = new Map<string, AudioBuffer[]>();
  private prewarmGen = 0;
  private unlocked = false;
  private pendingVariants = new Set<string>();
  /** 別スレッドの計算係（使えない環境では null） */
  private worker: Worker | null | undefined;

  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const w = new Worker(new URL('./synthWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ key: string; data: Float32Array }>) => {
        const { key, data } = e.data;
        this.pendingVariants.delete(key);
        if (!this.ctx) return;
        const list = this.cache.get(key) ?? [];
        if (list.length < 2) {
          list.push(toAudioBuffer(this.ctx, data));
          this.remember(key, list);
        }
      };
      w.onerror = () => {
        // Worker が動かない環境では、画面と同じスレッドで作る方式にもどす
        this.worker = null;
        this.pendingVariants.clear();
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  /** 音をあとで作っておく（Worker があればそちらで、なければ空き時間に） */
  private synthLater(freq: number, technique: Technique, ichiFreq: number, delay = 400) {
    const key = this.cacheKey(freq, technique, ichiFreq);
    if (this.pendingVariants.has(key) || !this.ctx) return;
    this.pendingVariants.add(key);
    const worker = this.getWorker();
    if (worker) {
      const req: SynthRequest = {
        key,
        sampleRate: this.ctx.sampleRate,
        options: { frequency: freq, technique, ichiFrequency: ichiFreq, sawari: this.sawari },
      };
      worker.postMessage(req);
      return;
    }
    setTimeout(() => {
      this.pendingVariants.delete(key);
      const cur = this.cache.get(key) ?? [];
      if (cur.length < 2 && this.ctx) {
        cur.push(this.synth(freq, technique, ichiFreq));
        this.remember(key, cur);
      }
    }, delay);
  }
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
      this.output = comp;
    }
    // 音が止められている（スマホのスリープ後など）ときだけ、もう一度鳴らせる状態にする
    if (!this.unlocked || this.ctx.state !== 'running') {
      this.unlocked = true;
      unlockWebAudio(this.ctx);
    }
  }

  private cacheKey(freq: number, technique: Technique, ichiFreq: number) {
    return `${freq.toFixed(2)}|${technique}|${ichiFreq.toFixed(2)}|${this.sawari}`;
  }

  private synth(freq: number, technique: Technique, ichiFreq: number) {
    return synthesizeShamisen(this.ctx!, { frequency: freq, technique, ichiFrequency: ichiFreq, sawari: this.sawari });
  }

  /** 作った音はしばらく取っておく（使っていない古いものから捨てる） */
  private remember(key: string, list: AudioBuffer[]) {
    this.cache.delete(key);
    this.cache.set(key, list);
    while (this.cache.size > MAX_CACHED_NOTES) {
      this.cache.delete(this.cache.keys().next().value!);
    }
  }

  private getBuffer(freq: number, technique: Technique, ichiFreq: number): AudioBuffer {
    const key = this.cacheKey(freq, technique, ichiFreq);
    const list = this.cache.get(key) ?? [];
    if (list.length === 0) {
      // はじめての音はその場で作る
      list.push(this.synth(freq, technique, ichiFreq));
    } else {
      list.push(list.shift()!);
    }
    this.remember(key, list);
    // 毎回少し違う音になるよう、2 種類目は空いている時間に作っておく（弾いた瞬間の処理を軽く）
    if (list.length < 2) this.synthLater(freq, technique, ichiFreq);
    return list[list.length - 1];
  }

  /**
   * よく使う音（撥で弾いた全部の勘所）を、空いている時間に少しずつ作っておく。
   * こうするとタップしてから音が出るまでの遅れが減る。
   */
  prewarm(notes: { freq: number; ichiFreq: number }[]) {
    if (!this.ctx) return;
    const gen = ++this.prewarmGen;
    if (this.getWorker()) {
      for (const { freq, ichiFreq } of notes) {
        if (!this.cache.has(this.cacheKey(freq, 'bachi', ichiFreq))) this.synthLater(freq, 'bachi', ichiFreq);
      }
      return;
    }
    let i = 0;
    const step = () => {
      if (gen !== this.prewarmGen || !this.ctx) return;
      const start = performance.now();
      while (i < notes.length && performance.now() - start < 8) {
        const { freq, ichiFreq } = notes[i++];
        const key = this.cacheKey(freq, 'bachi', ichiFreq);
        if (!this.cache.has(key)) this.remember(key, [this.synth(freq, 'bachi', ichiFreq)]);
      }
      if (i < notes.length) setTimeout(step, 30);
    };
    setTimeout(step, 50);
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
      // 鳴り終わった音のつながりを外す（長時間使ってもブラウザが重くならないように）
      source.disconnect();
      gain.disconnect();
    };
    this.voices.set(s, { source, gain, freq });
  }

  private clicks: OscillatorNode[] = [];

  /**
   * メトロノームの「カッ」という音を予約する。
   * delays: 今から何秒後に鳴らすか / accent: 強拍（高い音）
   */
  scheduleClicks(beats: { delay: number; accent: boolean }[]) {
    this.init();
    const ctx = this.ctx!;
    this.stopClicks();
    const now = ctx.currentTime;
    for (const b of beats) {
      const t = now + b.delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = b.accent ? 1760 : 1175;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(b.accent ? 0.35 : 0.22, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.06);
      this.clicks.push(osc);
      osc.onended = () => {
        this.clicks = this.clicks.filter((c) => c !== osc);
        g.disconnect();
      };
    }
  }

  stopClicks() {
    for (const c of this.clicks) {
      try {
        c.stop();
      } catch {
        /* まだ始まっていない／止まっている */
      }
    }
    this.clicks = [];
  }

  /** このブラウザで録音できるか */
  get canRecord() {
    return typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  /** 弾いた音の録音を始める */
  startRecording() {
    this.init();
    const ctx = this.ctx!;
    if (!this.recordDest) {
      this.recordDest = ctx.createMediaStreamDestination();
      this.output!.connect(this.recordDest);
    }
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.recordChunks = [];
    this.recorder = new MediaRecorder(this.recordDest.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordChunks.push(e.data);
    };
    this.recorder.start();
    this.recordStart = performance.now();
  }

  /** 録音を止めて、聴いたりダウンロードしたりできる形で返す */
  stopRecording(): Promise<{ url: string; ext: string; seconds: number } | null> {
    const rec = this.recorder;
    if (!rec) return Promise.resolve(null);
    this.recorder = null;
    const seconds = (performance.now() - this.recordStart) / 1000;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.recordChunks, { type });
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        resolve(blob.size > 0 ? { url: URL.createObjectURL(blob), ext, seconds } : null);
      };
      rec.stop();
    });
  }

  stopAll() {
    this.stopClicks();
    if (!this.ctx) return;
    for (const s of [...this.voices.keys()]) this.release(s, this.ctx.currentTime);
  }

  setSawari(on: boolean) {
    this.sawari = on;
  }

  /** 音が実際にスピーカーから出るまでの遅れ（ミリ秒）。Bluetooth などでは大きくなる */
  get outputLatencyMs() {
    if (!this.ctx) return 0;
    const lat = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency || this.ctx.baseLatency || 0;
    return Math.min(400, lat * 1000);
  }

  get ready() {
    return this.ctx !== null;
  }
}

export const soundEngine = new SoundEngine();
