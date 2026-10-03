/**
 * 三味線の音を計算で作る（Karplus-Strong 方式の撥弦合成）
 *
 * - 弦の振動: 遅延線 + ローパスで「ベン」という明るい減衰音（ループ利得は必ず 1 未満で安定）
 * - 撥の打音: 撥が胴の皮を叩く「パン」という音（ノイズ + 低い皮の鳴り）
 * - サワリ: 一の糸がわずかに上駒から浮いていて「ビーン」とうなる仕組み。
 *   ここでは (1) 弦の音を軽く歪ませた高域のうなり と
 *   (2) 一の糸と同じ音名（オクターブ違い・5度）を弾いたときの共鳴 で表現する。
 */
import { Technique } from '../data/notation';

export interface ShamisenSynthOptions {
  frequency: number;
  technique: Technique;
  /** 一の糸の開放弦の周波数（サワリの共鳴用） */
  ichiFrequency: number;
  sawari: boolean;
}

/** 余韻（-60dB になるまでの秒数） */
function decayTime(freq: number, technique: Technique) {
  const octaves = Math.log2(Math.max(60, freq) / 110);
  let t60 = 2.2 - octaves * 0.45;
  t60 = Math.max(0.9, Math.min(2.4, t60));
  if (technique === 'hajiki' || technique === 'uchi') t60 *= 0.7;
  return t60;
}

/** Karplus-Strong で 1 本の弦の振動を作る（正規化前の生波形） */
function pluckString(
  sampleRate: number,
  freq: number,
  seconds: number,
  t60: number,
  opts: { damping: number; hardness: number; pluckRatio: number }
): Float32Array {
  const total = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(total);
  const w = opts.damping;
  const period = sampleRate / freq;
  const N = Math.max(2, Math.floor(period - w - 0.1));
  const d = period - N - w;
  const apC = (1 - d) / (1 + d);
  const loopGain = Math.min(0.9995, Math.pow(10, -3 / (freq * t60)));

  // 励振（撥で弾いた瞬間の形）: 硬いほど高域の多いノイズ
  const exc = new Float32Array(N);
  const smooth = 0.1 + (1 - opts.hardness) * 0.7;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += (1 - smooth) * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
    mean += lp;
  }
  mean /= N;
  const P = Math.max(1, Math.round(N * opts.pluckRatio));
  const shaped = new Float32Array(N);
  for (let i = 0; i < N; i++) shaped[i] = exc[i] - mean - (i >= P ? exc[i - P] - mean : 0);

  const L = N + 2;
  const line = new Float32Array(L);
  let wi = 0;
  let prevTap = 0;
  let apIn = 0;
  let apOut = 0;
  for (let n = 0; n < total; n++) {
    const tap = line[(wi - N + L * 4) % L];
    const filtered = loopGain * ((1 - w) * tap + w * prevTap);
    prevTap = tap;
    const ap = apC * filtered + apIn - apC * apOut;
    apIn = filtered;
    apOut = ap;
    const y = ap + (n < N ? shaped[n] : 0);
    line[wi] = y;
    wi = (wi + 1) % L;
    out[n] = y;
  }
  return out;
}

function makeBiquad(type: 'bp' | 'hp', f0: number, q: number, sampleRate: number) {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const c =
    type === 'bp'
      ? { b0: alpha, b1: 0, b2: -alpha }
      : { b0: (1 + cos) / 2, b1: -(1 + cos), b2: (1 + cos) / 2 };
  const s = { x1: 0, x2: 0, y1: 0, y2: 0 };
  return (x: number) => {
    const y = (c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 + 2 * cos * s.y1 - (1 - alpha) * s.y2) / a0;
    s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y;
    return y;
  };
}

function normalize(buf: Float32Array) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 1e-6) for (let i = 0; i < buf.length; i++) buf[i] /= peak;
}

export function synthesizeShamisen(ctx: BaseAudioContext, o: ShamisenSynthOptions): AudioBuffer {
  const sr = ctx.sampleRate;
  const freq = Math.max(50, Math.min(sr / 8, o.frequency));
  const t60 = decayTime(freq, o.technique);
  const seconds = Math.min(2.6, t60 * 0.9);
  const total = Math.floor(sr * seconds);

  const isBachi = o.technique === 'bachi' || o.technique === 'suri';
  const isLeftHand = o.technique === 'hajiki' || o.technique === 'uchi';

  // 1. 弦の振動（撥は駒の近く＝弦長の約 7% を硬く打つ → 明るく鋭い音）
  // ハジキ: 指先で糸をはじく（やや明るい）/ 打ち指: 指で糸を叩きつける（丸くこもった音）
  const shape =
    o.technique === 'hajiki'
      ? { damping: 0.36, hardness: 0.6, pluckRatio: 0.18 }
      : o.technique === 'uchi'
        ? { damping: 0.45, hardness: 0.2, pluckRatio: 0.4 }
        : o.technique === 'sukui'
          ? { damping: 0.3, hardness: 0.7, pluckRatio: 0.07 }
          : { damping: 0.22, hardness: 0.95, pluckRatio: 0.07 };
  const raw = pluckString(sr, freq, seconds, t60, shape);
  normalize(raw);

  // 2. サワリの共鳴: 一の糸と同じ音名（オクターブ）なら強く、5度の関係なら少し
  let sympathetic: Float32Array | null = null;
  let sympLevel = 0;
  if (o.sawari) {
    const interval = Math.round(12 * Math.log2(freq / o.ichiFrequency));
    const pc = ((interval % 12) + 12) % 12;
    if (pc === 0) sympLevel = 0.35;
    else if (pc === 7) sympLevel = 0.15;
    if (sympLevel > 0) {
      sympathetic = pluckString(sr, o.ichiFrequency, seconds, 2.6, {
        damping: 0.3,
        hardness: 0.5,
        pluckRatio: 0.1,
      });
      normalize(sympathetic);
    }
  }

  // 3. 仕上げ: 胴鳴り・サワリのうなり・撥の打音
  const out = new Float32Array(total);
  const body1 = makeBiquad('bp', 380, 2.5, sr);
  const body2 = makeBiquad('bp', 1150, 3, sr);
  const buzzHp = makeBiquad('hp', 2200, 0.7, sr);
  const skinBp = makeBiquad('bp', 1500, 1.2, sr);
  const thumpBp = makeBiquad('bp', 170, 2, sr);

  const buzzAmt = o.sawari ? (isLeftHand ? 0.25 : 0.55) : 0;
  const skinAmt = o.technique === 'bachi' ? 0.38 : o.technique === 'suri' ? 0.2 : o.technique === 'sukui' ? 0.06 : 0;
  // 打ち指は、指が棹に当たる「トン」という小さな音
  const fingerTap = o.technique === 'uchi' ? 0.12 : 0;
  const skinLen = Math.floor(sr * 0.045);
  const thumpLen = Math.floor(sr * 0.09);
  const fadeLen = Math.floor(sr * 0.05);
  const level = isLeftHand ? 0.55 : o.technique === 'sukui' ? 0.75 : 1;

  for (let i = 0; i < total; i++) {
    let x = raw[i];
    if (sympathetic) x += sympathetic[i] * sympLevel * Math.min(1, i / (sr * 0.03));
    let y = x + body1(x) * 0.5 + body2(x) * 0.25;

    // サワリ: 強く歪ませた成分の高域だけを足す →「ビーン」というきらめき
    if (buzzAmt > 0) {
      const clipped = Math.tanh(x * 4) - x * 0.6;
      y += buzzHp(clipped) * buzzAmt;
    }

    // 撥が皮を叩く「パン」
    if (isBachi || o.technique === 'sukui') {
      if (i < skinLen) {
        const env = Math.pow(1 - i / skinLen, 3);
        y += skinBp(Math.random() * 2 - 1) * env * skinAmt * 4;
      }
      if (i < thumpLen && skinAmt > 0) {
        const env = Math.pow(1 - i / thumpLen, 2);
        y += thumpBp(Math.random() * 2 - 1) * env * skinAmt * 6;
      }
    }

    if (fingerTap > 0 && i < thumpLen) {
      const env = Math.pow(1 - i / thumpLen, 3);
      y += thumpBp(Math.random() * 2 - 1) * env * fingerTap * 6;
    }

    const fromEnd = total - 1 - i;
    if (fromEnd < fadeLen) y *= fromEnd / fadeLen;
    out[i] = isFinite(y) ? y : 0;
  }

  normalize(out);
  const buffer = ctx.createBuffer(1, total, sr);
  const ch = buffer.getChannelData(0);
  for (let i = 0; i < total; i++) ch[i] = out[i] * 0.85 * level;
  return buffer;
}
