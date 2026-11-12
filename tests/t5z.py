"""Zoom follows the fingers. A two-finger pinch on a handwritten note grows
the page around the fingers (the spot between them stays between them, and
follows them if they move), can go well past 3x (up to 6x), and a scroll
wheel with ctrl zooms around the pointer. In the continuous view and one page
at a time. A "150%" label shows while zooming; tapping it fits the page again."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    cdp = page.context.new_cdp_session(page)
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Pinch check', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({}), M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    base_w = J("document.querySelector('.ink-page').getBoundingClientRect().width")

    # Where a screen point falls on the live page, as fractions of the page.
    def frac(x, y):
        return J("""([x, y]) => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [(x - r.left) / r.width, (y - r.top) / r.height, r.width]; }""", [x, y])
    def box():
        return J("(() => { const r = document.querySelector('.ink-scroll').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")

    def pinch(cx, cy, d0, d1, dx=0, dy=0, steps=12):
        pts = lambda d, ox, oy: [{'x': cx + ox - d / 2, 'y': cy + oy, 'id': 1}, {'x': cx + ox + d / 2, 'y': cy + oy, 'id': 2}]
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(d0, 0, 0)})
        for i in range(1, steps + 1):
            t = i / steps
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d0 + (d1 - d0) * t, dx * t, dy * t)})
            page.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        page.wait_for_timeout(400)

    def check(view):
        b = box()
        # 1. Pinch out around a spot left of the middle, moving the fingers a little.
        cx, cy = b[0] + b[2] * 0.3, b[1] + min(b[3] * 0.35, 260)
        f0 = frac(cx, cy)
        pinch(cx, cy, 80, 240, dx=30, dy=20)
        f1 = frac(cx + 30, cy + 20)
        print(view, 'pinch 3x: before', [round(v, 3) for v in f0[:2]], 'after', [round(v, 3) for v in f1[:2]], 'width', round(f0[2]), '->', round(f1[2]))
        assert 2.6 < f1[2] / f0[2] < 3.4, 'pinched to about 3x'
        assert abs(f1[0] - f0[0]) * f1[2] < 12 and abs(f1[1] - f0[1]) * f1[2] < 12, 'the spot between the fingers stays between them'
        pill = J("document.querySelector('.zoom-pill')?.textContent")
        print(view, 'zoom label:', pill); assert pill and pill.endswith('%')
        # 2. Further: past the old 3x limit, up to 6x.
        cx2, cy2 = b[0] + b[2] * 0.6, b[1] + b[3] * 0.5
        g0 = frac(cx2, cy2)
        pinch(cx2, cy2, 100, 300)
        g1 = frac(cx2, cy2)
        print(view, 'pinch further: width', round(g1[2]), 'zoom', round(g1[2] / base_w, 2))
        assert g1[2] / base_w > 5.5, 'zooms in up to 6x'
        assert abs(g1[0] - g0[0]) * g1[2] < 12 and abs(g1[1] - g0[1]) * g1[2] < 12, 'still around the fingers'
        page.screenshot(path=f'{OUT}/z-{view}-6x-{tag}.png')
        # 3. Tap the label: back to the page fitted to the screen.
        J("document.querySelector('.zoom-pill').classList.add('on')")
        page.locator('.zoom-pill').click(); page.wait_for_timeout(400)
        w = J("document.querySelector('.ink-page').getBoundingClientRect().width")
        print(view, 'after tapping the label: width', round(w)); assert abs(w - base_w) < 2
        # 4. Ctrl + scroll wheel zooms around the pointer.
        mx, my = b[0] + b[2] * 0.25, b[1] + b[3] * 0.4
        h0 = frac(mx, my)
        page.mouse.move(mx, my)
        for _ in range(5):
            page.keyboard.down('Control'); page.mouse.wheel(0, -100); page.keyboard.up('Control'); page.wait_for_timeout(60)
        page.wait_for_timeout(300)
        h1 = frac(mx, my)
        print(view, 'wheel: width', round(h0[2]), '->', round(h1[2]), 'spot', [round(v, 3) for v in h0[:2]], [round(v, 3) for v in h1[:2]])
        assert h1[2] / h0[2] > 1.4, 'wheel zooms in'
        assert abs(h1[0] - h0[0]) * h1[2] < 12 and abs(h1[1] - h0[1]) * h1[2] < 12, 'around the pointer'
        J("document.querySelector('.zoom-pill').click()"); page.wait_for_timeout(400)

    assert J("!!document.querySelector('.ink-stack')"), 'opens in the continuous view'
    check('continuous')
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-how=next]'); page.locator('[data-how=next]').click(); page.wait_for_timeout(700)
    if page.locator('.sheet').count(): page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('single')
    # Writing still works after zooming: a stroke lands where it's drawn.
    b = box(); cx, cy = b[0] + b[2] * 0.5, b[1] + b[3] * 0.4
    pinch(cx, cy, 100, 200)
    page.locator('#iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    f = frac(cx, cy)
    page.mouse.move(cx, cy); page.mouse.down()
    for i in range(1, 10): page.mouse.move(cx + i * 3, cy)
    page.mouse.up(); page.wait_for_timeout(900)
    xs = J(f"""import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); for (const pg of n.pages) {{ const d = await V.loadPage(pg.id); if (d.strokes.length) return d.strokes[0].pts.slice(0, 2); }} return null; }})""")
    print('stroke starts at', xs, 'expected about', [round(f[0] * 1000), '...'])
    assert xs and abs(xs[0] - f[0] * 1000) < 6, 'writing after a pinch lands under the pen'
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
