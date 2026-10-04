/**
 * MIDI キーボード・電子パッドなどからの入力（Web MIDI）。
 *
 * - 「MIDI」ボタンを押したときに初めて使用許可を求める（勝手にはつながない）
 * - ノートオンを受けたら、すぐ（画面の更新を待たずに）onNote を呼ぶ
 * - 機器を抜き差ししても、自動でつなぎ直す
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MidiState {
  supported: boolean;
  enabled: boolean;
  devices: string[];
  error: string | null;
}

type NavigatorWithMidi = Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MIDIAccess> };

export function useMidi(onNote: (note: number, velocity: number) => void) {
  const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithMidi) : undefined;
  const [state, setState] = useState<MidiState>({
    supported: !!nav?.requestMIDIAccess,
    enabled: false,
    devices: [],
    error: null,
  });
  const access = useRef<MIDIAccess | null>(null);
  const noteRef = useRef(onNote);
  noteRef.current = onNote;

  const handleMessage = useCallback((e: MIDIMessageEvent) => {
    const d = e.data;
    if (!d || d.length < 3) return;
    const cmd = d[0] & 0xf0;
    // ノートオン（強さ 0 はノートオフの意味なので無視）
    if (cmd === 0x90 && d[2] > 0) noteRef.current(d[1], d[2] / 127);
  }, []);

  const attach = useCallback(() => {
    const a = access.current;
    if (!a) return;
    const names: string[] = [];
    a.inputs.forEach((input) => {
      input.onmidimessage = handleMessage;
      names.push(input.name || 'MIDI 機器');
    });
    setState((s) => ({ ...s, enabled: true, devices: names, error: null }));
  }, [handleMessage]);

  const enable = useCallback(async () => {
    if (!nav?.requestMIDIAccess) {
      setState((s) => ({ ...s, error: 'このブラウザは MIDI に対応していません（Chrome・Edge なら使えます）' }));
      return;
    }
    try {
      const a = await nav.requestMIDIAccess({ sysex: false });
      access.current = a;
      a.onstatechange = attach;
      attach();
    } catch {
      setState((s) => ({ ...s, error: 'MIDI の使用が許可されませんでした' }));
    }
  }, [nav, attach]);

  const disable = useCallback(() => {
    const a = access.current;
    if (a) {
      a.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
      a.onstatechange = null;
    }
    access.current = null;
    setState((s) => ({ ...s, enabled: false, devices: [] }));
  }, []);

  useEffect(() => () => disable(), [disable]);

  return { ...state, enable, disable };
}
