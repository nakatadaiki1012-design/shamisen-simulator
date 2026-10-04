/**
 * メトロノーム
 *
 * 正確に刻むために、音を鳴らす時刻は Web Audio の時計で「少し先まで予約」する。
 * （setTimeout だけで鳴らすと、画面が重いときにリズムがよれる）
 *
 * - 拍子: 二拍子・三拍子・四拍子（1拍目を強く）
 * - 刻み: 「まっすぐ」（拍だけ）／「8分」（拍の間も小さく刻む）／
 *         「ハネ」（シャッフル。拍を 3 つに分けた 2 つめを省いた、跳ねるリズム）
 */
import { soundEngine } from './soundEngine';

export type Feel = 'straight' | 'eighth' | 'swing';

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: 2 | 3 | 4;
  feel: Feel;
}

/** 1 拍の中で鳴らす位置（拍の長さに対する割合）と強さ */
export function subdivisions(feel: Feel): { at: number; level: number }[] {
  if (feel === 'eighth') return [{ at: 0, level: 1 }, { at: 0.5, level: 0 }];
  if (feel === 'swing') return [{ at: 0, level: 1 }, { at: 2 / 3, level: 0 }];
  return [{ at: 0, level: 1 }];
}

/**
 * これから鳴らす音の予定（テストしやすいよう、時計とは切り離して計算する）
 * startBeat 拍目から、count 拍分。1 小節の 1 拍目は level 2（強拍）
 */
export function planClicks(settings: MetronomeSettings, startBeat: number, count: number, startTime: number) {
  const beatSec = 60 / settings.bpm;
  const out: { time: number; level: number; beat: number }[] = [];
  for (let b = startBeat; b < startBeat + count; b++) {
    const beatInBar = b % settings.beatsPerBar;
    for (const sub of subdivisions(settings.feel)) {
      const level = sub.at === 0 ? (beatInBar === 0 ? 2 : 1) : 0;
      out.push({ time: startTime + (b - startBeat + sub.at) * beatSec, level, beat: beatInBar });
    }
  }
  return out;
}

const LOOKAHEAD = 0.15; // 何秒先まで予約するか
const TICK_MS = 25;

export class Metronome {
  private settings: MetronomeSettings;
  private timer: number | null = null;
  private nextBeat = 0;
  private nextTime = 0;
  private uiTimers: number[] = [];
  onBeat: (beatInBar: number) => void = () => {};

  constructor(settings: MetronomeSettings) {
    this.settings = { ...settings };
  }

  get running() {
    return this.timer !== null;
  }

  /** テンポなどを途中で変えても、次の拍から反映する */
  update(settings: MetronomeSettings) {
    this.settings = { ...settings };
  }

  start() {
    if (this.timer !== null) return;
    soundEngine.resume();
    this.nextBeat = 0;
    this.nextTime = soundEngine.currentTime + 0.08;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.uiTimers.forEach((t) => window.clearTimeout(t));
    this.uiTimers = [];
    soundEngine.stopClicks();
  }

  private tick() {
    const now = soundEngine.currentTime;
    while (this.nextTime < now + LOOKAHEAD) {
      const plan = planClicks(this.settings, this.nextBeat, 1, this.nextTime);
      for (const c of plan) soundEngine.clickAt(c.time, c.level);
      // 画面の光は、音が鳴る時刻に合わせて点ける
      const beat = plan[0].beat;
      const delay = Math.max(0, (this.nextTime - now) * 1000 + soundEngine.outputLatencyMs);
      this.uiTimers.push(window.setTimeout(() => this.onBeat(beat), delay));
      if (this.uiTimers.length > 16) this.uiTimers.splice(0, this.uiTimers.length - 16);
      this.nextBeat++;
      this.nextTime += 60 / this.settings.bpm;
    }
  }
}
