"""Reading handwriting: background reading makes handwriting searchable; lasso Convert to text."""
from dbg import *
from hershey_ink import text_strokes
import json, sys, time
OUT = 'shots5'
LINES = [('lead with outcomes, not tasks', 'scripts'), ('check vs D05 yield', 'futural'), ('Ask Wei Ling to review it', 'scriptc'),
         ('send the draft by Friday', 'scripts'), ('book the next coffee', 'futural'), ('momentum backtest on SGX', 'scriptc')]
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    strokes = []
    k = 0
    for i, (t, f) in enumerate(LINES):
        for s in text_strokes(t, f, 140, 150 + i * 72, 1.55, seed=i, slant=0.08 if f != 'futural' else 0):
            k += 1
            strokes.append({'id': f'k{i}_{k}', 't': 'pen', 'pen': 'ballpoint', 'c': '#1B2A38', 's': 2.8, 'sp': 1, 'pts': s, 'at': 1})
    nid = J("""async (strokes) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const pg = M.newPage({ paper: 'ruled' });
      await V.savePage(pg.id, { ...V.emptyPageData(), strokes });
      const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Mentor coffee', titleAuto: false, region: 'career', inbox: false, pages: [pg] }));
      return n.id; }""", strokes)
    t0 = time.time()
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    # background reading fills the note's handwriting text
    hw = None
    for _ in range(120):
        page.wait_for_timeout(500)
        hw = J(f"import('./js/vault.js').then(V => {{ const n = V.state.notes.get('{nid}'); return n.hw && Object.values(n.hw)[0] ? Object.values(n.hw)[0].lines.map(l => l.t) : null; }})")
        if hw: break
    print(f'read in {time.time() - t0:.1f}s:', hw)
    hw = [h for h in hw if h]
    assert hw and len(hw) == len(LINES), hw
    def cer(a, b):
        a = a.lower(); b = b.lower(); d = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            prev = d[0]; d[0] = i
            for j, cb in enumerate(b, 1):
                cur = d[j]; d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb)); prev = cur
        return d[len(b)] / max(1, len(a))
    errs = [cer(t, r) for (t, _), r in zip(LINES, hw)]; print('CER per line', [round(e, 2) for e in errs], 'mean', round(sum(errs) / len(errs), 3))
    assert sum(errs) / len(errs) < 0.15
    page.wait_for_timeout(500)
    body = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').body)"); print('BODY:', body.replace('\n', ' | ')[:300])
    found = J("import('./js/model.js').then(M => import('./js/vault.js').then(V => M.searchNotes([...V.state.notes.values()], 'backtest', 5).map(n => n.title)))"); print('search backtest ->', found)
    assert 'Mentor coffee' in found
    # Lasso the second line and convert it
    page.locator('[data-tool=lasso]').click()
    pg = page.locator('.ink-page').bounding_box(); sc = pg['width'] / 1000
    y = 150 + 72 + 10
    x0, x1, ya, yb = pg['x'] + 120 * sc, pg['x'] + 520 * sc, pg['y'] + (y - 32) * sc, pg['y'] + (y + 40) * sc
    page.mouse.move(x0, ya); page.mouse.down()
    for (px, py) in [(x1, ya), (x1, yb), (x0, yb), (x0, ya + 2)]: page.mouse.move(px, py, steps=6)
    page.mouse.up(); page.wait_for_timeout(300)
    page.locator('.sel-bar [data-sel=read]').click()
    page.wait_for_selector('#cv-t:visible', timeout=30000)
    got = page.locator('#cv-t').input_value(); print('converted:', repr(got))
    page.screenshot(path=f'{OUT}/convert-{int(page.viewport_size["width"] >= 900)}.png')
    assert cer('check vs D05 yield', got) < 0.2
    page.locator('#cv-t').fill('check vs D05 yield')
    page.locator('[data-rep]').click(); page.wait_for_timeout(900)
    d = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); const d = await V.loadPage(n.pages[0].id); return [d.strokes.filter(s => s.id.startsWith('k1_')).length, d.objects.filter(o => o.type === 'text').map(o => o.doc.content[0].content[0].text)]; }})"); print('after replace', d)
    assert d[0] == 0 and d[1] == ['check vs D05 yield']
    page.screenshot(path=f'{OUT}/converted-{int(page.viewport_size["width"] >= 900)}.png')
    print('OK handwriting')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
