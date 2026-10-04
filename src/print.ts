/**
 * 楽譜（文化譜）を印刷用のページにする
 *
 * 1 段 = 4 小節（16 拍）。3 本の線は上から 三・二・一の糸。
 * 線の上の数字が勘所、下に歌詞、音の長さは数字の下の細い線で表す。
 */
import { Song } from './data/songs';
import { TECHNIQUES, bunkaLabel, getTuning, honsuName } from './data/notation';

const BEAT_W = 40; // 1 拍の幅
const BEATS_PER_ROW = 16;
const LEFT = 34; // 糸の名前の幅
const LINE_Y = [26, 46, 66]; // 三・二・一の糸
const ROW_H = 118;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const MARK = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t.mark]));

/** 1 段分の SVG */
function rowSvg(song: Song, fromBeat: number, toBeat: number) {
  const width = LEFT + BEATS_PER_ROW * BEAT_W + 10;
  const parts: string[] = [];
  // 糸
  ['三', '二', '一'].forEach((name, i) => {
    parts.push(`<text x="8" y="${LINE_Y[i] + 4}" class="sname">${name}</text>`);
    parts.push(`<line x1="${LEFT}" x2="${LEFT + (toBeat - fromBeat) * BEAT_W}" y1="${LINE_Y[i]}" y2="${LINE_Y[i]}" class="str"/>`);
  });
  // 小節線（4 拍ごと）
  for (let b = fromBeat; b <= toBeat; b += 4) {
    const x = LEFT + (b - fromBeat) * BEAT_W;
    parts.push(`<line x1="${x}" x2="${x}" y1="${LINE_Y[0] - 6}" y2="${LINE_Y[2] + 6}" class="bar"/>`);
  }
  // 音
  let t = 0;
  for (const n of song.notes) {
    const start = t;
    t += n.beats;
    if (start + 1e-9 < fromBeat || start >= toBeat - 1e-9) continue;
    const x = LEFT + (start - fromBeat) * BEAT_W + 6;
    const y = LINE_Y[3 - n.string];
    const label = bunkaLabel(n.semitone);
    const w = Math.max(14, label.length * 9 + 4);
    parts.push(`<rect x="${x - 3}" y="${y - 9}" width="${w}" height="18" class="bg"/>`);
    parts.push(`<text x="${x - 1}" y="${y + 5}" class="num">${esc(label)}</text>`);
    if (n.technique && n.technique !== 'bachi') parts.push(`<text x="${x + w - 4}" y="${y - 8}" class="mark">${esc(MARK[n.technique] ?? '')}</text>`);
    // 長さ
    const len = Math.min(n.beats, toBeat - start) * BEAT_W - 8;
    parts.push(`<line x1="${x - 2}" x2="${x - 2 + len}" y1="${LINE_Y[2] + 14}" y2="${LINE_Y[2] + 14}" class="dur"/>`);
    if (n.lyric) parts.push(`<text x="${x}" y="${LINE_Y[2] + 32}" class="lyric">${esc(n.lyric)}</text>`);
    if (n.section) parts.push(`<text x="${x - 3}" y="11" class="section">${esc(n.section)}</text>`);
  }
  return `<svg viewBox="0 0 ${width} ${ROW_H - 10}" width="${width}" height="${ROW_H - 10}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/** 印刷用ページの HTML */
export function scoreHtml(song: Song) {
  const total = song.notes.reduce((a, n) => a + n.beats, 0);
  const rows: string[] = [];
  for (let b = 0; b < total; b += BEATS_PER_ROW) rows.push(rowSvg(song, b, Math.min(total, b + BEATS_PER_ROW)));
  const tuning = getTuning(song.tuningId);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${esc(song.title)}（文化譜）</title>
<style>
  body { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 22px; margin: 0; }
  .meta { font-size: 13px; color: #444; margin: 4px 0 12px; }
  .row { margin-bottom: 6px; page-break-inside: avoid; }
  .str { stroke: #444; stroke-width: 1; }
  .bar { stroke: #888; stroke-width: 1; }
  .bg { fill: #fff; }
  .num { font-size: 15px; font-weight: 700; }
  .sname { font-size: 12px; fill: #555; }
  .mark { font-size: 9px; fill: #b00; font-weight: 700; }
  .dur { stroke: #aaa; stroke-width: 2; }
  .lyric { font-size: 13px; }
  .section { font-size: 9px; fill: #777; }
  .legend { font-size: 11px; color: #444; border-top: 1px solid #ccc; margin-top: 12px; padding-top: 8px; line-height: 1.7; }
  @media print { body { margin: 10mm; } .noprint { display: none; } }
  .noprint button { font-size: 14px; padding: 6px 14px; margin-bottom: 12px; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">🖨 印刷する</button></div>
<h1>${esc(song.title)}</h1>
<div class="meta">${esc(song.subtitle)}　／　調子: ${esc(tuning.name)}・${esc(honsuName(song.honsu))}　／　♩ = ${song.bpm}</div>
${rows.map((r) => `<div class="row">${r}</div>`).join('\n')}
<div class="legend">
  文化譜の読み方: 3 本の線は上から 三の糸・二の糸・一の糸。数字は押さえる場所（勘所）で、0 はどこも押さえない（開放弦）。
  「#」は 3 と 4 の間、「♭」は 9 と 10 の間の勘所。数字の下の線が音の長さ（1 マス＝1 拍）。縦線は小節の区切り（4 拍）。
  記号: ス＝スクイ、ハ＝ハジキ、ウ＝打ち指。<br>
  三味線 学習用シミュレーター https://nakatadaiki1012-design.github.io/shamisen-simulator/
</div>
</body></html>`;
}

/** 新しいタブで印刷用ページを開く（ポップアップが止められたら false） */
export function openPrintableScore(song: Song) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(scoreHtml(song));
  w.document.close();
  return true;
}
