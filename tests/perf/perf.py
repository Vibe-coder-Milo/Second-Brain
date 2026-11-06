"""Performance measurements with a large vault. Usage: perf.py [notes] [pdfpages]"""
import sys, json, time
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 600
P = int(sys.argv[2]) if len(sys.argv) > 2 else 40
with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-precise-memory-info', '--js-flags=--expose-gc'])
    ctx = b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    J = lambda js, arg=None: page.evaluate(js, arg)
    t0 = time.time(); page.goto(BASE); page.wait_for_selector('text=Start a new second brain'); t_gate = time.time() - t0
    res = J("performance.getEntriesByType('resource').map(r => [r.name.replace(location.origin, ''), r.encodedBodySize || r.transferSize || 0])")
    js = [r for r in res if r[0].endswith('.js') or r[0].endswith('.mjs')]
    print(f'STARTUP to lock screen: {t_gate*1000:.0f} ms, {len(js)} scripts, {sum(r[1] for r in js)/1024:.0f} KB JS')
    for r in sorted(js, key=lambda r: -r[1])[:8]: print('   ', r[0], f'{r[1]/1024:.0f} KB')
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click(); page.wait_for_selector('.today-page', timeout=20000)
    t = J("""async (N) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: false });
      const words = 'renovation mortgage condo tenant dividend portfolio REIT promotion manager stakeholder rollout kyoto flight hotel marathon recipe laksa github bug feature budget tax insurance coffee mentor birthday book podcast framework lesson'.split(' ');
      const regions = V.state.config.regions.map((r) => r.id);
      const t0 = performance.now(); const ids = [];
      for (let i = 0; i < N; i++) {
        const w = () => words[Math.floor(Math.random() * words.length)];
        const body = Array.from({ length: 6 }, () => Array.from({ length: 14 }, w).join(' ')).join('\\n\\n') + (i > 5 && i % 4 === 0 ? `\\n\\nSee [[Note ${i - 3}]]` : '');
        const n = M.newNote({ title: `Note ${i}`, titleAuto: false, body, region: regions[i % regions.length], inbox: i % 9 === 0 });
        ids.push((await V.saveNote(n)).id);
      }
      return performance.now() - t0; }""", N)
    print(f'SEED {N} notes: {t:.0f} ms')
    # unlock time
    J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))"); page.wait_for_timeout(1500)
    page.wait_for_selector('input[type=password]')
    t0 = time.time(); page.fill('input[type=password]', PASS); page.keyboard.press('Enter'); page.wait_for_selector('.today-page', timeout=60000); t_unlock = time.time() - t0
    print(f'UNLOCK with {N} notes: {t_unlock*1000:.0f} ms')
    # pure decrypt cost
    tl = J("import('./js/vault.js').then(async V => { const t = performance.now(); await V.loadAll(); return performance.now() - t; })"); print(f'   loadAll: {tl:.0f} ms')
    # connections etc (no semantic vectors in this run)
    m = J("""(async () => { const D = await import('./js/mapdata.js'); const A = await import('./js/mapassist.js'); const MM = await import('./js/minimap.js'); const V = await import('./js/vault.js');
      const T = (f) => { const t = performance.now(); f(); return Math.round(performance.now() - t); };
      const id = [...V.state.notes.keys()][10];
      return { connections: T(() => D.connections()), connections2: T(() => D.connections()), themes: T(() => D.themes(D.connections().edges)), noticed: T(() => A.noticed()), digest: T(() => A.weekDigest()), minimap: T(() => MM.miniMapHtml(id)) }; })()"""); print('COMPUTE (ms)', m)
    t0 = time.time(); page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas'); page.wait_for_timeout(200); t_map = time.time() - t0
    lt = J("(() => { const t = performance.now(); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t)))); })()")
    print(f'MAP open: {t_map*1000:.0f} ms, frame: {lt:.0f} ms')
    t0 = time.time(); page.goto(BASE + '#/today'); page.wait_for_selector('.today-page'); page.wait_for_timeout(100); print(f'TODAY: {(time.time()-t0)*1000:.0f} ms')
    t0 = time.time(); page.goto(BASE + '#/notes'); page.wait_for_selector('.row-title'); print(f'ALL NOTES: {(time.time()-t0)*1000:.0f} ms, rows {page.locator(".row-title").count()}')
    t0 = time.time(); page.goto(BASE + '#/notes?q=mortgage%20condo'); page.wait_for_selector('.row-title'); print(f'SEARCH: {(time.time()-t0)*1000:.0f} ms')
    # a long PDF: make one, import it, flip through
    nid = J("""async (P) => { const L = await import('./vendor/pdf-lib.esm.min.js'); const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
      for (let i = 0; i < P; i++) { const pg = doc.addPage([595, 842]); pg.drawText(`Page ${i + 1} of the board pack`, { x: 60, y: 760, size: 24, font }); for (let k = 0; k < 30; k++) pg.drawText('Revenue grew eight percent; costs held flat across teams. ' + k, { x: 60, y: 700 - k * 20, size: 11, font }); }
      const bytes = await doc.save(); window.__pdf = new File([bytes], 'board-pack.pdf', { type: 'application/pdf' });
      const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Notes, x', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] })); return n.id; }""", P)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    t0 = time.time()
    J("import('./js/handoff.js').then(H => H.handOff(window.__pdf))")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=300000)
    print(f'PDF import {P} pages: {(time.time()-t0)*1000:.0f} ms')
    heap = lambda: J("(() => { window.gc && window.gc(); return Math.round(performance.memory.usedJSHeapSize / 1048576); })()")
    print('heap after import MB', heap())
    flips = []
    for i in range(min(P - 1, 25)):
        t0 = time.time(); page.locator('[data-pg=next]').click()
        page.wait_for_function(f"() => document.querySelector('#iv-sub').textContent.includes('page {i + 2} of')"); page.wait_for_timeout(30)
        # wait until the background is drawn
        page.wait_for_function("() => { const c = document.querySelector('canvas.ink-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 61) if (d[i] < 150) return true; return false; }", timeout=10000)
        flips.append((time.time() - t0) * 1000)
    print(f'PAGE FLIP (ms): first {flips[0]:.0f}, median {sorted(flips)[len(flips)//2]:.0f}, max {max(flips):.0f}')
    cache = J("import('./js/editor/inkdraw.js').then(D => D.cachedImageCount ? D.cachedImageCount() : -1)")
    print('heap after flipping MB', heap(), 'decoded images kept:', cache)
    t_in = J("(() => { const t = performance.now(); document.querySelector('[data-act=pages]').click(); const ok = !!document.querySelector('.page-thumb'); return new Promise(r => requestAnimationFrame(() => r([Math.round(performance.now() - t), ok]))); })()")
    print('PAGES SHEET in-page open to first frame (ms), present:', t_in)
    t0 = time.time(); page.wait_for_selector('.page-thumb'); page.wait_for_timeout(100)
    thumbs0 = page.locator('canvas.thumb-canvas').count()
    page.wait_for_timeout(3000); thumbs = page.locator('canvas.thumb-canvas').count()
    print(f'PAGES SHEET: opened {(time.time()-t0)*1000:.0f} ms, thumbs drawn at once {thumbs0}, after 3s {thumbs}')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    J("document.querySelector('[data-close]')?.click()")
    for rnd in range(2):
        for i in range(39):
            J("document.querySelector('[data-pg=prev]')?.click()" if rnd == 0 else "document.querySelector('[data-pg=next]')?.click()"); page.wait_for_timeout(120)
        print(f'heap after round {rnd+2} of flipping MB', heap(), 'kept', J("import('./js/editor/inkdraw.js').then(D => D.cachedImageCount())"))
    b.close()
