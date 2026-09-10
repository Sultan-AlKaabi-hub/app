/* =========================================================
   sw.js — Spine service worker

   Strategies, chosen per resource type:
     app shell     cache-first, versioned       instant launch offline
     covers        stale-while-revalidate       images never change
     catalogue     network-first, 15s ceiling   data should be fresh,
                                                but the service can be slow
     scan engines  cache-once                   barcode + OCR work offline
                                                after the first run
   Bump VERSION whenever a shell file changes, or returning users keep
   the old cached copy.

   iOS WKWebView (which Median.co uses) only runs service workers when
   the app is configured with app-bound domains. The app is written so
   nothing depends on this worker: without it you lose caching, not
   functionality.
   ========================================================= */

var VERSION = 'spine-v1.4.0';
var SHELL = VERSION + '-shell';
var COVERS = VERSION + '-covers';
var DATA = VERSION + '-data';
var ENGINES = 'spine-engines-v1'; // versioned separately: multi-MB, rarely changes

var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/api.js',
  './assets/js/pixel.js',
  './assets/js/scanner.js',
  './assets/js/qr.js',
  './assets/js/faq.js',
  './assets/js/otto.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

var ENGINE_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'tessdata.projectnaptha.com'];
var CATALOGUE_TIMEOUT = 15000;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0 && k !== ENGINES) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function trim(cacheName, max) {
  return caches.open(cacheName).then(function (c) {
    return c.keys().then(function (keys) {
      if (keys.length <= max) return;
      return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return c.delete(k); }));
    });
  });
}

function withTimeout(promise, ms) {
  return new Promise(function (res, rej) {
    var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Covers: show the cached image immediately, refresh quietly behind it.
  if (url.hostname === 'covers.openlibrary.org') {
    e.respondWith(
      caches.open(COVERS).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res.ok) { c.put(req, res.clone()); trim(COVERS, 300); }
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // Catalogue data: prefer the network, fall back to the last good copy.
  if (url.hostname === 'openlibrary.org') {
    e.respondWith(
      withTimeout(fetch(req), CATALOGUE_TIMEOUT).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(DATA).then(function (c) { c.put(req, copy); trim(DATA, 200); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response(JSON.stringify({ error: 'offline' }), {
            status: 503, headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Scan engines: cache once, then serve locally forever.
  if (ENGINE_HOSTS.indexOf(url.hostname) > -1) {
    e.respondWith(
      caches.open(ENGINES).then(function (c) {
        return c.match(req).then(function (hit) {
          return hit || fetch(req).then(function (res) {
            if (res.ok || res.type === 'opaque') c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // Same-origin app shell.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok && res.type === 'basic') {
            var copy = res.clone();
            caches.open(SHELL).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          // A navigation that misses the cache still gets the shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'offline' });
        });
      })
    );
  }
});
