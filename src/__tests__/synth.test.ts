import { describe, expect, it } from 'vitest';
import { renderShamisen, renderStrike, sympatheticLevel, toneClassOf, ShamisenSynthOptions } from '../audio/shamisenSynth';

const SR = 48000;
const ICHI = 130.81;
const base: ShamisenSynthOptions = { frequency: 196, stringNo: 2, tone: 'tataki', open: false, ichiFrequency: ICHI, sawari: true };

/** 2〜4kHz（サワリのうなりが出る帯域）の割合 */
function buzzShare(d: Float32Array, from: number, to: number) {
  let band = 0;
  let all = 0;
  for (let i = from; i < to; i++) all += d[i] * d[i];
  for (let f = 2000; f < 4000; f += 250) {
    let re = 0;
    let im = 0;
    for (let i = from; i < to; i++) {
      const ph = (2 * Math.PI * f * i) / SR;
      re += d[i] * Math.cos(ph);
      im += d[i] * Math.sin(ph);
    }
    band += re * re + im * im;
  }
  return band / all;
}

/** 決めた高さの周期で、波がどれだけくり返しているか（1 に近いほど正しい高さ） */
function periodicity(d: Float32Array, freq: number) {
  const from = Math.floor(SR * 0.25);
  const lag = Math.round(SR / freq);
  let s = 0, e1 = 0, e2 = 0;
  for (let i = from; i < from + 2048; i++) {
    s += d[i] * d[i + lag];
    e1 += d[i] ** 2;
    e2 += d[i + lag] ** 2;
  }
  return s / Math.sqrt(e1 * e2);
}

describe('三味線の音源', () => {
  it('奏法から音色の種類を決める（スリは叩きの音色）', () => {
    expect(toneClassOf('bachi')).toBe('tataki');
    expect(toneClassOf('suri')).toBe('tataki');
    expect(toneClassOf('sukui')).toBe('sukui');
    expect(toneClassOf('hajiki')).toBe('hajiki');
    expect(toneClassOf('uchi')).toBe('uchi');
  });

  it('どの糸・奏法・高さでも、音割れや異常な値がなく、正しい高さでくり返す', () => {
    for (const stringNo of [1, 2, 3] as const) {
      for (const tone of ['tataki', 'sukui', 'hajiki', 'uchi'] as const) {
        for (const frequency of [ICHI, 196, 329.63, 523.25]) {
          const d = renderShamisen(SR, { ...base, stringNo, tone, frequency, open: stringNo === 1 && frequency === ICHI });
          let peak = 0;
          let bad = 0;
          for (const x of d) {
            if (!Number.isFinite(x)) bad++;
            else peak = Math.max(peak, Math.abs(x));
          }
          expect(bad).toBe(0);
          expect(peak).toBeLessThanOrEqual(1);
          expect(periodicity(d, frequency)).toBeGreaterThan(0.8);
        }
      }
    }
  }, 30000);

  it('一の糸の開放弦はサワリで「ビーン」とうなり、時間がたつと消える', () => {
    const on = renderShamisen(SR, { ...base, frequency: ICHI, stringNo: 1, open: true, sawari: true });
    const off = renderShamisen(SR, { ...base, frequency: ICHI, stringNo: 1, open: true, sawari: false });
    const early = buzzShare(on, 14400, 19200) / buzzShare(off, 14400, 19200); // 0.3〜0.4 秒
    const late = buzzShare(on, 72000, 76800) / buzzShare(off, 72000, 76800); // 1.5〜1.6 秒
    expect(early).toBeGreaterThan(1.2);
    expect(late).toBeLessThan(early);
  });

  it('共鳴弦: 一の糸と8度・5度・4度の音で一の糸が響き、関係ない音では響かない', () => {
    const lv = (frequency: number) => sympatheticLevel({ frequency, stringNo: 2, open: false, ichiFrequency: ICHI, sawari: true });
    expect(lv(ICHI * 2)).toBeGreaterThan(lv(196)); // 8度 > 5度
    expect(lv(196)).toBeGreaterThan(lv(174.61)); // 5度 > 4度
    expect(lv(174.61)).toBeGreaterThan(0);
    expect(lv(146.83)).toBe(0); // レ（関係なし）
    expect(sympatheticLevel({ frequency: ICHI * 2, stringNo: 1, open: false, ichiFrequency: ICHI, sawari: true })).toBe(0);
    expect(sympatheticLevel({ frequency: ICHI * 2, stringNo: 2, open: false, ichiFrequency: ICHI, sawari: false })).toBe(0);
  });

  it('糸ごとに余韻の長さが違う（一の糸がいちばん長く、三の糸がいちばん短い）', () => {
    const len = (stringNo: 1 | 2 | 3) => renderShamisen(SR, { ...base, stringNo }).length;
    expect(len(1)).toBeGreaterThan(len(2));
    expect(len(2)).toBeGreaterThan(len(3));
  });

  it('ハジキ・打ち指は叩きより短く、打ち指はこもった音', () => {
    const t = renderShamisen(SR, { ...base, tone: 'tataki' });
    const h = renderShamisen(SR, { ...base, tone: 'hajiki' });
    const u = renderShamisen(SR, { ...base, tone: 'uchi' });
    expect(h.length).toBeLessThan(t.length);
    expect(u.length).toBeLessThan(t.length);
    expect(buzzShare(u, 480, 4800)).toBeLessThan(buzzShare(t, 480, 4800));
  });

  it('撥・指の打音は短く、音割れしない', () => {
    for (const k of ['tataki', 'uchi', 'hajiki'] as const) {
      const d = renderStrike(SR, k, 0);
      expect(d.length).toBeLessThan(SR * 0.2);
      expect(Math.max(...Array.from(d, Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});
