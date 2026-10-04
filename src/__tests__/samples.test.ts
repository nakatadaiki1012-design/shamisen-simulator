import { describe, expect, it } from 'vitest';
import { SAMPLE_MAX_MIDI, SAMPLE_MIN_MIDI, SOUND_SOURCES } from '../audio/sampleBank';
import { MAX_SEMITONE, TUNINGS, honsuToMidi, noteMidi } from '../data/notation';

const manifests = import.meta.glob<{ notes: Record<string, { cents: number }> }>('../../public/samples/*/manifest.json', {
  eager: true,
  import: 'default',
});
const files = new Set(Object.keys(import.meta.glob('../../public/samples/*/*.mp3')));

describe('三味線の録音', () => {
  for (const src of SOUND_SOURCES.filter((s) => s.id !== 'synth')) {
    it(`${src.name}（${src.id}）は全部の音がそろっていて、高さのずれが小さい`, () => {
      const manifest = manifests[`../../public/samples/${src.id}/manifest.json`];
      for (let m = SAMPLE_MIN_MIDI; m <= SAMPLE_MAX_MIDI; m++) {
        expect(files.has(`../../public/samples/${src.id}/${m}.mp3`)).toBe(true);
        expect(Math.abs(manifest.notes[m].cents)).toBeLessThan(30);
      }
    });
  }

  it('アプリで鳴る音はすべて録音の範囲に入っている', () => {
    for (const t of TUNINGS) {
      for (let h = 1; h <= 12; h++) {
        expect(honsuToMidi(h)).toBeGreaterThanOrEqual(SAMPLE_MIN_MIDI);
        for (const s of [1, 2, 3] as const) expect(noteMidi(t, h, s, MAX_SEMITONE)).toBeLessThanOrEqual(SAMPLE_MAX_MIDI);
      }
    }
  });
});
