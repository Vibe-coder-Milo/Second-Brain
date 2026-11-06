# Tools

- `covergen.py`: generates the newer notebook cover artwork. Run
  `python3 covergen.py > covers_extra.json`. Then put its `sprite` string into
  `js/coverart.js` (`MORE_ART`), and each entry of `covers` (id, name, group,
  title box `t`) into `COVERS` in `js/covers.js`. Covers are 210×280 SVG
  symbols, with a 12-unit spine shadow on the left. Check the result with
  `tests/perf/covershot.py all`.
- `covergen2.py`: generates the second set of cover artwork (Futuristic,
  AI & data, Lined & paper, Fun, Calm and four Nature covers). Run
  `python3 tools/covergen2.py` from the repo root: it writes `js/coverart2.js`
  directly (`NEW_ART` for the sprite, `NEW_COVERS` with each cover's id, name,
  collection and title box), which `js/covers.js` already includes. Don't
  edit `coverart2.js` by hand. A new collection also needs adding to
  `COVER_GROUPS` in `js/covers.js`. Check with `tests/t5s.py` and
  `tests/perf/covershot.py <ids>`.
- `eslint.config.mjs`: a lint setup for catching undefined names
  (`npx eslint -c tools/eslint.config.mjs js`). It isn't required; there's no
  build.
