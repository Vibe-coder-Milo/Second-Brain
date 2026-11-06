"""Whiteboard extras: shapes, photo, frame-them, text size, keyboard, merge rules, sealed boards."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js: page.evaluate(js)
    page.goto(BASE + '#/note/new?kind=board'); page.wait_for_selector('.bd-stage'); page.wait_for_timeout(400)
    st = page.locator('#bd-stage').bounding_box()
    cx, cy = st['x'] + st['width'] / 2, st['y'] + st['height'] / 2
    # shape by dragging
    page.locator('[data-tool=shape]').click(); page.locator('#bd-opts [data-shape=ellipse]').click()
    page.mouse.move(cx - 260, cy - 120); page.mouse.down(); page.mouse.move(cx - 120, cy - 30, steps=6); page.mouse.up(); page.wait_for_timeout(200)
    sh = J("(() => { const V = window; return [...document.querySelectorAll('.bo-shape')].map(e => [e.offsetWidth, e.offsetHeight]) })()"); print('shape', sh); assert sh == [[140, 90]]
    # double-click the shape to label it
    b = page.locator('.bo-shape').bounding_box(); page.mouse.dblclick(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2); page.wait_for_timeout(150)
    page.keyboard.type('Outcome'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    assert page.locator('.bo-shape').inner_text().strip() == 'Outcome'
    # photo through the file input
    page.set_input_files('#bd-file', 'scanphoto.jpg'); page.wait_for_selector('.bo-image img[src]', timeout=10000); page.wait_for_timeout(300)
    # double-click empty board: a sticky
    page.mouse.dblclick(cx + 200, cy + 150); page.wait_for_selector('.bo-sticky .bt[contenteditable]'); page.keyboard.type('Two'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    # marquee everything, frame them
    page.mouse.move(st['x'] + 90, st['y'] + 80); page.mouse.down(); page.mouse.move(st['x'] + st['width'] - 20, st['y'] + st['height'] - 20, steps=10); page.mouse.up(); page.wait_for_timeout(200)
    n = J("document.querySelectorAll('.bo.sel').length"); print('marquee selected', n); assert n == 3
    page.locator('#bd-selbar [data-sb=wrap]').click(); page.wait_for_timeout(200); page.keyboard.type('Mentor session'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    assert page.locator('.bf-title').inner_text().strip() == 'Mentor session'
    # keyboard: Tab selects the next thing, arrows nudge, Delete removes, undo restores
    page.keyboard.press('Escape')
    page.locator('.bo-shape').focus(); page.wait_for_timeout(100)
    assert page.locator('.bo-shape.sel').count() == 1
    x0 = page.locator('.bo-shape').bounding_box()['x']
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(150)
    page.locator('.bo-shape').focus()
    x1 = page.locator('.bo-shape').bounding_box()['x']; print('nudged', x1 - x0); assert x1 - x0 > 10
    page.keyboard.press('Delete'); page.wait_for_timeout(150); assert page.locator('.bo-shape').count() == 0
    page.keyboard.press('Control+z'); page.wait_for_timeout(150); assert page.locator('.bo-shape').count() == 1
    # text tool sizes
    page.locator('[data-tool=text]').click(); page.locator('#bd-opts [data-tsize=xl]').click(); page.mouse.click(cx - 200, cy + 200)
    page.wait_for_selector('.bo-text .bt[contenteditable]'); page.keyboard.type('Big'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    fs = J("getComputedStyle(document.querySelector('.bo-text')).fontSize"); print('text size', fs); assert fs == '56px'
    # an empty text box disappears
    page.locator('[data-tool=text]').click(); page.mouse.click(cx + 100, cy - 200); page.wait_for_selector('.bo-text .bt[contenteditable]'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    assert page.locator('.bo-text').count() == 1
    page.locator('[data-act=zoom-fit]').click(); page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/bd-extras.png')
    # merge rules: a delete on one device and a move on another both survive
    r = J("""import('./js/sync.js').then(S => {
      const base = { v: 1, strokes: [{ id: 'k1', pts: [0,0,0.5] }], objects: [{ id: 'a', type: 'sticky', x: 0, y: 0, t: 1 }, { id: 'b', type: 'card', x: 0, y: 0, t: 1 }], tomb: [] };
      const one = { ...base, objects: [{ ...base.objects[0], del: true, t: 5 }, base.objects[1]] };
      const two = { ...base, objects: [base.objects[0], { ...base.objects[1], x: 99, t: 6 }], strokes: [], tomb: ['k1'] };
      const m = S.mergePageData(one, two);
      return { a: m.objects.find(o => o.id === 'a').del, bx: m.objects.find(o => o.id === 'b').x, strokes: m.strokes.length };
    })"""); print('merge', r); assert r == {'a': True, 'bx': 99, 'strokes': 0}
    # board summary feeds search
    nid = J("location.hash.match(/note[=\\/]([^?&]+)/)[1]")
    page.wait_for_timeout(1000)
    found = J("""import('./js/model.js').then(M => import('./js/vault.js').then(V => M.searchNotes([...V.state.notes.values()], 'mentor session', 5).map(n => n.kind)))"""); print('search', found); assert 'board' in found
    print('OK board extras')
run(steps, vp=(1180, 820), mob=False)
