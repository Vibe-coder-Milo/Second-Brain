"""Highlights. Highlighter marks on a PDF page, on a handwritten page and
highlights in a typed note are gathered on one screen (per note, notebook or
everything). Each card has a picture and the words under it: a word counts
when at least half of it is covered; a highlight drifting onto the next line or
sitting too high still takes the line it covers most (and says so); one over
empty paper keeps just its picture and can be removed. The lasso can add any
selection to the highlights."""
from dbg import *
from hershey_ink import text_strokes
import sys, math
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const L = await import('./vendor/pdf-lib.esm.min.js'); const doc = await L.PDFDocument.create();
      const font = await doc.embedFont(L.StandardFonts.TimesRoman);
      const lines = ['Dividends are the part of a company profit paid out to its owners.', 'Over long periods, reinvested dividends have made up a large share', 'of the total return from holding shares, more than most people expect.',
        'A steady payout also tells you something: a business that pays cash', 'every year has to actually earn it. Paper profits cannot be paid out.', 'That is why many investors watch the payout ratio, the share of profit',
        'that goes to dividends. Too high, and there is little left to grow;', 'too low, and you may be relying on the price going up instead.', 'In Singapore, REITs must pay out most of their taxable income, which',
        'is why their yields look high next to the banks. Check the yield', 'against the D05 yield before Friday, and look at five years of payouts,'];
      const pg = doc.addPage([595, 842]); lines.forEach((t, i) => pg.drawText(t, { x: 60, y: 720 - i * 22, size: 13, font }));
      window.__pdf = new File([await doc.save()], 'Why dividends matter.pdf', { type: 'application/pdf' });
      const unit = 1000 / 595; window.__words = [];
      lines.forEach((t, i) => { let x = 60; const y = 720 - i * 22; for (const w of t.split(' ')) { const wd = font.widthOfTextAtSize(w, 13); window.__words.push({ line: i, x0: x * unit, x1: (x + wd) * unit, mid: (842 - y - 13 * 0.28) * unit }); x += wd + font.widthOfTextAtSize(' ', 13); } });
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Investing', region: 'investing' }));
      window.__nb = nb.id;
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Why dividends matter', titleAuto: false, notebook: nb.id, region: 'investing', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    J("import('./js/handoff.js').then(H => H.handOff(window.__pdf))")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=120000)
    page.wait_for_timeout(600)
    nbid = J("window.__nb")
    # Highlights on the PDF page: neat, drifting, too high, green, and over empty paper.
    J(f"""(async () => {{ const V = await import('./js/vault.js'); const N = await import('./js/notework.js'); const n = V.state.notes.get('{nid}'); const p = n.pages.find(x => x.pdf);
      const W = window.__words; const line = (i) => W.filter(w => w.line === i);
      const hl = (pts, c, at) => ({{ id: 'h' + Math.random().toString(36).slice(2), t: 'hl', c, s: 18, sp: 1, at, pts: pts.flatMap(([x, y]) => [x, y, 0.5]) }});
      const seg = (x0, y0, x1, y1) => [...Array(25)].map((_, k) => [x0 + (x1 - x0) * k / 24, y0 + (y1 - y0) * k / 24]);
      const L1 = line(1), L4 = line(4), L6 = line(6), L10 = line(10);
      const t0 = Date.now() - 3600e3;
      const strokes = [
        hl(seg(L1[2].x0 - 2, L1[2].mid, L1[7].x1 + 2, L1[7].mid), '#F7D046', t0),
        hl(seg(L4[4].x0, L4[4].mid + 1, L4[10].x1, L4[10].mid + 22), '#F7D046', t0 + 300e3),
        hl(seg(L6[0].x0, L6[0].mid - 9, L6[6].x1, L6[6].mid - 10), '#F7D046', t0 + 600e3),
        hl(seg(L10[1].x0, L10[1].mid, L10[4].x1, L10[4].mid), '#9BE07A', t0 + 900e3),
        hl(seg(560, 900, 860, 905), '#F7D046', t0 + 1200e3),
      ];
      await V.savePage(p.id, {{ ...V.emptyPageData(), strokes }}); await N.refreshInkSummary('{nid}', {{ touch: false }}); }})()""")
    # A handwritten note in the same notebook, with a pink highlight over a line; and a typed note.
    strokes = []
    for i, t in enumerate(['Meeting with Wei Ling', 'lead with outcomes, not tasks', 'check vs D05 yield before Friday']):
        for k, s in enumerate(text_strokes(t, 'scripts', 90, 110 + i * 78, 1.5, seed=i, slant=0.08)):
            strokes.append({'id': f'w{i}_{k}', 't': 'pen', 'pen': 'ballpoint', 'c': '#1B2A38', 's': 2.8, 'sp': 1, 'pts': s, 'at': 1})
    strokes.append({'id': 'pink', 't': 'hl', 'c': '#FF9EC4', 's': 26, 'sp': 1, 'at': 5, 'pts': [v for x in range(85, 600, 8) for v in (x, 203, 0.5)]})
    iid = J("""async ([strokes, nb]) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const N = await import('./js/notework.js');
      const pg = M.newPage({}); await V.savePage(pg.id, { ...V.emptyPageData(), strokes });
      const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Meeting with Wei Ling', titleAuto: false, notebook: nb, region: 'career', inbox: false, pages: [pg] }));
      await N.refreshInkSummary(n.id, { touch: false });
      await V.saveNote(M.newNote({ kind: 'note', title: 'Promotion case', titleAuto: false, region: 'career', inbox: false, doc: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Move up a grade in the March cycle. ' }, { type: 'text', text: 'Lead with outcomes, one clear ask.', marks: [{ type: 'highlight', attrs: { color: '#FFF1B8' } }] }] }] } }));
      return n.id; }""", [strokes, nbid])
    hlp = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').hlPages.length)"); assert hlp == 1, 'the note knows which page has highlights'
    # 1. The note's own highlights, from its menu.
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    page.locator('[data-act=more]').first.click(); page.wait_for_selector('.sheet .menu')
    page.locator('.sheet .menu button', has_text='Highlights in this note').click()
    page.wait_for_selector('.hl-card'); page.wait_for_function("() => [...document.querySelectorAll('.hl-card')].every(c => c.querySelector('img') || c.querySelector('.hl-typed'))", timeout=60000)
    page.wait_for_timeout(300)
    cards = J("[...document.querySelectorAll('.hl-card')].map(c => ({ txt: c.querySelector('.hl-txt')?.textContent || '', why: c.querySelector('.hl-why:not([hidden])')?.textContent || '', img: !!c.querySelector('img'), page: c.querySelector('.hl-go').textContent }))")
    for c in cards: print('card:', c)
    assert len(cards) == 5 and all(c['img'] for c in cards)
    assert cards[0]['txt'] == 'periods, reinvested dividends have made up', 'neat highlight: exactly the words'
    assert cards[1]['txt'].startswith('actually earn it. Paper profits') and 'drifted' in cards[1]['why'], 'drifting highlight keeps to its line'
    assert cards[2]['txt'] == 'that goes to dividends. Too high, and' and 'above' in cards[2]['why'], 'a high highlight takes the line it touches most'
    assert cards[3]['txt'] == 'the D05 yield before'
    assert cards[4]['txt'] == '' and 'No words' in cards[4]['why']
    assert J("document.querySelectorAll('.hl-chips .chip').length") == 3, 'All, Yellow, Green'
    page.screenshot(path=f'{OUT}/d-highlights-{tag}.png', full_page=True)
    # Colour filter.
    page.locator('.hl-chips .chip', has_text='Green').click(); page.wait_for_timeout(300)
    assert page.locator('.hl-card').count() == 1
    page.locator('.hl-chips .chip', has_text='All').click(); page.wait_for_timeout(300)
    # 2. Remove the slip over empty paper: it's gone from the page too.
    page.wait_for_function("() => document.querySelectorAll('.hl-card')[4]?.querySelector('[data-rm]:not([hidden])')", timeout=30000)
    page.locator('.hl-card').nth(4).locator('[data-rm]').click(); page.wait_for_selector('.sheet'); page.locator('.sheet [data-yes]').click()
    page.wait_for_function("() => document.querySelectorAll('.hl-card').length === 4", timeout=30000)
    left = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); const d = await V.loadPage(n.hlPages[0]); return d.strokes.filter(s => s.t === 'hl').length; }})")
    print('highlights left on the page:', left); assert left == 4
    # 3. The notebook: the PDF and the handwritten note (the typed note isn't in it).
    page.goto(BASE + f'#/highlights?notebook={nbid}'); page.wait_for_selector('.hl-src')
    srcs = page.locator('.hl-src-h a').all_inner_texts(); print('notebook highlights from:', srcs)
    assert sorted(srcs) == ['Meeting with Wei Ling', 'Why dividends matter']
    page.wait_for_function("() => [...document.querySelectorAll('.hl-card')].every(c => c.querySelector('img'))", timeout=90000)
    hand = J("[...document.querySelectorAll('.hl-card')].map(c => [c.querySelector('.hl-txt')?.textContent || '', c.querySelector('.hl-why:not([hidden])')?.textContent || '']).find(([t, w]) => /handwriting|No words/.test(w))")
    print('handwriting highlight:', hand)
    assert hand and ('handwriting' in hand[1] or 'No words' in hand[1])
    # 4. Everything: the typed note's highlight too, with its sentence around it.
    page.goto(BASE + '#/highlights'); page.wait_for_selector('.hl-typed')
    typed = page.locator('.hl-typed').inner_text(); print('typed:', typed)
    assert 'Lead with outcomes, one clear ask.' == page.locator('.hl-typed mark').inner_text() and 'March cycle' in typed
    assert page.locator('.side-link[href="#/highlights"]').count() == (1 if wide else 0) or not wide
    # 5. The lasso adds a selection to the highlights.
    page.goto(BASE + f'#/note/{iid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(600)
    page.locator('#iv-tools [data-tool=lasso]').click(); page.wait_for_timeout(150)
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width / 1000]; })()")
    cx, cy, s = r[0], r[1], r[2]
    loop = [(80, 245), (720, 245), (720, 300), (80, 300), (80, 248)]
    page.mouse.move(cx + loop[0][0] * s, cy + loop[0][1] * s); page.mouse.down()
    for (a, b), (c2, d) in zip(loop, loop[1:]):
        for k in range(1, 9): page.mouse.move(cx + (a + (c2 - a) * k / 8) * s, cy + (b + (d - b) * k / 8) * s)
    page.mouse.up(); page.wait_for_selector('.sel-bar [data-sel=hl]', timeout=10000)
    page.locator('.sel-bar [data-sel=hl]').click(); page.wait_for_timeout(1200)
    n_hl = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{iid}'); const d = await V.loadPage(n.pages[0].id); return d.strokes.filter(s => s.t === 'hl').length; }})")
    print('highlights on the handwritten page after the lasso:', n_hl); assert n_hl >= 2
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
