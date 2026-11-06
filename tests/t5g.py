"""Writing layers and the writing window (zoom strip) on a handwritten note."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js: page.evaluate(js)
    wide = page.viewport_size['width'] >= 900
    def act(a):
        b = page.locator(f'#iv-tools [data-act={a}]')
        if b.count() and b.is_visible(): b.click()
        else: page.locator('#iv-tools [data-act=insert]').click(); page.locator(f'[data-ins={a}]').click()
    page.goto(BASE + '#/note/new?kind=ink'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    nid = J("location.hash.match(/note\\/([^?&]+)/)[1]")
    pg = page.locator('.ink-page').bounding_box()
    def scribble(x, y, w=120):
        page.mouse.move(x, y); page.mouse.down()
        for i in range(1, 16): page.mouse.move(x + i * w / 15, y + (6 if i % 2 else -6))
        page.mouse.up(); page.wait_for_timeout(150)
    def pixel(x, y):
        return J(f"""(() => {{ const c = document.querySelector('canvas.ink-main'); const r = c.getBoundingClientRect(); const k = c.width / r.width;
          const d = c.getContext('2d').getImageData(Math.round(({x} - r.left) * k) - 6, Math.round(({y} - r.top) * k) - 6, 12, 12).data; let a = 0; for (let i = 3; i < d.length; i += 4) a = Math.max(a, d[i]); return a; }})()""")
    if page.locator('[data-tool=pen][aria-pressed=true]').count() == 0: page.locator('[data-tool=pen]').click()
    x0, y0 = pg['x'] + pg['width'] * 0.2, pg['y'] + 220
    scribble(x0, y0)
    assert pixel(x0 + 60, y0) > 0
    # Layers popover
    act('layers'); page.wait_for_selector('.lay-list')
    rows = page.locator('.lay-list li').all_inner_texts(); print('layers', [r.replace('\n', ' ') for r in rows])
    assert 'Writing here' in rows[0] and 'Highlights' in rows[1] and 'Paper' in rows[2]
    page.locator('[data-ladd]').click(); page.wait_for_selector('.sheet input'); page.locator('.sheet input').fill('Review notes'); page.keyboard.press('Enter'); page.wait_for_timeout(400)
    x1, y1 = pg['x'] + pg['width'] * 0.2, pg['y'] + 320
    scribble(x1, y1)
    ls = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); const d = await V.loadPage(n.pages[0].id); return [n.layers.map(l => l.name), d.strokes.map(s => s.l || '')]; }})")
    page.wait_for_timeout(900)
    ls = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); const d = await V.loadPage(n.pages[0].id); return [n.layers.map(l => l.name), d.strokes.map(s => s.l || '')]; }})"); print('saved', ls)
    assert ls[0] == ['Ink', 'Highlights', 'Review notes', 'Paper'] and ls[1][0] == '' and ls[1][1].startswith('L')
    # hide Review notes: its writing disappears, Ink stays
    act('layers'); page.wait_for_selector('.lay-list')
    page.locator('.lay-list li', has_text='Review notes').locator('[data-leye]').click(); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/layers-pop-{int(wide)}.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    print('pixels ink/review', pixel(x0 + 60, y0), pixel(x1 + 60, y1))
    assert pixel(x0 + 60, y0) > 0 and pixel(x1 + 60, y1) == 0
    # writing on a hidden layer is blocked
    scribble(x1, y1 + 60)
    print('toast', J("document.getElementById('toast').textContent")); assert 'hidden' in J("document.getElementById('toast').textContent")
    # write on Ink again; lock Ink; the eraser leaves it alone
    act('layers'); page.locator('[data-lpick=ink]').click(); page.wait_for_timeout(200); page.keyboard.press('Escape')
    act('layers'); page.locator('[data-lmore=ink]').click(); page.wait_for_selector('.sheet'); page.locator('.sheet button', has_text='Lock').click(); page.wait_for_timeout(300)
    page.locator('[data-tool=eraser]').click(); scribble(x0, y0); page.wait_for_timeout(300)
    assert pixel(x0 + 60, y0) > 0, 'locked ink was erased'
    act('layers'); page.locator('[data-lmore=ink]').click(); page.wait_for_selector('.sheet'); page.locator('.sheet button', has_text='Unlock').click(); page.wait_for_timeout(300)
    # export skips the hidden layer
    exp = J(f"""import('./js/export.js').then(async E => {{ const V = await import('./js/vault.js'); const [c] = await E.noteCanvases(V.state.notes.get('{nid}')); return c.width; }})"""); print('export width', exp)
    # writing window
    if page.locator('[data-tool=pen][aria-pressed=true]').count() == 0: page.locator('[data-tool=pen]').click()
    act('zoomstrip'); page.wait_for_selector('.zs-pad canvas'); page.wait_for_timeout(400)
    box0 = J("(() => { const b = document.querySelector('.zbox').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()"); print('zbox', box0)
    zc = page.locator('.zs-pad canvas').bounding_box()
    n0 = J(f"import('./js/vault.js').then(async V => (await V.loadPage(V.state.notes.get('{nid}').pages[0].id)).strokes.length)")
    # big letter in the middle of the strip
    sx, sy = zc['x'] + zc['width'] * 0.2, zc['y'] + zc['height'] * 0.3
    page.mouse.move(sx, sy); page.mouse.down()
    for i in range(1, 20): page.mouse.move(sx + i * 8, sy + (40 if i % 2 else 0))
    page.mouse.up(); page.wait_for_timeout(300)
    # a stroke lifted in the shaded end moves the box on
    ex = zc['x'] + zc['width'] * 0.8; page.mouse.move(ex, sy); page.mouse.down()
    for i in range(1, 10): page.mouse.move(ex + i * 8, sy + 30)
    page.mouse.up(); page.wait_for_timeout(400)
    box1 = J("(() => { const b = document.querySelector('.zbox').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()"); print('zbox after', box1)
    assert box1[0] > box0[0] + 20, 'box did not move on'
    page.wait_for_timeout(900)
    st = J(f"""import('./js/vault.js').then(async V => {{ const d = await V.loadPage(V.state.notes.get('{nid}').pages[0].id); return d.strokes.slice(-2).map(s => {{ const xs = s.pts.filter((_, i) => i % 3 === 0), ys = s.pts.filter((_, i) => i % 3 === 1); return [Math.round(Math.min(...xs)), Math.round(Math.max(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...ys))]; }}); }})"""); print('strip strokes (page units)', st)
    assert len(st) == 2 and (st[0][3] - st[0][2]) < 40, 'strip stroke should land small'
    page.screenshot(path=f'{OUT}/zoomstrip-{int(wide)}.png')
    page.locator('[data-z=nl]').click(); page.wait_for_timeout(300)
    box2 = J("(() => { const b = document.querySelector('.zbox').getBoundingClientRect(); return [b.x, b.y]; })()"); assert box2[1] > box1[1] + 10
    page.locator('[data-z=close]').click(); page.wait_for_timeout(200); assert page.locator('.zbox').count() == 0
    # layers survive a reload
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(300); page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    pg = page.locator('.ink-page').bounding_box()
    print('after reload ink/review', pixel(x0 + 60, y0), pixel(x1 + 60, y1))
    assert pixel(x1 + 60, y1) == 0
    print('OK layers and zoom')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
