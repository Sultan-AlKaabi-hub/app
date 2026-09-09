/* =========================================================
   api.js — Open Library catalogue access
   Open Library (openlibrary.org) is a free, CORS-enabled public
   catalogue run by the Internet Archive. No key, no quota tier.
   Endpoints used:
     /isbn/{isbn}.json          edition record
     /api/books?bibkeys=ISBN:   readable edition summary
     /works/{id}.json           description + subjects
     /search.json               title/author text search, ISBN fallback
     covers.openlibrary.org     cover images
   ========================================================= */
(function (global) {
  'use strict';

  var OL = 'https://openlibrary.org';
  var COVERS = 'https://covers.openlibrary.org';
  // Open Library is a volunteer-run service and a cold request can take
  // several seconds. A generous ceiling costs nothing when it is fast.
  var TIMEOUT = 20000;

  function getJSON(url) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw Object.assign(new Error('http_' + r.status), { status: r.status });
        return r.json();
      })
      .then(function (j) {
        // The service worker answers with this shape when it has no
        // network and no cached copy.
        if (j && j.error === 'offline') throw Object.assign(new Error('offline'), { offline: true });
        return j;
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }

  /** Human explanation for a failed lookup. */
  function explain(e) {
    if (!navigator.onLine || (e && (e.offline || e.status === 503))) return 'You are offline. The scan is saved and will be looked up when you reconnect.';
    if (e && /abort/i.test(e.name || e.message || '')) return 'The catalogue is slow right now. Try again in a moment.';
    if (e && e.status === 404) return 'Open Library has no record with that number.';
    return 'Could not reach Open Library. Check your connection and try again.';
  }

  /* ---------------- ISBN ---------------- */

  function clean(raw) {
    return String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  }

  function isValid10(s) {
    if (!/^[0-9]{9}[0-9X]$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 10; i++) {
      var c = s[i] === 'X' ? 10 : +s[i];
      sum += c * (10 - i);
    }
    return sum % 11 === 0;
  }

  function isValid13(s) {
    if (!/^[0-9]{13}$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 13; i++) sum += (+s[i]) * (i % 2 ? 3 : 1);
    return sum % 10 === 0;
  }

  function to13(s) {
    if (isValid13(s)) return s;
    if (!isValid10(s)) return null;
    var core = '978' + s.slice(0, 9), sum = 0;
    for (var i = 0; i < 12; i++) sum += (+core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }

  /**
   * Classify a scanned EAN-13 / typed number.
   * Returns { ok, isbn13, isbn10, reason }.
   * Books carry a 978/979 EAN. A 977 prefix is a magazine (ISSN) and a
   * 2 or 5 digit add-on is a price code; both are common false positives
   * at a shelf, so they are named rather than sent to the API.
   */
  function classify(raw) {
    var s = clean(raw);
    if (!s) return { ok: false, reason: 'Nothing to look up.' };
    if (s.length === 5 || s.length === 2) return { ok: false, reason: 'That is the price add-on beside the barcode. Aim at the longer one.' };
    if (/^977/.test(s)) return { ok: false, reason: 'That barcode belongs to a magazine or journal, not a book.' };
    if (s.length === 13 && !/^97[89]/.test(s)) return { ok: false, reason: 'That is a product barcode, not a book ISBN.' };
    if (s.length === 8 || s.length === 12) return { ok: false, reason: 'That is a product barcode, not a book ISBN.' };
    var i13 = to13(s);
    if (!i13) return { ok: false, reason: s.length < 10 ? 'An ISBN is 10 or 13 digits.' : 'That number fails its ISBN check digit.' };
    return { ok: true, isbn13: i13, isbn10: isValid10(s) ? s : null };
  }

  /** Print an ISBN-13 with the conventional hyphens (group and check). */
  function pretty(i13) {
    if (!i13 || i13.length !== 13) return i13 || '';
    return i13.slice(0, 3) + '-' + i13.slice(3, 12) + '-' + i13.slice(12);
  }

  /* ---------------- normalisation ---------------- */

  function textOf(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (typeof d.value === 'string') return d.value;
    return '';
  }

  function tidyBlurb(s) {
    return String(s || '')
      .replace(/\r/g, '')
      .replace(/^\s*from wikipedia:?\s*/i, '')
      // Open Library descriptions often carry a trailing source credit.
      .replace(/\n?-{2,}\s*\n?[\s\S]*$/, '')
      .replace(/\(\s*\[?source[^)]*\)/gi, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // markdown links → text
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function yearOf(str) {
    var m = String(str || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    return m ? +m[1] : null;
  }

  function coverFor(o) {
    if (o.coverId) return COVERS + '/b/id/' + o.coverId + '-L.jpg?default=false';
    if (o.isbn13) return COVERS + '/b/isbn/' + o.isbn13 + '-L.jpg?default=false';
    return null;
  }

  function uniq(arr) {
    var seen = {};
    return arr.filter(function (x) {
      var k = String(x).toLowerCase();
      if (!x || seen[k]) return false;
      seen[k] = 1; return true;
    });
  }

  /**
   * Full lookup for one ISBN. Edition record and readable summary are
   * fetched together; the work record (which holds the blurb) is a second
   * hop because its key only exists inside the edition. If neither direct
   * endpoint knows the number, the search index is tried, which sometimes
   * has editions the ISBN route lacks.
   */
  function byIsbn(isbn13, isbn10) {
    var edition = getJSON(OL + '/isbn/' + isbn13 + '.json').catch(function (e) {
      if (e.offline) throw e;
      return isbn10 ? getJSON(OL + '/isbn/' + isbn10 + '.json').catch(function () { return null; }) : null;
    });
    var summary = getJSON(OL + '/api/books?bibkeys=ISBN:' + isbn13 + '&format=json&jscmd=data')
      .then(function (j) { return j['ISBN:' + isbn13] || null; })
      .catch(function (e) { if (e.offline) throw e; return null; });

    return Promise.all([edition, summary]).then(function (res) {
      var ed = res[0], sm = res[1];
      if (!ed && !sm) {
        return search('isbn:' + isbn13, 1).then(function (hits) {
          if (!hits.length) return null;
          return hydrate(Object.assign(hits[0], { isbn13: isbn13 }), true);
        }).catch(function () { return null; });
      }

      var workKey = ed && ed.works && ed.works[0] && ed.works[0].key;
      var work = workKey ? getJSON(OL + workKey + '.json').catch(function () { return null; }) : Promise.resolve(null);

      return work.then(function (wk) {
        var subjects = [];
        if (sm && sm.subjects) subjects = sm.subjects.map(function (s) { return s.name; });
        if (wk && wk.subjects) subjects = subjects.concat(wk.subjects);
        subjects = uniq(subjects);

        var authors = [];
        if (sm && sm.authors) authors = sm.authors.map(function (a) { return a.name; });

        var coverId = (ed && ed.covers && ed.covers[0] > 0 && ed.covers[0]) || (wk && wk.covers && wk.covers[0] > 0 && wk.covers[0]) || null;
        var publishDate = (sm && sm.publish_date) || (ed && ed.publish_date) || (wk && wk.first_publish_date) || '';

        return {
          isbn13: isbn13,
          isbn10: isbn10 || (ed && ed.isbn_10 && ed.isbn_10[0]) || null,
          olKey: workKey || (ed && ed.key) || null,
          title: (sm && sm.title) || (ed && ed.title) || (wk && wk.title) || 'Untitled',
          subtitle: (sm && sm.subtitle) || (ed && ed.subtitle) || '',
          authors: uniq(authors),
          publisher: (sm && sm.publishers && sm.publishers[0] && sm.publishers[0].name) ||
                     (ed && ed.publishers && ed.publishers[0]) || '',
          publishDate: publishDate,
          year: yearOf(publishDate),
          pages: (sm && sm.number_of_pages) || (ed && ed.number_of_pages) || null,
          format: (ed && ed.physical_format) || '',
          subjects: subjects.slice(0, 12),
          description: tidyBlurb(textOf(wk && wk.description) || textOf(ed && ed.description)),
          cover: coverFor({ coverId: coverId, isbn13: isbn13 }),
          olUrl: OL + (workKey || '/isbn/' + isbn13)
        };
      });
    });
  }

  /** Free-text search, used for OCR results. Returns ranked candidates. */
  function search(q, limit) {
    var url = OL + '/search.json?q=' + encodeURIComponent(q) +
      '&limit=' + (limit || 6) +
      '&fields=key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject,publisher';
    return getJSON(url).then(function (j) {
      return (j.docs || []).map(function (d) {
        var isbns = d.isbn || [];
        var isbn = isbns.filter(function (x) { return x.length === 13 && /^97[89]/.test(x); })[0] || isbns[0] || null;
        return {
          title: d.title || 'Untitled',
          authors: d.author_name || [],
          year: d.first_publish_year || null,
          pages: d.number_of_pages_median || null,
          publisher: (d.publisher || [])[0] || '',
          subjects: (d.subject || []).slice(0, 12),
          isbn13: isbn && isbn.length === 13 ? isbn : (isbn ? to13(isbn) : null),
          olKey: d.key || null,
          cover: d.cover_i ? COVERS + '/b/id/' + d.cover_i + '-L.jpg?default=false' : null,
          olUrl: OL + (d.key || '')
        };
      });
    });
  }

  /** Fill in blurb/publisher for a search hit the user picked. */
  function hydrate(hit, shallow) {
    if (hit.isbn13 && !shallow) {
      return byIsbn(hit.isbn13, null).then(function (full) { return full || hit; }).catch(function () { return hit; });
    }
    if (!hit.olKey) return Promise.resolve(hit);
    return getJSON(OL + hit.olKey + '.json').then(function (wk) {
      hit.description = tidyBlurb(textOf(wk && wk.description));
      if ((!hit.subjects || !hit.subjects.length) && wk && wk.subjects) hit.subjects = wk.subjects.slice(0, 12);
      if (!hit.cover && wk && wk.covers && wk.covers[0] > 0) hit.cover = COVERS + '/b/id/' + wk.covers[0] + '-L.jpg?default=false';
      return hit;
    }).catch(function () { return hit; });
  }

  global.API = {
    classify: classify,
    pretty: pretty,
    byIsbn: byIsbn,
    search: search,
    hydrate: hydrate,
    explain: explain,
    clean: clean,
    to13: to13
  };
})(window);
