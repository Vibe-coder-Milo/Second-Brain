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
    # Long names fit: two lines at a word break, no "…", inside the space each cover leaves for its title.
    fits = J("""async () => { const C = await import('./js/covers.js');
      for (const f of ['400 20px Spectral', 'italic 400 20px Spectral', '600 20px Overpass', '700 20px Overpass', '400 20px Caveat']) await document.fonts.load(f);
      const mc = document.createElement('canvas').getContext('2d');
      const names = ['Reading', 'Investing journal 2026', 'Property investing notes 2026', 'Singapore travel plans and itineraries', 'Our wedding and honeymoon in Japan 2027'];
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.appendChild(host);
      const bad = []; let two = 0;
      for (const c of C.COVERS.concat([{ id: 'plain', t: { x: 28, y: 70, max: 160, g: 'down' } }])) for (const ts of ['printed', 'hand']) for (const name of names) {
        host.innerHTML = C.coverSVG({ title: name, cover: { style: c.id, titleStyle: ts } }, { width: 210 });
        const t = host.querySelector('.cover-title'); const lines = t.querySelectorAll('tspan').length || 1; if (lines === 2) two++;
        const text = t.textContent; const bb = t.getBBox(); const where = `${c.id}/${ts}/${name}`;
        if (text.includes('…')) bad.push(where + ': cut short');
        if (text.replace(/\\s/g, '') !== name.replace(/\\s/g, '') && !text.includes('…')) bad.push(where + ': text changed');
        if (name === 'Reading' && lines !== 1) bad.push(where + ': short name on two lines');
        if (bb.x < 12 || bb.x + bb.width > 210) bad.push(where + `: outside the cover ${bb.x.toFixed(0)}..${(bb.x + bb.width).toFixed(0)}`);
        for (const r of (t.querySelectorAll('tspan').length ? t.querySelectorAll('tspan') : [t])) if (r.getComputedTextLength() > c.t.max + 0.5) bad.push(where + `: wider than ${c.t.max}: ${r.getComputedTextLength().toFixed(1)}`);
        // The letters themselves (not the font's line box) must stay inside the cover's title space.
        const [top, bottom] = c.t.b || [0, 280];
        const cs = getComputedStyle(t); mc.font = `${cs.fontStyle} ${cs.fontWeight} ${t.getAttribute('font-size')}px ${t.getAttribute('font-family')}`;
        const rows = t.querySelectorAll('tspan').length ? [...t.querySelectorAll('tspan')] : [t];
        for (const r of rows) { const m = mc.measureText(r.textContent); const y = +r.getAttribute('y');
          if (y - m.actualBoundingBoxAscent < top - 0.5 || y + m.actualBoundingBoxDescent > bottom + 0.5) bad.push(where + `: outside its space ${(y - m.actualBoundingBoxAscent).toFixed(0)}..${(y + m.actualBoundingBoxDescent).toFixed(0)} vs ${top}..${bottom}`); }
      }
      host.remove(); return { bad, two }; }""")
    print('long names on two lines:', fits['two'], '| problems:', fits['bad'][:40], len(fits['bad'])); assert not fits['bad'] and fits['two'] > 100
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
