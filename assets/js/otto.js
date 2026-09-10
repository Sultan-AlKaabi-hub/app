/* =========================================================
   otto.js — Ask Otto: help chat with text and voice

   Three back ends, chosen by configuration:

   1. Local (default, no configuration). Otto answers from the FAQ
      in faq.js. Listening uses the browser's SpeechRecognition,
      speaking uses speechSynthesis. Works offline, no keys.

   2. ElevenLabs widget. Set ELEVENLABS.agentId and leave mode at
      'widget'. The official <elevenlabs-convai> element is mounted
      with Otto as its avatar and handles text and voice itself.
      This is the path for the embed code from the ElevenLabs
      dashboard: the agent-id in that snippet is all Spine needs.

   3. ElevenLabs client. Set mode to 'client'. Spine keeps its own
      chat sheet and drives the agent through @elevenlabs/client
      (WebSocket), so Otto's pixel face talks while the agent speaks.
      Requires a public agent, or a signed-URL endpoint of your own.

   In every mode the FAQ page stays available for reading.
   ========================================================= */
(function (global) {
  'use strict';

  var ELEVENLABS = {
    agentId: 'agent_4901m25102xae2nvb0fsy8bkmy9k',
    mode: 'widget',             // 'widget' | 'client'
    widgetSrc: 'https://unpkg.com/@elevenlabs/convai-widget-embed',
    clientSrc: 'https://cdn.jsdelivr.net/npm/@elevenlabs/client/+esm'
  };

  var KEY = 'spine.otto.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var prefs = { voice: true };
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }

  var avatar = null, fabAvatar = null, opened = false;
  var rec = null, listening = false, speaking = null;
  var conv = null, convStarting = false;

  /* ---------------- local answering ---------------- */
  var STOP = /\b(the|a|an|is|it|to|of|and|or|do|does|i|my|me|can|how|what|why|in|on|for|with|this|that|be|are|you|your|spine|app|please|does|did|not|no|yes)\b/g;
  function norm(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  function words(s) { return norm(s).replace(STOP, ' ').split(' ').filter(function (w) { return w.length > 2; }); }

  function answer(question) {
    var q = norm(question), qw = words(question);
    var best = null, bestScore = 0;
    (global.FAQ || []).forEach(function (sec) {
      sec.items.forEach(function (it) {
        var score = 0;
        (it.k || []).forEach(function (k) { if (q.indexOf(norm(k)) > -1) score += 3 + norm(k).split(' ').length; });
        var hay = words(it.q + ' ' + it.a);
        qw.forEach(function (w) {
          if (hay.indexOf(w) > -1) score += 1;
          else if (hay.some(function (h) { return h.indexOf(w) === 0 || w.indexOf(h) === 0; })) score += 0.5;
        });
        if (words(it.q).every(function (w) { return qw.indexOf(w) > -1; }) && words(it.q).length) score += 2;
        if (score > bestScore) { bestScore = score; best = it; }
      });
    });
    if (/^(hi|hello|hey|hoot|good (morning|evening|afternoon))\b/.test(q)) {
      return { text: 'Hello. Ask me anything about scanning, the camera, working offline or your shelf.', chips: starters() };
    }
    if (/\b(thanks|thank you|cheers)\b/.test(q)) return { text: 'Any time. Happy shelving.', chips: [] };
    if (best && bestScore >= 2) return { text: best.a, chips: related(best) };
    return {
      text: 'I am not sure about that one. Try a few plain words, such as "camera permission" or "offline", or pick a topic below.',
      chips: starters()
    };
  }
  function starters() {
    return ['How do I scan a book?', 'Does Spine work offline?', 'The camera does not open.', 'How do I install on iPhone?'];
  }
  function related(item) {
    var out = [];
    (global.FAQ || []).forEach(function (sec) {
      if (sec.items.indexOf(item) > -1) sec.items.forEach(function (it) { if (it !== item && out.length < 3) out.push(it.q); });
    });
    return out;
  }

  /* ---------------- questions about the user's own shelf ----------------
     Handled before the FAQ so "how many books do I have" never falls
     through to a generic answer. Everything reads window.Shelf, which
     is read-only. */
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function titleList(books, max) {
    var names = books.slice(0, max || 6).map(function (b) { return b.title + (b.author ? ' by ' + b.author.split(',')[0] : ''); });
    var rest = books.length - names.length;
    return names.join('; ') + (rest > 0 ? '; and ' + plural(rest, 'more', 'more') : '');
  }

  function describeBook(b, aspect) {
    var who = b.author || 'an unknown author';
    switch (aspect) {
      case 'author': return b.author ? (b.title + ' is by ' + b.author + '.') : ('Open Library lists no author for ' + b.title + '.');
      case 'year':
        if (b.firstPublished && b.year && b.firstPublished !== b.year) return b.title + ' first came out in ' + b.firstPublished + '. Your edition is from ' + b.year + (b.publisher ? ', published by ' + b.publisher : '') + '.';
        var y = b.firstPublished || b.year;
        return y ? (b.title + ' was published in ' + y + (b.publisher ? ' by ' + b.publisher : '') + '.') : ('I have no publication year for ' + b.title + '.');
      case 'pages': return b.pages ? (b.title + ' has ' + b.pages + ' pages.') : ('Open Library has no page count for ' + b.title + '.');
      case 'publisher': return b.publisher ? (b.title + ' was published by ' + b.publisher + (b.year ? ' in ' + b.year : '') + '.') : ('I have no publisher for ' + b.title + '.');
      case 'status': return 'You have ' + b.title + ' marked as ' + b.statusLabel + '. It went on the shelf ' + (b.addedAgo === 'today' ? 'today' : b.addedAgo + ' ago') + '.';
      case 'about': return b.description ? (b.title + ': ' + b.description.slice(0, 320).replace(/\s+\S*$/, '') + '…') : ('Open Library has no blurb for ' + b.title + '. It is by ' + who + (b.year ? ', published ' + b.year : '') + '.');
      case 'subjects': return b.subjects.length ? (b.title + ' is filed under ' + b.subjects.slice(0, 5).join(', ') + '.') : ('No subjects are recorded for ' + b.title + '.');
      case 'isbn': return b.isbn13 ? (b.title + ' has ISBN ' + b.isbn13 + '.') : ('No ISBN is stored for ' + b.title + '.');
      default:
        return 'Yes, ' + b.title + ' is on your shelf, marked ' + b.statusLabel + '. By ' + who +
          ((b.firstPublished || b.year) ? ', published ' + (b.firstPublished || b.year) : '') + (b.pages ? ', ' + b.pages + ' pages' : '') + '.';
    }
  }

  var ASPECTS = [
    ['author', /\b(who (wrote|is the author|authored)|author of|written by|who made)\b/],
    ['year', /\b(when (was|did)|what year|publication year|published in|release(d)? (date|year)|how old)\b/],
    ['pages', /\b(how (many|long)|pages|page count|length)\b/],
    ['publisher', /\b(publisher|who published|published by)\b/],
    ['status', /\b(status|have i (read|finished)|did i (read|finish)|am i reading|marked as)\b/],
    ['about', /\b(what is .* about|about|summary|summar(ise|ize)|blurb|plot|describe)\b/],
    ['subjects', /\b(subject|genre|category|categories|topic)\b/],
    ['isbn', /\bisbn\b/]
  ];

  function extractTitle(q) {
    var s = q
      .replace(/\b(who (wrote|is the author of|authored)|author of|written by|when (was|did)|what year (was|did)|how many pages (does|is|in|has)|how long is|what is|what's|tell me about|do i (have|own)|is|have i (read|finished)|did i (read|finish)|about|the book|book|called|titled|publisher of|who published|summar(ise|ize)|describe|published|come out|written|get published|on my shelf|in my library|have)\b/g, ' ')
      .replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function shelfAnswer(question) {
    if (!global.Shelf) return null;
    var q = norm(question);
    var S = global.Shelf;
    var mentionsShelf = /\b(book|books|shelf|library|read|reading|finished|unread|pages|author|authors|collection)\b/.test(q);

    // ---- counts and stats
    if (/\bhow many\b/.test(q) && mentionsShelf && !/\bpages (does|is|in|has)\b/.test(q)) {
      var s = S.summary();
      if (!s.total && !s.pending) return { text: 'Your shelf is empty so far. Scan a barcode to add the first book.', chips: ['How do I scan a book?'] };
      if (/\b(finished|have i read|did i read|completed|done)\b/.test(q)) return { text: 'You have finished ' + plural(s.finished, 'book') + ' out of ' + s.total + (s.pagesRead ? ', which is ' + s.pagesRead.toLocaleString() + ' pages read' : '') + '.', chips: ['What am I reading now?', 'What is left to read?'] };
      if (/\b(left|to read|unread|still|remaining|haven t read|not read|want)\b/.test(q)) return { text: 'You have ' + plural(s.toRead, 'book') + ' still to read' + (s.reading ? ' and ' + plural(s.reading, 'book') + ' in progress' : '') + (s.pagesToRead ? ', about ' + s.pagesToRead.toLocaleString() + ' pages' : '') + '.', chips: ['What is on my to-read list?'] };
      if (/\b(reading|in progress|currently)\b/.test(q)) return { text: s.reading ? 'You are reading ' + plural(s.reading, 'book') + ' right now: ' + titleList(s.readingNow) + '.' : 'Nothing is marked as Reading at the moment.', chips: ['How many have I finished?'] };
      if (/\bauthors?\b/.test(q)) return { text: 'Your shelf has ' + plural(s.authors, 'author') + (s.topAuthors.length ? '. Most shelved: ' + s.topAuthors.join(', ') : '') + '.', chips: ['How many books do I have?'] };
      if (/\bpages\b/.test(q)) return { text: 'Across the shelf there are ' + s.pagesTotal.toLocaleString() + ' pages, of which you have read ' + s.pagesRead.toLocaleString() + '.', chips: ['How many have I finished?'] };
      return { text: 'You have ' + plural(s.total, 'book') + ' on your shelf: ' + s.finished + ' finished, ' + s.reading + ' reading and ' + s.toRead + ' to read' + (s.pending ? ', plus ' + plural(s.pending, 'scan') + ' waiting for a signal' : '') + '.', chips: ['What am I reading now?', 'What is left to read?', 'Who is my most shelved author?'] };
    }
    if (/\b(most (shelved|read|common)|favou?rite) (author|writer)\b/.test(q)) {
      var s2 = S.summary();
      return { text: s2.topAuthors.length ? 'Your most shelved author' + (s2.topAuthors.length > 1 ? 's are ' : ' is ') + s2.topAuthors.join(', ') + '.' : 'No authors on the shelf yet.', chips: ['How many books do I have?'] };
    }
    if (/\b(what|which) (do|am) i (read|reading)\b|\b(currently|now) reading\b|\breading (now|right now|at the moment)\b/.test(q)) {
      var r = S.list('reading');
      return { text: r.count ? 'You are reading ' + titleList(r.books) + '.' : 'Nothing is marked as Reading. Open a book and tap Reading to track it.', chips: ['What is left to read?'] };
    }
    if (/\b(to[- ]read|left to read|unread|haven t read|not read yet|next|queue)\b/.test(q) && /\b(what|which|list|show|left)\b/.test(q)) {
      var w = S.list('want');
      return { text: w.count ? plural(w.count, 'book') + ' to read: ' + titleList(w.books, 8) + '.' : 'Your to-read list is empty.', chips: ['What have I finished?'] };
    }
    if (/\b(what|which) (have i|did i) (read|finish)|\bfinished books\b|\blist .*finished\b/.test(q)) {
      var f = S.list('read');
      return { text: f.count ? 'Finished: ' + titleList(f.books, 8) + '.' : 'You have not marked any book as Finished yet.', chips: ['How many books do I have?'] };
    }
    if (/\b(what|which) books? (do i have|are on my shelf|is on my shelf|have i got|did i scan|are in my library)|\blist (my|all) books\b|\bwhat s on my shelf\b|\bwhat is on my shelf\b/.test(q)) {
      var all = S.list('all');
      return { text: all.count ? 'You have ' + plural(all.count, 'book') + '. Newest first: ' + titleList(all.books, 8) + '.' : 'Your shelf is empty so far.', chips: ['How many have I finished?'] };
    }
    if (/\b(newest|latest|last|most recent)\b.*\b(book|scan|added)\b|\bwhat did i (add|scan) last\b/.test(q)) {
      var n = S.summary().newest;
      return n ? { text: 'The newest book on the shelf is ' + n.title + (n.author ? ' by ' + n.author : '') + ', added ' + (n.addedAgo === 'today' ? 'today' : n.addedAgo + ' ago') + '.', chips: ['Tell me about ' + n.title] } : null;
    }

    // ---- a specific book
    var aspect = null;
    for (var i = 0; i < ASPECTS.length; i++) if (ASPECTS[i][1].test(q)) { aspect = ASPECTS[i][0]; break; }
    var title = extractTitle(q);
    if (title.length >= 2) {
      var hits = S.find(title, 3);
      if (hits.length && (hits[0].score >= 55 || (aspect && hits[0].score >= 30))) {
        var b = hits[0].book;
        var more = hits.slice(1).filter(function (h) { return h.score >= 50; }).map(function (h) { return h.book.title; });
        return {
          text: describeBook(b, aspect || (/\b(do i have|is .* on my shelf|have i got|did i scan)\b/.test(q) ? 'have' : 'have')) + (more.length ? ' You also have ' + more.join(' and ') + '.' : ''),
          chips: ['Who wrote ' + b.title + '?', 'When was ' + b.title + ' published?', 'What is ' + b.title + ' about?'].filter(function (c) { return c.indexOf(aspect === 'author' ? 'Who' : aspect === 'year' ? 'When' : aspect === 'about' ? 'What is' : '\u0000') !== 0; })
        };
      }
      if (aspect || /\b(do i have|have i got|is .* on my shelf)\b/.test(q)) {
        if (!S.count()) return { text: 'Your shelf is empty, so I cannot find that one. Scan it and ask me again.', chips: ['How do I scan a book?'] };
        return { text: 'I cannot find "' + title + '" on your shelf. I only know the books you have scanned, so try the exact title, or scan it first.', chips: ['What books do I have?'] };
      }
    }
    return null;
  }

  /* ---------------- transcript ---------------- */
  function bubble(text, who) {
    var log = $('#chat-log');
    var el = document.createElement('div');
    el.className = 'msg msg--' + who;
    el.innerHTML = '<div class="msg__b">' + esc(text) + '</div>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function chips(list) {
    var host = $('#chat-chips');
    host.innerHTML = (list || []).map(function (c) { return '<button class="chip chip--q">' + esc(c) + '</button>'; }).join('');
  }
  function status(t) { $('#chat-status').textContent = t; }

  /* ---------------- browser speech ---------------- */
  function canListen() { return !!(global.SpeechRecognition || global.webkitSpeechRecognition); }
  function canSpeak() { return 'speechSynthesis' in global; }

  function pickVoice() {
    var vs = speechSynthesis.getVoices();
    var pref = ['Google UK English Male', 'Daniel', 'Google US English', 'Microsoft George', 'Samantha'];
    for (var i = 0; i < pref.length; i++) {
      var v = vs.filter(function (x) { return x.name.indexOf(pref[i]) === 0; })[0];
      if (v) return v;
    }
    return vs.filter(function (x) { return /^en/i.test(x.lang); })[0] || vs[0] || null;
  }

  function say(text) {
    if (!prefs.voice || !canSpeak()) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance(text);
    var v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.0; u.pitch = 1.1;
    u.onstart = function () { if (avatar) avatar.talking(true); status('Speaking…'); };
    u.onend = u.onerror = function () { if (avatar) avatar.talking(false); speaking = null; status(''); };
    speaking = u;
    speechSynthesis.speak(u);
  }
  function hush() {
    if (canSpeak()) { try { speechSynthesis.cancel(); } catch (e) {} }
    if (avatar) avatar.talking(false);
    speaking = null;
  }

  function startListening() {
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) { status('Voice input is not available in this browser. Type instead.'); return; }
    hush();
    rec = new SR();
    rec.lang = (navigator.language || 'en').indexOf('en') === 0 ? navigator.language : 'en-GB';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    var finalText = '';
    rec.onstart = function () { listening = true; $('#chat-mic').setAttribute('aria-pressed', 'true'); status('Listening…'); };
    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      $('#chat-input').value = finalText || interim;
    };
    rec.onerror = function (e) {
      status(e.error === 'not-allowed' ? 'Microphone permission is off. Allow it and try again.' : 'Could not hear that. Try again.');
    };
    rec.onend = function () {
      listening = false;
      $('#chat-mic').setAttribute('aria-pressed', 'false');
      if (finalText.trim()) send(finalText.trim());
      else if ($('#chat-status').textContent === 'Listening…') status('');
    };
    try { rec.start(); } catch (e) { status('Could not start the microphone.'); }
  }
  function stopListening() { if (rec) { try { rec.stop(); } catch (e) {} } }

  /* ---------------- ElevenLabs client mode ---------------- */
  function ensureConversation(voice) {
    if (conv) return Promise.resolve(conv);
    if (convStarting) return convStarting;
    status('Connecting to Otto…');
    convStarting = import(ELEVENLABS.clientSrc).then(function (mod) {
      var Conversation = mod.Conversation || (mod.default && mod.default.Conversation);
      return Conversation.startSession({
        agentId: ELEVENLABS.agentId,
        connectionType: 'websocket',
        textOnly: !voice,
        onConnect: function () { status(''); },
        onDisconnect: function () { conv = null; status(''); if (avatar) avatar.talking(false); },
        onError: function (e) { status('Connection problem: ' + (e && e.message ? e.message : e)); },
        onModeChange: function (m) {
          var mode = m && m.mode;
          if (avatar) avatar.talking(mode === 'speaking');
          status(mode === 'speaking' ? 'Speaking…' : mode === 'listening' ? 'Listening…' : '');
        },
        onMessage: function (m) {
          if (!m || !m.message) return;
          if (m.source === 'user') bubble(m.message, 'me');
          else bubble(m.message, 'otto');
        }
      });
    }).then(function (c) { conv = c; convStarting = null; return c; })
      .catch(function (e) { convStarting = null; status('Could not reach the voice agent. Answering from the FAQ instead.'); throw e; });
    return convStarting;
  }
  function endConversation() {
    if (conv) { try { conv.endSession(); } catch (e) {} conv = null; }
  }

  /* ---------------- send ---------------- */
  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    $('#chat-input').value = '';
    bubble(text, 'me');
    chips([]);
    if (ELEVENLABS.agentId && ELEVENLABS.mode === 'client') {
      ensureConversation(false).then(function (c) { c.sendUserMessage(text); }).catch(function () { localReply(text); });
      return;
    }
    localReply(text);
  }
  function localReply(text) {
    var r = shelfAnswer(text) || answer(text);
    status('');
    setTimeout(function () {
      if (avatar) avatar.hop();
      bubble(r.text, 'otto');
      chips(r.chips);
      say(r.text);
    }, 260);
  }

  /* ---------------- sheet ---------------- */
  function open() {
    var sheet = $('#chat');
    if (!sheet) return;
    sheet.hidden = false;
    if (!avatar) avatar = global.Pixel.mountAvatar($('#otto-chat-cv'), { still: document.body.classList.contains('no-motion') });
    avatar.pose('wave'); avatar.hop();
    setTimeout(function () { if (avatar) avatar.pose('idle'); }, 1400);
    $('#chat-voice').setAttribute('aria-pressed', prefs.voice ? 'true' : 'false');
    $('#chat-mic').hidden = !(canListen() || (ELEVENLABS.agentId && ELEVENLABS.mode === 'client'));
    if (!opened) {
      opened = true;
      bubble('Hoot. I am Otto. Ask me how scanning works, what happens offline, or how to fix the camera.', 'otto');
      chips(starters());
    }
    setTimeout(function () { var p = $('#chat .sheet__panel'); if (p) p.focus({ preventScroll: true }); }, 30);
  }
  function onClose() {
    hush(); stopListening(); endConversation();
    if (avatar) { avatar.stop(); avatar = null; }
  }

  /* ---------------- ElevenLabs widget mode ---------------- */
  function ottoPng() {
    var c = document.createElement('canvas');
    c.width = 112; c.height = 112;
    var src = document.createElement('canvas');
    var a = global.Pixel.mountAvatar(src, { still: true });
    return new Promise(function (res) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var x = c.getContext('2d');
          x.imageSmoothingEnabled = false;
          x.fillStyle = '#141A31'; x.fillRect(0, 0, 112, 112);
          x.drawImage(src, 0, 0, 112, 112);
          a.stop();
          res(c.toDataURL('image/png'));
        });
      });
    });
  }
  var widgetEl = null;
  function mountWidget() {
    if (widgetEl || !ELEVENLABS.agentId || ELEVENLABS.mode !== 'widget') return;
    ottoPng().then(function (png) {
      widgetEl = document.createElement('elevenlabs-convai');
      widgetEl.setAttribute('agent-id', ELEVENLABS.agentId);
      widgetEl.setAttribute('avatar-image-url', png);
      widgetEl.setAttribute('action-text', 'Ask Otto');
      widgetEl.setAttribute('start-call-text', 'Talk to Otto');
      widgetEl.setAttribute('end-call-text', 'Done');
      widgetEl.setAttribute('listening-text', 'Otto is listening');
      widgetEl.setAttribute('speaking-text', 'Otto is speaking');
      // Client tools: the agent calls these in the browser, so shelf data
      // stays on the device. Register the same three tools on the agent
      // (docs/elevenlabs-client-tools.json) or they are never invoked.
      widgetEl.addEventListener('elevenlabs-convai:call', function (e) {
        var cfg = e.detail && e.detail.config;
        if (!cfg) return;
        cfg.clientTools = Object.assign(cfg.clientTools || {}, clientTools());
        var s = global.Shelf ? global.Shelf.summary() : null;
        cfg.dynamicVariables = Object.assign(cfg.dynamicVariables || {}, s ? {
          book_count: s.total, finished_count: s.finished, reading_count: s.reading, to_read_count: s.toRead, pages_read: s.pagesRead
        } : {});
      });
      document.body.appendChild(widgetEl);
      if (!$('script[data-el-widget]')) {
        var s = document.createElement('script');
        s.src = ELEVENLABS.widgetSrc; s.async = true; s.type = 'text/javascript';
        s.setAttribute('data-el-widget', '1');
        document.head.appendChild(s);
      }
    });
  }
  function setWidgetVisible(on) {
    if (widgetEl) widgetEl.style.display = on ? '' : 'none';
  }

  function clientTools() {
    var S = global.Shelf;
    return {
      get_shelf_summary: function () {
        return JSON.stringify(S ? S.summary() : { total: 0 });
      },
      find_book: function (p) {
        var q = (p && (p.query || p.title || p.q)) || '';
        var hits = S ? S.find(q, 3) : [];
        return JSON.stringify(hits.length ? { found: true, best: hits[0].book, others: hits.slice(1).map(function (h) { return h.book; }) } : { found: false, query: q, shelf_size: S ? S.count() : 0 });
      },
      list_books: function (p) {
        var st = (p && p.status) || 'all';
        return JSON.stringify(S ? S.list(st, (p && p.limit) || 12) : { count: 0, books: [] });
      }
    };
  }

  /* ---------------- wiring ---------------- */
  function init() {
    if (!$('#chat')) return;
    var fab = $('#otto-fab');
    if (fab) {
      fabAvatar = global.Pixel.mountAvatar($('#otto-fab-cv'), { still: true });
      fab.onclick = open;
    }
    $('#chat-form').onsubmit = function (e) { e.preventDefault(); send($('#chat-input').value); };
    $('#chat-mic').onclick = function () {
      if (ELEVENLABS.agentId && ELEVENLABS.mode === 'client') {
        if (conv) { endConversation(); status(''); return; }
        ensureConversation(true).catch(function () {});
        return;
      }
      if (listening) stopListening(); else startListening();
    };
    $('#chat-voice').onclick = function () {
      prefs.voice = !prefs.voice; savePrefs();
      this.setAttribute('aria-pressed', prefs.voice ? 'true' : 'false');
      if (!prefs.voice) hush();
      if (conv && conv.setVolume) { try { conv.setVolume({ volume: prefs.voice ? 1 : 0 }); } catch (e) {} }
      status(prefs.voice ? 'Otto will read answers aloud.' : 'Otto is muted.');
      setTimeout(function () { status(''); }, 1600);
    };
    $('#chat-chips').onclick = function (e) {
      var b = e.target.closest('.chip--q'); if (b) send(b.textContent);
    };
    if (canSpeak()) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }

    // Widget mode: the ElevenLabs bubble replaces the local fab.
    if (ELEVENLABS.agentId && ELEVENLABS.mode === 'widget') {
      if (fab) fab.hidden = true;
      mountWidget();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Otto = {
    open: open,
    onClose: onClose,
    answer: answer,
    shelfAnswer: shelfAnswer,
    clientTools: clientTools,
    setWidgetVisible: setWidgetVisible,
    config: ELEVENLABS
  };
})(window);
