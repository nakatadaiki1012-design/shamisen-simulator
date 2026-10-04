import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// 一度開けば、ネットがつながらなくても使えるようにする（公開版のみ）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // すでに読みこんだファイル（プログラム・音を作る係など）も保存してもらう
        const urls = performance.getEntriesByType('resource').map((e) => e.name);
        reg.active?.postMessage({ type: 'cache', urls: [location.href, ...urls] });
      })
      .catch(() => {
        /* 使えない環境ではふつうに動く */
      });
  });
}
