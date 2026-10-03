/**
 * 三味線の棹（さお）と胴（どう）の画面。
 * - 棹の上の四角（勘所）をタップ → その場所を押さえて撥で弾いた音
 * - 右側（縦向きなら下側）の胴の部分をタップ → 開放弦（文化譜の「0」）
 * - 押したまま同じ糸の上を指でなぞる → スリ（音がすべってつながる）
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
  kind: 'target' | 'demo' | 'ok' | 'ng' | 'played' | 'next' | 'same';
}

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
  onPlay: (s: StringNo, semitone: number, slide: boolean) => void;
}

/** 実際の三味線と同じく、上（高い音）に行くほど勘所の間隔がせまくなる */
const EDGE_LOW = 0.5;
const fretPos = (x: number) => 1 - Math.pow(2, -x / 12);
// 本物どおりだと高い所がせますぎてタップしにくいので、等間隔と半々に混ぜる
function makePos(maxSemitone: number) {
  const high = maxSemitone + 0.5;
  const realPos = (x: number) => (fretPos(x) - fretPos(EDGE_LOW)) / (fretPos(high) - fretPos(EDGE_LOW));
  const evenPos = (x: number) => (x - EDGE_LOW) / (high - EDGE_LOW);
  return (x: number) => (realPos(x) * 0.5 + evenPos(x) * 0.5) * 100;
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
  next: 'bg-amber-200/20 text-amber-100 outline-2 outline-dashed outline-amber-300/70',
  same: 'bg-sky-400/25 text-sky-100 outline-2 outline-dashed outline-sky-300/80',
};
const MARK_PRIORITY: Mark['kind'][] = ['ng', 'ok', 'target', 'demo', 'played', 'next', 'same'];

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
  onPlay,
}: Props) {
  const vertical = orientation === 'vertical';
  // 横向き: 上から 三・二・一（文化譜と同じ並び）/ 縦向き: 左から 一・二・三
  const order: StringNo[] = vertical ? [1, 2, 3] : [3, 2, 1];
  const dragging = useRef(new Map<number, { s: StringNo; semitone: number }>());

  const markAt = (s: StringNo, semitone: number) => {
    const found = marks.filter((m) => m.string === s && m.semitone === semitone);
    for (const k of MARK_PRIORITY) if (found.some((m) => m.kind === k)) return k;
    return null;
  };

  const cellFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest('[data-string]') as HTMLElement | null;
    if (!cell) return null;
    return { s: Number(cell.dataset.string) as StringNo, semitone: Number(cell.dataset.semitone) };
  };

  const handleDown = (e: React.PointerEvent, s: StringNo, semitone: number) => {
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragging.current.set(e.pointerId, { s, semitone });
    onPlay(s, semitone, false);
  };

  const handleMove = (e: React.PointerEvent) => {
    const cur = dragging.current.get(e.pointerId);
    if (!cur) return;
    const hit = cellFromPoint(e.clientX, e.clientY);
    // 同じ糸の上で別の勘所へ指が移ったらスリ
    if (hit && hit.s === cur.s && hit.semitone !== cur.semitone && hit.semitone > 0 && cur.semitone > 0) {
      dragging.current.set(e.pointerId, hit);
      onPlay(hit.s, hit.semitone, true);
    }
  };

  const handleUp = (e: React.PointerEvent) => {
    dragging.current.delete(e.pointerId);
  };

  const cells: number[] = Array.from({ length: maxSemitone }, (_, i) => i + 1);
  const pos = makePos(maxSemitone);

  const renderLabel = (s: StringNo, semitone: number) =>
    positionLabel(labelMode, tuning, honsu, s, semitone);

  return (
    <div
      className={`relative w-full h-full flex ${vertical ? 'flex-col' : 'flex-row'} rounded-2xl overflow-hidden shadow-2xl`}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
    >
      {/* 天神（てんじん）と糸巻 */}
      <div
        className={`${vertical ? 'h-7 w-full flex-row' : 'w-12 sm:w-16 h-full flex-col'} shrink-0 flex items-center justify-center gap-2 bg-gradient-to-br from-stone-800 to-stone-950 border-stone-700 ${vertical ? 'border-b' : 'border-r'}`}
      >
        <span className="font-serif-jp text-stone-400 text-xs sm:text-sm [writing-mode:vertical-rl]">
          {vertical ? "" : ""}
        </span>
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
        <div
          className={`absolute bg-amber-50/80 z-10 ${vertical ? 'top-0 left-0 right-0 h-1' : 'left-0 top-0 bottom-0 w-1'}`}
        />
        {order.map((s) => (
          <div key={s} className={`relative flex-1 ${vertical ? 'h-full' : 'w-full'}`}>
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
              const landmark = LANDMARKS.has(semitone);
              const label = renderLabel(s, semitone);
              return (
                <div
                  key={semitone}
                  data-string={s}
                  data-semitone={semitone}
                  role="button"
                  aria-label={`${STRING_KANJI[s]}の糸 ${bunkaLabel(semitone)}`}
                  onPointerDown={(e) => handleDown(e, s, semitone)}
                  className={`absolute flex items-center justify-center cursor-pointer group ${
                    vertical ? 'left-0 right-0' : 'top-0 bottom-0'
                  } ${vertical ? 'border-b' : 'border-r'} border-black/25`}
                  style={
                    vertical
                      ? { top: `${start}%`, height: `${end - start}%` }
                      : { left: `${start}%`, width: `${end - start}%` }
                  }
                >
                  {landmark && (
                    <div
                      className={`absolute w-1.5 h-1.5 rounded-full bg-amber-200/60 ${
                        vertical ? 'right-1' : 'bottom-1'
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex items-center justify-center rounded-md leading-none transition-colors pointer-events-none select-none ${
                      vertical ? 'min-w-[1.6rem] px-1 py-0.5' : 'min-w-[1.3rem] px-0.5 py-1'
                    } ${
                      mark
                        ? MARK_STYLE[mark]
                        : 'bg-stone-950/55 text-amber-50/90 group-hover:bg-amber-100/30 group-active:bg-amber-100/50'
                    } ${
                      labelMode === 'bunka'
                        ? `bunka ${semitone > 12 && !vertical ? 'text-[0.6rem] sm:text-xs tracking-tighter' : 'text-[0.7rem] sm:text-sm'}`
                        : 'text-[0.55rem] sm:text-xs'
                    }`}
                  >
                    {showLabels || (mark && revealMarked) ? label : mark ? '?' : '・'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 胴（どう）: ここをタップすると開放弦 */}
      <div
        className={`relative ${vertical ? 'h-[22%] w-full flex-row border-t-4' : 'w-[20%] sm:w-[18%] h-full flex-col border-l-4'} shrink-0 flex border-amber-900 bg-[radial-gradient(ellipse_at_center,#fdf8ee_0%,#efe3c8_70%,#d8c6a0_100%)]`}
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
              onPointerDown={(e) => handleDown(e, s, 0)}
              className={`relative flex-1 flex items-center justify-center cursor-pointer group ${vertical ? 'h-full' : 'w-full'}`}
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
                <span className="text-[0.6rem] sm:text-xs bunka">
                  {showLabels || (mark && revealMarked) ? renderLabel(s, 0) : mark ? '?' : '・'}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
