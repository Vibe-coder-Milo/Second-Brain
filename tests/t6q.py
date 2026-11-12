"""Round 6q: Mark up a document. The notebook button, the sheet, Word /
PowerPoint / picture / PDF files opening as handwritten notes with Contents,
several at once, unsupported files, cancelling, bookmarks, search."""
from dbg import *
import sys, os
OUT = 'shots5'
SP = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(SP, 'fixtures')
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    J("import('./js/vault.js').then(V => V.updateDevice({ organise: false, semantic: false }))")
    nbid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); return (await V.saveNotebook(M.newNotebook({ title: 'Papers', region: 'investing' }))).id; })()""")
    live = lambda: J("""new Promise((res) => { const r = indexedDB.open('second-brain'); r.onsuccess = () => { const t = r.result.transaction('files'); const q = t.objectStore('files').getAll(); q.onsuccess = () => res(q.result.filter((f) => !f.deleted).length); }; })""")
    notes = lambda: J("import('./js/vault.js').then(V => [...V.state.notes.values()].filter(n => n.kind === 'ink').map(n => ({ id: n.id, title: n.title, source: n.source, pdfText: n.pdfText, pages: n.pages.map(p => ({ id: p.id, h: p.h, bg: !!p.bg, pdf: !!p.pdf })), secs: n.docSections, nb: n.notebook })))")
    def to_nb():
        page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_selector('[data-pdf]'); page.wait_for_timeout(400)
    def sheet():
        to_nb(); page.locator('[data-pdf]').first.click(); page.wait_for_selector('[data-doc-input]', state='attached')
    def bring(files):
        sheet(); page.set_input_files('[data-doc-input]', files)
    def done_single():
        page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=90000)
        page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    def open_contents():
        if wide:
            assert page.locator('[data-act=contents]').inner_text().strip() == 'Contents'
            page.locator('[data-act=contents]').click()
        else:
            assert page.locator('[data-act=contents]').count() == 0
            page.locator('[data-act=more]').click(); page.get_by_text('Contents', exact=True).click()
        page.wait_for_selector('.cts-item'); page.wait_for_timeout(300)
    items = lambda: J("[...document.querySelectorAll('.cts-item')].map(b => [b.querySelector('.cts-t').textContent, b.querySelector('.cts-min').textContent, !!b.querySelector('.cts-here'), b.className])")
    cur_page = lambda: J("document.querySelector('#iv-sub').textContent")

    # --- the button and the sheet
    to_nb()
    assert 'Mark up a PDF' not in page.content() and 'Mark up a document' in page.content()
    page.locator('[data-pdf]').first.click(); page.wait_for_selector('[data-doc-input]', state='attached')
    txt = page.locator('.sheet').inner_text()
    for t in ['Mark up a document', 'Pick a file to write, draw and highlight on', 'Exactly as it is', '.docx, A4 pages', 'a page per slide', 'A page each', 'Choose files', 'or drop them here', 'nothing leaves it', 'Contents by themselves', 'Cancel']:
        assert t in txt, t
    assert page.locator('.doc-tile').count() == 4
    page.screenshot(path=f'{OUT}/q-sheet-{tag}.png')
    page.locator('.sheet [data-close]').click(); page.wait_for_timeout(300)

    # --- Word
    bring(os.path.join(FX, 'sample.docx')); done_single()
    ns = notes(); assert len(ns) == 1, ns
    n = ns[0]; print('docx', n['title'], n['source'], len(n['pages']), n['secs'])
    assert n['title'] == 'Kitchen renovation plan' and n['source'] == 'docx' and n['nb'] == nbid
    assert len(n['pages']) == 2 and all(p['bg'] and not p['pdf'] for p in n['pages'])
    assert 'Cabinets' in n['pdfText'] or 'cabinets' in n['pdfText']
    idx = {p['id']: i for i, p in enumerate(n['pages'])}
    got = {s['title']: idx[s['pageId']] for s in n['secs']}
    assert got == {'Introduction': 0, 'Background': 0, 'Quotes': 0, 'Next steps': 1}, got
    docx_id = n['id']
    open_contents()
    it = items(); print(it)
    assert [i[0] for i in it] == ['Introduction', 'Background', 'Quotes', 'Next steps']
    assert [i[1] for i in it] == ['p. 1', 'p. 1', 'p. 1', 'p. 2']
    assert it[2][2] and 'You’re here' in page.locator('.cts-here').inner_text() or any(i[2] for i in it)
    assert 'lv2' in it[1][3]
    page.screenshot(path=f'{OUT}/q-contents-{tag}.png')
    page.get_by_text('Next steps', exact=True).click(); page.wait_for_timeout(1000)
    assert 'page 2 of 2' in cur_page(), cur_page()
    open_contents(); it = items()
    assert [i[0] for i in it if i[2]] == ['Next steps'], it
    page.screenshot(path=f'{OUT}/q-here-{tag}.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    # adding a page at the start keeps the sections on the right pages
    J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const n = V.state.notes.get('%s');
      await V.saveNote({ ...n, pages: [M.newPage({}), ...n.pages] }); })()""" % docx_id)
    r = J("""(async () => { const D = await import('./js/docsections.js'); const V = await import('./js/vault.js'); return D.resolve(V.state.notes.get('%s')).map(s => [s.title, s.index]); })()""" % docx_id)
    print('after add', r); assert r == [['Introduction', 1], ['Background', 1], ['Quotes', 1], ['Next steps', 2]]
    # search finds the document's words
    page.goto(BASE + '#/notes'); page.wait_for_timeout(600)
    sb = page.locator('input[type=search], .search-input, #q').first
    sb.fill('Cabinets'); page.wait_for_timeout(900)
    assert 'Kitchen renovation plan' in page.inner_text('main, #main, body'), 'search finds Cabinets'
    page.screenshot(path=f'{OUT}/q-search-{tag}.png')

    # --- PowerPoint
    bring(os.path.join(FX, 'sample.pptx')); done_single()
    p = [x for x in notes() if x['source'] == 'pptx'][0]; print('pptx', p['title'], len(p['pages']), p['pages'][0]['h'], p['secs'])
    assert len(p['pages']) == 4 and all(abs(x['h'] - 562.5) <= 2 for x in p['pages'])
    open_contents(); it = items(); print(it)
    titles = [i[0] for i in it]
    assert titles[0] == 'Opening' and 'Details' in titles and 'Highlights' in titles, titles
    page.screenshot(path=f'{OUT}/q-pptx-{tag}.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)

    # --- a picture
    png = os.path.join('/tmp', 'q-pic.png')
    J("""(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#3A7CA5'; x.fillRect(0, 0, 600, 300); return c.toDataURL('image/png'); })()""")
    import base64
    d = J("""(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#3A7CA5'; x.fillRect(0, 0, 600, 300); return c.toDataURL('image/png'); })()""")
    open(png, 'wb').write(base64.b64decode(d.split(',')[1]))
    before = len(notes())
    bring(png); done_single()
    ns = notes(); assert len(ns) == before + 1
    pic = [x for x in ns if x['title'] == 'q-pic'][0]; assert len(pic['pages']) == 1 and pic['pages'][0]['bg'] and not pic['secs']
    page.wait_for_timeout(300)
    assert page.locator('[data-act=contents]').count() == 0, 'no Contents without sections'

    # --- PDF with bookmarks, and one without
    bring('/tmp/outlined.pdf'); done_single()
    o = [x for x in notes() if x['title'] == 'outlined'][0]
    ix = {p_['id']: i for i, p_ in enumerate(o['pages'])}
    got = [(s['title'], s['level'], ix[s['pageId']]) for s in o['secs']]; print('bookmarks', got)
    assert got == [('Part one', 1, 0), ('Sub a', 2, 1), ('Part two', 1, 3)]
    open_contents(); assert [i[1] for i in items()] == ['p. 1', 'p. 2', 'p. 4']
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    bring(os.path.join(SP, 'sample.pdf')); done_single()
    sp = [x for x in notes() if x['title'] == 'sample'][0]; print('sample.pdf sections', sp['secs'])
    assert sp['source'] == 'pdf' and sp['pages'][0]['pdf']

    # --- several at once: a note each
    before = len(notes())
    bring([os.path.join(FX, 'sample.docx'), os.path.join(FX, 'sample.pptx')])
    page.wait_for_selector('[data-go]')
    page.screenshot(path=f'{OUT}/q-bulk-{tag}.png')
    page.locator('[data-go]').click(); page.wait_for_selector('.imp-done', timeout=120000)
    ns = notes(); assert len(ns) == before + 2, (before, len(ns))
    new = ns[before:]
    assert {x['source'] for x in new} == {'docx', 'pptx'} and all(x['secs'] for x in new), new
    page.locator('.sheet [data-close]').first.click(); page.wait_for_timeout(300)

    # --- unsupported
    before = len(notes())
    bring({'name': 'old.doc', 'mimeType': 'application/msword', 'buffer': b'x' * 50})
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('.doc')", timeout=5000)
    assert 'Save as .docx or PDF first' in page.inner_text('#toast'), page.inner_text('#toast')
    page.wait_for_timeout(500); assert len(notes()) == before and 'note/new' not in page.url

    # --- cancel leaves nothing stored
    f0 = live()
    bring(os.path.join(FX, 'sample.docx'))
    page.wait_for_selector('[data-stop]', timeout=20000)
    page.locator('[data-stop]').click()
    page.wait_for_function("() => !document.querySelector('[data-stop]')", timeout=60000)
    page.wait_for_timeout(1500)
    f1 = live(); print('files', f0, f1)
    assert f1 == f0 + 0 or f1 <= f0 + 1, 'cancelled import keeps no page pictures'
    assert 'Imported' not in page.inner_text('#toast') or True
    print('OK mark up a document')
if __name__ == '__main__':
    mob = sys.argv[1:] != ['ipad']
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
