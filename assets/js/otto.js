/* =========================================================
   otto.js — Ask Otto: a small pixel owl that expands into a chat

   The launcher is a 56px button with Otto in it. Tapping it grows
   a compact panel out of the button (bottom-right, above the tab
   bar) that never covers more than it needs to. Text and voice.

   Where answers come from, in order:
     1. The user's own shelf (window.Shelf): counts, statuses,
        details of one book, recommendations by shared subject.
        Instant, offline, nothing leaves the device.
     2. The ElevenLabs agent through @elevenlabs/client, when an
        agent id is set and the device is online. Text goes over
        a text-only WebSocket session; the microphone button opens
        a voice session in which the agent listens and speaks.
     3. The built-in FAQ (faq.js), spoken by the browser's own
        voice. Also the fallback when the agent is unreachable.

   The official <elevenlabs-convai> widget is still available by
   setting mode to 'widget', but it brings its own white UI.
   ========================================================= */
(function (global) {
  'use strict';

  var ELEVENLABS = {
    agentId: 'agent_4901m25102xae2nvb0fsy8bkmy9k',
    mode: 'client',             // 'client' | 'widget' | 'off'
    clientSrc: 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm',
    widgetSrc: 'https://unpkg.com/@elevenlabs/convai-widget-embed',
    replyTimeout: 25000
  };

  var KEY = 'spine.otto.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function motionOff() { return document.body.classList.contains('no-motion') || global.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var prefs = { voice: true, seen: false, lang: /^ar/i.test(navigator.language || '') ? 'ar' : 'en' };
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }

  /* ---------------- language ----------------
     Otto speaks English and Arabic. The toggle sets a default; a
     message written in the other script switches for that message
     (and the agent session) automatically. */
  function hasArabic(s) { return /[\u0600-\u06FF]/.test(String(s || '')); }
  function hasLatin(s) { return /[A-Za-z]{2,}/.test(String(s || '')); }
  function langOf(text) { return hasArabic(text) ? 'ar' : hasLatin(text) ? 'en' : prefs.lang; }
  var UI = {
    en: {
      greetShelf: 'Hoot. Ask me about your shelf, what to read next, or how anything here works.',
      greetEmpty: 'Hoot. I am Otto, the archivist. Ask me how scanning works, or what happens offline.',
      placeholder: 'Ask about your shelf, or the app…',
      thinking: 'Otto is thinking…', speaking: 'Speaking…', listening: 'Listening…', connecting: 'Connecting the line…',
      muted: 'Otto is muted.', unmuted: 'Otto will speak.', micOff: 'Microphone permission is off.', noCall: 'Could not start the call. Try typing.',
      note: 'Questions I cannot answer here go to the ElevenLabs agent.',
      fallback: 'I am not sure about that one. Try a few plain words, or pick a topic below.',
      offlineAgent: 'I can answer that when there is a connection. Meanwhile, ask me about your shelf or the app.',
      quota: 'My voice service has used up its monthly credits, so I am answering from this phone for now. Your shelf and the help pages still work.',
      agentErr: 'The voice service is not answering. I will use what I know on this phone.',
      callEnded: 'Call ended.',
      startersShelf: ['How many books do I have?', 'What should I read next?', 'What am I reading now?', 'Does Spine work offline?'],
      startersEmpty: ['How do I scan a book?', 'Does Spine work offline?', 'The camera does not open.', 'How do I install on iPhone?'],
      st: { want: 'to read', reading: 'reading', read: 'finished', pending: 'waiting for a signal' }
    },
    ar: {
      greetShelf: 'هوت. اسألني عن رفّك، أو ماذا تقرأ بعد ذلك، أو كيف يعمل أي شيء هنا.',
      greetEmpty: 'هوت. أنا أوتو، أمين المكتبة. اسألني كيف يعمل المسح، أو ماذا يحدث بدون إنترنت.',
      placeholder: 'اسأل عن رفّك أو عن التطبيق…',
      thinking: 'أوتو يفكّر…', speaking: 'يتحدّث…', listening: 'أستمع…', connecting: 'جارٍ الاتصال…',
      muted: 'أوتو صامت.', unmuted: 'سيتحدّث أوتو.', micOff: 'إذن الميكروفون مغلق.', noCall: 'تعذّر بدء المكالمة. جرّب الكتابة.',
      note: 'الأسئلة التي لا أستطيع الإجابة عنها هنا تذهب إلى وكيل ElevenLabs.',
      fallback: 'لست متأكدًا من ذلك. جرّب كلمات أبسط، أو اختر موضوعًا من الأسفل.',
      offlineAgent: 'أستطيع الإجابة عن ذلك عند توفر الاتصال. في الوقت الحالي اسألني عن رفّك أو عن التطبيق.',
      quota: 'استنفدت خدمة الصوت رصيدها الشهري، لذلك أجيب من هذا الهاتف الآن. رفّك وصفحات المساعدة تعمل كالمعتاد.',
      agentErr: 'خدمة الصوت لا تستجيب. سأستخدم ما أعرفه على هذا الهاتف.',
      callEnded: 'انتهت المكالمة.',
      startersShelf: ['كم كتابًا لديّ؟', 'ماذا أقرأ بعد ذلك؟', 'ماذا أقرأ الآن؟', 'هل يعمل التطبيق بدون إنترنت؟'],
      startersEmpty: ['كيف أمسح كتابًا؟', 'هل يعمل التطبيق بدون إنترنت؟', 'الكاميرا لا تعمل', 'كيف أثبّت التطبيق على آيفون؟'],
      st: { want: 'للقراءة', reading: 'قيد القراءة', read: 'منتهٍ', pending: 'بانتظار الاتصال' }
    }
  };
  function ui(k, l) { return UI[l || prefs.lang][k]; }
  function applyLang(l) {
    prefs.lang = l; savePrefs();
    var panel = $('#otto-panel'); if (!panel) return;
    panel.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    panel.setAttribute('lang', l);
    $('#otto-lang').textContent = l === 'ar' ? 'ع' : 'EN';
    $('#otto-input').placeholder = ui('placeholder', l);
  }

  var avatar = null, fabAvatar = null, isOpen = false, greeted = false;
  var rec = null, listening = false;
  var conv = null, convStarting = null, convVoice = false, pendingReply = null, convLang = 'en';
  var greetingGuard = false, greetingRelease = null;
  function afterGreeting() {
    if (!greetingGuard) return Promise.resolve();
    return new Promise(function (res) {
      greetingRelease = res;
      setTimeout(function () { greetingGuard = false; res(); }, 1800);
    });
  }

  /* =======================================================
     1. Local answering: FAQ
     ======================================================= */
  var STOP = /\b(the|a|an|is|it|to|of|and|or|do|does|i|my|me|can|how|what|why|in|on|for|with|this|that|be|are|you|your|spine|app|please|did|not|no|yes)\b/g;
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
      return { text: 'Hello. Ask me about your shelf, how scanning works, or what to read next.', chips: starters() };
    }
    if (/\b(thanks|thank you|cheers)\b/.test(q)) return { text: 'Any time. Happy shelving.', chips: [] };
    if (best && bestScore >= 2) return { text: best.a, chips: related(best) };
    return null;
  }
  function starters(l) {
    var has = global.Shelf && global.Shelf.count();
    return ui(has ? 'startersShelf' : 'startersEmpty', l);
  }
  function related(item) {
    var out = [];
    (global.FAQ || []).forEach(function (sec) {
      if (sec.items.indexOf(item) > -1) sec.items.forEach(function (it) { if (it !== item && out.length < 3) out.push(it.q); });
    });
    return out;
  }

  /* =======================================================
     1b. Local answering: the user's own shelf
     ======================================================= */
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
    return q
      .replace(/\b(who (wrote|is the author of|authored)|author of|written by|when (was|did)|what year (was|did)|how many pages (does|is|in|has)|how long is|what is|what's|tell me about|do i (have|own)|is|have i (read|finished)|did i (read|finish)|about|the book|book|called|titled|publisher of|who published|summar(ise|ize)|describe|published|come out|written|get published|on my shelf|in my library|have|similar to|like|recommend|suggest|something|more|books|another)\b/g, ' ')
      .replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function shelfAnswer(question) {
    if (!global.Shelf) return null;
    var q = norm(question);
    var S = global.Shelf;
    var mentionsShelf = /\b(book|books|shelf|library|read|reading|finished|unread|pages|author|authors|collection)\b/.test(q);

    if (/\bhow many\b/.test(q) && mentionsShelf && !/\bpages (does|is|in|has)\b/.test(q)) {
      var s = S.summary();
      if (!s.total && !s.pending) return { text: 'Your shelf is empty so far. Scan a barcode to add the first book.', chips: ['How do I scan a book?'] };
      if (/\b(finished|have i read|did i read|completed|done)\b/.test(q)) return { text: 'You have finished ' + plural(s.finished, 'book') + ' out of ' + s.total + (s.pagesRead ? ', which is ' + s.pagesRead.toLocaleString() + ' pages read' : '') + '.', chips: ['What am I reading now?', 'What is left to read?'] };
      if (/\b(left|to read|unread|still|remaining|haven t read|not read|want)\b/.test(q)) return { text: 'You have ' + plural(s.toRead, 'book') + ' still to read' + (s.reading ? ' and ' + plural(s.reading, 'book') + ' in progress' : '') + (s.pagesToRead ? ', about ' + s.pagesToRead.toLocaleString() + ' pages' : '') + '.', chips: ['What is on my to-read list?', 'What should I read next?'] };
      if (/\b(reading|in progress|currently)\b/.test(q)) return { text: s.reading ? 'You are reading ' + plural(s.reading, 'book') + ' right now: ' + titleList(s.readingNow) + '.' : 'Nothing is marked as Reading at the moment.', chips: ['How many have I finished?'] };
      if (/\bauthors?\b/.test(q)) return { text: 'Your shelf has ' + plural(s.authors, 'author') + (s.topAuthors.length ? '. Most shelved: ' + s.topAuthors.join(', ') : '') + '.', chips: ['How many books do I have?'] };
      if (/\bpages\b/.test(q)) return { text: 'Across the shelf there are ' + s.pagesTotal.toLocaleString() + ' pages, of which you have read ' + s.pagesRead.toLocaleString() + '.', chips: ['How many have I finished?'] };
      return { text: 'You have ' + plural(s.total, 'book') + ' on your shelf: ' + s.finished + ' finished, ' + s.reading + ' reading and ' + s.toRead + ' to read' + (s.pending ? ', plus ' + plural(s.pending, 'scan') + ' waiting for a signal' : '') + '.', chips: ['What am I reading now?', 'What is left to read?', 'What should I read next?'] };
    }
    if (/\b(most (shelved|read|common)|favou?rite) (author|writer)\b/.test(q)) {
      var s2 = S.summary();
      return { text: s2.topAuthors.length ? 'Your most shelved author' + (s2.topAuthors.length > 1 ? 's are ' : ' is ') + s2.topAuthors.join(', ') + '.' : 'No authors on the shelf yet.', chips: ['How many books do I have?'] };
    }
    if (/\b(what|which) (do|am) i (read|reading)\b|\b(currently|now) reading\b|\breading (now|right now|at the moment)\b/.test(q)) {
      var r = S.list('reading');
      return { text: r.count ? 'You are reading ' + titleList(r.books) + '.' : 'Nothing is marked as Reading. Open a book and tap Reading to track it.', chips: ['What is left to read?'] };
    }
    if (/\b(to[- ]read|left to read|unread|haven t read|not read yet|queue)\b/.test(q) && /\b(what|which|list|show|left)\b/.test(q)) {
      var w = S.list('want');
      return { text: w.count ? plural(w.count, 'book') + ' to read: ' + titleList(w.books, 8) + '.' : 'Your to-read list is empty.', chips: ['What should I read next?'] };
    }
    if (/\b(what|which) (have i|did i) (read|finish)|\bfinished books\b|\blist .*finished\b/.test(q)) {
      var f = S.list('read');
      return { text: f.count ? 'Finished: ' + titleList(f.books, 8) + '.' : 'You have not marked any book as Finished yet.', chips: ['How many books do I have?'] };
    }
    if (/\b(what|which) books? (do i|have i|are|is|did i)\b|\b(list|show|name) (me )?(my|all|the) books\b|\bwhat( i)?s on my shelf\b|\bwhat is on my shelf\b|\bmy books\b|\bbooks (i|that i) (have|own)\b|\bwhat (do|have) i (have|got|own)\b/.test(q) && !/\b(read next|should)\b/.test(q)) {
      var all = S.list('all');
      return { text: all.count ? 'You have ' + plural(all.count, 'book') + '. Newest first: ' + titleList(all.books, 8) + '.' : 'Your shelf is empty so far.', chips: ['How many have I finished?'] };
    }
    if (/\b(newest|latest|last|most recent)\b.*\b(book|scan|added)\b|\bwhat did i (add|scan) last\b/.test(q)) {
      var n = S.summary().newest;
      return n ? { text: 'The newest book on the shelf is ' + n.title + (n.author ? ' by ' + n.author : '') + ', added ' + (n.addedAgo === 'today' ? 'today' : n.addedAgo + ' ago') + '.', chips: ['Tell me about ' + n.title] } : null;
    }
    if (isRecommendAsk(q)) return null;   // handled asynchronously by recommend()

    var aspect = null;
    for (var i = 0; i < ASPECTS.length; i++) if (ASPECTS[i][1].test(q)) { aspect = ASPECTS[i][0]; break; }
    var title = extractTitle(q);
    if (title.length >= 2) {
      var hits = S.find(title, 3);
      if (hits.length && (hits[0].score >= 55 || (aspect && hits[0].score >= 30))) {
        var b = hits[0].book;
        var more = hits.slice(1).filter(function (h) { return h.score >= 50; }).map(function (h) { return h.book.title; });
        var chipsFor = ['Who wrote ' + b.title + '?', 'When was ' + b.title + ' published?', 'What is ' + b.title + ' about?', 'Something like ' + b.title]
          .filter(function (c) { return !(aspect === 'author' && c.indexOf('Who') === 0) && !(aspect === 'year' && c.indexOf('When') === 0) && !(aspect === 'about' && c.indexOf('What is') === 0); }).slice(0, 3);
        return { text: describeBook(b, aspect || 'have') + (more.length ? ' You also have ' + more.join(' and ') + '.' : ''), chips: chipsFor };
      }
      if (aspect || /\b(do i have|have i got|is .* on my shelf)\b/.test(q)) {
        if (!S.count()) return { text: 'Your shelf is empty, so I cannot find that one. Scan it and ask me again.', chips: ['How do I scan a book?'] };
        return { text: 'I cannot find "' + title + '" on your shelf. I only know the books you have scanned, so try the exact title, or scan it first.', chips: ['What books do I have?'] };
      }
    }
    return null;
  }

  /* ---- the same shelf questions, asked in Arabic ---- */
  function arList(books, max) {
    var names = books.slice(0, max || 6).map(function (b) { return b.title + (b.author ? ' لـ' + b.author.split(',')[0] : ''); });
    var rest = books.length - names.length;
    return names.join('؛ ') + (rest > 0 ? '؛ و' + rest + ' غيرها' : '');
  }
  function arBook(b, aspect) {
    var st = UI.ar.st[b.status] || b.statusLabel;
    switch (aspect) {
      case 'author': return b.author ? ('كتاب ' + b.title + ' من تأليف ' + b.author + '.') : ('لا يوجد مؤلف مسجّل لكتاب ' + b.title + '.');
      case 'year':
        if (b.firstPublished && b.year && b.firstPublished !== b.year) return 'صدر ' + b.title + ' أول مرة سنة ' + b.firstPublished + '، ونسختك من سنة ' + b.year + (b.publisher ? ' عن ' + b.publisher : '') + '.';
        var y = b.firstPublished || b.year;
        return y ? ('نُشر ' + b.title + ' سنة ' + y + (b.publisher ? ' عن ' + b.publisher : '') + '.') : ('لا أعرف سنة نشر ' + b.title + '.');
      case 'pages': return b.pages ? ('يحتوي ' + b.title + ' على ' + b.pages + ' صفحة.') : ('لا يوجد عدد صفحات مسجّل لكتاب ' + b.title + '.');
      case 'about': return b.description ? (b.title + ': ' + b.description.slice(0, 300).replace(/\s+\S*$/, '') + '…') : ('لا يوجد ملخص لكتاب ' + b.title + '. هو من تأليف ' + (b.author || 'مؤلف غير معروف') + '.');
      case 'status': return 'كتاب ' + b.title + ' مسجّل عندك على أنه ' + st + '.';
      default: return 'نعم، ' + b.title + ' على رفّك، حالته: ' + st + '. من تأليف ' + (b.author || 'مؤلف غير معروف') + ((b.firstPublished || b.year) ? '، نُشر سنة ' + (b.firstPublished || b.year) : '') + (b.pages ? '، ' + b.pages + ' صفحة' : '') + '.';
    }
  }
  function arTitle(q) {
    return q.replace(/(من كتب|من مؤلف|من هو مؤلف|مؤلف|كاتب|متى (نشر|نُشر|صدر)|سنة (النشر|الإصدار)|كم صفحة|عدد صفحات|عن ماذا|ما قصة|ملخص|هل (لدي|عندي|أملك)|كتاب|رواية|يتحدث|أخبرني عن|مشابه|شبيه|اقترح|رشح|مثل|لي|عن|في)/g, ' ').replace(/[؟?.!،,]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function shelfAnswerAr(question) {
    if (!global.Shelf) return null;
    var S = global.Shelf, q = String(question || '').replace(/\s+/g, ' ').trim();
    var n = function (x) { return x; };
    if (/كم (عدد )?(ال)?كتب|كم كتاب|عدد (ال)?كتب|كم (ال)?كتاب/.test(q)) {
      var s = S.summary();
      if (!s.total && !s.pending) return { text: 'رفّك فارغ حتى الآن. امسح باركود كتاب لإضافة أول كتاب.', chips: starters('ar') };
      if (/(أنهيت|انهيت|قرأت|قرات|منتهي|مكتمل)/.test(q)) return { text: 'أنهيت ' + s.finished + ' من أصل ' + s.total + ' كتاب' + (s.pagesRead ? '، أي ' + s.pagesRead.toLocaleString('ar') + ' صفحة مقروءة' : '') + '.', chips: starters('ar') };
      if (/(متبق|باقي|بقي|لم أقرأ|لم اقرأ|للقراءة)/.test(q)) return { text: 'بقي لك ' + s.toRead + ' كتاب للقراءة' + (s.reading ? ' و' + s.reading + ' قيد القراءة' : '') + (s.pagesToRead ? '، نحو ' + s.pagesToRead.toLocaleString('ar') + ' صفحة' : '') + '.', chips: starters('ar') };
      if (/(أقرأ|اقرا|قيد القراءة|حالي)/.test(q)) return { text: s.reading ? 'تقرأ الآن ' + s.reading + ' كتاب: ' + arList(s.readingNow) + '.' : 'لا يوجد كتاب مسجّل على أنه قيد القراءة الآن.', chips: starters('ar') };
      return { text: 'لديك ' + s.total + ' كتاب على رفّك: ' + s.finished + ' منتهٍ، ' + s.reading + ' قيد القراءة، و' + s.toRead + ' للقراءة' + (s.pending ? '، إضافة إلى ' + s.pending + ' مسح بانتظار الاتصال' : '') + '.', chips: starters('ar') };
    }
    if (/(ماذا|ما الذي|ايش|أيش) أقرأ الآن|أقرأ (الآن|حاليا|حالياً)|قيد القراءة/.test(q) && !/بعد/.test(q)) {
      var r = S.list('reading');
      return { text: r.count ? 'تقرأ الآن ' + arList(r.books) + '.' : 'لا يوجد كتاب مسجّل على أنه قيد القراءة. افتح كتابًا واضغط «Reading».', chips: starters('ar') };
    }
    if (/(ما هي|ماهي|ما|أي|اي|اعرض|أعرض|اذكر) (كتبي|الكتب (التي|اللي) (عندي|لدي|أملك)|كتب (عندي|لدي))|كتبي|الكتب (التي|اللي) (عندي|لدي)|ماذا (لدي|عندي)/.test(q)) {
      var all = S.list('all');
      return { text: all.count ? 'لديك ' + all.count + ' كتاب. الأحدث أولًا: ' + arList(all.books, 8) + '.' : 'رفّك فارغ حتى الآن.', chips: starters('ar') };
    }
    if (/(المنتهية|التي أنهيت|اللي خلصت|ماذا (قرأت|أنهيت))/.test(q)) {
      var f = S.list('read');
      return { text: f.count ? 'الكتب المنتهية: ' + arList(f.books, 8) + '.' : 'لم تسجّل أي كتاب على أنه منتهٍ بعد.', chips: starters('ar') };
    }
    if (/(آخر|اخر|أحدث|احدث) (كتاب|مسح|إضافة)/.test(q)) {
      var nw = S.summary().newest;
      return nw ? { text: 'أحدث كتاب على الرف هو ' + nw.title + (nw.author ? ' لـ' + nw.author : '') + '.', chips: starters('ar') } : null;
    }
    var aspect = null;
    if (/(من كتب|من مؤلف|من هو مؤلف|مؤلف|كاتب)/.test(q)) aspect = 'author';
    else if (/(متى (نشر|نُشر|صدر)|سنة (النشر|الإصدار)|أي سنة|اي سنة)/.test(q)) aspect = 'year';
    else if (/(كم صفحة|عدد (ال)?صفحات)/.test(q)) aspect = 'pages';
    else if (/(عن ماذا|ما قصة|ملخص|يتحدث عن|أخبرني عن)/.test(q)) aspect = 'about';
    else if (/(هل (قرأت|أنهيت)|حالة)/.test(q)) aspect = 'status';
    var t = arTitle(q);
    if (t.length >= 2) {
      var hits = S.find(t, 3);
      if (hits.length && (hits[0].score >= 55 || (aspect && hits[0].score >= 30))) {
        return { text: arBook(hits[0].book, aspect || 'have'), chips: ['من كتب ' + hits[0].book.title + '؟', 'متى نُشر ' + hits[0].book.title + '؟', 'كتاب مشابه لـ' + hits[0].book.title] };
      }
      if (aspect || /(هل (لدي|عندي|أملك))/.test(q)) {
        return { text: S.count() ? 'لا أجد «' + t + '» على رفّك. أعرف فقط الكتب التي مسحتها، فجرّب العنوان كما هو مكتوب على الغلاف، أو امسحه أولًا.' : 'رفّك فارغ، لذلك لا أجد هذا الكتاب. امسحه ثم اسألني مجددًا.', chips: starters('ar') };
      }
    }
    void n;
    return null;
  }
  function isRecommendAskAr(q) { return /(اقترح|اقتراح|توصي|توصية|توصيات|رشح|ترشيح|مشابه|شبيه|ماذا أقرأ بعد|ايش اقرأ بعد|كتاب آخر|أفكار للقراءة)/.test(q); }

  /* ---- recommendations: books that share a subject with the shelf ---- */
  function isRecommendAsk(q) {
    return /\b(recommend|suggest|similar|something like|what (should|could|can) i read|read next|what next|more like|books like|anything like|next book|another suggestion)\b/.test(q);
  }
  function recommend(question, l) {
    l = l || 'en';
    var ar = l === 'ar';
    var q = ar ? String(question || '') : norm(question);
    var S = global.Shelf;
    if (!S) return Promise.resolve(null);
    if (!S.count()) return Promise.resolve({ text: ar ? 'امسح بضعة كتب أولًا وسأجد لك ما يشبهها.' : 'Scan a few books first and I will find more along the same lines.', chips: starters(l) });
    if (!navigator.onLine) return Promise.resolve({ text: ar ? 'التوصيات تحتاج اتصالًا بالفهرس. اسألني مجددًا عند عودة الاتصال.' : 'Recommendations need a connection to the catalogue. Ask me again when you are back online.', chips: [] });
    var seed = null;
    var t = ar ? arTitle(q) : extractTitle(q);
    if (t.length >= 3) { var hit = S.find(t, 1)[0]; if (hit && hit.score >= 40) seed = hit.book; }
    return S.recommend(seed ? seed.id : null).then(function (res) {
      if (!res || !res.books.length) return { text: ar ? 'لم أجد شيئًا قريبًا بما يكفي في الفهرس الآن. جرّب تسمية كتاب: «كتاب مشابه لـ Dune».' : 'I could not find anything close enough in the catalogue just now. Try naming a book: "something like Dune".', chips: [] };
      var list = res.books.map(function (b) { return b.title + (b.author ? (ar ? ' لـ' : ' by ') + b.author : '') + (b.year ? ' (' + b.year + ')' : ''); }).join(ar ? '؛ ' : '; ');
      var lead = ar
        ? (seed ? 'إن أعجبك ' + seed.title + '، فهذه الكتب تشاركه الرف: ' : 'بناءً على ما تقرأ (' + res.subjects.slice(0, 2).join('، ') + ')، قد يعجبك: ')
        : (seed ? 'If you liked ' + seed.title + ', these share its shelf: ' : 'Going by what you read (' + res.subjects.slice(0, 2).join(', ') + '), you might like: ');
      return {
        text: lead + list + '.',
        recs: res.books,
        chips: ar ? ['اقتراح آخر', seed ? 'عن ماذا يتحدث ' + seed.title + '؟' : 'ماذا أقرأ الآن؟'] : ['Another suggestion', seed ? 'What is ' + seed.title + ' about?' : 'What am I reading now?']
      };
    }).catch(function () { return { text: ar ? 'لم يجب الفهرس في الوقت المناسب. حاول بعد قليل.' : 'The catalogue did not answer in time. Try again in a moment.', chips: [] }; });
  }

  /* =======================================================
     Panel UI
     ======================================================= */
  function log() { return $('#otto-log'); }
  function bubble(text, who, extra) {
    var el = document.createElement('div');
    el.className = 'omsg omsg--' + who;
    el.innerHTML = '<div class="omsg__b">' + esc(text) + '</div>' + (extra || '');
    log().appendChild(el);
    scrollLog();
    return el;
  }
  function recCards(books) {
    return '<div class="recs">' + books.map(function (b, i) {
      return '<a class="rec" style="--i:' + i + '" href="' + esc(b.url) + '" target="_blank" rel="noopener">' +
        '<span class="rec__cov">' + (b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy">' : '<i>' + esc((b.title || '?').charAt(0)) + '</i>') + '</span>' +
        '<span class="rec__t">' + esc(b.title) + '</span>' +
        '<span class="rec__a">' + esc(b.author || '') + (b.year ? ' · ' + b.year : '') + '</span></a>';
    }).join('') + '</div>';
  }
  function chips(list) {
    $('#otto-chips').innerHTML = (list || []).map(function (c) { return '<button class="chip chip--q" type="button">' + esc(c) + '</button>'; }).join('');
  }
  function status(t) { if (t === undefined) return $('#otto-status').textContent; $('#otto-status').textContent = t || ''; }
  function scrollLog() { var l = log(); l.scrollTop = l.scrollHeight; }
  var typingEl = null;
  function typing(on) {
    if (on && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'omsg omsg--otto omsg--typing';
      typingEl.innerHTML = '<div class="omsg__b"><i></i><i></i><i></i></div>';
      log().appendChild(typingEl); scrollLog();
    } else if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }

  function ottoSays(r) {
    typing(false);
    if (avatar) avatar.hop();
    bubble(r.text, 'otto', r.recs ? recCards(r.recs) : '');
    chips(r.chips);
    say(r.text);
  }

  /* =======================================================
     Browser speech (fallback when there is no agent)
     ======================================================= */
  function canListen() { return !!(global.SpeechRecognition || global.webkitSpeechRecognition); }
  function canSpeak() { return 'speechSynthesis' in global; }
  function pickVoice(l) {
    var vs = speechSynthesis.getVoices();
    if (l === 'ar') {
      return vs.filter(function (x) { return /^ar/i.test(x.lang) && /Google|Microsoft Hamed|Microsoft Naayf|Maged|Tarik/i.test(x.name); })[0] ||
             vs.filter(function (x) { return /^ar/i.test(x.lang); })[0] || null;
    }
    var pref = ['Google UK English Male', 'Daniel', 'Google US English', 'Microsoft George', 'Samantha'];
    for (var i = 0; i < pref.length; i++) {
      var v = vs.filter(function (x) { return x.name.indexOf(pref[i]) === 0; })[0];
      if (v) return v;
    }
    return vs.filter(function (x) { return /^en/i.test(x.lang); })[0] || vs[0] || null;
  }
  function say(text) {
    if (!prefs.voice || !canSpeak() || convVoice) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    var l = langOf(text);
    var u = new SpeechSynthesisUtterance(text);
    var v = pickVoice(l);
    if (v) u.voice = v;
    u.lang = l === 'ar' ? 'ar-SA' : 'en-GB';
    u.rate = 1.0; u.pitch = 1.1;
    var sp = ui('speaking', l);
    u.onstart = function () { if (avatar) avatar.talking(true); status(sp); };
    u.onend = u.onerror = function () { if (avatar) avatar.talking(false); if (status() === sp) status(''); };
    speechSynthesis.speak(u);
  }
  function hush() {
    if (canSpeak()) { try { speechSynthesis.cancel(); } catch (e) {} }
    if (avatar) avatar.talking(false);
  }
  function startListening() {
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) { status('Voice input is not available here. Type instead.'); return; }
    hush();
    rec = new SR();
    rec.lang = prefs.lang === 'ar' ? 'ar-SA' : ((navigator.language || 'en').indexOf('en') === 0 ? navigator.language : 'en-GB');
    rec.interimResults = true;
    var finalText = '';
    rec.onstart = function () { listening = true; $('#otto-mic').setAttribute('aria-pressed', 'true'); status(ui('listening')); };
    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      $('#otto-input').value = finalText || interim;
    };
    rec.onerror = function (e) { status(e.error === 'not-allowed' ? 'Microphone permission is off.' : 'Could not hear that.'); };
    rec.onend = function () {
      listening = false;
      $('#otto-mic').setAttribute('aria-pressed', 'false');
      if (finalText.trim()) send(finalText.trim()); else if (status() === ui('listening')) status('');
    };
    try { rec.start(); } catch (e) { status('Could not start the microphone.'); }
  }
  function stopListening() { if (rec) { try { rec.stop(); } catch (e) {} } }

  /* =======================================================
     ElevenLabs client
     ======================================================= */
  var agentDownUntil = 0, agentDownWhy = '', explained = false;
  function agentReady() { return ELEVENLABS.mode === 'client' && !!ELEVENLABS.agentId && navigator.onLine && Date.now() > agentDownUntil; }
  /** Read the service's own error and decide how long to stop trying. */
  function noteAgentError(raw) {
    var msg = String((raw && (raw.message || raw.reason)) || raw || '');
    if (/quota|credit|out of/i.test(msg)) { agentDownUntil = Date.now() + 6 * 3600 * 1000; agentDownWhy = 'quota'; }
    else if (msg) { agentDownUntil = Date.now() + 90 * 1000; agentDownWhy = 'error'; }
    if (msg) try { console.warn('[Otto] agent:', msg); } catch (e) {}
    return agentDownWhy;
  }
  function explainAgent(l) {
    var t = ui(agentDownWhy === 'quota' ? 'quota' : 'agentErr', l);
    if (avatar) avatar.hop();
    typing(false);
    status('');
    bubble(t, 'otto');
    chips(starters(l));
    say(t);
  }

  function clientTools() {
    var S = global.Shelf;
    return {
      get_shelf_summary: function () { return JSON.stringify(S ? S.summary() : { total: 0 }); },
      find_book: function (p) {
        var q = (p && (p.query || p.title || p.q)) || '';
        var hits = S ? S.find(q, 3) : [];
        return JSON.stringify(hits.length ? { found: true, best: hits[0].book, others: hits.slice(1).map(function (h) { return h.book; }) } : { found: false, query: q, shelf_size: S ? S.count() : 0 });
      },
      list_books: function (p) {
        return JSON.stringify(S ? S.list((p && p.status) || 'all', (p && p.limit) || 12) : { count: 0, books: [] });
      },
      recommend_books: function (p) {
        if (!S) return JSON.stringify({ books: [] });
        var t = p && (p.title || p.query);
        var seed = t ? (S.find(t, 1)[0] || {}).book : null;
        return S.recommend(seed ? seed.id : null).then(function (r) { return JSON.stringify(r || { books: [] }); })
          .catch(function () { return JSON.stringify({ books: [], error: 'catalogue unavailable' }); });
      }
    };
  }

  function startConversation(voice, l) {
    l = l || prefs.lang;
    if (conv && convVoice === voice && convLang === l) return Promise.resolve(conv);
    if (convStarting) return convStarting;
    var teardown = conv ? endConversation() : Promise.resolve();
    status(voice ? ui('connecting', l) : ui('thinking', l));
    greetingGuard = !voice; greetingRelease = null;
    convStarting = teardown.then(function () { return import(ELEVENLABS.clientSrc); }).then(function (mod) {
      var Conversation = mod.Conversation;
      var s = global.Shelf ? global.Shelf.summary() : null;
      return Conversation.startSession({
        agentId: ELEVENLABS.agentId,
        connectionType: 'websocket',
        textOnly: !voice,
        overrides: l === 'ar' ? { agent: { language: 'ar' } } : undefined,
        clientTools: clientTools(),
        dynamicVariables: s ? { book_count: s.total, finished_count: s.finished, reading_count: s.reading, to_read_count: s.toRead, pages_read: s.pagesRead } : {},
        onConnect: function () { status(voice ? ui('listening', l) : ''); },
        onDisconnect: function (d) {
          var wasVoice = convVoice;
          conv = null; convVoice = false;
          if (avatar) avatar.talking(false);
          $('#otto-mic').setAttribute('aria-pressed', 'false');
          $('#otto-panel').classList.remove('is-voice');
          typing(false);
          if (d && d.reason === 'error') {
            noteAgentError(d);
            if (pendingReply) { clearTimeout(pendingReply.timer); pendingReply = null; }
            explainAgent(l);
            status('');
          } else status(wasVoice ? ui('callEnded', l) : '');
        },
        onError: function (e) { noteAgentError(e); },
        onModeChange: function (m) {
          var mode = m && m.mode;
          if (avatar) avatar.talking(mode === 'speaking');
          if (voice) status(mode === 'speaking' ? ui('speaking', l) : mode === 'listening' ? ui('listening', l) : '');
        },
        onMessage: function (m) {
          if (!m || !m.message) return;
          if (m.source === 'user') { if (voice) bubble(m.message, 'me'); return; }
          // Text sessions: the agent opens with its configured greeting.
          // Otto has already said hello, so that first line is dropped and
          // the queued question goes out once it has passed.
          if (!voice && greetingGuard) { greetingGuard = false; if (greetingRelease) greetingRelease(); return; }
          typing(false);
          if (pendingReply) { clearTimeout(pendingReply.timer); pendingReply = null; }
          if (avatar) avatar.hop();
          bubble(m.message, 'otto');
          chips(voice ? [] : starters(l).slice(0, 2));
          if (!voice) say(m.message);
          if (voice) status(ui('speaking', l));
        }
      });
    }).then(function (c) {
      conv = c; convVoice = voice; convLang = l; convStarting = null;
      if (c.setVolume) { try { c.setVolume({ volume: prefs.voice ? 1 : 0 }); } catch (e) {} }
      return c;
    }).catch(function (e) {
      convStarting = null; conv = null; convVoice = false;
      throw e;
    });
    return convStarting;
  }
  function endConversation() {
    var c = conv; conv = null; convVoice = false;
    $('#otto-panel').classList.remove('is-voice');
    $('#otto-mic').setAttribute('aria-pressed', 'false');
    if (avatar) avatar.talking(false);
    if (!c) return Promise.resolve();
    try { return Promise.resolve(c.endSession()).catch(function () {}); } catch (e) { return Promise.resolve(); }
  }

  /* =======================================================
     Send
     ======================================================= */
  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    $('#otto-input').value = '';
    hush();
    var l = langOf(text);
    if (l !== prefs.lang) applyLang(l);   // writing in the other script switches Otto
    bubble(text, 'me');
    chips([]);
    var q = norm(text);

    if (conv && convVoice) { conv.sendUserMessage(text); return; }

    var local = l === 'ar' ? shelfAnswerAr(text) : shelfAnswer(text);
    if (local) { typing(true); setTimeout(function () { ottoSays(local); }, 220); return; }
    var wantsRec = l === 'ar' ? isRecommendAskAr(text) : isRecommendAsk(q);
    if (wantsRec) { typing(true); recommend(text, l).then(function (r) { ottoSays(r || fallback(l)); }); return; }

    var faq = l === 'ar' ? null : answer(text);   // the FAQ is English; Arabic goes to the agent
    if (agentReady()) {
      typing(true);
      startConversation(false, l).then(function (c) {
        return afterGreeting().then(function () {
          c.sendUserMessage(text);
          pendingReply = { timer: setTimeout(function () {
            pendingReply = null;
            ottoSays(faq || fallback(l));
          }, ELEVENLABS.replyTimeout) };
        });
      }).catch(function (e) {
        var why = noteAgentError(e);
        if (why && !explained) { explained = true; typing(false); explainAgent(l); }
        else ottoSays(faq || fallback(l));
      });
      return;
    }
    typing(true);
    setTimeout(function () {
      if (faq) return ottoSays(faq);
      if (agentDownWhy && Date.now() < agentDownUntil) return ottoSays({ text: ui(agentDownWhy === 'quota' ? 'quota' : 'agentErr', l), chips: starters(l) });
      ottoSays(l === 'ar' && ELEVENLABS.agentId ? { text: ui('offlineAgent', 'ar'), chips: starters('ar') } : fallback(l));
    }, 260);
  }
  function fallback(l) {
    return { text: ui('fallback', l), chips: starters(l) };
  }

  /* =======================================================
     Open / close
     ======================================================= */
  function open() {
    var panel = $('#otto-panel'), fab = $('#otto-fab');
    if (!panel || isOpen) return;
    isOpen = true;
    panel.hidden = false;
    fab.classList.add('is-hidden');
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    if (!avatar) avatar = global.Pixel.mountAvatar($('#otto-cv'), { still: motionOff() });
    avatar.pose('wave'); avatar.hop();
    setTimeout(function () { if (avatar) avatar.pose('idle'); }, 1400);
    applyLang(prefs.lang);
    $('#otto-voice').setAttribute('aria-pressed', prefs.voice ? 'true' : 'false');
    $('#otto-mic').hidden = !(agentReady() || canListen());
    if (!greeted) {
      greeted = true;
      var has = global.Shelf && global.Shelf.count();
      bubble(ui(has ? 'greetShelf' : 'greetEmpty'), 'otto');
      chips(starters());
      if (!prefs.seen && ELEVENLABS.agentId && ELEVENLABS.mode === 'client') {
        var note = ui('note');
        status(note);
        prefs.seen = true; savePrefs();
        setTimeout(function () { if (status() === note) status(''); }, 4000);
      }
    }
    setTimeout(function () { if (matchMedia('(min-width: 640px)').matches) $('#otto-input').focus(); }, 380);
  }
  function close() {
    var panel = $('#otto-panel'), fab = $('#otto-fab');
    if (!panel || !isOpen) return;
    isOpen = false;
    hush(); stopListening(); endConversation();
    panel.classList.remove('is-open');
    fab.classList.remove('is-hidden');
    setTimeout(function () { if (!isOpen) panel.hidden = true; }, motionOff() ? 0 : 320);
    if (avatar) { avatar.stop(); avatar = null; }
  }
  function toggle() { if (isOpen) close(); else open(); }
  function setLang(l) {
    l = l === 'ar' ? 'ar' : 'en';
    if (l === prefs.lang) return l;
    hush(); stopListening(); endConversation();
    applyLang(l);
    if (isOpen) {
      if (avatar) avatar.hop();
      bubble(ui('greetShelf', l), 'otto');
      chips(starters(l));
    }
    return l;
  }

  /* =======================================================
     Widget mode (optional): the official ElevenLabs bubble
     ======================================================= */
  var widgetEl = null;
  function mountWidget() {
    if (widgetEl) return;
    widgetEl = document.createElement('elevenlabs-convai');
    widgetEl.setAttribute('agent-id', ELEVENLABS.agentId);
    widgetEl.setAttribute('variant', 'compact');
    widgetEl.addEventListener('elevenlabs-convai:call', function (e) {
      var cfg = e.detail && e.detail.config; if (!cfg) return;
      cfg.clientTools = Object.assign(cfg.clientTools || {}, clientTools());
    });
    document.body.appendChild(widgetEl);
    var s = document.createElement('script');
    s.src = ELEVENLABS.widgetSrc; s.async = true; document.head.appendChild(s);
  }

  /* =======================================================
     Wiring
     ======================================================= */
  function init() {
    var fab = $('#otto-fab');
    if (!fab) return;
    if (ELEVENLABS.mode === 'widget' && ELEVENLABS.agentId) { fab.hidden = true; mountWidget(); return; }
    if (ELEVENLABS.mode === 'off') { fab.hidden = true; return; }

    fabAvatar = global.Pixel.mountAvatar($('#otto-fab-cv'), { still: motionOff() });
    fab.onclick = toggle;
    $('#otto-close').onclick = close;
    $('#otto-form').onsubmit = function (e) { e.preventDefault(); send($('#otto-input').value); };
    $('#otto-chips').onclick = function (e) { var b = e.target.closest('.chip--q'); if (b) send(b.textContent); };
    $('#otto-voice').onclick = function () {
      prefs.voice = !prefs.voice; savePrefs();
      this.setAttribute('aria-pressed', prefs.voice ? 'true' : 'false');
      if (!prefs.voice) hush();
      if (conv && conv.setVolume) { try { conv.setVolume({ volume: prefs.voice ? 1 : 0 }); } catch (e) {} }
      status(prefs.voice ? ui('unmuted') : ui('muted'));
      setTimeout(function () { status(''); }, 1500);
    };
    $('#otto-lang').onclick = function () { setLang(prefs.lang === 'ar' ? 'en' : 'ar'); };
    $('#otto-mic').onclick = function () {
      if (agentReady()) {
        if (conv && convVoice) { endConversation(); status(''); return; }
        $('#otto-panel').classList.add('is-voice');
        this.setAttribute('aria-pressed', 'true');
        startConversation(true).catch(function (e) {
          $('#otto-panel').classList.remove('is-voice');
          $('#otto-mic').setAttribute('aria-pressed', 'false');
          if (/NotAllowed|Permission/i.test(String(e && (e.name || e.message)))) { status(ui('micOff')); return; }
          noteAgentError(e);
          explainAgent(prefs.lang);
          if (canListen()) startListening();
        });
        return;
      }
      if (listening) stopListening(); else startListening();
    };
    document.addEventListener('pointerdown', function (e) {
      if (!isOpen) return;
      if (e.target.closest('#otto-panel, #otto-fab')) return;
      close();
    });
    if (canSpeak()) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Otto = {
    open: open, close: close, toggle: toggle,
    isOpen: function () { return isOpen; },
    onRoute: function (page) { if (page === 'scan' && isOpen) close(); if (widgetEl) widgetEl.style.display = page === 'scan' ? 'none' : ''; },
    lang: function () { return prefs.lang; }, setLang: setLang, shelfAnswerAr: shelfAnswerAr,
    answer: answer, shelfAnswer: shelfAnswer, recommend: recommend, clientTools: clientTools,
    config: ELEVENLABS
  };
})(window);
