/**
 * 画面上部: タイトル・モード切り替え・調子／本数・表示の切り替え
 */
import { BookOpen, Eye, EyeOff, Smartphone, Monitor } from 'lucide-react';
import {
  HONSU_LIST,
  LABEL_MODE_NAMES,
  LabelMode,
  TUNINGS,
  Tuning,
  doremiName,
  honsuName,
  honsuToMidi,
} from '../data/notation';

export type Mode = 'free' | 'song' | 'quiz';
const MODE_NAMES: Record<Mode, string> = { free: '自由に弾く', song: '曲の練習', quiz: 'クイズ' };

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  tuning: Tuning;
  setTuningId: (id: Tuning['id']) => void;
  honsu: number;
  setHonsu: (h: number) => void;
  labelMode: LabelMode;
  setLabelMode: (m: LabelMode) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  orientation: 'horizontal' | 'vertical';
  setOrientation: (o: 'horizontal' | 'vertical') => void;
  range: 'octave' | 'full';
  setRange: (r: 'octave' | 'full') => void;
  onOpenGuide: () => void;
  recording: boolean;
  canRecord: boolean;
  onToggleRecording: () => void;
  metronomeOpen: boolean;
  onToggleMetronome: () => void;
  onOpenTuner: () => void;
}

export function Header(p: Props) {
  return (
    <header className="app-header shrink-0 flex flex-col gap-1.5 px-2 sm:px-4 py-2 bg-stone-950 border-b border-stone-800">
      <div className="header-row flex flex-wrap items-center gap-1.5 sm:gap-2">
        <h1 className="flex items-baseline gap-1.5 sm:mr-1">
          <span className="font-serif-jp text-lg min-[400px]:text-xl sm:text-2xl font-bold text-amber-100">三味線</span>
          <span className="text-[0.65rem] text-stone-400 hidden lg:inline">学習用シミュレーター</span>
        </h1>

        <div className="flex rounded-lg overflow-hidden border border-stone-700 text-sm">
          {(Object.keys(MODE_NAMES) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => p.setMode(m)}
              className={`px-2 min-[400px]:px-2.5 sm:px-3 py-1.5 whitespace-nowrap ${
                p.mode === m ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
              }`}
            >
              {MODE_NAMES[m]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {p.canRecord && (
          <button
            onClick={p.onToggleRecording}
            className={`flex items-center gap-1 text-sm rounded-lg px-2.5 py-1.5 border ${
              p.recording
                ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
            }`}
            title="弾いた音を録音して、聴きなおしたり保存したりできます"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${p.recording ? 'bg-white' : 'bg-rose-500'}`} />
            <span className="hidden min-[400px]:inline">{p.recording ? '録音を止める' : '録音'}</span>
          </button>
        )}

        <button
          onClick={p.onOpenGuide}
          className="flex items-center gap-1 text-sm rounded-lg px-2.5 py-1.5 bg-amber-900/40 text-amber-200 border border-amber-800/60 hover:bg-amber-900/60"
        >
          <BookOpen size={15} /> <span className="hidden sm:inline">三味線の</span><span className="hidden min-[400px]:inline">きほん</span>
        </button>
      </div>

      <div className="header-row header-settings flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <label className="flex items-center gap-1">
          <span className="text-stone-400 hidden sm:inline">調子</span>
          <select
            value={p.tuning.id}
            onChange={(e) => p.setTuningId(e.target.value as Tuning['id'])}
            className="bg-stone-800 border border-stone-700 rounded-lg px-1.5 py-1 font-semibold"
          >
            {TUNINGS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-stone-400 hidden sm:inline">本数</span>
          <select
            value={p.honsu}
            onChange={(e) => p.setHonsu(Number(e.target.value))}
            className="bg-stone-800 border border-stone-700 rounded-lg px-1.5 py-1 font-semibold"
          >
            {HONSU_LIST.map((h) => (
              <option key={h} value={h}>
                {honsuName(h)}（{doremiName(honsuToMidi(h))}）
              </option>
            ))}
          </select>
        </label>

        <div className="flex rounded-lg overflow-hidden border border-stone-700">
          {(Object.keys(LABEL_MODE_NAMES) as LabelMode[]).map((m) => (
            <button
              key={m}
              onClick={() => p.setLabelMode(m)}
              className={`px-2 py-1 ${p.labelMode === m ? 'bg-stone-200 text-stone-950 font-bold' : 'bg-stone-900 text-stone-300 hover:bg-stone-800'}`}
            >
              {LABEL_MODE_NAMES[m]}
            </button>
          ))}
        </div>

        <button
          onClick={() => p.setShowLabels(!p.showLabels)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800"
          title="棹の上の番号を隠して、覚えたかためせます"
        >
          {p.showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
          {p.showLabels ? '番号あり' : '番号なし'}
        </button>

        <button
          onClick={p.onToggleMetronome}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 border whitespace-nowrap ${
            p.metronomeOpen ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold' : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
          }`}
          title="拍子やハネも選べるメトロノーム"
        >
          🕐 メトロノーム
        </button>
        <button
          onClick={p.onOpenTuner}
          className="flex items-center gap-1 rounded-lg px-2 py-1 bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800 whitespace-nowrap"
          title="基準の音やマイクで、本物の三味線の調弦を手伝います"
        >
          🎚 チューナー
        </button>

        <button
          onClick={() => p.setRange(p.range === 'octave' ? 'full' : 'octave')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800 whitespace-nowrap"
          title="棹に表示する勘所の範囲"
        >
          範囲 {p.range === 'octave' ? '0〜10' : '0〜20'}
        </button>

        <button
          onClick={() => p.setOrientation(p.orientation === 'horizontal' ? 'vertical' : 'horizontal')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800"
        >
          {p.orientation === 'horizontal' ? <Monitor size={14} /> : <Smartphone size={14} />}
          {p.orientation === 'horizontal' ? '横向き' : '縦向き'}
        </button>
      </div>
    </header>
  );
}
