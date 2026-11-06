"""Zoomed in on a handwritten note, every part of the page can be reached:
zoom to 2x, then scroll (and drag with the Move tool) to the far left and far
right edges of the page, in the continuous view and one page at a time. The
drawn window follows, and writing at the left edge lands there."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Zoom check', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({}), M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)

    def zoom_to_2():
        # Ctrl + scroll wheel, as on a computer (pinch on the iPad ends in the same zoom).
        J("""(() => { const sc = document.querySelector('.ink-scroll'); for (let i = 0; i < 8; i++) sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })); })()""")
        page.wait_for_timeout(500)

    # Where the page is, against the visible part of the scroller, and the drawn window.
    geo = lambda: J("""(() => { const sc = document.querySelector('.ink-scroll'); const pg = document.querySelector('.ink-page'); const r = sc.getBoundingClientRect(); const p = pg.getBoundingClientRect();
      const c = pg.querySelector('canvas.ink-main');
      return { left: Math.round(p.left - r.left), right: Math.round(r.left + sc.clientWidth - p.right), pageW: Math.round(p.width), viewW: sc.clientWidth,
        sl: Math.round(sc.scrollLeft), maxSl: sc.scrollWidth - sc.clientWidth, cL: parseFloat(c.style.left), cR: parseFloat(c.style.left) + parseFloat(c.style.width) }; })()""")

    def check(view):
        g0 = geo(); print(view, 'before zoom:', g0)
        assert g0['maxSl'] <= 1 and g0['left'] >= 0 and g0['right'] >= 0, 'unzoomed page fits across'
        zoom_to_2()
        g = geo(); print(view, 'zoomed:', g)
        assert g['pageW'] > 1.8 * g0['pageW'], 'zoomed to about 2x'
        assert g['maxSl'] >= g['pageW'] - g['viewW'], 'the whole page width can be scrolled across'
        # Far left: the page's left edge shows, with the left margin, and has pixels.
        J("document.querySelector('.ink-scroll').scrollLeft = 0"); page.wait_for_timeout(300)
        g = geo(); print(view, 'far left:', g)
        assert 0 <= g['left'] <= 30, 'left edge of the page is on screen'
        assert g['cL'] <= 0.5, 'the drawn window reaches the left edge'
        page.screenshot(path=f'{OUT}/x-{view}-left-{tag}.png')
        # Far right: the page's right edge shows, and has pixels.
        J("(() => { const sc = document.querySelector('.ink-scroll'); sc.scrollLeft = sc.scrollWidth; })()"); page.wait_for_timeout(300)
        g = geo(); print(view, 'far right:', g)
        assert 0 <= g['right'] <= 30, 'right edge of the page is on screen'
        assert g['cR'] >= g['pageW'] - 1, 'the drawn window reaches the right edge'
        page.screenshot(path=f'{OUT}/x-{view}-right-{tag}.png')
        # Drag with the Move tool on empty paper: back to the far left.
        page.locator('#iv-tools [data-tool=move]').click(); page.wait_for_timeout(100)
        r = J("(() => { const r = document.querySelector('.ink-scroll').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        x0, y0 = r[0] + 40, r[1] + r[3] * 0.5
        page.mouse.move(x0, y0); page.mouse.down()
        for i in range(1, 21): page.mouse.move(x0 + i * (g['pageW'] / 20), y0)
        page.mouse.up(); page.wait_for_timeout(300)
        g = geo(); print(view, 'dragged right:', g)
        assert g['sl'] == 0 and 0 <= g['left'] <= 30, 'dragging reaches the left edge'
        # Write near the left edge: the stroke lands at the left of the page.
        page.locator('#iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
        if page.locator('.popover').count(): page.keyboard.press('Escape')
        p = J("(() => { const p = document.querySelector('.ink-page').getBoundingClientRect(); return [p.left, p.top]; })()")
        sc_top = r[1]
        x0, y0 = p[0] + 30, max(p[1], sc_top) + 120
        page.mouse.move(x0, y0); page.mouse.down()
        for i in range(1, 15): page.mouse.move(x0 + i * 4, y0 + (i % 4) * 3)
        page.mouse.up(); page.wait_for_timeout(1000)
        xs = J(f"""import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); for (const pg of n.pages) {{ const d = await V.loadPage(pg.id); if (d.strokes.length) return d.strokes[d.strokes.length - 1].pts.filter((_, i) => i % 3 === 0); }} return []; }})""")
        print(view, 'stroke x from', round(min(xs)), 'to', round(max(xs)), '(page is 1000 wide)')
        assert xs and min(xs) < 60 and max(xs) < 150, 'stroke written at the left edge lands at the left edge'
        # Back to the normal size for the next view.
        J("""(() => { const sc = document.querySelector('.ink-scroll'); for (let i = 0; i < 12; i++) sc.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true })); })()""")
        page.wait_for_timeout(500)

    assert J("!!document.querySelector('.ink-stack')"), 'opens in the continuous view'
    check('continuous')
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-view=single]'); page.locator('[data-view=single]').click(); page.wait_for_timeout(700)
    if page.locator('.sheet').count(): page.keyboard.press('Escape'); page.wait_for_timeout(300)
    assert not J("!!document.querySelector('.ink-stack')"), 'one page at a time'
    check('single')
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
