/*
 * オフラインでも使えるようにする係（サービスワーカー）
 *
 * - ページ本体（index.html）: まずネットから取りに行き、つながらないときだけ保存しておいたものを使う
 *   （更新があればすぐ反映される）
 * - 画像・プログラムなど（ファイル名に版の印が付いている）: 保存しておいたものを使い、無ければネットから取る
 */
const CACHE = 'shamisen-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './favicon.svg'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 最初に開いたときは、この係が動き出す前にファイルが読みこまれるので、
// ページから「読みこんだファイルの一覧」を受け取って保存する
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'cache' ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  const same = urls.filter((u) => {
    try {
      return new URL(u).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(same.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // フォントなど外のものはブラウザにまかせる

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
