"""24 to 25 Nov 2026 (sb-v29.5 to v29.7): labels are all the same width; the brush copies
formatting; one tap picks from the "/" menu even when the editor updates
under the finger (the iPad hides its keyboard on that tap); Settings gives
Title, Heading and Subheading their own size and colour (new notes only, on
screen and in PDF export); and settings changed on two devices before a sync
are merged setting by setting (a default text size chosen on one device was
lost when the other device had also changed a setting)."""
from dbg import *
import sys
OUT = 'shots5'

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    style = lambda sel: J("""(sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), color: c.color }; }""", sel)

    # ---- 1. Labels: one width for all, short and long names alike.
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const c = []; for (const l of V.state.config.labels) { c.push({ type: 'labelChip', attrs: { label: l.id } }); c.push({ type: 'text', text: ' ' }); }
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Labels', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [{ type: 'paragraph', content: c }] } }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.label-chip svg'); page.wait_for_timeout(400)
    ws = J("[...document.querySelectorAll('#n-rich .label-chip svg')].map(s => s.getBoundingClientRect().width)")
    print('label widths:', ws)
    assert len(ws) == 8 and max(ws) - min(ws) < 0.5, 'every label is the same width'
    # A long name: still the same width as the others, letters shrink and fit.
    fit = J("""import('./js/stickers.js').then(S => { const a = S.labelDef({ name: 'Idea' }); const b = S.labelDef({ name: 'Very long label name here' });
      const t = S.labelText('Very long label name here', 92); return [a.w === b.w, t.fs < 12.5, t.fs >= 9]; })""")
    assert fit == [True, True, True], fit
    page.locator('#n-rich').screenshot(path=f'{OUT}/s-labels-{tag}.png')
    # A label stuck on a handwritten page before keeps its own shape (drawn from its own size).
    J("""import('./js/editor/inkdraw.js').then(D => { const c = document.createElement('canvas'); c.width = 300; c.height = 80; D.drawLabelTag(c.getContext('2d'), { name: 'Idea', color: '#8C67B0' }, { x: 0, y: 0, w: 78, h: 46 }); })""")

    # Same letter size for every label (v29.8).
    fss = J("""Promise.all([import('./js/stickers.js'), import('./js/vault.js')]).then(([S, V]) => { const W0 = Number(S.labelDef(V.state.config.labels[0]).vb.split(' ')[2]); return V.state.config.labels.map(l => S.labelText(l.name, W0).fs); })""")
    print('label letter sizes:', fss); assert len(set(fss)) == 1
    # Labels stuck on a page before (each as wide as its name) now draw at the shared width (v29.8).
    widths = J("""(async () => { const V = await import('./js/vault.js'); const D = await import('./js/editor/inkdraw.js');
      const page = { id: 'p_test', paper: 'blank', color: 'white', h: 400 };
      const data = { strokes: [], objects: [
        { id: 'o1', type: 'label', label: 'idea', x: 100, y: 60, w: 78, h: 46 },
        { id: 'o2', type: 'label', label: 'important', x: 100, y: 200, w: 117, h: 46 }], tomb: [] };
      const c = await D.renderPageCanvas(page, data, 1000); const x = c.getContext('2d');
      const run = (y) => { const d = x.getImageData(0, y, 1000, 1).data; let first = -1, last = -1;
        for (let i = 0; i < 1000; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) > 40) { if (first < 0) first = i; last = i; } } return last - first; };
      return [run(60 + 30), run(200 + 30)]; })()""")
    print('older page labels drawn:', widths); assert abs(widths[0] - widths[1]) <= 2, 'older labels on a page are one width too'

    # ---- 2. Settings: Title, Heading and Subheading sizes and colours.
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
    page.locator('#s-text-h').scroll_into_view_if_needed()
    page.locator('[data-text-size="14"]').click(); page.wait_for_timeout(300)
    assert 'Usual (25)' in J("document.querySelector('[data-head-size=\"1\"]').textContent"), 'usual title size follows the body (14 x 1.78)'
    page.select_option('[data-head-size="1"]', '32'); page.wait_for_timeout(300)
    page.select_option('[data-head-size="2"]', '22'); page.wait_for_timeout(300)
    page.locator('[data-head-colour="1"]').click(); page.wait_for_selector('.popover [data-hc]')
    page.locator('.popover [data-hc="#9B2C2C"]').click(); page.wait_for_timeout(300)
    page.locator('[data-head-colour="3"]').click(); page.wait_for_selector('.popover [data-hc]')
    page.locator('.popover [data-hc="#2F6B4F"]').click(); page.wait_for_timeout(300)
    cfg = J("import('./js/vault.js').then(V => V.state.config.text)"); print('saved:', cfg)
    assert cfg['size'] == 14 and cfg['h1Size'] == 32 and cfg['h2Size'] == 22 and cfg['h3Size'] is None
    assert cfg['h1Color'] == '#9B2C2C' and cfg['h3Color'] == '#2F6B4F' and cfg['h2Color'] is None
    sample = [style('#s-text-sample h1'), style('#s-text-sample h2'), style('#s-text-sample p')]
    print('sample:', sample)
    assert abs(sample[0]['size'] - 32) < 0.5 and sample[0]['color'] == 'rgb(155, 44, 44)' and abs(sample[1]['size'] - 22) < 0.5 and abs(sample[2]['size'] - 14) < 0.5
    page.locator('#s-text').screenshot(path=f'{OUT}/s-settings-{tag}.png')
    # The note made before keeps its usual headings.
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(300)
    assert abs(style('#n-rich .rich p')['size'] - 18) < 0.5, 'an older note keeps 18'
    # A new note uses them: body 14, title 32 red, heading 22, subheading usual size (0.89 x 14) in green.
    nid2 = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Heads', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Big title' }] }, { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A heading' }] },
          { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'A subheading' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Body words here, and more body words.' }] }] } }))).id; })()""")
    page.goto(BASE + f'#/note/{nid2}'); page.wait_for_selector('#n-rich .rich h1'); page.wait_for_timeout(300)
    h1, h2, h3, p = style('#n-rich .rich h1'), style('#n-rich .rich h2'), style('#n-rich .rich h3'), style('#n-rich .rich p')
    print('new note:', h1, h2, h3, p)
    assert abs(h1['size'] - 32) < 0.5 and h1['color'] == 'rgb(155, 44, 44)'
    assert abs(h2['size'] - 22) < 0.5 and h2['color'] == p['color']
    assert abs(h3['size'] - 14 * 0.89) < 0.5 and h3['color'] == 'rgb(47, 107, 79)'
    assert abs(p['size'] - 14) < 0.5
    assert J("document.querySelector('#fb-size')?.textContent") in (None, '14'), 'the toolbar shows the note size'
    page.screenshot(path=f'{OUT}/s-note-{tag}.png')
    # Dark mode: the chosen colours are brightened.
    J("import('./js/theme.js').then(T => T.applyTheme('dark'))"); page.wait_for_timeout(250)
    d1 = style('#n-rich .rich h1'); print('dark title:', d1['color']); assert d1['color'] not in ('rgb(155, 44, 44)',)
    J("import('./js/theme.js').then(T => T.applyTheme('light'))"); page.wait_for_timeout(200)
    # PDF export: the title is drawn in the deep red.
    with page.expect_download(timeout=60000) as dl:
        J(f"Promise.all([import('./js/vault.js'), import('./js/export.js')]).then(([V, E]) => E.exportNotePdf(V.state.notes.get('{nid2}')))")
    data = open(dl.value.path(), 'rb').read()
    red = J("""async (b64) => { const P = await import('./js/pdf.js'); const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const { doc } = await P.openPdf(bytes);
      const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 1.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i] - d[i + 1] > 70 && d[i] - d[i + 2] > 70) n++; return n; }""", __import__('base64').b64encode(data).decode())
    print('red pixels in the PDF:', red); assert red > 200, 'the exported title uses its colour'

    # ---- 2b. A text box on a handwritten page shows the default size (14), not 18 (v29.6).
    iid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Box', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{iid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(600)
    page.locator('#iv-tools [data-tool=text]').click(); page.wait_for_timeout(150)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    page.mouse.click(r[0] + r[2] * 0.2, r[1] + 120); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    page.keyboard.type('Box words'); page.wait_for_timeout(200)
    shown = J("document.querySelector('#fb-size')?.textContent"); print('text box size shown:', shown)
    assert shown == '14', 'the text box toolbar shows the default size'
    page.keyboard.press('Shift+Home'); page.wait_for_timeout(100)
    page.locator('[data-act=larger]').click(); page.wait_for_timeout(200)
    print('after +:', J("document.querySelector('#fb-size')?.textContent")); assert J("document.querySelector('#fb-size')?.textContent") == '15', '+ goes up by 1 (v29.7)'
    page.locator('[data-act=smaller]').click(); page.locator('[data-act=smaller]').click(); page.wait_for_timeout(200)
    assert J("document.querySelector('#fb-size')?.textContent") == '13', '− goes down by 1'
    page.locator('#iv-tools [data-act=bold]').click(); page.wait_for_timeout(100)
    page.locator('.tb-done').click(); page.wait_for_timeout(600)
    # The brush carries from one text box to another (v29.7): tap the brush in a
    # box, then tap another box; the whole box takes the look.
    page.mouse.click(r[0] + r[2] * 0.2, r[1] + 420); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    page.keyboard.type('Plain box'); page.locator('.tb-done').click(); page.wait_for_timeout(600)
    # Tap the middle of each box where it is on the page (boxes are small on a phone).
    def box_at(word):
        o = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{iid}'); const d = await V.loadPage(n.pages[0].id); const o = d.objects.find(o => o.type === 'text' && JSON.stringify(o.doc).includes('{word}')); return [o.x, o.y, o.w, o.size || 20]; }})")
        k = r[2] / 1000
        rr = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top]; })()")
        return rr[0] + (o[0] + min(o[2], 120) / 2) * k, rr[1] + (o[1] + o[3] * 0.7) * k
    page.mouse.click(*box_at('Box words')); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    assert 'Box words' in J("document.querySelector('.tb-edit .ProseMirror').textContent")
    page.locator('[data-act=paint]').click(); page.wait_for_timeout(100)
    page.mouse.click(*box_at('Plain box')); page.wait_for_timeout(600)
    assert 'Plain box' in J("document.querySelector('.tb-edit .ProseMirror')?.textContent || ''"), 'the other box opened'
    page.locator('.tb-done').click(); page.wait_for_timeout(900)
    boxes = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{iid}'); const d = await V.loadPage(n.pages[0].id); return d.objects.filter(o => o.type === 'text').map(o => [JSON.stringify(o.doc).includes('Plain') ? 'plain' : 'styled', (JSON.stringify(o.doc).match(/\"type\":\"(bold|textStyle)\"/g) || []).sort(), JSON.stringify(o.doc).match(/fontSize\":\"([0-9.]+)px/)?.[1] || null]); }})")
    print('boxes after the brush:', boxes)
    plain = [b for b in boxes if b[0] == 'plain'][0]; styled = [b for b in boxes if b[0] == 'styled'][0]
    assert any('bold' in x for x in plain[1]) and plain[2] == styled[2], 'the second box took the bold and the size'
    assert J("document.querySelector('[data-act=paint]')?.getAttribute('aria-pressed') || 'false'") == 'false', 'one use, then put down'

    # ---- 3. The brush: copy bold red 20 px onto other words.
    nid3 = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Brush', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Source', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#C4554D', fontSize: '20px' } }] }, { type: 'text', text: ' plain words' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Target words', marks: [{ type: 'italic' }] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Make me a title' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title look' }] }] } }))).id; })()""")
    page.goto(BASE + f'#/note/{nid3}'); page.wait_for_selector('#n-rich .ProseMirror'); page.wait_for_timeout(300)
    page.locator('#n-rich .rich p').first.click(); page.wait_for_timeout(300)
    ED = "document.querySelector('#n-rich .ProseMirror').editor"
    sel = lambda a, b: J(f"{ED}.chain().setTextSelection({{ from: {a}, to: {b} }}).run()")
    # Positions: paragraph 1 starts at 1 ("Source" = 1..7); paragraph 2 at 21 ("Target words" 21..33).
    sel(2, 5); page.wait_for_timeout(100)
    page.locator('[data-act=paint]').click(); page.wait_for_timeout(100)
    assert J("document.querySelector('[data-act=paint]').getAttribute('aria-pressed')") == 'true'
    box = page.locator('#n-rich .rich p').nth(1).bounding_box()
    page.mouse.move(box['x'] + 2, box['y'] + box['height'] / 2); page.mouse.down(); page.mouse.move(box['x'] + 60, box['y'] + box['height'] / 2, steps=4)
    sel(21, 33); page.mouse.up(); page.wait_for_timeout(400)
    marks = J(f"{ED}.getJSON().content[1].content.map(t => [t.text, (t.marks || []).map(m => m.type + (m.attrs?.color ? ':' + m.attrs.color + ':' + m.attrs.fontSize : '')).sort()])")
    print('after the brush:', marks)
    assert marks == [['Target words', ['bold', 'textStyle:#C4554D:20px']]], 'the words took the look (and lost italic)'
    assert J("document.querySelector('[data-act=paint]').getAttribute('aria-pressed')") == 'false', 'one use, then the brush is put down'
    # Whole line picked up: its style (Title) goes to a line selected whole; double-tap keeps it on.
    J(f"(() => {{ const e = {ED}; let p = 0; e.state.doc.forEach((n, off) => {{ if (n.textContent === 'Title look') p = off; }}); e.chain().setTextSelection({{ from: p + 1, to: p + 11 }}).run(); }})()")
    page.locator('[data-act=paint]').click(); page.locator('[data-act=paint]').click(); page.wait_for_timeout(100)
    assert J("document.querySelector('[data-act=paint]').classList.contains('locked')"), 'double-tap keeps the brush on'
    J(f"(() => {{ const e = {ED}; let p = 0; e.state.doc.forEach((n, off) => {{ if (n.textContent === 'Make me a title') p = off; }}); e.chain().setTextSelection({{ from: p + 1, to: p + 16 }}).run(); }})()")
    page.wait_for_timeout(1100)
    lv = J(f"{ED}.getJSON().content.find(b => b.content?.[0]?.text === 'Make me a title').attrs.level"); print('heading level after the brush:', lv)
    assert lv == 1
    assert J("document.querySelector('[data-act=paint]').getAttribute('aria-pressed')") == 'true', 'still on'
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    assert J("document.querySelector('[data-act=paint]').getAttribute('aria-pressed')") == 'false'

    # ---- 4. "/" menu: one tap chooses, even when the editor updates as the finger lands.
    J(f"{ED}.chain().focus('end').run()"); page.keyboard.press('Enter'); page.keyboard.type('Heading by slash'); page.keyboard.press('Home')
    page.keyboard.type('/'); page.wait_for_selector('.popover .style-menu [data-style=heading]')
    # What the iPad does on that tap: the keyboard goes, the editor updates.
    # Like iPad Safari: a click is dropped when the button touched has been redrawn since the finger landed.
    J(f"""(() => {{ let touched = null; const pop = document.querySelector('.popover');
      pop.addEventListener('pointerdown', (ev) => {{ touched = ev.target.closest('button'); const e = {ED}; e.view.dispatch(e.state.tr.setMeta('poke', 1)); }}, true);
      document.addEventListener('click', (ev) => {{ const t = touched; touched = null; if (t && !t.isConnected) {{ ev.stopImmediatePropagation(); ev.preventDefault(); }} }}, true); }})()""")
    page.locator('.popover [data-style=heading]').tap(); page.wait_for_timeout(400)
    blk = J(f"{ED}.getJSON().content.find(b => (b.content || []).some(t => (t.text || '').includes('Heading by slash')))"); print('after one tap:', blk)
    assert blk['type'] == 'heading' and blk['attrs']['level'] == 2 and blk['content'][0]['text'] == 'Heading by slash', 'one tap is enough'
    assert not page.locator('.popover').count()

    # ---- 4b. The brush on Today's note (v29.7).
    page.goto(BASE + '#/today'); page.wait_for_selector('#t-rich .ProseMirror'); page.wait_for_timeout(400)
    TD = "document.querySelector('#t-rich .ProseMirror').editor"
    page.locator('#t-rich .ProseMirror').click(); page.wait_for_timeout(300)
    page.keyboard.type('Alpha beta'); page.wait_for_timeout(200)
    page.keyboard.press('Home'); page.keyboard.press('Shift+Control+ArrowRight'); page.wait_for_timeout(100)
    page.locator('#t-bar [data-act=bold]').click(); page.wait_for_timeout(100)
    page.locator('#t-bar [data-act=paint]').click(); page.wait_for_timeout(100)
    assert J("document.querySelector('#t-bar [data-act=paint]').getAttribute('aria-pressed')") == 'true'
    page.keyboard.press('End'); page.keyboard.press('Shift+Control+ArrowLeft')
    page.wait_for_timeout(1100)
    tb = J(f"{TD}.getJSON().content.flatMap(b => b.content || []).filter(t => t.text).map(t => [t.text, (t.marks || []).map(m => m.type)])"); print('today after the brush:', tb)
    assert ['beta', ['bold']] in tb, 'Today has the brush'

    # ---- 4c. The brush on a whiteboard: bold big red text onto other text, a sticky's colour onto a sticky (v29.7).
    nbid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); return (await V.saveNotebook(M.newNotebook({ title: 'Boards', region: 'career' }))).id; })()""")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_timeout(500)
    page.locator('.nb-new [data-newnote=board]').click(); page.wait_for_selector('.bd-stage'); page.wait_for_timeout(500)
    st = page.locator('#bd-stage').bounding_box()
    def place(tool, fx, fy, words):
        page.locator(f'button[data-tool={tool}]').click(); page.mouse.click(st['x'] + st['width'] * fx, st['y'] + st['height'] * fy)
        page.wait_for_selector(f'.bo-{tool} .bt[contenteditable]'); page.keyboard.type(words); page.keyboard.press('Escape'); page.wait_for_timeout(250)
    place('text', 0.2, 0.25, 'Source words'); place('text', 0.2, 0.6, 'Target words')
    place('sticky', 0.6, 0.25, 'Pink one'); place('sticky', 0.6, 0.6, 'Plain one')
    page.locator('button[data-tool=select]').click(); page.wait_for_timeout(100)
    def tap(sel_, i):
        b = page.locator(sel_).nth(i).bounding_box(); page.mouse.click(b['x'] + 8, b['y'] + b['height'] / 2); page.wait_for_timeout(200)
    tap('.bo-text', 0)
    page.locator('[data-sb=bold]').click(); page.wait_for_timeout(100)
    page.locator('[data-sbcol]').nth(2).click(); page.wait_for_timeout(100)
    page.locator('[data-sb=tsize]').click(); page.wait_for_timeout(100)
    src = J("(() => { const e = document.querySelectorAll('.bo-text')[0]; const c = getComputedStyle(e.querySelector('.bt')); return [c.fontWeight, getComputedStyle(e).color, c.fontSize]; })()")
    page.locator('[data-sb=brush]').click(); page.wait_for_timeout(100)
    assert J("document.querySelector('[data-sb=brush]').getAttribute('aria-pressed')") == 'true'
    tap('.bo-text', 1)
    dst = J("(() => { const e = document.querySelectorAll('.bo-text')[1]; const c = getComputedStyle(e.querySelector('.bt')); return [c.fontWeight, getComputedStyle(e).color, c.fontSize]; })()")
    print('whiteboard text:', src, dst); assert src == dst, 'the other text took the look'
    page.screenshot(path=f'{OUT}/s-board-{tag}.png')
    tap('.bo-sticky', 0)
    page.locator('.selbar [data-sbcol], [data-sbcol]').nth(1).click(); page.wait_for_timeout(100)
    page.locator('[data-sb=brush]').click(); page.wait_for_timeout(100)
    tap('.bo-sticky', 1)
    bgs = J("[...document.querySelectorAll('.bo-sticky')].map(e => getComputedStyle(e).backgroundColor)"); print('stickies:', bgs)
    assert bgs[0] == bgs[1], 'the other sticky took the colour'

    # ---- 5. Settings changed on two devices: merged setting by setting.
    out = J("""import('./js/model.js').then(M => {
      const mine = { text: { size: 18 }, favColors: ['#111111'], stamps: { favColors: 2000 }, updatedAt: 2000 };
      const theirs = { text: { size: 14 }, favColors: null, stamps: { text: 1500 }, updatedAt: 1500 };
      const m = M.mergeConfig(mine, theirs);
      const old = M.mergeConfig({ text: { size: 18 }, updatedAt: 10 }, { text: { size: 14 }, updatedAt: 20 });
      return [m.text.size, m.favColors, m.stamps, old.text.size]; })""")
    print('merged:', out)
    assert out == [14, ['#111111'], {'text': 1500, 'favColors': 2000}, 14]
    stamped = J("import('./js/vault.js').then(V => Object.keys(V.state.config.stamps || {}))")
    assert 'text' in stamped and 'textPast' in stamped, 'Settings stamps the default text'
    print('OK')

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
