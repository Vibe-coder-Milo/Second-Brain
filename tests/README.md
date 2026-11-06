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

Helpers: `dbg.py` (`run(steps, vp, mob)` creates a vault and runs steps),
`mockgh.py` (in-memory GitHub Git Data API), `calib.py`, `hershey_ink.py`
(handwriting-like strokes).

`perf/`: speed measurements, not pass/fail. `scale.py 10000` (10,000 notes),
`perf.py` (startup, unlock, map, long PDF), `startup.py` (scripts loaded before
unlock), `prof*.py` (CPU profiles), `covershot.py all` (renders every cover).
