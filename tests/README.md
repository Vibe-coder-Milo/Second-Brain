# Tests

End-to-end tests with Playwright (Python) driving Chromium against a local copy
of the app. Each test starts a fresh vault (passphrase `harbour lights fold four`),
does what a person would do, and checks the result. Phone (390×844) and iPad
(1180×820) sizes where it matters.

## Setup (once)

```
pip install playwright
python -m playwright install chromium
```

The handwriting test (t5h) draws letters from the Hershey fonts:

```
mkdir -p dl/hershey && npm pack hersheytext@2.0.0 && tar -xzf hersheytext-2.0.0.tgz -C dl/hershey && rm hersheytext-2.0.0.tgz
```

## Run

```
cd tests
./runall.sh                  # everything, about 20 minutes; results in runall.log ([0] = passed)
./runall.sh "t5r.py ipad"    # one or a few
python3 t5r.py phone         # one test directly (needs the server: python3 serve.py .. 8765)
```

`runall.sh` starts `serve.py` (a no-cache static server with the right types for
.mjs/.wasm) on 127.0.0.1:8765 if nothing is there. Screenshots land in
`shots*/` (ignored by git); look at them when changing layout.

## What's here

| Test | Covers |
|---|---|
| test1-3, smoke4, t4a-t4e | First run, notes, capture, regions, sync (t4c: two devices against `mockgh.py`), conflicts |
| t5a-t5f | Notebooks, handwriting, recordings and transcription (`jfk.wav`), scanning (`scanphoto.jpg`), whiteboards, table views |
| t5g-t5l | Toolbars, typed notes, colours, dark mode, page layout steadiness |
| t5m | Organiser (uses `calib.py` sample notes), colour palettes, app version |
| t5n, t5p | Focus mode, coloured links, map connections and themes, mini-map, weekly card, auto-link |
| t5o | Mark up a PDF (`sample.pdf`), laser pointer |
| t5q | Speed: map library loaded on demand, map rests when still, long PDFs keep memory flat, page turning, reopen at last page |
| t5r | Continuous view (pages one under another) |
| t5s | Notebook covers and collections; long names fit on two lines |
| t5t | Touch ID / Face ID unlock (virtual authenticator on `localhost`) |
| t5u | Bringing in many PDFs / a zip (Notability) |
| t5v | Sync in batches within GitHub's limits |
| t5w | Notes close in meaning: kept lists match a full recompute (real model) |
| t5x | Zoomed in on a handwritten page: scroll and drag to its far left and right edges |
| t5y | Sharp PDFs: the PDF is kept, zoomed text is crisp, exports keep the original pages |
| t5z | Pinch and wheel zoom follow the fingers / pointer, up to 6x; the zoom label fits the page again |
| t6a | Default text in Settings (font, size, colour) in typed notes, Today, text boxes, whiteboards and PDF export |
| t6b | Recently deleted: notes, boards and notebooks kept 30 days, put back (with links and files), delete now, empty, purge |
| t6c | Today's "From your notes": on this day in past years, and one older note worth another look |
| t6e | Two notes side by side: picker, writing on each side, shared pens, resize, swap, close, remembered pair, Beside |
| t6f | Invisible bar on the top edge that stops iPadOS blurring the top bar: full width, on top, paints nothing, taps go through |
| t6g | Notebook lists newest first (sub-notes too); tap a typed note's title to change it, again and again, in the notebook pane and on its own; a text box dragged out on a handwritten page sits where drawn and wraps inside it (long words too); a tapped box stays on screen when zoomed in |
| t6h | Emptying Recently deleted on one device (two devices, mock GitHub): it syncs by itself within seconds, at once if the app is put away, page files go too, and the other device's Recently deleted empties at its next sync |
| t6i | Text boxes move with the text tool (drag; a tap still opens one) and by their grip while typing, saved and undoable; pictures pasted with Ctrl/Cmd+V or Paste a picture land in typed notes (cursor, or the end while reading), Today's note, handwritten pages and whiteboards, never opening Capture; nothing replaced |
| t6j | Menu numbers ("N due" on Today and Tasks, tasks left, a line per region, labels, highlights; they follow a tick), Tasks by region (one region from the menu), 25 region colours in a grid, Contents (headings, reading times, you're here, jump, top, end) and Pages (printed pages, tap to go) in a long typed note, on its own and in a notebook |
| t6d | Highlights: words under neat and sloppy highlights (PDF, handwriting, typed), colours, remove a slip, lasso "Add to highlights" |

Helpers: `dbg.py` (`run(steps, vp, mob)` creates a vault and runs steps; `SB_BASE` points it at another copy of the app),
`mockgh.py` (in-memory GitHub Git Data API), `calib.py`, `hershey_ink.py`
(handwriting-like strokes).

`perf/`: speed measurements, not pass/fail. `scale.py 10000` (10,000 notes),
`perf.py` (startup, unlock, map, long PDF), `startup.py` (scripts loaded before
unlock), `prof*.py` (CPU profiles), `covershot.py all` (renders every cover).
