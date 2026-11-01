# Second brain

A private, encrypted map of your notes, screenshots and ideas. Capture on your iPhone in seconds, see how things connect on a map, and ask Claude to sweep your chats or answer questions from your notes, only when you ask.

## How your data is protected

- **Encrypted on your device.** Every note and image is encrypted (AES-256-GCM) before it's stored. The key is protected by your passphrase (PBKDF2, 600,000 rounds). There is no reset: lose the passphrase and the notes can't be opened.
- **This repo holds only the app.** Your notes never go in it. They live on your devices and, if you turn on sync, in a separate private repo as ciphertext.
- **Text in screenshots is read on your device** (Tesseract). Nothing is uploaded for that.
- **Search by meaning, related notes, reading handwriting and transcription run on your device too.** The small AI models are bundled in this repo and run in your browser; your notes and recordings never leave the device for them. The meaning index is stored encrypted, and sealed notes are only indexed while they're open.
- **No third-party requests.** Fonts and libraries are bundled here. The only network calls the app makes are to `api.github.com` for your own sync repo.
- **Sealed notes** have their own second passphrase, stay hidden until you open them, and are never included in anything shared with Claude.
- **Claude only sees what you copy into a chat.** The app builds the request; you paste it; you import the reply and approve every change.

## One-time setup

### 1. Publish the app (GitHub Pages)
In this repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save**. After a minute the app is live at:

`https://vibe-coder-milo.github.io/Second-Brain/`

(GitHub Pages on a private repo needs a paid plan. The app code is safe to keep public, since it holds no notes.)

### 2. Install it on your iPhone
Open the link in **Safari → Share → Add to Home Screen**. Use it from the Home Screen icon: that's what keeps its storage safe from Safari's automatic clean-up, and makes it work offline.

Then choose **Start a new second brain** and set a passphrase. Four or more random words is easy to type and hard to guess.

### 3. Turn on sync (phone ↔ iPad ↔ computer)
1. Create a **private** repo, e.g. `second-brain-data`, and tick *Add a README*.
2. **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories → second-brain-data**
   - Permissions → Repository permissions → **Contents: Read and write**
   - Pick an expiry you're comfortable with (you'll paste a new token when it expires).
3. In the app: **Settings → Sync with GitHub**, paste the token, **Connect**.

On each other device, open the same link and choose **Set up from another device** with the same repo, token and passphrase.

Every sync is one commit, so the data repo's history doubles as version history. Edits made on two devices before they sync are both kept: the newer one wins and the other becomes a "conflict copy" in your inbox.

## Everyday use

- **Today** is home: your week, what's due (late ones flagged), a quick "add a task", today's note (type straight into it), and everything you captured that day. Tap another day to look back or ahead.
- **Capture** (the + button): a thought, screenshots or photos, and/or a link, which land in the **Inbox**. From the same sheet you can **scan paper**, or start a **typed note**, a **handwritten note** or a **whiteboard**.
- **Notebooks**: a shelf of notebooks, each in a region, with a cover from the library (or your own photo, or a plain colour). Inside: sections, notes, and sub-notes under notes. On iPad the open note sits beside the notebook.
- **Typed notes**
  - Styles: Title, Heading, Subheading, body text, bulleted, numbered and checklist lists, quote, callout box, post-it, divider. Type `/` anywhere for the style menu, or use shortcuts as you type: `#`, `##`, `###`, `-`, `1.`, `[ ]`, `>`, `!`, `---`.
  - **Toolbar**: the same two rows at the top as handwritten notes. The top row: undo and redo, text style, bold, lists, the tag button (adds a label) and **Insert** (+). The row below: font, size, colours and the rest. It's there while reading too, so nothing jumps when you start typing.
  - Formatting: bold, italic, underline, strikethrough, text colour and highlight, seven fonts, sizes and alignment.
  - **Insert** (the + button, or `/`): tables with shading, images, stickers, post-its, due dates and links to notes.
  - **Fields** from a section's table view (dates, impact, people and so on) are folded away below the text; tap **Fields** to see or change them.
  - Links: `[[` links to another note.
  - On iPad, headings make an outline beside the note.
- **Handwritten notes** (Apple Pencil writes, fingers scroll and pinch to zoom)
  - **Toolbar**: the top row of tools never changes; the row below shows the settings for the tool in hand (the pen chip names the pen, like "Fountain, 0.7 mm"; tap it for all pen settings). Not sure what an icon does? Hover over it, or press and hold it on iPad and iPhone.
  - **Move** (the hand): drag stickers, post-its, labels, tables, photos or writing around without lassoing first. Tap something for its options; drag empty paper to scroll.
  - **Labels** (the tag button): stick a label like Important or Follow up anywhere on the page. Labels are what you search and filter by; they show on the Labels screen.
  - **Insert** (the + button): post-its, stickers, **tables** to write in (choose rows, columns and a shaded header; moving a table carries what's written in it; tap it with Move for **Rows and columns**), photos, scanned pages and PDFs. On iPhone, Shapes, the writing window, Layers and recording are in here too.
  - Pens: fountain, ballpoint, brush, pencil, marker, calligraphy, each with any colour and thickness, smoothing (off to high) and pressure on or off. **Save as favourite** keeps a pen exactly as set, one tap away in the toolbar. Also highlighter, eraser (whole strokes or precise), lasso (move, resize, recolour, copy, save as a sticker), shapes that snap when you hold, text boxes with full formatting, photos, and undo.
  - **Handwriting is read on your device** a few seconds after you stop writing, so it shows up in search, links, Ask Claude and search by meaning. Lasso some writing and choose **Convert to text** to see what it reads as, fix it, then copy it or replace the ink with typed text. Neat writing reads best; joined-up writing usually works, but check what it read.
  - **Layout**: A4 pages, or **endless scroll**: one long page that grows as you write (PDF export prints it as A4 pieces).
  - **Paper**: dot grid (the default), lined, narrow lined, squared, Cornell or blank, in white, ivory or dark. Change it under All pages: it changes every page of the note and becomes the paper for new notes.
  - Pages: add, reorder, bookmark. **Import a PDF** to write on it, a photo of paper, or **scan** pages straight in.
  - **Layers**: Ink, Highlights and your own (say "Review notes"). Hide or lock a layer, pick which one you're writing on, move a selection to another layer, and export only the visible layers.
  - **Zoom** opens the writing window: write large in the strip at the bottom and it lands small in the dashed box on the page. Lift the Pencil in the shaded end to move along; it wraps to the next line by itself.
- **Recordings**: tap the microphone on any note to record (pause and resume as you like). On a handwritten note, the headphones replay the audio with your writing: what you wrote later fades in as it plays, and tapping a word jumps to that moment. **Transcribe on this device** turns a recording into text you can search and tap to jump to.
- **Scanning**: take or choose photos of paper; the edges are found for you (drag a corner to adjust), then pick colour, greyscale or black and white. The text is read on your device so the scan is searchable.
- **Whiteboards**: an open board for thinking things through. Add cards for notes you already have (or a new one), sticky notes, text, shapes, frames that carry what's inside them, photos, arrows that stay attached as you move things, and a pen. Pan with a finger or trackpad, pinch to zoom, and use the overview in the corner to jump around. Notes on a board show it among their connections. Export as PDF or an image.
- **Table views**: open any notebook section as a table, cards, a timeline or a board, with columns like dates, choices, tags, people, numbers and links. Start from a preset (Wins, Projects, Reading, People) or blank; filter, sort and group by year or month. On a board, drag cards between columns (on a phone, press and hold first). The same fields are folded away below the text of each note.
- **Stickers and post-its** are decoration: marks, planner, washi tape, chart and botanical packs, and "Mine" (your own ink or photos). Post-its fold away to a small square. To mark something you want to find later, use a label instead.
- **Labels** are for finding things again: every label you've stuck anywhere, with a preview of the spot. Edit names and colours in Settings or on the Labels screen.
- **Tasks**: checklists from every note, typed or handwritten, by date or by note. Tick them here and the note updates.
- **Search by meaning**: in All notes, results include notes that say the same thing in other words ("Close in meaning"), found on this device. Typed notes also show notes close in meaning among their connections. Turn it off or rebuild the index in Settings → On-device intelligence. The first search by meaning downloads its model from this site once (about 22 MB), the first handwriting reading another (about 21 MB) and the first transcription another (about 44 MB); all are kept for offline use.
- **Connections** (at the end of a typed note): links in both directions, mentions that aren't linked yet, related notes worked out on this device, and sub-notes.
- **Version history**: every sync is a commit, so each note (and each handwritten page) can be compared with earlier versions and restored.
- **Export**: a note or notebook as PDF or Markdown, or everything as a Markdown zip (Settings).
- **Map**: each region is a territory; notes cluster around it, links are lines, dashed amber lines are suggested links. Tap a dot to open the note (on iPad it opens beside the map). Drag screenshots onto the map on iPad or a computer to capture them.
- **Ask Claude**
  - **Sweep my Claude chats** copies a request that asks Claude to go through your chats since the last sweep and keep only what's worth keeping (decisions, ideas, open questions, wins), skipping lookups and one-off tasks.
  - **Ask about your notes** copies your question plus the regions you choose, or just the notes closest in meaning to your question.
  - Paste into any Claude chat, then **Import Claude's reply**. You review every new note, update and skipped chat before anything is saved.
  - Handwritten notes share their text boxes, post-its and the handwriting read on your device, whiteboards share an outline of what's on them, and recordings share their transcripts. Sealed notes and notebooks are never included.
- **Appearance** (Settings): match the device, or always light or dark. In dark mode, handwritten pages and whiteboards go dark too, with dark ink shown light and colours brightened, so there's no bright white page in a dark app. PDFs and images you export always use light paper. You can keep pages light in dark mode if you prefer.
- **Settings**: sync, appearance, auto-lock, passphrase, sealed notes, regions, labels, encrypted backup, Markdown export.

## Editing the app

Plain HTML, CSS and JavaScript modules, no build step. Edit on GitHub or locally and push; Pages redeploys automatically.

```
index.html            app shell and security policy
css/app.css           the core look (light and night-chart themes)
css/notes.css         notebooks, editors, stickers, Today, Tasks, Labels
js/app.js             routing, lock state
js/vault.js           encrypted storage and note operations
js/crypto.js          encryption
js/sync.js            GitHub sync (Git Data API)
js/graph.js           the map
js/claude.js          Ask Claude requests and reply import
js/ocr.js             on-device text reading
js/model.js           regions, note types, notebooks, pages, labels, search
js/doc.js             reading typed notes without the editor (Markdown, tasks, labels)
js/notework.js        tasks, daily notes, handwritten-note summaries
js/ai.js, ai-worker.js  on-device models (meaning search, transcription), run in a worker
js/semantic.js        the meaning index and related notes
js/recorder.js        recording, playback and transcription
js/scan.js            finding page edges, straightening and cleaning up scans
js/handwriting.js     grouping ink into lines and reading it on this device
js/boarddraw.js       whiteboard geometry, outline and export drawing
js/editor/rich.js     the typed-note editor (Tiptap)
js/editor/toolbar.js  formatting bar and the / menu
js/editor/ink.js      the handwriting surface
js/editor/inkdraw.js  drawing pages, pens, stickers and layers
js/editor/zoomstrip.js  the writing window
js/stickers.js        the sticker library
js/covers.js          notebook covers
js/export.js, pdf.js  PDF and Markdown export, PDF import
js/views/*.js         one file per screen
sw.js                 offline cache
vendor/, fonts/       bundled libraries and typefaces
```

When you change any file, bump `VERSION` in `sw.js` (e.g. `sb-v4`) so installed copies pick up the update on their next launch.

To try it locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.

## Bundled software

force-graph (MIT), marked (MIT), DOMPurify (Apache-2.0 / MPL-2.0), tesseract.js and tesseract.js-core (Apache-2.0), Tesseract English data (Apache-2.0), Tiptap and ProseMirror (MIT), perfect-freehand (MIT), PDF.js (Apache-2.0), pdf-lib (MIT), fflate (MIT), Transformers.js (Apache-2.0), ONNX Runtime Web (MIT), all-MiniLM-L6-v2 (Apache-2.0), Whisper tiny (MIT), PaddleOCR PP-OCRv6 text recogniser (Apache-2.0). Typefaces under the SIL Open Font License 1.1: Overpass, Spectral, Fraunces, Nunito, Atkinson Hyperlegible, JetBrains Mono, Caveat.
