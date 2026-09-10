/* =========================================================
   faq.js — Spine help content
   One source for three consumers: the FAQ page, Otto's offline
   answers in the chat sheet, and the ElevenLabs knowledge base
   PDF (docs/build-knowledge-base.py reads this file).
   Keep answers short, factual and in plain language; the voice
   agent reads them aloud.
   ========================================================= */
(function (global) {
  'use strict';

  global.FAQ = [
    {
      section: 'Getting started',
      items: [
        {
          q: 'What is Spine?',
          k: ['what is spine', 'about', 'what does this app do', 'purpose'],
          a: 'Spine is a book scanner and personal shelf. Point your phone camera at a book and Spine reads the barcode or the cover, looks the book up in the Open Library catalogue and files it on your shelf with its pages, publisher, subjects, blurb and cover. It runs in the browser as a progressive web app and can be installed on Android and iPhone.'
        },
        {
          q: 'How do I scan a book?',
          k: ['how do i scan', 'scan a book', 'how to scan', 'start scanning', 'add a book'],
          a: 'Tap the big scan button in the middle of the bottom bar. Flip the book over and hold the barcode inside the frame. Spine locks on in about a second, fetches the record and opens the book. For books without a barcode, switch to Cover text, fill the frame with the front cover and tap the round button.'
        },
        {
          q: 'Who is Otto?',
          k: ['otto', 'owl', 'mascot', 'who are you'],
          a: 'Otto is the archivist owl who runs the walkthrough and answers questions. He explains the two ways to scan, what happens offline, and where your data lives. You can replay his walkthrough from Settings, and talk to him from the Ask Otto button on any page.'
        },
        {
          q: 'Do I need an account?',
          k: ['account', 'sign up', 'login', 'log in', 'register'],
          a: 'No. Spine has no accounts and no server of its own. Your shelf is stored on your device and nothing is uploaded.'
        }
      ]
    },
    {
      section: 'Scanning',
      items: [
        {
          q: 'Which is better, barcode or cover?',
          k: ['barcode or cover', 'which is better', 'difference', 'barcode vs cover', 'cover text'],
          a: 'The barcode is exact. It carries the ISBN, which names the precise edition you are holding, and it reads instantly with almost no processing. Cover text uses optical character recognition, which is slower and can misread stylised fonts, so Spine shows you a shortlist to confirm rather than guessing. Use the barcode whenever the book has one.'
        },
        {
          q: 'The scanner says the barcode is a magazine or a price code. Why?',
          k: ['magazine', 'price', 'add-on', 'wrong barcode', 'not a book', 'product barcode', '977'],
          a: 'Book barcodes start with 978 or 979. A code starting with 977 belongs to a magazine or journal. The short two or five digit barcode printed next to the main one is the price add-on. Aim at the longer barcode. Ordinary product barcodes with 8 or 12 digits are not ISBNs either.'
        },
        {
          q: 'Can I type the ISBN instead?',
          k: ['type isbn', 'type the isbn', 'manual', 'enter isbn', 'keyboard', 'no camera'],
          a: 'Yes. On the scanner, tap the keypad icon at the top right, or choose Type an ISBN instead on any camera error. Enter the 10 or 13 digit number printed under the barcode. Dashes and spaces are fine, and Spine checks the number against its check digit before looking it up.'
        },
        {
          q: 'The cover scan found the wrong book.',
          k: ['wrong book', 'cover wrong', 'misread', 'ocr wrong', 'not the right book'],
          a: 'Cover reading is a best guess from the printed text, so Spine always shows a shortlist of matches instead of adding one automatically. Pick the right edition from the list, or close it and scan the barcode on the back for an exact match. More light, a flat angle and holding still improve results.'
        },
        {
          q: 'How do I turn on the flashlight?',
          k: ['flashlight', 'torch', 'dark', 'light', 'flash'],
          a: 'When the camera supports it, a flashlight button appears at the top right of the scanner. Tap it to toggle the torch. If the button is missing, the device or browser does not expose torch control, which is common on iPhone in Safari.'
        },
        {
          q: 'Which barcode engine is Spine using?',
          k: ['engine', 'on-device engine', 'web engine', 'badge', 'barcodedetector'],
          a: 'Spine uses the phone\'s built-in barcode detector when the browser has one, shown as On-device engine at the top of the scanner. It needs no download and works without a signal. Browsers without a built-in detector, such as Safari, get the Web engine, a JavaScript decoder that is downloaded once and then cached.'
        }
      ]
    },
    {
      section: 'Camera and permissions',
      items: [
        {
          q: 'The camera does not open.',
          k: ['camera does not open', 'camera not working', 'camera unavailable', 'no camera', 'black screen'],
          a: 'First check the message on the screen; Spine names the exact problem. Camera access only works on the secure https address, so make sure the address starts with https. If permission was denied earlier, allow it again in the browser or phone settings, then tap Try again. If the camera is busy, close other apps that might be using it. You can always type the ISBN instead.'
        },
        {
          q: 'How do I allow camera permission?',
          k: ['permission', 'allow camera', 'camera permission', 'denied', 'blocked'],
          a: 'On Android Chrome, tap the lock icon in the address bar, open Permissions and set Camera to Allow. On iPhone, open Settings, Safari, Camera and choose Allow, or Ask. In the installed app, open the phone Settings, Apps, Spine, Permissions and allow Camera. Then return to Spine and tap Try again.'
        },
        {
          q: 'The installed app never asks for the camera.',
          k: ['never asks', 'apk permission', 'app build', 'wrapper', 'median', 'no prompt'],
          a: 'That means the app package was built without the camera permission, so the phone cannot prompt for it. The package has to be rebuilt with the camera permission enabled in the app builder. Until then, use Spine in the browser at its https address, or install it from Chrome using Install app.'
        },
        {
          q: 'It says the camera is used by another app.',
          k: ['another app', 'camera busy', 'in use', 'could not start'],
          a: 'Another app or browser tab is holding the camera, or the phone is still releasing it from a moment ago. Close other camera apps and tabs, wait a second and tap Try again. Spine retries automatically once before showing this message.'
        }
      ]
    },
    {
      section: 'Offline and data',
      items: [
        {
          q: 'Does Spine work offline?',
          k: ['offline', 'no signal', 'no internet', 'airplane', 'without internet', 'no connection'],
          a: 'Mostly, yes. The app itself opens offline once it has loaded once. Barcode scanning works with no signal on phones with a built-in detector. The catalogue lookup needs the internet, so offline scans are saved as pending books showing their ISBN, and Spine fetches the full record the moment you reconnect. Cover reading needs one online run, or the Prepare for offline step in Settings, to download its text reader.'
        },
        {
          q: 'What does Prepare for offline do?',
          k: ['prepare for offline', 'download engines', 'offline engines'],
          a: 'It downloads the web barcode engine and the cover text reader once and stores them on the device, so both kinds of scanning work later without a signal. It takes a few megabytes, so do it on Wi-Fi.'
        },
        {
          q: 'Where is my data stored? Is it private?',
          k: ['privacy', 'data', 'stored', 'where is my data', 'private', 'upload', 'tracking'],
          a: 'Your shelf lives in the browser storage on your own device. Nothing is uploaded, there are no accounts and no analytics. The only network requests are to Open Library, the free public catalogue run by the Internet Archive, to fetch book records and covers.'
        },
        {
          q: 'How do I back up or move my shelf?',
          k: ['backup', 'back up', 'export', 'import', 'move', 'transfer', 'another phone', 'json'],
          a: 'Open Settings and tap Export your shelf. Spine writes a JSON file you can save or share. On another device, use Import a shelf file. Import merges by ISBN, so nothing is duplicated.'
        },
        {
          q: 'Where does the book information come from?',
          k: ['open library', 'where does the data come from', 'catalogue', 'source', 'internet archive', 'missing blurb', 'no cover'],
          a: 'From Open Library, a free public catalogue run by the Internet Archive. Coverage is uneven: some editions have no cover, page count or blurb, and Spine says so plainly rather than inventing one. Each book has a link to its catalogue record where you can see or add missing details.'
        },
        {
          q: 'The lookup is slow or times out.',
          k: ['slow', 'timeout', 'timed out', 'taking long', 'loading forever'],
          a: 'Open Library is a volunteer run service and a cold request can take five to twelve seconds. Spine waits up to twenty seconds. If it fails, the scan is kept as a pending book and looked up again later, or you can tap Try the lookup again inside the book.'
        }
      ]
    },
    {
      section: 'Your shelf',
      items: [
        {
          q: 'How do reading statuses work?',
          k: ['status', 'reading', 'to read', 'finished', 'want to read', 'mark as read'],
          a: 'Open any book and choose To read, Reading or Finished. The filters at the top of the shelf show one status at a time, and the Reading tab counts pages read from your finished books.'
        },
        {
          q: 'What is the spine view?',
          k: ['spine view', 'spines', 'shelf view', 'bookshelf', 'cover view', 'grid'],
          a: 'The button beside search switches the shelf between cover tiles and spines standing on wooden shelves. Spine widths come from page counts and colours are sampled from each cover. Tap any spine to open the book.'
        },
        {
          q: 'How do I search or remove a book?',
          k: ['search', 'find a book', 'remove', 'delete a book', 'delete'],
          a: 'Tap the magnifier on the shelf to search by title, author, subject or ISBN. To remove a book, open it and tap Remove from shelf at the bottom. Delete everything in Settings clears the whole shelf after a confirmation.'
        },
        {
          q: 'What do the statistics show?',
          k: ['statistics', 'stats', 'reading tab', 'pages read', 'numbers'],
          a: 'The Reading tab shows how many books are on the shelf, how many are finished, pages read, number of authors, a breakdown by status, your most shelved authors, the subjects you read about and the decades your books were published in.'
        }
      ]
    },
    {
      section: 'Installing',
      items: [
        {
          q: 'How do I install Spine on Android?',
          k: ['install android', 'android', 'apk', 'download the app', 'install app', 'home screen android'],
          a: 'Two ways. Open the site in Chrome and choose Install app from the menu, or tap Get the app on the intro screen for a QR code and a direct APK download. After installing the APK, allow the camera on first scan.'
        },
        {
          q: 'How do I install Spine on iPhone?',
          k: ['install iphone', 'ios', 'iphone', 'add to home screen', 'safari', 'apple'],
          a: 'Open the site in Safari, tap Share, then Add to Home Screen, then Add. Other browsers on iPhone cannot install web apps. The Get the app button shows a QR code with these steps.'
        },
        {
          q: 'There is a Reload pill saying a new version is ready.',
          k: ['new version', 'reload', 'update', 'latest version'],
          a: 'Spine caches itself so it opens instantly and offline. When a newer build is published, the pill appears; tap Reload once to switch to it. Your shelf is not affected.'
        }
      ]
    },
    {
      section: 'Otto and voice',
      items: [
        {
          q: 'How do I talk to Otto?',
          k: ['talk', 'voice', 'speak', 'microphone', 'mic', 'ask otto', 'chat'],
          a: 'Tap the Otto button at the bottom right of the shelf, Reading or Settings pages. Type a question, or hold the microphone button and speak. Otto answers in text and can read the answer aloud. Tap the speaker icon to turn his voice on or off.'
        },
        {
          q: 'Otto did not understand my question.',
          k: ['did not understand', 'wrong answer', 'not helpful'],
          a: 'Try asking in a few plain words, for example "camera permission" or "does it work offline". You can also open the full FAQ from Settings, where every topic is listed.'
        }
      ]
    }
  ];
})(window);
