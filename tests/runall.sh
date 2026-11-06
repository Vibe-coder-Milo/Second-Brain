#!/bin/bash
# Runs every test against a local copy of the app. Results go to runall.log,
# one line per test: [0] means it passed. Takes about 20 minutes.
#   cd tests && ./runall.sh            (or: ./runall.sh t5r.py t5s.py  to run some)
cd "$(dirname "$0")"
# Playwright's own Chromium; set PLAYWRIGHT_BROWSERS_PATH if it lives elsewhere.
[ -z "$PLAYWRIGHT_BROWSERS_PATH" ] && [ -d /opt/pw-browsers ] && export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# Serve the app on 127.0.0.1:8765 unless something already is.
if ! curl -s -o /dev/null http://127.0.0.1:8765/; then
  python3 serve.py .. 8765 > serve.log 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  sleep 1
fi
ALL=("test1.py" "test2.py" "test3.py" "t4a.py phone" "t4a.py ipad" "t4b.py" "t4c.py" "t4e.py" "smoke4.py" "t5a.py" "t5b.py" "t5c.py" "t5d.py phone" "t5d.py ipad" "t5d_touch.py" "t5e.py phone" "t5e.py ipad" "t5e_touch.py" "t5f.py" "t5g.py phone" "t5g.py ipad" "t5h.py phone" "t5h.py ipad" "t5i.py phone" "t5i.py ipad" "t5j.py phone" "t5j.py ipad" "t5k.py phone" "t5k.py ipad" "t5l.py phone" "t5l.py ipad" "t5m.py phone" "t5m.py ipad" "t5n.py phone" "t5n.py ipad" "t5o.py phone" "t5o.py ipad" "t5p.py phone" "t5p.py ipad" "t5q.py phone" "t5q.py ipad" "t5r.py phone" "t5r.py ipad" "t5s.py phone" "t5s.py ipad" "t5t.py phone" "t5t.py ipad" "t5u.py phone" "t5u.py ipad" "t5v.py" "t5w.py")
if [ $# -gt 0 ]; then LIST=("$@"); else LIST=("${ALL[@]}"); fi
: > runall.log
for t in "${LIST[@]}"; do
  start=$(date +%s)
  out=$(timeout 500 python3 $t 2>&1)
  code=$?
  errs=$(echo "$out" | grep -E "PAGEERROR|CONSOLE error" | grep -v "Service Worker" | head -3)
  last=$(echo "$out" | grep -v "Service Worker\|willReadFrequently" | tail -2 | tr '\n' ' ')
  echo "[$code] $t ($(( $(date +%s) - start ))s) :: $last :: $errs" >> runall.log
done
echo DONE >> runall.log
echo "$(grep -c '^\[0\]' runall.log) passed, $(grep -c '^\[[1-9]' runall.log) failed (see tests/runall.log)"
