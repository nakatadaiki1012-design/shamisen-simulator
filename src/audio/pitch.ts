/**
 * 音の高さを調べる（チューナー用）
 *
 * YIN（イン）という方法を簡単にしたもの:
 * 波形を少しずつずらして自分自身と比べ、いちばんよく重なる「ずらし幅」＝1周期の長さを探す。
 * 三味線のように倍音が多い音でも、1オクターブ上下にまちがえにくい。
 */

/** 周波数（Hz）を返す。はっきりした音がなければ null */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 70, maxHz = 1100): number | null {
  const n = buf.length;
  // 音が小さすぎるときは判定しない
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const w = n - maxLag;
  const diff = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const d = buf[i] - buf[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }
  // 累積平均で正規化（ずらし幅 0 付近の誤判定を防ぐ）
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += diff[lag];
    cmnd[lag] = running > 0 ? (diff[lag] * lag) / running : 1;
  }
  // しきい値より下がった最初の谷を選ぶ
  const THRESHOLD = 0.15;
  let lag = -1;
  for (let l = minLag; l <= maxLag; l++) {
    if (cmnd[l] < THRESHOLD) {
      while (l + 1 <= maxLag && cmnd[l + 1] < cmnd[l]) l++;
      lag = l;
      break;
    }
  }
  if (lag < 0) return null;
  // 谷の前後で補間して、半端な周期まで求める
  const a = cmnd[lag - 1] ?? cmnd[lag];
  const b = cmnd[lag];
  const c = cmnd[lag + 1] ?? cmnd[lag];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (a - c) / (2 * denom) : 0;
  return sampleRate / (lag + shift);
}

/** 2 つの周波数の差（セント。100 セント＝半音） */
export function centsBetween(freq: number, target: number) {
  return 1200 * Math.log2(freq / target);
}
