"""Moving text boxes and pasting pictures. (1) With the text tool, dragging a
text box on a handwritten page moves it (no switching tools), a tap still
opens it; while typing in one, its grip moves it and that is saved (so is a
width change alone), and undo puts it back. (2) A copied screenshot pasted
with Ctrl/Cmd+V lands in the note: in a typed note while typing (at the
cursor) or just reading (at the end), in Today's note, on a handwritten page
and on a whiteboard, never opening Capture; "Paste a picture" in the menus
reads the clipboard."""
from dbg import *
import sys
OUT = 'shots5'
PNG = """async (w) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 0.6); const x = c.getContext('2d');
  x.fillStyle = '#3A7CA5'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#FFF'; x.font = '40px sans-serif'; x.fillText('Screenshot', 20, 60);
  const b = await new Promise(r => c.toBlob(r, 'image/png')); return b; }"""
PASTE = """async ([sel, w]) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 0.6); const x = c.getContext('2d');
  x.fillStyle = '#3A7CA5'; x.fillRect(0, 0, c.width, c.height);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'Screenshot.png', { type: 'image/png' }));
  const t = sel ? document.querySelector(sel) : document.body;
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  t.dispatchEvent(ev); return ev.defaultPrevented; }"""
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    capture_open = lambda: J("!!document.querySelector('.overlay')")
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const p = M.newPage({});
      const ink = await V.saveNote(M.newNote({ kind: 'ink', title: 'Boxes', titleAuto: false, region: 'career', inbox: false, pages: [p] }));
      await V.savePage(p.id, { v: 1, strokes: [], tomb: [], at: 0, objects: [{ id: 'o_tb', type: 'text', x: 100, y: 200, w: 300, h: 40, size: 24, t: Date.now(), at: Date.now(), doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Move me' }] }] } }] });
      const typed = await V.saveNote(M.newNote({ kind: 'note', title: 'Paste here', titleAuto: false, region: 'career', inbox: false, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First line.' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Last line.' }] }] } }));
      const board = await V.saveNote(M.newNote({ kind: 'board', title: 'Board', titleAuto: false, region: 'career', inbox: false }));
      return { ink: ink.id, page: p.id, typed: typed.id, board: board.id }; })()""")
    box = lambda: J(f"""import('./js/vault.js').then(async V => {{ V.forgetPageCache?.(); const d = await V.loadPage('{ids['page']}'); const o = d.objects.find(o => o.id === 'o_tb' || o.type === 'text'); return o && {{ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w) }}; }})""")

    # (1) Text boxes.
    page.goto(BASE + f"#/note/{ids['ink']}"); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(700)
    page.locator('#iv-tools [data-tool=text]').click(); page.wait_for_timeout(150)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    s = r[2] / 1000
    at = lambda ux, uy: (r[0] + ux * s, r[1] + uy * s)
    # Drag the box by its words, with the text tool still on.
    x0, y0 = at(150, 215); x1, y1 = at(450, 515)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=5); page.mouse.move(x1, y1, steps=5); page.mouse.up()
    page.wait_for_timeout(900)
    b1 = box(); print('after dragging with the text tool:', b1)
    assert abs(b1['x'] - 400) < 4 and abs(b1['y'] - 500) < 4, 'the box moved by the drag'
    assert J("document.querySelector('#iv-tools [data-tool=text]').getAttribute('aria-pressed')") == 'true', 'still on the text tool'
    assert not J("!!document.querySelector('.tb-draft')") and J("!document.querySelector('.tb-edit')"), 'no new box drawn, none opened'
    n_text = J(f"import('./js/vault.js').then(async V => (await V.loadPage('{ids['page']}')).objects.filter(o => o.type === 'text').length)")
    assert n_text == 1, 'no extra box made'
    # A tap on it still opens it for typing.
    page.mouse.click(*at(450, 515)); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    assert J("document.querySelector('.tb-edit .ProseMirror').textContent") == 'Move me'
    # While typing: the grip moves it; the width handle widens it. Saved on Done without changing the words.
    g = J("(() => { const b = document.querySelector('.tb-move').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    page.mouse.move(*g); page.mouse.down(); page.mouse.move(g[0] - 100 * s, g[1] + 100 * s, steps=6); page.mouse.up(); page.wait_for_timeout(200)
    wd = J("(() => { const b = document.querySelector('.tb-width').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    page.mouse.move(*wd); page.mouse.down(); page.mouse.move(wd[0] + 100 * s, wd[1], steps=6); page.mouse.up(); page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/i-grip-{tag}.png')
    page.locator('.tb-done').click(); page.wait_for_timeout(900)
    b2 = box(); print('after the grip and width handle:', b2)
    assert abs(b2['x'] - 300) < 4 and abs(b2['y'] - 600) < 4 and abs(b2['w'] - 400) < 4, 'moved and widened, and saved'
    # Undo puts it back where it was before the grip.
    page.locator('button[aria-label=Undo]:visible').first.click(); page.wait_for_timeout(900)
    b3 = box(); print('after undo:', b3)
    assert abs(b3['x'] - 400) < 4 and abs(b3['y'] - 500) < 4 and abs(b3['w'] - 300) < 4, 'undo goes back'

    # (2) Pasting pictures. On the handwritten page (nothing focused):
    before = J(f"import('./js/vault.js').then(async V => (await V.loadPage('{ids['page']}')).objects.filter(o => o.type === 'image').length)")
    assert J(PASTE, [None, 400]), 'the page took the paste'
    page.wait_for_timeout(1200)
    imgs = J(f"import('./js/vault.js').then(async V => {{ V.forgetPageCache?.(); return (await V.loadPage('{ids['page']}')).objects.filter(o => o.type === 'image').length; }})")
    print('handwritten page images:', before, '->', imgs); assert imgs == before + 1 and not capture_open()
    page.screenshot(path=f'{OUT}/i-ink-paste-{tag}.png')

    # Typed note, just reading: it goes at the end, and editing starts.
    page.goto(BASE + f"#/note/{ids['typed']}"); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(500)
    assert J(PASTE, [None, 500]), 'the note took the paste'
    page.wait_for_selector('#n-rich figure.rich-image img[src]', timeout=8000); page.wait_for_timeout(1200)
    doc = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['typed']}').doc.content.map(b => b.type))")
    print('typed note after paste while reading:', doc)
    assert doc[-1] == 'imageFile' or doc[-2] == 'imageFile', 'at the end'
    assert not capture_open(), 'Capture did not open'
    # While typing: at the cursor (after the first line).
    J("""(() => { const p = document.querySelector('#n-rich .rich p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.querySelector('#n-rich .rich').focus(); })()""")
    page.locator('#n-rich .rich p').first.click(); page.keyboard.press('End'); page.wait_for_timeout(200)
    assert J(PASTE, ['#n-rich .rich', 300])
    page.wait_for_timeout(1500)
    doc = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['typed']}').doc.content.map(b => b.type))")
    print('typed note after paste while typing:', doc)
    assert doc.count('imageFile') == 2 and doc[1] == 'imageFile', 'the second one at the cursor'
    files = J(f"import('./js/db.js').then(async D => (await D.files.all()).length)")
    assert files >= 3 and not capture_open()
    page.screenshot(path=f'{OUT}/i-typed-paste-{tag}.png')
    # "Paste a picture" from Insert reads the clipboard.
    J("""async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 120; c.getContext('2d').fillRect(0, 0, 200, 120);
      const b = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); }""")
    page.locator('[data-act=insert]').first.click(); page.wait_for_timeout(300)
    FIDS = f"import('./js/vault.js').then(V => V.state.notes.get('{ids['typed']}').doc.content.filter(b => b.type === 'imageFile').map(b => b.attrs.fileId.slice(-6)))"
    before_ids = J(FIDS)
    page.locator('[data-ins="paste-image"]').click(); page.wait_for_timeout(1500)
    assert set(before_ids) < set(J(FIDS)), 'added, nothing replaced'
    doc = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['typed']}').doc.content.map(b => b.type))")
    print('after Paste a picture:', doc); assert doc.count('imageFile') == 3

    # Today's note, while typing.
    page.goto(BASE + '#/today'); page.wait_for_selector('#t-rich .rich'); page.wait_for_timeout(500)
    page.locator('#t-rich .rich').click(); page.keyboard.type('Today '); page.wait_for_timeout(200)
    assert J(PASTE, ['#t-rich .rich', 300]); page.wait_for_timeout(1800)
    tdoc = J("import('./js/notework.js').then(N => { const n = N.dailyNote(N.isoToday()); return n && n.doc.content.map(b => b.type); })")
    print("today's note:", tdoc); assert tdoc and 'imageFile' in tdoc and not capture_open()

    # Whiteboard (nothing focused).
    page.goto(BASE + f"#/note/{ids['board']}"); page.wait_for_selector('.bd'); page.wait_for_timeout(700)
    page.mouse.click(page.viewport_size['width'] / 2, page.viewport_size['height'] / 2); page.wait_for_timeout(200)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    took = J(PASTE, [None, 300]); page.wait_for_timeout(4000)
    bimgs = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{ids['board']}'); if (!n.pages?.[0]) return 0; V.forgetPageCache?.(); return ((await V.loadPage(n.pages[0].id)).objects || []).filter(o => o.type === 'image').length; }})")
    print('whiteboard images:', bimgs); assert bimgs == 1 and not capture_open()
    page.screenshot(path=f'{OUT}/i-board-paste-{tag}.png')

    # Elsewhere (Today's page, nothing focused), a pasted picture still opens Capture as before.
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(500)
    J(PASTE, [None, 300]); page.wait_for_timeout(800)
    print('elsewhere opens Capture:', capture_open()); assert capture_open()
    print('ok', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
