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

  /* ---------------------------------------------------------
     Intro scene: a procedural pixel-art library. Shelves of books
     in the app palette, a few plants and candles, lamplight, and
     loose pages drifting up through the air. Drawn once at a coarse
     cell size onto an offscreen canvas and upscaled without
     smoothing, so it is crisp and costs almost nothing per frame.
     --------------------------------------------------------- */
  function mountLibrary(canvas) {
    var ctx = canvas.getContext('2d');
    var CELL = 4, W = 0, H = 0, cw = 0, ch = 0;
    var scene = document.createElement('canvas');
    var pages = [], raf = 0, stopped = false, t0 = performance.now();
    var BOOKS = ['#8C3B2E', '#B5552F', '#2E6F6A', '#25406B', '#6E63C9', '#A87A24', '#5B6B2F', '#7A2E4E', '#C9C3B6', '#3E7A5C', '#8A5A3C', '#4A5384', '#D9A441', '#6B2F2F'];
    var seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }

    function build() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cw = Math.ceil(W / CELL); ch = Math.ceil(H / CELL);
      scene.width = cw; scene.height = ch;
      var s = scene.getContext('2d');
      seed = 7;

      // wall
      s.fillStyle = '#0E1226'; s.fillRect(0, 0, cw, ch);
      for (var i = 0; i < cw * ch * 0.02; i++) { s.fillStyle = 'rgba(241,235,220,0.03)'; s.fillRect(Math.floor(rnd() * cw), Math.floor(rnd() * ch), 1, 1); }

      // bookcase: uprights and shelf rows over the top 74% of the screen
      var rowH = 13, top = 2, bottom = Math.floor(ch * 0.74);
      var colW = 26;
      for (var x = 0; x < cw + colW; x += colW) { s.fillStyle = '#2A1C14'; s.fillRect(x, 0, 2, bottom + 2); }
      for (var y = top; y + rowH <= bottom + rowH; y += rowH) {
        var boardY = y + rowH - 2;
        // books on this row
        for (var col = 0; col < cw + colW; col += colW) {
          var x0 = col + 2, xEnd = Math.min(col + colW, cw + 2);
          var cx = x0 + 1;
          while (cx < xEnd - 1) {
            var r = rnd();
            if (r < 0.06) { cx += 2 + Math.floor(rnd() * 3); continue; }               // a gap
            if (r < 0.10 && xEnd - cx > 5) {                                            // plant
              s.fillStyle = '#6B3F2A'; s.fillRect(cx, boardY - 3, 3, 3);
              s.fillStyle = '#3E7A5C'; s.fillRect(cx - 1, boardY - 6, 5, 3); s.fillRect(cx, boardY - 7, 3, 1);
              cx += 5; continue;
            }
            if (r < 0.13 && xEnd - cx > 4) {                                            // candle
              s.fillStyle = '#F1EBDC'; s.fillRect(cx + 1, boardY - 4, 1, 4);
              s.fillStyle = '#F2B33D'; s.fillRect(cx + 1, boardY - 5, 1, 1);
              s.fillStyle = 'rgba(242,179,61,.35)'; s.fillRect(cx, boardY - 6, 3, 3);
              cx += 4; continue;
            }
            var w = 2 + Math.floor(rnd() * 3), h = 8 + Math.floor(rnd() * 4);
            if (cx + w > xEnd - 1) break;
            var c = pick(BOOKS);
            s.fillStyle = c; s.fillRect(cx, boardY - h, w, h);
            s.fillStyle = 'rgba(0,0,0,.28)'; s.fillRect(cx + w - 1, boardY - h, 1, h);   // spine shade
            s.fillStyle = 'rgba(241,235,220,.55)'; s.fillRect(cx, boardY - h + 2, w, 1); // title band
            if (rnd() < 0.5) s.fillRect(cx, boardY - 3, w, 1);
            cx += w;
          }
        }
        // shelf board
        s.fillStyle = '#5A4030'; s.fillRect(0, boardY, cw, 1);
        s.fillStyle = '#3B2A1E'; s.fillRect(0, boardY + 1, cw, 1);
        s.fillStyle = 'rgba(0,0,0,.35)'; s.fillRect(0, boardY + 2, cw, 1);
      }
      // floor line and a rug of shadow below the case
      s.fillStyle = '#1A1410'; s.fillRect(0, bottom + 2, cw, 1);

      // the room is dim; a lamp somewhere off to the left throws a cone of
      // light across the upper shelves, and the floor falls into shadow so
      // the title and buttons sit on near-black
      s.fillStyle = 'rgba(12,16,32,.42)'; s.fillRect(0, 0, cw, ch);
      var cone = s.createLinearGradient(0, 0, cw * 0.9, ch * 0.7);
      cone.addColorStop(0, 'rgba(217,164,65,.20)'); cone.addColorStop(0.45, 'rgba(217,164,65,.06)'); cone.addColorStop(1, 'rgba(217,164,65,0)');
      s.fillStyle = cone; s.fillRect(0, 0, cw, ch);
      var g = s.createRadialGradient(cw * 0.5, ch * 0.62, 2, cw * 0.5, ch * 0.62, cw * 0.55);
      g.addColorStop(0, 'rgba(217,164,65,.16)'); g.addColorStop(1, 'rgba(217,164,65,0)');
      s.fillStyle = g; s.fillRect(0, 0, cw, ch);
      var v = s.createLinearGradient(0, ch * 0.18, 0, ch);
      v.addColorStop(0, 'rgba(12,16,32,0)'); v.addColorStop(0.42, 'rgba(12,16,32,.72)'); v.addColorStop(0.62, 'rgba(12,16,32,.9)'); v.addColorStop(1, 'rgba(12,16,32,.98)');
      s.fillStyle = v; s.fillRect(0, 0, cw, ch);
      var e = s.createLinearGradient(0, 0, cw, 0);
      e.addColorStop(0, 'rgba(12,16,32,.55)'); e.addColorStop(0.35, 'rgba(12,16,32,0)'); e.addColorStop(0.65, 'rgba(12,16,32,0)'); e.addColorStop(1, 'rgba(12,16,32,.55)');
      s.fillStyle = e; s.fillRect(0, 0, cw, ch);

      // loose pages
      pages = [];
      var n = Math.round(Math.min(11, W * H / 60000));
      for (var k = 0; k < n; k++) pages.push(newPage(true));
    }
    // Pages live among the shelves, above the text; they fade in low and
    // drift up, never crossing the buttons.
    function newPage(anywhere) {
      var top = H * 0.58;
      return { x: Math.random() * W, y: anywhere ? Math.random() * top : top + 10, v: 0.12 + Math.random() * 0.22,
        ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.6, a: 0.28 + Math.random() * 0.4, big: Math.random() < 0.35 };
    }
    function paint(now, advance) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(scene, 0, 0, cw * CELL, ch * CELL);
      var t = (now - t0) / 1000;
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        if (advance) {
          p.y -= p.v; p.ph += 0.01 * p.sp; p.x += Math.sin(p.ph) * 0.35;
          if (p.y < -24) pages[i] = p = newPage(false);
        }
        // a page turning in the air: its apparent width breathes between wide and edge-on
        var flip = Math.cos(t * p.sp * 1.6 + p.ph);
        var wCells = p.big ? 4 : 3, hCells = p.big ? 5 : 4;
        var w = Math.max(1, Math.round(wCells * Math.abs(flip))) * CELL, h = hCells * CELL;
        var x = Math.round(p.x / CELL) * CELL, y = Math.round(p.y / CELL) * CELL;
        var fade = Math.max(0, Math.min(1, (H * 0.58 - p.y) / 40));   // ease in as it leaves the text zone
        ctx.globalAlpha = p.a * fade;
        ctx.fillStyle = '#F1EBDC'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(12,16,32,.35)';
        for (var l = 1; l < hCells - 1; l += 2) ctx.fillRect(x + CELL * 0.5, y + l * CELL, Math.max(0, w - CELL), 1); // faint text lines
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) { if (stopped) return; paint(now, true); raf = requestAnimationFrame(frame); }

    build();
    var still = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var onResize = function () { build(); if (still) paint(performance.now(), false); };
    global.addEventListener('resize', onResize);
    if (still) paint(performance.now(), false); else raf = requestAnimationFrame(frame);

    return {
      stop: function () { stopped = true; cancelAnimationFrame(raf); global.removeEventListener('resize', onResize); },
      pause: function () { stopped = true; cancelAnimationFrame(raf); },
      resume: function () { if (!stopped) return; stopped = false; if (!still) raf = requestAnimationFrame(frame); }
    };
  }

  global.Pixel = { mountAvatar: mountAvatar, mountDust: mountDust, mountLibrary: mountLibrary, sheets: SHEETS };
})(window);
