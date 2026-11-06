"""Round 7: speed and long PDFs. Map library loads only when needed, the map
rests when still, long PDFs keep memory bounded, scroll on / keys turn pages,
notes reopen at the last page, thumbnails come in as you scroll."""
from dbg import *
import os
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    # 1. Map library: not loaded on Today, loaded when the map opens (or soon after unlocking).
    early = J("typeof window.ForceGraph")
    print('map library on Today at start:', early)
    J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: false, pageView: 'single' });
      const regions = V.state.config.regions.map((r) => r.id);
      for (let i = 0; i < 60; i++) await V.saveNote(M.newNote({ title: `Note ${i}`, titleAuto: false, body: `About the condo renovation and budget, part ${i}. See [[Note ${Math.max(0, i - 1)}]]`, region: regions[i % regions.length], inbox: false })); })()""")
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas', timeout=15000)
    assert J("typeof window.ForceGraph") == 'function'
    page.wait_for_timeout(5000)
    busy = """(async () => { let total = 0, last = performance.now(); const end = last + 1200; while (performance.now() < end) { await new Promise(r => setTimeout(r, 0)); const now = performance.now(); if (now - last > 8) total += now - last; last = now; } return Math.round(total); })()"""
    idle = J(busy)
    save = J("""(async () => { const V = await import('./js/vault.js'); const n = [...V.state.notes.values()][3]; const t = performance.now(); await V.saveNote({ ...n, body: n.body + ' more' }); return Math.round(performance.now() - t); })()""")
    print(f'map: blocked {idle} ms over 1.2 s while still; save took {save} ms')
    assert idle < 200 and save < 250
    # Shape unchanged by an edit: the map isn't restarted; hover still lights up.
    page.screenshot(path=f'{OUT}/q-map-{tag}.png')
    # 2. A long PDF in a handwritten note.
    nid = J("""(async () => { const L = await import('./vendor/pdf-lib.esm.min.js'); const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
      for (let i = 0; i < 12; i++) { const pg = doc.addPage([595, 842]); pg.drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 30, font }); for (let k = 0; k < 30; k++) pg.drawText('Revenue grew eight percent; costs held flat. ' + k, { x: 60, y: 700 - k * 20, size: 11, font }); }
      window.__pdf = new File([await doc.save()], 'board-pack.pdf', { type: 'application/pdf' });
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Board pack', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    J("import('./js/handoff.js').then(H => H.handOff(window.__pdf))")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=120000)
    page.wait_for_timeout(500)
    sub = lambda: page.locator('#iv-sub').inner_text()
    pages = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').pages.length)")
    print('pages', pages, '|', sub()); assert pages >= 12
    # Stretch: a PDF page drawn taller than the PDF keeps its shape (the extra is blank).
    st = J(f"""(async () => {{ const V = await import('./js/vault.js'); const D = await import('./js/editor/inkdraw.js'); const n = V.state.notes.get('{nid}'); const p = n.pages.find(x => x.bg);
      const c = await D.renderPageCanvas({{ ...p, h: p.h * 2 }}, {{ strokes: [], objects: [] }}, 300);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let top = 0, bottom = 0;
      for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {{ const i = (y * c.width + x) * 4; if (d[i] < 120) {{ if (y < c.height * 0.45) top++; else if (y > c.height * 0.55) bottom++; }} }}
      return {{ top, bottom }}; }})()""")
    print('pdf drawn on a taller page: dark pixels top/bottom', st); assert st['top'] > 50 and st['bottom'] == 0
    # 3. Turning pages: keys.
    start_pg = int(sub().split('page ')[1].split(' of')[0])
    page.keyboard.press('PageDown'); page.wait_for_timeout(400)
    after_key = int(sub().split('page ')[1].split(' of')[0])
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(400)
    back_key = int(sub().split('page ')[1].split(' of')[0])
    print('keys: start', start_pg, 'PageDown ->', after_key, 'ArrowLeft ->', back_key)
    assert after_key == start_pg + 1 and back_key == start_pg
    # Scroll on past the end of the page for the next one.
    box = page.locator('#iv-host').bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    for _ in range(40): page.mouse.wheel(0, 300); page.wait_for_timeout(25)
    page.wait_for_timeout(500)
    after_wheel = int(sub().split('page ')[1].split(' of')[0])
    print('scrolled on past the end ->', after_wheel); assert after_wheel == start_pg + 1
    # Hint under the page.
    hint = page.locator('.pg-hint')
    print('hint:', hint.inner_text() if hint.count() else None)
    # 4. Flip through the lot: decoded pages kept stays small.
    for _ in range(pages + 2): page.keyboard.press('PageDown'); page.wait_for_timeout(140)
    kept = J("import('./js/editor/inkdraw.js').then(D => D.cachedImageCount())")
    last = int(sub().split('page ')[1].split(' of')[0])
    print('at page', last, 'decoded pages kept', kept); assert last == pages and kept <= 9
    page.keyboard.press('PageUp'); page.keyboard.press('PageUp'); page.wait_for_timeout(500)
    here = int(sub().split('page ')[1].split(' of')[0])
    # 5. Reopens at the page you were on.
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    again = int(sub().split('page ')[1].split(' of')[0])
    print('left on page', here, 'reopened on', again); assert again == here
    # 6. Page label opens the pages sheet; thumbnails come in as they scroll into view.
    page.locator('[data-pg=all]').click(); page.wait_for_selector('.page-thumb')
    page.wait_for_timeout(1500)
    drawn = page.locator('canvas.thumb-canvas').count()
    cur_vis = J("(() => { const b = document.querySelector('.page-thumb.current'); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()")
    print('thumbnails drawn', drawn, 'of', pages, '| current page in view:', cur_vis)
    assert drawn >= 3 and cur_vis
    page.screenshot(path=f'{OUT}/q-pages-{tag}.png')
    page.locator('[data-close]').first.click(); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/q-pdf-{tag}.png')
    print('OK')
import sys
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
