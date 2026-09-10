# Spine

A Progressive Web App that reads a book's barcode or its cover with the phone
camera and files it on a personal shelf with the real catalogue record: pages,
publisher, subjects, blurb, cover. Pure HTML, CSS and vanilla JavaScript, no
build step, no framework, no bundler, no account, no server of its own.

Live URL once deployed: `https://sultan-alkaabi-hub.github.io/app/`

---

## What is in the box

```
index.html            app shell, every view
manifest.json         installable, maskable icons, "Scan" shortcut
sw.js                 service worker: offline shell, cover cache, engine cache
.nojekyll             tells GitHub Pages to serve files verbatim
assets/css/app.css    design system and all styling
assets/js/pixel.js    Otto the archivist (24x24 pixel sprite) and the intro dust
assets/js/api.js      Open Library access, ISBN validation
assets/js/scanner.js  camera, barcode engines, OCR, offline warm-up
assets/js/app.js      router, shelf, offline queue, statistics, settings
icons/                192, 512, maskable, apple-touch
```

---

## Deploying to GitHub Pages

1. In the `Sultan-AlKaabi-hub/app` repository, upload every file and folder in
   this package to the repository root, keeping the structure exactly as it is.
   `index.html` must sit at the top level next to `manifest.json` and `sw.js`.
2. **Settings → Pages**. Under **Source** choose **Deploy from a branch**, set
   the branch to `main` and the folder to `/ (root)`. Save.
3. Wait about a minute. The app appears at
   `https://sultan-alkaabi-hub.github.io/app/`.

Every path in the project is relative (`./assets/...`), so the app works from
the `/app/` subfolder without configuration. If you rename the repository the
URL changes but nothing in the code needs to.

Uploading from the command line:

```bash
git init && git add -A && git commit -m "Spine 1.1.0" && git branch -M main && git remote add origin https://github.com/Sultan-AlKaabi-hub/app.git && git push -u origin main
```

**Why HTTPS matters.** `getUserMedia` only runs in a secure context. GitHub
Pages serves HTTPS by default. A plain-HTTP host can never open the camera, and
the app tells the user so instead of failing silently.

**After every change to a shell file, bump `VERSION` in `sw.js`.** The shell is
served cache-first; without a new version string, returning users keep the old
copy until the browser's own SW update check kicks in. When a new version lands
the app shows a "Reload" pill.

---

## Wrapping with Median.co

1. Create a Median app and point it at the GitHub Pages URL above.
2. **Permissions** — enable camera access. Without it the WebView refuses
   `getUserMedia` no matter what the web code does.
3. **iOS** — set `NSCameraUsageDescription`, for example
   *"Spine uses the camera to scan book barcodes and covers."* iOS kills the
   app rather than prompting if this string is missing.
4. **iOS** — allow inline media playback so the camera preview does not open in
   the fullscreen video player. Median enables this by default; confirm it.
5. **Android** — grant `android.permission.CAMERA`.
6. Optional: enable **app-bound domains** for the Pages origin on iOS so
   WKWebView runs the service worker and the app caches offline. Without it iOS
   loses caching only; scanning and the shelf still work.

The first time the camera opens, the browser (or the wrapper) shows the
permission prompt. The app explains every denial state in plain language and
offers "Type an ISBN instead" as a way through.

### Publishing the APK so the in-app QR code works

The intro screen and Settings have a **Get the app** button that shows a QR
code and link. The Android link points at
`https://github.com/Sultan-AlKaabi-hub/app/releases/latest/download/spine.apk`,
which GitHub resolves to the newest release asset with that name. To make it
live:

1. Download the APK from Median and rename it to exactly `spine.apk`.
2. On GitHub: **Releases → Draft a new release**. Tag it (for example
   `v1.1.2`), attach `spine.apk`, publish.
3. Every later build: draft a new release, attach the new `spine.apk`. The
   link and the QR code never need to change.

The iPhone panel points at the site itself, because iOS installs web apps
through Safari's **Share → Add to Home Screen** and cannot sideload a package.
To point the Android link somewhere else (a Median-hosted URL, say), change
`SHARE.apk` at the top of `assets/js/app.js` and bump `VERSION` in `sw.js`.

### If the APK says it has no camera permission and never asks

That means the wrapper itself was built without the camera permission, so
Android never shows a prompt and the WebView reports "denied" immediately.
In the Median App Studio:

1. **Native Plugins → Permissions** (or **Android → Permissions** depending
   on the console layout): turn **Camera** on. Save.
2. **Rebuild** the Android app and reinstall the new APK. Permissions live in
   the APK manifest; editing the website cannot add them.
3. On the phone, confirm **Settings › Apps › Spine › Permissions** now lists
   Camera. Allow it, or leave it and the app will prompt on first scan.

Android also drops the page to "hidden" while the permission dialog is up.
Version 1.1.1 leaves a pending camera request alone during that moment; the
1.1.0 build tore it down and restarted it, which re-opened the dialog in a
loop and, on the web, produced "camera is used by another app".

---

## How scanning works

### Barcode, best engine first

| Engine | Where | Network |
| --- | --- | --- |
| Native `BarcodeDetector` | Chrome, Android WebView | none, ever |
| html5-qrcode (ZXing port), jsDelivr | Safari, iOS WKWebView, desktop | once, then cached |

Chrome on Windows and Linux exposes `BarcodeDetector` but has no detection
service behind it, so every `detect()` throws. The scanner counts a run of
failures and drops to the web engine rather than spinning. The engine in use is
shown as a small badge at the top of the scanner.

Only 978 and 979 prefixes are accepted. A 977 prefix (magazine ISSN), an 8 or
12 digit product code and the 2 or 5 digit price add-on beside the main barcode
are rejected by name because all three are common misfires at a shelf. Every
number is verified against its ISBN check digit before a request is made.

### Cover text

Tesseract.js, downloaded on first use only. OCR is unreliable on stylised
covers, so a cover scan never adds a book directly; it searches Open Library
and presents a shortlist with covers to confirm. Frames are cropped to the
reticle, converted to luma and contrast-stretched before recognition, which
measurably improves results over a raw colour photograph.

### Catalogue data

[Open Library](https://openlibrary.org), a free public catalogue run by the
Internet Archive. No API key, no quota tier, CORS enabled.

| Endpoint | Used for |
| --- | --- |
| `/isbn/{isbn}.json` | edition record, work key |
| `/api/books?bibkeys=ISBN:` | authors, publisher, subjects |
| `/works/{id}.json` | description |
| `/search.json` | text search for OCR results; ISBN fallback |
| `covers.openlibrary.org` | cover images (CORS-enabled, used for colour sampling) |

Open Library can take 5 to 12 seconds on a cold request. The app allows 20 s
and the service worker 15 s before treating a lookup as failed.

---

## Offline behaviour

| Situation | What happens |
| --- | --- |
| App shell | Cached on first visit. Launches offline from the home screen. |
| Barcode scan, native engine | Works with no network at all. |
| Barcode scan, web engine | Works offline after one online scan, or after **Settings → Prepare for offline**. |
| Cover scan (OCR) | Needs one online run (or Prepare for offline) to fetch the worker, WASM core and English model. After that it runs offline. |
| Catalogue lookup | Needs network. Offline scans are filed as **pending** books showing the ISBN, and are resolved automatically the moment the device reconnects, on next launch, or from the book's "Try the lookup again" button. |
| Covers | Cached as they are viewed; up to 300. |
| Catalogue JSON | Last 200 responses cached; served when the network fails. |

A pill at the top of the screen says "Offline — scans are saved for later"
while there is no connection, and "Back online" briefly when it returns.

---

## Help, FAQ and Ask Otto

`assets/js/faq.js` is the single source for three things: the Help page
(Settings → Help & FAQ), Otto's built-in answers in the chat sheet, and the
knowledge base PDF. Edit the questions there and rebuild the PDF:

```bash
python docs/build-knowledge-base.py
```

The PDF lands at `docs/spine-knowledge-base.pdf`. Its last section lists the
external pages to print to PDF as companion documents for the agent.

### The Otto panel

Otto lives in a 56 px round button at the bottom right of the shelf, Reading
and Settings pages. Tapping it grows a compact panel out of the button
(spring animation, anchored above the tab bar, at most about a third of a
phone screen, up to 400 px wide on larger screens). It closes on the X, on
Escape, on a tap outside, and whenever the scanner opens. Everything is in
the app's own palette; nothing white is injected.

Inside: an animated Otto whose beak moves while speaking, a transcript,
suggestion chips, a text field, a microphone button and a mute toggle. A
typing indicator shows while an answer is on its way. Recommendations render
as a row of small covers that open the Open Library record.

### Where answers come from (`assets/js/otto.js`)

| Source | Used for | Network |
| --- | --- | --- |
| The user's shelf (`window.Shelf`) | counts, statuses, one book's details | none |
| Open Library subject search (`Shelf.recommend`) | "what should I read next", "something like X" | yes |
| ElevenLabs agent via `@elevenlabs/client` (mode `client`, default) | everything else, text and voice | yes |
| Built-in FAQ (`faq.js`) with browser speech | fallback when the agent is unreachable or unset | none |

Text goes to the agent over a text-only WebSocket session; the microphone
button opens a voice session in which the agent listens and speaks. The
agent's configured greeting is suppressed in text sessions because Otto has
already said hello. Setting `mode` to `'widget'` restores the official
ElevenLabs bubble; `'off'` hides Otto entirely.

### Arabic

Otto speaks English and Arabic. The EN / ع button in the panel header (and
"Otto's language" in Settings) sets the default; writing in the other
script switches automatically for that message. Shelf questions are
answered locally in Arabic (counts, statuses, one book's details,
recommendations); everything else goes to the agent with a language
override so the ElevenLabs session runs in Arabic, using the multilingual
speech model set in the agent's Arabic language preset. The browser's own
Arabic voice is used for local answers when one is installed.

Agent configuration (done through the API, visible in the dashboard):
four client tools attached (`get_shelf_summary`, `find_book`, `list_books`,
`recommend_books`), a section "8. The user's own shelf (tools)" appended to
the system prompt, Otto's greeting in English and Arabic, and the Arabic
preset on `eleven_flash_v2_5`. To give Otto a native Arabic voice, open
Agent → Language → Arabic and pick an Arabic voice for that preset.

### Recommendations

`Shelf.recommend(seedId)` takes the subjects of one book (or the most common
subjects across the shelf, skipping generic ones like "fiction"), queries
Open Library's search index sorted by reader rating, drops anything already
on the shelf or with fewer than five ratings, and returns up to four titles
with covers. Otto answers "what should I read next", "recommend something",
"something like 1984" and the `recommend_books` client tool exposes the same
to the agent.

### Connecting the ElevenLabs agent

1. In ElevenLabs, create a Conversational AI agent. Upload
   `docs/spine-knowledge-base.pdf` to its knowledge base, plus any companion
   PDFs. Paste the suggested system prompt from the last page of the PDF.
2. Make the agent **public** (no authentication) so the browser can connect
   without a server, or host your own signed-URL endpoint.
3. Copy the `agent-id` from the embed snippet the dashboard shows. It looks
   like `<elevenlabs-convai agent-id="abc123..."></elevenlabs-convai>`.
4. Open `assets/js/otto.js` and set:

   ```js
   var ELEVENLABS = {
     agentId: 'abc123...',   // from the snippet
     mode: 'widget',         // or 'client' to keep Spine's own chat sheet
     ...
   };
   ```

5. Bump `VERSION` in `sw.js`, commit, push. The widget script loads from
   `unpkg.com`, which the service worker already caches.

### Otto knows the user's shelf

Otto answers questions about the user's own books: how many they have, how
many are finished, reading or still to read, what they are reading now, the
newest book, the most shelved author, and details of one book (author,
first publication year and edition year, pages, publisher, subjects, blurb,
ISBN, reading status). Examples: "how many books do I have", "what am I
reading", "who wrote 1984", "when was Dune published", "do I have Dracula".

- **Local chat** parses these directly (`shelfAnswer` in `otto.js`) and reads
  `window.Shelf`, a read-only API exposed by `app.js`.
- **ElevenLabs** gets the same data through three **client tools** that run
  in the browser, so the shelf never leaves the phone:
  `get_shelf_summary`, `find_book(query)`, `list_books(status, limit)`.
  Register them on the agent (Agent → Tools → Add tool → Client) using the
  exact names and parameters in `docs/elevenlabs-client-tools.json`, and add
  the `prompt_addition` from that file to the system prompt. The widget also
  passes `book_count`, `finished_count`, `reading_count`, `to_read_count`
  and `pages_read` as dynamic variables, usable in the prompt as
  `{{book_count}}`.

In widget mode the ElevenLabs bubble replaces the local Otto button and is
hidden on the scanner view so it never covers the camera. Client mode is
implemented against the documented `Conversation.startSession` API but has
not been exercised against a live agent yet; test it once the agent exists
and fall back to widget mode if anything misbehaves.

## Data and privacy

The shelf is held in `localStorage` on the device. Nothing is uploaded, there is
no account, and no analytics run. Settings → Export writes a JSON file that can
be re-imported on another device; import merges by ISBN, validates every field
and only accepts Open Library URLs.

---

## Accessibility

Touch targets are at least 44 px. Focus is visible throughout and moves into
sheets when they open and back when they close. Motion respects both
`prefers-reduced-motion` and an in-app toggle: the reticle sweep, page-turn,
parallax, count-ups and Otto's idle animation all stop. Live regions announce
scan results, lookup progress and network changes. Escape closes any sheet.

---

## Testing checklist

Verified on a 375×812 mobile viewport during development:

- Intro: lamp flicker, spine rise, letter reveal, install button appears when the browser fires `beforeinstallprompt`.
- Tutorial: five steps, Otto waves, talks while typing, holds the book, follows the pointer with his eyes.
- Scanner: engine badge, torch button when the track supports it, mode pill alignment, every camera error state.
- Manual ISBN: validation copy for check digit, price add-on, ISSN, product codes.
- Lookup: live record for `978-0-14-044913-6` including pages, year, publisher, cover tint.
- Offline: pill, pending book, automatic resolution on reconnect, toast.
- Shelf: grid view, spine view (widths from page count, colours sampled from covers), search, status filters.
- Statistics: count-up, donut draw, author/subject/decade bars.
- Settings: export, import, prepare for offline, confirm sheet for delete.
- Service worker: registers, shell cached, engine cache separate from shell version.

On a physical phone, also confirm: the camera permission prompt appears on
first scan; EAN-13 locks in under a second under normal light; the torch
toggle works in the dark; the app installs to the home screen and launches
full screen; airplane mode still scans and files pending books.

---

## Known limits

- OCR misreads stylised and script typefaces. The barcode path is the reliable
  one; the cover path is a convenience for books published before barcodes.
- Open Library coverage is uneven. Some editions have no cover, page count or
  blurb. The app shows a typographic bookplate rather than a broken image, and
  says plainly when a blurb is missing.
- `localStorage` holds roughly 5 MB. Only text is stored (covers are URLs), so
  this is thousands of books, but the app warns and suggests exporting if a
  write ever fails.
- Desktop Safari has neither `BarcodeDetector` nor torch support; it uses the
  web engine and hides the torch button.
