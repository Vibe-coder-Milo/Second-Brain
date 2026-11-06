"""Round 9: more notebook covers, grouped in collections."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(500)
    page.get_by_role('button', name='New notebook').first.click(); page.wait_for_selector('#nbs-covers .cover-pick')
    page.wait_for_timeout(400)
    total = page.locator('#nbs-covers .cover-pick').count()
    chips = page.locator('#nbs-groups .chip').all_inner_texts()
    print('covers in All:', total, '| collections:', chips)
    assert total >= 40 and chips[0] == 'All' and 'Singapore & Asia' in chips and chips[-1] == 'Your own'
    page.screenshot(path=f'{OUT}/s-picker-{tag}.png')
    page.locator('#nbs-groups [data-cg=asia]').click(); page.wait_for_timeout(200)
    asia = page.locator('#nbs-covers .cn').all_inner_texts()
    print('Singapore & Asia:', asia); assert 'Shophouses' in asia and 'HDB estate' in asia and 'Kraft' not in asia
    page.fill('#nbs-name', 'Property'); page.locator('[data-cover=shophouse]').click(); page.wait_for_timeout(200)
    prev = J("document.querySelector('#nbs-prev svg').innerHTML")
    assert 'cv-shophouse' in prev and 'Property' in prev
    page.screenshot(path=f'{OUT}/s-asia-{tag}.png')
    page.locator('#nbs-groups [data-cg=own]').click(); page.wait_for_timeout(200)
    own = page.locator('#nbs-covers .cn').all_inner_texts(); print('Your own:', own); assert len(own) == 2
    page.get_by_role('button', name='Make notebook').click() if page.get_by_role('button', name='Make notebook').count() else page.locator('.sheet [type=submit]').first.click()
    page.wait_for_timeout(800)
    style = J("import('./js/vault.js').then(V => [...V.state.notebooks.values()].map(b => b.cover.style))")
    print('saved cover', style); assert 'shophouse' in style
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/s-shelf-{tag}.png')
    # Every cover draws (no missing artwork): each <use> points at a symbol that exists.
    missing = J("""import('./js/covers.js').then(C => { C.ensureCoverSprite(); return C.COVERS.filter(c => !document.getElementById('cv-' + c.id)).map(c => c.id); })""")
    refs = J("""(() => { const s = document.getElementById('cover-sprite'); const ids = new Set([...s.querySelectorAll('[id]')].map(e => e.id)); const bad = []; for (const e of s.querySelectorAll('use')) { const h = e.getAttribute('href').slice(1); if (!ids.has(h)) bad.push(h); } for (const e of s.querySelectorAll('[fill^="url("], [stroke^="url("], [filter], [mask], [clip-path]')) for (const a of ['fill', 'stroke', 'filter', 'mask', 'clip-path']) { const v = e.getAttribute(a); const m = v && v.match(/url\\(#([^)]+)\\)/); if (m && !ids.has(m[1])) bad.push(m[1]); } return [...new Set(bad)]; })()""")
    print('missing symbols', missing, '| broken references', refs); assert not missing and not refs
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
