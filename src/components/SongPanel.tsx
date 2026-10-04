/**
 * 曲の練習パネル
 * - 文化譜（横書き・3本線）で楽譜を表示
 * - 「自分で弾く」: 次に弾く勘所が棹の上で光る。正しく弾くと次へ進む
 * - 「お手本を聴く」: テンポを選んで自動演奏
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Hand, Volume2, Timer, Square } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { openPrintableScore } from '../print';
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
  /** 弾いた瞬間の時刻（performance.now()） */
  time: number;
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
  /** 次の音の奏法（スクイなど）を奏法バーに反映する */
  onSuggestTechnique: (t: Technique) => void;
  /** 棹の向き（まちがえたときに「どちらへ動かすか」を言うため） */
  orientation: 'horizontal' | 'vertical';
}

type Judge = 'great' | 'good' | 'miss';
const JUDGE_STYLE: Record<Judge, string> = {
  great: 'bg-emerald-500 text-white',
  good: 'bg-amber-400 text-stone-900',
  miss: 'bg-rose-500 text-white',
};
/** 判定のはば（ミリ秒）: これより近ければ「ぴったり」、WINDOW 以内なら「おしい」 */
const GREAT_MS = 120;
const WINDOW_MS = 300;
const COUNT_IN = 4;

/** 曲ごとの学習の記録（この端末に保存）: さいごまで弾けたか・いちばんよかった正確さ */
interface SongProgress {
  cleared: boolean;
  bestAccuracy: number;
}
const PROGRESS_KEY = 'shamisen_progress';
function loadProgress(): Record<string, SongProgress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveProgress(all: Record<string, SongProgress>) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* 保存できない環境では何もしない */
  }
}

/** テンポ練習の自己ベスト（曲と速さごと）を、この端末に覚えておく */
const BEST_KEY = 'shamisen_best_scores';
function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveBest(all: Record<string, number>) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    /* 保存できない環境では何もしない */
  }
}

const TECH_MARK = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t.mark])) as Record<Technique, string>;

export function SongPanel({ tuning, honsu, lastPlayed, onMarks, onApplySettings, onDemoNote, onSuggestTechnique, orientation }: Props) {
  const [songId, setSongId] = useState(SONGS[0].id);
  const song = SONGS.find((s) => s.id === songId)!;
  const [index, setIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [progress, setProgress] = useState<Record<string, SongProgress>>(loadProgress);
  /** 音ごとのまちがえた回数（苦手なところを見つけるため） */
  const [missAt, setMissAt] = useState<Record<number, number>>({});
  /** 自分で弾いて進んだか（お手本で最後まで行ったときは記録しない） */
  const playedThrough = useRef(false);
  /** とちゅうへ飛んだ・お手本や区間練習を使った（そのまま最後まで行っても「弾けた」には数えない） */
  const skipped = useRef(false);
  /** 同じ音で続けてまちがえた回数（3回でお手本の音を鳴らす） */
  const missStreak = useRef(0);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'ng'; s: StringNo; semitone: number } | null>(null);
  const [message, setMessage] = useState<string>('');
  const [demo, setDemo] = useState(false);
  const [tempo, setTempo] = useState(1);
  const [loop, setLoop] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // テンポに合わせて弾くモード
  const [rhythm, setRhythm] = useState<null | 'count' | 'play' | 'done'>(null);
  const [countdown, setCountdown] = useState(0);
  const [beat, setBeat] = useState(-1);
  const [judges, setJudges] = useState<(Judge | null)[]>([]);
  const [extra, setExtra] = useState(0);
  const [best, setBest] = useState<Record<string, number>>(loadBest);
  const [newBest, setNewBest] = useState(false);
  const bestKey = `${song.id}@${tempo}`;
  const startAt = useRef(0);
  const judgesRef = useRef<(Judge | null)[]>([]);
  const spbMs = 60000 / (song.bpm * tempo);
  const noteTimes = useMemo(() => {
    let t = 0;
    return song.notes.map((n) => {
      const at = t;
      t += n.beats;
      return at;
    });
  }, [song]);
  const totalBeats = song.notes.reduce((a, n) => a + n.beats, 0);
  const handledId = useRef<number | null>(lastPlayed?.id ?? null);

  /** i 番目の音がふくまれる区切り（「さくら さくら」など）の最初と、次の区切りの最初 */
  const sectionOf = (i: number) => {
    let start = 0;
    for (let j = Math.min(i, song.notes.length - 1); j >= 0; j--) {
      if (song.notes[j].section) {
        start = j;
        break;
      }
    }
    let end = song.notes.length;
    for (let j = start + 1; j < song.notes.length; j++) {
      if (song.notes[j].section) {
        end = j;
        break;
      }
    }
    return { start, end };
  };
  /** 次の音へ。区間練習がオンなら、区切りの終わりで最初にもどる */
  const advance = (i: number) => {
    const { start, end } = sectionOf(i);
    if (loop && i + 1 >= end) {
      setLoopCount((c) => c + 1);
      return start;
    }
    return i + 1;
  };

  const finished = index >= song.notes.length;
  const target: SongNote | undefined = song.notes[index];
  const settingsMatch = tuning.id === song.tuningId && honsu === song.honsu;

  const stopRhythm = () => {
    soundEngine.stopClicks();
    setRhythm(null);
  };

  const startRhythm = () => {
    setDemo(false);
    restart();
    const empty = song.notes.map(() => null);
    judgesRef.current = empty;
    setJudges(empty);
    setExtra(0);
    const lead = 0.15;
    // カウント 4 拍 + 曲の拍すべてにメトロノーム
    const beats = [];
    for (let b = 0; b < COUNT_IN + Math.ceil(totalBeats); b++) {
      beats.push({ delay: lead + (b * spbMs) / 1000, accent: b < COUNT_IN ? b === 0 : (b - COUNT_IN) % 4 === 0 });
    }
    soundEngine.scheduleClicks(beats);
    // メトロノームが「聞こえる」時刻に合わせる（音の出る遅れの分だけ後ろにずらす）
    startAt.current = performance.now() + lead * 1000 + COUNT_IN * spbMs + soundEngine.outputLatencyMs;
    setCountdown(COUNT_IN);
    setRhythm('count');
  };

  const selectSong = (s: Song) => {
    stopRhythm();
    skipped.current = false;
    setMissAt({});
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
    skipped.current = false;
    setMissAt({});
    missStreak.current = 0;
    playedThrough.current = false;
    setLoopCount(0);
    setIndex(0);
    setMistakes(0);
    setFeedback(null);
    setMessage('');
  };

  // 弾いた音の判定（自分で弾くモード）
  useEffect(() => {
    if (!lastPlayed || lastPlayed.id === handledId.current) return;
    handledId.current = lastPlayed.id;
    if (rhythm === 'count' || rhythm === 'play') {
      judgeRhythm(lastPlayed);
      return;
    }
    if (demo || finished || !target) return;
    if (lastPlayed.string === target.string && lastPlayed.semitone === target.semitone) {
      setFeedback({ kind: 'ok', s: lastPlayed.string, semitone: lastPlayed.semitone });
      setMessage('');
      missStreak.current = 0;
      playedThrough.current = true;
      setIndex(advance(index));
    } else {
      setMistakes((m) => m + 1);
      setMissAt((m) => ({ ...m, [index]: (m[index] ?? 0) + 1 }));
      setFeedback({ kind: 'ng', s: lastPlayed.string, semitone: lastPlayed.semitone });
      const targetMidi = noteMidi(tuning, honsu, target.string, target.semitone);
      missStreak.current += 1;
      if (missStreak.current >= 3 && lastPlayed.midi !== targetMidi) {
        missStreak.current = 0;
        const t = target;
        setTimeout(() => onDemoNote(t.string, t.semitone, t.technique ?? 'bachi'), 450);
        setMessage(`🔊 この音だよ！ 光っている「${STRING_NAMES[t.string]}の${bunkaLabel(t.semitone)}」の音をよく聴いてみよう。`);
        return;
      }
      const goal = `「${STRING_NAMES[target.string]}の${bunkaLabel(target.semitone)}」`;
      const toBody = orientation === 'vertical' ? '下（胴の方）' : '右（胴の方）';
      const toNut = orientation === 'vertical' ? '上（上駒の方）' : '左（上駒の方）';
      let hint: string;
      if (lastPlayed.midi === targetMidi) hint = `音の高さは合っています！でも楽譜では${goal}です。`;
      else if (lastPlayed.string !== target.string) hint = `糸がちがいます。${goal}を弾こう。`;
      else if (target.semitone === 0) hint = `${goal}は開放弦（どこも押さえない）。胴の部分を弾こう。`;
      else if (lastPlayed.semitone < target.semitone) hint = `おしい、糸は合っています。もう少し${toBody}の${goal}へ。`;
      else hint = `おしい、糸は合っています。もう少し${toNut}の${goal}へ。`;
      setMessage(hint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPlayed, demo, finished, target, tuning, honsu, rhythm, loop, index]);

  /**
   * テンポモードの判定: 同じ勘所で、まだ判定していない音のうち
   * 判定のはばに入っている「いちばん早い音」として数える（少し遅れても前の音に当たる）
   */
  function judgeRhythm(ev: PlayedEvent) {
    const t = ev.time - startAt.current;
    let best = -1;
    let bestDt = Infinity;
    song.notes.forEach((n, i) => {
      if (best >= 0 || judgesRef.current[i] || n.string !== ev.string || n.semitone !== ev.semitone) return;
      const dt = Math.abs(t - noteTimes[i] * spbMs);
      if (dt <= WINDOW_MS) {
        best = i;
        bestDt = dt;
      }
    });
    if (best < 0) {
      setExtra((x) => x + 1);
      setFeedback({ kind: 'ng', s: ev.string, semitone: ev.semitone });
      return;
    }
    const next = [...judgesRef.current];
    next[best] = bestDt <= GREAT_MS ? 'great' : 'good';
    judgesRef.current = next;
    setJudges(next);
    setFeedback({ kind: 'ok', s: ev.string, semitone: ev.semitone });
  }

  // テンポモードの進行（画面の更新ごとに、今どの音かを計算）
  useEffect(() => {
    if (rhythm !== 'count' && rhythm !== 'play') return;
    let raf = 0;
    const tick = () => {
      const t = performance.now() - startAt.current;
      if (t < 0) {
        setCountdown(Math.ceil(-t / spbMs));
      } else {
        setRhythm('play');
        setBeat(Math.floor(t / spbMs));
        let cur = 0;
        while (cur + 1 < noteTimes.length && noteTimes[cur + 1] * spbMs <= t) cur++;
        setIndex(cur);
        // 時間が過ぎても弾かれなかった音は「ミス」
        let changed = false;
        const next = [...judgesRef.current];
        noteTimes.forEach((nt, i) => {
          if (!next[i] && t > nt * spbMs + WINDOW_MS) {
            next[i] = 'miss';
            changed = true;
          }
        });
        if (changed) {
          judgesRef.current = next;
          setJudges(next);
        }
        if (t > totalBeats * spbMs + WINDOW_MS) {
          soundEngine.stopClicks();
          setRhythm('done');
          setIndex(song.notes.length);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rhythm, spbMs, noteTimes, totalBeats, song]);

  useEffect(() => () => soundEngine.stopClicks(), []);

  const rhythmResult = useMemo(() => {
    const great = judges.filter((j) => j === 'great').length;
    const good = judges.filter((j) => j === 'good').length;
    const miss = judges.filter((j) => j === 'miss').length;
    const total = song.notes.length || 1;
    const score = Math.max(0, Math.round(((great + good * 0.6) / total) * 100 - extra * 2));
    return { great, good, miss, score };
  }, [judges, extra, song]);

  // テンポ練習が終わったら自己ベストを更新
  useEffect(() => {
    if (rhythm !== 'done') return;
    const prev = loadBest();
    if ((prev[bestKey] ?? -1) < rhythmResult.score) {
      const next = { ...prev, [bestKey]: rhythmResult.score };
      saveBest(next);
      setBest(next);
      setNewBest(prev[bestKey] !== undefined);
    } else {
      setNewBest(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhythm]);

  // 次の音がスクイなどのときは、奏法を自動で切り替える
  const targetTech = target?.technique ?? 'bachi';
  useEffect(() => {
    if (!demo && !finished) onSuggestTechnique(targetTech);
  }, [targetTech, demo, finished, onSuggestTechnique]);

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
    const t = setTimeout(() => setIndex(advance(index)), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, index, finished, song, tempo, onDemoNote, loop]);

  // 棹の上の表示
  useEffect(() => {
    const marks: Mark[] = [];
    if (target && !finished) {
      marks.push({ string: target.string, semitone: target.semitone, kind: demo ? 'demo' : 'target' });
      // テンポモードでは次の音も薄く表示（先読みの練習）
      const after = song.notes[index + 1];
      if (rhythm === 'play' && after && (after.string !== target.string || after.semitone !== target.semitone)) {
        marks.push({ string: after.string, semitone: after.semitone, kind: 'next' });
      }
    }
    if (feedback) marks.push({ string: feedback.s, semitone: feedback.semitone, kind: feedback.kind });
    onMarks(marks);
  }, [target, finished, demo, feedback, onMarks, rhythm, index, song]);

  useEffect(() => () => onMarks([]), [onMarks]);

  // 今の音が見えるように楽譜をスクロール
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index, songId]);

  // 自分で弾いて最後まで行ったら、学習の記録を残す
  useEffect(() => {
    if (!finished || demo || rhythm || !playedThrough.current) return;
    playedThrough.current = false;
    if (skipped.current) return; // とちゅうから弾いたときは記録しない
    const total = song.notes.length;
    const acc = Math.max(0, Math.round((total / (total + mistakes)) * 100));
    const prev = loadProgress();
    const next = { ...prev, [song.id]: { cleared: true, bestAccuracy: Math.max(acc, prev[song.id]?.bestAccuracy ?? 0) } };
    saveProgress(next);
    setProgress(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const nextSong = SONGS[SONGS.findIndex((x) => x.id === song.id) + 1];

  /** 苦手なところ（まちがいの多い音、上位 2 つ） */
  const troubles = Object.entries(missAt)
    .map(([i, n]) => ({ i: Number(i), n }))
    .filter((t) => t.n > 0 && song.notes[t.i])
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 2);
  // 弾き終わったら、楽譜をいちばんまちがえた音の所まで戻して見せる（赤い音）
  const firstTrouble = troubles[0]?.i;
  useEffect(() => {
    if (!finished || rhythm || firstTrouble === undefined) return;
    const t = setTimeout(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-idx="${firstTrouble}"]`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 400);
    return () => clearTimeout(t);
  }, [finished, rhythm, firstTrouble]);

  const practiceTrouble = (i: number) => {
    skipped.current = true;
    setMissAt({});
    setMistakes(0);
    playedThrough.current = false;
    setLoop(true);
    setLoopCount(0);
    setMessage('');
    setIndex(sectionOf(i).start);
  };
  /** 曲えらびの印: ✓ さいごまで弾けた / ★ まちがいなし、またはテンポ練習で90点以上 */
  const badge = (id: string) => {
    const p = progress[id];
    const tempoBest = Math.max(0, ...Object.entries(best).filter(([k]) => k.startsWith(`${id}@`)).map(([, v]) => v));
    if ((p?.bestAccuracy ?? 0) >= 100 || tempoBest >= 90) return '★';
    if (p?.cleared) return '✓';
    return '';
  };

  const accuracy = useMemo(() => {
    const total = song.notes.length;
    return Math.max(0, Math.round((total / (total + mistakes)) * 100));
  }, [song, mistakes]);

  const rowOf: Record<StringNo, number> = { 3: 0, 2: 1, 1: 2 };

  return (
    <div role="region" aria-label="曲の練習" className="song-panel shrink-0 border-b border-stone-800 bg-stone-900/90 px-2 sm:px-4 py-2 flex flex-col gap-2">
      {/* 上の段: 曲えらびとボタン */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={songId}
          onChange={(e) => selectSong(SONGS.find((s) => s.id === e.target.value)!)}
          className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-sm font-semibold max-w-[15rem]"
          aria-label="練習する曲（✓ 弾けた ★ 完ぺき）"
        >
          {SONGS.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {s.title}（{s.difficulty}）{badge(s.id) ? ` ${badge(s.id)}` : ''}
            </option>
          ))}
        </select>
        <span className="song-meta text-xs text-stone-400">
          {getTuning(song.tuningId).name}・{honsuName(song.honsu)}
        </span>
        <span className="song-meta text-xs text-emerald-300" title="✓ さいごまで弾けた曲 ／ ★ まちがいなし、またはテンポ練習で90点以上">
          クリア {SONGS.filter((x) => badge(x.id)).length}/{SONGS.length}
          {SONGS.some((x) => badge(x.id) === '★') && <span className="text-amber-300 ml-1">★{SONGS.filter((x) => badge(x.id) === '★').length}</span>}
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
        <div className="song-meta hidden sm:flex items-center gap-1.5 text-xs text-stone-400" title="進みぐあい">
          <div className="w-20 h-1.5 rounded-full bg-stone-700 overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${(Math.min(index, song.notes.length) / song.notes.length) * 100}%` }} />
          </div>
          {Math.min(index, song.notes.length)}/{song.notes.length}
        </div>
        {target && !demo && !rhythm && (
          <button
            onClick={() => onDemoNote(target.string, target.semitone, target.technique ?? 'bachi')}
            className="flex items-center gap-1 text-sm rounded-lg px-2.5 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
            title="次に弾く音を聴く（判定には入りません）"
          >
            <Volume2 size={15} />
            <span className="hidden lg:inline">この音</span>
          </button>
        )}
        <button
          onClick={() => {
            if (demo) {
              setDemo(false);
            } else {
              stopRhythm();
              if (finished) restart();
              skipped.current = true; // お手本のあとは、最初からやり直したときに記録する
              setDemo(true);
            }
          }}
          className={`flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 border ${
            demo ? 'bg-sky-500 text-stone-950 border-sky-400' : 'bg-stone-800 border-stone-700 hover:bg-stone-700'
          }`}
        >
          {demo ? <Pause size={15} /> : <Volume2 size={15} />}
          {demo ? '止める' : <span>お手本<span className="hidden xl:inline">を聴く</span></span>}
        </button>
        <button
          onClick={() => (rhythm === 'count' || rhythm === 'play' ? stopRhythm() : startRhythm())}
          className={`flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 border ${
            rhythm === 'count' || rhythm === 'play'
              ? 'bg-emerald-500 text-stone-950 border-emerald-400'
              : 'bg-stone-800 border-stone-700 hover:bg-stone-700'
          }`}
          title="メトロノームに合わせて弾き、タイミングを判定します"
        >
          {rhythm === 'count' || rhythm === 'play' ? <Square size={14} /> : <Timer size={15} />}
          {rhythm === 'count' || rhythm === 'play' ? '止める' : <span>テンポ<span className="hidden xl:inline">に合わせて弾く</span><span className="xl:hidden">練習</span></span>}
        </button>
        <select
          value={tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          disabled={rhythm === 'count' || rhythm === 'play'}
          className="bg-stone-800 border border-stone-700 rounded-lg px-1.5 py-1.5 text-xs"
          title="お手本・テンポ練習の速さ"
          aria-label="お手本・テンポ練習の速さ"
        >
          <option value={0.5}>ゆっくり</option>
          <option value={0.75}>少しゆっくり</option>
          <option value={1}>ふつう</option>
        </select>
        <label
          className="flex items-center gap-1 text-xs text-stone-300 cursor-pointer whitespace-nowrap"
          title="今の区切り（歌詞のまとまり）を、できるまで何度もくり返します（テンポ練習では使えません）"
        >
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => {
              setLoop(e.target.checked);
              setLoopCount(0);
              if (e.target.checked) skipped.current = true;
            }}
            className="accent-amber-500"
          />
          区間練習
        </label>
        <button
          onClick={() => {
            setDemo(false);
            stopRhythm();
            restart();
          }}
          className="flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
        >
          <RotateCcw size={15} />
          <span className="hidden sm:inline">最初から</span>
        </button>
        <button
          onClick={() => {
            if (!openPrintableScore(song)) setMessage('印刷用のページを開けませんでした。ブラウザのポップアップを許可してください。');
          }}
          className="song-meta flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
          title="この曲の文化譜を印刷用のページで開きます（配布プリントに）"
        >
          🖨<span className="hidden sm:inline">印刷</span>
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
                  if (rhythm === 'count' || rhythm === 'play') return;
                  if (i > 0) skipped.current = true;
                  setDemo(false);
                  setRhythm(null);
                  setIndex(i);
                  setMessage('');
                }}
                className={`relative flex flex-col shrink-0 ${isCur ? 'bg-amber-300/50' : ''} ${
                  note.section && i > 0 ? 'border-l-2 border-stone-400/70' : ''
                }`}
                style={{ width: `${width}rem` }}
                title="ここから練習する"
              >
                <div className="h-4 text-[0.6rem] text-stone-600 whitespace-nowrap px-0.5 text-left overflow-visible">
                  {note.section ?? ''}
                </div>
                <div className="tab-rows relative w-full">
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[1.3rem] px-0.5 rounded bunka font-bold text-sm leading-5 ${
                      rhythm && judges[i]
                        ? JUDGE_STYLE[judges[i]!]
                        : !rhythm && missAt[i]
                          ? 'bg-rose-500 text-white'
                        : isCur
                          ? 'bg-amber-500 text-white'
                          : done
                            ? 'bg-[#f7f0e1] text-stone-400'
                            : 'bg-[#f7f0e1] text-stone-900'
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
        {rhythm === 'count' ? (
          <span className="text-emerald-300 font-bold text-base">カウント… {countdown}</span>
        ) : rhythm === 'play' ? (
          <span className="text-emerald-300">
            <span
              key={beat}
              className={`inline-block w-3 h-3 rounded-full mr-1.5 align-middle animate-[beatFlash_0.35s_ease-out] ${
                beat % 4 === 0 ? 'bg-amber-300' : 'bg-emerald-300'
              }`}
            />
            ♪ 演奏中 — ぴったり {rhythmResult.great}・おしい {rhythmResult.good}・ミス {rhythmResult.miss}
            {target && (
              <span className="text-stone-400 ml-2">
                今: {STRING_NAMES[target.string]}の<b className="bunka text-amber-300">「{bunkaLabel(target.semitone)}」</b>
              </span>
            )}
          </span>
        ) : rhythm === 'done' ? (
          <span className="text-emerald-300 font-bold">
            {rhythmResult.score >= 90 ? '🎉 すばらしい！' : rhythmResult.score >= 60 ? '👍 いい感じ！' : '💪 もう少し！'} 得点 {rhythmResult.score}点
            <span className="font-normal text-stone-300 ml-2">
              ぴったり {rhythmResult.great}・おしい {rhythmResult.good}・ミス {rhythmResult.miss}・よけいな音 {extra}
            </span>
            <span className="font-normal text-amber-200 ml-2">
              {newBest ? '🏆 自己ベスト更新！' : `自己ベスト ${best[bestKey] ?? rhythmResult.score}点`}
            </span>
            <button onClick={startRhythm} className="ml-2 underline text-amber-300">もう一度</button>
            {tempo === 1 && rhythmResult.score < 60 && <span className="font-normal text-stone-400 ml-2">（速さを「ゆっくり」にしてみよう）</span>}
          </span>
        ) : finished ? (
          <span className="text-emerald-300 font-bold">
            🎉 さいごまで弾けました！ まちがい {mistakes} 回（正確さ {accuracy}%）
            {accuracy === 100 && <span className="text-amber-200 ml-1">★ 完ぺき！</span>}
            <button onClick={restart} className="ml-2 underline text-amber-300">もう一度</button>
            {accuracy === 100 && (
              <button onClick={startRhythm} className="ml-2 underline text-sky-300">
                テンポに合わせて弾いてみる
              </button>
            )}
            {troubles.length > 0 && (
              <span className="block mt-1 font-normal text-stone-300">
                苦手なところ:
                {troubles.map((t) => (
                  <button
                    key={t.i}
                    onClick={() => practiceTrouble(t.i)}
                    className="ml-2 rounded-lg border border-rose-400/60 bg-rose-900/40 px-2 py-0.5 text-rose-200"
                    title="この区切りを、できるまで区間練習します"
                  >
                    「{song.notes[sectionOf(t.i).start].section}」の {STRING_NAMES[song.notes[t.i].string]}の{bunkaLabel(song.notes[t.i].semitone)}（{t.n}回）→ 区間練習
                  </button>
                ))}
              </span>
            )}
            {nextSong && (
              <button
                onClick={() => selectSong(nextSong)}
                className="ml-2 rounded-lg bg-amber-500 text-stone-950 px-2 py-0.5 no-underline"
              >
                次の曲へ ▶ {nextSong.title}
              </button>
            )}
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
            {loop && (
              <span className="text-amber-200 bg-amber-900/50 rounded px-1.5 mr-1">
                🔁「{song.notes[sectionOf(index).start].section}」{loopCount > 0 ? `${loopCount}回目クリア` : 'をくり返し中'}
              </span>
            )}
            次は <b className="text-amber-300">{STRING_NAMES[target.string]}</b> の
            <b className="text-amber-300 bunka text-base">「{bunkaLabel(target.semitone)}」</b>
            <span className="text-stone-400">
              （{doremiName(noteMidi(tuning, honsu, target.string, target.semitone))}
              {target.technique && target.technique !== 'bachi'
                ? `・${TECHNIQUES.find((t) => t.id === target.technique)!.name}`
                : ''}
              ）
            </span>
            <span className="song-desc text-stone-400 ml-2 hidden md:inline">{song.description}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
