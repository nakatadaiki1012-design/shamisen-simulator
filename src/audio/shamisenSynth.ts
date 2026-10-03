/**
 * 三味線の音を計算で作る（Karplus-Strong 方式の撥弦合成）
 *
 * 音は 2 つの層でできている:
 *  1. 糸の層（この関数で作る）… 糸の振動・胴鳴り・サワリ・共鳴弦
 *  2. 撥の層（makeStrikeLayer）… 撥が皮を叩く「パン」、打ち指の「トン」など
 * 撥の層は音の高さに関係ないので別に作っておき、鳴らすときに強さ（ベロシティ）に
 * 合わせて音量を変えて重ねる。こうすると強弱を変えても作り直さなくてよい。
 *
 * サワリ:
 *  一の糸の開放弦は、上駒の「山（さわり）」に糸がわずかに触れている。
 *  振動の大きい立ち上がりでは糸が山に当たって「ビーン」と高い倍音が出て、
 *  振れ幅が小さくなると当たらなくなって澄んだ音に戻る。
 *  これを「糸が山の高さを越えて振れた部分（片側だけ）」から作るうなりで再現する。
 *  振れ幅が山の高さより小さくなるとうなりは自然に消える。
 *
 * 共鳴弦:
 *  ほかの糸で一の糸と同じ音名（8度）・5度・4度の関係の音を弾くと、
 *  一の糸の開放弦が共鳴して、サワリの「ビーン」も一緒に鳴る。
 */
import { StringNo, Technique } from '../data/notation';

/** 音色の種類（スリは叩きの音色で、音程だけすべらせる） */
export type ToneClass = 'tataki' | 'sukui' | 'hajiki' | 'uchi';

export function toneClassOf(t: Technique): ToneClass {
  if (t === 'sukui' || t === 'hajiki' || t === 'uchi') return t;
  return 'tataki';
}

export interface ShamisenSynthOptions {
  frequency: number;
  stringNo: StringNo;
  tone: ToneClass;
  /** 開放弦（どこも押さえていない）か。一の糸の開放弦だけがサワリに直接触れる */
  open: boolean;
  /** 一の糸の開放弦の周波数（共鳴弦用） */
  ichiFrequency: number;
  sawari: boolean;
}

/** 糸ごとの性格 */
const STRING_CHARACTER: Record<
  StringNo,
  { damping: number; decay: number; body: number; presence: number; pluckShift: number }
> = {
  // 一の糸: 極太の絹。重厚な低音、倍音が豊かで余韻が長い
  1: { damping: 0.14, decay: 1.12, body: 0.9, presence: 0.15, pluckShift: 0 },
  // 二の糸: 中太。芯のある中音
  2: { damping: 0.24, decay: 1.0, body: 0.55, presence: 0.2, pluckShift: 0.01 },
  // 三の糸: 細い。鋭く抜けがよく、立ち上がりがいちばん速い
  3: { damping: 0.15, decay: 0.85, body: 0.2, presence: 0.7, pluckShift: -0.025 },
};

/** 奏法ごとの弾き方 */
const TONE_CHARACTER: Record<
  ToneClass,
  { hardness: number; pluckRatio: number; decay: number; attackMs: number; level: number }
> = {
  // 叩き: 撥を駒の近くに強く打ち下ろす。硬く明るい
  tataki: { hardness: 0.97, pluckRatio: 0.07, decay: 1, attackMs: 0, level: 1 },
  // 掬い: 撥先で下からすくう。打音がなく柔らかい立ち上がりで、基音がはっきり
  sukui: { hardness: 0.55, pluckRatio: 0.11, decay: 0.95, attackMs: 4, level: 0.78 },
  // ハジキ: 左手の指先で糸をはじく。鋭いが短い
  hajiki: { hardness: 1, pluckRatio: 0.16, decay: 0.6, attackMs: 0, level: 0.62 },
  // 打ち指: 左手の指で糸を棹に打ちつける。鈍く、高い音は控えめ
  uchi: { hardness: 0.12, pluckRatio: 0.38, decay: 0.62, attackMs: 2, level: 0.5 },
};

/** 余韻（-60dB になるまでの秒数） */
function decayTime(freq: number, s: StringNo, tone: ToneClass) {
  const octaves = Math.log2(Math.max(60, freq) / 110);
  let t60 = 2.3 - octaves * 0.45;
  t60 = Math.max(0.8, Math.min(2.6, t60));
  return t60 * STRING_CHARACTER[s].decay * TONE_CHARACTER[tone].decay;
}

/** 毎回同じ乱数（作り直すたびに音が変わりすぎないように） */
function makeRandom(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}

interface PluckOptions {
  damping: number;
  hardness: number;
  pluckRatio: number;
  seed: number;
}

/** Karplus-Strong で 1 本の糸の振動を作る（正規化前の生波形） */
function pluckString(sampleRate: number, freq: number, seconds: number, t60: number, o: PluckOptions): Float32Array {
  const total = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(total);
  const w = o.damping;
  const period = sampleRate / freq;
  const N = Math.max(2, Math.floor(period - w - 0.1));
  const d = period - N - w;
  const apC = (1 - d) / (1 + d);
  const loopGain = Math.min(0.9996, Math.pow(10, -3 / (freq * t60)));

  // 励振（撥や指で弾いた瞬間の形）: 硬いほど高い音の多いノイズ
  const rand = makeRandom(o.seed);
  const exc = new Float32Array(N);
  const smooth = 0.06 + (1 - o.hardness) * 0.8;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += (1 - smooth) * (rand() - lp);
    exc[i] = lp;
    mean += lp;
  }
  mean /= N;
  const P = Math.max(1, Math.round(N * o.pluckRatio));
  const shaped = new Float32Array(N);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    shaped[i] = exc[i] - mean - (i >= P ? exc[i - P] - mean : 0);
    peak = Math.max(peak, Math.abs(shaped[i]));
  }

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

function makeBiquad(type: 'bp' | 'hp' | 'lp' | 'peak', f0: number, q: number, sampleRate: number, gainDb = 0) {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'bp') {
    [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'hp') {
    [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'lp') {
    [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  } else {
    const A = Math.pow(10, gainDb / 40);
    [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function peakOf(buf: Float32Array) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak;
}

/** 生成する長さ（秒） */
export function noteSeconds(o: Pick<ShamisenSynthOptions, 'frequency' | 'stringNo' | 'tone'>) {
  return Math.min(2.4, Math.max(0.5, decayTime(o.frequency, o.stringNo, o.tone) * 0.85));
}

/** 一の糸の共鳴の強さ（弾いた音と一の糸の開放弦の関係で決まる） */
export function sympatheticLevel(o: Pick<ShamisenSynthOptions, 'frequency' | 'stringNo' | 'open' | 'ichiFrequency' | 'sawari'>) {
  if (!o.sawari) return 0;
  // 一の糸を押さえているとき・一の糸の開放弦そのものは共鳴しない（自分自身が鳴っているため）
  if (o.stringNo === 1) return 0;
  const interval = Math.round(12 * Math.log2(o.frequency / o.ichiFrequency));
  const pc = ((interval % 12) + 12) % 12;
  // 高い音ほど一の糸との結びつきが弱い（1オクターブ離れるごとに弱くなる）
  const far = 1 + Math.max(0, interval - 12) / 12;
  if (pc === 0) return 0.16 / far; // 8度（同じ音名）
  if (pc === 7) return 0.09 / far; // 5度
  if (pc === 5) return 0.06 / far; // 4度
  return 0;
}

/** 糸の層の波形を計算する。画面とは別のスレッド（Worker）でも使える */
export function renderShamisen(sr: number, o: ShamisenSynthOptions): Float32Array {
  const freq = Math.max(50, Math.min(sr / 8, o.frequency));
  const sc = STRING_CHARACTER[o.stringNo];
  const tc = TONE_CHARACTER[o.tone];
  const t60 = decayTime(freq, o.stringNo, o.tone);
  const seconds = noteSeconds({ frequency: freq, stringNo: o.stringNo, tone: o.tone });
  const total = Math.floor(sr * seconds);
  const seed = Math.round(freq * 100) * 7 + o.stringNo * 131 + o.tone.length * 17;

  // 1. 糸の振動。一の糸の開放弦は、サワリの山に触れる
  const touchesSawari = o.sawari && o.stringNo === 1 && o.open;
  const raw = pluckString(sr, freq, seconds, t60, {
    damping: Math.min(0.5, sc.damping + (1 - tc.hardness) * 0.18),
    hardness: tc.hardness,
    pluckRatio: Math.max(0.03, tc.pluckRatio + sc.pluckShift),
    seed,
  });
  const rawPeak = peakOf(raw) || 1;

  // 2. 共鳴弦（一の糸の開放弦がつられて鳴る。サワリにも触れる）
  const sympLevel = sympatheticLevel(o);
  let symp: Float32Array | null = null;
  if (sympLevel > 0.01) {
    symp = pluckString(sr, o.ichiFrequency, seconds, t60 * 1.1, {
      damping: 0.18,
      hardness: 0.45,
      pluckRatio: 0.12,
      seed: seed + 99,
    });
    const sp = peakOf(symp) || 1;
    for (let i = 0; i < symp.length; i++) symp[i] /= sp;
  }

  // 3. 仕上げ: 胴鳴り（糸ごとに違う）・明るさ・立ち上がり
  const body1 = makeBiquad('peak', 300, 1.6, sr, 5 * sc.body);
  const body2 = makeBiquad('peak', 1100, 2.5, sr, 3);
  const presence = makeBiquad('peak', 2800, 1.2, sr, 6 * sc.presence);
  const dull = o.tone === 'uchi' ? makeBiquad('lp', 1800, 0.7, sr) : null;
  // サワリのうなり: 山の高さを越えて振れた部分（片側だけ）から高い倍音を作る。
  // 山の高さは、弾いた直後の雑音が収まったあと（20〜60ミリ秒）の振れ幅を基準にする
  let settled = 0;
  for (let i = Math.floor(sr * 0.02); i < Math.min(total, Math.floor(sr * 0.06)); i++) {
    settled = Math.max(settled, Math.abs(raw[i] / rawPeak));
  }
  const RIDGE = Math.max(0.005, settled * 0.05);
  const buzzHp = makeBiquad('hp', 1600, 0.7, sr);
  const buzzTone = makeBiquad('peak', 3200, 1, sr, 4);
  const buzzAmt = touchesSawari ? (o.tone === 'tataki' ? 2.2 : 1.6) : 0;
  const sympBuzzHp = makeBiquad('hp', 1600, 0.7, sr);
  const out = new Float32Array(total);
  const attack = Math.max(1, Math.floor((sr * tc.attackMs) / 1000));
  const fadeLen = Math.floor(sr * 0.05);
  const sympRise = sr * 0.035;

  for (let i = 0; i < total; i++) {
    const s0 = raw[i] / rawPeak;
    let x = s0;
    let buzz = 0;
    // 山に触れた瞬間に糸がパチッと当たる（波が急に切りかわる）→ 細かい倍音がたくさん出る
    if (buzzAmt > 0) buzz += buzzTone(buzzHp(s0 > RIDGE ? s0 : 0)) * buzzAmt;
    if (symp) {
      const sv = symp[i] * (1 - Math.exp(-i / sympRise));
      x += sv * sympLevel;
      // 共鳴した一の糸もサワリに触れて、かすかにうなる
      buzz += sympBuzzHp(sv > 0.12 ? sv : 0) * sympLevel * 1.2;
    }
    let y = presence(body2(body1(x))) + buzz;
    if (dull) y = dull(y);
    if (i < attack) y *= i / attack;
    const fromEnd = total - 1 - i;
    if (fromEnd < fadeLen) y *= fromEnd / fadeLen;
    out[i] = Number.isFinite(y) ? y : 0;
  }

  const p = peakOf(out) || 1;
  const gain = (0.8 * tc.level) / p;
  for (let i = 0; i < total; i++) out[i] *= gain;
  return out;
}

/**
 * 撥・指の層（音の高さに関係しない打音）
 * - tataki: 撥先が皮を強く叩く。カチッという撥先の音 + 皮の「パン」+ 胴の 200〜400Hz の鳴り
 * - uchi:   指が棹を打つ鈍い「トン」
 * - hajiki: 指先が糸をはじく小さな「チッ」
 */
export type StrikeKind = 'tataki' | 'uchi' | 'hajiki';

export function renderStrike(sr: number, kind: StrikeKind, variant: number): Float32Array {
  const rand = makeRandom(1234 + variant * 777 + kind.length * 31);
  const seconds = kind === 'tataki' ? 0.16 : 0.06;
  const total = Math.floor(sr * seconds);
  const out = new Float32Array(total);
  const v = variant * 0.07; // 毎回少しずつ違う叩き方
  if (kind === 'tataki') {
    const click = makeBiquad('bp', 3200 * (1 + v), 0.9, sr);
    const skin = makeBiquad('bp', 1250 * (1 - v / 2), 1.1, sr);
    const bodyA = makeBiquad('bp', 240 * (1 + v), 4, sr);
    const bodyB = makeBiquad('bp', 380 * (1 - v), 5, sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const n = rand();
      let y = 0;
      y += click(n) * Math.exp(-t / 0.0025) * 1.6;
      y += skin(n) * Math.exp(-t / 0.018) * 1.4;
      // 胴の共鳴は叩いた瞬間の衝撃で鳴りはじめ、少し長く残る
      const impulse = i < sr * 0.004 ? n * (1 - i / (sr * 0.004)) : 0;
      y += bodyA(impulse * 6 + n * 0.15 * Math.exp(-t / 0.01)) * 2.4 * Math.exp(-t / 0.07);
      y += bodyB(impulse * 6 + n * 0.12 * Math.exp(-t / 0.01)) * 1.8 * Math.exp(-t / 0.05);
      out[i] = y;
    }
  } else if (kind === 'uchi') {
    const thump = makeBiquad('bp', 140, 2, sr);
    const knock = makeBiquad('lp', 900, 0.7, sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      const n = rand();
      out[i] = thump(n) * Math.exp(-t / 0.02) * 3 + knock(n) * Math.exp(-t / 0.004) * 0.6;
    }
  } else {
    const tick = makeBiquad('hp', 4000, 0.8, sr);
    for (let i = 0; i < total; i++) {
      const t = i / sr;
      out[i] = tick(rand()) * Math.exp(-t / 0.0015);
    }
  }
  const p = peakOf(out) || 1;
  const fade = Math.floor(sr * 0.01);
  for (let i = 0; i < total; i++) {
    out[i] = (out[i] / p) * 0.9;
    const fromEnd = total - 1 - i;
    if (fromEnd < fade) out[i] *= fromEnd / fade;
  }
  return out;
}

/** 計算した波形を、Web Audio で鳴らせる形（AudioBuffer）にする */
export function toAudioBuffer(ctx: BaseAudioContext, data: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  return buffer;
}

export function synthesizeShamisen(ctx: BaseAudioContext, o: ShamisenSynthOptions): AudioBuffer {
  return toAudioBuffer(ctx, renderShamisen(ctx.sampleRate, o));
}
