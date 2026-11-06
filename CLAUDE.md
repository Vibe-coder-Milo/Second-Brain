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
  - Bump `VERSION` (`sb-vN`; currently `sb-v15`) on every release.
  - Add every new JS/CSS file to `SHELL`, or it won't work offline.
  - The app shows an update bar (`js/appupdate.js`).
- **Views:** `js/views/*.js` export `mount(main, params, ctx)`, returning
  `{ update(params), onEvent(evt), destroy() }`. Hash routes are in `js/app.js`:
  `#/today`, `#/map`, `#/inbox`, `#/notes`, `#/note/:id`, `#/notebooks`,
  `#/notebook/:id`, `#/tasks`, `#/labels`, `#/ask`, `#/review`, `#/settings`.
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
| Typed notes | `js/views/note.js`, `js/editor/rich.js` (Tiptap), `js/editor/toolbar.js` |
| Handwritten notes | `js/views/inknote.js` (screen), `js/editor/ink.js` (InkSurface), `js/editor/inkdraw.js` (drawing pages, pens, paper, PDF backgrounds), `js/editor/pagestack.js` (continuous view), `js/editor/zoomstrip.js` (writing window), `js/handwriting.js` |
| PDFs | `js/pdf.js` (import), `js/bulkimport.js` + `js/views/importsheet.js` (many at once / Notability), `js/export.js` (PDF/Markdown export) |
| Whiteboards | `js/views/board.js`, `js/boarddraw.js` |
| Notebooks, covers | `js/views/notebooks.js`, `js/covers.js`, `js/coverart.js` (generated, see `tools/covergen.py`) |
| Map | `js/views/map.js`, `js/graph.js` (force-graph canvas), `js/mapdata.js` (connections, themes), `js/mapassist.js` (Noticed, weekly digest, auto-link), `js/minimap.js` |
| On-device AI | `js/ai.js`, `js/ai-worker.js`, `js/semantic.js` (meaning index + related lists), `js/organiser.js` (files notes into regions), `js/ocr.js`, `js/recorder.js` |
| Other screens | `today.js`, `inbox.js`, `notes.js`, `tasks.js`, `labels.js`, `tableview.js`, `ask.js`, `review.js`, `history.js`, `scanner.js`, `settings.js`, `gate.js` (create/join/unlock), `shell.js` |

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
- **Handwritten pages:** each page `{ id, paper, color, h, bg? }`. The page's
  ink lives in a separate encrypted file (id = page id, gzip JSON with strokes
  and objects). `bg` is the file id of a background image (PDF page or photo).
  `PAGE_W` = 1000 units.
- **Sync repo layout:** `notes/<id>.json`, `files/<id>.bin`, `keyring.json`.
  One commit per sync.
- **Device settings** (`state.device`, kept encrypted on each device, not
  synced): `paper`,
  `paperColor`, `darkPaper`, `pageView` (`continuous`/`single`), `semantic`,
  `organise`, `autoLink`, `autoLockMin`, `sync {owner, repo, branch, token}`,
  `organiserLog` and more.

## Things that are easy to break

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
- **Saving ink:** saves are debounced (600 ms) per page id. Always `flush()`
  before switching pages. The `fresh` map keeps the newest data of pages just
  left.
- **PDF import:** pages are rasterised to JPEG at import (see open task 3).
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
  - Conflicts: typed notes keep the newer version plus a "conflict copy" in
    the inbox. Ink pages merge strokes; notebooks merge.
- **Organiser:** classifies by exemplar phrases (0.6 × best + 0.4 × second).
  The thresholds come from measurements. Re-measure if you change them.
- **iOS Safari:**
  - WebAuthn calls need a fresh tap.
  - `touch-action` is set on the page (fingers scroll, the Pencil writes).
  - Stylus touches are `preventDefault`ed.
  - The `maximum-scale=1` viewport on iOS stops auto-zoom.

## Testing

Playwright (Python) end-to-end tests are in `tests/`; see `tests/README.md`.
`cd tests && ./runall.sh` serves the app on 127.0.0.1:8765 and runs about 50
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
| Long PDF flipping | memory stays flat (decoded pages kept: about 8) |

## Open requests from the owner (3 Nov 2026), not started

1. **Long notebook names get cut off on covers.** The owner wants them to fit,
   in a smaller size or on a second line.
   - Where: `fit()` in `js/covers.js` shrinks to 62% and then truncates with
     "…". Each cover has a title box `t { x, y, size, max, anchor, font }` in
     `COVERS`.
   - Suggested fix: when one line would need to drop below about 80% size,
     break into two lines (`<tspan>`s) at a word boundary.
     - For covers whose title sits at the bottom (Peaks, Tide, Koi, Aurora,
       Night chart, Planes, Riso), grow upwards.
     - For covers with a fixed label (Shophouses signboard, Tweed patch,
       Shibori tag, Art deco panel, Gingham, Tartan, Composition, Leather,
       Citrus pill, Polka/Stripes/Waves bands, Marbled, Peranakan, Kraft,
       Terrazzo, Blueprint), make the label taller or allow a smaller size.
     - Check every cover with `tests/perf/covershot.py all`, using long and
       short names.
   - Also check other places a notebook name shows (the shelf's `.nb-name`
     wraps already; the notebook header; pickers).
2. **Can't move around when zoomed in on a handwritten note.** After a pinch or
   Ctrl+scroll zoom, only the zoomed area shows.
   - Likely cause: `.ink-scroll` (and `.ink-stack`) use `display: flex;
     align-items: center`. When the page is wider than the screen, flexbox
     centring pushes the left part into negative overflow that can't be
     scrolled to.
   - Fix: use `align-items: flex-start` with `margin-inline: auto` on the
     page, stack and slots (auto margins never go negative), or `safe center`.
   - Then check that horizontal scrolling, finger panning (`touch-action:
     pan-x pan-y`), the continuous view, the writing window (`zoomstrip.js`)
     and the canvas windowing (`wantedView` uses `scrollLeft - offsetLeft`)
     still behave.
   - Add a test: zoom to 2×, then scroll to the far left and right edges of
     the page.
3. **PDF import loses resolution; the owner asked to remove that.**
   - How it works now: `js/pdf.js` renders each page at `min(3, 1700 / width)`
     scale (about 1700 px wide, roughly 200 dpi for A4) and saves it as JPEG at
     quality 0.86. A page fills up to 900 CSS px (1240 in focus mode) × device
     pixel ratio 2 × zoom up to 3, so it looks soft when zoomed and in focus
     mode, and JPEG blurs text.
   - Proper fix: keep the original PDF.
     - Store the PDF bytes once as an encrypted file, and give each page
       `pdf: { file, n }` alongside a small raster for thumbnails and quick
       first paint.
     - Render pages with pdf.js on demand at the current scale, for the
       visible window only. This hooks into `drawPaper`/`fileImage` in
       `inkdraw.js` and the windowed canvases in `ink.js`; cache by
       (page, scale), with an LRU like `fileImage`.
     - Export (`export.js`) can embed the original vector pages with pdf-lib
       (`embedPdf`), so exported PDFs are sharp too.
   - Limits to check: a GitHub file must stay under 100 MB (files are
     `files/<id>.bin`), and the upload budget.
   - Notes imported before keep their JPEGs; optionally offer "Make sharper"
     to re-import if the original PDF is still at hand.
   - Quick interim option: render at about 2600 px, JPEG quality 0.92.
4. The owner started a fourth point but left it blank. Ask what it was.

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
