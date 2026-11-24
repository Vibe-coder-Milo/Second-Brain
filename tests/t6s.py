"""24 Nov 2026 (sb-v29.5, v29.6): labels are all the same width; the brush copies
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
    print('after +:', J("document.querySelector('#fb-size')?.textContent")); assert J("document.querySelector('#fb-size')?.textContent") == '16'
    page.locator('.tb-done').click(); page.wait_for_timeout(600)

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
      document.addEventListener('click', (ev) => {{ if (touched && !touched.isConnected) {{ ev.stopImmediatePropagation(); ev.preventDefault(); }} }}, true); }})()""")
    page.locator('.popover [data-style=heading]').tap(); page.wait_for_timeout(400)
    blk = J(f"{ED}.getJSON().content.find(b => (b.content || []).some(t => (t.text || '').includes('Heading by slash')))"); print('after one tap:', blk)
    assert blk['type'] == 'heading' and blk['attrs']['level'] == 2 and blk['content'][0]['text'] == 'Heading by slash', 'one tap is enough'
    assert not page.locator('.popover').count()

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
