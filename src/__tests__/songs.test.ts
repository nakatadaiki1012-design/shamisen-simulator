import { describe, expect, it } from 'vitest';
import { SONGS } from '../data/songs';
import { HONSU_LIST, TUNINGS, doremiName, getTuning, noteMidi } from '../data/notation';

describe('練習曲データ', () => {
  it('曲の id が重ならない', () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });

  for (const song of SONGS) {
    describe(song.title, () => {
      it('調子・本数・テンポが正しい', () => {
        expect(TUNINGS.map((t) => t.id)).toContain(song.tuningId);
        expect(HONSU_LIST).toContain(song.honsu);
        expect(song.bpm).toBeGreaterThan(30);
      });

      it('すべての音が「0〜10」の範囲（スマホの表示範囲）に収まり、拍が正しい', () => {
        expect(song.notes.length).toBeGreaterThan(0);
        for (const n of song.notes) {
          expect(n.semitone).toBeGreaterThanOrEqual(0);
          expect(n.semitone).toBeLessThanOrEqual(12);
          expect(n.beats).toBeGreaterThan(0);
        }
      });

      it('最初の音に区切りの名前がある（区間練習のため）', () => {
        expect(song.notes[0].section).toBeTruthy();
      });
    });
  }

  it('かえるの合唱の出だしは ドレミファミレド', () => {
    const song = SONGS.find((s) => s.id === 'kaeru')!;
    const t = getTuning(song.tuningId);
    const names = song.notes.slice(0, 7).map((n) => doremiName(noteMidi(t, song.honsu, n.string, n.semitone)));
    expect(names).toEqual(['ド', 'レ', 'ミ', 'ファ', 'ミ', 'レ', 'ド']);
  });

  it('音階れんしゅうは、どの調子でも ドレミファソラシド になる', () => {
    for (const id of ['scale-hon', 'scale-ni', 'scale-san']) {
      const song = SONGS.find((s) => s.id === id)!;
      const t = getTuning(song.tuningId);
      const names = song.notes.slice(0, 8).map((n) => doremiName(noteMidi(t, song.honsu, n.string, n.semitone)));
      expect(names).toEqual(['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド']);
    }
  });

  it('メリーさんのひつじ・よろこびの歌のメロディー', () => {
    const names = (id: string, count: number) => {
      const song = SONGS.find((x) => x.id === id)!;
      const t = getTuning(song.tuningId);
      return song.notes.slice(0, count).map((n) => doremiName(noteMidi(t, song.honsu, n.string, n.semitone)));
    };
    expect(names('mary', 13)).toEqual(['ミ', 'レ', 'ド', 'レ', 'ミ', 'ミ', 'ミ', 'レ', 'レ', 'レ', 'ミ', 'ソ', 'ソ']);
    expect(names('joy', 15)).toEqual(['ミ', 'ミ', 'ファ', 'ソ', 'ソ', 'ファ', 'ミ', 'レ', 'ド', 'ド', 'レ', 'ミ', 'ミ', 'レ', 'レ']);
    // 1 小節 4 拍でそろっている
    for (const id of ['mary', 'joy']) {
      const total = SONGS.find((x) => x.id === id)!.notes.reduce((a, n) => a + n.beats, 0);
      expect(total % 4).toBe(0);
    }
  });

  it('さくらさくらの出だしは ラ ラ シ（三本＝一の糸がシ）', () => {
    const song = SONGS.find((s) => s.id === 'sakura')!;
    const t = getTuning(song.tuningId);
    const names = song.notes.slice(0, 3).map((n) => doremiName(noteMidi(t, song.honsu, n.string, n.semitone)));
    expect(names).toEqual(['ラ', 'ラ', 'シ']);
  });
});
