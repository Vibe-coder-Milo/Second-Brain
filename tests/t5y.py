"""Sharp PDFs. An imported PDF is kept as it came (encrypted) and each page
points at it; the page on screen is drawn from the PDF at the size it's shown,
so zoomed-in text is crisp (sharper than the page's small picture); exported
PDFs keep the original pages (real text, not pictures); the kept PDF goes only
when its last page does."""
from dbg import *
import sys, base64
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const L = await import('./vendor/pdf-lib.esm.min.js'); const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
      for (let i = 0; i < 3; i++) { const pg = doc.addPage([595, 842]); pg.drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 30, font }); for (let k = 0; k < 40; k++) pg.drawText('Revenue grew eight percent; costs held flat across all the teams. ' + k, { x: 60, y: 700 - k * 15, size: 7, font }); }
      window.__pdf = new File([await doc.save()], 'small print.pdf', { type: 'application/pdf' });
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Small print', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas.ink-main')
    J("import('./js/handoff.js').then(H => H.handOff(window.__pdf))")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=120000)
    page.wait_for_timeout(800)
    # 1. The PDF is kept once; every page points at its page there; pictures are small.
    info = J(f"""(async () => {{ const V = await import('./js/vault.js'); const D = await import('./js/editor/inkdraw.js'); const n = V.state.notes.get('{nid}');
      const ps = n.pages.filter(p => p.pdf); const f = ps.length ? await V.fileBytes(ps[0].pdf.file) : null; const img = ps.length ? await D.fileImageReady(ps[0].bg) : null;
      return {{ pages: n.pages.length, withPdf: ps.length, files: [...new Set(ps.map(p => p.pdf.file))].length, ns: ps.map(p => p.pdf.n), type: f && f.type, head: f && String.fromCharCode(...f.bytes.slice(0, 5)), picW: img && img.width }}; }})()""")
    print('kept:', info)
    assert info['withPdf'] == 3 and info['files'] == 1 and info['ns'] == [1, 2, 3] and info['type'] == 'application/pdf' and info['head'] == '%PDF-'
    assert info['picW'] and info['picW'] <= 1300, 'the page picture is small'
    # Go to the first PDF page (one at a time keeps it simple), zoom to 3x.
    page.locator('[data-act=pages]').click(); page.wait_for_selector('[data-how=next]'); page.locator('[data-how=next]').click(); page.wait_for_timeout(700)
    if page.locator('.sheet').count(): page.keyboard.press('Escape'); page.wait_for_timeout(300)
    first = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').pages.findIndex(p => p.pdf))")
    for _ in range(4):
        cur = int(page.locator('#iv-sub').inner_text().split('page ')[1].split(' of')[0]) - 1
        if cur == first: break
        page.keyboard.press('PageDown' if cur < first else 'PageUp'); page.wait_for_timeout(500)
    J("""(() => { const sc = document.querySelector('.ink-scroll'); for (let i = 0; i < 14; i++) sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })); })()""")
    page.wait_for_timeout(300)
    # Show the small print near the top left.
    J("(() => { const sc = document.querySelector('.ink-scroll'); const pg = document.querySelector('.ink-page'); sc.scrollLeft = 0; sc.scrollTop = pg.offsetTop + pg.offsetHeight * 0.12; })()")
    page.wait_for_function("import('./js/pdfview.js').then(P => P.keptTileCount() > 0)", timeout=20000)
    page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/y-zoomed-{tag}.png')
    # 2. Crisp: the page's background canvas against the same window drawn from the small picture.
    cmp = J(f"""(async () => {{ const V = await import('./js/vault.js'); const D = await import('./js/editor/inkdraw.js'); const n = V.state.notes.get('{nid}'); const p = n.pages[{first}];
      const bg = document.querySelector('.ink-page canvas.ink-bg'); const W = bg.width, H = bg.height;
      const x = parseFloat(bg.style.left), y = parseFloat(bg.style.top), cssW = parseFloat(bg.style.width); const k = W / cssW;
      const pageCss = document.querySelector('.ink-page').getBoundingClientRect().width; const s = pageCss / 1000;
      const soft = document.createElement('canvas'); soft.width = W; soft.height = H; const c = soft.getContext('2d');
      c.setTransform(s * k, 0, 0, s * k, -x * k, -y * k); D.drawPaper(c, p, s * k, await D.fileImageReady(p.bg));
      // Crispness: how sharply light turns to dark (mean jump between neighbours, over the inked pixels).
      const crisp = (cv) => {{ const d = cv.getContext('2d').getImageData(0, 0, W, H).data; let sum = 0, cnt = 0;
        for (let yy = 0; yy < H; yy += 2) for (let xx = 1; xx < W; xx++) {{ const i = (yy * W + xx) * 4; const a = d[i], b = d[i - 4]; if (Math.min(a, b) < 200) {{ sum += Math.abs(a - b); cnt++; }} }}
        return {{ crisp: cnt ? sum / cnt : 0, inked: cnt }}; }};
      return {{ zoom: Math.round(pageCss / document.querySelector('.ink-scroll').clientWidth * 10) / 10, sharp: crisp(bg), soft: crisp(soft), size: [W, H] }}; }})()""")
    print('crispness, page drawn now vs from the picture:', cmp)
    assert cmp['sharp']['inked'] > 1000, 'small print is on screen'
    assert cmp['sharp']['crisp'] > cmp['soft']['crisp'] * 1.25, 'zoomed-in text is crisper than the picture'
    # 3. Export as PDF: the original pages go in (their text can still be found in the file).
    with page.expect_download(timeout=60000) as dl:
        J(f"Promise.all([import('./js/vault.js'), import('./js/export.js')]).then(([V, E]) => E.exportNotePdf(V.state.notes.get('{nid}')))")
    data = open(dl.value.path(), 'rb').read()
    found = J("""async (b64) => { const P = await import('./js/pdf.js'); const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const { doc } = await P.openPdf(bytes);
      const out = []; for (let i = 1; i <= doc.numPages; i++) { const t = await (await doc.getPage(i)).getTextContent(); out.push(t.items.map(x => x.str).join(' ').includes('Revenue grew')); } return { pages: doc.numPages, text: out }; }""", base64.b64encode(data).decode())
    print('exported pdf:', len(data), 'bytes', found)
    assert found['pages'] == info['pages'] and found['text'].count(True) == 3, 'exported PDF pages keep their text'
    # 4. Delete a PDF page: the PDF stays (two pages still use it). Delete the note: it goes.
    pdf_file = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').pages[{first}].pdf.file)")
    J(f"""(async () => {{ const V = await import('./js/vault.js'); const n = V.state.notes.get('{nid}'); const p = n.pages[{first}];
      const pages = n.pages.filter(x => x.id !== p.id); await V.deleteFile(p.bg); if (!V.pdfInUse(p.pdf.file, {{ page: p.id }}) && !pages.some(x => x.pdf?.file === p.pdf.file)) await V.deleteFile(p.pdf.file); await V.saveNote({{ ...n, pages }}); }})()""")
    still = J(f"import('./js/vault.js').then(async V => !!(await V.fileBytes('{pdf_file}')))")
    J(f"import('./js/vault.js').then(V => V.deleteNote('{nid}'))")
    gone = J(f"import('./js/vault.js').then(async V => !(await V.fileBytes('{pdf_file}')))")
    print('after deleting a page the PDF is kept:', still, '| after deleting the note it is gone:', gone)
    assert still and gone
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
