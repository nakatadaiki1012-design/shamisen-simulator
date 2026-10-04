/**
 * 三味線の棹（さお）と胴（どう）の画面。
 *
 * ワンハンド（ふつう）:
 *  - 棹の上をタップ → その勘所を押さえて撥で弾いた音
 *  - 胴の部分をタップ → 開放弦（文化譜の「0」）
 *  - 押したまま同じ糸の上を指でなぞる → スリ
 *
 * 両手（本格）:
 *  - 左手: 棹を押さえる（押さえているあいだ、その糸の高さが決まる。離すと開放弦）
 *  - 右手: 胴の「撥ゾーン」で糸を打つ。糸の上をタップ／上から下へ糸を横切る＝叩き、
 *    下から上へ横切る＝掬い。速く振るほど強い音
 *
 * タップの判定（スマートヒットボックス）:
 *  - 見た目の四角に関係なく、糸の上で「いちばん近い勘所」を選ぶ
 *  - 練習中は、光っている勘所のとなりの境目付近をタップしても光っている方にする
 *    （高い勘所ほど吸い寄せる範囲を広くする）
 *  - 指をすべらせるときは、次の勘所に少し入りこむまで切り替えない（ちらつき防止）
 */
import React, { useRef } from 'react';
import {
  LabelMode,
  StringNo,
  STRING_KANJI,
  Tuning,
  bunkaLabel,
  positionLabel,
} from '../data/notation';

export interface Mark {
  string: StringNo;
  semitone: number;
  kind: 'target' | 'demo' | 'ok' | 'ng' | 'played' | 'next' | 'same' | 'pressed';
}

export type PlayMode = 'one' | 'two';

interface Props {
  tuning: Tuning;
  honsu: number;
  labelMode: LabelMode;
  showLabels: boolean;
  /** false のときは、光っている場所でも番号を出さない（番号あてクイズ用） */
  revealMarked?: boolean;
  orientation: 'horizontal' | 'vertical';
  /** 棹に表示するいちばん高い勘所（12 = 「10」まで, 24 = 「20」まで） */
  maxSemitone: number;
  marks: Mark[];
  /** 糸ごとの「弾いた回数」。変わるたびに糸が震えるアニメーション */
  pluckCount: Record<StringNo, number>;
  playMode: PlayMode;
  /** 両手モードで、いま押さえている勘所（0 = 開放） */
  pressed: Record<StringNo, number>;
  /** キーボードで弾くときのキーの文字（表示する場合） */
  keyHints?: Record<StringNo, string[]>;
  /** ワンハンド: 弾いた */
  onPlay: (s: StringNo, semitone: number, slide: boolean) => void;
  /** 両手: 左手で押さえた・動かした・離した（semitone 0 = 離した） */
  onFinger: (pointerId: number, s: StringNo, semitone: number, moved: boolean) => void;
  onFingerUp: (pointerId: number) => void;
  /** 両手: 撥で打った */
  onStrike: (s: StringNo, stroke: 'down' | 'up', velocity: number) => void;
}

/** 実際の三味線と同じく、上（高い音）に行くほど勘所の間隔がせまくなる */
const EDGE_LOW = 0.5;
const fretPos = (x: number) => 1 - Math.pow(2, -x / 12);
// 本物どおりだと高い所がせますぎてタップしにくいので、等間隔と混ぜる
function makePos(maxSemitone: number) {
  const high = maxSemitone + 0.5;
  const realPos = (x: number) => (fretPos(x) - fretPos(EDGE_LOW)) / (fretPos(high) - fretPos(EDGE_LOW));
  const evenPos = (x: number) => (x - EDGE_LOW) / (high - EDGE_LOW);
  return (x: number) => (realPos(x) * 0.45 + evenPos(x) * 0.55) * 100;
}

/** 目印になる勘所（4 = 4度、10 = オクターブ、20 = 2オクターブ） */
const LANDMARKS = new Set([5, 12, 24]);

const STRING_THICKNESS: Record<StringNo, number> = { 1: 3.2, 2: 2.3, 3: 1.6 };

const MARK_STYLE: Record<Mark['kind'], string> = {
  target: 'bg-amber-400 text-stone-950 ring-4 ring-amber-300/70 animate-pulse font-bold',
  demo: 'bg-sky-400 text-stone-950 ring-4 ring-sky-300/70 font-bold',
  ok: 'bg-emerald-400 text-stone-950 ring-4 ring-emerald-300/70 font-bold',
  ng: 'bg-rose-500 text-white ring-4 ring-rose-400/70 font-bold',
  played: 'bg-stone-100/90 text-stone-950 font-bold',
  pressed: 'bg-orange-500 text-white ring-2 ring-orange-300 font-bold',
  next: 'bg-amber-200/20 text-amber-100 outline-2 outline-dashed outline-amber-300/70',
  same: 'bg-sky-400/25 text-sky-100 outline-2 outline-dashed outline-sky-300/80',
};
const MARK_PRIORITY: Mark['kind'][] = ['ng', 'ok', 'target', 'demo', 'pressed', 'played', 'next', 'same'];

/** 撥ゾーンの糸の並び（上から 三・二・一。文化譜・横向きの棹と同じ） */
const PAD_ORDER: StringNo[] = [3, 2, 1];

export function Neck({
  tuning,
  honsu,
  labelMode,
  showLabels,
  revealMarked = true,
  orientation,
  maxSemitone,
  marks,
  pluckCount,
  playMode,
  pressed,
  keyHints,
  onPlay,
  onFinger,
  onFingerUp,
  onStrike,
}: Props) {
  const vertical = orientation === 'vertical';
  const twoHand = playMode === 'two';
  // 横向き: 上から 三・二・一（文化譜と同じ並び）/ 縦向き: 左から 一・二・三
  const order: StringNo[] = vertical ? [1, 2, 3] : [3, 2, 1];
  const fingers = useRef(new Map<number, { s: StringNo; semitone: number; el: HTMLElement }>());
  const strokes = useRef(new Map<number, { y: number; t: number; armed: Set<StringNo>; el: HTMLElement }>());

  const pos = makePos(maxSemitone);
  const cells: number[] = Array.from({ length: maxSemitone }, (_, i) => i + 1);

  const markAt = (s: StringNo, semitone: number) => {
    const found = marks.filter((m) => m.string === s && m.semitone === semitone);
    for (const k of MARK_PRIORITY) if (found.some((m) => m.kind === k)) return k;
    return null;
  };

  // ---------- 棹のタップ判定（スマートヒットボックス） ----------

  /** 糸の上の位置（0〜100%）から勘所を決める */
  const semitoneAt = (s: StringNo, percent: number, current?: number) => {
    // いちばん近い勘所の中心
    let best = 1;
    let bestD = Infinity;
    for (const k of cells) {
      const d = Math.abs(pos(k) - percent);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    // 指をすべらせているときは、次の勘所に 30% 入りこむまで今の勘所のまま
    if (current !== undefined && current > 0 && Math.abs(best - current) === 1) {
      const lo = pos(Math.min(best, current) + 0.5);
      const width = pos(best + 0.5) - pos(best - 0.5);
      const into = best > current ? percent - lo : lo - percent;
      if (into < width * 0.3) return current;
    }
    // 練習で光っている勘所のとなりなら、境目の近くは光っている方へ吸い寄せる
    const target =
      marks.find((m) => m.string === s && m.kind === 'target') ?? marks.find((m) => m.string === s && m.kind === 'next');
    if (target && target.semitone > 0 && Math.abs(target.semitone - best) === 1) {
      const width = pos(target.semitone + 0.5) - pos(target.semitone - 0.5);
      // 境目からとなりの四角へ 30%（高い勘所は 40%）入った所までは光っている方にする
      const reach = target.semitone > 12 ? 0.9 : 0.8;
      if (Math.abs(percent - pos(target.semitone)) < width * reach) return target.semitone;
    }
    return best;
  };

  const percentIn = (el: HTMLElement, e: React.PointerEvent | PointerEvent) => {
    const r = el.getBoundingClientRect();
    return vertical ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100;
  };

  const onRowDown = (e: React.PointerEvent<HTMLElement>, s: StringNo) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const semitone = semitoneAt(s, percentIn(el, e));
    fingers.current.set(e.pointerId, { s, semitone, el });
    if (twoHand) onFinger(e.pointerId, s, semitone, false);
    else onPlay(s, semitone, false);
  };

  const onRowMove = (e: React.PointerEvent<HTMLElement>) => {
    const f = fingers.current.get(e.pointerId);
    if (!f) return;
    const semitone = semitoneAt(f.s, percentIn(f.el, e), f.semitone);
    if (semitone === f.semitone) return;
    f.semitone = semitone;
    if (twoHand) onFinger(e.pointerId, f.s, semitone, true);
    else onPlay(f.s, semitone, true);
  };

  const onRowUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.delete(e.pointerId);
    if (twoHand) onFingerUp(e.pointerId);
  };

  // ---------- 撥ゾーン（両手モード） ----------

  const lineY = (el: HTMLElement, s: StringNo) => {
    const r = el.getBoundingClientRect();
    const lane = r.height / 3;
    return r.top + lane * (PAD_ORDER.indexOf(s) + 0.5);
  };

  const onPadDown = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const r = el.getBoundingClientRect();
    const slop = (r.height / 3) * 0.3;
    const armed = new Set<StringNo>(PAD_ORDER);
    // 糸の上（近く）をタップしたら、その糸を叩く
    for (const s of PAD_ORDER) {
      if (Math.abs(e.clientY - lineY(el, s)) <= slop) {
        armed.delete(s);
        onStrike(s, 'down', e.pressure > 0 && e.pressure !== 0.5 ? 0.4 + e.pressure * 0.6 : 0.85);
      }
    }
    strokes.current.set(e.pointerId, { y: e.clientY, t: e.timeStamp, armed, el });
  };

  const onPadMove = (e: React.PointerEvent<HTMLElement>) => {
    const st = strokes.current.get(e.pointerId);
    if (!st) return;
    const r = st.el.getBoundingClientRect();
    const slop = (r.height / 3) * 0.3;
    const dt = Math.max(1, e.timeStamp - st.t);
    const speed = Math.abs(e.clientY - st.y) / dt; // px / ms
    for (const s of PAD_ORDER) {
      const ly = lineY(st.el, s);
      // 糸を横切ったら打つ（上から下＝叩き、下から上＝掬い）
      const crossedDown = st.y < ly && e.clientY >= ly;
      const crossedUp = st.y > ly && e.clientY <= ly;
      if ((crossedDown || crossedUp) && st.armed.has(s)) {
        st.armed.delete(s);
        const velocity = Math.max(0.35, Math.min(1, 0.35 + speed * 0.45));
        onStrike(s, crossedDown ? 'down' : 'up', velocity);
      } else if (!st.armed.has(s) && Math.abs(e.clientY - ly) > slop) {
        // 糸から離れたら、また打てるようにする
        st.armed.add(s);
      }
    }
    st.y = e.clientY;
    st.t = e.timeStamp;
  };

  const onPadUp = (e: React.PointerEvent<HTMLElement>) => {
    strokes.current.delete(e.pointerId);
  };

  const renderLabel = (s: StringNo, semitone: number) => positionLabel(labelMode, tuning, honsu, s, semitone);
  const shownLabel = (s: StringNo, semitone: number, mark: Mark['kind'] | null) =>
    showLabels || (mark && revealMarked) ? renderLabel(s, semitone) : mark ? '?' : '・';

  return (
    <div className={`relative w-full h-full flex ${vertical ? 'flex-col' : 'flex-row'} rounded-2xl overflow-hidden shadow-2xl`}>
      {/* 天神（てんじん）と糸巻 */}
      <div
        className={`${vertical ? 'h-6 w-full flex-row' : 'w-10 sm:w-14 h-full flex-col'} shrink-0 flex items-center justify-center gap-2 bg-gradient-to-br from-stone-800 to-stone-950 border-stone-700 ${vertical ? 'border-b' : 'border-r'}`}
      >
        {vertical && <span className="font-serif-jp text-stone-400 text-xs">天神・糸巻</span>}
        {!vertical &&
          order.map((s) => (
            <div key={s} className="w-5 h-2.5 rounded-full bg-amber-100/80 shadow" title={`${STRING_KANJI[s]}の糸巻`} />
          ))}
      </div>

      {/* 棹（さお） */}
      <div
        className={`relative flex-1 min-w-0 min-h-0 flex ${vertical ? 'flex-row' : 'flex-col'} bg-gradient-to-b from-[#5b2f1d] via-[#4a2516] to-[#3a1c10]`}
      >
        {/* 上駒（かみごま）の線 */}
        <div className={`absolute bg-amber-50/80 z-10 ${vertical ? 'top-0 left-0 right-0 h-1' : 'left-0 top-0 bottom-0 w-1'}`} />
        {order.map((s) => (
          <div
            key={s}
            data-row={s}
            className={`relative flex-1 touch-none cursor-pointer ${vertical ? 'h-full' : 'w-full'}`}
            onPointerDown={(e) => onRowDown(e, s)}
            onPointerMove={onRowMove}
            onPointerUp={onRowUp}
            onPointerCancel={onRowUp}
          >
            {/* 糸 */}
            <div
              key={pluckCount[s]}
              className={`absolute z-0 bg-gradient-to-r from-amber-50 to-stone-200 pointer-events-none ${
                vertical
                  ? 'top-0 bottom-0 left-1/2 -translate-x-1/2 animate-string-vibrate-x'
                  : 'left-0 right-0 top-1/2 -translate-y-1/2 animate-string-vibrate'
              }`}
              style={vertical ? { width: STRING_THICKNESS[s] } : { height: STRING_THICKNESS[s] }}
            />
            {cells.map((semitone) => {
              const start = pos(semitone - 0.5);
              const end = pos(semitone + 0.5);
              const mark = markAt(s, semitone);
              return (
                <div
                  key={semitone}
                  data-string={s}
                  data-semitone={semitone}
                  role="button"
                  aria-label={`${STRING_KANJI[s]}の糸 ${bunkaLabel(semitone)}`}
                  className={`absolute flex items-center justify-center ${
                    vertical ? 'left-0 right-0 border-b' : 'top-0 bottom-0 border-r'
                  } border-black/25`}
                  style={vertical ? { top: `${start}%`, height: `${end - start}%` } : { left: `${start}%`, width: `${end - start}%` }}
                >
                  {LANDMARKS.has(semitone) && (
                    <div className={`absolute w-1.5 h-1.5 rounded-full bg-amber-200/60 ${vertical ? 'right-1' : 'bottom-1'}`} />
                  )}
                  <span
                    className={`relative z-10 flex items-center justify-center rounded-md leading-none transition-colors select-none ${
                      vertical ? 'min-w-[1.6rem] px-1 py-0.5' : 'min-w-[1.3rem] px-0.5 py-1'
                    } ${mark ? MARK_STYLE[mark] : 'bg-stone-950/55 text-amber-50/90'} ${
                      labelMode === 'bunka'
                        ? `bunka ${semitone > 12 && !vertical ? 'text-[0.6rem] sm:text-xs tracking-tighter' : 'text-[0.7rem] sm:text-sm'}`
                        : 'text-[0.55rem] sm:text-xs'
                    }`}
                  >
                    {shownLabel(s, semitone, mark)}
                  </span>
                  {keyHints?.[s][semitone] && (
                    <span className={`absolute z-10 rounded bg-sky-950/85 px-0.5 text-[0.55rem] leading-tight text-sky-200 bunka pointer-events-none ${vertical ? 'left-0.5 top-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2 top-1/2 -translate-y-[190%]'}`}>
                      {keyHints[s][semitone]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 胴（どう）: ワンハンドでは開放弦、両手では撥ゾーン */}
      {twoHand ? (
        <div
          data-pad
          className={`relative ${vertical ? 'h-[30%] w-full border-t-4' : 'w-[30%] sm:w-[26%] h-full border-l-4'} shrink-0 flex flex-col touch-none cursor-pointer border-amber-900 bg-[radial-gradient(ellipse_at_center,#fdf8ee_0%,#efe3c8_70%,#d8c6a0_100%)]`}
          onPointerDown={onPadDown}
          onPointerMove={onPadMove}
          onPointerUp={onPadUp}
          onPointerCancel={onPadUp}
          aria-label="撥ゾーン: 糸をタップか上から下へ横切ると叩き、下から上へ横切ると掬い"
        >
          <div className="pointer-events-none absolute top-1 right-2 text-[0.6rem] sm:text-xs text-stone-600 text-right leading-tight">
            撥ゾーン
            <br />↓ 叩き　↑ 掬い
          </div>
          {PAD_ORDER.map((s) => {
            const mark = markAt(s, 0);
            const p = pressed[s];
            return (
              <div key={s} data-string={s} data-semitone={0} aria-label={`${STRING_KANJI[s]}の糸 撥`} className="relative flex-1 flex items-center">
                <div
                  key={pluckCount[s]}
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-stone-500 animate-string-vibrate"
                  style={{ height: STRING_THICKNESS[s] + 1 }}
                />
                <span
                  className={`relative z-10 ml-2 flex items-baseline gap-1 rounded-lg px-1.5 py-0.5 leading-tight ${
                    mark ? MARK_STYLE[mark] : 'bg-white/80 text-stone-800'
                  }`}
                >
                  <span className="font-serif-jp font-bold text-sm">{STRING_KANJI[s]}</span>
                  <span className="bunka text-[0.65rem] sm:text-xs text-orange-700">{p > 0 ? shownLabel(s, p, null) : shownLabel(s, 0, mark)}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`relative ${vertical ? 'h-[20%] w-full flex-row border-t-4' : 'w-[18%] sm:w-[16%] h-full flex-col border-l-4'} shrink-0 flex border-amber-900 bg-[radial-gradient(ellipse_at_center,#fdf8ee_0%,#efe3c8_70%,#d8c6a0_100%)]`}
        >
          {/* 駒（こま） */}
          <div
            className={`absolute bg-amber-950/70 rounded-sm z-0 ${
              vertical ? 'bottom-[22%] left-[10%] right-[10%] h-1.5' : 'right-[22%] top-[10%] bottom-[10%] w-1.5'
            }`}
          />
          {order.map((s) => {
            const mark = markAt(s, 0);
            return (
              <div
                key={s}
                data-string={s}
                data-semitone={0}
                role="button"
                aria-label={`${STRING_KANJI[s]}の糸 開放弦 0`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPlay(s, 0, false);
                }}
                className={`relative flex-1 flex items-center justify-center cursor-pointer touch-none group ${vertical ? 'h-full' : 'w-full'}`}
              >
                <div
                  key={pluckCount[s]}
                  className={`absolute bg-stone-500 pointer-events-none ${
                    vertical
                      ? 'top-0 bottom-0 left-1/2 -translate-x-1/2 animate-string-vibrate-x'
                      : 'left-0 right-0 top-1/2 -translate-y-1/2 animate-string-vibrate'
                  }`}
                  style={vertical ? { width: STRING_THICKNESS[s] } : { height: STRING_THICKNESS[s] }}
                />
                <span
                  className={`relative z-10 flex flex-col items-center rounded-lg px-1.5 py-1 leading-tight transition-colors pointer-events-none ${
                    mark ? MARK_STYLE[mark] : 'bg-white/70 text-stone-800 group-active:bg-amber-200'
                  }`}
                >
                  <span className="font-serif-jp font-bold text-sm sm:text-base">{STRING_KANJI[s]}</span>
                  <span className="text-[0.6rem] sm:text-xs bunka">{shownLabel(s, 0, mark)}</span>
                  {keyHints && <span className="text-[0.55rem] text-sky-700 bunka">キー {keyHints[s][0]}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
