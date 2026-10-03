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
  const [showLabels, setShowLabels] = useState(true);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() =>
    window.innerWidth < 768 && window.innerHeight > window.innerWidth ? 'vertical' : 'horizontal'
  );
  const [technique, setTechnique] = useState<Technique>('bachi');
  const [sawari, setSawari] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  const [pluckCount, setPluckCount] = useState<Record<StringNo, number>>({ 1: 0, 2: 0, 3: 0 });
  const [playedMarks, setPlayedMarks] = useState<Mark[]>([]);
  const [panelMarks, setPanelMarks] = useState<Mark[]>([]);
  const [lastPlayed, setLastPlayed] = useState<PlayedEvent | null>(null);
  const eventId = useRef(0);

  const tuning = getTuning(tuningId);

  useEffect(() => savePref('shamisen_label', labelMode), [labelMode]);
  useEffect(() => soundEngine.setSawari(sawari), [sawari]);

  // 最初のタッチ・クリックで音を出せる状態にする（スマホ対策）
  useEffect(() => {
    const events = ['pointerdown', 'touchend', 'keydown'];
    const unlock = () => {
      soundEngine.init();
      events.forEach((e) => window.removeEventListener(e, unlock));
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
      setLastPlayed({ id: eventId.current, string: s, semitone, midi });
    },
    [sound, technique]
  );

  // キーボード演奏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      const hit = KEY_MAP.get(e.code);
      if (!hit) return;
      e.preventDefault();
      handlePlay(hit.s, hit.semitone, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlay]);

  const applySettings = useCallback((id: Tuning['id'], h: number) => {
    setTuningId(id);
    setHonsu(h);
  }, []);

  const demoNote = useCallback((s: StringNo, semitone: number, tech: Technique) => sound(s, semitone, tech), [sound]);
  const listen = useCallback((s: StringNo, semitone: number) => sound(s, semitone, 'bachi'), [sound]);

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
        setOrientation={setOrientation}
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
        />
      )}
      {mode === 'quiz' && (
        <QuizPanel tuning={tuning} honsu={honsu} lastPlayed={lastPlayed} onMarks={setPanelMarks} onListen={listen} />
      )}
      {mode === 'free' && (
        <div className="free-tip shrink-0 px-3 py-1 text-[0.7rem] sm:text-xs text-stone-500 bg-stone-950">
          棹の四角をタップすると、その勘所を押さえて弾いた音が出ます。胴の部分は開放弦（0）。{tuning.name}：{tuning.howTo}
        </div>
      )}

      <main className="board-wrap relative flex-1 min-h-0 p-1.5 sm:p-3">
        <Neck
          tuning={tuning}
          honsu={honsu}
          labelMode={labelMode}
          showLabels={showLabels}
          orientation={orientation}
          marks={[...playedMarks, ...panelMarks]}
          pluckCount={pluckCount}
          onPlay={handlePlay}
        />
      </main>

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
