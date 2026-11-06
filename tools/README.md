# Tools

- `covergen.py`: generates the newer notebook cover artwork. Run
  `python3 covergen.py > covers_extra.json`. Then put its `sprite` string into
  `js/coverart.js` (`MORE_ART`), and each entry of `covers` (id, name, group,
  title box `t`) into `COVERS` in `js/covers.js`. Covers are 210×280 SVG
  symbols, with a 12-unit spine shadow on the left. Check the result with
  `tests/perf/covershot.py all`.
- `eslint.config.mjs`: a lint setup for catching undefined names
  (`npx eslint -c tools/eslint.config.mjs js`). It isn't required; there's no
  build.
