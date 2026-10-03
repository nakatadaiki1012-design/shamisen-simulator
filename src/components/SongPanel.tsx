/**
 * 曲の練習パネル
 * - 文化譜（横書き・3本線）で楽譜を表示
 * - 「自分で弾く」: 次に弾く勘所が棹の上で光る。正しく弾くと次へ進む
 * - 「お手本を聴く」: テンポを選んで自動演奏
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Hand, Volume2 } from 'lucide-react';
import { SONGS, Song, SongNote } from '../data/songs';
import {
  STRING_NAMES,
  StringNo,
  Technique,
  TECHNIQUES,
  Tuning,
  bunkaLabel,
  doremiName,
  getTuning,
  honsuName,
  noteMidi,
} from '../data/notation';
import { Mark } from './Neck';

export interface PlayedEvent {
  id: number;
  string: StringNo;
  semitone: number;
  midi: number;
}

interface Props {
  tuning: Tuning;
  honsu: number;
  lastPlayed: PlayedEvent | null;
  onMarks: (marks: Mark[]) => void;
  onApplySettings: (tuningId: Tuning['id'], honsu: number) => void;
  onDemoNote: (s: StringNo, semitone: number, technique: Technique) => void;
}

const TECH_MARK = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t.mark])) as Record<Technique, string>;

export function SongPanel({ tuning, honsu, lastPlayed, onMarks, onApplySettings, onDemoNote }: Props) {
  const [songId, setSongId] = useState(SONGS[0].id);
  const song = SONGS.find((s) => s.id === songId)!;
  const [index, setIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'ng'; s: StringNo; semitone: number } | null>(null);
  const [message, setMessage] = useState<string>('');
  const [demo, setDemo] = useState(false);
  const [tempo, setTempo] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledId = useRef<number | null>(lastPlayed?.id ?? null);

  const finished = index >= song.notes.length;
  const target: SongNote | undefined = song.notes[index];
  const settingsMatch = tuning.id === song.tuningId && honsu === song.honsu;

  const selectSong = (s: Song) => {
    setSongId(s.id);
    setIndex(0);
    setMistakes(0);
    setDemo(false);
    setFeedback(null);
    setMessage('');
    onApplySettings(s.tuningId, s.honsu);
  };

  // 初回表示で、最初の曲の調子と本数に合わせる
  useEffect(() => {
    onApplySettings(song.tuningId, song.honsu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = () => {
    setIndex(0);
    setMistakes(0);
    setFeedback(null);
    setMessage('');
  };

  // 弾いた音の判定（自分で弾くモード）
  useEffect(() => {
    if (!lastPlayed || lastPlayed.id === handledId.current) return;
    handledId.current = lastPlayed.id;
    if (demo || finished || !target) return;
    if (lastPlayed.string === target.string && lastPlayed.semitone === target.semitone) {
      setFeedback({ kind: 'ok', s: lastPlayed.string, semitone: lastPlayed.semitone });
      setMessage('');
      setIndex((i) => i + 1);
    } else {
      setMistakes((m) => m + 1);
      setFeedback({ kind: 'ng', s: lastPlayed.string, semitone: lastPlayed.semitone });
      const targetMidi = noteMidi(tuning, honsu, target.string, target.semitone);
      setMessage(
        lastPlayed.midi === targetMidi
          ? `音の高さは合っています！でも楽譜では「${STRING_NAMES[target.string]}の${bunkaLabel(target.semitone)}」です。`
          : `ちがう音です。光っている「${STRING_NAMES[target.string]}の${bunkaLabel(target.semitone)}」を弾こう。`
      );
    }
  }, [lastPlayed, demo, finished, target, tuning, honsu]);

  // 正解・不正解の色は少しだけ表示
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 350);
    return () => clearTimeout(t);
  }, [feedback]);

  // お手本の自動演奏
  useEffect(() => {
    if (!demo) return;
    if (finished) {
      setDemo(false);
      return;
    }
    const note = song.notes[index];
    onDemoNote(note.string, note.semitone, note.technique ?? 'bachi');
    const ms = (60000 / (song.bpm * tempo)) * note.beats;
    const t = setTimeout(() => setIndex((i) => i + 1), ms);
    return () => clearTimeout(t);
  }, [demo, index, finished, song, tempo, onDemoNote]);

  // 棹の上の表示
  useEffect(() => {
    const marks: Mark[] = [];
    if (target && !finished) {
      marks.push({ string: target.string, semitone: target.semitone, kind: demo ? 'demo' : 'target' });
    }
    if (feedback) marks.push({ string: feedback.s, semitone: feedback.semitone, kind: feedback.kind });
    onMarks(marks);
  }, [target, finished, demo, feedback, onMarks]);

  useEffect(() => () => onMarks([]), [onMarks]);

  // 今の音が見えるように楽譜をスクロール
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index, songId]);

  const accuracy = useMemo(() => {
    const total = song.notes.length;
    return Math.max(0, Math.round((total / (total + mistakes)) * 100));
  }, [song, mistakes]);

  const rowOf: Record<StringNo, number> = { 3: 0, 2: 1, 1: 2 };

  return (
    <div className="song-panel shrink-0 border-b border-stone-800 bg-stone-900/90 px-2 sm:px-4 py-2 flex flex-col gap-2">
      {/* 上の段: 曲えらびとボタン */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={songId}
          onChange={(e) => selectSong(SONGS.find((s) => s.id === e.target.value)!)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-sm font-semibold max-w-[14rem]"
        >
          {SONGS.map((s) => (
            <option key={s.id} value={s.id}>
              【{s.difficulty}】{s.title}
            </option>
          ))}
        </select>
        <span className="text-xs text-stone-400">
          {getTuning(song.tuningId).name}・{honsuName(song.honsu)}
        </span>
        {!settingsMatch && (
          <button
            onClick={() => onApplySettings(song.tuningId, song.honsu)}
            className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg px-2 py-1"
          >
            ⚠ 調子をこの曲に合わせる
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => {
            if (demo) {
              setDemo(false);
            } else {
              if (finished) restart();
              setDemo(true);
            }
          }}
          className={`flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 border ${
            demo ? 'bg-sky-500 text-stone-950 border-sky-400' : 'bg-stone-800 border-stone-700 hover:bg-stone-700'
          }`}
        >
          {demo ? <Pause size={15} /> : <Volume2 size={15} />}
          {demo ? '止める' : 'お手本を聴く'}
        </button>
        <select
          value={tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="bg-stone-800 border border-stone-700 rounded-lg px-1.5 py-1.5 text-xs"
          title="お手本の速さ"
        >
          <option value={0.5}>ゆっくり</option>
          <option value={0.75}>少しゆっくり</option>
          <option value={1}>ふつう</option>
        </select>
        <button
          onClick={() => {
            setDemo(false);
            restart();
          }}
          className="flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
        >
          <RotateCcw size={15} />
          最初から
        </button>
      </div>

      {/* 楽譜（文化譜・横書き） */}
      <div ref={scrollRef} className="tab-area relative overflow-x-auto overflow-y-hidden rounded-lg bg-[#f7f0e1] text-stone-900">
        <div className="flex min-w-max pl-9 pr-[40vw] relative">
          {/* 糸の名前 */}
          <div className="sticky left-0 -ml-9 w-9 z-20 bg-[#f7f0e1] flex flex-col pt-4">
            {([3, 2, 1] as StringNo[]).map((s) => (
              <div key={s} className="tab-row flex items-center justify-center font-serif-jp text-xs font-bold text-stone-600">
                {['', '一', '二', '三'][s]}
              </div>
            ))}
          </div>
          {/* 3 本の線 */}
          <div className="absolute left-9 right-0 top-4 pointer-events-none">
            {[0, 1, 2].map((r) => (
              <div key={r} className="tab-row flex items-center">
                <div className="w-full h-px bg-stone-500" />
              </div>
            ))}
          </div>
          {song.notes.map((note, i) => {
            const isCur = i === index && !finished;
            const done = i < index;
            const width = Math.max(1, note.beats) * 2.1;
            return (
              <button
                key={i}
                data-idx={i}
                onClick={() => {
                  setDemo(false);
                  setIndex(i);
                  setMessage('');
                }}
                className={`relative flex flex-col shrink-0 ${isCur ? 'bg-amber-300/50' : ''} ${
                  note.section && i > 0 ? 'border-l-2 border-stone-400/70' : ''
                }`}
                style={{ width: `${width}rem` }}
                title="ここから練習する"
              >
                <div className="h-4 text-[0.6rem] text-stone-500 whitespace-nowrap px-0.5 text-left overflow-visible">
                  {note.section ?? ''}
                </div>
                <div className="tab-rows relative w-full">
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[1.3rem] px-0.5 rounded font-mono font-bold text-sm leading-5 ${
                      isCur ? 'bg-amber-500 text-white' : done ? 'bg-[#f7f0e1] text-stone-400' : 'bg-[#f7f0e1] text-stone-900'
                    }`}
                    style={{ top: `calc(var(--tab-row) * ${rowOf[note.string] + 0.5})` }}
                  >
                    {bunkaLabel(note.semitone)}
                  </span>
                  {note.technique && note.technique !== 'bachi' && (
                    <span
                      className="absolute right-0 text-[0.55rem] text-rose-700 font-bold"
                      style={{ top: `calc(var(--tab-row) * ${rowOf[note.string]})` }}
                    >
                      {TECH_MARK[note.technique]}
                    </span>
                  )}
                </div>
                {/* 拍の長さ（下の線） */}
                <div className="h-1 mx-1 rounded bg-stone-400/60" style={{ width: `${Math.min(100, note.beats * 45)}%` }} />
                <div className={`h-6 text-sm font-serif-jp ${isCur ? 'font-bold text-amber-800' : 'text-stone-700'}`}>
                  {note.lyric ?? ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 下の段: 説明・メッセージ */}
      <div className="text-xs sm:text-sm min-h-[1.25rem]">
        {finished ? (
          <span className="text-emerald-300 font-bold">
            🎉 さいごまで弾けました！ まちがい {mistakes} 回（正確さ {accuracy}%）
            <button onClick={restart} className="ml-2 underline text-amber-300">もう一度</button>
          </span>
        ) : message ? (
          <span className="text-rose-300">{message}</span>
        ) : demo ? (
          <span className="text-sky-300 flex items-center gap-1">
            <Play size={13} /> お手本を演奏中…（青く光るところを見てね）
          </span>
        ) : target ? (
          <span className="text-stone-300 flex items-center gap-1 flex-wrap">
            <Hand size={13} className="text-amber-400" />
            次は <b className="text-amber-300">{STRING_NAMES[target.string]}</b> の
            <b className="text-amber-300 font-mono text-base">「{bunkaLabel(target.semitone)}」</b>
            <span className="text-stone-500">
              （{doremiName(noteMidi(tuning, honsu, target.string, target.semitone))}
              {target.technique && target.technique !== 'bachi'
                ? `・${TECHNIQUES.find((t) => t.id === target.technique)!.name}`
                : ''}
              ）
            </span>
            <span className="song-desc text-stone-500 ml-2 hidden md:inline">{song.description}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
