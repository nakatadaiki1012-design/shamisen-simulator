/**
 * メトロノームの小さな窓（どのモードでも、弾きながら使える）
 */
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Feel, Metronome, MetronomeSettings } from '../audio/metronome';

const FEELS: { id: Feel; name: string; hint: string }[] = [
  { id: 'straight', name: 'まっすぐ', hint: '拍だけを刻む' },
  { id: 'eighth', name: '8分', hint: '拍と拍のあいだも小さく刻む' },
  { id: 'swing', name: 'ハネ', hint: 'タッ・カ・タッ・カと跳ねるリズム（シャッフル）' },
];

const load = (): MetronomeSettings => {
  try {
    const v = JSON.parse(localStorage.getItem('shamisen_metronome') ?? 'null');
    if (v && v.bpm) return v;
  } catch {
    /* 読めなければ最初の設定 */
  }
  return { bpm: 80, beatsPerBar: 2, feel: 'straight' };
};

export function MetronomePanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<MetronomeSettings>(load);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [flash, setFlash] = useState(0);
  const metro = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);

  if (!metro.current) metro.current = new Metronome(settings);

  useEffect(() => {
    metro.current!.update(settings);
    try {
      localStorage.setItem('shamisen_metronome', JSON.stringify(settings));
    } catch {
      /* 保存できない環境では何もしない */
    }
  }, [settings]);

  useEffect(() => {
    const m = metro.current!;
    m.onBeat = (b) => {
      setBeat(b);
      setFlash((f) => f + 1);
    };
    return () => m.stop();
  }, []);

  const toggle = () => {
    const m = metro.current!;
    if (m.running) {
      m.stop();
      setRunning(false);
      setBeat(-1);
    } else {
      m.start();
      setRunning(true);
    }
  };

  const setBpm = (bpm: number) => setSettings((s) => ({ ...s, bpm: Math.max(30, Math.min(240, Math.round(bpm))) }));

  /** タップテンポ: ボタンを何回かたたいた速さを BPM にする */
  const tapTempo = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-6);
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      setBpm(60000 / (gaps.reduce((a, g) => a + g, 0) / gaps.length));
    }
  };

  return (
    <div className="metronome-panel shrink-0 flex items-center gap-2 px-2 sm:px-4 py-1.5 bg-stone-900 border-b border-stone-800 text-xs sm:text-sm select-none overflow-x-auto">
      <span className="shrink-0 font-bold text-amber-200">🕐</span>
      <div className="shrink-0 flex gap-1" aria-label="拍の位置">
        {Array.from({ length: settings.beatsPerBar }, (_, i) => (
          <span
            key={i === beat ? `${i}-${flash}` : i}
            className={`w-3 h-3 rounded-full ${
              i === beat ? (i === 0 ? 'bg-amber-300 animate-[beatFlash_0.3s_ease-out]' : 'bg-emerald-300 animate-[beatFlash_0.3s_ease-out]') : 'bg-stone-700'
            }`}
          />
        ))}
      </div>
      <button
        onClick={toggle}
        className={`shrink-0 px-3 py-1 rounded-lg font-bold ${running ? 'bg-rose-600 text-white' : 'bg-emerald-500 text-stone-950'}`}
      >
        {running ? '■ 止める' : '▶ スタート'}
      </button>
      <button onClick={() => setBpm(settings.bpm - 1)} className="shrink-0 p-1 rounded-lg bg-stone-800 hover:bg-stone-700" aria-label="遅く">
        <Minus size={14} />
      </button>
      <span className="shrink-0 text-center leading-none">
        <span className="bunka text-lg text-amber-100">{settings.bpm}</span>
        <span className="text-[0.6rem] text-stone-500 ml-0.5">BPM</span>
      </span>
      <button onClick={() => setBpm(settings.bpm + 1)} className="shrink-0 p-1 rounded-lg bg-stone-800 hover:bg-stone-700" aria-label="速く">
        <Plus size={14} />
      </button>
      <input
        type="range"
        min={30}
        max={240}
        value={settings.bpm}
        onChange={(e) => setBpm(Number(e.target.value))}
        className="shrink-0 w-24 sm:w-32 accent-amber-500"
        aria-label="テンポ"
      />
      <button onClick={tapTempo} className="shrink-0 px-2 py-1 rounded-lg bg-stone-800 border border-stone-700 hover:bg-stone-700" title="拍に合わせて何回かたたくと、その速さになります">
        タップでテンポ
      </button>
      <div className="shrink-0 flex rounded-lg overflow-hidden border border-stone-700" aria-label="拍子">
        {([2, 3, 4] as const).map((n) => (
          <button
            key={n}
            onClick={() => setSettings((s) => ({ ...s, beatsPerBar: n }))}
            className={`px-2 py-1 ${settings.beatsPerBar === n ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800'}`}
          >
            {['', '', '二', '三', '四'][n]}拍子
          </button>
        ))}
      </div>
      <div className="shrink-0 flex rounded-lg overflow-hidden border border-stone-700" aria-label="刻み">
        {FEELS.map((f) => (
          <button
            key={f.id}
            onClick={() => setSettings((s) => ({ ...s, feel: f.id }))}
            title={f.hint}
            className={`px-2 py-1 ${settings.feel === f.id ? 'bg-sky-600 text-white font-bold' : 'bg-stone-800'}`}
          >
            {f.name}
          </button>
        ))}
      </div>
      <span className="shrink-0 hidden lg:inline text-[0.65rem] text-stone-500">民謡・長唄は二拍子で数えることが多い。跳ねる曲は「ハネ」</span>
      <div className="flex-1" />
      <button onClick={onClose} className="shrink-0 p-1 rounded-full bg-stone-800 hover:bg-stone-700" aria-label="メトロノームを閉じる">
        <X size={15} />
      </button>
    </div>
  );
}
