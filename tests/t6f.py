"""Sharp top bar on iPad: iPadOS 26 blurs the top of a Home Screen app unless
a solid, full-width bar sits on the top edge. The app keeps an invisible one
there (.edge-guard): fixed, full width, 12 px tall, above everything, painting
nothing and letting every tap through (the back button still works)."""
from dbg import *
import sys
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const b = await V.saveNotebook(M.newNotebook({ title: 'Tengah Garden Residences', region: 'ideas' }));
      const a = await V.saveNote(M.newNote({ kind: 'ink', title: 'Note 12 Apr 2026', titleAuto: false, region: 'ideas', inbox: false, notebook: b.id, section: b.sections[0].id, pages: [M.newPage({})] }));
      return { nb: b.id, a: a.id }; })()""")
    wide = page.viewport_size['width'] >= 900
    for h in ['#/today', '#/settings', f"#/note/{ids['a']}", f"#/notebook/{ids['nb']}" + (f"?note={ids['a']}" if wide else '')]:
        page.goto(BASE + h); page.wait_for_timeout(900)
        g = J("""(() => { const e = document.querySelector('.edge-guard'); if (!e) return null; const c = getComputedStyle(e); const r = e.getBoundingClientRect();
          const top = Math.max(...[...document.querySelectorAll('body *')].map(x => +getComputedStyle(x).zIndex || 0));
          return { pos: c.position, top: r.top, w: r.width / innerWidth, h: r.height, pe: c.pointerEvents, clip: c.backgroundClip || c.webkitBackgroundClip, z: +c.zIndex, topZ: top,
            bg: c.backgroundColor, hit: document.elementFromPoint(innerWidth / 2, 4) !== e }; })()""")
        print(h.split('?')[0][:12], g)
        assert g and g['pos'] == 'fixed' and g['top'] == 0 and g['w'] >= 0.99 and g['h'] > 10, 'a full-width bar on the top edge'
        assert g['z'] >= g['topZ'], 'above everything'
        assert g['bg'] not in ('rgba(0, 0, 0, 0)', 'transparent') and g['clip'] == 'text', 'counts as solid, paints nothing'
        assert g['pe'] == 'none' and g['hit'], 'taps go through'
        # Paints nothing: the top strip looks the same with the bar removed.
        a = page.screenshot(clip={'x': 0, 'y': 0, 'width': page.viewport_size['width'], 'height': 12})
        J("document.querySelector('.edge-guard').style.display = 'none'")
        b = page.screenshot(clip={'x': 0, 'y': 0, 'width': page.viewport_size['width'], 'height': 12})
        J("document.querySelector('.edge-guard').style.display = ''")
        assert a == b, 'the bar is invisible'
    # The back button right under it still works.
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    page.goto(BASE + f"#/note/{ids['a']}"); page.wait_for_selector('.ink-top .back'); page.wait_for_timeout(500)
    page.locator('.ink-top .back').tap(); page.wait_for_timeout(800)
    print('after back:', page.url.split('#')[1]); assert f"#/note/{ids['a']}" not in page.url
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
