"""Round 6a: mark up a PDF from a notebook, the laser pointer."""
from dbg import *
import sys, os
OUT = 'shots5'
SP = os.path.dirname(os.path.abspath(__file__))
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nbid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); return (await V.saveNotebook(M.newNotebook({ title: 'Investing', region: 'investing' }))).id; })()""")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_selector('[data-pdf]'); page.wait_for_timeout(300)
    page.locator('[data-pdf]').first.click(); page.wait_for_selector('.doc-choose')
    with page.expect_file_chooser() as fc:
        page.locator('.doc-choose').click()
    fc.value.set_files(os.path.join(SP, 'sample.pdf'))
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=60000)
    page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    n = J("""import('./js/vault.js').then(V => { const n = [...V.state.notes.values()].find(x => x.kind === 'ink'); return { title: n.title, pages: n.pages.length, bg: !!n.pages[0].bg, notebook: n.notebook, text: (n.body || '').slice(0, 60) }; })""")
    print('pdf note', n); assert n['pages'] == 2 and n['bg'] and n['notebook'] == nbid and n['title'] == 'sample'
    # draw a circle on the PDF page with the pen
    pg = page.locator('.ink-page').bounding_box()
    cx, cy = pg['x'] + pg['width'] * 0.4, pg['y'] + 260
    import math
    page.locator('#iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    page.mouse.move(cx + 60, cy); page.mouse.down()
    for i in range(1, 41): page.mouse.move(cx + 60 * math.cos(i / 40 * 6.4), cy + 40 * math.sin(i / 40 * 6.4))
    page.mouse.up(); page.wait_for_timeout(900)
    strokes = J("import('./js/vault.js').then(async V => { const n = [...V.state.notes.values()].find(x => x.kind === 'ink'); return (await V.loadPage(n.pages[0].id)).strokes.length; })")
    print('strokes on pdf page', strokes); assert strokes == 1
    # laser: glows while drawing, gone a few seconds later, nothing saved
    if wide: page.locator('#iv-tools [data-tool=laser]').click()
    else: page.locator('#iv-tools [data-act=insert]').click(); page.locator('[data-ins=laser]').click()
    page.wait_for_timeout(200)
    assert 'fades away' in page.locator('#iv-props').inner_text()
    page.mouse.move(cx - 40, cy + 120); page.mouse.down()
    for i in range(1, 30): page.mouse.move(cx - 40 + 70 * math.cos(i / 30 * 6.4) - 70, cy + 120 + 35 * math.sin(i / 30 * 6.4)); page.wait_for_timeout(16)
    lit = J("(() => { const c = document.querySelector('canvas.ink-laser'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })()")
    page.screenshot(path=f'{OUT}/o-laser-{tag}.png')
    page.mouse.up(); page.wait_for_timeout(600)
    still = J("(() => { const c = document.querySelector('canvas.ink-laser'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })()")
    page.wait_for_timeout(2600)
    gone = J("(() => { const c = document.querySelector('canvas.ink-laser'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; })()")
    print('laser pixels drawing/just after/later', lit, still, gone); assert lit > 500 and still > 500 and gone == 0
    strokes = J("import('./js/vault.js').then(async V => { const n = [...V.state.notes.values()].find(x => x.kind === 'ink'); return (await V.loadPage(n.pages[0].id)).strokes.length; })")
    assert strokes == 1, 'laser is not saved'
    print('OK pdf and laser')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
