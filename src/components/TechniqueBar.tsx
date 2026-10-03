/**
 * 奏法（弾き方）えらびとサワリのオン・オフ
 */
import { Technique, TECHNIQUES } from '../data/notation';

interface Props {
  technique: Technique;
  setTechnique: (t: Technique) => void;
  sawari: boolean;
  setSawari: (v: boolean) => void;
}

export function TechniqueBar({ technique, setTechnique, sawari, setSawari }: Props) {
  const current = TECHNIQUES.find((t) => t.id === technique)!;
  return (
    <div className="tech-bar shrink-0 flex flex-wrap items-center gap-1.5 px-2 sm:px-4 py-1.5 bg-stone-900 border-b border-stone-800 text-xs sm:text-sm">
      <span className="text-stone-500 mr-0.5 whitespace-nowrap">奏法</span>
      {TECHNIQUES.map((t) => (
        <button
          key={t.id}
          onClick={() => setTechnique(t.id)}
          className={`rounded-full px-2.5 py-1 border whitespace-nowrap ${
            technique === t.id
              ? 'bg-rose-700 border-rose-500 text-white font-bold'
              : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
          }`}
        >
          {t.name}
          {t.mark && <span className="ml-1 opacity-70 font-serif-jp">({t.mark})</span>}
        </button>
      ))}
      <button
        onClick={() => setSawari(!sawari)}
        className={`rounded-full px-2.5 py-1 border whitespace-nowrap ml-1 ${
          sawari ? 'bg-amber-600 border-amber-400 text-white font-bold' : 'bg-stone-800 border-stone-700 text-stone-400'
        }`}
        title="一の糸がビーンとうなる「サワリ」の響き"
      >
        サワリ {sawari ? 'ON' : 'OFF'}
      </button>
      <span className="tech-desc text-stone-500 text-[0.7rem] sm:text-xs ml-1 hidden md:inline">{current.desc}</span>
    </div>
  );
}
