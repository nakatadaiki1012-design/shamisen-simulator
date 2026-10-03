import { describe, expect, it } from 'vitest';
import {
  MAX_SEMITONE,
  TUNINGS,
  bunkaLabel,
  doremiName,
  honsuToMidi,
  noteMidi,
  semitoneFromBunka,
} from '../data/notation';

describe('文化譜の勘所番号', () => {
  it('1オクターブ分の並びが 0 1 2 3 # 4 5 6 7 8 9 ♭', () => {
    expect(Array.from({ length: 12 }, (_, i) => bunkaLabel(i))).toEqual([
      '0', '1', '2', '3', '#', '4', '5', '6', '7', '8', '9', '♭',
    ]);
  });

  it('オクターブ上は 10 11 12 13 1# 14 15 16 17 18 19 1♭、2オクターブ上は 20', () => {
    expect(Array.from({ length: 13 }, (_, i) => bunkaLabel(i + 12))).toEqual([
      '10', '11', '12', '13', '1#', '14', '15', '16', '17', '18', '19', '1♭', '20',
    ]);
  });

  it('番号から半音数に戻せる（全勘所）', () => {
    for (let s = 0; s <= MAX_SEMITONE; s++) expect(semitoneFromBunka(bunkaLabel(s))).toBe(s);
    expect(semitoneFromBunka('X')).toBeNull();
  });
});

describe('調子と本数', () => {
  it('一本はラ、四本はド', () => {
    expect(doremiName(honsuToMidi(1))).toBe('ラ');
    expect(doremiName(honsuToMidi(4))).toBe('ド');
  });

  it('本調子: 一の糸の「4」= 二の糸の「0」、一の糸の「10」= 三の糸の「0」', () => {
    const t = TUNINGS.find((x) => x.id === 'honchoshi')!;
    expect(noteMidi(t, 4, 1, semitoneFromBunka('4')!)).toBe(noteMidi(t, 4, 2, 0));
    expect(noteMidi(t, 4, 1, semitoneFromBunka('10')!)).toBe(noteMidi(t, 4, 3, 0));
  });

  it('二上り: 一の糸の「6」= 二の糸の「0」', () => {
    const t = TUNINGS.find((x) => x.id === 'niagari')!;
    expect(noteMidi(t, 4, 1, semitoneFromBunka('6')!)).toBe(noteMidi(t, 4, 2, 0));
  });

  it('三下り: 二の糸の「4」= 三の糸の「0」', () => {
    const t = TUNINGS.find((x) => x.id === 'sansagari')!;
    expect(noteMidi(t, 4, 2, semitoneFromBunka('4')!)).toBe(noteMidi(t, 4, 3, 0));
  });
});
