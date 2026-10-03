import { useCallback, useEffect, useRef, useState } from 'react';
import { Header, Mode } from './components/Header';
import { TechniqueBar } from './components/TechniqueBar';
import { Neck, Mark } from './components/Neck';
import { SongPanel, PlayedEvent } from './components/SongPanel';
import { QuizPanel } from './components/QuizPanel';
import { GuideModal } from './components/GuideModal';
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
  const [audioReady, setAudioReady] = useState(false);

  const [pluckCount, setPluckCount] = useState<Record<StringNo, number>>({ 1: 0, 2: 0, 3: 0 });
  const [playedMarks, setPlayedMarks] = useState<Mark[]>([]);
  const [panelMarks, setPanelMarks] = useState<Mark[]>([]);
  const [sameMarks, setSameMarks] = useState<Mark[]>([]);
  const [quizHidesLabels, setQuizHidesLabels] = useState(false);
  const [showSame, setShowSame] = useState<boolean>(() => loadPref('shamisen_show_same', true));
  const [lastPlayed, setLastPlayed] = useState<PlayedEvent | null>(null);
  const eventId = useRef(0);

  const tuning = getTuning(tuningId);

  useEffect(() => savePref('shamisen_label', labelMode), [labelMode]);
  useEffect(() => savePref('shamisen_show_labels', showLabels), [showLabels]);
  useEffect(() => savePref('shamisen_sawari', sawari), [sawari]);
  useEffect(() => savePref('shamisen_range', range), [range]);
  useEffect(() => savePref('shamisen_show_same', showSame), [showSame]);

  // 自由に弾くモード: 最後に弾いた音と「同じ高さの音が出る場所」を表示
  useEffect(() => {
    if (mode !== 'free' || !showSame || !lastPlayed) {
      setSameMarks([]);
      return;
    }
    const marks: Mark[] = [];
    for (const s of STRINGS) {
      const semitone = lastPlayed.midi - noteMidi(tuning, honsu, s, 0);
      if (semitone >= 0 && semitone <= maxSemitone && !(s === lastPlayed.string && semitone === lastPlayed.semitone)) {
        marks.push({ string: s, semitone, kind: 'same' });
      }
    }
    setSameMarks(marks);
  }, [mode, showSame, lastPlayed, tuning, honsu, maxSemitone]);
  useEffect(() => soundEngine.setSawari(sawari), [sawari]);

  // 今の調子・本数で使う音を、空き時間に前もって作っておく
  useEffect(() => {
    if (!audioReady) return;
    const ichi = midiToFreq(honsuToMidi(honsu));
    const notes = [];
    for (let semitone = 0; semitone <= maxSemitone; semitone++) {
      for (const s of STRINGS) notes.push({ freq: midiToFreq(noteMidi(tuning, honsu, s, semitone)), ichiFreq: ichi });
    }
    soundEngine.prewarm(notes);
  }, [audioReady, tuning, honsu, sawari, maxSemitone]);

  // タッチ・クリックのたびに、音を出せる状態か確かめる（スマホ対策）
  // 一度鳴らせる状態になれば、この確認はほとんど時間がかからない。
  // iPhone などでスリープ後に音が止められても、次のタッチでまた鳴るようになる。
  useEffect(() => {
    const events = ['pointerdown', 'touchend', 'keydown'];
    const unlock = () => {
      soundEngine.init();
      setAudioReady(true);
    };
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  /** 音を鳴らして、棹の上の表示を更新する */
  const sound = useCallback(
    (s: StringNo, semitone: number, tech: Technique) => {
      const midi = noteMidi(tuning, honsu, s, semitone);
      const ichi = midiToFreq(honsuToMidi(honsu));
      soundEngine.play(s, midiToFreq(midi), tech, ichi);
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

  /** 自分で弾いたとき（判定にも使う） */
  const handlePlay = useCallback(
    (s: StringNo, semitone: number, slide: boolean) => {
      const midi = sound(s, semitone, slide ? 'suri' : technique);
      eventId.current += 1;
      setLastPlayed({ id: eventId.current, time: performance.now(), string: s, semitone, midi });
    },
    [sound, technique]
  );

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
      />
      <TechniqueBar technique={technique} setTechnique={setTechnique} sawari={sawari} setSawari={setSawari} />

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
          marks={[...playedMarks, ...panelMarks, ...sameMarks]}
          pluckCount={pluckCount}
          onPlay={handlePlay}
        />
      </main>

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
