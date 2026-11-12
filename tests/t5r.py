"""Round 8: continuous view. Every page of a handwritten note one under
another; the page in view is the live page; writing on another page makes it
live and keeps the stroke; pictures only near the screen; switch views."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const L = await import('./vendor/pdf-lib.esm.min.js'); const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
      for (let i = 0; i < 14; i++) { const pg = doc.addPage([595, 842]); pg.drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 34, font }); for (let k = 0; k < 30; k++) pg.drawText('Revenue grew eight percent; costs held flat. ' + k, { x: 60, y: 700 - k * 20, size: 11, font }); }
      window.__pdf = new File([await doc.save()], 'board-pack.pdf', { type: 'application/pdf' });
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Board pack', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    J("import('./js/handoff.js').then(H => H.handOff(window.__pdf))")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=120000)
    page.wait_for_selector('.ink-stack .ink-slot .ink-page'); page.wait_for_timeout(1200)
    info = lambda: J("""(() => { const slots = [...document.querySelectorAll('.ink-slot')]; const live = slots.findIndex(s => s.querySelector('.ink-page'));
      const pics = slots.map(s => { const c = s.querySelector('.slot-img'); return c && c.width > 0 && !s.querySelector('.slot-paper').hidden; });
      return { n: slots.length, live, pics: pics.map((x, i) => x ? i : -1).filter(i => i >= 0), sub: document.querySelector('#iv-sub').textContent }; })()""")
    st = info(); print('opened:', st)
    assert st['n'] == 14 and st['live'] == 0 and 'page 1 of 14' in st['sub']
    assert 1 in st['pics'], 'page 2 should have a picture (it is near the screen)'
    page.screenshot(path=f'{OUT}/r-top-{tag}.png')
    # Same width for every page, and the live page lines up with the rest.
    widths = J("[...document.querySelectorAll('.ink-slot')].map(s => Math.round(s.getBoundingClientRect().width))")
    assert len(set(widths)) == 1, widths
    # The picture of page 2 shows the PDF (dark text pixels in its top half).
    dark = J("""(() => { const c = document.querySelectorAll('.ink-slot')[1].querySelector('.slot-img'); const d = c.getContext('2d').getImageData(0, 0, c.width, Math.round(c.height / 2)).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 100) n++; return n; })()""")
    print('page 2 picture dark pixels', dark); assert dark > 100
    # Scroll to page 6: once scrolling settles, it's the live page.
    J("(() => { const sc = document.querySelector('.ink-scroll'); sc.scrollTop = document.querySelectorAll('.ink-slot')[5].offsetTop - 12; })()")
    page.wait_for_timeout(900)
    st = info(); print('scrolled to page 6:', st)
    assert st['live'] == 5 and 'page 6 of 14' in st['sub'] and 0 not in st['pics']
    assert 4 in st['pics'] and 6 in st['pics'] and 0 not in st['pics']
    page.screenshot(path=f'{OUT}/r-mid-{tag}.png')
    # Write on page 7 while page 6 is live: the stroke lands on page 7.
    J("(() => { const sc = document.querySelector('.ink-scroll'); const s7 = document.querySelectorAll('.ink-slot')[6]; sc.scrollTop = s7.offsetTop - sc.clientHeight * 0.75; })()")
    page.wait_for_timeout(150)
    live_before = info()['live']
    box = page.locator('.ink-slot').nth(6).bounding_box()
    page.locator('#iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    x0, y0 = box['x'] + box['width'] * 0.3, box['y'] + 40
    page.mouse.move(x0, y0); page.mouse.down()
    for i in range(1, 25): page.mouse.move(x0 + i * 8, y0 + (i % 5) * 3)
    page.mouse.up(); page.wait_for_timeout(1300)
    counts = J(f"""import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); const out = []; for (const p of n.pages.slice(4, 8)) out.push((await V.loadPage(p.id)).strokes.length); return out; }})""")
    st = info(); print('live before', live_before, 'after writing on page 7:', st['live'], '| strokes on pages 5-8:', counts)
    assert live_before == 5 and st['live'] == 6 and counts == [0, 0, 1, 0]
    # Back to page 6 (scroll up): its picture shows... and page 7's picture keeps the stroke.
    J("(() => { const sc = document.querySelector('.ink-scroll'); sc.scrollTop = document.querySelectorAll('.ink-slot')[5].offsetTop - 12; })()")
    page.wait_for_timeout(1200)
    st = info(); print('back on page 6:', st); assert st['live'] == 5 and 6 in st['pics']
    ink7 = J("""(() => { const c = document.querySelectorAll('.ink-slot')[6].querySelector('.slot-img'); const s = c.width / document.querySelectorAll('.ink-slot')[6].getBoundingClientRect().width; const d = c.getContext('2d').getImageData(0, 0, c.width, Math.round(90 * s)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60) n++; return n; })()""")
    print('page 7 picture shows the stroke: dark pixels near the top', ink7); assert ink7 > 30
    # Fly through every page: pictures only near the screen.
    most = 0
    for k in range(14):
        J(f"(() => {{ const sc = document.querySelector('.ink-scroll'); sc.scrollTop = document.querySelectorAll('.ink-slot')[{k}].offsetTop; }})()")
        page.wait_for_timeout(120)
        most = max(most, len(info()['pics']))
    page.wait_for_timeout(1200)
    st = info(); print('at the end:', st, '| most pictures kept at once', most)
    assert st['live'] == 13 and most <= 7
    # Keys: Page Up goes to the page before and scrolls to it.
    page.keyboard.press('PageUp'); page.wait_for_timeout(600)
    st = info(); top = J("(() => { const r = document.querySelectorAll('.ink-slot')[12].getBoundingClientRect(); const sr = document.querySelector('.ink-scroll').getBoundingClientRect(); return Math.round(r.top - sr.top); })()")
    print('Page Up ->', st['live'], 'its top at', top); assert st['live'] == 12 and -20 < top < 40
    # Zoom (ctrl + wheel): every page grows together, the live page still in its slot.
    if wide:
        box = page.locator('.ink-scroll').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 300)
        page.keyboard.down('Control'); page.mouse.wheel(0, -100); page.keyboard.up('Control'); page.wait_for_timeout(700)
        widths = J("[...document.querySelectorAll('.ink-slot')].map(s => Math.round(s.getBoundingClientRect().width))")
        live_w = J("Math.round(document.querySelector('.ink-page').getBoundingClientRect().width)")
        print('zoomed widths', set(widths), 'live', live_w); assert len(set(widths)) == 1 and abs(widths[0] - live_w) <= 1
        page.keyboard.down('Control'); page.mouse.wheel(0, 100); page.keyboard.up('Control'); page.wait_for_timeout(500)
    # Reopen: back on the same page, scrolled to it.
    here = info()['live']
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-stack .ink-page'); page.wait_for_timeout(800)
    st = info(); vis = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()")
    print('reopened on', st['live'], 'visible', vis); assert st['live'] == here and vis
    # Pill while scrolling.
    J("(() => { const sc = document.querySelector('.ink-scroll'); sc.scrollTop -= 400; })()"); page.wait_for_timeout(150)
    pill = J("(() => { const b = document.querySelector('#iv-ind'); return { on: b.classList.contains('on'), text: b.textContent }; })()")
    print('page pill', pill); assert pill['on'] and '/ 14' in pill['text']
    page.screenshot(path=f'{OUT}/r-pill-{tag}.png')
    page.wait_for_timeout(600); here = info()['live']
    # Switch to one page at a time and back.
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-how=next]'); page.locator('[data-how=next]').click(); page.wait_for_timeout(700)
    single = J("({ stack: !!document.querySelector('.ink-stack'), next: !!document.querySelector('[data-pg=next]'), sub: document.querySelector('#iv-sub').textContent })")
    print('one at a time:', single); assert not single['stack'] and single['next']
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-how=down]'); page.locator('[data-how=down]').click(); page.wait_for_timeout(900)
    st = info(); print('one under another again:', st); assert st['n'] == 14 and st['live'] == here
    # Add page at the end.
    page.locator('.ink-pagenav [data-pg=add]').click(); page.wait_for_timeout(900)
    st = info(); print('after Add page:', st); assert st['n'] == 15 and st['live'] == 14
    page.screenshot(path=f'{OUT}/r-end-{tag}.png')
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
