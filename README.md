# Second brain

A private, encrypted map of your notes, screenshots and ideas. Capture on your iPhone in seconds, see how things connect on a map, and ask Claude to sweep your chats or answer questions from your notes, only when you ask.

## How your data is protected

- **Encrypted on your device.** Every note and image is encrypted (AES-256-GCM) before it's stored. The key is protected by your passphrase (PBKDF2, 600,000 rounds). There is no reset: lose the passphrase and the notes can't be opened.
- **This repo holds only the app.** Your notes never go in it. They live on your devices and, if you turn on sync, in a separate private repo as ciphertext.
- **Text in screenshots is read on your device** (Tesseract). Nothing is uploaded for that.
- **Search by meaning, related notes, reading handwriting and transcription run on your device too.** The small AI models are bundled in this repo and run in your browser; your notes and recordings never leave the device for them. The meaning index is stored encrypted, and sealed notes are only indexed while they're open.
- **No third-party requests.** Fonts and libraries are bundled here. The only network calls the app makes are to `api.github.com` for your own sync repo.
- **Touch ID or Face ID (optional, per device).** Turn it on in Settings → Security. A passkey on that device gives back a secret only after your fingerprint, face or the device's passcode (WebAuthn's PRF extension), and that secret locks a second copy of your key. The copy stays on that device: it's never synced and never in backups. Your passphrase still works, is asked for every 30 days so you don't forget it, and sealed notes always need their own passphrase. The device's passcode can stand in for Touch ID or Face ID, so keep it to yourself. Needs iPadOS or iOS 18 or later (or a browser with passkey PRF support).
- **Sealed notes** have their own second passphrase, stay hidden until you open them, and are never included in anything shared with Claude.
- **Claude only sees what you copy into a chat.** The app builds the request; you paste it; you import the reply and approve every change.

## How much it holds

There's no limit on the number of notes. What matters in practice:
- **This device**: Safari lets the app use up to about 60% of the device's storage. Typed and handwritten notes are tiny; imported PDFs and photos are what take space. The app asks the browser to keep its storage for good (Settings → This device shows how much is used).
- **Speed**: tested with 10,000 notes. Unlocking takes about a second, All notes and search stay quick, and the map settles in a few seconds. Notes close in meaning are worked out once, then only for the notes that change, and kept between sessions.
- **GitHub** (sync): keep the data repo under about 1 GB (GitHub's guidance). GitHub accepts about 500 uploads an hour, so after a big import the rest goes up in batches over a while; new edits always go first.
- **One PDF** can bring in up to 300 pages; split bigger ones.

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

The app syncs a few seconds after each change, straight away when you leave it (home screen or another app), when you come back to it, and every 3 minutes while it's open. **Settings → Sync now** does it on the spot. Every sync is one commit, so the data repo's history doubles as version history. Edits made on two devices before they sync are both kept: the newer one wins and the other becomes a "conflict copy" in your inbox.

## Everyday use

- **Today** is home: your week, what's due (late ones flagged), a quick "add a task", today's note (type straight into it), and everything you captured that day. Tap another day to look back or ahead.
- **Capture** (the + button): a thought, screenshots or photos, and/or a link, which land in the **Inbox**. From the same sheet you can **scan paper**, or start a **typed note**, a **handwritten note** or a **whiteboard**.
- **Notebooks**: a shelf of notebooks, each in a region, with a cover from the library of 66 in 11 collections: Classic, Lined & paper (ruled, graph, dot grid, legal pad, ledger, music paper), Nature (peaks at dawn, monstera, dunes, bamboo, autumn leaves, rain and more), Calm (misty hills, moon phases, a soft arch), Singapore & Asia (shophouses, an HDB estate, lanterns, koi and more), Patterns, Bold, Fun (confetti, sprinkles, smiles, pixel hearts, rainbow, balloons), Futuristic (neon grid, holographic, circuit board, hyperspace), AI & data (neural network, tokens, sparkle, heatmap, signal) and Night, your own photo, or a plain colour. Long names fit: they go onto two lines (three if they must) rather than being cut short. Inside: sections, notes, and sub-notes under notes, newest first (the note you wrote in or made most recently is at the top). On iPad the open note sits beside the notebook.
- **More room to write** (iPad and computers): the side-panel button at the top of any note hides the side panel and a notebook's list, and the page grows to fill the space. It's remembered until you switch it back.
- **Typed notes** (tap the title to change it)
  - **Contents** (top bar): your headings with how long each takes to read, the one you're in marked; tap one to jump there, or Back to top / To the end. **Pages** shows the note as printed pages, like a handwritten note's; tap a page to go there.
  - Styles: Title, Heading, Subheading, body text, bulleted, numbered and checklist lists, quote, callout box, post-it, divider. Type `/` anywhere for the style menu, or use shortcuts as you type: `#`, `##`, `###`, `-`, `1.`, `[ ]`, `>`, `!`, `---`.
  - **Toolbar**: the same two rows at the top as handwritten notes. The top row: undo and redo, text style, bold, lists, the tag button (adds a label) and **Insert** (+). The row below: font, size, colours and the rest. It's there while reading too, so nothing jumps when you start typing.
  - Formatting: bold, italic, underline, strikethrough, seven fonts, sizes and alignment.
  - **Pictures and screenshots**: copy one and press Ctrl+V (Cmd+V), or **Insert → Paste a picture** (handy on the iPad), or drag one in. It goes where your cursor is, or at the end if you were just reading. The same works on handwritten pages (it lands where you're looking), whiteboards and Today's note.
  - **Default text** (Settings → Appearance): the font, size and colour of your typed text. Typed notes and Today's note use it, including notes you already have, except text you've given its own font, size or colour; PDF exports of typed notes match. New text boxes on handwritten pages and new whiteboard text start with it; ones already placed stay as they are, so they don't shift over your writing. It follows you to every device, and a chosen colour shows brightened in dark mode.
  - **Colours**: 30 text colours (ten hues, each bright, classic or deep), soft and marker highlights, the colours you used last (they also sit in the toolbar), and any colour of your own. In dark mode they're shown brightened so they stay readable.
  - **Insert** (the + button, or `/`): tables with shading, images, stickers, post-its, due dates and links to notes.
  - **Fields** from a section's table view (dates, impact, people and so on) are folded away below the text; tap **Fields** to see or change them.
  - Links: `[[` links to another note. Links show bold and blue (the same blue as links on the map), so they're easy to spot.
  - On iPad, headings make an outline beside the note.
- **Handwritten notes** (Apple Pencil writes, fingers scroll and pinch to zoom; zoomed in, scroll or drag to any part of the page, edge to edge)
  - **Zoom**: pinch with two fingers and the page grows around your fingers, following them as they move (up to 6 times). On a computer, hold Ctrl (or ⌘) and scroll, or pinch the trackpad: it zooms around the pointer. While zooming, a small label shows how far ("250%"); tap it to fit the page to the screen again.
  - **Toolbar**: the top row of tools never changes; the row below shows the settings for the tool in hand (the pen chip names the pen, like "Fountain, 0.7 mm"; tap it for all pen settings). Not sure what an icon does? Hover over it, or press and hold it on iPad and iPhone.
  - **Move** (the hand): drag stickers, post-its, labels, tables, photos or writing around without lassoing first. Tap something for its options; drag empty paper to scroll.
  - **Labels** (the tag button): stick a label like Important or Follow up anywhere on the page. Labels are what you search and filter by; they show on the Labels screen.
  - **Insert** (the + button): post-its, stickers, **tables** to write in (choose rows, columns and a shaded header; moving a table carries what's written in it; tap it with Move for **Rows and columns**), photos, scanned pages and PDFs. On iPhone, Shapes, the writing window, Layers and recording are in here too.
  - Pens: fountain, ballpoint, brush, pencil, marker, calligraphy, each with any colour and thickness, smoothing (off to high) and pressure on or off. **Save as favourite** keeps a pen exactly as set, one tap away in the toolbar. Also highlighter, eraser (whole strokes or precise), lasso (move, resize, recolour, copy, save as a sticker), shapes that snap when you hold, text boxes with full formatting (tap for one, or drag out the size you want and the words wrap inside it; drag a box with the text tool to move it, or use the round grip on its corner while typing), photos, and undo.
  - **Handwriting is read on your device** a few seconds after you stop writing, so it shows up in search, links, Ask Claude and search by meaning. Lasso some writing and choose **Convert to text** to see what it reads as, fix it, then copy it or replace the ink with typed text. Neat writing reads best; joined-up writing usually works, but check what it read.
  - **How pages show** (tap **Pages** at the top; on a phone, ⋯ → **Pages and layout**): **Scroll down** (A4 pages one under another, like a PDF reader), **Next page** (one page at a time, with Previous and Next) or **Endless** (one long page that grows as you write; not for PDFs or photo pages; PDF export prints it as A4 pieces). Each note keeps its own choice. Add page is at the end of the pages in either view.
  - **Paper**: dot grid (the default), lined, narrow lined, squared, Cornell or blank, in white, ivory or dark. Change it under All pages: it changes every page of the note and becomes the paper for new notes.
  - Pages: add, reorder, bookmark. **Import a PDF** to write on it, a photo of paper, or **scan** pages straight in.
  - **Pages one under another** (the default): scroll through every page of a note, like a PDF reader. The page you're on is the one you write on; put the Pencil on any other page and it's ready straight away. A small "12 / 40" shows while you scroll (tap it for all pages). Page Up / Page Down and the arrow keys jump a page. Prefer turning pages? Choose **Next page** under Pages.
  - **One at a time**: keep scrolling past the end of a page for the next one (and back past the top for the one before), use Previous and Next under the page, or the keys. Tap **Page 3 of 40** to see every page and jump to one.
  - A note opens at the page you were last on.
  - **Long PDFs** stay quick: only the pages near the screen are drawn and kept in memory, so a 300-page PDF costs about the same as a 3-page one; page pictures in the page list come in as you scroll; and a PDF page keeps its shape on an endless page.
  - **Bring in notes from Notability** (or GoodNotes): Notebooks → **Bring in notes**. In Notability's library tap ⋯ → Select Notes, pick them, Export → PDF → Save to Files; then choose them all here (or a .zip of PDFs, whose folders become sections). Each PDF becomes a handwritten note in the notebook you pick, looking exactly as it did, with room to keep writing; typed text in them is searchable and the PDF's date is kept. Picking several PDFs in a notebook's Mark up a PDF does the same.
  - **Mark up a PDF**: from a notebook (Mark up a PDF), from Capture, or by dragging a PDF onto a notebook or the map. It opens as a handwritten note with the PDF's pages to draw, circle (hold at the end of a shape so it snaps), highlight and type on. The PDF's text is searchable.
  - **PDFs stay sharp**: the PDF is kept as it came (encrypted, like everything else), and its pages are drawn from it at the size you see them, so small print stays crisp when you zoom in or use focus mode. Exported PDFs keep the original pages too, with your writing on top. (PDFs over 40 MB are kept as detailed pictures of each page instead, to stay within what sync can carry. PDFs brought in before November 2026 keep their pictures; bring the PDF in again for the sharp version.)
  - **Laser pointer** (on iPhone: + → More tools): draw to point things out while you talk or share your screen. A glowing red line with a tail; it fades a moment after you lift, and nothing is saved.
  - **Layers**: Ink, Highlights and your own (say "Review notes"). Hide or lock a layer, pick which one you're writing on, move a selection to another layer, and export only the visible layers.
  - **Zoom** opens the writing window: write large in the strip at the bottom and it lands small in the dashed box on the page. Lift the Pencil in the shaded end to move along; it wraps to the next line by itself.
- **Recordings**: tap the microphone on any note to record (pause and resume as you like). On a handwritten note, the headphones replay the audio with your writing: what you wrote later fades in as it plays, and tapping a word jumps to that moment. **Transcribe on this device** turns a recording into text you can search and tap to jump to.
- **Scanning**: take or choose photos of paper; the edges are found for you (drag a corner to adjust), then pick colour, greyscale or black and white. The text is read on your device so the scan is searchable.
- **Whiteboards**: an open board for thinking things through. Add cards for notes you already have (or a new one), sticky notes, text, shapes, frames that carry what's inside them, photos, arrows that stay attached as you move things, and a pen. Pan with a finger or trackpad, pinch to zoom, and use the overview in the corner to jump around. Notes on a board show it among their connections. Export as PDF or an image.
- **Table views**: open any notebook section as a table, cards, a timeline or a board, with columns like dates, choices, tags, people, numbers and links. Start from a preset (Wins, Projects, Reading, People) or blank; filter, sort and group by year or month. On a board, drag cards between columns (on a phone, press and hold first). The same fields are folded away below the text of each note.
- **Stickers and post-its** are decoration: marks, planner, washi tape, chart and botanical packs, and "Mine" (your own ink or photos). Post-its fold away to a small square. To mark something you want to find later, use a label instead.
- **Labels** are for finding things again: every label you've stuck anywhere, with a preview of the spot. Edit names and colours in Settings or on the Labels screen.
- **Tasks**: checklists from every note, typed or handwritten, by date, by note or **by region**. Tick them here and the note updates.
- **Numbers in the menu** (iPad and computer): "3 due" beside Today and Tasks (tasks due today or earlier, not ticked), how many tasks are left, a line per region under Tasks (tap one to see just that region's tasks), and how many labels and highlights you have. They update by themselves.
- **Search by meaning**: in All notes, results include notes that say the same thing in other words ("Close in meaning"), found on this device. Typed notes also show notes close in meaning among their connections. Turn it off or rebuild the index in Settings → On-device intelligence. The first search by meaning downloads its model from this site once (about 22 MB), the first handwriting reading another (about 21 MB) and the first transcription another (about 44 MB); all are kept for offline use.
- **Connections** (at the end of a typed note): links in both directions, mentions that aren't linked yet, related notes worked out on this device, and sub-notes.
- **Version history**: every sync is a commit, so each note (and each handwritten page) can be compared with earlier versions and restored.
- **Highlights**: everything you've highlighted, in one place (side menu, Today, or "Highlights in this note" / "in this notebook" from the menus). Highlighter marks on PDFs, photos and handwritten pages, and highlights in typed notes, each with a picture of what you marked and the words under it: from the PDF's own text, your handwriting or the picture, all read on the device. A sloppy highlight still works: a word counts when at least half of it is covered, and a highlight that drifts or sits too high takes the line it covers most (the card says so). One over empty paper keeps just its picture, with **Remove**. Filter by colour, tap a card to go to the page, or **Copy as text**. Anything else (a circle, an underline, a picture) can join them: select it with the lasso and tap **Add to highlights**.
- **Two notes side by side** (iPad in landscape and computers): tap the side-by-side button in a note's top bar and pick another note, or tap **Beside** next to a linked or related note. Each side scrolls, zooms and turns pages on its own, and the Pencil writes on whichever side it touches; pens and colours are shared. Drag the bar in the middle to resize; **Swap sides** or **Close right** at the bottom. The pair is remembered: open the note again and its partner comes back beside it, until you close the right side. On iPhone notes open one at a time.
- **Recently deleted**: deleting a note, whiteboard or notebook puts it in Recently deleted (in the side menu, and linked from Settings) for 30 days, on all your devices. Tap **Put back** to restore it with its pages, images and links; a notebook comes back with the notes deleted with it. **Delete now** or **Empty** removes things for good; after 30 days they go by themselves.
- **From your notes** (on Today): what you wrote on this day in earlier years, and one older note worth another look, picked by itself each day from notes you haven't touched in a while. Tap **Another** to see a different one. Sealed notes never show here.
- **Export**: a note or notebook as PDF or Markdown, or everything as a Markdown zip (Settings).
- **Map**: like Obsidian's graph, every note is a dot and every connection a line, each kind in its own colour: your links (blue), sub-notes (purple), whiteboards (teal), and related notes the assistant found by meaning (amber, dashed). Labels can be shown too. Notes cluster around their region, and a dot grows bigger the more it's connected. Tap the colours in **Connections** to show or hide a kind. Tap a dot to light up what it connects to, then **Only its connections** (one or two steps) to see just its neighbourhood. Tap a line to see why two notes connect; on an amber line, **Link them** or **Not related**. **Replay** shows your map growing in the order you wrote things. Drag screenshots onto the map on iPad or a computer to capture them.
- **The map also has**: a **when** filter (past week, month, 3 months, year) that lights up what you've worked on lately; **themes**, where a dashed ring and a name mark notes inside a region that belong together; and a **map of each note** in its Connections, with **Open on the map** to see its neighbourhood there.
- **Your map this week** (on Today): new notes and where they went, new regions, new links and related notes, what the assistant did, and one thing worth a look. Hide it until next week with the ×.
- **Map assistant**: runs by itself on this device. It draws related lines as you write and files new notes into regions (adding regions when needed). Under **Noticed** it points out patterns: notes that belong together (one tap links them), a note that ties regions together, your most connected note, and notes not connected to anything yet. Optionally (Settings → On-device intelligence) it links notes that are very alike by itself; each link it makes is listed in the inbox with Undo.
- **Organiser** (Organise on the map or in the inbox): reads your notes on this device and files each into the region it fits. When notes need a new home it adds a region, such as Property & home, Health & fitness, Money & admin or Side projects. You see the plan first and can untick anything. With **Organise new notes by themselves** on (Settings → On-device intelligence), new captures are filed once you've finished with them, but only when the organiser is sure. Anything moved can be put back with **Undo** in the inbox. Nothing leaves the device.
- **Ask Claude**
  - **Sweep my Claude chats** copies a request that asks Claude to go through your chats since the last sweep and keep only what's worth keeping (decisions, ideas, open questions, wins), skipping lookups and one-off tasks.
  - **Ask about your notes** copies your question plus the regions you choose, or just the notes closest in meaning to your question.
  - Paste into any Claude chat, then **Import Claude's reply**. You review every new note, update and skipped chat before anything is saved.
  - Handwritten notes share their text boxes, post-its and the handwriting read on your device, whiteboards share an outline of what's on them, and recordings share their transcripts. Sealed notes and notebooks are never included.
- **Updates**: when a new version of the app is ready, a bar offers to switch to it (you'll unlock again). Settings → This device shows the version and has **Check for updates**.
- **Appearance** (Settings): match the device, or always light or dark. In dark mode, handwritten pages and whiteboards go dark too, with dark ink shown light and colours brightened, so there's no bright white page in a dark app. PDFs and images you export always use light paper. You can keep pages light in dark mode if you prefer.
- **Speed and battery**: the app loads only what the first screen needs (the map's drawing library and the reader for Claude's answers come in when you open them), the map sits still when nothing's moving instead of redrawing all the time, and how notes connect is worked out once per change and shared by the map, each note's mini-map and the assistant.
- **Settings**: sync, appearance, auto-lock, Touch ID or Face ID unlock, passphrase, sealed notes, regions (25 colours to pick from; a small mark shows the ones other regions use), labels, encrypted backup, Markdown export.

## Editing the app

Plain HTML, CSS and JavaScript modules, no build step. Edit on GitHub or locally and push; Pages redeploys automatically.

```
index.html            app shell and security policy
css/app.css           the core look (light and night-chart themes)
css/notes.css         notebooks, editors, stickers, Today, Tasks, Labels
js/app.js             routing, lock state
js/vault.js           encrypted storage and note operations
js/crypto.js          encryption
js/deviceunlock.js    unlock with Touch ID or Face ID (passkey PRF)
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
js/editor/pagestack.js  the continuous view (pages one under another)
js/editor/zoomstrip.js  the writing window
js/stickers.js        the sticker library
js/covers.js, coverart.js, coverart2.js  notebook covers (coverart*.js hold the generated artwork; tools/covergen2.py makes coverart2.js)
js/export.js, pdf.js  PDF and Markdown export, PDF import
js/pdfview.js         drawing PDF pages sharp from the kept PDF
js/bulkimport.js      bringing in many PDFs at once (Notability exports)
js/views/*.js         one file per screen
sw.js                 offline cache
vendor/, fonts/       bundled libraries and typefaces
```

Tests: `tests/` (Playwright end-to-end; `cd tests && ./runall.sh`). Notes for working on the code with Claude: `CLAUDE.md`.

When you change any file, bump `VERSION` in `sw.js` (e.g. `sb-v4`) so installed copies pick up the update on their next launch.

To try it locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.

## Bundled software

force-graph (MIT), marked (MIT), DOMPurify (Apache-2.0 / MPL-2.0), tesseract.js and tesseract.js-core (Apache-2.0), Tesseract English data (Apache-2.0), Tiptap and ProseMirror (MIT), perfect-freehand (MIT), PDF.js (Apache-2.0), pdf-lib (MIT), fflate (MIT), Transformers.js (Apache-2.0), ONNX Runtime Web (MIT), all-MiniLM-L6-v2 (Apache-2.0), Whisper tiny (MIT), PaddleOCR PP-OCRv6 text recogniser (Apache-2.0). Typefaces under the SIL Open Font License 1.1: Overpass, Spectral, Fraunces, Nunito, Atkinson Hyperlegible, JetBrains Mono, Caveat.
