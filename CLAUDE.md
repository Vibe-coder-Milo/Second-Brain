# Second brain: notes for Claude

A private, encrypted "second brain" web app (PWA) that the owner uses every
day, mostly on an iPad with Apple Pencil, also on iPhone and a computer.
Typed notes, handwritten notes (Notability-style), whiteboards, notebooks with
covers, a map of how notes connect (Obsidian-style), on-device AI, and sync
through a private GitHub repo. Everything is encrypted on the device.

- Live app: https://vibe-coder-milo.github.io/Second-Brain/ (GitHub Pages)
- This repo (public, app code only): github.com/Vibe-coder-Milo/Second-Brain.
  Pushing to `main` redeploys Pages in about a minute; check with
  `gh run list --repo Vibe-coder-Milo/Second-Brain --limit 1`.
- The owner's notes live in their devices' storage and, encrypted, in a
  separate private repo (`second-brain-data`). Never in this repo.
- `README.md` is the user guide (setup, every feature). Keep it current when
  features change.
- Starting a new round of work (for example version 2.0)? Read
  `docs/HANDOFF.md`: where things stand, open items, and candidate features.

## Working with the owner

- Not a developer. Explain in plain words, short, outcome first; no jargon
  ("the map now opens twice as fast", not "lazy-loaded force-graph").
  Screenshots of the result help. Bullet lists are fine when there are several
  items.
- Wants the least effort from them: things should work by themselves
  (the organiser files notes, the map assistant links them).
- Expects changes to go live: after tests pass, commit, push to `main`, bump
  the service worker version, and say so ("tap the update bar when it
  appears").
- Security rule, in their words: "security is key, what i upload should only
  be available to myself".
  - Never ask for, read or handle their GitHub token. It's pasted only into the
    app, which stores it encrypted.
  - Sealed notes are never shared with Claude and never sent anywhere.
  - Never add third-party requests, analytics or CDNs.

## Non-negotiables (privacy and security)

- Everything stored or synced is AES-256-GCM encrypted (`js/crypto.js`).
  - A random data key is wrapped by the passphrase (PBKDF2-SHA256, 600k
    iterations). There is no reset.
  - The data key is created non-extractable.
  - Sealed notes use a second key and passphrase.
- Records are bound to their id (AES-GCM additional data).
- The CSP in `index.html` allows only `'self'` plus `api.github.com`
  (`script-src 'self' 'wasm-unsafe-eval'`). Fonts, libraries and AI models are
  bundled in `vendor/` and `fonts/`. Keep it that way.
- All AI runs on the device, in a worker (`js/ai-worker.js`):
  - MiniLM: search by meaning and related notes.
  - Handwriting reading.
  - Whisper-tiny: transcription.
  - Tesseract: OCR of images.
- "Ask Claude" is copy/paste only. The app builds a prompt; the owner pastes it
  into a Claude chat and imports the reply; every change is reviewed. Sealed
  notes are excluded. There is no API key.
- Touch ID / Face ID unlock (`js/deviceunlock.js`) is optional and per
  device.
  - A WebAuthn passkey's PRF secret (HKDF, then AES-GCM) wraps a copy of the
    data key, kept only in that device's `meta` store: never synced, never in
    backups.
  - The passphrase is required every 30 days, and always for sealed notes.
  - The device passcode can stand in for biometrics; that's a WebAuthn
    limitation, so tell the owner.

## Tech and conventions

- Plain HTML/CSS/JS ES modules. No build step, no npm at runtime. Vendor
  bundles live in `vendor/`:
  - editor: Tiptap;
  - PDF: pdf.js (`pdfjs/`) and pdf-lib;
  - zip and gzip: fflate;
  - map: force-graph;
  - ink: perfect-freehand (`freehand.js`);
  - markdown: marked and DOMPurify;
  - models: transformers and onnxruntime (`ort/`) with the model files;
  - OCR: tesseract.
- **Service worker** (`sw.js`):
  - Bump `VERSION` (`sb-vN`; currently `sb-v26`) on every release.
  - Add every new JS/CSS file to `SHELL`, or it won't work offline.
  - The app shows an update bar (`js/appupdate.js`).
- **Views:** `js/views/*.js` export `mount(main, params, ctx)`, returning
  `{ update(params), onEvent(evt), destroy() }`. Hash routes are in `js/app.js`:
  `#/today`, `#/map`, `#/inbox`, `#/notes`, `#/note/:id`, `#/notebooks`,
  `#/notebook/:id`, `#/tasks`, `#/labels`, `#/ask`, `#/review`, `#/settings`,
  `#/deleted` (Recently deleted), `#/highlights` (`?note=` / `?notebook=`),
  `#/note/:id?beside=:id2` (side by side; routed to `views/split.js`).
- **HTML:** use the `html` tagged template from `js/util.js` (escapes) and
  `raw()` for trusted HTML. Common helpers:
  - `toast()` and `$()` from `js/util.js`;
  - `openSheet()`, `popover()`, `menuSheet()`, `confirmSheet()` and
    `passphraseSheet()` from `js/ui.js`.
  - Don't use `alert`, `confirm` or `prompt`.
- **Events:** `vault.emit({ type })` with types `note`, `delete`, `remote`,
  `sealed`, `config`, `sync`, `unlock`, `device`, `notebook`, `page`, `ocr`.
  `vault.rev` goes up on every emit, which is useful as a cache key.
- **Styles:**
  - `css/app.css` holds the shell and theme tokens (`--ink`, `--muted`,
    `--surface`, `--field`, `--line`, ...); light and dark come from
    `js/theme.js` (`data-theme`).
  - `css/notes.css` holds the editors, notebooks and the rest.
  - Icons are inline SVG in `js/icons.js`.
- **UI copy:** British/Singapore spelling (colour, organise), sentence case,
  plain everyday words, short hints. Buttons are verbs ("Bring in notes",
  "Unlock with Touch ID or Face ID"). Never show technical terms (PRF, SHA,
  IndexedDB) in the UI.
- **Comments:** each file opens with a plain-language comment saying what it
  does. Keep that up.

## Where things are

| Area | Files |
|---|---|
| Entry, routing, auto-lock, background jobs | `js/app.js` |
| Vault: unlock, in-memory notes, writes, events | `js/vault.js`, `js/db.js` (IndexedDB `second-brain`: stores `meta`, `records`, `files`, `local`) |
| Encryption | `js/crypto.js`; Touch ID / Face ID in `js/deviceunlock.js` |
| Sync (GitHub Git Data API) | `js/sync.js` |
| Note model, regions, search | `js/model.js`, `js/doc.js`, `js/notework.js` (tasks, daily notes, ink summaries) |
| Typed notes | `js/views/note.js`, `js/editor/rich.js` (Tiptap), `js/editor/toolbar.js`, `js/fonts.js` (the fonts and text sizes everything shares) |
| Handwritten notes | `js/views/inknote.js` (screen), `js/editor/ink.js` (InkSurface), `js/editor/inkdraw.js` (drawing pages, pens, paper, PDF backgrounds), `js/editor/pagestack.js` (continuous view), `js/editor/zoomstrip.js` (writing window), `js/handwriting.js` |
| Highlights | `js/highlights.js` (finding highlights and the words under them), `views/highlights.js` (screen) |
| Side by side | `views/split.js` (two note screens in panes), button in `focus.js`, routing and `openBeside` in `app.js` |
| PDFs | `js/pdf.js` (import), `js/pdfview.js` (drawing pages sharp from the kept PDF), `js/bulkimport.js` + `js/views/importsheet.js` (many at once / Notability), `js/export.js` (PDF/Markdown export) |
| Whiteboards | `js/views/board.js`, `js/boarddraw.js` |
| Notebooks, covers | `js/views/notebooks.js`, `js/covers.js`, `js/coverart.js` (generated, see `tools/covergen.py`), `js/coverart2.js` (generated by `tools/covergen2.py`: run it, don't edit the output) |
| Map | `js/views/map.js`, `js/graph.js` (force-graph canvas), `js/mapdata.js` (connections, themes), `js/mapassist.js` (Noticed, weekly digest, auto-link), `js/minimap.js` |
| On-device AI | `js/ai.js`, `js/ai-worker.js`, `js/semantic.js` (meaning index + related lists), `js/organiser.js` (files notes into regions), `js/ocr.js`, `js/recorder.js` |
| Other screens | `deleted.js` (Recently deleted), `today.js` (with `js/resurface.js` for "From your notes"), `inbox.js`, `notes.js`, `tasks.js`, `labels.js`, `tableview.js`, `ask.js`, `review.js`, `history.js`, `scanner.js`, `settings.js`, `gate.js` (create/join/unlock), `shell.js` |

## Data model in brief

- **Note** (`normNote` in `js/model.js`): `kind` is `note` (typed: `doc`/`body`),
  `ink` (handwritten: `pages[]`), or `board`. It also has:
  - placement: `region`, `inbox`, `notebook`, `section`, `parent` (sub-notes);
  - connections and labels: `links`, `suggested`, `dismissed`, `labels`,
    `tasks`;
  - attachments: `files`, `recordings`, `props`, `pdfText`;
  - display: `layers`, `layout` (`scroll` = endless page);
  - flags: `sealed`, `daily`.
- **Notebook:** `kind: notebook`, `sections[]`, `cover { style, color,
  photo, titleStyle }`, `paper`, `paperColor`.
- **Handwritten pages:** each page `{ id, paper, color, h, bg?, pdf? }`. The
  page's ink lives in a separate encrypted file (id = page id, gzip JSON with
  strokes and objects). `bg` is the file id of a background image (PDF page or
  photo). `pdf: { file, n }` points at the original PDF (one encrypted file per
  import, shared by its pages) and the page number there. `PAGE_W` = 1000
  units.
- **Sync repo layout:** `notes/<id>.json`, `files/<id>.bin`, `keyring.json`.
  One commit per sync.
- **Device settings** (`state.device`, kept encrypted on each device, not
  synced): `paper`,
  `paperColor`, `darkPaper`, `pageView` (`continuous`/`single`), `semantic`,
  `organise`, `autoLink`, `autoLockMin`, `sync {owner, repo, branch, token}`,
  `organiserLog` and more.
- **Synced settings** (`state.config`, `normConfig`): regions, labels, stickers,
  and `text { font, size, color }`, the default text (`normText`; font null =
  the usual one, Spectral in notes and Overpass in text boxes; colour null = the
  app's ink). Two rules, by design:
  - Typed text follows it live: `applyTextDefaults()` (`theme.js`) sets CSS
    variables (`--note-size`, `--default-note-font`, `--note-ink`,
    `--note-ink-dark`) on unlock and on `config`/`remote` events, so existing
    notes change too, except text with its own marks or a note with its own
    `font`. Typed-note PDF export (`export.js`) uses the same values.
  - Placed objects copy it when created and then keep their own: ink text
    boxes get `o.size` (`boxSize()`), `o.font`, `o.color`; whiteboard text gets
    `color` and starts at the nearest S/M/L size. Changing the default later
    must not move text over handwriting.
  - Fonts, sizes and the 18 px / 20-unit relation live in `js/fonts.js` only
    (no imports, so `theme.js` and `model.js` can use it).

## Things that are easy to break

- **Highlights** (`highlights.js`): highlighter strokes (`t: 'hl'`) grouped per
  page (same colour, within 90 s, next one just below), plus typed `highlight`
  marks. Words: the PDF's text (`pdfWords`, pdf.js text content split into
  words, positions in page units), else handwriting lines (`groupLines` +
  `n.hw`, read on demand), else OCR of the crop. Rules in `pickWords`: a word
  counts at >= half its columns covered (6 columns x 3 rows sampled against
  the stroke's band); the best line plus any line with >= 60% of its score;
  notes `drift` (slanted > half a line, or touched another line), `high`/`low`.
  Ink notes keep `hlPages` (pages with highlights) in `inkSummary`; older notes
  get it worked out once when Highlights opens. Pictures are `renderPageCanvas`
  crops, cached, dropped when sealed notes lock. `t6d`.
- **Side by side** (`views/split.js`): two `note.js` mounts in `.split-pane`
  (`nb-pane` too, and `transform` so `position: fixed` screens stay inside).
  Each side gets a ctx whose `navigate` keeps notes opened from it on its own
  side. Only wide screens (`isWide`, >= 900 px); the route falls back to one
  note otherwise. The active side (last pointerdown) gets the keys; pens are
  shared through `state.device.ink` (inknote picks up `device` events). After
  one side is swapped out, `inking`/`boarding` body classes are put back.
  Pairs and the split share are device settings (`besides`, `splitShare`).
  `t6e`.
- **Recently deleted** (`vault.js`: `binNote`, `binNotebook`, `restore`,
  `deleteForever`, `purgeBin`; screen `views/deleted.js`):
  - Deleting from the UI sets `binnedAt` (and `binBatch` for a notebook and
    the notes deleted with it) and saves the record, so it syncs. `place()` puts
    anything with `binnedAt` in `state.bin`, never `state.notes`/`notebooks`,
    so every other screen ignores it with no extra checks.
  - `deleteNote`/`deleteNotebook` now mean "for good" (bin, 30-day purge, empty
    notes nobody wrote in). Files go only then.
  - Links are kept while binned (the map skips links to missing notes) and work
    again on restore. Sub-notes move up a level when the parent is binned.
  - `purgeBin()` runs 3 s after unlock and every 12 h. Sealed binned notes
    leave `state.bin` when sealed notes lock.
  - An older app version would treat a binned note as normal (its `normNote`
    drops `binnedAt`), so devices should update.

- **Ink canvases are windowed:** only the part of a page near the screen has
  pixels (`MAX_PX`).
  - Placement uses `pageEl.offsetTop` relative to `.ink-scroll`, so wrappers
    between them (the continuous view's `.ink-stack` and `.ink-slot`) must
    stay unpositioned.
  - The continuous view moves the one live `InkSurface` page element between
    slots. The other pages are pictures, drawn near the screen and dropped
    when far.
  - A Pencil touch on another page makes it live immediately and forwards the
    pointer event.
  - Supporting hooks: `setPage(page, data, { keepScroll })`,
    `opts.onLayout` and `surface.zoomTarget`.
- **Zoom** (`ink.js`, `bindPinch`/`setZoom`): 1x (page fits the width) to
  `ZOOM_MAX` 6x. A two-finger pinch is read from touch events (not Safari's
  gesture events, which are only `preventDefault`ed): a CSS transform follows
  the fingers, then `setZoom(z, anchor, to)` lays out once and scrolls so the
  spot that was between the fingers ends up under them. The anchor is the page
  (or continuous-view slot) plus fractions, measured before the transform.
  `zoomAnchored` stops `PageStack.sizeAll` re-centring meanwhile. A finger
  stroke or drag in progress gives way to the pinch (`dropFingerAction`); the
  Pencil never does. Ctrl/cmd + wheel zooms around the pointer, coalesced per
  frame. `.zoom-pill` shows the zoom; tapping it fits the page. `t5z` pinches
  with CDP touch events.
- **Saving ink:** saves are debounced (600 ms) per page id. Always `flush()`
  before switching pages. The `fresh` map keeps the newest data of pages just
  left.
- **PDFs:** import (`pdf.js`) keeps the original PDF (up to 40 MB; GitHub's
  100 MB file limit and base64 in sync) plus a 1240 px JPEG per page (`bg`,
  for thumbnails, first paint and older app versions). Bigger PDFs get 2400 px
  JPEGs only.
  - `pdfview.js` draws the visible window from the PDF: `pdfTile()` for the
    live page (`ink.js`) and the writing window (`zoomstrip.js`, its own
    `who` so they don't cancel each other), cached by (page, scale, window)
    within 96 MB; `pdfAreaReady()` for pictures (continuous view) and
    exports. At most 3 PDFs stay open.
  - `normPage` must keep `pdf`. `pageFileIds` includes it once; deleting a
    page or note deletes the PDF only when no page uses it (`pdfInUse`).
  - PDF export embeds the original page with pdf-lib (`embedPage`, crop box)
    and draws the writing on top as a transparent PNG; turned (rotated) pages
    fall back to a picture.
- **Meaning lists** (`nearLists()` in `semantic.js`):
  - Worked out for all pairs once (time-sliced in the background when big),
    then patched for changed notes only.
  - Saved encrypted on the device as `near:lists`, with sealed notes left out.
  - Vectors use their saved int8 form (`mean` from the chunks), so results are
    identical after unlocking again.
  - `mapdata.connections()` is memoised by `vault.rev` + `nearVersion()`.
  - `RELATED_MIN` = 0.32 was calibrated on real notes.
- **Map** (`graph.js`):
  - force-graph is loaded only when the map opens (and preloaded 4 s after
    unlock).
  - `autoPauseRedraw(true)`, with `poke()` to redraw after state changes.
  - A save that doesn't change the map's shape doesn't restart the layout
    (an order-free hash).
  - Big maps get fewer warm-up ticks and a time limit on settling.
- **Sync limits:** GitHub allows about 80 content requests a minute and 500 an
  hour.
  - Sync uploads in batches (budget 70 a minute, 440 an hour, tracked in
    `localStorage`), small bundles first.
  - A note's files go up before the note.
  - Rate-limit answers become state `uploading` with a retry, never an error.
  - When: 4 s after a local change (`scheduleSync`), at once when the app is
    hidden with a change still waiting (`pendingLocal`; iPadOS pauses hidden
    apps), on becoming visible, and every 3 min while visible.
  - Conflicts: typed notes keep the newer version plus a "conflict copy" in
    the inbox. Ink pages merge strokes; notebooks merge.
- **Organiser:** classifies by exemplar phrases (0.6 × best + 0.4 × second).
  The thresholds come from measurements. Re-measure if you change them.
- **iOS Safari:**
  - WebAuthn calls need a fresh tap.
  - `touch-action` is set on the page (fingers scroll, the Pencil writes).
  - Stylus touches are `preventDefault`ed.
  - The `maximum-scale=1` viewport on iOS stops auto-zoom.
  - iPadOS 26 blurs the top of a Home Screen app (soft title and back
    button) unless a solid full-width bar (> 10 px) sits on the top edge.
    `.edge-guard` in `index.html` is that bar: background clipped to text so
    it paints nothing, `pointer-events: none`. Keep it first in `<body>`,
    outside `#app`. Chromium can't show the blur; `t6f` checks the bar.

## Testing

Playwright (Python) end-to-end tests are in `tests/`; see `tests/README.md`.
`cd tests && ./runall.sh` serves the app on 127.0.0.1:8765 and runs about 55
tests at phone and iPad sizes, in about 20 minutes. Every test must pass before
pushing, and new features get a new test.
- `tests/mockgh.py` stands in for the GitHub API.
- Touch ID tests use Chromium's virtual authenticator on `localhost`.
- `tests/perf/` measures speed (`scale.py 10000` loads 10,000 notes).

Baselines at 10,000 notes (headless, no GPU):

| Action | Time |
|---|---|
| Unlock | ~1.2 s |
| All notes | 0.09 s |
| Search | ~0.1 s |
| Map opens | ~4 s, then idle |
| Save with the map open | ~0.06 s |
| Startup JS before unlock | ~510 KB |
| Long PDF flipping | memory stays flat (decoded pages kept: about 7) |

## Requests from the owner

### 3 Nov 2026, done on 6 Nov 2026 (`sb-v16`)

1. **Long notebook names fit on covers.** `fit()` in `js/covers.js` breaks a
   name onto two lines at a word (three if two would be tiny) once one line
   would drop below 80% size. Each cover's title box has `g` (a second line
   grows `up`, `down` or from the `mid`dle) and `b` (the top and bottom the
   letters may use: the label or band). "…" only for a name that can't fit
   even then. `t5s` checks every cover, printed and handwritten, with long
   names; `tests/perf/covershot.py all` shows them.
2. **Moving around when zoomed in on a handwritten note.** `.ink-scroll` and
   `.ink-stack` use `align-items: flex-start` with `margin-inline: auto` on
   their children, so a page wider than the screen starts at the left edge.
   `t5x` zooms to 2x and scrolls and drags to both edges, in both views.
3. **PDF import keeps full resolution.** See "PDFs" above; `t5y`. Notes
   imported before keep their JPEGs ("Make sharper" not built: re-importing
   the PDF does it).
4. (Left blank. On 6 Nov the owner said to ignore it.)

### 6 Nov 2026, done the same day (`sb-v17`)

1. **More covers**: 28 more in new collections (Futuristic, AI & data, Lined &
   paper, Fun, Calm, plus four for Nature), drawn by `tools/covergen2.py` into
   `js/coverart2.js`. `t5s` covers them. In "All" covers are sorted by
   collection.
2. **Default text size and colour in Settings** (plus font): see "Synced
   settings" above; `t6a`.
3. **Zoom that follows the fingers**, deeper (6x): see "Zoom" above; `t5z`.
   Previously the pinch scaled around the screen's middle, the continuous view
   then re-centred it, and it stopped at 3x.

Follow-up after a code review (`sb-v18`): the default text now reaches PDF
exports and new whiteboard text, the Settings hint says what follows it live
and what doesn't, fonts and sizes moved to `js/fonts.js`, and
`tools/README.md` documents `covergen2.py`.

A redesign mockup (slim menu rail, one-row writing toolbar, cover shelf) was
shown on 6 Nov; the owner said to ignore it. Don't build it or bring it up
unless they ask.

### 6 Nov 2026, later the same day (`sb-v19` to `sb-v22`)

Research (`docs/research/2026-11-06-feature-ideas.md`) ranked 14 ideas; the
owner picked 1 to 4, all built:

1. **Recently deleted** (`sb-v19`): see "Recently deleted" above; `t6b`.
2. **From your notes on Today** (`sb-v19`): on this day in past years plus
   one older note worth another look (`js/resurface.js`); `t6c`.
3. **Two notes side by side** (`sb-v20`, mockup approved first): see "Side by
   side" above; `t6e`. Fixed in `sb-v21`: the button did nothing for a note
   open inside a notebook (`#/notebook/B?note=A`, the iPad's usual way).
4. **Highlights** (`sb-v20`): see "Highlights" above; `t6d`. Highlights sync
   (they are strokes in the encrypted page data).

**Soft text at the top on iPad** (`sb-v21`, `sb-v22`): the note title and back
button looked blurred on the iPad only (a laptop was fine). `sb-v21` turned
off Safari's own button look (harmless, didn't fix it). The cause is iPadOS
26's top-edge blur for Home Screen apps; `sb-v22` added `.edge-guard` (see
"iOS Safari" above). The owner confirmed on their iPad that it's sharp now.

### 6 Nov 2026, evening (`sb-v23`)

1. **Text boxes go where you draw them** (handwritten notes): with the text
   tool, a drag draws the box (dashed outline while dragging, `.tb-draft`);
   the box takes that position and width, shows the drawn height while you
   type (`drawnH`, not saved), and the words wrap inside. A tap still makes a
   box, now kept inside the part of the page on screen (`visibleArea()`), so
   it doesn't run off the screen when zoomed in. On the page,
   `drawRichText` breaks a word wider than the box between letters, like
   `overflow-wrap: anywhere` does while typing. `t6g`.
2. **Changing a typed note's title**: the title could only be changed in
   editing mode (Edit, or tapping the text), so tapping the title while
   reading did nothing, which felt like "sometimes it works". Tapping the
   title now starts editing with the cursor at the end of the title. Handwritten
   notes and whiteboards already rename by tapping their name. `t6g`.
3. **Notebook lists newest first**: notes (and sub-notes under a note) sort
   by `updatedAt`, most recent at the top, instead of the order they were
   made. Writing on a handwritten page counts (the page summary saves the
   note). PDF export of a notebook still uses the order notes were made. `t6g`.

### 7 Nov 2026 (`sb-v24`)

**"Emptied Recently deleted on the iPad, still there on the computer."**
Emptying already synced (`deleteNote` calls `changed()`; deletions go up as
`sha: null` tree entries and other devices drop them as `localGone`), and
the other device's list clears at its next sync. The gap: the sync waits
4 s after a change, and an iPad app put away within that time is paused
until it's opened again, so the deletion stayed on the iPad. Now a waiting
change is sent at once when the app is hidden. A computer only picks it up
when it syncs (tab shown again, every 3 min, or Sync now). `t6h` (two
devices; its waits use `page.wait_for_timeout`, since `mockgh` answers from
the test's own thread and `time.sleep` would stall it).

### 8 Nov 2026 (`sb-v25`)

1. **Moving a text box without switching tools** (handwritten notes): with
   the text tool, a drag that starts on a text box or post-it moves it (it
   becomes a selection and uses `startMove`, then the selection is cleared;
   `drawing.hit`, `fromText`); a tap still opens it. While typing, the round
   grip (`.tb-move`) moves the box. Moving or widening (`editGeom`) is saved
   on Done even if the words didn't change (before, a width change alone was
   only saved with a later change), with one undo step taken at the first
   drag. `t6i`.
2. **Pasting pictures** (`js/clipimages.js`): Ctrl/Cmd+V with a picture goes
   into the note, never Capture. Typed notes and Today's note: the editor's
   `handlePaste`/`handleDrop` (`createRichEditor({ images })`,
   `insertImageFiles`); while reading, `note.js` catches the paste on
   `document` (capture phase), starts editing and adds it at the end.
   Handwritten pages: `inknote.js` places it in view (`insertImage`).
   Whiteboards: their paste listener moved from the board element to
   `document` (with nothing focused a paste never reached it). Each skips
   typing targets, open sheets and the inactive side-by-side pane, and calls
   `stopImmediatePropagation`; `app.js` ignores `defaultPrevented` pastes.
   "Paste a picture" (typed Insert menu, handwritten + menu) uses
   `navigator.clipboard.read()` for the iPad without a keyboard. A picture
   inserted while another is selected goes after it (it used to replace it,
   with Insert > Image too). `t6i`.

### 8 Nov 2026, later (`sb-v26`, mockup approved: "both")

1. **Numbers in the menu** (`js/counts.js`, `views/shell.js`): "N due" on
   Today and Tasks (the same number: open tasks due today or earlier; the
   owner asked for "due", not "late"), tasks left, one line per region with
   tasks under Tasks (links to `#/tasks?by=region&region=<id|none>`), labelled
   spots and highlights. `menuCounts()` is memoised by `vault.rev` + day,
   with each note's numbers in a `WeakMap` keyed by the note object (a saved
   note is a new object), so only changed notes are recounted. Handwritten
   highlights come from `n.hlCount` (worked out in `inkSummary`, fixed up when
   Highlights opens), else `hlPages.length`. `.due-count` (not `.due-pill`,
   which task rows use). `t6j`.
2. **Tasks by region** (`views/tasks.js`): a third grouping, regions in
   their order then "No region" (inbox and daily notes), each with "N to do"
   and "N due"; `region` param shows one region with "Show all regions".
3. **25 region colours** (`PALETTE`, `REGION_COLOUR_NAMES` in `model.js`):
   13 added, text colours >= 5.9:1 in both themes. Settings shows a grid of
   dots (popover) instead of a list of names; other regions' colours are
   marked. `t6j`.
4. **Contents and Pages for typed notes** (`views/contents.js`, button in
   the note's top bar): headings with reading time (to the next heading at
   the same level or above), the one you're in marked, jumps that land under
   the sticky toolbar (instant for long jumps, smooth for short), Back to top,
   To the end. Pages reuses the PDF export's layout (`typedPages(n, { px })`
   in `export.js`; each canvas has `range` [from, to, total]); page i maps to
   the note on screen by its share of the span from `#n-head` to the end of
   `#n-rich`, so labels and jumps are close, not exact, on narrow screens.
   Works in a notebook's pane (it finds the scrolling box). The old Outline
   panel stays on very wide screens. `t6j`.

## Ideas noted, not requested

- Confirm on a real iPad: Touch ID unlock, and writing with the Pencil across
  a page break in the continuous view (tests use a virtual authenticator and
  a mouse).
- Remind the owner before the GitHub token expires (sync shows a 401 when it
  does).
- Inbox and Today render everything at once, which is fine up to a few hundred
  items; show rows in batches as you scroll, as `notes.js` does, if it ever
  matters.
- Reading Notability's own `.note` files (actual ink, not pictures) would need
  a binary-plist parser and real sample files.
