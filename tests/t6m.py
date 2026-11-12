"""Word and PowerPoint reader (js/docread.js): the sample files in
tests/fixtures come out as the structure listed in tests/fixtures/README.md;
the Word text opens in the real typed-note editor and lays out into pages."""
from dbg import *
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    R = J("""(async () => {
      const D = await import('./js/docread.js');
      const get = async (n) => new Uint8Array(await (await fetch('./tests/fixtures/' + n)).arrayBuffer());
      const strip = (r) => ({ ...r, images: r.images.map((i) => ({ ...i, bytes: i.bytes.length })) });
      let bad = null; try { await D.readDocx(new Uint8Array([1, 2, 3, 4])); } catch (e) { bad = e.message; }
      const kinds = ['a.pdf', 'b.DOCX', 'c.pptx', 'd.png', 'e.doc', 'f.ppt', 'g.txt'].map((n) => D.documentKind({ name: n, type: '' }));
      kinds.push(D.documentKind({ name: 'x', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      kinds.push(D.documentKind({ name: 'x', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
      return { docx: strip(await D.readDocx(await get('sample.docx'))), plain: strip(await D.readDocx(await get('sample-plain.docx'))),
               pptx: strip(await D.readPptx(await get('sample.pptx'))), bad, kinds };
    })()""")
    d = R['docx']; blocks = d['doc']['content']
    txt = lambda n: ''.join(t.get('text', '') for t in n.get('content', []))
    print('sections', d['sections'], 'title', d['title'], 'warnings', d['warnings'])
    print('blocks', [b['type'] + (str(b.get('attrs', {}).get('level', '')) if b['type'] == 'heading' else '') for b in blocks])
    assert [(s['title'], s['level']) for s in d['sections']] == [('Kitchen renovation plan', 1), ('Introduction', 1), ('Background', 2), ('Quotes', 1), ('Next steps', 1)]
    assert all(blocks[s['block']]['type'] == 'heading' and txt(blocks[s['block']]) == s['title'] for s in d['sections'])
    assert d['title']
    bl = [b for b in blocks if b['type'] == 'bulletList']; ol = [b for b in blocks if b['type'] == 'orderedList']
    assert len(bl) == 1 and len(ol) == 1, 'one bullet list and one numbered list'
    items = lambda l: [txt(i['content'][0]) for i in l['content']]
    assert items(bl[0]) == ['Old cabinets', 'Leaking tap', 'Poor lighting'], items(bl[0])
    assert items(ol[0]) == ['Measure', 'Get quotes', 'Choose a contractor'], items(ol[0])
    tb = [b for b in blocks if b['type'] == 'table']; assert len(tb) == 1
    cells = [[txt(c['content'][0]) for c in r['content']] for r in tb[0]['content']]
    assert cells == [['Item', 'Quote A', 'Quote B'], ['Cabinets', '4200', '3900'], ['Lighting', '800', '950']], cells
    assert tb[0]['content'][0]['content'][0]['type'] == 'tableHeader' and tb[0]['content'][1]['content'][0]['type'] == 'tableCell'
    im = [b for b in blocks if b['type'] == 'imageFile']; assert len(im) == 1 and len(d['images']) == 1
    a = im[0]['attrs']; img = d['images'][0]
    print('image', a, img)
    assert a['fileId'] == img['id'] and img['bytes'] > 100 and img['type'] == 'image/png'
    assert abs(a['w'] - 288) <= 2 and abs(a['h'] - 173) <= 2, 'about 3 inches wide'
    assert len([b for b in blocks if b['type'] == 'pageBreak']) == 1
    pb = [b['type'] for b in blocks].index('pageBreak'); assert blocks[pb + 1]['type'] == 'heading'
    marks = {}
    for b in blocks:
        for t in b.get('content', []):
            if t.get('type') == 'text':
                for m in t.get('marks', []): marks[t['text']] = m['type']
    assert marks.get('budget') == 'bold' and marks.get('timeline') == 'italic', marks
    pl = R['plain']; print('plain', [b['type'] for b in pl['doc']['content']])
    assert pl['sections'] == [] and [b['type'] for b in pl['doc']['content']] == ['paragraph'] * 3
    assert txt(pl['doc']['content'][0]) == 'The first paragraph has no heading above it.'

    p = R['pptx']
    print('pptx', p['width'], p['height'], [s['title'] for s in p['slides']], p['sections'], p['title'], p['warnings'])
    assert len(p['slides']) == 4 and p['width'] == 12191695 and p['height'] == 6858000
    assert [s['title'] for s in p['slides']] == ['Quarterly review', 'Highlights', 'Floor plan', 'Numbers'] and p['title'] == 'Quarterly review'
    assert p['sections'] == [{'name': 'Opening', 'slides': [0, 1]}, {'name': 'Details', 'slides': [2, 3]}]
    s2 = p['slides'][1]
    bodies = [s for s in s2['shapes'] if s['type'] == 'text' and not s['isTitle']]
    bp = [pp for s in bodies for pp in s['paragraphs']]
    print('slide 2 body', [(x['runs'][0]['text'], x['bullet'], x['runs'][0]['size']) for x in bp])
    assert [x['runs'][0]['text'] for x in bp] == ['Revenue up', 'Two new clients', 'Team grew to 8'] and all(x['bullet'] for x in bp)
    assert all(0 <= s['x'] <= 1 and 0 < s['w'] <= 1 and 0 <= s['y'] <= 1 for s in s2['shapes']), 'inherited positions'
    assert all(r['size'] >= 10 for x in bp for r in x['runs'])
    s3 = p['slides'][2]; pic = [s for s in s3['shapes'] if s['type'] == 'picture'][0]
    for k, v in (('x', .075), ('y', .2667), ('w', .375), ('h', .4)): assert abs(pic[k] - v) < .01, (k, pic[k])
    assert pic['imageId'] == p['images'][0]['id'] and p['images'][0]['bytes'] > 100
    tx = [s for s in s3['shapes'] if s['type'] == 'text' and not s['isTitle']]
    assert tx and tx[0]['paragraphs'][0]['runs'][0]['text'] == 'Kitchen on the left, dining on the right'
    tbl = [s for s in p['slides'][3]['shapes'] if s['type'] == 'table'][0]
    assert tbl['rows'] == [['Item', 'Quote A', 'Quote B'], ['Cabinets', '4200', '3900'], ['Lighting', '800', '950']]
    assert R['bad'] and "couldn" in R['bad'], R['bad']
    assert R['kinds'] == ['pdf', 'docx', 'pptx', 'image', None, None, None, 'docx', 'pptx'], R['kinds']

    # The Word text opens in the real editor and lays out into pages.
    out = J("""(async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const D = await import('./js/docread.js');
      const r = await D.readDocx(new Uint8Array(await (await fetch('./tests/fixtures/sample.docx')).arrayBuffer()));
      const ids = {}; for (const i of r.images) ids[i.id] = await V.addFile(i.bytes, { sealed: false, type: i.type });
      const fix = (n) => { if (n.type === 'imageFile') n.attrs.fileId = ids[n.attrs.fileId]; (n.content || []).forEach(fix); return n; };
      const doc = fix(JSON.parse(JSON.stringify(r.doc))); doc.content = doc.content.filter((b) => b.type !== 'pageBreak');
      const n = await V.saveNote(M.newNote({ kind: 'note', title: 'Imported', titleAuto: false, doc, region: 'career', inbox: false }));
      return n.id; })()""")
    page.goto(BASE + f'#/note/{out}'); page.wait_for_selector('#n-rich .rich h1'); page.wait_for_timeout(800)
    h = J("[...document.querySelectorAll('#n-rich .rich h1, #n-rich .rich h2')].map(e => e.tagName + ':' + e.textContent)")
    print('rendered', h)
    assert h == ['H1:Kitchen renovation plan', 'H1:Introduction', 'H2:Background', 'H1:Quotes', 'H1:Next steps']
    assert J("document.querySelectorAll('#n-rich .rich table tr').length") == 3
    assert J("document.querySelectorAll('#n-rich .rich li').length") == 6
    pages = J(f"""import('./js/vault.js').then(V => import('./js/export.js').then(E => E.typedPages(V.state.notes.get('{out}'), {{ px: 300 }}))).then(p => p.length)""")
    print('pages', pages)
    assert pages >= 2
    print('ok')
if __name__ == '__main__':
    run(steps, vp=(1180, 820), mob=False)
