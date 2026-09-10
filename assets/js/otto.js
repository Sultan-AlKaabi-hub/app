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
    agentId: '',                // paste the agent-id from the ElevenLabs embed snippet
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
    var r = answer(text);
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
    setWidgetVisible: setWidgetVisible,
    config: ELEVENLABS
  };
})(window);
