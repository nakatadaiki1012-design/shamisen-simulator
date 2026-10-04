/**
 * 演奏のしかた（ワンハンド／両手）・奏法（弾き方）・サワリ・振動・MIDI
 */
import { Technique, TECHNIQUES } from '../data/notation';
import type { PlayMode } from './Neck';
import type { MidiState } from '../hooks/useMidi';

interface Props {
  technique: Technique;
  setTechnique: (t: Technique) => void;
  sawari: boolean;
  setSawari: (v: boolean) => void;
  playMode: PlayMode;
  setPlayMode: (m: PlayMode) => void;
  haptic: boolean;
  setHaptic: (v: boolean) => void;
  midi: MidiState & { enable: () => void; disable: () => void };
}

// 振動はタッチ画面のスマホ・タブレットだけ（パソコンでは意味がないので出さない）
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.maxTouchPoints > 0;

/** 両手モードでの奏法の意味（撥ゾーンの向きで叩き・掬いが決まる） */
const TWO_HAND_HINT: Partial<Record<Technique, string>> = {
  bachi: '両手モード: 撥ゾーンで上から下へ＝叩き、下から上へ＝掬い。',
  sukui: '両手モード: 撥ゾーンで下から上へ横切ると掬いになります。',
  hajiki: '両手モード: 糸が鳴っているあいだに左手の指を離すと、ハジキになります。',
  uchi: '両手モード: 糸が鳴っているあいだに、より胴に近い勘所を押さえると打ち指になります。',
  suri: '両手モード: 糸が鳴っているあいだに、押さえた指を棹の上ですべらせるとスリになります。',
};

export function TechniqueBar({ technique, setTechnique, sawari, setSawari, playMode, setPlayMode, haptic, setHaptic, midi }: Props) {
  const current = TECHNIQUES.find((t) => t.id === technique)!;
  const desc = playMode === 'two' ? TWO_HAND_HINT[technique] ?? current.desc : current.desc;
  return (
    <div role="region" aria-label="演奏の設定" className="tech-bar shrink-0 flex flex-wrap items-center gap-1.5 px-2 sm:px-4 py-1.5 bg-stone-900 border-b border-stone-800 text-xs sm:text-sm">
      <div className="shrink-0 flex rounded-full overflow-hidden border border-stone-600 mr-1" role="group" aria-label="演奏のしかた">
        {(['one', 'two'] as PlayMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setPlayMode(m)}
            className={`px-2.5 py-1 whitespace-nowrap ${
              playMode === m ? 'bg-sky-700 text-white font-bold' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
            title={m === 'one' ? 'タップした勘所がそのまま鳴る' : '左手で棹を押さえ、右手の撥ゾーンで打って鳴らす'}
          >
            {m === 'one' ? '👆 ワンハンド' : '✋ 両手'}
          </button>
        ))}
      </div>
      <span className="text-stone-400 mr-0.5 whitespace-nowrap">奏法</span>
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
          sawari ? 'bg-amber-700 border-amber-500 text-white font-bold' : 'bg-stone-800 border-stone-700 text-stone-400'
        }`}
        title="一の糸がビーンとうなる「サワリ」の響き"
      >
        サワリ {sawari ? 'ON' : 'OFF'}
      </button>
      {canVibrate && (
        <button
          onClick={() => setHaptic(!haptic)}
          className={`rounded-full px-2.5 py-1 border whitespace-nowrap ${
            haptic ? 'bg-stone-700 border-stone-500 text-white' : 'bg-stone-800 border-stone-700 text-stone-400'
          }`}
          title="糸や勘所に触れたとき、スマホを少し振動させます"
        >
          📳 振動 {haptic ? 'ON' : 'OFF'}
        </button>
      )}
      {midi.supported && (
        <button
          onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
          className={`rounded-full px-2.5 py-1 border whitespace-nowrap ${
            midi.enabled ? 'bg-violet-600 border-violet-400 text-white font-bold' : 'bg-stone-800 border-stone-700 text-stone-300'
          }`}
          title={
            midi.enabled
              ? midi.devices.length
                ? `つながっている機器: ${midi.devices.join('、')}`
                : 'MIDI 機器をつなぐと、すぐに弾けます'
              : 'USB の MIDI キーボードや電子パッドで弾けるようにします'
          }
        >
          🎹 MIDI {midi.enabled ? (midi.devices.length ? `${midi.devices.length}台` : '待機中') : ''}
        </button>
      )}
      {midi.error && <span className="text-rose-300 text-[0.7rem]">{midi.error}</span>}
      <span className="tech-desc text-stone-400 text-[0.7rem] sm:text-xs ml-1 hidden md:inline">{desc}</span>
    </div>
  );
}
