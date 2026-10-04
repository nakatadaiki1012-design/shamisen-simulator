import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, Mode } from './components/Header';
import { TechniqueBar } from './components/TechniqueBar';
import { Neck, Mark, PlayMode } from './components/Neck';
import { useMidi } from './hooks/useMidi';
import { SongPanel, PlayedEvent } from './components/SongPanel';
import { QuizPanel } from './components/QuizPanel';
import { GuideModal } from './components/GuideModal';
import { Recording, RecordingDialog } from './components/RecordingDialog';
import {
  LabelMode,
  StringNo,
  Technique,
  Tuning,
  STRINGS,
  MAX_SEMITONE,
  STRING_NAMES,
  bunkaLabel,
  doremiName,
  westernName,
  getTuning,
  honsuToMidi,
  midiToFreq,
  noteMidi,
} from './data/notation';
import { soundEngine } from './audio/soundEngine';

/** キーボードで弾く（キーの物理的な位置で判定するので、日本語キーボードでもOK） */
const KEY_ROWS: [StringNo, string[]][] = [
  [1, ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']],
  [2, ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight']],
  [3, ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash']],
];
const KEY_MAP = new Map<string, { s: StringNo; semitone: number }>();
for (const [s, codes] of KEY_ROWS) codes.forEach((c, i) => KEY_MAP.set(c, { s, semitone: i }));

const loadPref = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const savePref = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 保存できない環境では何もしない */
  }
};

export default function App() {
  const [mode, setMode] = useState<Mode>('free');
  const [tuningId, setTuningId] = useState<Tuning['id']>('honchoshi');
  const [honsu, setHonsu] = useState(4);
  const [labelMode, setLabelMode] = useState<LabelMode>(() => loadPref('shamisen_label', 'bunka'));
  const [showLabels, setShowLabels] = useState<boolean>(() => loadPref('shamisen_show_labels', true));
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() =>
    window.innerWidth < 768 && window.innerHeight > window.innerWidth ? 'vertical' : 'horizontal'
  );
  // 縦向き（スマホ）では勘所が小さくなりすぎるので、最初は「10」（1オクターブ）までを表示
  const [range, setRange] = useState<'octave' | 'full'>(() =>
    // ノートPCより小さい画面では、勘所を大きく見せるため「0〜10」から始める
    loadPref('shamisen_range', Math.max(window.innerWidth, window.innerHeight) < 1100 ? 'octave' : 'full')
  );
  const maxSemitone = range === 'octave' ? 12 : MAX_SEMITONE;
  const [technique, setTechnique] = useState<Technique>('bachi');
  const [sawari, setSawari] = useState<boolean>(() => loadPref('shamisen_sawari', true));
  const [guideOpen, setGuideOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Recording | null>(null);

  const [pluckCount, setPluckCount] = useState<Record<StringNo, number>>({ 1: 0, 2: 0, 3: 0 });
  const [playedMarks, setPlayedMarks] = useState<Mark[]>([]);
  const [panelMarks, setPanelMarks] = useState<Mark[]>([]);
  const [quizHidesLabels, setQuizHidesLabels] = useState(false);
  const [showSame, setShowSame] = useState<boolean>(() => loadPref('shamisen_show_same', true));
  const [lastPlayed, setLastPlayed] = useState<PlayedEvent | null>(null);
  const eventId = useRef(0);

  // 演奏のしかた: ワンハンド（タップで発音）／両手（左手で押さえて右手の撥で打つ）
  const [playMode, setPlayMode] = useState<PlayMode>(() => loadPref('shamisen_play_mode', 'one'));
  const [haptic, setHaptic] = useState<boolean>(() => loadPref('shamisen_haptic', true));
  const [pressed, setPressed] = useState<Record<StringNo, number>>({ 1: 0, 2: 0, 3: 0 });
  const pressedRef = useRef<Record<StringNo, number>>({ 1: 0, 2: 0, 3: 0 });
  const fingersRef = useRef(new Map<number, { s: StringNo; semitone: number }>());

  const tuning = getTuning(tuningId);

  useEffect(() => savePref('shamisen_label', labelMode), [labelMode]);
  useEffect(() => savePref('shamisen_show_labels', showLabels), [showLabels]);
  useEffect(() => savePref('shamisen_sawari', sawari), [sawari]);
  useEffect(() => savePref('shamisen_range', range), [range]);
  useEffect(() => savePref('shamisen_show_same', showSame), [showSame]);
  useEffect(() => savePref('shamisen_play_mode', playMode), [playMode]);
  useEffect(() => savePref('shamisen_haptic', haptic), [haptic]);

  /** 触った手ごたえ（対応しているスマホだけ、ほんの少し震える） */
  const buzz = useCallback(
    (ms: number) => {
      if (haptic && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(ms);
        } catch {
          /* 震えない端末では何もしない */
        }
      }
    },
    [haptic]
  );

  // 自由に弾くモード: 最後に弾いた音と「同じ高さの音が出る場所」を表示
  // （弾くたびに画面の更新が 2 回続かないよう、表示するときに計算する）
  const sameMarks = useMemo<Mark[]>(() => {
    if (mode !== 'free' || !showSame || !lastPlayed) return [];
    const marks: Mark[] = [];
    for (const s of STRINGS) {
      const semitone = lastPlayed.midi - noteMidi(tuning, honsu, s, 0);
      if (semitone >= 0 && semitone <= maxSemitone && !(s === lastPlayed.string && semitone === lastPlayed.semitone)) {
        marks.push({ string: s, semitone, kind: 'same' });
      }
    }
    return marks;
  }, [mode, showSame, lastPlayed, tuning, honsu, maxSemitone]);
  useEffect(() => soundEngine.setSawari(sawari), [sawari]);

  // 今の調子・本数で使う全部の勘所（0〜24 × 3 本）を、別スレッドで前もって作っておく。
  // 画面を開いた直後から作りはじめるので、最初にタップするころには準備ができている
  useEffect(() => {
    soundEngine.init();
    const ichi = midiToFreq(honsuToMidi(honsu));
    const notes = [];
    for (let semitone = 0; semitone <= MAX_SEMITONE; semitone++) {
      for (const s of STRINGS) {
        notes.push({ s, freq: midiToFreq(noteMidi(tuning, honsu, s, semitone)), open: semitone === 0 });
      }
    }
    soundEngine.prewarm(notes, ichi);
  }, [tuning, honsu, sawari]);

  // 画面に触れた「いちばん最初の瞬間」に、止まっている音の仕組みを起こす（スマホ対策）。
  // capture（先取り）で受け取るので、ほかのどの処理よりも先に動く。
  // 一度動き出せばほとんど時間はかからず、スリープ後に止められても次のタッチで復帰する。
  useEffect(() => {
    const events = ['touchstart', 'pointerdown', 'mousedown', 'keydown'];
    const wake = () => soundEngine.resume();
    events.forEach((e) => window.addEventListener(e, wake, { passive: true, capture: true }));
    const onVisible = () => {
      if (document.visibilityState === 'visible' && soundEngine.ready && !soundEngine.running) soundEngine.resume();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  /** 音を鳴らして、棹の上の表示を更新する */
  const sound = useCallback(
    (s: StringNo, semitone: number, tech: Technique, velocity?: number) => {
      const midi = noteMidi(tuning, honsu, s, semitone);
      const ichi = midiToFreq(honsuToMidi(honsu));
      soundEngine.play(s, midiToFreq(midi), tech, { ichiFreq: ichi, open: semitone === 0, velocity });
      setPluckCount((c) => ({ ...c, [s]: c[s] + 1 }));
      setPlayedMarks((m) => [...m.filter((x) => x.string !== s), { string: s, semitone, kind: 'played' }]);
      return midi;
    },
    [tuning, honsu]
  );

  // 弾いた跡の白い光は少しで消す
  useEffect(() => {
    if (playedMarks.length === 0) return;
    const t = setTimeout(() => setPlayedMarks([]), 300);
    return () => clearTimeout(t);
  }, [playedMarks]);

  /** 自分で弾いたとき（曲の練習・クイズの判定にも使う） */
  const playNote = useCallback(
    (s: StringNo, semitone: number, tech: Technique, velocity?: number) => {
      const midi = sound(s, semitone, tech, velocity);
      eventId.current += 1;
      setLastPlayed({ id: eventId.current, time: performance.now(), string: s, semitone, midi });
    },
    [sound]
  );

  /** ワンハンド: タップした勘所をそのまま弾く */
  const handlePlay = useCallback(
    (s: StringNo, semitone: number, slide: boolean) => {
      playNote(s, semitone, slide ? 'suri' : technique);
      buzz(slide ? 4 : 8);
    },
    [playNote, technique, buzz]
  );

  // ---------- 両手モード ----------

  /** 押さえている指から、糸ごとの勘所（いちばん胴に近い指）を決める */
  const updatePressed = () => {
    const next: Record<StringNo, number> = { 1: 0, 2: 0, 3: 0 };
    for (const f of fingersRef.current.values()) next[f.s] = Math.max(next[f.s], f.semitone);
    pressedRef.current = next;
    setPressed(next);
    return next;
  };

  /** 左手で押さえた・指をすべらせた */
  const handleFinger = useCallback(
    (pointerId: number, s: StringNo, semitone: number, moved: boolean) => {
      const before = pressedRef.current[s];
      fingersRef.current.set(pointerId, { s, semitone });
      const now = updatePressed()[s];
      buzz(moved ? 3 : 6);
      if (now === before || !soundEngine.isRinging(s)) return;
      // 糸が鳴っているうちに指を動かした: すべらせたらスリ、選んだ奏法が打ち指なら打ち指
      if (moved && before > 0) playNote(s, now, 'suri', 0.6);
      else if (!moved && technique === 'uchi' && now > before) playNote(s, now, 'uchi', 0.6);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buzz, playNote, technique]
  );

  /** 左手の指を離した（選んだ奏法がハジキなら、離した瞬間にはじく） */
  const handleFingerUp = useCallback(
    (pointerId: number) => {
      const f = fingersRef.current.get(pointerId);
      if (!f) return;
      fingersRef.current.delete(pointerId);
      const before = pressedRef.current[f.s];
      const now = updatePressed()[f.s];
      if (technique === 'hajiki' && now < before && soundEngine.isRinging(f.s)) playNote(f.s, now, 'hajiki', 0.6);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playNote, technique]
  );

  /** 右手の撥で打った（下へ＝叩き、上へ＝掬い） */
  const handleStrike = useCallback(
    (s: StringNo, stroke: 'down' | 'up', velocity: number) => {
      playNote(s, pressedRef.current[s], stroke === 'up' ? 'sukui' : 'bachi', velocity);
      buzz(10);
    },
    [playNote, buzz]
  );

  // 演奏のしかたを切り替えたら、押さえている指を全部はなす
  useEffect(() => {
    fingersRef.current.clear();
    updatePressed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode]);

  // ---------- MIDI 入力 ----------

  /** MIDI のノート番号を、弾きやすい糸と勘所に割りあてる（いちばん上駒に近い場所） */
  const midiToPosition = useCallback(
    (note: number): { s: StringNo; semitone: number } => {
      const opens = STRINGS.map((st) => ({ s: st, open: noteMidi(tuning, honsu, st, 0) }));
      let n = note;
      while (n < opens[0].open) n += 12; // 一の糸より低い音はオクターブ上げる
      while (n > opens[2].open + MAX_SEMITONE) n -= 12;
      let best = { s: 1 as StringNo, semitone: n - opens[0].open };
      for (const o of opens) {
        const k = n - o.open;
        if (k >= 0 && k <= MAX_SEMITONE && k < best.semitone) best = { s: o.s, semitone: k };
      }
      return best;
    },
    [tuning, honsu]
  );
  const midi = useMidi((note, velocity) => {
    const p = midiToPosition(note);
    playNote(p.s, p.semitone, technique === 'suri' ? 'bachi' : technique, velocity);
  });

  // キーボード演奏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (guideOpen) {
        if (e.key === 'Escape') setGuideOpen(false);
        return;
      }
      const hit = KEY_MAP.get(e.code);
      if (!hit) return;
      e.preventDefault();
      handlePlay(hit.s, hit.semitone, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlay, guideOpen]);

  const applySettings = useCallback((id: Tuning['id'], h: number) => {
    setTuningId(id);
    setHonsu(h);
  }, []);

  const demoNote = useCallback((s: StringNo, semitone: number, tech: Technique) => sound(s, semitone, tech), [sound]);
  const listen = useCallback((s: StringNo, semitone: number) => sound(s, semitone, 'bachi'), [sound]);

  /** 調弦の確認: 一・二・三の糸の開放弦を順番に鳴らす */
  const tuneTimers = useRef<number[]>([]);
  const playTuning = () => {
    tuneTimers.current.forEach(clearTimeout);
    tuneTimers.current = STRINGS.map((s, i) => window.setTimeout(() => sound(s, 0, 'bachi'), i * 650));
  };

  const toggleRecording = async () => {
    if (!recording) {
      if (recorded) URL.revokeObjectURL(recorded.url);
      setRecorded(null);
      try {
        soundEngine.startRecording();
        setRecording(true);
      } catch {
        alert('このブラウザでは録音できませんでした。');
      }
      return;
    }
    setRecording(false);
    const result = await soundEngine.stopRecording();
    if (result) setRecorded(result);
  };

  const changeMode = (m: Mode) => {
    soundEngine.stopAll();
    setPanelMarks([]);
    setMode(m);
  };

  return (
    <div className="relative w-screen h-[100dvh] flex flex-col bg-stone-950 text-stone-100 overflow-hidden select-none">
      <Header
        mode={mode}
        setMode={changeMode}
        tuning={tuning}
        setTuningId={setTuningId}
        honsu={honsu}
        setHonsu={setHonsu}
        labelMode={labelMode}
        setLabelMode={setLabelMode}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        orientation={orientation}
        setOrientation={(o) => {
          setOrientation(o);
          if (o === 'vertical' && window.innerHeight < 900) setRange('octave');
        }}
        range={range}
        setRange={setRange}
        onOpenGuide={() => setGuideOpen(true)}
        recording={recording}
        canRecord={soundEngine.canRecord}
        onToggleRecording={toggleRecording}
      />
      <TechniqueBar
        technique={technique}
        setTechnique={setTechnique}
        sawari={sawari}
        setSawari={setSawari}
        playMode={playMode}
        setPlayMode={setPlayMode}
        haptic={haptic}
        setHaptic={setHaptic}
        midi={midi}
      />

      {mode === 'song' && (
        <SongPanel
          tuning={tuning}
          honsu={honsu}
          lastPlayed={lastPlayed}
          onMarks={setPanelMarks}
          onApplySettings={applySettings}
          onDemoNote={demoNote}
          onSuggestTechnique={setTechnique}
        />
      )}
      {mode === 'quiz' && (
        <QuizPanel
          tuning={tuning}
          honsu={honsu}
          maxSemitone={maxSemitone}
          lastPlayed={lastPlayed}
          onMarks={setPanelMarks}
          onListen={listen}
          onHideLabels={setQuizHidesLabels}
        />
      )}
      {mode === 'free' && (
        <div className="free-tip shrink-0 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 bg-stone-950 border-b border-stone-900">
          <div className="flex items-baseline gap-1.5 min-w-[9.5rem] sm:min-w-[12rem]" aria-live="polite">
            {lastPlayed ? (
              <>
                <span className="font-serif-jp text-amber-200 text-sm">{STRING_NAMES[lastPlayed.string]}</span>
                <span className="bunka font-bold text-xl text-amber-300">{bunkaLabel(lastPlayed.semitone)}</span>
                <span className="text-stone-300 text-sm">{doremiName(lastPlayed.midi)}</span>
                <span className="text-stone-500 text-xs">{westernName(lastPlayed.midi)}</span>
              </>
            ) : (
              <span className="text-stone-500 text-xs">弾いた音がここに出ます</span>
            )}
          </div>
          <button
            onClick={playTuning}
            className="shrink-0 text-xs rounded-lg px-2 py-1 bg-stone-800 border border-stone-700 hover:bg-stone-700"
            title="一・二・三の糸の開放弦を順番に鳴らします"
          >
            ♪ 調弦の音を聴く
          </button>
          <label className="shrink-0 flex items-center gap-1 text-xs text-stone-400 cursor-pointer" title="弾いた音と同じ高さが出る、ほかの糸の場所を水色の点線で表示します">
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} className="accent-sky-500" />
            同じ音の場所
          </label>
          <span className="hidden sm:inline text-[0.7rem] sm:text-xs text-stone-500 truncate">
            {tuning.name}：{tuning.howTo}
          </span>
        </div>
      )}

      <main className="board-wrap relative flex-1 min-h-0 p-1.5 sm:p-3">
        <Neck
          tuning={tuning}
          honsu={honsu}
          labelMode={labelMode}
          showLabels={showLabels && !quizHidesLabels}
          revealMarked={!quizHidesLabels}
          orientation={orientation}
          maxSemitone={maxSemitone}
          marks={[
            ...playedMarks,
            ...panelMarks,
            ...sameMarks,
            ...(playMode === 'two'
              ? STRINGS.filter((st) => pressed[st] > 0).map((st) => ({ string: st, semitone: pressed[st], kind: 'pressed' as const }))
              : []),
          ]}
          pluckCount={pluckCount}
          playMode={playMode}
          pressed={pressed}
          onPlay={handlePlay}
          onFinger={handleFinger}
          onFingerUp={handleFingerUp}
          onStrike={handleStrike}
        />
        {mode === 'free' && !lastPlayed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
            <div className="animate-bounce rounded-2xl bg-stone-950/85 border border-amber-500/60 px-4 py-3 text-center shadow-xl">
              {playMode === 'two' ? (
                <>
                  <div className="text-amber-200 font-bold text-sm sm:text-base">✋ 左手で棹を押さえ、{orientation === 'vertical' ? '下' : '右'}の撥ゾーンで糸を打とう</div>
                  <div className="text-stone-400 text-xs mt-1">糸をタップ／上から下へ横切る＝叩き、下から上へ＝掬い（押さえなければ開放弦）</div>
                </>
              ) : (
                <>
                  <div className="text-amber-200 font-bold text-sm sm:text-base">👆 棹の上の四角をタップして弾いてみよう</div>
                  <div className="text-stone-400 text-xs mt-1">胴（白い部分）をタップすると開放弦「0」</div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      {recorded && (
        <RecordingDialog
          recording={recorded}
          onClose={() => {
            URL.revokeObjectURL(recorded.url);
            setRecorded(null);
          }}
          onDiscard={() => {
            URL.revokeObjectURL(recorded.url);
            setRecorded(null);
          }}
        />
      )}
    </div>
  );
}
