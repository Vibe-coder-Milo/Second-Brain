# Test fixtures for Word and PowerPoint import

Small files for testing how the app reads `.docx` and `.pptx` files. They are
made by `make_fixtures.py`, which is deterministic: running it again gives
the same files.

Regenerate from the repo root:

    python3 tests/fixtures/make_fixtures.py

It needs `python-docx`, `python-pptx` and `pillow`
(`pip install python-docx python-pptx pillow`).

## sample.docx

A Word file with a heading structure, lists, a table, a picture, a page
break and a last section.

Expected structure, in order:

| # | Style | Text |
|---|---|---|
| 1 | Title | Kitchen renovation plan |
| 2 | Heading 1 (H1) | Introduction |
| 3 | Normal | "The plan keeps the **budget** in check and the *timeline* realistic." (bold run "budget", italic run "timeline") |
| 4 | Normal | "The work covers the cabinets, the tap and the lights." |
| 5 | Heading 2 (H2) | Background |
| 6-8 | List Bullet | Old cabinets / Leaking tap / Poor lighting |
| 9-11 | List Number | 1. Measure / 2. Get quotes / 3. Choose a contractor |
| 12 | Heading 1 (H1) | Quotes |
| 13 | Table (style "Table Grid"), 3 rows x 3 columns | see below |
| 14 | Picture (inline, 3 in wide, 400x240 px PNG: blue `#3A7CA5` with a white rectangle in the middle) | none |
| 15 | Caption | Floor plan sketch |
| 16 | Page break | (a break in its own paragraph, not a heading) |
| 17 | Heading 1 (H1) | Next steps |
| 18 | Normal | "Book the contractor and confirm the final quote before the end of the month." |

Heading outline: Title "Kitchen renovation plan"; H1 "Introduction" > H2
"Background"; H1 "Quotes"; H1 "Next steps".

Table cells (row by row):

| Item | Quote A | Quote B |
|---|---|---|
| Cabinets | 4200 | 3900 |
| Lighting | 800 | 950 |

Counts: 1 picture, 1 page break, 1 table, 6 bullet/numbered items (3 + 3),
2 bold/italic runs.

## sample-plain.docx

A document with no sections. Three Normal paragraphs, no headings and no
lists. An importer should give one body of text, without making up headings.

1. "The first paragraph has no heading above it."
2. "The second paragraph is ordinary body text."
3. "The third paragraph ends the note."

## sample.pptx

A 16:9 deck (slide width 13.333 in = 12191695 EMU, height 7.5 in = 6858000
EMU) with 4 slides and PowerPoint sections.

Slides:

| Slide | Layout | Title | Other content |
|---|---|---|---|
| 1 | Title slide | Quarterly review | Subtitle: "November 2026" |
| 2 | Title and content | Highlights | Bullets: "Revenue up", "Two new clients", "Team grew to 8" |
| 3 | Title only | Floor plan | Picture (same PNG as above), and a text box (below) |
| 4 | Title only | Numbers | Table (below) |

Slide 3 picture position and size (the same PNG as in the Word file):

- Left 1 in = 914400 EMU, top 2 in = 1828800 EMU
- Width 5 in = 4572000 EMU, height 3 in = 2743200 EMU (keeps the 400:240 ratio)
- As fractions of the slide: x = 0.0750, y = 0.2667, width = 0.3750, height = 0.4000

Slide 3 text box: left 7 in, top 2 in, width 5 in, height 2 in. Text:
"Kitchen on the left, dining on the right".

Slide 4 table (3 x 3, placed at left 1 in, top 2 in, width 8 in, height 2 in):

| Item | Quote A | Quote B |
|---|---|---|
| Cabinets | 4200 | 3900 |
| Lighting | 800 | 950 |

Sections (PowerPoint's own grouping of slides):

- "Opening": slides 1 and 2
- "Details": slides 3 and 4

These are stored in `ppt/presentation.xml` as a `p14:sectionLst` inside an
extension list, which is the last child of `p:presentation`. The slide IDs
in the sections are 256, 257 (Opening) and 258, 259 (Details).
