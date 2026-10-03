/**
 * 三味線の音の決まりごと（勘所の番号・調子・本数）
 *
 * このアプリでは、弦の上の位置を「開放弦から何半音上か」（semitone）で持ち、
 * 画面に出すときに文化譜の番号やドレミに変換する。
 */

/** 弦の番号: 1 = 一の糸（いちばん太くて低い）, 2 = 二の糸, 3 = 三の糸（細くて高い） */
export type StringNo = 1 | 2 | 3;
export const STRINGS: StringNo[] = [1, 2, 3];
export const STRING_NAMES: Record<StringNo, string> = { 1: '一の糸', 2: '二の糸', 3: '三の糸' };
export const STRING_KANJI: Record<StringNo, string> = { 1: '一', 2: '二', 3: '三' };

/** 棹の上に表示する勘所の数（開放弦から 2 オクターブ = 24 半音まで） */
export const MAX_SEMITONE = 24;

/**
 * 文化譜の勘所番号（1 オクターブ分 = 12 種類）
 * 0 1 2 3 # 4 5 6 7 8 9 ♭ … 「#」は3と4の間、「♭」は9と10の間の勘所そのものを表す記号。
 * 1 オクターブ上は 10 11 12 13 1# 14 15 16 17 18 19 1♭、2 オクターブ上は 20。
 */
const BUNKA_BASE = ['0', '1', '2', '3', '#', '4', '5', '6', '7', '8', '9', '♭'];

export function bunkaLabel(semitone: number): string {
  const oct = Math.floor(semitone / 12);
  const base = BUNKA_BASE[semitone % 12];
  if (oct === 0) return base;
  if (base === '#' || base === '♭') return `${oct}${base}`;
  return String(oct * 10 + Number(base));
}

/** 文化譜の番号（文字）から半音数に戻す。見つからなければ null */
export function semitoneFromBunka(label: string): number | null {
  for (let s = 0; s <= MAX_SEMITONE; s++) if (bunkaLabel(s) === label) return s;
  return null;
}

const DOREMI = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
const WESTERN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const doremiName = (midi: number) => DOREMI[((midi % 12) + 12) % 12];
export const westernName = (midi: number) =>
  `${WESTERN[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * 本数（ほんすう）: 一の糸の高さの呼び方。一本 = ラ(A) から半音ずつ上がる。
 * 十二本まで。数字が大きいほど高い。
 */
export const HONSU_LIST = Array.from({ length: 12 }, (_, i) => i + 1);
const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
export const honsuName = (h: number) => `${KANJI_NUM[h - 1]}本`;
/** 一の糸の MIDI ノート番号（一本 = A2） */
export const honsuToMidi = (h: number) => 44 + h;

/** 調子（調弦）: 一の糸に対して二の糸・三の糸が何半音上か */
export interface Tuning {
  id: 'honchoshi' | 'niagari' | 'sansagari';
  name: string;
  reading: string;
  offsets: Record<StringNo, number>;
  howTo: string;
  mood: string;
}

export const TUNINGS: Tuning[] = [
  {
    id: 'honchoshi',
    name: '本調子',
    reading: 'ほんちょうし',
    offsets: { 1: 0, 2: 5, 3: 12 },
    howTo: '二の糸は一の糸の4度上（一の糸の「4」と同じ音）。三の糸は一の糸のちょうど1オクターブ上。',
    mood: 'いちばん基本の調弦。落ち着いた、格調のある響き。',
  },
  {
    id: 'niagari',
    name: '二上り',
    reading: 'にあがり',
    offsets: { 1: 0, 2: 7, 3: 12 },
    howTo: '本調子から二の糸を全音（2つ分）上げる。二の糸は一の糸の「6」と同じ音。',
    mood: '明るく華やかな響き。民謡や端唄によく使われる。',
  },
  {
    id: 'sansagari',
    name: '三下り',
    reading: 'さんさがり',
    offsets: { 1: 0, 2: 5, 3: 10 },
    howTo: '本調子から三の糸を全音（2つ分）下げる。三の糸は二の糸の「4」と同じ音。',
    mood: 'しっとりとした粋な響き。小唄・端唄・長唄に多い。',
  },
];

export const getTuning = (id: Tuning['id']) => TUNINGS.find((t) => t.id === id)!;

/** ある弦・勘所の MIDI ノート番号 */
export function noteMidi(tuning: Tuning, honsu: number, s: StringNo, semitone: number) {
  return honsuToMidi(honsu) + tuning.offsets[s] + semitone;
}

export type LabelMode = 'bunka' | 'doremi' | 'western';
export const LABEL_MODE_NAMES: Record<LabelMode, string> = {
  bunka: '文化譜',
  doremi: 'ドレミ',
  western: '音名',
};

export function positionLabel(
  mode: LabelMode,
  tuning: Tuning,
  honsu: number,
  s: StringNo,
  semitone: number
) {
  if (mode === 'bunka') return bunkaLabel(semitone);
  const midi = noteMidi(tuning, honsu, s, semitone);
  return mode === 'doremi' ? doremiName(midi) : westernName(midi);
}

/** 奏法 */
export type Technique = 'bachi' | 'sukui' | 'hajiki' | 'uchi' | 'suri';

export const TECHNIQUES: { id: Technique; name: string; mark: string; desc: string }[] = [
  { id: 'bachi', name: '撥（打つ）', mark: '', desc: '撥を上から振り下ろして糸と皮を打つ、基本の弾き方。「パン」と皮の音も鳴る。' },
  { id: 'sukui', name: 'スクイ', mark: 'ス', desc: '撥の先で糸を下からすくい上げる。軽くて柔らかい音。' },
  { id: 'hajiki', name: 'ハジキ', mark: 'ハ', desc: '撥を使わず、左手の指で糸をはじく。小さく優しい音。' },
  { id: 'uchi', name: '打ち指', mark: 'ウ', desc: '撥を使わず、左手の指で勘所を強く押さえて音を出す。' },
  { id: 'suri', name: 'スリ', mark: 'スリ', desc: '同じ糸の前の勘所から、指をすべらせて次の勘所へ移る。音がなめらかにつながる。' },
];
