"""Pages in typed notes (12 Nov): a typed note shows as one endless page (as
before, the default), or as A4 pages one under another (Scroll down) or one
at a time (Next page), chosen per note from the Pages button (iPad) or
Pages and layout in the ... menu (phone). Text flows onto the next page by
itself, Add page here (Pages panel, or Insert > New page) starts a new page
at the cursor, Contents and its Pages list jump to the right page, PDF export
has the same number of pages, Today's note has no pages, and laying out a
long note after a keystroke is quick."""
from dbg import *
import sys, re
OUT = 'shots5'

LONG = """(n) => {
  const words = 'the quick brown fox jumps over a lazy dog while seven bright owls watch from the old oak tree near the river'.split(' ');
  const para = (k, len) => ({ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: len }, (_, i) => words[(i * 7 + k) % words.length]).join(' ') + '.' }] });
  const content = [];
  for (let s = 0; s < n; s++) {
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${s + 1}` }] });
    for (let p = 0; p < 4; p++) content.push(para(s * 4 + p, 28 + ((s + p) % 5) * 9));
    if (s % 3 === 1) content.push({ type: 'bulletList', content: [1, 2, 3, 4, 5].map((i) => ({ type: 'listItem', content: [para(i, 8)] })) });
  }
  return { type: 'doc', content };
}"""

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)

    ids = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const long = ({LONG})(12);
      const a = await V.saveNote(M.newNote({{ kind: 'note', title: 'Long essay', titleAuto: false, region: 'career', inbox: false, doc: long }}));
      const brk = {{ type: 'doc', content: [
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter one' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'A short first page.' }}] }},
        {{ type: 'pageBreak' }},
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter two' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'A short second page.' }}] }},
        {{ type: 'pageBreak' }},
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter three' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'And a third.' }}] }} ] }};
      const b = await V.saveNote(M.newNote({{ kind: 'note', title: 'Three chapters', titleAuto: false, region: 'career', inbox: false, doc: brk, pageMode: 'down' }}));
      return {{ a: a.id, b: b.id }}; }})()""")

    def open_note(nid):
        page.goto(BASE + f"#/note/{nid}"); page.wait_for_selector('#n-rich .ProseMirror'); page.wait_for_timeout(500)

    # Sheets and blocks, in page coordinates.
    LAYOUT = """(() => { const w = document.querySelector('#n-sheets'); const p = w.pager;
      const sh = [...document.querySelectorAll('.tp-sheet')].map(s => { const r = s.getBoundingClientRect(); return [r.top, r.bottom]; });
      const P = p ? p.geometry().P : 0;
      const bl = [...document.querySelectorAll('#n-rich .ProseMirror > *')].flatMap(e => /^(UL|OL)$/.test(e.tagName) ? [...e.children] : [e]).filter(e => !e.classList.contains('page-break')).map(e => {
        const r = e.getBoundingClientRect(); const pg = e.classList.contains('tp-push') ? parseFloat(e.style.getPropertyValue('--tp')) : 0; return [r.top + pg, r.bottom, e.tagName]; });
      const labels = [...document.querySelectorAll('.tp-label')].map(l => l.textContent);
      return { sh, bl, P, labels, count: p ? p.count : 0, mode: p ? p.mode : 'endless' }; })()"""

    def check_inside(L, what):
        bad = []
        for (t, b, tg) in L['bl']:
            s = [i for i, (a, z) in enumerate(L['sh']) if a - 1 <= t <= z]
            if not s: bad.append(('starts between pages', t, tg)); continue
            a, z = L['sh'][s[0]]
            if b > z - L['P'] + 1 and b - t < (z - a) - 2 * L['P']: bad.append(('crosses the bottom', t, b, z, tg))
        print(what, 'blocks', len(L['bl']), 'pages', len(L['sh']), 'problems', bad[:4])
        assert not bad, f'{what}: every block sits inside a page'

    # 1. Existing long note: Endless, nothing changed.
    open_note(ids['a'])
    L = J(LAYOUT)
    assert L['mode'] == 'endless' and not L['sh'], 'an existing note is one endless page'
    assert J("getComputedStyle(document.querySelector('#n-sheets')).display") == 'contents', 'the page box adds nothing in Endless'
    upd0 = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').updatedAt)")

    # 2. Pages button (iPad) / Pages and layout (phone) -> Scroll down.
    def open_panel():
        if wide:
            assert J("!!document.querySelector('.note-top [data-act=pages]')"), 'labelled Pages button on the iPad'
            page.locator('.note-top [data-act=pages]').click()
        else:
            assert not J("!!document.querySelector('.note-top [data-act=pages]')"), 'no Pages button on the phone top bar'
            page.locator('[data-act=more]').click(); page.wait_for_timeout(200)
            page.get_by_role('button', name='Pages and layout').click()
        page.wait_for_selector('.pp-panel [data-how]'); page.wait_for_timeout(200)
    open_panel()
    page.screenshot(path=f'{OUT}/o-panel-{tag}.png')
    assert J("document.querySelector('.pp-panel [data-how=endless]').getAttribute('aria-checked')") == 'true'
    page.locator('.pp-panel [data-how=down]').click(); page.wait_for_timeout(900)
    L = J(LAYOUT)
    print('scroll down:', L['count'], 'pages', L['labels'][:3])
    assert L['mode'] == 'down' and L['count'] >= 4, 'a long note is several pages'
    assert L['labels'][0] == f"Page 2 of {L['count']}", 'Page N of M between pages'
    check_inside(L, 'scroll down')
    page.screenshot(path=f'{OUT}/o-down-{tag}.png')
    upd1 = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').updatedAt)")
    assert upd1 == upd0, 'choosing how pages show does not change when the note was last changed'
    # Look at a page break between pages.
    J("(() => { const l = document.querySelectorAll('.tp-label')[1]; window.scrollBy(0, l.getBoundingClientRect().top - innerHeight / 2); })()"); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/o-down-gap-{tag}.png')

    PG = "document.querySelector('#n-sheets').pager"
    ED = "document.querySelector('#n-rich .ProseMirror').editor"
    # The page a top-level block (by index) is on.
    sheet_of = lambda i: J(f"{PG}.sheetOf(document.querySelectorAll('#n-rich .ProseMirror > *')[{i}])")

    # 3. Contents: a heading on a later page; Pages lists the real pages.
    def contents(name):
        page.locator('[data-act=contents]').click(); page.wait_for_selector('.cts-item'); page.wait_for_timeout(200)
        page.locator('.cts-t').filter(has_text=re.compile(f'^{name}$')).click(); page.wait_for_timeout(900)
        r = J(f"""(() => {{ const h = [...document.querySelectorAll('#n-rich h2')].find(e => e.textContent === '{name}'); const s = document.querySelector('#n-sticky').getBoundingClientRect().bottom;
          return {{ top: h.getBoundingClientRect().top + (parseFloat(h.style.getPropertyValue('--tp')) || 0), bar: s, sheet: {PG}.sheetOf(h), page: {PG}.page, h: innerHeight }}; }})()""")
        print('contents jump to', name, r)
        assert r['sheet'] == r['page'], 'Contents goes to the page the heading is on'
        assert r['bar'] - 2 <= r['top'] <= r['h'] * 0.5, 'the heading shows just under the toolbar'
    contents('Part 9')
    page.locator('[data-act=contents]').click(); page.wait_for_selector('.cts-item'); page.locator('.cts-foot [data-pages]').click()
    page.wait_for_selector('.pv-grid [data-pg]'); page.wait_for_timeout(1500)
    n_thumbs = J("document.querySelectorAll('.pv-grid [data-pg]').length")
    sub = J("document.querySelector('#pv-sub').textContent")
    count = J(f"{PG}.count")
    print('pages view:', n_thumbs, sub, 'pictures:', J("document.querySelectorAll('.pv-grid canvas').length"), 'pdf', J(f"import('./js/export.js').then(async E => (await E.typedPages((await import('./js/vault.js')).state.notes.get('{ids['a']}'), {{ px: 300 }})).length)"))
    assert n_thumbs == count, 'Pages lists the pages on screen'
    page.screenshot(path=f'{OUT}/o-pagesview-{tag}.png')
    page.locator('.pv-grid [data-pg="2"]').click(); page.wait_for_timeout(900)
    assert J(f"{PG}.page") == 2, 'tapping page 3 goes to page 3'

    # 4. Type at the end of page 1 until the text flows onto page 2.
    page.locator('#n-edit').click(); page.wait_for_timeout(300)
    last1 = J("""(() => { const els = [...document.querySelectorAll('#n-rich .ProseMirror > *')]; const p = document.querySelector('#n-sheets').pager;
      let k = -1; els.forEach((e, i) => { if (p.sheetOf(e) === 0 && e.tagName === 'P') k = i; }); return k; })()""")
    J(f"(() => {{ const ed = {ED}; let pos = 0, i = 0; ed.state.doc.forEach((n, o) => {{ if (i++ === {last1}) pos = o + n.nodeSize - 1; }}); ed.chain().focus().setTextSelection(pos).run(); }})()")
    page.wait_for_timeout(200)
    moved = False
    for k in range(30):
        page.keyboard.type(' and then some more words go here to fill the page')
        page.wait_for_timeout(80)
        if sheet_of(last1) == 1: moved = True; break
    page.wait_for_timeout(400)
    caret_sheet = J(f"(() => {{ const ed = {ED}; const $h = ed.state.selection.$head; return {PG}.sheetOf(ed.view.nodeDOM($h.before(1))); }})()")
    print('flowed after', k + 1, 'lines; the paragraph is on page', sheet_of(last1) + 1, 'caret on page', caret_sheet + 1)
    assert moved and caret_sheet == 1, 'typing past the end of page 1 carries the text onto page 2'
    check_inside(J(LAYOUT), 'after typing')
    page.screenshot(path=f'{OUT}/o-flow-{tag}.png')

    # 5. Add page here (Pages panel): a page break, the next block starts at the top of the next page.
    J(f"(() => {{ const ed = {ED}; let pos = 0, i = 0; ed.state.doc.forEach((n, o) => {{ if (i++ === 3) pos = o + 3; }}); ed.chain().focus().setTextSelection(pos).run(); }})()")
    before = J(f"{PG}.count")
    open_panel()
    page.locator('.pp-panel [data-addpage]').click(); page.wait_for_timeout(700)
    breaks = J(f"{ED}.getJSON().content.filter(b => b.type === 'pageBreak').length")
    r = J(f"""(() => {{ const pb = document.querySelector('#n-rich .page-break'); const nx = pb.nextElementSibling; const p = {PG};
      const t = nx.getBoundingClientRect().top + (parseFloat(nx.style.getPropertyValue('--tp')) || 0); const s = p.sheetOf(nx);
      return {{ s, pb: p.sheetOf(pb), top: t, sheetTop: p.sheetTops()[s], P: p.geometry().P, count: p.count, focused: {ED}.isFocused }}; }})()""")
    print('add page here:', breaks, r)
    assert breaks == 1 and r['s'] == r['pb'] + 1, 'a page break; what follows is on the next page'
    assert abs(r['top'] - (r['sheetTop'] + r['P'])) < 3, 'and starts at the top of that page'
    assert r['count'] >= before and r['focused'], 'still typing'
    page.keyboard.type('Fresh page'); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/o-addpage-{tag}.png')
    # Backspace at the start of that line removes the page break.
    page.keyboard.press('Home'); page.keyboard.press('Backspace'); page.wait_for_timeout(500)
    assert J(f"{ED}.getJSON().content.filter(b => b.type === 'pageBreak').length") == 0, 'backspace removes a page break'
    # Insert > New page in the toolbar.
    page.locator('#n-tools [data-act=insert]').click(); page.wait_for_timeout(200)
    page.locator('.popover [data-ins=page]').click(); page.wait_for_timeout(500)
    assert J(f"{ED}.getJSON().content.filter(b => b.type === 'pageBreak').length") == 1, 'Insert > New page adds a page break'
    page.keyboard.press('Control+z'); page.wait_for_timeout(400)
    assert J(f"{ED}.getJSON().content.filter(b => b.type === 'pageBreak').length") == 0, 'undo takes it away again'
    page.locator('#n-edit').click(); page.wait_for_timeout(800)

    # 6. Next page: one page at a time.
    upd2 = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').updatedAt)")
    open_panel()
    page.locator('.pp-panel [data-how=next]').click(); page.wait_for_timeout(900)
    nx = J(f"(() => {{ const w = document.querySelector('#n-sheets'); const p = {PG}; return {{ mode: p.mode, h: w.getBoundingClientRect().height, H: p.geometry().H, page: p.page, count: p.count, nav: !document.querySelector('.tp-nav').hidden, of: document.querySelector('.tp-of').textContent }}; }})()")
    print('next page:', nx)
    assert nx['mode'] == 'next' and abs(nx['h'] - nx['H']) < 2 and nx['nav'] and nx['of'] == f"Page {nx['page'] + 1} of {nx['count']}", 'one page shows (the one you were reading), with Previous and Next'
    wt = J("document.querySelector('#n-sheets').getBoundingClientRect().top")
    assert 0 <= wt < 400, 'and it is in view'
    J(f"{PG}.goTo(0)"); page.wait_for_timeout(300)
    assert J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').updatedAt)") == upd2, 'the view choice does not change when the note was changed'
    page.screenshot(path=f'{OUT}/o-next-{tag}.png')
    page.locator('.tp-nav [data-tp=next]').click(); page.wait_for_timeout(300)
    assert J(f"{PG}.page") == 1 and J("document.querySelector('.tp-of').textContent").startswith('Page 2 of'), 'Next turns the page'
    vis = J("(() => { const w = document.querySelector('#n-sheets'); return w.scrollTop; })()")
    assert abs(vis - nx['H']) < 2, 'the second page is the one showing'
    page.locator('.tp-nav [data-tp=prev]').click(); page.wait_for_timeout(300)
    assert J(f"{PG}.page") == 0, 'Previous turns back'
    page.keyboard.press('PageDown'); page.wait_for_timeout(200); page.keyboard.press('ArrowRight'); page.wait_for_timeout(200)
    assert J(f"{PG}.page") == 2, 'Page Down and the right arrow turn pages while reading'
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(200)
    assert J(f"{PG}.page") == 1
    page.screenshot(path=f'{OUT}/o-next2-{tag}.png')
    # Typing past the end of the page shown moves on to the next page.
    page.locator('#n-edit').click(); page.wait_for_timeout(300)
    last = J("""(() => { const els = [...document.querySelectorAll('#n-rich .ProseMirror > *')]; const p = document.querySelector('#n-sheets').pager;
      let k = -1; els.forEach((e, i) => { if (p.sheetOf(e) === 1 && e.tagName === 'P') k = i; }); return k; })()""")
    J(f"(() => {{ const ed = {ED}; let pos = 0, i = 0; ed.state.doc.forEach((n, o) => {{ if (i++ === {last}) pos = o + n.nodeSize - 1; }}); ed.chain().focus().setTextSelection(pos).run(); }})()")
    page.wait_for_timeout(300)
    assert J(f"{PG}.page") == 1, 'the cursor is on page 2'
    for k in range(30):
        page.keyboard.type(' and the words keep coming until the page is full')
        page.wait_for_timeout(80)
        if sheet_of(last) == 2: break
    page.wait_for_timeout(500)
    print('typing past the page: page shown', J(f"{PG}.page") + 1, 'paragraph on', sheet_of(last) + 1)
    assert sheet_of(last) == 2 and J(f"{PG}.page") == 2, 'the next page shows by itself'
    page.screenshot(path=f'{OUT}/o-next-typed-{tag}.png')
    page.locator('#n-edit').click(); page.wait_for_timeout(800)
    # Contents jumps to the right page.
    page.locator('[data-act=contents]').click(); page.wait_for_selector('.cts-item'); page.wait_for_timeout(200)
    page.locator('.cts-t').filter(has_text=re.compile('^Part 11$')).click(); page.wait_for_timeout(700)
    r = J(f"(() => {{ const h = [...document.querySelectorAll('#n-rich h2')].find(e => e.textContent === 'Part 11'); const w = document.querySelector('#n-sheets').getBoundingClientRect(); const t = h.getBoundingClientRect().top; return {{ sheet: {PG}.sheetOf(h), page: {PG}.page, inside: t >= w.top && t < w.bottom }}; }})()")
    print('next page, Contents:', r)
    assert r['sheet'] == r['page'] and r['inside'], 'Contents turns to the page with the heading'

    # 7. The choice stays with the note.
    page.goto(BASE + '#/today'); page.wait_for_selector('.today-page'); page.wait_for_timeout(300)
    open_note(ids['a'])
    page.wait_for_function(f"!!{PG}")
    assert J(f"{PG}.mode") == 'next', 'Next page is remembered for this note'
    assert J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').pageMode)") == 'next'

    # 8. Timing: a keystroke on a ~30 page note.
    tid = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const n = await V.saveNote(M.newNote({{ kind: 'note', title: 'Very long', titleAuto: false, region: 'career', inbox: false, doc: ({LONG})(wide ? 40 : 14), pageMode: 'down' }})); return n.id; }})()""".replace('wide ?', 'true ?' if wide else 'false ?'))
    open_note(tid); page.wait_for_function(f"!!{PG}"); page.wait_for_timeout(800)
    J(f"{PG}.stats.max = 0; {PG}.stats.runs = 0")
    page.locator('#n-edit').click(); page.wait_for_timeout(300)
    J(f"(() => {{ const ed = {ED}; let pos = 0, i = 0; ed.state.doc.forEach((n, o) => {{ if (i++ === 2) pos = o + 4; }}); ed.chain().focus().setTextSelection(pos).run(); }})()")
    for ch in 'Typing at the top of a long note moves every page below it':
        page.keyboard.type(ch); page.wait_for_timeout(16)
    page.wait_for_timeout(600)
    st = J(f"{PG}.stats"); cnt = J(f"{PG}.count")
    print(f'TIMING: {cnt} pages, {st["runs"]} layouts while typing, slowest {st["max"]:.1f} ms, last {st["last"]:.1f} ms')
    assert cnt >= (25 if wide else 30), 'a long note'
    assert st['max'] < 50, 'laying out the pages after a keystroke takes under 50 ms'
    check_inside(J(LAYOUT), 'long note')
    page.locator('#n-edit').click(); page.wait_for_timeout(600)

    # 9. PDF export: the same pages.
    open_note(ids['b']); page.wait_for_function(f"!!{PG}"); page.wait_for_timeout(500)
    scr = J(f"{PG}.count")
    pdf = J(f"import('./js/export.js').then(async E => (await E.typedPages((await import('./js/vault.js')).state.notes.get('{ids['b']}'), {{ px: 300 }})).length)")
    print('page breaks: screen', scr, 'PDF', pdf)
    assert scr == 3 and pdf == 3, 'three pages on screen and in the PDF'
    check_inside(J(LAYOUT), 'page breaks')
    page.screenshot(path=f'{OUT}/o-breaks-{tag}.png')
    long_pdf = J(f"import('./js/export.js').then(async E => (await E.typedPages((await import('./js/vault.js')).state.notes.get('{ids['a']}'), {{ px: 300 }})).length)")
    J(f"import('./js/vault.js').then(V => V.saveNote({{ ...V.state.notes.get('{ids['a']}'), pageMode: 'down' }}, {{ touch: false }}))")
    open_note(ids['a']); page.wait_for_function(f"!!{PG}"); page.wait_for_timeout(600)
    print('long note: screen', J(f"{PG}.count"), 'PDF', long_pdf)
    if wide: assert abs(J(f"{PG}.count") - long_pdf) <= 1, 'on the iPad the long note prints as about the pages on screen'
    # Dark mode.
    J("document.documentElement.dataset.theme = 'dark'"); page.wait_for_timeout(300)
    J("(() => { const l = document.querySelectorAll('.tp-label')[0]; window.scrollBy(0, l.getBoundingClientRect().top - innerHeight / 2); })()"); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/o-dark-{tag}.png')
    J("document.documentElement.dataset.theme = 'light'")

    # 10. Endless with page breaks: thin dashed lines, no pages.
    open_note(ids['b']); page.wait_for_function(f"!!{PG}")
    open_panel(); page.locator('.pp-panel [data-how=endless]').click(); page.wait_for_timeout(700)
    e = J("(() => ({ pager: !!document.querySelector('#n-sheets').pager?.count && !!document.querySelector('.tp-sheet'), h: [...document.querySelectorAll('.page-break')].map(b => b.getBoundingClientRect().height), vis: getComputedStyle(document.querySelector('.page-break')).visibility }))()")
    print('endless with page breaks:', e)
    assert not e['pager'] and all(h > 10 for h in e['h']) and e['vis'] == 'visible', 'page breaks show as a line in Endless'
    assert J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['b']}').pageMode)") is None
    page.screenshot(path=f'{OUT}/o-endless-breaks-{tag}.png')
    md = J(f"Promise.all([import('./js/vault.js'), import('./js/doc.js')]).then(([V, D]) => [D.docToMarkdown(V.state.notes.get('{ids['b']}').doc), D.docPlainText(V.state.notes.get('{ids['b']}').doc)].join('|'))")
    print('markdown:', md.replace(chr(10), ' / '))
    assert 'Chapter two' in md and 'pageBreak' not in md and 'null' not in md, 'Markdown and plain text keep the words, nothing for the page breaks'

    # 10b. In a notebook's pane and side by side (iPad).
    if wide:
        nb = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
          const nb = await V.saveNotebook(M.newNotebook({{ title: 'Paged book', region: 'career' }}));
          const n = await V.saveNote(M.newNote({{ kind: 'note', title: 'In a notebook', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false, doc: ({LONG})(5), pageMode: 'down' }}));
          return {{ nb: nb.id, n: n.id }}; }})()""")
        page.goto(BASE + f"#/notebook/{nb['nb']}?note={nb['n']}"); page.wait_for_selector('.nb-pane #n-rich .ProseMirror'); page.wait_for_function(f"!!{PG}"); page.wait_for_timeout(800)
        L = J(LAYOUT); w = J("document.querySelector('.nb-pane #n-sheets').getBoundingClientRect().width")
        print('notebook pane:', L['count'], 'pages,', round(w), 'px wide')
        assert L['count'] >= 2; check_inside(L, 'notebook pane')
        page.screenshot(path=f'{OUT}/o-notebook-{tag}.png')
        page.goto(BASE + f"#/note/{ids['b']}?beside={nb['n']}"); page.wait_for_selector('.split-pane'); page.wait_for_timeout(1500)
        sides = J("[...document.querySelectorAll('.split-pane #n-sheets')].map(w => w.pager ? [w.pager.mode, w.pager.count] : null)")
        print('side by side:', sides)
        assert sides[0] is None and sides[1] and sides[1][0] == 'down', 'pages work side by side (the left note is Endless now)'
        page.screenshot(path=f'{OUT}/o-split-{tag}.png')

    # 11. Today's note: no pages.
    did = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const D = await import('./js/doc.js');
      const n = await V.saveNote(M.newNote({ kind: 'note', daily: D.isoToday(), title: '', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Today.' }] }] } })); return n.id; })()""")
    open_note(did)
    assert not J("!!document.querySelector('[data-act=pages]')"), "Today's note has no Pages button"
    page.locator('[data-act=more]').click(); page.wait_for_timeout(300)
    assert page.get_by_role('button', name='Pages and layout').count() == 0, "nor Pages and layout"
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    page.locator('#n-edit').click(); page.wait_for_timeout(300)
    page.locator('#n-tools [data-act=insert]').click(); page.wait_for_timeout(200)
    assert J("!document.querySelector('.popover [data-ins=page]')"), "nor New page in Insert"
    print('ok', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
