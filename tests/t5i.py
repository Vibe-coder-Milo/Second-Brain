"""Pen settings (pressure, smoothing, saved pens) and endless scroll with the windowed canvas."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    page.goto(BASE + '#/note/new?kind=ink'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    nid = J("location.hash.match(/note\\/([^?&]+)/)[1]")
    strokes = lambda: J(f"import('./js/vault.js').then(async V => (await V.loadPage(V.state.notes.get('{nid}').pages[0].id)).strokes.map(s => [s.pen, s.np || 0, s.sm ?? 2, s.c]))")
    def scribble(x, y, w=120):
        page.mouse.move(x, y); page.mouse.down()
        for i in range(1, 16): page.mouse.move(x + i * w / 15, y + (8 if i % 2 else -8))
        page.mouse.up(); page.wait_for_timeout(200)
    # pen panel
    page.locator('[data-tool=pen]').click(); page.wait_for_selector('.pen-cards')
    assert page.locator('.pen-cards [data-pen]').count() == 6 and page.locator('.seg [data-sm]').count() == 4 and page.locator('#pp-pr').is_checked()
    page.locator('.pen-cards [data-pen=brush]').click(); page.wait_for_selector('.pen-cards [data-pen=brush][aria-checked=true]')
    page.locator('#pp-pr').uncheck(); page.locator('.seg [data-sm="3"]').click()
    page.locator('.colour-grid [aria-label="Brick"]').click()
    page.screenshot(path=f'{OUT}/penpanel-{int(wide)}.png')
    page.locator('[data-savepen]').click(); page.wait_for_timeout(300)
    assert page.locator('.pp-saved [data-usepen]').count() == 1
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    pg = page.locator('.ink-page').bounding_box()
    scribble(pg['x'] + 150, pg['y'] + 220)
    page.wait_for_timeout(900)
    st = strokes(); print('strokes', st); assert st[-1] == ['brush', 1, 3, '#B0413E']
    if wide:
        assert page.locator('#iv-props .pen-fav').count() == 1
        page.locator('[data-tool=pen]').click(); page.wait_for_selector('.pen-cards'); page.locator('.pen-cards [data-pen=ballpoint]').click(); page.wait_for_timeout(200); page.keyboard.press('Escape')
        page.locator('#iv-props .pen-fav').click(); page.wait_for_timeout(200)
        scribble(pg['x'] + 150, pg['y'] + 300); page.wait_for_timeout(900)
        st = strokes(); print('after using saved pen', st[-1]); assert st[-1] == ['brush', 1, 3, '#B0413E']
    # endless scroll
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-how=endless]'); page.locator('[data-how=endless]').click(); page.wait_for_timeout(500)
    assert J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').layout)") == 'scroll'
    h0 = J("document.querySelector('.ink-page').offsetHeight")
    J("(() => { const s = document.querySelector('.ink-scroll'); s.scrollTop = s.scrollHeight; })()"); page.wait_for_timeout(400)
    pg = page.locator('.ink-page').bounding_box()
    sc = pg['width'] / 1000
    y_page = 1300
    yy = pg['y'] + y_page * sc
    print('page box', pg, 'stroke at screen y', yy)
    scribble(pg['x'] + 200 * sc, yy, 120 * sc)
    page.wait_for_timeout(1200)
    h1 = J("document.querySelector('.ink-page').offsetHeight"); ph = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').pages[0].h)")
    print('page grew', h0, '->', h1, 'units', ph); assert ph >= 2200 and h1 > h0 * 1.4
    # the canvas only covers part of the long page, and what's on screen is drawn
    cv = J("(() => { const c = document.querySelector('canvas.ink-main'); return [c.offsetTop, c.offsetHeight, document.querySelector('.ink-page').offsetHeight]; })()"); print('canvas window', cv)
    assert cv[1] < cv[2] or cv[2] < 2 * page.viewport_size['height']
    J("(() => { const s = document.querySelector('.ink-scroll'); s.scrollTop = 0; })()"); page.wait_for_timeout(300)
    J("(y) => { const s = document.querySelector('.ink-scroll'); const p = document.querySelector('.ink-page'); s.scrollTop = p.offsetTop + y * p.offsetWidth / 1000 - 300; }", y_page); page.wait_for_timeout(300)
    pg = page.locator('.ink-page').bounding_box(); sc = pg['width'] / 1000
    px = J("""([x, y]) => { const c = document.querySelector('canvas.ink-main'); const r = c.getBoundingClientRect(); const k = c.width / r.width;
      const d = c.getContext('2d').getImageData(Math.round((x - r.left) * k) - 8, Math.round((y - r.top) * k) - 8, 16, 16).data; let a = 0; for (let i = 3; i < d.length; i += 4) a = Math.max(a, d[i]); return a; }""", [pg['x'] + 260 * sc, pg['y'] + y_page * sc])
    print('ink at the bottom after scrolling away and back', px, J("(() => { const c = document.querySelector('canvas.ink-main'); const r = c.getBoundingClientRect(); return [r.top, r.height, c.offsetTop, document.querySelector('.ink-scroll').scrollTop]; })()"), pg['y'] + y_page * sc, J(f"import('./js/vault.js').then(async V => (await V.loadPage(V.state.notes.get('{nid}').pages[0].id)).strokes.map(s => Math.round(s.pts[1])))"))
    assert px > 0
    page.screenshot(path=f'{OUT}/endless-{int(wide)}.png')
    # zoomed in, canvases stay within the window
    for _ in range(4):
        if page.locator('[data-act=zoom-in]').is_visible(): page.locator('[data-act=zoom-in]').click(); page.wait_for_timeout(150)
    page.wait_for_timeout(400)
    cw = J("(() => { const c = document.querySelector('canvas.ink-main'); return [c.width, c.height, document.querySelector('.ink-page').offsetWidth, window.devicePixelRatio]; })()"); print('zoomed canvas px', cw)
    assert cw[0] * cw[1] <= 8_100_000
    # PDF export prints the long page as A4 pieces
    n = J(f"import('./js/export.js').then(async E => {{ const V = await import('./js/vault.js'); const cs = await E.noteCanvases(V.state.notes.get('{nid}')); return cs.map(c => [c.width, c.height]); }})"); print('pdf pages', n)
    assert len(n) >= 2 and all(abs(h / w - 1.414) < 0.02 for w, h in n[:-1])
    print('OK pens and endless')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
