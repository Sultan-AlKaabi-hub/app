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
