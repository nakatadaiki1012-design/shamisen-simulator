/**
 * クイズパネル
 * - 勘所クイズ: 「二の糸の #」のように出題 → 棹の上のその場所をタップ
 * - 耳コピクイズ: 音が鳴る → 同じ高さの音をさがしてタップ（どの糸でもOK）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, RefreshCw, Volume2 } from 'lucide-react';
import { STRING_NAMES, StringNo, STRINGS, Tuning, bunkaLabel, noteMidi } from '../data/notation';
import { Mark } from './Neck';
import { PlayedEvent } from './SongPanel';

type QuizType = 'position' | 'name' | 'ear';
const QUIZ_NAMES: Record<QuizType, string> = { position: '勘所クイズ', name: '番号あて', ear: '耳コピクイズ' };
type Level = 'easy' | 'normal' | 'hard';

const LEVELS: Record<Level, { name: string; max: number }> = {
  easy: { name: 'やさしい（0〜4）', max: 5 },
  normal: { name: 'ふつう（0〜10）', max: 12 },
  hard: { name: 'むずかしい（0〜20）', max: 24 },
};

interface Question {
  string: StringNo;
  semitone: number;
}

interface Props {
  tuning: Tuning;
  honsu: number;
  /** 棹に表示されているいちばん高い勘所。これより上は出題しない */
  maxSemitone: number;
  lastPlayed: PlayedEvent | null;
  onMarks: (marks: Mark[]) => void;
  onListen: (s: StringNo, semitone: number) => void;
  /** 番号あてクイズのあいだは、棹の番号をかくす */
  onHideLabels: (hide: boolean) => void;
}

function randomQuestion(level: Level, prev: Question | null, visibleMax = 24): Question {
  const max = Math.min(LEVELS[level].max, visibleMax);
  for (;;) {
    const q: Question = {
      string: STRINGS[Math.floor(Math.random() * 3)],
      semitone: Math.floor(Math.random() * (max + 1)),
    };
    if (!prev || prev.string !== q.string || prev.semitone !== q.semitone) return q;
  }
}

/** 番号あてクイズの選択肢: 正解と、近くの勘所の番号を 3 つ */
function makeChoices(answer: number, max: number): number[] {
  const pool = new Set<number>([answer]);
  const near = [-2, -1, 1, 2, 3, -3, 4, -4, 5, -5].map((d) => answer + d).filter((x) => x >= 0 && x <= max);
  for (const x of near.sort(() => Math.random() - 0.5)) {
    if (pool.size >= 4) break;
    pool.add(x);
  }
  return [...pool].sort((a, b) => a - b);
}

export function QuizPanel({ tuning, honsu, maxSemitone, lastPlayed, onMarks, onListen, onHideLabels }: Props) {
  const [type, setType] = useState<QuizType>('position');
  const [level, setLevel] = useState<Level>('easy');
  const [q, setQ] = useState<Question>(() => randomQuestion('easy', null));
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [state, setState] = useState<'asking' | 'wrong' | 'correct' | 'revealed'>('asking');
  const [wrongAt, setWrongAt] = useState<Question | null>(null);
  const [wrongChoice, setWrongChoice] = useState<number | null>(null);
  const choices = useMemo(
    () => makeChoices(q.semitone, Math.min(LEVELS[level].max, maxSemitone)),
    [q, level, maxSemitone]
  );
  const handledId = useRef<number | null>(lastPlayed?.id ?? null);
  const triedThisQ = useRef(false);

  const next = useCallback(
    (lv: Level = level, t: QuizType = type) => {
      const nq = randomQuestion(lv, q, maxSemitone);
      setQ(nq);
      setState('asking');
      setWrongAt(null);
      setWrongChoice(null);
      triedThisQ.current = false;
      if (t === 'ear') setTimeout(() => onListen(nq.string, nq.semitone), 250);
    },
    [level, type, q, onListen, maxSemitone]
  );

  // 表示範囲をせまくしたら、見えない場所の問題は出し直す
  useEffect(() => {
    if (q.semitone > maxSemitone) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSemitone]);

  const targetMidi = noteMidi(tuning, honsu, q.string, q.semitone);

  // 判定
  useEffect(() => {
    if (!lastPlayed || lastPlayed.id === handledId.current) return;
    handledId.current = lastPlayed.id;
    if (state === 'correct' || type === 'name') return;
    const ok =
      type === 'position'
        ? lastPlayed.string === q.string && lastPlayed.semitone === q.semitone
        : lastPlayed.midi === targetMidi;
    const firstTry = !triedThisQ.current;
    triedThisQ.current = true;
    if (ok) {
      setState('correct');
      setScore((s) => ({
        correct: s.correct + (firstTry && state !== 'revealed' ? 1 : 0),
        total: s.total + 1,
        streak: firstTry && state !== 'revealed' ? s.streak + 1 : 0,
      }));
      setTimeout(() => next(), 900);
    } else {
      setState('wrong');
      setWrongAt({ string: lastPlayed.string, semitone: lastPlayed.semitone });
      setScore((s) => ({ ...s, streak: 0 }));
    }
  }, [lastPlayed, q, type, targetMidi, state, next]);

  // 棹の上の表示
  useEffect(() => {
    const marks: Mark[] = [];
    if (state === 'correct') marks.push({ ...q, kind: 'ok' });
    if (state === 'revealed') marks.push({ ...q, kind: 'target' });
    if (type === 'name' && state !== 'correct' && state !== 'revealed') marks.push({ ...q, kind: 'demo' });
    if (state === 'wrong' && wrongAt) marks.push({ ...wrongAt, kind: 'ng' });
    onMarks(marks);
  }, [state, q, wrongAt, onMarks, type]);

  useEffect(() => {
    onHideLabels(type === 'name');
    return () => onHideLabels(false);
  }, [type, onHideLabels]);

  const answerName = (semitone: number) => {
    if (state === 'correct') return;
    const firstTry = !triedThisQ.current;
    triedThisQ.current = true;
    onListen(q.string, semitone);
    if (semitone === q.semitone) {
      setState('correct');
      setScore((s) => ({
        correct: s.correct + (firstTry && state !== 'revealed' ? 1 : 0),
        total: s.total + 1,
        streak: firstTry && state !== 'revealed' ? s.streak + 1 : 0,
      }));
      setTimeout(() => next(), 900);
    } else {
      setState('wrong');
      setWrongChoice(semitone);
      setScore((s) => ({ ...s, streak: 0 }));
    }
  };

  useEffect(() => () => onMarks([]), [onMarks]);

  const changeType = (t: QuizType) => {
    setType(t);
    setScore({ correct: 0, total: 0, streak: 0 });
    next(level, t);
  };
  const changeLevel = (lv: Level) => {
    setLevel(lv);
    setScore({ correct: 0, total: 0, streak: 0 });
    next(lv, type);
  };

  return (
    <div className="quiz-panel shrink-0 border-b border-stone-800 bg-stone-900/90 px-2 sm:px-4 py-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg overflow-hidden border border-stone-700">
          {(['position', 'name', 'ear'] as QuizType[]).map((t) => (
            <button
              key={t}
              onClick={() => changeType(t)}
              className={`px-3 py-1.5 ${type === t ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 hover:bg-stone-700'}`}
            >
              {QUIZ_NAMES[t]}
            </button>
          ))}
        </div>
        <select
          value={level}
          onChange={(e) => changeLevel(e.target.value as Level)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-xs"
        >
          {(Object.keys(LEVELS) as Level[]).map((lv) => (
            <option key={lv} value={lv}>
              {LEVELS[lv].name}
              {LEVELS[lv].max > maxSemitone ? '※範囲を0〜20に' : ''}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-stone-300">
          正解 <b className="text-emerald-300 text-base">{score.correct}</b> / {score.total} 問
          {score.streak >= 3 && <span className="ml-2 text-amber-300">🔥 {score.streak} 連続！</span>}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {type === 'position' ? (
          <div className="text-base sm:text-lg">
            <span className="font-serif-jp font-bold text-amber-200">{STRING_NAMES[q.string]}</span>
            <span className="text-stone-400"> の </span>
            <span className="bunka font-bold text-2xl text-amber-300 bg-stone-800 rounded px-2">
              {bunkaLabel(q.semitone)}
            </span>
            <span className="text-stone-400 text-sm"> を弾こう</span>
            {q.semitone === 0 && <span className="text-stone-500 text-xs ml-2">（0 = どこも押さえない＝胴の部分をタップ）</span>}
          </div>
        ) : type === 'name' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
            <span className="text-stone-300">
              青く光っている <b className="font-serif-jp text-sky-300">{STRING_NAMES[q.string]}</b> の場所は、文化譜で何番？
            </span>
            <div className="flex gap-1.5">
              {choices.map((c) => (
                <button
                  key={c}
                  onClick={() => answerName(c)}
                  className={`bunka min-w-[2.6rem] text-lg rounded-lg px-2 py-1 border ${
                    state === 'correct' && c === q.semitone
                      ? 'bg-emerald-500 border-emerald-300 text-white'
                      : wrongChoice === c
                        ? 'bg-rose-500 border-rose-300 text-white'
                        : 'bg-stone-800 border-stone-600 text-amber-200 hover:bg-stone-700'
                  }`}
                >
                  {bunkaLabel(c)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm sm:text-base">
            <button
              onClick={() => onListen(q.string, q.semitone)}
              className="flex items-center gap-1 bg-sky-500 text-stone-950 font-bold rounded-lg px-3 py-1.5"
            >
              <Volume2 size={16} /> 音を聴く
            </button>
            <span className="text-stone-300">同じ高さの音をさがしてタップ！（どの糸でもOK）</span>
          </div>
        )}

        <div className="flex-1" />
        {state === 'correct' && <span className="text-emerald-300 font-bold">⭕ 正解！</span>}
        {state === 'wrong' && <span className="text-rose-300 font-bold">✖ おしい！もう一度</span>}
        {state === 'revealed' && (
          <span className="text-amber-300 text-sm">
            答え: {STRING_NAMES[q.string]}の「{bunkaLabel(q.semitone)}」（光っている場所）
          </span>
        )}
        <button
          onClick={() => {
            setState('revealed');
            setScore((s) => ({ ...s, streak: 0 }));
            onListen(q.string, q.semitone);
          }}
          className="flex items-center gap-1 text-xs rounded-lg px-2 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
        >
          <Eye size={14} /> 答えを見る
        </button>
        <button
          onClick={() => next()}
          className="flex items-center gap-1 text-xs rounded-lg px-2 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
        >
          <RefreshCw size={14} /> 次の問題
        </button>
      </div>
    </div>
  );
}
