/* =========================================================
   pixel.js — Otto the archivist owl, and the intro dust field

   Otto is a hand-authored 24x24 sprite. He is drawn 1:1 onto a
   small canvas and upscaled by CSS with image-rendering:pixelated,
   so he is crisp at any device pixel ratio without a single image
   asset. Frames are derived from the base sheet by string edits so
   the whole character stays reviewable as ASCII.

   Frames:  idle · blink · talk · wave · book · look (pupil shift)
   Poses are named so the tutorial can direct him line by line.
   ========================================================= */
(function (global) {
  'use strict';

  var PALETTE = {
    o: '#0A0D18', // outline
    b: '#6E63C9', // plumage
    d: '#4F45A3', // plumage shade
    w: '#B4ADEB', // belly
    B: '#7C72D3', // belly chevrons
    e: '#F5F1E6', // eye white
    p: '#12141F', // pupil
    y: '#F2B33D', // beak and feet (brass)
    r: '#C0563E', // book cloth
    g: '#F0E9D6', // book pages
    k: '#8B3A2A'  // book spine shade
  };

  // 24 rows x 24 cols. '.' is transparent. Column 0 and 23 are
  // gutters so wing and hop frames never clip.
  var IDLE = [
    '........................',
    '......oo........oo......',
    '.....obbo......obbo.....',
    '.....obbbo....obbbo.....',
    '....obbbbboooobbbbbo....',
    '....obbbbbbbbbbbbbbo....',
    '...obbbbbbbbbbbbbbbbo...',
    '...obbeeeeebbbbeeeeebbo.',
    '...obeeeeeeebbeeeeeeebo.',
    '...obeeppeeebbeeeppeebo.',
    '...obeeppeeebbeeeppeebo.',
    '...obeeeeeeebbeeeeeeebo.',
    '...obbeeeeebyybeeeeebbo.',
    '...obbbbbbbbyybbbbbbbbo.',
    '...obbbwwwwwwwwwwwwbbbo.',
    '...obbwwBwwBwwBwwBwwbbo.',
    '...obbwwwwwwwwwwwwwwbbo.',
    '...obbwBwwBwwBwwBwwwbbo.',
    '...obbbwwwwwwwwwwwwbbbo.',
    '....obbbbbbbbbbbbbbbbo..',
    '.....oooobbbbbbbboooo...',
    '.......yyy......yyy.....',
    '........................',
    '........................'
  ];

  function edit(rows, fn) { return rows.map(function (r, y) { return fn(r, y) || r; }); }
  function set(row, x, ch) { return row.slice(0, x) + ch + row.slice(x + 1); }
  function splice(row, x, str) { return row.slice(0, x) + str + row.slice(x + str.length); }

  // Blink: lids close to a single dark line.
  var BLINK = edit(IDLE, function (r, y) {
    if (y === 9) return r.replace(/[ep]/g, 'o');
    if (y === 8 || y === 10 || y === 11) return r.replace(/[ep]/g, 'b');
    if (y === 7 || y === 12) return r.replace(/e/g, 'b');
  });

  // Talk: beak opens a pixel.
  var TALK = edit(IDLE, function (r, y) {
    if (y === 13) return splice(r, 12, 'oo');
    if (y === 14) return splice(r, 12, 'yy');
  });

  // Wave: right wing lifts and reaches out.
  var WAVE = edit(IDLE, function (r, y) {
    if (y >= 8 && y <= 11) return splice(r, 21, 'bbo');
    if (y === 7) return splice(r, 21, 'bbo');
    if (y === 12) return splice(r, 21, 'oo.');
    if (y >= 14 && y <= 17) return splice(r, 20, 'bo.'); // wing is up, not by the side
  });

  // Book: a red clothbound volume held against the belly.
  var BOOK = edit(IDLE, function (r, y) {
    if (y === 14) return splice(r, 6, 'oooooooooooo');
    if (y === 15) return splice(r, 6, 'orrrrrrrrrro');
    if (y === 16 || y === 17) return splice(r, 6, 'orkggggggkro');
    if (y === 18) return splice(r, 6, 'oooooooooooo');
  });

  // Pupils slide one pixel toward where the reader is.
  function look(rows, dx) {
    if (!dx) return rows;
    return edit(rows, function (r, y) {
      if (y !== 9 && y !== 10) return;
      return dx > 0 ? r.replace(/ppe/g, 'epp') : r.replace(/epp/g, 'ppe');
    });
  }

  var SHEETS = { idle: IDLE, blink: BLINK, talk: TALK, wave: WAVE, book: BOOK };

  var SIZE = 24, PAD = 2, CANVAS = SIZE + PAD * 2;

  function drawSprite(ctx, rows, ox, oy) {
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var c = PALETTE[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  /**
   * Mount Otto on a canvas. Returns a controller:
   *   pose(name)     'idle' | 'wave' | 'book'
   *   talking(bool)  beak animates while a line is being typed
   *   hop()          a small jump, used when a new line begins
   *   lookAt(x, y)   client coordinates; pupils follow
   *   stop()
   */
  function mountAvatar(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    ctx.imageSmoothingEnabled = false;

    var raf = 0, t0 = performance.now();
    var nextBlink = 1600, blinkUntil = -1;
    var pose = 'idle', talking = false, hopUntil = -1, dx = 0;
    var stopped = false, still = !!opts.still;

    function frame(now) {
      if (stopped) return;
      var t = now - t0;
      ctx.clearRect(0, 0, CANVAS, CANVAS);

      // Breathing: one pixel of vertical travel. More reads as bouncing.
      var bob = still ? 0 : (Math.sin(t / 900) > 0 ? 0 : 1);

      // Hop: a two-pixel lift with a short hang.
      var hop = 0;
      if (hopUntil > 0) {
        var left = hopUntil - now;
        if (left <= 0) hopUntil = -1;
        else hop = left > 90 ? 2 : 1;
      }

      if (!still && t > nextBlink && blinkUntil < 0) blinkUntil = t + 120;
      var blinking = blinkUntil > 0 && t < blinkUntil;
      if (blinkUntil > 0 && t >= blinkUntil) {
        blinkUntil = -1;
        nextBlink = t + 2400 + Math.random() * 3400;
      }

      var sheet;
      if (blinking) sheet = BLINK;
      else if (talking && Math.floor(now / 110) % 3 === 0) sheet = TALK;
      else sheet = SHEETS[pose] || IDLE;

      drawSprite(ctx, look(sheet, dx), PAD, PAD + bob - hop);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      pose: function (p) { pose = SHEETS[p] ? p : 'idle'; },
      talking: function (on) { talking = !!on; },
      hop: function () { hopUntil = performance.now() + 220; },
      lookAt: function (cx, cy) {
        var r = canvas.getBoundingClientRect();
        var mx = r.left + r.width / 2;
        var d = cx - mx;
        dx = d > r.width * 0.25 ? 1 : d < -r.width * 0.25 ? -1 : 0;
        void cy;
      },
      stop: function () { stopped = true; cancelAnimationFrame(raf); }
    };
  }

  /* ---------------------------------------------------------
     Intro dust: motes rising through lamplight. Sparse and
     device-scaled so a low-end phone idles cool.
     --------------------------------------------------------- */
  function mountDust(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = 0, h = 0, motes = [], raf = 0, stopped = false;

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(52, (w * h) / 11000));
      motes = [];
      for (var i = 0; i < count; i++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 1.7,
          v: 0.08 + Math.random() * 0.28,
          d: Math.random() * Math.PI * 2,
          a: 0.10 + Math.random() * 0.4
        });
      }
    }

    function paint(advance) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        if (advance) {
          m.y -= m.v;
          m.d += 0.006;
          m.x += Math.sin(m.d) * 0.22;
          if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; }
        }
        ctx.globalAlpha = m.a;
        ctx.fillStyle = '#D9A441';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function frame() {
      if (stopped) return;
      paint(true);
      raf = requestAnimationFrame(frame);
    }

    resize();
    global.addEventListener('resize', resize);

    // Reduced motion keeps the lamplight, held still.
    if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) paint(false);
    else raf = requestAnimationFrame(frame);

    return {
      stop: function () { stopped = true; cancelAnimationFrame(raf); global.removeEventListener('resize', resize); },
      pause: function () { stopped = true; cancelAnimationFrame(raf); },
      resume: function () {
        if (!stopped) return;
        stopped = false;
        if (!global.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(frame);
      }
    };
  }

  global.Pixel = { mountAvatar: mountAvatar, mountDust: mountDust, sheets: SHEETS };
})(window);
