/* =========================================================
   app.js — Spine
   Router, persistent shelf, scan orchestration, offline queue,
   detail sheet, reading statistics, settings, install flow, and
   the Otto walkthrough.
   ========================================================= */
(function () {
  'use strict';

  var VERSION = '1.1.2';

  // Where the app lives and where the Android package is published.
  // The APK URL follows the GitHub Releases convention: upload the file
  // Median produces as an asset named spine.apk on any release and this
  // link always points at the newest one.
  var SHARE = {
    site: 'https://sultan-alkaabi-hub.github.io/app/',
    apk: 'https://github.com/Sultan-AlKaabi-hub/app/releases/latest/download/spine.apk'
  };
  var KEY = 'spine.shelf.v1';
  var KEY_SET = 'spine.settings.v1';
  var KEY_TOUR = 'spine.tour.v1';
  var KEY_WARM = 'spine.engines.v1';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /** A blank-jacket bookplate for records Open Library has no cover for. */
  function plate(b) {
    if (b.pending) return '<div class="plate"><span class="plate__i">ISBN</span><span class="plate__r"></span></div>';
    var first = (b.title || '?').replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase();
    return '<div class="plate"><span class="plate__i">' + esc(first || '?') + '</span><span class="plate__r"></span></div>';
  }

  /** Human interval since a timestamp, for the shelf-age fact. */
  function since(ts) {
    if (!ts || ts < 1e12) return '—';
    var d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return '1 day';
    if (d < 30) return d + ' days';
    if (d < 365) return Math.round(d / 30) + ' mo';
    return Math.round(d / 365) + ' yr';
  }

  function motionOff() {
    return !settings.motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* =======================================================
     Store
     ======================================================= */
  var shelf = [];
  var settings = { haptics: true, motion: true, view: 'grid' };

  function load() {
    try { shelf = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { shelf = []; }
    if (!Array.isArray(shelf)) shelf = [];
    try { settings = Object.assign(settings, JSON.parse(localStorage.getItem(KEY_SET)) || {}); } catch (e) {}
    document.body.classList.toggle('no-motion', !settings.motion);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(shelf)); }
    catch (e) { toast('Storage is full. Export and clear some books.', 'bad'); }
  }
  function saveSettings() {
    try { localStorage.setItem(KEY_SET, JSON.stringify(settings)); } catch (e) {}
  }
  function buzz(ms) {
    if (settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms || 18); } catch (e) {} }
  }
  function byId(id) { return shelf.filter(function (x) { return x.id === id; })[0]; }
  function findByIsbn(i13) { return shelf.filter(function (b) { return b.isbn13 && b.isbn13 === i13; })[0]; }

  /* =======================================================
     Chrome: toast, lookup overlay, flash, page turn, confirm
     ======================================================= */
  var toastT;
  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.hidden = true; }, 3400);
  }
  function busy(on, msg, pct) {
    var el = $('#lookup');
    if (!on) { el.hidden = true; return; }
    el.hidden = false;
    $('#lookup-msg').textContent = msg || 'Reading the catalogue…';
    var bar = $('#lookup-bar');
    if (typeof pct === 'number') {
      bar.hidden = false;
      bar.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%';
    } else { bar.hidden = true; }
  }
  function flash() {
    var f = $('#flash');
    f.classList.remove('is-on');
    void f.offsetWidth;
    f.classList.add('is-on');
  }
  function pageTurn(then) {
    var p = $('#pageturn');
    if (motionOff()) { then(); return; }
    p.classList.remove('is-on');
    void p.offsetWidth;
    p.classList.add('is-on');
    setTimeout(then, 380);
    setTimeout(function () { p.classList.remove('is-on'); }, 950);
  }

  var confirmCb = null;
  function ask(title, msg, okLabel, cb) {
    $('#confirm-h').textContent = title;
    $('#confirm-p').textContent = msg;
    $('#confirm-ok').textContent = okLabel || 'Delete';
    confirmCb = cb;
    openSheet('confirm');
  }

  /* =======================================================
     Router
     ======================================================= */
  var current = null, dust = null;

  function activate(id) {
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === id); });
  }

  function go(page) {
    if (current === 'scan' && page !== 'scan') leaveScan();
    var fromFront = current === 'intro' || current === 'tutorial';
    $('#view-intro').classList.remove('is-active');
    $('#view-tutorial').classList.remove('is-active');
    if (tour) { tour.stop(); tour = null; }
    if (dust) dust.pause();
    $('#app').hidden = false;
    activate('view-' + page);
    current = page;
    $$('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.go === page); });
    if (page === 'library') renderShelf();
    if (page === 'stats') renderStats();
    if (page === 'scan') enterScan();
    if (page === 'settings') syncSettings();
    window.scrollTo(0, 0);
    void fromFront;
  }

  function showIntro() {
    if (current === 'scan') leaveScan();
    $('#app').hidden = true;
    current = 'intro';
    activate('view-intro');
    if (dust) dust.resume();
    var n = shelf.length;
    $('#intro-count').textContent = n
      ? n + (n === 1 ? ' book on your shelf' : ' books on your shelf')
      : '';
    $('#intro-tour').textContent = localStorage.getItem(KEY_TOUR) ? 'Watch the walkthrough again' : 'Show me how it works';
  }

  /* ---- intro flourishes: letter reveal + parallax ---- */
  function dressIntro() {
    var t = $('#intro-title');
    var text = t.textContent;
    t.innerHTML = text.split('').map(function (ch, i) {
      return '<i style="--i:' + i + '">' + esc(ch) + '</i>';
    }).join('');
    t.setAttribute('aria-label', text);

    var view = $('#view-intro');
    function setP(x, y) {
      view.style.setProperty('--px', x.toFixed(3));
      view.style.setProperty('--py', y.toFixed(3));
    }
    view.addEventListener('pointermove', function (e) {
      if (motionOff()) return;
      setP((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
    });
    view.addEventListener('pointerleave', function () { setP(0, 0); });
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', function (e) {
        if (current !== 'intro' || motionOff() || e.gamma == null) return;
        setP(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
      }, { passive: true });
    }
  }

  /* =======================================================
     Tutorial — Otto
     ======================================================= */
  var tour = null, tourStep = 0, typeT = null;

  var STEPS = [
    {
      pose: 'wave',
      line: 'Hello. I am Otto, and I keep the catalogue here. Point your camera at any book and I will file it on your shelf. Two ways to do that.',
      demo: '<div class="demo-chips"><span class="tag" style="--i:0">Barcode</span><span class="tag" style="--i:1">Cover text</span></div>'
    },
    {
      pose: 'idle',
      line: 'The barcode on the back is the exact one. It names the precise edition you are holding, and it works without a signal.',
      demo: '<div class="demo-barcode demo-scanline">' + Array(26).join('<i></i>') + '</div>'
    },
    {
      pose: 'book',
      line: 'Older books have no barcode. Point at the front cover and I read the type. I do misread now and then, so I hand you a shortlist rather than a guess.',
      demo: '<div class="demo-cover">Things Fall Apart</div>'
    },
    {
      pose: 'book',
      line: 'Either way the record comes from Open Library: pages, publisher, subjects, the blurb. You never type any of it.',
      demo: '<div class="demo-card"><div class="demo-card__cov"></div><div>' +
            '<div class="demo-card__t">Mrs Dalloway</div>' +
            '<div class="demo-card__s">Virginia Woolf · 1925 · 194 pp</div></div></div>'
    },
    {
      pose: 'idle',
      line: 'No signal? Scan anyway. I keep the number and fetch the record the moment you are back online. Your shelf never leaves this phone.',
      demo: '<div class="demo-offline"><i></i>Saved · looking up when online</div>'
    }
  ];

  function showTutorial() {
    if (current === 'scan') leaveScan();
    $('#app').hidden = true;
    current = 'tutorial';
    activate('view-tutorial');
    if (dust) dust.pause();
    tourStep = 0;
    if (!tour) tour = window.Pixel.mountAvatar($('#avatar'), { still: motionOff() });
    $('#tut-dots').innerHTML = STEPS.map(function () { return '<i></i>'; }).join('');
    paintStep();
  }

  function paintStep() {
    var s = STEPS[tourStep];
    $$('#tut-dots i').forEach(function (d, i) { d.classList.toggle('is-on', i === tourStep); });
    var demo = $('#tut-demo');
    demo.innerHTML = '';
    // Re-insert on the next frame so the entrance animation replays.
    requestAnimationFrame(function () { demo.innerHTML = s.demo; });
    $('#tut-next').textContent = tourStep === STEPS.length - 1 ? 'Start scanning' : 'Next';
    if (tour) { tour.pose(s.pose); tour.hop(); }
    type(s.line);
  }

  function type(text) {
    clearTimeout(typeT);
    var el = $('#tut-line');
    if (motionOff()) { el.textContent = text; if (tour) tour.talking(false); return; }
    var i = 0;
    el.innerHTML = '';
    if (tour) tour.talking(true);
    (function step() {
      i += 2;
      el.innerHTML = esc(text.slice(0, i)) + (i < text.length ? '<span class="caret">|</span>' : '');
      if (i < text.length) typeT = setTimeout(step, 14);
      else if (tour) tour.talking(false);
    })();
  }

  function endTour() {
    clearTimeout(typeT);
    localStorage.setItem(KEY_TOUR, '1');
    pageTurn(function () { go('scan'); });
  }

  /* =======================================================
     Library
     ======================================================= */
  var filter = 'all', query = '';

  function matches(b) {
    if (filter !== 'all' && b.status !== filter) return false;
    if (!query) return true;
    var hay = (b.title + ' ' + (b.authors || []).join(' ') + ' ' + (b.subjects || []).join(' ') + ' ' + (b.isbn13 || '')).toLowerCase();
    return hay.indexOf(query) > -1;
  }

  function visibleBooks() {
    return shelf.filter(matches).sort(function (a, b) { return b.addedAt - a.addedAt; });
  }

  function renderShelf() {
    var grid = $('#lib-grid'), spines = $('#lib-spines'), empty = $('#lib-empty');
    var n = shelf.length, pend = shelf.filter(function (b) { return b.pending; }).length;
    $('#lib-count').textContent = n
      ? n + (n === 1 ? ' book' : ' books') + ' · ' + shelf.filter(function (b) { return b.status === 'read'; }).length + ' finished' +
        (pend ? ' · ' + pend + ' waiting for a signal' : '')
      : 'Empty';

    var isSpines = settings.view === 'spines';
    $('#lib-view').setAttribute('aria-pressed', isSpines ? 'true' : 'false');
    $('#lib-view').setAttribute('aria-label', isSpines ? 'Switch to cover view' : 'Switch to spine view');

    if (!n) { grid.innerHTML = ''; spines.innerHTML = ''; grid.hidden = false; spines.hidden = true; empty.classList.add('is-on'); return; }
    empty.classList.remove('is-on');

    var list = visibleBooks();
    grid.hidden = isSpines;
    spines.hidden = !isSpines;
    var target = isSpines ? spines : grid;
    if (!list.length) {
      target.innerHTML = '<p class="fineprint" style="grid-column:1/-1;text-align:center;padding:2rem 0">' +
        'No books match that. Clear the search or pick another shelf.</p>';
      return;
    }
    if (isSpines) renderSpines(list, spines); else renderGrid(list, grid);
  }

  function renderGrid(list, grid) {
    grid.innerHTML = list.map(function (b, i) {
      var cov = b.cover
        ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" decoding="async" crossorigin="anonymous" data-id="' + esc(b.id) + '">'
        : '';
      return '<button class="bk' + (b.pending ? ' bk--pending' : '') + '" data-id="' + esc(b.id) + '" style="animation-delay:' + Math.min(i * 26, 420) + 'ms" aria-label="' + esc(b.title) + '">' +
        '<div class="bk__cov">' +
          plate(b) + cov +
          (b.pending ? '<span class="bk__pend">' + (navigator.onLine ? 'Looking up…' : 'Waiting for signal') + '</span>'
                     : '<span class="bk__dot bk__dot--' + esc(b.status) + '"></span>') +
        '</div>' +
        '<div class="bk__t">' + esc(b.title) + '</div>' +
        '<div class="bk__a">' + esc((b.authors || [])[0] || (b.pending ? 'Open Library' : 'Unknown')) + '</div>' +
      '</button>';
    }).join('');

    $$('img', grid).forEach(function (img) {
      img.addEventListener('error', onCoverError, { once: true });
      img.addEventListener('load', function () { learnTint(this, byId(this.dataset.id)); }, { once: true });
    });
  }

  // A cover URL can 404 after the record was saved, or a CORS hop can
  // fail: retry once without the CORS flag, then fall back to the plate.
  function onCoverError() {
    if (this.crossOrigin) {
      var src = this.src;
      this.removeAttribute('crossorigin');
      this.addEventListener('error', function () { this.remove(); }, { once: true });
      this.src = src + (src.indexOf('?') > -1 ? '&' : '?') + 'r=1';
      return;
    }
    this.remove();
  }

  /* ---- Spine view ---- */
  function hashHue(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }
  function spineColour(b) {
    if (b.tint) return 'rgb(' + b.tint + ')';
    return 'hsl(' + hashHue(b.title || b.id) + ' 34% 34%)';
  }
  function inkFor(b) {
    if (!b.tint) return '';
    var p = b.tint.split(',').map(Number);
    var lum = (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000;
    return lum > 150 ? '--sp-ink:rgba(12,16,32,.88);' : '';
  }

  function renderSpines(list, host) {
    var rowW = host.clientWidth - 24 || 320;
    var rows = [], row = [], used = 0;
    list.forEach(function (b) {
      var pages = b.pages || 240;
      var w = Math.round(Math.max(20, Math.min(44, 16 + pages / 22)));
      var h = Math.round(Math.max(96, Math.min(140, 88 + (hashHue(b.title || '') % 52))));
      var item = { b: b, w: w, h: h };
      if (used + w + 3 > rowW && row.length) { rows.push(row); row = []; used = 0; }
      row.push(item); used += w + 3;
    });
    if (row.length) rows.push(row);

    var i = 0;
    host.innerHTML = rows.map(function (r) {
      var lean = r.length > 2 && r.length < 9 && hashHue(r[r.length - 1].b.title || '') % 3 === 0;
      return '<div class="shelfrow">' + r.map(function (it, j) {
        var b = it.b, last = j === r.length - 1;
        var style = '--w:' + it.w + 'px;--h:' + it.h + 'px;--c:' + spineColour(b) + ';--i:' + (i++) + ';' + inkFor(b);
        return '<button class="sp' + (lean && last ? ' is-lean' : '') + '" data-id="' + esc(b.id) + '" style="' + style + '" aria-label="' + esc(b.title) + '">' +
          '<span class="sp__band sp__band--top"></span>' +
          '<span class="sp__t">' + esc(b.pending ? 'ISBN ' + b.isbn13 : b.title) + '</span>' +
          '<span class="sp__band sp__band--bot"></span>' +
          '<span class="sp__dot sp__dot--' + esc(b.status) + '"></span>' +
        '</button>';
      }).join('') + '</div>';
    }).join('');

    // Quietly sample colours for spines that have none yet.
    list.filter(function (b) { return b.cover && !b.tint && !b.pending; }).slice(0, 12).forEach(function (b) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { if (learnTint(im, b) && current === 'library' && settings.view === 'spines') paintSpine(b); };
      im.src = b.cover;
    });
  }

  function paintSpine(b) {
    var el = $('.sp[data-id="' + b.id + '"]');
    if (!el) return;
    el.style.setProperty('--c', spineColour(b));
    var ink = inkFor(b);
    if (ink) el.style.setProperty('--sp-ink', 'rgba(12,16,32,.88)');
  }

  /** Average colour of a cover, pushed toward the saturated end. */
  function sample(img) {
    var c = document.createElement('canvas');
    c.width = 12; c.height = 18;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 12, 18);
    var d = x.getImageData(0, 0, 12, 18).data, r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    var mx = Math.max(r, g, b) || 1, k = Math.min(1.9, 210 / mx);
    return [r * k, g * k, b * k].map(function (v) { return Math.min(255, v) | 0; });
  }
  function learnTint(img, b) {
    if (!b || b.tint || !img.naturalWidth) return false;
    try { b.tint = sample(img).join(','); save(); return true; }
    catch (e) { return false; } // tainted canvas: keep the hashed hue
  }

  /* =======================================================
     Adding a book
     ======================================================= */
  function addBook(rec, source) {
    var dup = rec.isbn13 && findByIsbn(rec.isbn13);
    if (dup && !dup.pending) { toast('Already on your shelf', 'ok'); openBook(dup.id); return dup; }

    var b = dup || { id: uid(), status: 'want', addedAt: Date.now(), source: source || 'manual' };
    Object.assign(b, {
      isbn13: rec.isbn13 || null,
      isbn10: rec.isbn10 || null,
      olKey: rec.olKey || null,
      olUrl: rec.olUrl || null,
      title: rec.title || 'Untitled',
      subtitle: rec.subtitle || '',
      authors: rec.authors || [],
      publisher: rec.publisher || '',
      publishDate: rec.publishDate || '',
      year: rec.year || null,
      pages: rec.pages || null,
      format: rec.format || '',
      subjects: rec.subjects || [],
      description: rec.description || '',
      cover: rec.cover || null,
      pending: false
    });
    if (!dup) shelf.push(b);
    save();
    buzz(24);
    return b;
  }

  /** Offline: keep the number, fetch the record later. */
  function queueIsbn(c, source) {
    var b = findByIsbn(c.isbn13);
    if (b) return b;
    b = {
      id: uid(), isbn13: c.isbn13, isbn10: c.isbn10 || null,
      title: 'ISBN ' + window.API.pretty(c.isbn13), authors: [], subjects: [],
      status: 'want', addedAt: Date.now(), source: source || 'barcode', pending: true
    };
    shelf.push(b);
    save();
    buzz(24);
    return b;
  }

  var resolving = false;
  function resolvePending() {
    if (resolving || !navigator.onLine) return Promise.resolve();
    var list = shelf.filter(function (b) { return b.pending; });
    if (!list.length) return Promise.resolve();
    resolving = true;
    var done = 0;
    return list.reduce(function (p, b) {
      return p.then(function () {
        return window.API.byIsbn(b.isbn13, b.isbn10).then(function (rec) {
          if (rec) { addBook(Object.assign(rec, { isbn13: b.isbn13 }), b.source); done++; }
          else { b.title = 'No record for ' + window.API.pretty(b.isbn13); b.pending = false; b.noRecord = true; save(); }
        }).catch(function () { /* still offline or slow: try next time */ });
      });
    }, Promise.resolve()).then(function () {
      resolving = false;
      if (done) {
        toast('Filed ' + done + (done === 1 ? ' book' : ' books') + ' from your offline scans', 'ok');
        if (current === 'library') renderShelf();
        if (current === 'stats') renderStats();
      }
    });
  }

  /* ---- ISBN pipeline ---- */
  function handleIsbn(raw, source) {
    var c = window.API.classify(raw);
    if (!c.ok) { lockFail(c.reason); return Promise.resolve(); }

    var dup = findByIsbn(c.isbn13);
    if (dup && !dup.pending) { lockOk(); toast('Already on your shelf', 'ok'); openBook(dup.id); return Promise.resolve(); }

    lockOk();
    if (!navigator.onLine) {
      var q = queueIsbn(c, source);
      flash();
      openBook(q.id);
      return Promise.resolve();
    }

    busy(true, 'Reading the catalogue…');
    return window.API.byIsbn(c.isbn13, c.isbn10).then(function (rec) {
      busy(false);
      if (!rec) {
        toast('Open Library has no record for ' + window.API.pretty(c.isbn13), 'bad');
        resumeScan();
        return;
      }
      var b = addBook(Object.assign(rec, { isbn13: c.isbn13 }), source);
      flash();
      openBook(b.id);
    }).catch(function (e) {
      busy(false);
      if (e && (e.offline || e.status === 503 || /Failed to fetch|NetworkError/i.test(e.message || ''))) {
        var q = queueIsbn(c, source);
        toast('No connection. Saved — I will fetch it when you are back online.');
        openBook(q.id);
        return;
      }
      toast(window.API.explain(e), 'bad');
      resumeScan();
    });
  }

  /* =======================================================
     Scanner view
     ======================================================= */
  var mode = 'barcode', scanning = false, hitLock = false;

  function enterScan() {
    $('#cam-err').hidden = true;
    setMode(mode, true);
  }
  function leaveScan() {
    scanning = false;
    window.Scanner.stop();
    $('#btn-torch').hidden = true;
    $('#btn-torch').setAttribute('aria-pressed', 'false');
    $('#engine').hidden = true;
  }
  function resumeScan() {
    hitLock = false;
    $('#reticle').classList.remove('is-lock');
    if (current === 'scan' && !scanning) setMode(mode, true);
  }
  function overlayOpen() {
    return !$('#sheet').hidden || !$('#manual').hidden || !$('#confirm').hidden || !$('#getapp').hidden || !$('#lookup').hidden;
  }

  function setMode(m, force) {
    if (m === mode && scanning && !force) return;
    mode = m;
    $('.modeswitch').dataset.mode = m;
    $$('.modeswitch__opt').forEach(function (b) {
      var on = b.dataset.mode === m;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    $('#reticle').classList.toggle('is-cover', m === 'cover');
    $('#btn-shutter').hidden = m !== 'cover';
    $('#mode-note').textContent = m === 'barcode'
      ? 'Exact edition, every time. Flip the book over.'
      : 'For books with no barcode. Slower, and it can misread.';
    $('#cam-hint').textContent = hintFor(m);

    if (current !== 'scan') return;
    scanning = true;
    hitLock = false;
    $('#reticle').classList.remove('is-lock');
    $('#cam-err').hidden = true;
    $('#cam').classList.remove('is-err');

    var opts = {
      video: $('#cam-video'),
      mount: $('#cam-mount'),
      onReady: function (info) {
        $('#btn-torch').hidden = !info.torch;
        showEngine(info.engine);
      },
      onError: camError
    };

    if (m === 'barcode') {
      opts.onHit = function (text) {
        if (hitLock) return;
        hitLock = true;
        handleIsbn(text, 'barcode');
      };
      window.Scanner.startBarcode(opts);
    } else {
      window.Scanner.startCover(opts);
    }
  }

  function hintFor(m) {
    if (m === 'barcode') return navigator.onLine ? 'Hold the barcode inside the frame' : 'Offline: scans are kept and filed later';
    return 'Fill the frame with the cover, then tap the button';
  }

  function showEngine(engine) {
    var el = $('#engine');
    var label = { native: 'On-device engine', zxing: 'Web engine', camera: 'Cover reader' }[engine] || '';
    if (!navigator.onLine) { label = 'Offline · saving scans'; el.classList.add('engine--offline'); }
    else el.classList.remove('engine--offline');
    el.textContent = label;
    el.hidden = !label;
  }

  function camError(d) {
    scanning = false;
    $('#cam').classList.add('is-err');
    $('#cam-err').hidden = false;
    $('#cam-err-title').textContent = d.title;
    $('#cam-err-msg').textContent = d.msg;
    $('#engine').hidden = true;
  }

  function lockOk() {
    var r = $('#reticle');
    r.classList.remove('is-lock');
    void r.offsetWidth;
    r.classList.add('is-lock');
    $('#cam-hint').textContent = 'Got it';
    buzz([12, 40, 22]);
  }
  function lockFail(reason) {
    hitLock = false;
    $('#cam-hint').textContent = reason;
    setTimeout(function () {
      if (current === 'scan') $('#cam-hint').textContent = hintFor(mode);
    }, 2600);
  }

  /* ---- cover capture ---- */
  function shoot() {
    if (hitLock) return;
    hitLock = true;
    flash();
    busy(true, 'Getting the text reader ready', 0);

    window.Scanner.readCover($('#cam-video'), $('#cam-grab'), function (msg, pct) {
      busy(true, msg + '…', pct);
    }).then(function (out) {
      if (!out.query || out.query.length < 4) {
        busy(false);
        toast('No readable text. More light, less angle, hold steady.', 'bad');
        resumeScan();
        return;
      }
      busy(true, 'Matching “' + out.query.slice(0, 40) + '”…');
      return window.API.search(out.query, 6).then(function (hits) {
        busy(false);
        if (!hits.length) {
          toast('Nothing matched that cover. Try the barcode.', 'bad');
          resumeScan();
          return;
        }
        pickCandidate(hits, out.query);
      });
    }).catch(function (e) {
      busy(false);
      var m = (e && e.message) || '';
      if (/offline|Failed to fetch|NetworkError/i.test(m) || e.offline) {
        toast(navigator.onLine ? 'The text reader could not load. Try again.' : 'Cover reading needs a connection. Use the barcode while offline.', 'bad');
      } else if (/no_frame/.test(m)) {
        toast('The camera has not started yet. Try again.', 'bad');
      } else {
        toast('Could not read that cover.', 'bad');
      }
      resumeScan();
    });
  }

  /** OCR is a guess, so the user confirms which book it found. */
  function pickCandidate(hits, q) {
    var body = $('#sheet-body');
    body.innerHTML =
      '<h3 class="sheet__h">Which one is it?</h3>' +
      '<p class="sheet__p">Read from the cover as “' + esc(q) + '”. Pick the right edition, or close and use the barcode for an exact match.</p>' +
      '<div class="det__acts" style="margin-top:1.25rem">' +
      hits.map(function (h, i) {
        return '<button class="linkrow linkrow--pick" data-pick="' + i + '">' +
          '<span class="pick__cov">' + (h.cover ? '<img src="' + esc(h.cover) + '" alt="" loading="lazy">' : '') + '</span>' +
          '<span><b>' + esc(h.title) + '</b>' +
          '<small>' + esc((h.authors[0] || 'Unknown')) + (h.year ? ' · ' + h.year : '') + '</small></span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>';
      }).join('') + '</div>';

    $$('img', body).forEach(function (img) { img.addEventListener('error', function () { this.remove(); }, { once: true }); });

    body.onclick = function (e) {
      var t = e.target.closest('[data-pick]');
      if (!t) return;
      var hit = hits[+t.dataset.pick];
      $('#sheet').hidden = true;   // close without resuming the camera:
      body.onclick = null;         // a lookup is about to run
      busy(true, 'Fetching the full record…');
      window.API.hydrate(hit).then(function (rec) {
        busy(false);
        openBook(addBook(rec, 'cover').id);
      }).catch(function () {
        busy(false);
        openBook(addBook(hit, 'cover').id);
      });
    };
    openSheet('sheet');
  }

  /* =======================================================
     Sheets
     ======================================================= */
  var lastFocus = null;
  function openSheet(id) {
    var el = $('#' + id);
    lastFocus = document.activeElement;
    el.hidden = false;
    var panel = $('.sheet__panel', el);
    if (panel) { panel.scrollTop = 0; setTimeout(function () { panel.focus({ preventScroll: true }); }, 30); }
  }
  function closeSheet(id) {
    var el = $('#' + id);
    if (el.hidden) return;
    el.hidden = true;
    if (id === 'sheet') { $('#sheet-body').onclick = null; resumeScan(); }
    if (id === 'confirm') confirmCb = null;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
  }

  /* =======================================================
     Book detail sheet
     ======================================================= */
  function openBook(id) {
    var b = byId(id);
    if (!b) return;
    var body = $('#sheet-body');

    var meta = [b.publisher, b.publishDate, b.format].filter(Boolean).map(esc).join(' · ');
    if (b.isbn13) meta += (meta ? '<br>' : '') + 'ISBN ' + esc(window.API.pretty(b.isbn13));
    var blurb = b.pending ? '' : b.description
      ? '<p class="blurb is-clamped" id="blurb">' + esc(b.description) + '</p>' +
        (b.description.length > 340 ? '<button class="more" id="more">Read more</button>' : '')
      : '<p class="blurb" style="color:var(--muted);font-style:italic">Open Library has no blurb for this edition.</p>';

    body.innerHTML =
      '<div class="det__glow" id="glow"' + (b.tint ? ' style="--tint:rgb(' + esc(b.tint) + ')"' : '') + '></div>' +
      '<div class="det__head">' +
        '<div class="det__cov" id="detcov">' + plate(b) +
          (b.cover ? '<img id="detimg" src="' + esc(b.cover) + '" alt="Cover of ' + esc(b.title) + '" crossorigin="anonymous">' : '') + '</div>' +
        '<div class="det__meta">' +
          '<h3 class="det__t">' + esc(b.title) + '</h3>' +
          (b.subtitle ? '<p class="det__pub" style="margin-bottom:.5rem">' + esc(b.subtitle) + '</p>' : '') +
          '<p class="det__a">' + esc((b.authors || []).join(', ') || (b.pending ? 'Record pending' : 'Unknown author')) + '</p>' +
          '<p class="det__pub">' + (meta || 'No publication details') + '</p>' +
        '</div>' +
      '</div>' +

      (b.pending
        ? '<div class="det__pending"><i></i><span>' + (navigator.onLine
            ? 'Looking this one up now.'
            : 'Saved. The full record arrives the moment you are back online.') + '</span></div>'
        : '<div class="facts">' +
            '<div><b>' + (b.pages || '—') + '</b><small>pages</small></div>' +
            '<div><b>' + (b.year || '—') + '</b><small>published</small></div>' +
            '<div><b style="font-size:1.05rem">' + since(b.addedAt) + '</b><small>on your shelf</small></div>' +
          '</div>') +

      '<div class="status" role="group" aria-label="Reading status">' +
        ['want', 'reading', 'read'].map(function (s) {
          return '<button data-status="' + s + '" class="' + (b.status === s ? 'is-on' : '') + '" aria-pressed="' + (b.status === s) + '">' +
            { want: 'To read', reading: 'Reading', read: 'Finished' }[s] + '</button>';
        }).join('') +
      '</div>' +

      blurb +

      (b.subjects && b.subjects.length
        ? '<div class="tags">' + b.subjects.slice(0, 8).map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div>'
        : '') +

      '<div class="det__acts">' +
        (b.pending && navigator.onLine ? '<button class="linkrow" id="retry-pending">Try the lookup again' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/></svg></button>' : '') +
        (b.olUrl ? '<a class="linkrow" href="' + esc(b.olUrl) + '" target="_blank" rel="noopener">Open the catalogue record' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>' : '') +
        '<button class="linkrow danger" data-remove="' + esc(b.id) + '">Remove from shelf</button>' +
      '</div>';

    body.onclick = function (e) {
      var st = e.target.closest('[data-status]');
      if (st) {
        b.status = st.dataset.status;
        save();
        $$('[data-status]', body).forEach(function (x) {
          x.classList.toggle('is-on', x === st);
          x.setAttribute('aria-pressed', x === st ? 'true' : 'false');
        });
        buzz(14);
        return;
      }
      if (e.target.id === 'more') {
        $('#blurb').classList.remove('is-clamped');
        e.target.remove();
        return;
      }
      if (e.target.closest('#retry-pending')) {
        closeSheet('sheet');
        busy(true, 'Reading the catalogue…');
        resolvePending().then(function () {
          busy(false);
          var nb = byId(id);
          if (nb && nb.pending) toast('Still no answer from Open Library. Try again later.', 'bad');
          else if (nb) openBook(nb.id);
        });
        return;
      }
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        shelf = shelf.filter(function (x) { return x.id !== rm.dataset.remove; });
        save();
        closeSheet('sheet');
        if (current === 'library') renderShelf();
        toast('Removed');
      }
    };

    var di = $('#detimg');
    if (di) {
      di.addEventListener('error', onCoverError, { once: true });
      tint(di, $('#glow'), b);
    }
    tilt($('#detcov'));
    openSheet('sheet');
  }

  /** Light the sheet with the book's own colour. */
  function tint(img, glow, b) {
    if (!img || !glow) return;
    function run() {
      if (learnTint(img, b) || b.tint) glow.style.setProperty('--tint', 'rgb(' + b.tint + ')');
    }
    if (img.complete && img.naturalWidth) run();
    else img.addEventListener('load', run, { once: true });
  }

  /** A little 3D on the cover as the thumb moves over it. */
  function tilt(el) {
    if (!el || motionOff()) return;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg');
      el.style.setProperty('--rx', (-y * 16).toFixed(1) + 'deg');
    });
    el.addEventListener('pointerleave', function () { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
  }

  /* =======================================================
     Stats
     ======================================================= */
  function renderStats() {
    var el = $('#stats-body');
    var real = shelf.filter(function (b) { return !b.pending; });
    if (!real.length) {
      el.innerHTML = '<div class="empty is-on"><div class="empty__shelf" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h3>Nothing to measure yet</h3>' +
        '<p>Numbers appear once there are books on the shelf.</p>' +
        '<button class="btn btn--primary" data-go="scan">Scan a book</button></div>';
      return;
    }

    var read = real.filter(function (b) { return b.status === 'read'; });
    var pagesRead = read.reduce(function (a, b) { return a + (b.pages || 0); }, 0);
    var pagesAll = real.reduce(function (a, b) { return a + (b.pages || 0); }, 0);
    var authors = {}, subjects = {}, decades = {};

    real.forEach(function (b) {
      (b.authors || []).slice(0, 1).forEach(function (a) { authors[a] = (authors[a] || 0) + 1; });
      (b.subjects || []).slice(0, 4).forEach(function (s) {
        var k = s.replace(/\s*\(.*\)$/, '').trim();
        if (k.length > 2 && k.length < 30) subjects[k] = (subjects[k] || 0) + 1;
      });
      if (b.year) { var d = Math.floor(b.year / 10) * 10; decades[d] = (decades[d] || 0) + 1; }
    });

    var counts = {
      read: read.length,
      reading: real.filter(function (b) { return b.status === 'reading'; }).length,
      want: real.filter(function (b) { return b.status === 'want'; }).length
    };

    el.innerHTML =
      '<div class="statgrid">' +
        stat(real.length, real.length === 1 ? 'book on the shelf' : 'books on the shelf', 0) +
        stat(counts.read, 'finished', 1) +
        stat(pagesRead, 'pages read', 2) +
        stat(Object.keys(authors).length, Object.keys(authors).length === 1 ? 'author' : 'authors', 3) +
      '</div>' +
      '<section class="block"><h3>Where things stand</h3>' + donut(counts) + '</section>' +
      block('Most shelved authors', bars(authors, 5)) +
      block('What you read about', bars(subjects, 6)) +
      block('By decade of publication', bars(decades, 6, true)) +
      '<p class="fineprint">Page totals only count books where Open Library records a page count. ' +
      (pagesAll ? '' : 'None of yours do yet.') + '</p>';

    countUp(el);
  }

  function stat(v, l, i) { return '<div class="stat" style="--i:' + i + '"><b data-count="' + v + '">' + (motionOff() ? v.toLocaleString() : '0') + '</b><small>' + l + '</small></div>'; }
  function block(h, inner) { return inner ? '<section class="block"><h3>' + h + '</h3>' + inner + '</section>' : ''; }

  function countUp(root) {
    if (motionOff()) return;
    $$('[data-count]', root).forEach(function (el) {
      var target = +el.dataset.count, t0 = performance.now(), dur = 900;
      (function tick(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * e).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  function bars(map, top, numericKey) {
    var rows = Object.keys(map).map(function (k) { return [k, map[k]]; });
    if (!rows.length) return '';
    rows.sort(function (a, b) {
      if (numericKey) return +a[0] - +b[0];
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
    rows = numericKey ? rows.slice(-top) : rows.slice(0, top);
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    return '<div class="bars">' + rows.map(function (r, i) {
      var label = numericKey ? r[0] + 's' : r[0];
      return '<div class="bar"><span class="bar__k" title="' + esc(label) + '">' + esc(label) + '</span>' +
        '<span class="bar__t"><span class="bar__f" style="width:' + Math.round(r[1] / max * 100) + '%;animation-delay:' + (i * 60) + 'ms"></span></span>' +
        '<span class="bar__v">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function donut(c) {
    var total = c.read + c.reading + c.want || 1;
    var segs = [
      ['Finished', c.read, '#2E9E8F'],
      ['Reading', c.reading, '#D9A441'],
      ['To read', c.want, '#4A5384']
    ];
    var C = 2 * Math.PI * 52, off = 0;
    var arcs = segs.map(function (s) {
      var len = s[1] / total * C;
      var a = '<circle class="arc" cx="66" cy="66" r="52" fill="none" stroke="' + s[2] + '" stroke-width="16" ' +
        'style="--len:' + len.toFixed(2) + ';--rest:' + (C - len).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 66 66)"></circle>';
      off += len;
      return a;
    }).join('');

    return '<div class="donut"><svg viewBox="0 0 132 132" role="img" aria-label="' +
      segs.map(function (s) { return s[1] + ' ' + s[0].toLowerCase(); }).join(', ') + '">' +
      '<circle cx="66" cy="66" r="52" fill="none" stroke="rgba(241,235,220,.07)" stroke-width="16"></circle>' +
      arcs + '</svg><div class="donut__legend">' +
      segs.map(function (s) {
        return '<div><i style="background:' + s[2] + '"></i><span><b>' + s[1] + '</b> <small>' + s[0] + '</small></span></div>';
      }).join('') + '</div></div>';
  }

  /* =======================================================
     Settings
     ======================================================= */
  var installEvt = null;

  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function syncSettings() {
    $('#set-haptics').checked = !!settings.haptics;
    $('#set-motion').checked = !settings.motion;
    $('#ver').textContent = 'Spine ' + VERSION + (isStandalone() ? ' · installed' : '') +
      (window.Scanner && 'BarcodeDetector' in window ? ' · on-device barcode engine' : '');
    $('#set-install').hidden = !installEvt;
    $('#ios-hint').hidden = !(isIOS() && !isStandalone());
    var warmed = !!localStorage.getItem(KEY_WARM);
    $('#set-offline').classList.toggle('is-done', warmed);
    $('#set-offline-sub').textContent = warmed
      ? 'Engines are stored on this device. Tap to refresh them.'
      : 'Downloads the scan engines once, so scanning works without a signal';
  }

  function prepareOffline() {
    if (!navigator.onLine) { toast('Connect to the internet first.', 'bad'); return; }
    busy(true, 'Fetching the barcode engine…', 0.02);
    window.Scanner.warm(function (msg, pct) { busy(true, msg + '…', pct); }).then(function () {
      busy(false);
      localStorage.setItem(KEY_WARM, String(Date.now()));
      syncSettings();
      toast('Ready. Barcode and cover scanning now work offline.', 'ok');
    }).catch(function () {
      busy(false);
      toast('Could not fetch the engines. Try again on a better connection.', 'bad');
    });
  }

  function exportShelf() {
    var data = JSON.stringify({ app: 'spine', version: VERSION, exported: new Date().toISOString(), books: shelf }, null, 2);
    var name = 'spine-shelf-' + new Date().toISOString().slice(0, 10) + '.json';
    var blob = new Blob([data], { type: 'application/json' });
    var file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) {}

    // Three routes out, because a wrapped WebView often blocks the first two.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Spine shelf' })
        .catch(function (e) { if (!/abort/i.test(e && e.name)) anchorDownload(blob, name, data); });
      return;
    }
    anchorDownload(blob, name, data);
  }

  function anchorDownload(blob, name, text) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Exported ' + shelf.length + ' books');
    } catch (e) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { toast('Download blocked — copied to your clipboard instead'); });
      } else { toast('Export is blocked in this app view.', 'bad'); }
    }
  }

  function importShelf(file) {
    if (file.size > 12 * 1024 * 1024) { toast('That file is too large to be a Spine export.', 'bad'); return; }
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        var incoming = Array.isArray(j) ? j : j.books;
        if (!Array.isArray(incoming)) throw new Error();
        var have = {}, added = 0;
        shelf.forEach(function (b) { if (b.isbn13) have[b.isbn13] = 1; });
        incoming.forEach(function (b) {
          if (!b || typeof b !== 'object' || !b.title) return;
          if (b.isbn13 && have[b.isbn13]) return;
          if (b.isbn13) have[b.isbn13] = 1;
          var clean = {
            id: uid(),
            isbn13: typeof b.isbn13 === 'string' ? b.isbn13 : null,
            isbn10: typeof b.isbn10 === 'string' ? b.isbn10 : null,
            olKey: typeof b.olKey === 'string' ? b.olKey : null,
            olUrl: typeof b.olUrl === 'string' && /^https:\/\/openlibrary\.org\//.test(b.olUrl) ? b.olUrl : null,
            title: String(b.title).slice(0, 300),
            subtitle: String(b.subtitle || '').slice(0, 300),
            authors: Array.isArray(b.authors) ? b.authors.map(String).slice(0, 10) : [],
            publisher: String(b.publisher || '').slice(0, 200),
            publishDate: String(b.publishDate || '').slice(0, 40),
            year: typeof b.year === 'number' ? b.year : null,
            pages: typeof b.pages === 'number' ? b.pages : null,
            format: String(b.format || '').slice(0, 60),
            subjects: Array.isArray(b.subjects) ? b.subjects.map(String).slice(0, 12) : [],
            description: String(b.description || '').slice(0, 6000),
            cover: typeof b.cover === 'string' && /^https:\/\/covers\.openlibrary\.org\//.test(b.cover) ? b.cover : null,
            tint: typeof b.tint === 'string' && /^\d+,\d+,\d+$/.test(b.tint) ? b.tint : null,
            status: ['want', 'reading', 'read'].indexOf(b.status) > -1 ? b.status : 'want',
            addedAt: typeof b.addedAt === 'number' ? b.addedAt : Date.now(),
            source: 'import',
            pending: !!b.pending && !!b.isbn13
          };
          shelf.push(clean); added++;
        });
        save();
        if (current === 'library') renderShelf();
        toast(added ? 'Added ' + added + (added === 1 ? ' book' : ' books') : 'Everything in that file was already here');
        resolvePending();
      } catch (e) { toast('That file is not a Spine export.', 'bad'); }
    };
    r.readAsText(file);
  }

  /* =======================================================
     Get the app: QR code + links per platform
     ======================================================= */
  var qrOs = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';

  function drawQr(canvas, text) {
    if (!window.qrcode) return;
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    var n = q.getModuleCount(), quiet = 2, cells = n + quiet * 2;
    var scale = 4;
    canvas.width = cells * scale; canvas.height = cells * scale;
    var x = canvas.getContext('2d');
    x.fillStyle = '#F1EBDC'; x.fillRect(0, 0, canvas.width, canvas.height);
    x.fillStyle = '#0C1020';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (q.isDark(r, c)) x.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }

  function bare(u) { return u.replace(/^https:\/\//, ''); }

  function renderGetApp() {
    var isIos = qrOs === 'ios';
    var url = isIos ? SHARE.site : SHARE.apk;
    $('.seg').dataset.os = qrOs;
    $$('.seg__opt').forEach(function (b) {
      var on = b.dataset.os === qrOs;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    drawQr($('#qr'), url);
    $('#qr').setAttribute('aria-label', 'QR code for ' + url);
    $('#qr-cap').textContent = bare(url);
    $('#qr-link').href = url;
    $('#qr-link').textContent = isIos ? 'Open the site' : 'Download APK';
    $('#qr-steps').innerHTML = isIos
      ? '<li>Scan the code, or open the link <b>in Safari</b>. Other browsers cannot install.</li>' +
        '<li>Tap <b>Share</b> (the square with an arrow).</li>' +
        '<li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>' +
        '<li>Launch Spine from the home screen and allow the camera when asked.</li>'
      : '<li>Scan the code, or open the link on the Android phone.</li>' +
        '<li>Download <b>spine.apk</b>. If asked, allow installs from this source.</li>' +
        '<li>Open it and tap <b>Install</b>, then allow the camera on first scan.</li>' +
        '<li>Prefer no download? Open <b>' + esc(bare(SHARE.site)) + '</b> in Chrome and choose <b>Install app</b> from the menu.</li>';
  }

  /* =======================================================
     Network state
     ======================================================= */
  var netT;
  function netChanged() {
    var el = $('#net');
    clearTimeout(netT);
    document.body.classList.toggle('is-offline', !navigator.onLine);
    if (!navigator.onLine) {
      el.className = 'net';
      el.lastElementChild.textContent = 'Offline — scans are saved for later';
      el.hidden = false;
    } else {
      var had = !el.hidden && !el.classList.contains('net--back');
      if (had) {
        el.className = 'net net--back';
        el.lastElementChild.textContent = 'Back online';
        netT = setTimeout(function () { el.hidden = true; }, 2200);
      } else el.hidden = true;
      resolvePending();
    }
    if (current === 'scan') { $('#cam-hint').textContent = hintFor(mode); showEngine(window.Scanner.engine()); }
    if (current === 'library') renderShelf();
  }

  /* =======================================================
     Wiring
     ======================================================= */
  function init() {
    load();
    dressIntro();
    showIntro();                          // must precede mountDust: the
    dust = window.Pixel.mountDust($('#dust'));   // canvas has no size until laid out

    // Manifest shortcut and deep links land straight on the scanner.
    var want = new URLSearchParams(location.search).get('go');
    if (want === 'scan' && localStorage.getItem(KEY_TOUR)) go('scan');

    $('#intro-start').onclick = function () {
      if (!localStorage.getItem(KEY_TOUR)) showTutorial();
      else pageTurn(function () { go(shelf.length ? 'library' : 'scan'); });
    };
    $('#intro-tour').onclick = showTutorial;
    $('#tut-skip').onclick = endTour;
    $('#tut-next').onclick = function () {
      if (tourStep < STEPS.length - 1) { tourStep++; paintStep(); } else endTour();
    };
    $('#tut-stage').parentNode.addEventListener('pointermove', function (e) { if (tour) tour.lookAt(e.clientX, e.clientY); });

    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]');
      if (g) { go(g.dataset.go); return; }
      var o = e.target.closest('[data-open]');
      if (o) { openSheet(o.dataset.open); if (o.dataset.open === 'manual') setTimeout(function () { $('#manual-input').focus(); }, 260); return; }
      var c = e.target.closest('[data-close]');
      if (c) { closeSheet(c.dataset.close); return; }
      var bk = e.target.closest('.bk, .sp');
      if (bk) openBook(bk.dataset.id);
    });

    $('#confirm-ok').onclick = function () {
      var cb = confirmCb;
      closeSheet('confirm');
      if (cb) cb();
    };

    // Library controls
    $('#lib-filters').onclick = function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      filter = b.dataset.status;
      $$('.chip').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderShelf();
    };
    $('#lib-search-toggle').onclick = function () {
      var w = $('#searchwrap');
      w.hidden = !w.hidden;
      this.setAttribute('aria-pressed', w.hidden ? 'false' : 'true');
      if (!w.hidden) $('#lib-search').focus();
      else { query = ''; $('#lib-search').value = ''; renderShelf(); }
    };
    $('#lib-search').oninput = function (e) { query = e.target.value.trim().toLowerCase(); renderShelf(); };
    $('#lib-view').onclick = function () {
      settings.view = settings.view === 'spines' ? 'grid' : 'spines';
      saveSettings();
      renderShelf();
      buzz(10);
    };

    // Scanner controls
    $$('.modeswitch__opt').forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });
    $('#btn-shutter').onclick = shoot;
    $('#cam-retry').onclick = function () { setMode(mode, true); };
    $('#btn-torch').onclick = function () {
      var on = this.getAttribute('aria-pressed') === 'true';
      window.Scanner.torch(!on);
      this.setAttribute('aria-pressed', on ? 'false' : 'true');
    };

    // Manual ISBN
    $('#manual-go').onclick = function () {
      var v = $('#manual-input').value;
      var c = window.API.classify(v);
      var err = $('#manual-err');
      if (!c.ok) { err.textContent = c.reason; err.hidden = false; return; }
      err.hidden = true;
      closeSheet('manual');
      $('#manual-input').value = '';
      handleIsbn(v, 'manual');
    };
    $('#manual-input').onkeydown = function (e) { if (e.key === 'Enter') $('#manual-go').click(); };
    $('#manual-input').oninput = function () { $('#manual-err').hidden = true; };

    // Settings
    $('#set-haptics').onchange = function () { settings.haptics = this.checked; saveSettings(); buzz(); };
    $('#set-motion').onchange = function () {
      settings.motion = !this.checked;
      document.body.classList.toggle('no-motion', !settings.motion);
      saveSettings();
    };
    $('#set-tour').onclick = showTutorial;
    $('#set-export').onclick = exportShelf;
    $('#set-import').onclick = function () { $('#import-file').click(); };
    $('#import-file').onchange = function () { if (this.files[0]) importShelf(this.files[0]); this.value = ''; };
    $('#set-clear').onclick = function () {
      if (!shelf.length) { toast('Nothing to delete'); return; }
      ask('Delete everything?', 'All ' + shelf.length + ' books will be removed from this device. Export first if you want to keep them.', 'Delete all', function () {
        shelf = []; save(); renderShelf(); toast('Shelf cleared');
      });
    };
    $('#set-offline').onclick = prepareOffline;

    // Get the app
    function openGetApp() { renderGetApp(); openSheet('getapp'); }
    $('#intro-getapp').onclick = openGetApp;
    $('#set-getapp').onclick = openGetApp;
    $$('.seg__opt').forEach(function (b) {
      b.onclick = function () { qrOs = b.dataset.os; renderGetApp(); };
    });
    $('#qr-copy').onclick = function () {
      var url = $('#qr-link').href;
      var done = function () { toast('Link copied', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link', url); });
      else prompt('Copy this link', url);
    };

    // Install
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installEvt = e;
      $('#intro-install').hidden = false;
      if (current === 'settings') syncSettings();
    });
    function install() {
      if (!installEvt) return;
      var ev = installEvt;
      ev.prompt();
      ev.userChoice.then(function (r) {
        if (r.outcome === 'accepted') { installEvt = null; $('#intro-install').hidden = true; toast('Installed. Find Spine on your home screen.', 'ok'); }
        if (current === 'settings') syncSettings();
      });
    }
    $('#intro-install').onclick = install;
    $('#set-install').onclick = install;
    window.addEventListener('appinstalled', function () { installEvt = null; $('#intro-install').hidden = true; });

    // Camera must not stay live in the background. The page also goes
    // hidden while the permission dialog is up (Android, WebViews), so a
    // start that is still negotiating is left alone: tearing it down and
    // restarting would re-open the dialog in a loop.
    var resumeOnVisible = false;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (current === 'scan' && window.Scanner.isLive()) { leaveScan(); resumeOnVisible = true; }
      } else if (resumeOnVisible) {
        resumeOnVisible = false;
        if (current === 'scan' && !overlayOpen() && !scanning) setMode(mode, true);
      }
    });
    window.addEventListener('pagehide', leaveScan);

    window.addEventListener('online', netChanged);
    window.addEventListener('offline', netChanged);
    if (!navigator.onLine) netChanged();
    else setTimeout(resolvePending, 1200);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#confirm').hidden) closeSheet('confirm');
      else if (!$('#getapp').hidden) closeSheet('getapp');
      else if (!$('#sheet').hidden) closeSheet('sheet');
      else if (!$('#manual').hidden) closeSheet('manual');
    });

    // Service worker: register, and offer a reload when a new build lands.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').then(function (reg) {
          function watch(w) {
            w.addEventListener('statechange', function () {
              if (w.state === 'installed' && navigator.serviceWorker.controller) $('#update').hidden = false;
            });
          }
          if (reg.waiting && navigator.serviceWorker.controller) $('#update').hidden = false;
          if (reg.installing) watch(reg.installing);
          reg.addEventListener('updatefound', function () { if (reg.installing) watch(reg.installing); });
          $('#update-go').onclick = function () {
            if (reg.waiting) reg.waiting.postMessage('skipWaiting');
            location.reload();
          };
        }).catch(function () { /* iOS WKWebView without app-bound domains has no SW */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
