"""
Build docs/spine-knowledge-base.pdf for the ElevenLabs agent.

Reads the FAQ straight out of assets/js/faq.js (via Node) so the PDF, the
in-app help and Otto's offline answers can never drift apart. Run from the
repository root:

    python docs/build-knowledge-base.py

Requires: node, reportlab (python -m pip install reportlab)
"""
import json
import os
import subprocess
import sys
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'spine-knowledge-base.pdf')
SITE = 'https://sultan-alkaabi-hub.github.io/app/'
REPO = 'https://github.com/Sultan-AlKaabi-hub/app'
VERSION = '1.2.0'


def load_faq():
    js = "global.window={};require(%s);process.stdout.write(JSON.stringify(window.FAQ));" % json.dumps(
        os.path.join(ROOT, 'assets', 'js', 'faq.js').replace('\\', '/'))
    out = subprocess.check_output(['node', '-e', js], cwd=ROOT)
    return json.loads(out)


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


styles = getSampleStyleSheet()
INK = colors.HexColor('#0C1020')
BRASS = colors.HexColor('#A87A24')
MUTED = colors.HexColor('#555B70')
H1 = ParagraphStyle('H1', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=24, leading=30, textColor=INK, alignment=TA_LEFT, spaceAfter=4)
H2 = ParagraphStyle('H2', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=15, leading=19, textColor=BRASS, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle('H3', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=2)
BODY = ParagraphStyle('Body', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=14.5, textColor=colors.HexColor('#1B1F2E'))
SMALL = ParagraphStyle('Small', parent=BODY, fontSize=8.5, leading=12, textColor=MUTED)
BUL = ParagraphStyle('Bul', parent=BODY, leftIndent=12, bulletIndent=2)


def bullets(items):
    return [Paragraph(esc(t), BUL, bulletText='•') for t in items]


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 12 * mm, 'Spine knowledge base · v%s · %s' % (VERSION, date.today().isoformat()))
    canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, 'Page %d' % doc.page)
    canvas.restoreState()


def build():
    faq = load_faq()
    doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
                            title='Spine knowledge base', author='Spine', subject='Help content for the Otto voice and text agent')
    s = []

    # ---- cover / purpose
    s.append(Paragraph('Spine — knowledge base for Otto', H1))
    s.append(Paragraph('Everything the help agent needs to answer questions about the Spine book scanner. '
                       'Written in plain language so it can be read aloud.', SMALL))
    s.append(Spacer(1, 10))
    s.append(Paragraph('About this document', H2))
    s.append(Paragraph(esc(
        'This file is the primary knowledge base for "Otto", the archivist owl who answers user questions inside the Spine app '
        'by text and by voice. It is generated from the same FAQ file the app ships with, so answers here match what users read '
        'on the Help page. Upload it to the agent\'s knowledge base in ElevenLabs. Companion PDFs for deeper technical topics '
        'are listed in the final section with links to their sources.'), BODY))

    # ---- persona
    s.append(Paragraph('Who Otto is and how he speaks', H2))
    s.extend(bullets([
        'Otto is a pixel-art owl, the archivist of the user\'s bookshelf. Warm, brief, a little dry, never sarcastic.',
        'Answers in two to four short sentences. Offers one concrete next step. Does not read long lists aloud.',
        'Uses the names the app uses: Shelf, Scan, Reading tab, Cover text, To read, Reading, Finished, Prepare for offline, Get the app.',
        'If a question is outside Spine (general book recommendations, unrelated apps), says so kindly and steers back to the shelf.',
        'Never asks for passwords, payment details or personal information. Spine has no accounts.',
        'If unsure, says "I am not certain" and suggests the Help page in Settings rather than guessing.',
    ]))

    # ---- product facts
    s.append(Paragraph('Product facts', H2))
    facts = [
        ['Name', 'Spine'],
        ['What it is', 'A progressive web app that scans book barcodes and covers with the phone camera and files each book on a personal shelf with its catalogue record.'],
        ['Web address', SITE],
        ['Platforms', 'Any modern browser. Installable on Android (Chrome "Install app", or an APK) and iPhone (Safari "Add to Home Screen").'],
        ['Version', VERSION],
        ['Data source', 'Open Library, a free public catalogue run by the Internet Archive. No API key.'],
        ['Accounts', 'None. Nothing is uploaded. The shelf is stored in the browser on the device.'],
        ['Barcode engines', 'The phone\'s built-in barcode detector where available ("On-device engine"); otherwise a JavaScript decoder downloaded once ("Web engine").'],
        ['Cover reading', 'Optical character recognition on the front cover, then a shortlist of matching editions for the user to confirm.'],
        ['Valid ISBNs', 'Start with 978 or 979, 10 or 13 digits, and pass the check digit. 977 is a magazine. Two or five digit codes are price add-ons.'],
        ['Offline', 'App opens offline. Barcode scanning works offline on phones with a built-in detector. Lookups need internet; offline scans are saved as pending books and resolved on reconnect.'],
        ['Reading statuses', 'To read, Reading, Finished.'],
        ['Views', 'Cover grid, or spines standing on wooden shelves (widths from page count, colours sampled from covers).'],
        ['Statistics', 'Books on shelf, finished, pages read, authors, status breakdown, top authors, subjects, decades of publication.'],
        ['Backup', 'Settings → Export your shelf writes a JSON file. Import merges by ISBN.'],
        ['Timeouts', 'Open Library can take 5–12 seconds cold. The app waits up to 20 seconds, then keeps the scan as pending.'],
    ]
    t = Table([[Paragraph('<b>%s</b>' % esc(k), BODY), Paragraph(esc(v), BODY)] for k, v in facts], colWidths=[36 * mm, 138 * mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, colors.HexColor('#D9D4C7')),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    s.append(t)

    # ---- how to use, step by step
    s.append(Paragraph('Step by step: how the app is used', H2))
    s.append(Paragraph('First launch', H3))
    s.extend(bullets([
        'The intro screen shows a lamp-lit bookshelf with three buttons: Start scanning, Show me how it works, and Get the app on your phone.',
        'Show me how it works starts Otto\'s five-step walkthrough: two ways to scan, the barcode, the cover, where the data comes from, and what happens offline.',
        'Start scanning opens the walkthrough the first time; afterwards it opens the shelf, or the scanner if the shelf is empty.',
    ]))
    s.append(Paragraph('Scanning a barcode', H3))
    s.extend(bullets([
        'Tap the round scan button in the middle of the bottom bar. The camera opens with a frame in the middle.',
        'The first time, the browser asks for camera permission. Allow it.',
        'Flip the book over and hold the barcode inside the frame. The corners turn green and the phone vibrates when it locks on.',
        'Spine fetches the record and opens the book sheet: cover, title, author, publisher, pages, year, status buttons, blurb, subjects, and a link to the catalogue record.',
        'If the book is already on the shelf, Spine says so and opens it instead of adding a duplicate.',
    ]))
    s.append(Paragraph('Scanning a cover', H3))
    s.extend(bullets([
        'On the scanner, tap Cover text in the switch at the bottom. The frame becomes portrait.',
        'Fill the frame with the front cover and tap the round white button. The first time, the text reader downloads (a few megabytes).',
        'Spine reads the printed text and shows a shortlist of matching editions with covers. Tap the right one. Or close it and use the barcode instead.',
    ]))
    s.append(Paragraph('Typing an ISBN', H3))
    s.extend(bullets([
        'Tap the keypad icon at the top right of the scanner, or "Type an ISBN instead" on any camera error.',
        'Enter the 10 or 13 digit number. Spine explains any problem: wrong check digit, magazine code, price add-on, product barcode.',
    ]))
    s.append(Paragraph('The shelf', H3))
    s.extend(bullets([
        'Books appear newest first. Filter chips: All, Reading, To read, Finished.',
        'The magnifier searches title, author, subject and ISBN. The button beside it toggles the spine view.',
        'Tap a book to open it. Change status, read the blurb, open the catalogue record, or remove it.',
        'Pending books (scanned offline) show "ISBN" on a striped jacket and are looked up automatically when online.',
    ]))
    s.append(Paragraph('Settings', H3))
    s.extend(bullets([
        'Install Spine (when the browser offers it), Get the app on another phone (QR code and links), Prepare for offline, Vibrate on a match, Reduce motion, Help & FAQ, Ask Otto, Replay the walkthrough, Export, Import, Delete everything.',
        'A new-version pill with a Reload button appears when a newer build is published.',
    ]))
    s.append(Paragraph('Asking Otto', H3))
    s.extend(bullets([
        'The Otto button at the bottom right of the shelf, Reading and Settings pages opens the chat.',
        'Type a question, or tap the microphone and speak. Otto replies in text and reads it aloud; the speaker icon mutes him.',
    ]))

    # ---- troubleshooting quick table
    s.append(Paragraph('Troubleshooting quick reference', H2))
    rows = [
        ['Symptom', 'Cause', 'What to say'],
        ['"This page is not secure"', 'Opened over http', 'Open the https address. Camera access needs HTTPS.'],
        ['"Camera permission is off"', 'Permission denied in browser', 'Android: lock icon → Permissions → Camera → Allow. iPhone: Settings → Safari → Camera. Then Try again.'],
        ['"This app build cannot use the camera"', 'Installed package built without camera permission', 'Phone Settings → Apps → Spine → Permissions → Camera. If no Camera entry, the app must be rebuilt with the permission. Use the browser meanwhile.'],
        ['"No camera found"', 'Device has no camera the browser can reach', 'Type the ISBN instead.'],
        ['"The camera is busy"', 'Another app or tab holds the camera', 'Close other camera apps and tabs, wait a second, Try again.'],
        ['Barcode rejected as magazine / price / product', 'Wrong barcode', 'Aim at the long barcode starting 978 or 979.'],
        ['Lookup slow or timed out', 'Open Library cold request', 'Wait; the scan is kept as pending and retried. Or "Try the lookup again" inside the book.'],
        ['No cover / blurb / pages', 'Gaps in Open Library', 'Normal for some editions. The catalogue link lets users add details.'],
        ['Cover scan wrong book', 'OCR misread', 'Pick from the shortlist, or scan the barcode. More light, flat angle.'],
        ['Offline pill at the top', 'No connection', 'Scanning still works; records arrive when back online.'],
    ]
    tt = Table([[Paragraph(esc(c), SMALL if i else ParagraphStyle('th', parent=SMALL, fontName='Helvetica-Bold', textColor=INK)) for c in r] for i, r in enumerate(rows)],
               colWidths=[46 * mm, 44 * mm, 84 * mm], repeatRows=1)
    tt.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1EBDC')),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, colors.HexColor('#D9D4C7')),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    s.append(tt)

    # ---- FAQ
    s.append(PageBreak())
    s.append(Paragraph('Frequently asked questions', H1))
    s.append(Paragraph('Identical to the Help page inside the app. Each answer is written to be spoken.', SMALL))
    for sec in faq:
        s.append(Paragraph(esc(sec['section']), H2))
        for it in sec['items']:
            block = [Paragraph('Q: ' + esc(it['q']), H3), Paragraph(esc(it['a']), BODY)]
            if it.get('k'):
                block.append(Paragraph('Also asked as: ' + esc(', '.join(it['k'])), SMALL))
            s.append(KeepTogether(block))

    # ---- glossary
    s.append(Paragraph('Glossary', H2))
    for term, definition in [
        ('ISBN', 'International Standard Book Number. 13 digits starting 978 or 979 (older books: 10 digits). Printed under the barcode on the back cover. Identifies one edition.'),
        ('EAN-13', 'The barcode format that carries the ISBN on books.'),
        ('Open Library', 'Free public book catalogue run by the Internet Archive, at openlibrary.org. Source of all book data in Spine.'),
        ('PWA', 'Progressive web app. A website that installs like an app, opens full screen and works offline.'),
        ('OCR', 'Optical character recognition. Reading printed text from a photo. Used for cover scanning.'),
        ('Pending book', 'A book scanned without internet. Shows its ISBN until the record is fetched.'),
        ('Service worker', 'The part of the app that caches it for offline use and shows the Reload pill on updates.'),
        ('Median', 'A service that wraps the website in a native Android or iOS app. The wrapper must be built with camera permission.'),
    ]:
        s.append(Paragraph('<b>%s</b> — %s' % (esc(term), esc(definition)), BODY))

    # ---- companion sources
    s.append(PageBreak())
    s.append(Paragraph('Companion PDFs: sources to export for the knowledge base', H1))
    s.append(Paragraph(esc('Open each link, print or save the page as PDF, and upload it alongside this document. '
                           'The first group covers the app itself; the rest give the agent accurate background on the technologies users ask about.'), BODY))
    groups = [
        ('The app itself', [
            ('Spine live site (open, then print to PDF the intro, the Help page and Settings)', SITE),
            ('Spine README with deployment, Median and offline details', REPO + '#readme'),
            ('Spine source repository', REPO),
        ]),
        ('Book data and ISBNs', [
            ('Open Library developer documentation', 'https://openlibrary.org/developers/api'),
            ('Open Library Books API (ISBN lookups)', 'https://openlibrary.org/dev/docs/api/books'),
            ('Open Library Search API', 'https://openlibrary.org/dev/docs/api/search'),
            ('Open Library Covers API', 'https://openlibrary.org/dev/docs/api/covers'),
            ('ISBN user manual, International ISBN Agency', 'https://www.isbn-international.org/content/isbn-users-manual'),
            ('EAN-13 and Bookland explained (GS1)', 'https://www.gs1.org/standards/barcodes/ean-upc'),
        ]),
        ('Camera and scanning technology', [
            ('MDN: BarcodeDetector API', 'https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector'),
            ('MDN: getUserMedia and camera permissions', 'https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia'),
            ('html5-qrcode (web barcode engine) documentation', 'https://scanapp.org/html5-qrcode-docs/'),
            ('Tesseract.js (cover text reader) documentation', 'https://github.com/naptha/tesseract.js#readme'),
            ('MDN: Web Speech API (Otto\'s browser voice fallback)', 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API'),
        ]),
        ('Installing and offline', [
            ('web.dev: Installing a PWA on Android and desktop', 'https://web.dev/learn/pwa/installation'),
            ('Apple: Add a website to the Home Screen on iPhone', 'https://support.apple.com/guide/iphone/bookmark-favorite-webpages-iph42ab2f3a7/ios'),
            ('Chrome help: Allow or block camera and microphone for a site', 'https://support.google.com/chrome/answer/2693767'),
            ('Apple: Control access to the camera in Safari', 'https://support.apple.com/guide/iphone/control-access-to-hardware-features-iph1b3dc7a2b/ios'),
            ('MDN: Service workers and offline caching', 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'),
        ]),
        ('App wrappers', [
            ('Median.co documentation', 'https://median.co/docs'),
            ('Median: Camera and permissions', 'https://median.co/docs/permissions'),
            ('GitHub Pages documentation', 'https://docs.github.com/en/pages'),
        ]),
        ('ElevenLabs agent setup', [
            ('ElevenLabs Conversational AI: knowledge base', 'https://elevenlabs.io/docs/conversational-ai/customization/knowledge-base'),
            ('ElevenLabs: embedding the widget', 'https://elevenlabs.io/docs/conversational-ai/customization/widget'),
            ('ElevenLabs JavaScript client SDK', 'https://elevenlabs.io/docs/conversational-ai/libraries/java-script'),
        ]),
    ]
    for title, links in groups:
        s.append(Paragraph(esc(title), H2))
        for label, url in links:
            s.append(Paragraph('%s<br/><font color="#A87A24"><link href="%s">%s</link></font>' % (esc(label), url, esc(url)), BUL, bulletText='•'))

    s.append(Spacer(1, 12))
    s.append(Paragraph('Suggested agent system prompt', H2))
    s.append(Paragraph(esc(
        'You are Otto, the archivist owl in the Spine book-scanner app. Answer only from the knowledge base. Keep replies to two to four '
        'spoken sentences and end with one concrete next step when there is a problem. Use the app\'s own names for buttons and pages. '
        'If the question is not about Spine, say so kindly in one sentence and offer to help with scanning, the shelf, offline use or '
        'installation. Never ask for personal information. If unsure, say you are not certain and point to Settings, Help & FAQ.'), BODY))

    doc.build(s, onFirstPage=on_page, onLaterPages=on_page)
    return OUT


if __name__ == '__main__':
    path = build()
    print('wrote', path, os.path.getsize(path), 'bytes')
