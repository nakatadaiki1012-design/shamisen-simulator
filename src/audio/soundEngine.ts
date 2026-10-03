/**
 * 音を鳴らす係。
 *
 * 遅れをなくすための仕組み:
 * - 音は前もって別スレッド（Worker）で全部作っておく（全勘所 0〜24 × 3 本）
 * - まだ作れていない音を弾いたときは、その場で計算せず、いちばん近い高さの
 *   できあがった音を「再生速度」で高さだけ合わせてすぐ鳴らす。同時に正確な音を
 *   Worker に最優先で頼み、できたら次からはそちらを使う
 * - 音量つまみ（GainNode）は使い回して、作っては捨てるのを減らす
 * - 画面に触れた瞬間（touchstart / pointerdown の最初）に、止まっている音の仕組みを起こす
 *
 * 三味線は 1 本の糸で同時に 1 音しか出ないので、同じ糸で次の音を弾いたら前の音を止める。
 */
import { StringNo, Technique } from '../data/notation';
import {
  ShamisenSynthOptions,
  StrikeKind,
  ToneClass,
  renderStrike,
  synthesizeShamisen,
  toAudioBuffer,
  toneClassOf,
} from './shamisenSynth';
import type { WorkerRequest, WorkerResponse } from './synthWorker';
import { unlockWebAudio } from './audioUnlock';

/** 取っておく音の数の上限（メモリを使いすぎないように。1 音およそ 0.3MB） */
const MAX_CACHED_NOTES = 130;
const GAIN_POOL_MAX = 24;
const STRIKE_VARIANTS = 4;

interface CacheEntry {
  buffer: AudioBuffer;
  freq: number;
  stringNo: StringNo;
  tone: ToneClass;
  open: boolean;
  /** 一の糸の高さとサワリの設定（これが違うと共鳴の様子が違う） */
  context: string;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  freq: number;
  startedAt: number;
}

export interface PlayOptions {
  ichiFreq: number;
  /** 開放弦か（一の糸の開放弦だけがサワリに直接触れる） */
  open: boolean;
  /** 0〜1。強く弾くほど大きく、撥の打音も強くなる */
  velocity?: number;
}

export interface EngineStats {
  cached: number;
  exactHits: number;
  fallbackHits: number;
  syncRenders: number;
  pooledGains: number;
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
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Omit<CacheEntry, 'buffer'>>();
  /** 「今すぐ必要」として頼んだ音（事前準備の取り消しでは消さない） */
  private urgentKeys = new Set<string>();
  private strikes = new Map<StrikeKind, AudioBuffer[]>();
  private strikeTurn = 0;
  private gainPool: GainNode[] = [];
  private unlocked = false;
  private worker: Worker | null | undefined;
  private stats: EngineStats = { cached: 0, exactHits: 0, fallbackHits: 0, syncRenders: 0, pooledGains: 0 };
  sawari = true;

  // ---------- 準備 ----------

  /**
   * 音の仕組みを用意する。画面を開いた直後に呼んでよい（まだ音は出ない状態で作られ、
   * 最初に画面に触れたときに resume() で鳴らせるようになる）。
   */
  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(comp);

    // 残響（減衰するノイズのインパルス応答）
    const reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.14;
    master.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);

    this.ctx = ctx;
    this.master = master;
    this.output = comp;

    // 撥・指の打音は短いので、ここで作っておく（合計 数ミリ秒）
    for (const kind of ['tataki', 'uchi', 'hajiki'] as StrikeKind[]) {
      const list: AudioBuffer[] = [];
      for (let v = 0; v < (kind === 'tataki' ? STRIKE_VARIANTS : 2); v++) {
        list.push(toAudioBuffer(ctx, renderStrike(ctx.sampleRate, kind, v)));
      }
      this.strikes.set(kind, list);
    }
    this.getWorker();
  }

  /**
   * 止まっている音の仕組みを起こす。タッチの最初のイベントで呼ぶ。
   * すでに動いていれば何もしない（ほとんど時間がかからない）。
   */
  resume() {
    this.init();
    const ctx = this.ctx!;
    if (!this.unlocked || ctx.state !== 'running') {
      this.unlocked = true;
      unlockWebAudio(ctx);
    }
  }

  get ready() {
    return this.ctx !== null;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  // ---------- 音の作り置き ----------

  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const w = new Worker(new URL('./synthWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.store(e.data.key, e.data.data);
      w.onerror = () => {
        // Worker が動かない環境では、空き時間に画面と同じスレッドで作る
        this.worker = null;
        const waiting = [...this.pending.entries()];
        this.pending.clear();
        this.renderInIdle(waiting);
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  private contextKey(ichiFreq: number) {
    return `${ichiFreq.toFixed(2)}|${this.sawari ? 1 : 0}`;
  }

  private cacheKey(s: StringNo, freq: number, tone: ToneClass, open: boolean, ichiFreq: number) {
    return `${s}|${freq.toFixed(2)}|${tone}|${open ? 1 : 0}|${this.contextKey(ichiFreq)}`;
  }

  private store(key: string, data: Float32Array) {
    const meta = this.pending.get(key);
    this.pending.delete(key);
    this.urgentKeys.delete(key);
    if (!meta || !this.ctx) return;
    this.cache.delete(key);
    this.cache.set(key, { ...meta, buffer: toAudioBuffer(this.ctx, data) });
    while (this.cache.size > MAX_CACHED_NOTES) this.cache.delete(this.cache.keys().next().value!);
    this.stats.cached = this.cache.size;
  }

  private request(s: StringNo, freq: number, tone: ToneClass, open: boolean, ichiFreq: number, urgent: boolean) {
    if (!this.ctx) return;
    const key = this.cacheKey(s, freq, tone, open, ichiFreq);
    if (this.cache.has(key) || (this.pending.has(key) && !urgent)) return;
    const options: ShamisenSynthOptions = {
      frequency: freq,
      stringNo: s,
      tone,
      open,
      ichiFrequency: ichiFreq,
      sawari: this.sawari,
    };
    this.pending.set(key, { freq, stringNo: s, tone, open, context: this.contextKey(ichiFreq) });
    if (urgent) this.urgentKeys.add(key);
    const worker = this.getWorker();
    if (worker) {
      const msg: WorkerRequest = { type: 'render', key, sampleRate: this.ctx.sampleRate, options, urgent };
      worker.postMessage(msg);
    } else {
      this.renderInIdle([[key, this.pending.get(key)!]], urgent ? 0 : 30);
    }
  }

  /** Worker が使えないときの予備: 空き時間に 1 音ずつ作る */
  private renderInIdle(jobs: [string, Omit<CacheEntry, 'buffer'>][], delay = 30) {
    let i = 0;
    const step = () => {
      if (!this.ctx || i >= jobs.length) return;
      const [key, m] = jobs[i++];
      if (!this.cache.has(key)) {
        this.pending.set(key, m);
        const buf = synthesizeShamisen(this.ctx, {
          frequency: m.freq,
          stringNo: m.stringNo,
          tone: m.tone,
          open: m.open,
          ichiFrequency: Number(m.context.split('|')[0]),
          sawari: m.context.endsWith('|1'),
        });
        this.store(key, buf.getChannelData(0).slice());
      }
      setTimeout(step, delay);
    };
    setTimeout(step, delay);
  }

  /**
   * 今の調子・本数で使う音を全部、前もって作っておく（Worker で 1 音ずつ）。
   * notes の順番に作るので、よく使う低い勘所を先に並べるとよい。
   */
  prewarm(notes: { s: StringNo; freq: number; open: boolean }[], ichiFreq: number, tones: ToneClass[] = ['tataki']) {
    this.init();
    this.worker?.postMessage({ type: 'clearQueued' } satisfies WorkerRequest);
    // 取り消した事前準備の印を消す（最優先で頼んだ音はそのまま待つ）
    for (const key of [...this.pending.keys()]) if (!this.urgentKeys.has(key)) this.pending.delete(key);
    for (const tone of tones) {
      for (const n of notes) this.request(n.s, n.freq, tone, n.open, ichiFreq, false);
    }
  }

  /**
   * 鳴らす音を選ぶ。ぴったりの音がなければ、近い高さの音を再生速度で合わせて使う。
   * rate: 再生速度（1 ならそのまま）
   */
  private pick(s: StringNo, freq: number, tone: ToneClass, open: boolean, ichiFreq: number): { buffer: AudioBuffer; rate: number } {
    const key = this.cacheKey(s, freq, tone, open, ichiFreq);
    const exact = this.cache.get(key);
    if (exact) {
      this.cache.delete(key);
      this.cache.set(key, exact); // 最近使った音として残す
      this.stats.exactHits++;
      return { buffer: exact.buffer, rate: 1 };
    }
    // 正確な音を最優先で頼んでおく
    this.request(s, freq, tone, open, ichiFreq, true);

    // 近い音を探す（同じ糸・同じ弾き方 → 同じ糸 → どれでも の順で、高さが近いもの）
    const ctxKey = this.contextKey(ichiFreq);
    let best: CacheEntry | null = null;
    let bestScore = Infinity;
    for (const e of this.cache.values()) {
      const dist = Math.abs(Math.log2(e.freq / freq)) * 12; // 半音いくつ分ずれているか
      if (dist > 7) continue; // 離れすぎた音は音色が変わりすぎる
      let score = dist;
      if (e.stringNo !== s) score += 4;
      if (e.tone !== tone) score += 3;
      if (e.open !== open) score += 2;
      if (e.context !== ctxKey) score += 1;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      this.stats.fallbackHits++;
      return { buffer: best.buffer, rate: freq / best.freq };
    }
    // まだ何もできていない（Worker が動かない環境で最初の 1 音など）ときだけ、その場で作る
    this.stats.syncRenders++;
    const buffer = synthesizeShamisen(this.ctx!, {
      frequency: freq,
      stringNo: s,
      tone,
      open,
      ichiFrequency: ichiFreq,
      sawari: this.sawari,
    });
    this.pending.delete(key);
    this.cache.set(key, { buffer, freq, stringNo: s, tone, open, context: ctxKey });
    return { buffer, rate: 1 };
  }

  // ---------- 音量つまみの使い回し ----------

  private takeGain(): GainNode {
    const g = this.gainPool.pop();
    if (g) {
      this.stats.pooledGains = this.gainPool.length;
      return g;
    }
    const ng = this.ctx!.createGain();
    ng.connect(this.master!);
    return ng;
  }

  private returnGain(g: GainNode, at: number) {
    const ctx = this.ctx!;
    const wait = Math.max(0, (at - ctx.currentTime) * 1000) + 30;
    setTimeout(() => {
      g.gain.cancelScheduledValues(0);
      g.gain.value = 1;
      if (this.gainPool.length < GAIN_POOL_MAX) this.gainPool.push(g);
      else g.disconnect();
      this.stats.pooledGains = this.gainPool.length;
    }, wait);
  }

  /** 糸の音を止める（短くフェードアウト） */
  private release(s: StringNo, time: number) {
    const v = this.voices.get(s);
    if (!v) return;
    this.voices.delete(s);
    v.gain.gain.cancelScheduledValues(time);
    v.gain.gain.setValueAtTime(v.gain.gain.value, time);
    v.gain.gain.linearRampToValueAtTime(0, time + 0.03);
    try {
      v.source.stop(time + 0.04);
    } catch {
      /* すでに止まっている */
    }
  }

  // ---------- 鳴らす ----------

  /** 撥・指の打音を重ねる */
  private strike(kind: StrikeKind, level: number, when: number) {
    const list = this.strikes.get(kind);
    if (!list || level <= 0) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = list[this.strikeTurn++ % list.length];
    const g = this.takeGain();
    g.gain.value = level;
    src.connect(g);
    src.start(when);
    const end = when + src.buffer.duration;
    src.onended = () => src.disconnect();
    this.returnGain(g, end);
  }

  play(s: StringNo, freq: number, technique: Technique, opts: PlayOptions) {
    this.resume();
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const velocity = Math.max(0.05, Math.min(1, opts.velocity ?? 0.85));
    const tone = toneClassOf(technique);
    const prev = this.voices.get(s);
    const slideFrom = technique === 'suri' && prev && now - prev.startedAt < 3 ? prev.freq : null;
    this.release(s, now);

    const { buffer, rate } = this.pick(s, freq, tone, opts.open, opts.ichiFreq);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.takeGain();
    gain.gain.value = 0.3 + 0.7 * velocity;
    source.connect(gain);

    if (slideFrom) {
      source.playbackRate.setValueAtTime((rate * slideFrom) / freq, now);
      source.playbackRate.linearRampToValueAtTime(rate, now + 0.12);
    } else {
      source.playbackRate.value = rate;
    }
    source.start(now);

    // 撥・指の打音（強さに合わせて大きくなる）
    const hit = Math.pow(velocity, 1.6);
    if (technique === 'bachi') this.strike('tataki', 0.62 * hit, now);
    else if (technique === 'suri') this.strike('tataki', slideFrom ? 0 : 0.25 * hit, now);
    else if (technique === 'uchi') this.strike('uchi', 0.45 * hit, now);
    else if (technique === 'hajiki') this.strike('hajiki', 0.3 * hit, now);

    const voice: Voice = { source, gain, freq, startedAt: now };
    this.voices.set(s, voice);
    source.onended = () => {
      if (this.voices.get(s) === voice) this.voices.delete(s);
      source.disconnect();
    };
    this.returnGain(gain, now + buffer.duration / rate + 0.05);
  }

  /** その糸がまだ鳴っているか（両手モードの打ち指・ハジキの判定用） */
  isRinging(s: StringNo, withinSeconds = 1.5) {
    const v = this.voices.get(s);
    return !!v && !!this.ctx && this.ctx.currentTime - v.startedAt < withinSeconds;
  }

  /** その糸の音を止める（両手モードで押さえた指を離して消音するときなど） */
  mute(s: StringNo) {
    if (this.ctx) this.release(s, this.ctx.currentTime);
  }

  // ---------- メトロノーム ----------

  private clicks: OscillatorNode[] = [];

  /**
   * メトロノームの「カッ」という音を予約する。
   * delay: 今から何秒後 / level: 0 弱拍の裏 〜 2 小節の頭
   */
  scheduleClicks(beats: { delay: number; accent: boolean; level?: number }[]) {
    this.resume();
    const ctx = this.ctx!;
    this.stopClicks();
    const now = ctx.currentTime;
    for (const b of beats) this.clickAt(now + b.delay, b.level ?? (b.accent ? 2 : 1));
  }

  /** 決まった時刻（AudioContext の時計）に 1 回鳴らす */
  clickAt(t: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = this.takeGain();
    osc.frequency.value = level >= 2 ? 1760 : level >= 1 ? 1175 : 880;
    const peak = level >= 2 ? 0.35 : level >= 1 ? 0.22 : 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.06);
    this.clicks.push(osc);
    osc.onended = () => {
      this.clicks = this.clicks.filter((c) => c !== osc);
      osc.disconnect();
    };
    this.returnGain(g, t + 0.07);
  }

  get currentTime() {
    return this.ctx?.currentTime ?? 0;
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

  // ---------- 録音 ----------

  /** このブラウザで録音できるか */
  get canRecord() {
    return typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  /** 弾いた音の録音を始める */
  startRecording() {
    this.resume();
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

  // ---------- そのほか ----------

  /** マイク入力などを同じ AudioContext で使うため */
  get audioContext() {
    this.init();
    return this.ctx!;
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

  /** テスト・計測用 */
  getStats(): EngineStats & { pending: number } {
    return { ...this.stats, cached: this.cache.size, pending: this.pending.size };
  }
}

export const soundEngine = new SoundEngine();
