"""Whiteboard with fingers on a phone: pan, pinch, tap to select, drag, open a card, pen."""
from dbg import *
def steps(page):
    J = lambda js: page.evaluate(js)
    J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      for (const t of ['Alpha plan', 'Beta notes']) await V.saveNote(M.newNote({ title: t, titleAuto: false, region: 'career', inbox: false, body: 'About ' + t })); }""")
    page.goto(BASE + '#/note/new?kind=board'); page.wait_for_selector('.bd-stage'); page.wait_for_timeout(400)
    for t in ['Alpha', 'Beta']:
        page.locator('[data-tool=card]').click(); page.wait_for_selector('#np-q'); page.fill('#np-q', t); page.wait_for_timeout(150)
        page.locator('#np-list [data-id]').first.click(); page.wait_for_timeout(300)
    cdp = page.context.new_cdp_session(page)
    def touch(kind, pts):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    view = lambda: J("document.querySelector('#bd-world').style.transform")
    # 1. one finger on empty board pans
    v0 = view()
    touch('touchStart', [(200, 760)])
    for i in range(1, 9): touch('touchMove', [(200 - i * 10, 760 - i * 8)]); page.wait_for_timeout(16)
    touch('touchEnd', []); page.wait_for_timeout(200)
    v1 = view(); print('pan', v0, '->', v1); assert v0 != v1
    # 2. pinch to zoom in
    z0 = J("parseFloat(getComputedStyle(document.querySelector('#bd-world')).getPropertyValue('--z'))")
    touch('touchStart', [(150, 500), (240, 500)])
    for i in range(1, 9): touch('touchMove', [(150 - i * 8, 500), (240 + i * 8, 500)]); page.wait_for_timeout(16)
    touch('touchEnd', []); page.wait_for_timeout(200)
    z1 = J("parseFloat(getComputedStyle(document.querySelector('#bd-world')).getPropertyValue('--z'))"); print('pinch zoom', z0, '->', z1); assert z1 > z0 * 1.3
    page.locator('[data-act=zoom-fit]').click(); page.wait_for_timeout(400)
    # 3. tap a card: selected, bar shows Open note
    c = page.locator('.bo-card', has_text='Alpha').bounding_box()
    page.touchscreen.tap(c['x'] + c['width'] / 2, c['y'] + 12); page.wait_for_timeout(250)
    assert page.locator('.bo-card.sel', has_text='Alpha').count() == 1 and page.locator('#bd-selbar [data-sb=open]').is_visible()
    page.screenshot(path='shots5/bd-phone-sel.png')
    # 4. drag the card with a finger
    x, y = c['x'] + c['width'] / 2, c['y'] + 12
    touch('touchStart', [(x, y)])
    for i in range(1, 11): touch('touchMove', [(x, y + i * 12)]); page.wait_for_timeout(16)
    touch('touchEnd', []); page.wait_for_timeout(250)
    c2 = page.locator('.bo-card', has_text='Alpha').bounding_box(); print('card moved', c2['y'] - c['y']); assert c2['y'] - c['y'] > 60
    # 5. sticky with a finger tap, then type
    page.locator('[data-tool=sticky]').click(); page.touchscreen.tap(200, 300); page.wait_for_selector('.bo-sticky .bt[contenteditable]')
    page.keyboard.type('Idea from my phone'); page.locator('.bd-name').click(); page.wait_for_timeout(300)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    assert 'Idea from my phone' in page.locator('.bo-sticky').inner_text()
    # 6. pen with a finger (no Pencil seen yet): draws
    page.locator('[data-tool=pen]').click()
    touch('touchStart', [(80, 640)])
    for i in range(1, 15): touch('touchMove', [(80 + i * 12, 640 + (8 if i % 2 else -8))]); page.wait_for_timeout(16)
    touch('touchEnd', []); page.wait_for_timeout(250)
    n = J("document.querySelectorAll('#bd-strokes [data-sid]').length"); print('strokes', n); assert n == 1
    page.locator('[data-tool=select]').click()
    # 7. open the card's note and come back
    c = page.locator('.bo-card', has_text='Alpha').bounding_box()
    page.touchscreen.tap(c['x'] + c['width'] / 2, c['y'] + 12); page.wait_for_timeout(250)
    page.locator('#bd-selbar [data-sb=open]').click(); page.wait_for_timeout(600)
    print('opened', J("location.hash"), page.locator('h1, .note-title, #n-title').first.inner_text()[:40])
    page.go_back(); page.wait_for_selector('.bo-card'); page.wait_for_timeout(400)
    assert page.locator('.bo-card').count() == 2 and page.locator('.bo-sticky').count() == 1
    page.screenshot(path='shots5/bd-phone-back.png')
    print('OK touch whiteboard')
run(steps)
