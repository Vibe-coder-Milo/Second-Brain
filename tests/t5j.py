"""Feedback round: Move tool, Insert menu, tables on handwritten pages, label button, tooltips, /label in typed notes."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 700
    tag = 'ipad' if wide else 'phone'
    page.goto(BASE + '#/note/new?kind=ink'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    nid = J("location.hash.match(/note\\/([^?&]+)/)[1]")
    data = lambda: J(f"import('./js/vault.js').then(async V => {{ const d = await V.loadPage(V.state.notes.get('{nid}').pages[0].id); return {{ strokes: d.strokes.map(s => [s.id, Math.round(s.pts[0]), Math.round(s.pts[1])]), objects: d.objects.map(o => [o.type, Math.round(o.x), Math.round(o.y), o.rows || 0, o.cols || 0, o.label || '']) }}; }})")
    page.screenshot(path=f'{OUT}/tb-{tag}.png')
    # the tools row doesn't change when the tool changes
    widths = []
    for t in ['pen', 'lasso', 'move', 'eraser', 'text']:
        page.locator(f'[data-tool={t}]').click(); page.wait_for_timeout(120)
        widths.append(J("(() => { const r = document.querySelector('#iv-tools').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)]; })()"))
        if page.locator('.popover').count(): page.keyboard.press('Escape')
    print('tools row', widths); assert len(set(map(tuple, widths))) == 1, 'tools row moved'
    page.locator('[data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    assert 'Fountain' in page.locator('.pen-chip').inner_text()
    # write something in the middle of the page
    pg = page.locator('.ink-page').bounding_box(); sc = pg['width'] / 1000
    def scribble(x, y, w=150):
        page.mouse.move(pg['x'] + x * sc, pg['y'] + y * sc); page.mouse.down()
        for i in range(1, 12): page.mouse.move(pg['x'] + (x + i * w / 11) * sc, pg['y'] + (y + (8 if i % 2 else -8)) * sc)
        page.mouse.up(); page.wait_for_timeout(150)
    # insert a table
    page.locator('[data-act=insert]').click(); page.wait_for_selector('[data-ins=table]')
    page.screenshot(path=f'{OUT}/insert-{tag}.png')
    page.locator('[data-ins=table]').click(); page.wait_for_selector('#tb-r')
    page.locator('[data-r="1"]').click(); page.locator('[data-c="-1"]').click()
    page.locator('[data-go]').click(); page.wait_for_timeout(500)
    assert page.locator('[data-tool=move][aria-pressed=true]').count() == 1, 'switches to Move after adding'
    page.wait_for_timeout(900)
    d = data(); tbl = [o for o in d['objects'] if o[0] == 'table'][0]; print('table', tbl); assert tbl[3:5] == [4, 2]
    # write inside the table with the pen
    page.locator('[data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    scribble(tbl[1] + 30, tbl[2] + 100)
    page.wait_for_timeout(900)
    stroke_y = data()['strokes'][-1][2]
    # move tool: drag the table; the writing goes with it
    page.locator('[data-tool=move]').click(); page.wait_for_timeout(100)
    sx, sy = pg['x'] + (tbl[1] + 300) * sc, pg['y'] + (tbl[2] + 30) * sc
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(sx + 40, sy + 60, steps=6); page.mouse.move(sx + 60, sy + 120, steps=6); page.mouse.up(); page.wait_for_timeout(900)
    d2 = data(); tbl2 = [o for o in d2['objects'] if o[0] == 'table'][0]; print('table moved to', tbl2, 'stroke', d2['strokes'][-1])
    d_before = data_before if 'data_before' in dir() else None
    assert tbl2[2] - tbl[2] > 60, 'table did not move'
    assert d2['strokes'][-1][2] - stroke_y > 60, 'writing in the table did not move with it'
    # rows and columns from the selection bar
    page.mouse.click(sx + 60, sy + 120); page.wait_for_timeout(300)
    page.locator('.sel-bar [data-sel=table]').click(); page.wait_for_selector('#tb-r')
    page.locator('[data-c="1"]').click(); page.wait_for_timeout(200); page.keyboard.press('Escape'); page.wait_for_timeout(900)
    tbl3 = [o for o in data()['objects'] if o[0] == 'table'][0]; print('table now', tbl3); assert tbl3[4] == 3
    page.screenshot(path=f'{OUT}/table-{tag}.png')
    # label button places a label; the sticker drawer has no labels tab
    page.locator('[data-act=label]').click(); page.wait_for_selector('.popover [data-l]'); page.locator('.popover [data-l]').first.click(); page.wait_for_timeout(600)
    labs = [o for o in data()['objects'] if o[0] == 'label']; print('labels', labs); assert labs
    # move the label by dragging it
    lab = labs[0]; lx, ly = pg['x'] + (lab[1] + 30) * sc, pg['y'] + (lab[2] + 15) * sc
    page.mouse.move(lx, ly); page.mouse.down(); page.mouse.move(lx - 80, ly - 200, steps=8); page.mouse.up(); page.wait_for_timeout(900)
    lab2 = [o for o in data()['objects'] if o[0] == 'label'][0]; print('label moved', lab, '->', lab2); assert lab2[2] < lab[2] - 100
    page.locator('[data-act=insert]').click(); page.locator('[data-ins=sticker]').click(); page.wait_for_selector('#sd-tabs')
    tabs = page.locator('#sd-tabs [data-t]').all_inner_texts(); print('sticker tabs', tabs); assert 'Labels' not in tabs
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    # long press shows a button's name
    b = page.locator('[data-tool=eraser]').bounding_box()
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': b['x'] + 20, 'y': b['y'] + 20}]}); page.wait_for_timeout(650)
    tip = J("document.querySelector('.tip')?.textContent"); print('tooltip', tip)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); page.wait_for_timeout(200)
    assert tip == 'Eraser'
    assert page.locator('[data-tool=eraser][aria-pressed=true]').count() == 0, 'long press should not pick the tool'
    # typed note: /label adds a label chip, not a callout
    page.goto(BASE + '#/note/new'); page.wait_for_timeout(800)
    page.keyboard.type('Weekly review'); page.keyboard.press('Enter'); page.keyboard.type('Good momentum. ')
    page.keyboard.type('/label'); page.wait_for_timeout(400)
    first = page.locator('.style-menu [data-style]').first.inner_text(); print('first match for /label:', first)
    page.keyboard.press('Enter'); page.wait_for_selector('.popover [data-l]'); page.locator('.popover [data-l]').first.click(); page.wait_for_timeout(400)
    assert page.locator('.ProseMirror .callout, .ProseMirror [data-callout]').count() == 0 and page.locator('.ProseMirror [data-label], .ProseMirror .label-chip').count() >= 1
    page.locator('[data-act=insert]').first.click(); page.wait_for_selector('[data-ins=table]'); page.locator('[data-ins=table]').click(); page.wait_for_timeout(300)
    assert page.locator('.ProseMirror table').count() == 1
    page.screenshot(path=f'{OUT}/typed-insert-{tag}.png')
    print('OK feedback round')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
