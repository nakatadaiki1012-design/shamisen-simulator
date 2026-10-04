/**
 * チューナー（調弦アシスト）
 *
 * - 基準音: 選んだ糸の正しい高さを鳴らす。三味線の音でくり返す／ずっと鳴る音（うなりで合わせる）
 * - マイク: 本物の三味線の音を聴いて、いちばん近い糸と、高い・低いを表示する
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, X } from 'lucide-react';
import { STRINGS, STRING_NAMES, StringNo, Tuning, doremiName, honsuName, midiToFreq, noteMidi, westernName } from '../data/notation';
import { soundEngine } from '../audio/soundEngine';
import { centsBetween, detectPitch } from '../audio/pitch';

interface Props {
  open: boolean;
  onClose: () => void;
  tuning: Tuning;
  honsu: number;
  /** 三味線の音で 1 回鳴らす */
  onPluck: (s: StringNo) => void;
}

type RefMode = 'off' | 'pluck' | 'drone';

export function TunerModal({ open, onClose, tuning, honsu, onPluck }: Props) {
  const [refString, setRefString] = useState<StringNo>(1);
  const [refMode, setRefMode] = useState<RefMode>('off');
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ freq: number; s: StringNo; cents: number } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);

  const targets = STRINGS.map((s) => ({ s, midi: noteMidi(tuning, honsu, s, 0), freq: midiToFreq(noteMidi(tuning, honsu, s, 0)) }));
  // マイクで測っている途中で調子を変えても、新しい調子で判定する
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  // 基準音
  useEffect(() => {
    if (!open || refMode === 'off') {
      soundEngine.stopDrone();
      return;
    }
    const freq = targets.find((t) => t.s === refString)!.freq;
    if (refMode === 'drone') {
      soundEngine.startDrone(freq);
      return () => soundEngine.stopDrone();
    }
    soundEngine.stopDrone();
    onPluck(refString);
    const id = window.setInterval(() => onPluck(refString), 1700);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refMode, refString, tuning, honsu]);

  const stopMic = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setMicOn(false);
    setReading(null);
  };

  const startMic = async () => {
    setMicError(null);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      stream.current = ms;
      const ctx = soundEngine.audioContext;
      soundEngine.resume();
      const src = ctx.createMediaStreamSource(ms);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      src.connect(analyser); // スピーカーにはつながない（ハウリング防止）
      const buf = new Float32Array(analyser.fftSize);
      let last = 0;
      const loop = (t: number) => {
        raf.current = requestAnimationFrame(loop);
        if (t - last < 60) return; // 1 秒に十数回で十分
        last = t;
        analyser.getFloatTimeDomainData(buf);
        const f = detectPitch(buf, ctx.sampleRate);
        if (!f) return;
        // いちばん近い糸（一の糸と三の糸は同じ音名でオクターブがちがうので、実際の高さで比べる）
        let best = { s: 1 as StringNo, cents: Infinity };
        for (const tg of targetsRef.current) {
          const c = centsBetween(f, tg.freq);
          if (Math.abs(c) < Math.abs(best.cents)) best = { s: tg.s, cents: c };
        }
        // 大きくずれているとき（半音より大きい）は、針は端に寄せて表示する
        setReading({ freq: f, s: best.s, cents: best.cents });
      };
      raf.current = requestAnimationFrame(loop);
      setMicOn(true);
    } catch {
      setMicError('マイクが使えませんでした。ブラウザでマイクの使用を許可してください。');
    }
  };

  useEffect(() => {
    if (!open) {
      stopMic();
      setRefMode('off');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => stopMic(), []);

  if (!open) return null;

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const inTune = reading && Math.abs(reading.cents) <= 5;
  const verdict = !reading ? '' : inTune ? 'ぴったり！' : reading.cents > 0 ? '高い → 糸をゆるめる' : '低い → 糸をしめる';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-stone-900 border border-stone-700 p-4 sm:p-5 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700" aria-label="閉じる">
          <X size={18} />
        </button>
        <h2 className="font-serif-jp text-xl font-bold text-amber-100 mb-1">🎚 チューナー（調弦）</h2>
        <p className="text-stone-400 text-xs mb-3">
          {tuning.name}・{honsuName(honsu)}：
          {targets.map((t) => `${STRING_NAMES[t.s]}＝${doremiName(t.midi)}`).join('、')}
        </p>

        <section className="mb-4">
          <h3 className="text-amber-300 font-bold mb-1.5">① 基準の音を聴いて合わせる</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {targets.map((t) => (
              <button
                key={t.s}
                onClick={() => setRefString(t.s)}
                className={`px-3 py-1.5 rounded-lg border ${refString === t.s ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold' : 'bg-stone-800 border-stone-700'}`}
              >
                {STRING_NAMES[t.s]}（{doremiName(t.midi)}）
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['pluck', '三味線の音でくり返す'],
              ['drone', 'ずっと鳴る音'],
              ['off', '止める'],
            ] as [RefMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setRefMode(m)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${refMode === m && m !== 'off' ? 'bg-sky-600 text-white border-sky-400 font-bold' : 'bg-stone-800 border-stone-700'}`}
              >
                {m !== 'off' && <Volume2 size={14} />}
                {label}
              </button>
            ))}
          </div>
          <p className="text-[0.7rem] text-stone-500 mt-1.5">
            「ずっと鳴る音」と自分の糸を一緒に鳴らすと、高さがずれているときは「ウワンウワン」とうなります。うなりがゆっくりになって消えるところが、ぴったりです。
          </p>
        </section>

        <section>
          <h3 className="text-amber-300 font-bold mb-1.5">② マイクで本物の三味線の音を測る</h3>
          <button
            onClick={() => (micOn ? stopMic() : startMic())}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ${micOn ? 'bg-rose-600 text-white' : 'bg-emerald-500 text-stone-950'}`}
          >
            {micOn ? <MicOff size={15} /> : <Mic size={15} />}
            {micOn ? 'マイクを止める' : 'マイクで測る'}
          </button>
          {micError && <p className="text-rose-300 text-xs mt-1">{micError}</p>}
          {micOn && (
            <div className="mt-3 rounded-xl bg-stone-950 border border-stone-800 p-3" aria-live="polite">
              {reading ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif-jp text-amber-200 font-bold">{STRING_NAMES[reading.s]}</span>
                    <span className="text-stone-300">
                      {doremiName(Math.round(69 + 12 * Math.log2(reading.freq / 440)))}（{westernName(Math.round(69 + 12 * Math.log2(reading.freq / 440)))}）
                    </span>
                    <span className="text-stone-500 text-xs">{reading.freq.toFixed(1)} Hz</span>
                    <span className={`ml-auto font-bold ${inTune ? 'text-emerald-300' : 'text-amber-300'}`}>{verdict}</span>
                  </div>
                  {/* 針 */}
                  <div className="relative h-8 mt-2 rounded-full bg-stone-800 overflow-hidden">
                    <div className="absolute inset-y-0 left-1/2 w-[10%] -translate-x-1/2 bg-emerald-500/25" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-stone-500" />
                    <div
                      className={`absolute top-1 bottom-1 w-1.5 rounded-full transition-[left] duration-100 ${inTune ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      style={{ left: `calc(${50 + cents}% - 3px)` }}
                    />
                  </div>
                  <div className="flex justify-between text-[0.65rem] text-stone-500 mt-0.5">
                    <span>低い −50</span>
                    <span>{reading.cents > 0 ? '+' : ''}{reading.cents.toFixed(0)} セント</span>
                    <span>+50 高い</span>
                  </div>
                </>
              ) : (
                <p className="text-stone-400 text-xs">糸を 1 本ずつ弾いてください…</p>
              )}
            </div>
          )}
          <p className="text-[0.7rem] text-stone-500 mt-1.5">100 セント＝半音。±5 セント以内なら「ぴったり」です。</p>
        </section>
      </div>
    </div>
  );
}
