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
  onOpenGuide: () => void;
}

export function Header(p: Props) {
  return (
    <header className="app-header shrink-0 flex flex-col gap-1.5 px-2 sm:px-4 py-2 bg-stone-950 border-b border-stone-800">
      <div className="header-row flex flex-wrap items-center gap-2">
        <h1 className="flex items-baseline gap-1.5 mr-1">
          <span className="font-serif-jp text-xl sm:text-2xl font-bold text-amber-100">三味線</span>
          <span className="text-[0.65rem] text-stone-500 hidden sm:inline">学習用シミュレーター</span>
        </h1>

        <div className="flex rounded-lg overflow-hidden border border-stone-700 text-sm">
          {(Object.keys(MODE_NAMES) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => p.setMode(m)}
              className={`px-2.5 sm:px-3 py-1.5 whitespace-nowrap ${
                p.mode === m ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
              }`}
            >
              {MODE_NAMES[m]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={p.onOpenGuide}
          className="flex items-center gap-1 text-sm rounded-lg px-2.5 py-1.5 bg-amber-900/40 text-amber-200 border border-amber-800/60 hover:bg-amber-900/60"
        >
          <BookOpen size={15} /> 三味線のきほん
        </button>
      </div>

      <div className="header-row flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <label className="flex items-center gap-1">
          <span className="text-stone-400">調子</span>
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
          <span className="text-stone-400">本数</span>
          <select
            value={p.honsu}
            onChange={(e) => p.setHonsu(Number(e.target.value))}
            className="bg-stone-800 border border-stone-700 rounded-lg px-1.5 py-1 font-semibold"
          >
            {HONSU_LIST.map((h) => (
              <option key={h} value={h}>
                {honsuName(h)}（一の糸＝{doremiName(honsuToMidi(h))}）
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
          {p.showLabels ? '番号を表示中' : '番号をかくし中'}
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
