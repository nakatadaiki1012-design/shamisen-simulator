/**
 * 「三味線のきほん」説明画面
 */
import { X } from 'lucide-react';
import { TECHNIQUES, TUNINGS, bunkaLabel } from '../data/notation';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PARTS = [
  ['天神（てんじん）', 'いちばん上の頭の部分。糸巻（いとまき）で糸の張りを調節する。'],
  ['棹（さお）', '左手で糸を押さえる長い部分。押さえる場所を「勘所（かんどころ／つぼ）」という。ギターのようなフレットはない。'],
  ['胴（どう）', '皮を張った四角い箱。撥で糸と一緒に皮も打つので「パン」という独特の音が出る。'],
  ['駒（こま）', '胴の上で糸を支える小さな部品。'],
  ['撥（ばち）', '右手に持つイチョウの葉の形の道具。これで糸を弾く。'],
  ['サワリ', '一の糸だけが上駒からわずかに浮いていて、棹にふれて「ビーン」とうなる仕組み。三味線らしい響きの正体。'],
];

const KEY_ROWS = [
  ['三の糸', 'A S D F G H J K L ; : ]'],
  ['二の糸', 'Q W E R T Y U I O P @ ['],
  ['一の糸', '1 2 3 4 5 6 7 8 9 0 - ^'],
];

export function GuideModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl bg-stone-900 border border-stone-700 p-4 sm:p-6 text-sm leading-relaxed select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700" aria-label="閉じる">
          <X size={18} />
        </button>
        <h2 className="font-serif-jp text-2xl font-bold text-amber-100 mb-4">三味線のきほん</h2>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">① 各部の名前</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
            {PARTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-serif-jp font-bold text-stone-200">{k}</dt>
                <dd className="text-stone-400 mb-1 sm:mb-0">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">② 3本の糸</h3>
          <p className="text-stone-400">
            いちばん太くて低い音が <b className="text-stone-200">一の糸</b>、まん中が <b className="text-stone-200">二の糸</b>、
            いちばん細くて高い音が <b className="text-stone-200">三の糸</b>。
            このアプリでは、文化譜と同じように <b className="text-stone-200">上から 三・二・一</b> の順に並べています（縦向きでは左から一・二・三）。
          </p>
        </section>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">③ 文化譜（ぶんかふ）の読み方</h3>
          <p className="text-stone-400 mb-2">
            文化譜は、3本の線が3本の糸を表し、線の上の数字が「押さえる場所（勘所）」を表す楽譜です。
            <b className="text-stone-200">0</b> はどこも押さえない（開放弦）。数字が大きいほど胴に近くなり、音が高くなります。
            「#」や「♭」は記号ではなく、<b className="text-stone-200">それ自体がひとつの勘所の名前</b>です。
          </p>
          <div className="overflow-x-auto">
            <table className="text-center font-mono text-xs border-collapse">
              <tbody>
                <tr>
                  <th className="px-2 py-1 text-left font-sans text-stone-400 whitespace-nowrap">勘所</th>
                  {Array.from({ length: 13 }, (_, i) => (
                    <td key={i} className="px-2 py-1 border border-stone-700 font-bold text-amber-200">
                      {bunkaLabel(i)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="px-2 py-1 text-left font-sans text-stone-400 whitespace-nowrap">開放弦から</th>
                  {Array.from({ length: 13 }, (_, i) => (
                    <td key={i} className="px-2 py-1 border border-stone-700 text-stone-400">
                      {i === 0 ? '±0' : `+${i}`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-stone-500 text-xs mt-1">
            ※「+1」は半音1つ分。「10」で開放弦のちょうど1オクターブ上になります。その上は 11・12・13・1#・14…と続きます。
          </p>
        </section>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">④ 調子（ちょうし）＝ 調弦のしかた</h3>
          <ul className="space-y-1.5">
            {TUNINGS.map((t) => (
              <li key={t.id}>
                <b className="font-serif-jp text-stone-200">{t.name}</b>
                <span className="text-stone-500 text-xs ml-1">（{t.reading}）</span>
                <div className="text-stone-400">{t.howTo}</div>
                <div className="text-stone-500 text-xs">{t.mood}</div>
              </li>
            ))}
          </ul>
          <p className="text-stone-400 mt-2">
            <b className="text-stone-200">本数（ほんすう）</b>は、一の糸の高さの呼び方です。一本＝ラ、二本＝ラ♯、三本＝シ、四本＝ド…と半音ずつ高くなります。
            歌う人の声の高さに合わせて選びます。
          </p>
        </section>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">⑤ 奏法（弾き方）</h3>
          <ul className="space-y-1">
            {TECHNIQUES.map((t) => (
              <li key={t.id}>
                <b className="text-stone-200">{t.name}</b>
                {t.mark && <span className="text-rose-300 font-serif-jp ml-1">楽譜の記号「{t.mark}」</span>}
                <div className="text-stone-400">{t.desc}</div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-amber-300 font-bold mb-1.5">⑥ このアプリの使い方</h3>
          <ul className="list-disc pl-5 text-stone-400 space-y-1">
            <li>棹の上の四角をタップ → その勘所を押さえて弾いた音。右側（縦向きでは下側）の胴をタップ → 開放弦「0」。</li>
            <li>押したまま同じ糸の上を指ですべらせると「スリ」になります。</li>
            <li>「曲の練習」では、黄色く光るところを順番に弾いていきます。「お手本を聴く」で先に聴くこともできます。</li>
            <li>「番号をかくす」にすると、勘所を覚えたかためせます。</li>
            <li>パソコンではキーボードでも弾けます（左から 0・1・2・3・#・4…の順）:</li>
          </ul>
          <table className="mt-1 ml-5 text-xs font-mono">
            <tbody>
              {KEY_ROWS.map(([s, keys]) => (
                <tr key={s}>
                  <td className="pr-3 font-sans text-stone-300">{s}</td>
                  <td className="text-stone-400">{keys}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
