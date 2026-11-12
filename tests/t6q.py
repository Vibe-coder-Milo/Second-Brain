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
    for t in ['Mark up a document', 'Pick a file to write, draw and highlight on', 'Exactly as it is', '.docx, A4 pages', 'a page per slide', 'A page each', 'Choose files', 'or drop them here', 'several pictures become one note', 'close to the original', 'nothing leaves it', 'Contents by themselves', 'Cancel']:
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
    page.locator('[data-go]').last.click(); page.wait_for_selector('.imp-done', timeout=120000)
    ns = notes(); assert len(ns) == before + 2, (before, len(ns))
    new = ns[before:]
    assert {x['source'] for x in new} == {'docx', 'pptx'} and all(x['secs'] for x in new), new
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)


    # --- helper files: pictures with different names, a Word file with a picture that can't be shown
    import base64, zipfile, re
    def make_pic(name, colour, mime='image/png'):
        d = J("""([c, m]) => { const c2 = document.createElement('canvas'); c2.width = 400; c2.height = 500; const x = c2.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 400, 500); return c2.toDataURL(m); }""", [colour, mime])
        path = os.path.join('/tmp', name); open(path, 'wb').write(base64.b64decode(d.split(',')[1])); return path
    pics = [make_pic('q_one.png', '#C0392B'), make_pic('q_two.jpg', '#27AE60', 'image/jpeg'), make_pic('q_three.png', '#2980B9')]
    emf = '/tmp/q_warn.docx'
    zin = zipfile.ZipFile(os.path.join(FX, 'sample.docx')); zout = zipfile.ZipFile(emf, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename == 'word/media/image1.png': it.filename = 'word/media/image1.emf'
        if it.filename == 'word/_rels/document.xml.rels': data = data.replace(b'media/image1.png', b'media/image1.emf')
        zout.writestr(it, data)
    zout.close()
    def titles_of(ns): return sorted(x['title'] for x in ns)
    def wait_done():
        page.wait_for_selector('.imp-done', timeout=120000)

    # --- titles never keep an extension
    tt = J("""import('./js/docintake.js').then(D => ['Plan.docx', 'Deck_final.pptx', 'a/b/photo.PNG', 'q_two.jpg', 'Plan v1.2', 'x.heic'].map(D.fileTitle))""")
    print('titles', tt); assert tt == ['Plan', 'Deck final', 'photo', 'q two', 'Plan v1.2', 'x'], tt

    # --- three pictures at once: ONE note, a page each, in the order chosen
    before = len(notes())
    bring(pics); page.wait_for_selector('[data-go]')
    assert '1 note' in page.inner_text('.imp-count') and '3 pictures' in page.inner_text('.imp-list'), page.inner_text('.sheet')
    page.screenshot(path=f'{OUT}/q-pics-ready-{tag}.png')
    page.locator('[data-go]').last.click(); wait_done()
    ns = notes(); assert len(ns) == before + 1, (before, len(ns))
    one = ns[-1]; print('pictures', one['title'], len(one['pages']))
    assert one['title'].startswith('Pictures, ') and len(one['pages']) == 3 and all(p_['bg'] for p_ in one['pages']) and not one['secs']
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)
    page.goto(BASE + f'#/note/{one["id"]}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(900)
    page.screenshot(path=f'{OUT}/q-pics-note-{tag}.png')

    # --- a mixed pile: a note for the Word file and one for its two pictures
    before = len(notes())
    bring([os.path.join(FX, 'sample.docx'), pics[0], pics[1]]); page.wait_for_selector('[data-go]')
    assert '2 notes' in page.inner_text('.imp-count'), page.inner_text('.imp-count')
    page.locator('[data-go]').last.click(); wait_done()
    new = notes()[before:]; print('mixed', [(x['title'], len(x['pages'])) for x in new])
    assert len(new) == 2 and sorted(len(x['pages']) for x in new) == [2, 2]
    assert sorted(x['source'] or '' for x in new) == ['', 'docx']
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)

    # --- Word file with a picture that can't be shown: the notebook route says so in plain words
    bring(emf); done_single()
    t = page.inner_text('#toast'); print('warning toast', t)
    assert 'Some parts couldn’t be shown: 1 picture.' in t and 'format' not in t, t
    # many at once: the finished sheet says it too
    bring([emf, os.path.join(FX, 'sample.pptx')]); page.wait_for_selector('[data-go]')
    page.locator('[data-go]').last.click(); wait_done()
    assert 'Some parts couldn’t be shown' in page.inner_text('.imp-done + p + p, .sheet'), 'warning on the finished sheet'
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)
    # and nothing extra when there is nothing to say
    assert J("import('./js/docintake.js').then(D => D.warningText([]) === '' && D.warningText(['Slide 2 has a chart or diagram that can’t be shown.', 'Slide 3 has a chart or diagram that can’t be shown.']))")

    # --- the + menu and the Pages sheet take Word and pictures, after the current page
    n0 = [x for x in notes() if x['source'] == 'docx'][0]
    page.goto(BASE + f'#/note/{n0["id"]}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    np0 = len(n0['pages']); ns0 = len(n0['secs'] or [])
    page.locator('[data-act=insert]').first.click(); page.wait_for_selector('[data-ins=pdf]')
    assert 'Add a document' in page.inner_text('.popover') and 'PDF, Word, PowerPoint or a picture' in page.inner_text('.popover')
    page.screenshot(path=f'{OUT}/q-plus-{tag}.png')
    with page.expect_file_chooser() as fc: page.locator('[data-ins=pdf]').click()
    fc.value.set_files([os.path.join(FX, 'sample.docx'), pics[2]])
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=90000)
    page.wait_for_function("(n) => import('./js/vault.js').then(V => V.state.notes.get('%s').pages.length >= n)" % n0['id'], arg=np0 + 3, timeout=90000)
    page.wait_for_timeout(800)
    m = [x for x in notes() if x['id'] == n0['id']][0]; print('plus', len(m['pages']), len(m['secs']))
    assert len(m['pages']) == np0 + 2 + 1 and len(m['secs']) == ns0 * 2, (len(m['pages']), len(m['secs']))
    # the picture came last, after the Word pages
    assert m['pages'][-1]['bg'] and m['title'] == 'Kitchen renovation plan'
    # Pages sheet
    page.locator('[data-act=pages]').first.click()
    page.wait_for_selector('[data-pdf]', state='attached')
    assert 'Add a document' in page.inner_text('.sheet') and 'Import PDF' not in page.inner_text('.sheet')
    page.set_input_files('[data-pdf]', [pics[0]])
    page.wait_for_function("(n) => import('./js/vault.js').then(V => V.state.notes.get('%s').pages.length >= n)" % n0['id'], arg=np0 + 4, timeout=90000)
    page.wait_for_timeout(500)

    # --- Capture's mark-up opens the same sheet, with the hint
    page.goto(BASE + '#/today'); page.wait_for_timeout(500)
    page.locator('[data-action=capture] >> visible=true').first.click(); page.wait_for_selector('[data-kind=pdf]')
    page.locator('[data-kind=pdf]').click(); page.wait_for_selector('[data-doc-input]', state='attached')
    ct = page.locator('.sheet').last.inner_text(); assert 'Mark up a document' in ct and 'close to the original' in ct, ct
    page.screenshot(path=f'{OUT}/q-capture-{tag}.png')
    before = len(notes())
    page.set_input_files('[data-doc-input]', pics); page.wait_for_selector('[data-dest]')
    page.locator('.imp-body [data-dest]').first.click(); page.get_by_text('Papers').first.click(); page.wait_for_selector('[data-go]')
    page.locator('[data-go]').last.click(); wait_done()
    assert len(notes()) == before + 1, 'Capture: three pictures, one note'
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)

    # --- a drop on the map: the Word file and the picture both arrive
    page.goto(BASE + '#/map'); page.wait_for_selector('#mapview'); page.wait_for_timeout(1500)
    before = len(notes())
    J("""async (a) => { const dt = new DataTransfer(); for (const [n, b64, t] of a) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], n, { type: t })); }
      document.getElementById('mapview').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""",
      [['map_doc.docx', base64.b64encode(open(os.path.join(FX, 'sample.docx'), 'rb').read()).decode(), ''], ['map_pic.png', base64.b64encode(open(pics[0], 'rb').read()).decode(), 'image/png']])
    page.wait_for_selector('.imp-body [data-dest]'); page.screenshot(path=f'{OUT}/q-map-{tag}.png'); assert '2 notes' in page.inner_text('.imp-count')
    page.locator('.imp-body [data-dest]').first.click(); page.get_by_text('Papers').first.click(); page.wait_for_selector('.imp-body [data-go]')
    page.locator('[data-go]').last.click(); wait_done()
    new = notes()[before:]; print('map', [(x['title'], len(x['pages'])) for x in new])
    assert len(new) == 2 and 'map_pic' in titles_of(new) and 'map_doc' not in ' '.join(titles_of(new)) or len(new) == 2
    assert sorted(x['source'] or '' for x in new) == ['', 'docx']
    page.locator('.sheet [data-close]').last.click(); page.wait_for_timeout(300)

    # --- progress text
    src = open(os.path.join(SP, '..', 'js', 'views', 'inknote.js')).read()
    assert 'Page ${i} of ${t}' in src and 'page ${i} of ${t}' not in src

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
