"""Documents as pages (js/docpages.js): a Word file, a PowerPoint file and a
picture each become handwritten-note pages (stored background pictures), with
sections and search text. Page pictures are saved to tests/shots5/n-*.png."""
from dbg import *
import base64, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots5')
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    os.makedirs(OUT, exist_ok=True)
    R = J("""(async () => {
      const V = await import('./js/vault.js'); const D = await import('./js/docpages.js'); const M = await import('./js/model.js');
      const get = async (n) => (await fetch('./tests/fixtures/' + n)).blob();
      const png = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#3A7CA5'; x.fillRect(0, 0, 600, 300); x.fillStyle = '#fff'; x.fillRect(200, 100, 200, 100); c.toBlob(r, 'image/png'); });
      const live = () => new Promise((res) => { const r = indexedDB.open('second-brain'); r.onsuccess = () => { const t = r.result.transaction('files'); const q = t.objectStore('files').getAll(); q.onsuccess = () => res(q.result.filter((f) => !f.deleted).length); }; });
      const before = await live();
      const prog = [];
      const shots = async (res, tag) => {
        const out = [];
        for (const [i, p] of res.pages.entries()) {
          const b = await V.fileBlob(p.bg); const bm = await createImageBitmap(b);
          const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
          out.push({ tag, i, w: bm.width, h: bm.height, bh: p.h, url: c.toDataURL('image/png'), type: b.type });
        }
        return out;
      };
      const strip = (r) => ({ ...r, pages: r.pages.map((p) => ({ h: p.h, bg: !!p.bg, paper: p.paper })) });
      const docx = await D.documentPages(new File([await get('sample.docx')], 'Kitchen plan.docx'), { onProgress: (a, b) => prog.push([a, b]) });
      const pptx = await D.documentPages(new File([await get('sample.pptx')], 'deck.pptx'));
      const img = await D.documentPages(new File([png], 'wide.png', { type: 'image/png' }));
      let pdfErr = null; try { await D.documentPages(new File([new Uint8Array(4)], 'a.pdf')); } catch (e) { pdfErr = e.message; }
      let bad = null; try { await D.documentPages(new File([new Uint8Array(40)], 'bad.docx')); } catch (e) { bad = e.message; }
      const after = await live();
      const all = [...await shots(docx, 'docx'), ...await shots(pptx, 'pptx'), ...await shots(img, 'img')];
      return { docx: strip(docx), pptx: strip(pptx), img: strip(img), before, after, all, prog, pdfErr, bad, A4: M.A4_H };
    })()""")
    for s in R['all']:
        open(os.path.join(OUT, f"n-{s['tag']}-{s['i']+1}.png"), 'wb').write(base64.b64decode(s['url'].split(',')[1]))
    d, p, i = R['docx'], R['pptx'], R['img']
    print('docx', d['title'], len(d['pages']), d['sections'], d['warnings'], R['prog'])
    print('pptx', p['title'], len(p['pages']), p['sections'], p['warnings'])
    print('img', i['title'], i['pages'], 'files', R['before'], '->', R['after'], R['pdfErr'], R['bad'])
    assert len(d['pages']) >= 2 and all(abs(x['h'] - R['A4']) <= 1 and x['bg'] for x in d['pages'])
    sec = {s['title']: s for s in d['sections']}
    assert sec['Introduction']['page'] == 0 and sec['Next steps']['page'] == len(d['pages']) - 1 and sec['Quotes']['page'] == 0, sec
    assert sec['Background']['level'] == 2 and 'Kitchen renovation plan' not in sec
    for t in ('Kitchen renovation plan', 'Quotes', 'Cabinets', 'Book the contractor'): assert t in d['text'], t
    assert d['title']
    assert len(p['pages']) == 4 and all(abs(x['h'] - 562.5) <= 1 for x in p['pages'])
    assert [(s['title'], s['level'], s['page']) for s in p['sections']] == [
        ('Opening', 1, 0), ('Quarterly review', 2, 0), ('Highlights', 2, 1), ('Details', 1, 2), ('Floor plan', 2, 2), ('Numbers', 2, 3)], p['sections']
    assert 'Revenue up' in p['text'] and 'Cabinets' in p['text']
    assert len(i['pages']) == 1 and i['sections'] == [] and abs(i['pages'][0]['h'] - 500) <= 1
    assert R['after'] - R['before'] == len(d['pages']) + len(p['pages']) + 1, 'only page backgrounds are stored'
    for s in R['all']:
        assert s['type'] == 'image/jpeg' and s['w'] > 100
        if s['tag'] == 'docx': assert s['w'] == 1654 and abs(s['h'] - 1654 * R['A4'] / 1000) <= 2
        if s['tag'] == 'pptx': assert s['w'] == 2000 and abs(s['h'] - 1125) <= 2
    assert R['pdfErr'] == 'Use the PDF importer' and R['bad'], (R['pdfErr'], R['bad'])
    print('ok')
if __name__ == '__main__':
    run(steps, vp=(1180, 820), mob=False)
