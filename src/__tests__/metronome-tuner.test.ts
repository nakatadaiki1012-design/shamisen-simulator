import { describe, expect, it } from 'vitest';
import { planClicks, subdivisions } from '../audio/metronome';
import { centsBetween, detectPitch } from '../audio/pitch';
import { renderShamisen } from '../audio/shamisenSynth';

describe('メトロノーム', () => {
  it('二拍子: 1拍目だけ強く、BPM どおりの間隔', () => {
    const plan = planClicks({ bpm: 120, beatsPerBar: 2, feel: 'straight' }, 0, 4, 10);
    expect(plan.map((c) => c.level)).toEqual([2, 1, 2, 1]);
    expect(plan.map((c) => +(c.time - 10).toFixed(3))).toEqual([0, 0.5, 1, 1.5]);
  });

  it('四拍子・三拍子の強拍の位置', () => {
    expect(planClicks({ bpm: 60, beatsPerBar: 4, feel: 'straight' }, 0, 8, 0).map((c) => c.level)).toEqual([2, 1, 1, 1, 2, 1, 1, 1]);
    expect(planClicks({ bpm: 60, beatsPerBar: 3, feel: 'straight' }, 0, 6, 0).map((c) => c.level)).toEqual([2, 1, 1, 2, 1, 1]);
  });

  it('8分は拍のまん中、ハネは拍の 2/3 の所に小さな音', () => {
    expect(subdivisions('eighth').map((s) => s.at)).toEqual([0, 0.5]);
    expect(subdivisions('swing')[1].at).toBeCloseTo(2 / 3);
    const swing = planClicks({ bpm: 60, beatsPerBar: 2, feel: 'swing' }, 0, 2, 0);
    expect(swing.map((c) => +c.time.toFixed(3))).toEqual([0, 0.667, 1, 1.667]);
    expect(swing.map((c) => c.level)).toEqual([2, 0, 1, 0]);
  });

  it('途中の拍から続けても、小節の頭が正しい', () => {
    const plan = planClicks({ bpm: 100, beatsPerBar: 4, feel: 'straight' }, 6, 3, 0);
    expect(plan.map((c) => c.beat)).toEqual([2, 3, 0]);
  });
});

describe('チューナーの音の高さ判定', () => {
  const SR = 48000;
  it('正弦波の高さを 1 セント以内で当てる', () => {
    for (const f of [98, 130.81, 220, 440, 880]) {
      const buf = new Float32Array(4096);
      for (let i = 0; i < buf.length; i++) buf[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / SR);
      const got = detectPitch(buf, SR)!;
      expect(Math.abs(centsBetween(got, f))).toBeLessThan(1);
    }
  });

  it('倍音の多い三味線の音でも、オクターブをまちがえない（±5セント以内）', () => {
    for (const [stringNo, f] of [[1, 110], [1, 130.81], [2, 196], [3, 261.63], [3, 392]] as const) {
      const d = renderShamisen(SR, { frequency: f, stringNo, tone: 'tataki', open: false, ichiFrequency: 130.81, sawari: false });
      const got = detectPitch(d.subarray(9600, 9600 + 4096), SR)!;
      expect(got).not.toBeNull();
      expect(Math.abs(centsBetween(got, f))).toBeLessThan(5);
    }
  });

  it('無音・小さすぎる音では判定しない', () => {
    expect(detectPitch(new Float32Array(4096), SR)).toBeNull();
    const quiet = new Float32Array(4096).map((_, i) => 0.001 * Math.sin(i / 10));
    expect(detectPitch(quiet, SR)).toBeNull();
  });
});
