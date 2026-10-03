/**
 * 録音が終わったあとの画面: その場で聴く・ダウンロードする
 */
import { Download, Trash2, X } from 'lucide-react';

export interface Recording {
  url: string;
  ext: string;
  seconds: number;
}

interface Props {
  recording: Recording;
  onClose: () => void;
  onDiscard: () => void;
}

export function RecordingDialog({ recording, onClose, onDiscard }: Props) {
  // ファイル名に使う日時（この端末の時刻で 202610031530 のような形）
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl bg-stone-900 border border-stone-700 p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700" aria-label="閉じる">
          <X size={18} />
        </button>
        <h2 className="font-serif-jp text-xl font-bold text-amber-100">🎙 録音できました</h2>
        <p className="text-stone-400 text-sm">長さ 約{Math.max(1, Math.round(recording.seconds))}秒。聴きなおしたり、ファイルとして保存したりできます。</p>
        <audio controls src={recording.url} className="w-full" />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onDiscard}
            className="flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 bg-stone-800 border border-stone-700 hover:bg-stone-700"
          >
            <Trash2 size={15} /> 消す
          </button>
          <a
            href={recording.url}
            download={`shamisen-${stamp}.${recording.ext}`}
            className="flex items-center gap-1 text-sm font-bold rounded-lg px-3 py-1.5 bg-amber-500 text-stone-950 hover:bg-amber-400"
          >
            <Download size={15} /> ダウンロード
          </a>
        </div>
      </div>
    </div>
  );
}
