/**
 * 「三味線のきほん」説明画面
 */
import { X } from 'lucide-react';
import { TECHNIQUES, TUNINGS, Tuning, bunkaLabel } from '../data/notation';

interface Props {
  open: boolean;
  onClose: () => void;
  /** その調子の一・二・三の糸の開放弦を順に鳴らす（今の設定は変えない） */
  onListenTuning: (id: Tuning['id']) => void;
  /** 一の糸のその勘所を鳴らす */
  onListenPosition: (semitone: number) => void;
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

export function GuideModal({ open, onClose, onListenTuning, onListenPosition }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="三味線のきほん"
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
            <table className="text-center bunka text-xs border-collapse">
              <tbody>
                <tr>
                  <th className="px-2 py-1 text-left font-sans text-stone-400 whitespace-nowrap">勘所</th>
                  {Array.from({ length: 13 }, (_, i) => (
                    <td key={i} className="p-0 border border-stone-700">
                      <button
                        onClick={() => onListenPosition(i)}
                        className="w-full px-2 py-1 font-bold text-amber-200 hover:bg-stone-800 active:bg-amber-900"
                        aria-label={`一の糸の${bunkaLabel(i)}を聴く`}
                      >
                        {bunkaLabel(i)}
                      </button>
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
          <p className="text-stone-400 text-xs mt-1">
            ※「+1」は半音1つ分。「10」で開放弦のちょうど1オクターブ上になります。その上は 11・12・13・1#・14…と続きます。
            番号を押すと、一の糸のその勘所の音を聴けます（0 から順に押すと、半音ずつ上がるのがわかります）。
          </p>
        </section>

        <section className="mb-5">
          <h3 className="text-amber-300 font-bold mb-1.5">④ 調子（ちょうし）＝ 調弦のしかた</h3>
          <ul className="space-y-1.5">
            {TUNINGS.map((t) => (
              <li key={t.id}>
                <b className="font-serif-jp text-stone-200">{t.name}</b>
                <span className="text-stone-400 text-xs ml-1">（{t.reading}）</span>
                <button
                  onClick={() => onListenTuning(t.id)}
                  className="ml-2 rounded-lg bg-stone-800 border border-stone-700 hover:bg-stone-700 px-2 py-0.5 text-xs"
                  aria-label={`${t.name}の開放弦を聴く`}
                >
                  ♪ 聴く
                </button>
                <div className="text-stone-400">{t.howTo}</div>
                <div className="text-stone-400 text-xs">{t.mood}</div>
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
            <li>
              <b className="text-stone-200">✋ 両手モード</b>（本物の三味線と同じ弾き方）: 左手で棹を押さえ（押さえるだけでは鳴りません）、
              胴の「撥ゾーン」で糸を打ちます。糸の上をタップ、または上から下へ横切ると「叩き」、下から上へ横切ると「掬い」。
              速く振るほど強い音になります。押さえていない糸は開放弦です。
              鳴っているあいだに指をすべらせるとスリ、奏法で「打ち指」「ハジキ」を選んでおくと、指を押さえる・離すだけで鳴らせます。
            </li>
            <li>
              <b className="text-stone-200">🎹 MIDI</b>: USB の MIDI キーボードや電子パッドをつないで「MIDI」を押すと、鍵盤で弾けます
              （Chrome・Edge）。強く弾くほど大きく、撥の音も強くなります。音の高さに合わせて、いちばん弾きやすい糸と勘所を自動で選びます。
            </li>
            <li>「自由に弾く」で「同じ音の場所」にチェックを入れると、弾いた音と同じ高さが出るほかの糸の場所が水色の点線で出ます。</li>
            <li>「曲の練習」では、黄色く光るところを順番に弾いていきます。「お手本を聴く」で先に聴くこともできます。</li>
            <li>「テンポ練習（テンポに合わせて弾く）」では、メトロノームの4拍のあとに曲が進みます。リズムどおりに弾けたかを「ぴったり・おしい・ミス」で判定して、最後に得点が出ます。次に弾く場所は点線で予告されます。</li>
            <li>「クイズ」には、場所をさがす「勘所クイズ」、番号を答える「番号あて」、音を聴いてさがす「耳コピクイズ」があります。</li>
            <li>
              <b className="text-stone-200">🕐 メトロノーム</b>: 二拍子・三拍子・四拍子と、刻み（まっすぐ／8分／ハネ）を選べます。
              「タップでテンポ」を拍に合わせて何回かたたくと、その速さになります。
            </li>
            <li>
              <b className="text-stone-200">🎚 チューナー</b>: 本物の三味線の調弦に。基準の音（三味線の音でくり返す／ずっと鳴る音）を聴いて合わせるか、
              「マイクで測る」で糸を弾くと、どの糸か・高いか低いか（セント）を針で表示します。
            </li>
            <li>右上の「録音」で弾いた音を録音し、聴きなおしたりファイルで保存したりできます（提出用にも）。</li>
            <li>「番号なし」にすると、勘所を覚えたかためせます。「範囲」で棹に出す勘所を 0〜10 と 0〜20 で切り替えられます。</li>
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
        <section className="mt-5">
          <h3 className="text-amber-300 font-bold mb-1.5">⑦ 授業で使うとき（先生向け）</h3>
          <ol className="list-decimal pl-5 text-stone-400 space-y-1">
            <li><b className="text-stone-200">1時間目</b>: 「三味線のきほん」で各部の名前と3本の糸 → 自由に弾く（開放弦）→ 曲の練習「1. はじめの一歩」。</li>
            <li><b className="text-stone-200">2時間目</b>: 文化譜の読み方（0・1・2・3・#・4…）→「2. 音階れんしゅう」→ クイズ「勘所クイズ（やさしい）」。</li>
            <li><b className="text-stone-200">3時間目</b>: 「かえるの合唱」「メリーさんのひつじ」など入門曲 →「テンポ練習」で得点に挑戦。</li>
            <li><b className="text-stone-200">4時間目</b>: 「さくらさくら」（日本の音階・スクイ）→ 二上り・三下りの音階で調子のちがいを聴きくらべる。</li>
          </ol>
          <ul className="list-disc pl-5 text-stone-400 space-y-1 mt-2">
            <li>曲の練習の「🖨 印刷」で、その曲の文化譜を配布プリントにできます。</li>
            <li>「録音」で弾いた音をファイルに保存できるので、演奏の提出にも使えます。</li>
            <li>
              学習の記録（✓・★・クイズの最高記録）は、その端末のブラウザに保存されます（ほかの端末には引きつがれません）。
              共用の端末では、授業の終わりに
              <button
                onClick={() => {
                  if (!window.confirm('この端末の学習の記録（曲の ✓・★、テンポ練習の自己ベスト、クイズの最高記録）を消します。よろしいですか？')) return;
                  try {
                    ['shamisen_progress', 'shamisen_best_scores', 'shamisen_quiz_best', 'shamisen_welcomed'].forEach((k) => localStorage.removeItem(k));
                  } catch {
                    /* 保存できない環境では何もしない */
                  }
                  window.location.reload();
                }}
                className="mx-1 rounded-lg border border-rose-500/60 bg-rose-900/40 px-2 py-0.5 text-rose-200 text-xs"
              >
                学習の記録を消す
              </button>
              こともできます。
            </li>
            <li>一度開いた端末では、ネットがつながらなくても使えます。教室ではイヤホンの使用がおすすめです。実物の三味線の調弦には「🎚 チューナー」が使えます。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
