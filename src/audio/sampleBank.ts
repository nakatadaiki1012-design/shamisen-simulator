/**
 * 本物の三味線を録音した音（サンプル）を読み込んで取っておく係。
 *
 * 音は public/samples/<音源>/<MIDI番号>.mp3（A2〜G#6 の 48 音）。
 * 録音ごとに少しだけ高さがずれているので、manifest.json の「セント」を使って
 * 鳴らすときに正確な高さへ直す。
 */

export type SampleSet = 'musyngkite' | 'fatboy' | 'fluidr3';
export type SoundSource = SampleSet | 'synth';

export const SOUND_SOURCES: { id: SoundSource; name: string; hint: string }[] = [
  { id: 'musyngkite', name: '録音A', hint: '本物の三味線の録音。歯切れがよく、いちばん三味線らしい（おすすめ）' },
  { id: 'fatboy', name: '録音B', hint: '本物の三味線の録音。少し太く、こもった音' },
  { id: 'fluidr3', name: '録音C', hint: '本物の三味線の録音。響きが長め' },
  { id: 'synth', name: '合成', hint: '計算で作った音。録音が読み込めないときも鳴ります' },
];

export const SAMPLE_MIN_MIDI = 45;
export const SAMPLE_MAX_MIDI = 92;

export interface Sample {
  buffer: AudioBuffer;
  /** この録音の本当の高さ（Hz） */
  freq: number;
  /** 録音ごとの音量の差をそろえる倍率 */
  norm: number;
}

interface Manifest {
  notes: Record<string, { cents: number }>;
}

const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class SampleBank {
  readonly set: SampleSet;
  private samples = new Map<number, Sample>();
  private loading: Promise<void> | null = null;
  failed = false;

  constructor(set: SampleSet) {
    this.set = set;
  }

  get size() {
    return this.samples.size;
  }

  /**
   * 読み込む。first に渡した音（今の調子でよく使う音）から先に読む。
   * 何度呼んでも 1 回しか読まない。
   */
  load(ctx: BaseAudioContext, first: number[] = [], onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    const base = `${import.meta.env.BASE_URL}samples/${this.set}/`;
    this.loading = (async () => {
      const res = await fetch(`${base}manifest.json`);
      if (!res.ok) throw new Error('manifest');
      const manifest: Manifest = await res.json();
      const all = Object.keys(manifest.notes).map(Number);
      const order = [...new Set([...first.filter((m) => all.includes(m)), ...all])];
      let loaded = 0;
      const one = async (m: number) => {
        try {
          const r = await fetch(`${base}${m}.mp3`);
          if (!r.ok) return;
          const buffer = await ctx.decodeAudioData(await r.arrayBuffer());
          const d = buffer.getChannelData(0);
          let peak = 0;
          for (let k = 0; k < d.length; k++) peak = Math.max(peak, Math.abs(d[k]));
          this.samples.set(m, {
            buffer,
            freq: midiFreq(m) * Math.pow(2, manifest.notes[m].cents / 1200),
            norm: peak > 0.001 ? Math.min(8, 0.8 / peak) : 1,
          });
        } catch {
          /* 1 音読めなくても、近い音で代わりに鳴らせる */
        } finally {
          onProgress?.(++loaded, order.length);
        }
      };
      // 同時に読みすぎない（4 本ずつ）
      let i = 0;
      const lane = async () => {
        while (i < order.length) await one(order[i++]);
      };
      await Promise.all([lane(), lane(), lane(), lane()]);
      if (this.samples.size === 0) throw new Error('no samples');
    })().catch(() => {
      this.failed = true;
    });
    return this.loading;
  }

  /** その高さにいちばん近い録音（3 半音より離れていたら使わない） */
  nearest(freq: number): Sample | null {
    const m = Math.round(69 + 12 * Math.log2(freq / 440));
    for (let d = 0; d <= 3; d++) {
      const a = this.samples.get(m - d) ?? this.samples.get(m + d);
      if (a) return a;
    }
    return null;
  }
}
