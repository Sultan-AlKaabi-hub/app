/* =========================================================
   scanner.js — camera acquisition, barcode decode, cover OCR

   Barcode strategy, best engine first:
     1. Native BarcodeDetector (Chrome / Android WebView).
        Zero download, hardware-backed, works with no network.
        If the platform exposes the API but its detector service
        is missing (Chrome on Windows/Linux does this) detection
        throws on every frame; after a run of failures we fall
        through to engine 2 instead of spinning forever.
     2. html5-qrcode (ZXing port) from jsDelivr, loaded only when
        step 1 is missing or broken (Safari / iOS WKWebView).
        Cached by the service worker after first use.
   Cover strategy:
     Tesseract.js, loaded on first use only. Its worker, core WASM
     and language data are cached by the service worker and by
     Tesseract's own IndexedDB store, so after one successful run
     the cover reader also works offline.
   ========================================================= */
(function (global) {
  'use strict';

  var CDN_ZXING = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  var CDN_OCR = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  var state = { mode: null, stream: null, track: null, lib: null, raf: 0, det: null, alive: false, engine: null, starting: false };
  var loaded = {};
  var gen = 0;            // start generation: a stale start's callbacks are ignored
  var chain = Promise.resolve();

  // Android releases the camera asynchronously after a track stops. Asking
  // for it again too soon fails with NotReadableError ("in use"), which is
  // why every start waits for the previous teardown plus a short settle.
  var RELEASE_MS = 350;
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = res;
      s.onerror = function () { loaded[src] = null; rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  /** Android WebView (Median, Capacitor) or iOS WKWebView wrapper. */
  function isWebView() {
    var ua = navigator.userAgent || '';
    return /; wv\)|median|gonative|capacitor/i.test(ua) ||
      (/iPhone|iPad/.test(ua) && !/Safari/.test(ua));
  }

  /* ---------------- errors in plain language ---------------- */
  function describe(err) {
    // html5-qrcode rejects with bare strings; DOM errors carry a name.
    var n = typeof err === 'string' ? err
      : [err && err.name, err && err.message].filter(Boolean).join(' ');
    if (!global.isSecureContext) {
      return { title: 'This page is not secure', msg: 'Browsers only allow camera access over HTTPS. Open this app on its https:// address.', kind: 'insecure' };
    }
    if (/NotAllowedError|Permission|denied|dismissed/i.test(n)) {
      if (isWebView()) {
        return { title: 'This app build cannot use the camera', msg: 'The wrapper has not been granted camera access. Open the phone’s Settings › Apps › Spine › Permissions and allow Camera. If there is no Camera entry, the app was built without the camera permission and needs to be rebuilt with it enabled.', kind: 'denied' };
      }
      return { title: 'Camera permission is off', msg: 'Allow camera access for this site, then tap Try again. Android: tap the lock icon in the address bar › Permissions. iOS: Settings › Safari › Camera.', kind: 'denied' };
    }
    if (/NotFoundError|DevicesNotFound|OverconstrainedError|not found|no camera|not supported/i.test(n)) {
      return { title: 'No camera found', msg: 'This device has no camera Spine can reach. You can still type an ISBN.', kind: 'nocam' };
    }
    if (/NotReadableError|TrackStart|could not start|in use/i.test(n)) {
      return { title: 'The camera is busy', msg: 'Another app is using it. Close that app and tap Try again.', kind: 'busy' };
    }
    if (/offline|Failed to fetch|NetworkError/i.test(n)) {
      return { title: 'Scanner could not load', msg: 'The barcode engine needs one connection the first time. Reconnect and tap Try again.', kind: 'offline' };
    }
    return { title: 'Camera unavailable', msg: 'Something blocked the camera. Tap Try again, or type an ISBN instead.', kind: 'unknown' };
  }

  /* ---------------- native detector ---------------- */
  function nativeDetector() {
    if (!('BarcodeDetector' in global)) return Promise.resolve(null);
    return global.BarcodeDetector.getSupportedFormats().then(function (f) {
      var want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(function (x) { return f.indexOf(x) > -1; });
      return want.length ? new global.BarcodeDetector({ formats: want }) : null;
    }).catch(function () { return null; });
  }

  function openStream(video, hiRes, attempt) {
    attempt = attempt || 0;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error(global.isSecureContext ? 'NotFoundError' : 'insecure'));
    }
    var c = {
      audio: false,
      video: attempt < 2
        ? { facingMode: { ideal: 'environment' }, width: { ideal: hiRes ? 1920 : 1280 }, height: { ideal: hiRes ? 1080 : 720 } }
        : { facingMode: 'environment' }   // last try: the plainest possible request
    };
    var myGen = gen;
    state.starting = true;
    return navigator.mediaDevices.getUserMedia(c).then(function (stream) {
      state.starting = false;
      if (myGen !== gen) {
        // Torn down while the permission prompt was open: release quietly.
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        throw Object.assign(new Error('stale'), { stale: true });
      }
      state.stream = stream;
      state.track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      // play() resolves only once frames flow; a stalled camera must not
      // wedge the start chain, so the wait is capped.
      return Promise.race([
        video.play().catch(function () { /* autoplay retry is harmless */ }),
        delay(1500)
      ]);
    }).catch(function (e) {
      state.starting = false;
      if (e && e.stale) throw e;
      // "In use" is almost always the previous stream still releasing.
      if (attempt < 2 && myGen === gen && /NotReadableError|TrackStart|AbortError/i.test((e && e.name) || '')) {
        return delay(700 + attempt * 500).then(function () {
          if (myGen !== gen) throw Object.assign(new Error('stale'), { stale: true });
          return openStream(video, hiRes, attempt + 1);
        });
      }
      throw e;
    });
  }

  /* ---------------- barcode ---------------- */
  function startBarcode(o) {
    var myGen = ++gen;
    var run = function () {
      if (myGen !== gen) return;
      state.mode = 'barcode';
      state.alive = true;
      return nativeDetector().then(function (det) {
        if (myGen !== gen) return;
        if (det) return startNative(o, det);
        return startZxing(o);
      }).catch(function (e) { if (myGen === gen && !(e && e.stale)) o.onError(describe(e)); });
    };
    chain = chain.then(stop).then(function () { return delay(RELEASE_MS); }).then(run);
    return chain;
  }

  function startNative(o, det) {
    state.det = det;
    state.engine = 'native';
    o.video.hidden = false;
    o.mount.hidden = true;
    return openStream(o.video, false).then(function () {
      if (!state.alive) return;
      o.onReady && o.onReady({ torch: torchable(), engine: 'native' });
      loop(o);
    });
  }

  function startZxing(o) {
    o.video.hidden = true;
    o.mount.hidden = false;
    return loadScript(CDN_ZXING).then(function () {
      var F = global.Html5QrcodeSupportedFormats;
      state.lib = new global.Html5Qrcode(o.mount.id, {
        verbose: false,
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
        experimentalFeatures: { useBarCodeDetectorIfSupported: false }
      });
      state.engine = 'zxing';
      state.starting = true;
      return state.lib.start(
        { facingMode: 'environment' },
        { fps: 12, disableFlip: true, videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
        function (text) { if (state.alive) o.onHit(text); },
        function () { /* per-frame misses are normal */ }
      ).then(function () {
        state.starting = false;
        if (!state.alive) return;
        o.onReady && o.onReady({ torch: libTorchable(), engine: 'zxing' });
      }, function (e) { state.starting = false; throw e; });
    });
  }

  var last = 0, fails = 0;
  function loop(o) {
    if (!state.alive || state.mode !== 'barcode' || !state.det) return;
    state.raf = requestAnimationFrame(function (t) {
      // ~8 detections per second is plenty for a handheld barcode and
      // keeps a low-end phone from pinning its CPU on every frame.
      if (t - last > 120 && o.video.readyState >= 2) {
        last = t;
        state.det.detect(o.video).then(function (codes) {
          fails = 0;
          if (state.alive && codes && codes.length) o.onHit(codes[0].rawValue);
        }).catch(function () {
          // The API exists but the platform has no detection service.
          if (++fails >= 12 && state.alive) {
            fails = 0;
            var myGen = ++gen;
            chain = chain.then(stop).then(function () { return delay(RELEASE_MS); }).then(function () {
              if (myGen !== gen) return;
              state.mode = 'barcode'; state.alive = true;
              o.video.hidden = true;
              return startZxing(o);
            }).catch(function (e) { if (myGen === gen && !(e && e.stale)) o.onError(describe(e)); });
          }
        });
      }
      loop(o);
    });
  }

  /* ---------------- cover / OCR ---------------- */
  function startCover(o) {
    var myGen = ++gen;
    chain = chain.then(stop).then(function () { return delay(RELEASE_MS); }).then(function () {
      if (myGen !== gen) return;
      state.mode = 'cover';
      state.alive = true;
      state.engine = 'camera';
      o.video.hidden = false;
      o.mount.hidden = true;
      return openStream(o.video, true).then(function () {
        if (!state.alive) return;
        o.onReady && o.onReady({ torch: torchable(), engine: 'camera' });
      });
    }).catch(function (e) { if (myGen === gen && !(e && e.stale)) o.onError(describe(e)); });
    return chain;
  }

  /** Grab the current frame, clean it up, and hand it to Tesseract. */
  function readCover(video, canvas, onProgress) {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return Promise.reject(new Error('no_frame'));

    // Crop to the reticle: centre 66% wide, 80% tall.
    var cw = Math.round(vw * 0.66), ch = Math.round(vh * 0.80);
    var cx = Math.round((vw - cw) / 2), cy = Math.round((vh - ch) / 2);

    var scale = Math.min(1, 1500 / cw);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);

    // Greyscale + contrast stretch. OCR on a colour cover with a busy
    // photographic background is markedly worse than on flattened luma.
    try {
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var d = img.data, i, lo = 255, hi = 0, lum = new Uint8ClampedArray(d.length / 4);
      for (i = 0; i < lum.length; i++) {
        var v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
        lum[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      var span = Math.max(1, hi - lo);
      for (i = 0; i < lum.length; i++) {
        var s = ((lum[i] - lo) * 255 / span) | 0;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = s;
      }
      ctx.putImageData(img, 0, 0);
    } catch (e) { /* preprocessing is an optimisation, not a requirement */ }

    return ocr(canvas, onProgress).then(function (text) { return distil(text); });
  }

  function ocr(source, onProgress) {
    return loadScript(CDN_OCR).then(function () {
      return global.Tesseract.recognize(source, 'eng', {
        logger: function (m) {
          if (!onProgress) return;
          if (m.status === 'recognizing text') onProgress('Reading the cover', m.progress);
          else if (/loading|initializing|downloading/i.test(m.status)) onProgress('Getting the text reader ready', m.progress);
        }
      });
    }).then(function (r) { return (r && r.data && r.data.text) || ''; });
  }

  // Cover furniture that is never part of the title.
  var NOISE = /^(a novel|a memoir|novel|memoir|stories|fiction|non[- ]?fiction|the (instant )?(no\.?\s*1 )?(sunday times |new york times )?bestsell(er|ing)|new york times|sunday times|international bestseller|national bestseller|winner of.*|shortlisted.*|longlisted.*|author of.*|from the author.*|now a major.*|book (one|two|three)|volume \w+|penguin( classics| books)?|vintage|harper( ?collins)?|bloomsbury|faber|picador|random house|copyright.*|isbn.*|\W*)$/i;

  function distil(raw) {
    var lines = raw.split('\n').map(function (l) {
      return l.replace(/[^\p{L}\p{N}'’&:.,!?\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
    }).filter(function (l) {
      if (l.length < 3 || l.length > 90) return false;
      if (NOISE.test(l)) return false;
      var letters = (l.match(/\p{L}/gu) || []).length;
      return letters / l.length > 0.6; // reject garbled runs
    });

    // Longest surviving lines are, in practice, the title and the author.
    var ranked = lines.slice().sort(function (a, b) { return b.length - a.length; });
    return { query: ranked.slice(0, 2).join(' ').slice(0, 110), lines: lines };
  }

  /* ---------------- offline preparation ----------------
     Pull every engine through the service worker once so a later
     scan needs no network. The OCR pass on a blank tile downloads
     the worker, the core WASM and the English model. */
  function warm(onProgress) {
    var steps = 0;
    function tick(msg, pct) { onProgress && onProgress(msg, pct); }
    tick('Fetching the barcode engine', 0.05);
    return loadScript(CDN_ZXING).then(function () {
      steps++;
      tick('Fetching the text reader', 0.25);
      var c = document.createElement('canvas');
      c.width = 96; c.height = 32;
      var x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 96, 32);
      x.fillStyle = '#000'; x.font = '20px sans-serif'; x.fillText('Spine', 10, 24);
      return ocr(c, function (m, p) { tick(m, 0.25 + (p || 0) * 0.7); });
    }).then(function () { tick('Ready for offline use', 1); return true; });
  }

  /* ---------------- torch ---------------- */
  function torchable() {
    try {
      var c = state.track && state.track.getCapabilities && state.track.getCapabilities();
      return !!(c && c.torch);
    } catch (e) { return false; }
  }
  function libTorchable() {
    try {
      var c = state.lib && state.lib.getRunningTrackCapabilities && state.lib.getRunningTrackCapabilities();
      return !!(c && c.torch);
    } catch (e) { return false; }
  }
  function torch(on) {
    if (state.track) return state.track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(function () {});
    if (state.lib) return state.lib.applyVideoConstraints({ advanced: [{ torch: !!on }] }).catch(function () {});
    return Promise.resolve();
  }

  /* ---------------- teardown ---------------- */
  /** Tear down whatever is running. Resolves once the tracks are released. */
  function stop() {
    state.alive = false;
    cancelAnimationFrame(state.raf);
    state.det = null;
    fails = 0;
    var waits = [];
    if (state.lib) {
      var lib = state.lib;
      state.lib = null;
      try {
        waits.push(lib.stop().then(function () { try { lib.clear(); } catch (e) {} }).catch(function () {}));
      } catch (e) {}
    }
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      state.stream = null; state.track = null;
    }
    state.mode = null;
    state.engine = null;
    return Promise.all(waits).then(function () {});
  }

  /** Invalidate any start in flight, then tear down. */
  function cancel() {
    gen++;
    return stop();
  }

  global.Scanner = {
    startBarcode: startBarcode,
    startCover: startCover,
    readCover: readCover,
    warm: warm,
    torch: torch,
    stop: cancel,
    describe: describe,
    isLive: function () { return !!(state.stream || state.lib) && state.alive; },
    isStarting: function () { return state.starting; },
    distil: distil,
    engine: function () { return state.engine; }
  };
})(window);
