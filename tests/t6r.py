"""15 Nov 2026 (sb-v29.3): tapping text to edit keeps the tapped words in place
(and a tap in the margin lands on that line, not the end of the note); Indent
more / less moves ordinary lines and headings right and left, step by step
(Tab too), and PDF export draws them indented; the paper colour works in
Endless; a typed note opens where you were reading after the app reloads
(locking, or iPadOS freeing memory), in Scroll down and in Next page."""
from dbg import *
import sys
OUT = 'shots5'

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const words = 'the quick brown fox jumps over a lazy dog while seven bright owls watch from the old oak tree near the river'.split(' ');
      const content = [];
      for (let i = 0; i < 40; i++) content.push({ type: 'paragraph', content: [{ type: 'text', text: `Line ${i + 1}: ` + Array.from({ length: 30 }, (_, k) => words[(k * 7 + i) % words.length]).join(' ') + '.' }] });
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Long reading', titleAuto: false, region: 'career', inbox: false, doc: { type: 'doc', content } }))).id; })()""")
    def open_note():
        page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .ProseMirror p'); page.wait_for_timeout(600)

    # 1. Tap a paragraph halfway down while reading: it stays where it was.
    open_note()
    J("window.scrollTo(0, 0)"); page.wait_for_timeout(200)
    J("(() => { const p = document.querySelectorAll('#n-rich .ProseMirror > p')[14]; window.scrollBy(0, p.getBoundingClientRect().top - innerHeight * 0.55); })()"); page.wait_for_timeout(400)
    r = J("(() => { const r = document.querySelectorAll('#n-rich .ProseMirror > p')[14].getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    page.mouse.click(r[0] + 40, r[1] + 8); page.wait_for_timeout(900)
    after = J("""(() => { const p = document.querySelectorAll('#n-rich .ProseMirror > p')[14]; const sel = getSelection(); const inP = p.contains(sel.anchorNode);
      return { top: p.getBoundingClientRect().top, inP, editing: document.querySelector('#n-edit').textContent }; })()""")
    print('tapped line before', round(r[1]), 'after', round(after['top']), after)
    assert after['editing'] == 'Done' and after['inP'], 'editing starts in the tapped line'
    assert abs(after['top'] - r[1]) < 6, 'the tapped line stays where it was'
    page.locator('#n-edit').click(); page.wait_for_timeout(600)

    # 1b. A tap in the left margin lands on that line, not at the end of the note.
    r = J("(() => { const r = document.querySelectorAll('#n-rich .ProseMirror > p')[16].getBoundingClientRect(); const d = document.querySelector('#n-rich .ProseMirror').getBoundingClientRect(); return [r.top, d.left]; })()")
    J("""(([y, x]) => { const dom = document.querySelector('#n-rich .ProseMirror'); dom.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x - 6, clientY: y + 8 })); })""", [r[0], r[1]]); page.wait_for_timeout(800)
    m = J("(() => { const p = document.querySelectorAll('#n-rich .ProseMirror > p')[16]; return p.contains(getSelection().anchorNode); })()")
    print('margin tap lands on its line:', m); assert m
    page.locator('#n-edit').click(); page.wait_for_timeout(600)

    # 2. Indent: a plain line moves right a step at a time, back with Indent less; Tab works too.
    J("window.scrollTo(0, 0)"); page.wait_for_timeout(200)
    page.locator('#n-rich .ProseMirror > p').nth(2).click(); page.wait_for_timeout(500)
    left = lambda: J("document.querySelectorAll('#n-rich .ProseMirror > p')[2].getBoundingClientRect().left")
    x0 = left()
    btn = page.locator('[data-act=indent]').first
    btn.click(); page.wait_for_timeout(200); x1 = left()
    btn.click(); page.wait_for_timeout(200); x2 = left()
    page.keyboard.press('Tab'); page.wait_for_timeout(200); x3 = left()
    print('indent steps:', round(x0), round(x1), round(x2), round(x3))
    assert x0 < x1 < x2 < x3 and abs((x2 - x1) - (x1 - x0)) < 2, 'each indent moves the line further right by the same step'
    page.locator('[data-act=outdent]').first.click(); page.wait_for_timeout(200)
    page.keyboard.press('Shift+Tab'); page.wait_for_timeout(200)
    assert abs(left() - x1) < 1, 'indent less moves it back'
    page.screenshot(path=f'{OUT}/r-indent-{tag}.png')
    page.locator('#n-edit').click(); page.wait_for_timeout(800)
    ind = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').doc.content[2].attrs.indent)")
    print('saved indent:', ind); assert ind == 1
    # PDF export draws it indented: the first dark pixel of that line sits further right.
    # (checked through the canvas the export draws)
    xs = J(f"""(async () => {{ const V = await import('./js/vault.js'); const D = await import('./js/editor/inkdraw.js');
      const n = V.state.notes.get('{nid}'); const one = (k) => ({{ type: 'doc', content: [n.doc.content[k]] }});
      const firstInk = (doc) => {{ const c = document.createElement('canvas'); c.width = 1000; c.height = 120; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 120);
        D.drawRichText(ctx, doc, 20, 10, 900, {{ size: 20 }}); const d = ctx.getImageData(0, 0, 1000, 120).data;
        for (let x = 0; x < 1000; x++) for (let y = 0; y < 120; y++) {{ const i = (y * 1000 + x) * 4; if (d[i] < 120) return x; }} return -1; }};
      return [firstInk(one(1)), firstInk(one(2))]; }})()""")
    print('export first ink x, plain vs indented:', xs); assert xs[1] - xs[0] > 30

    # 4. Paper colour in Endless.
    def open_panel():
        if wide: page.locator('.note-top [data-act=pages]').click()
        else:
            page.locator('[data-act=more]').click(); page.wait_for_timeout(200)
            page.get_by_role('button', name='Pages and layout').click()
        page.wait_for_selector('.pp-panel [data-pcol]'); page.wait_for_timeout(200)
    assert J("getComputedStyle(document.querySelector('#n-sheets')).display") == 'contents', 'no colour chosen: Endless looks as before'
    open_panel()
    assert J("[...document.querySelectorAll('.pp-panel [data-pcol]')].every(b => b.getAttribute('aria-checked') === 'false')"), 'none chosen yet'
    page.locator('.pp-panel [data-pcol=ivory]').click(); page.wait_for_timeout(500)
    bg = J("getComputedStyle(document.querySelector('#n-sheets')).backgroundColor"); print('endless ivory:', bg)
    assert bg == 'rgb(251, 247, 239)'
    open_panel(); page.locator('.pp-panel [data-pcol=night]').click(); page.wait_for_timeout(500)
    dk = J("({ bg: getComputedStyle(document.querySelector('#n-sheets')).backgroundColor, ink: getComputedStyle(document.querySelector('#n-rich .ProseMirror p')).color })")
    print('endless dark:', dk); assert dk['bg'] == 'rgb(30, 43, 56)' and dk['ink'] != 'rgb(27, 42, 56)'
    page.screenshot(path=f'{OUT}/r-endless-dark-{tag}.png')
    open_panel(); page.locator('.pp-panel [data-pcol=white]').click(); page.wait_for_timeout(500)
    assert J("getComputedStyle(document.querySelector('#n-sheets')).backgroundColor") == 'rgb(255, 255, 255)'

    # 6. Where you were reading survives a reload (lock, or the iPad freeing memory).
    J("(() => { const p = document.querySelectorAll('#n-rich .ProseMirror > p')[25]; window.scrollBy(0, p.getBoundingClientRect().top - 200); })()"); page.wait_for_timeout(700)
    top_before = J("Math.round(document.querySelectorAll('#n-rich .ProseMirror > p')[25].getBoundingClientRect().top)")
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.reload(); page.wait_for_selector('#pass', timeout=15000)
    page.fill('#pass', PASS); page.keyboard.press('Enter'); page.wait_for_selector('#n-rich .ProseMirror p', timeout=20000); page.wait_for_timeout(1500)
    top_after = J("Math.round(document.querySelectorAll('#n-rich .ProseMirror > p')[25].getBoundingClientRect().top)")
    print('line 26 on screen before', top_before, 'after reload', top_after); assert abs(top_after - top_before) < 8
    # Next page: comes back on the same page.
    J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); await V.saveNote({{ ...n, pageMode: 'next' }}, {{ touch: false }}); }})")
    page.goto(BASE + '#/today'); page.wait_for_timeout(300); open_note()
    page.mouse.move(300, 500); page.mouse.wheel(0, 1); page.wait_for_timeout(100)  # you, turning pages
    J("document.querySelector('#n-sheets').pager.goTo(2, { caret: false })"); page.wait_for_timeout(600)
    J("document.dispatchEvent(new Event('scroll'))"); page.wait_for_timeout(500)
    page.goto(BASE + '#/today'); page.wait_for_timeout(300); open_note(); page.wait_for_timeout(600)
    cur = J("document.querySelector('#n-sheets').pager.current()"); print('next page reopened on page', cur + 1); assert cur == 2
    # 6b. Switching apps on the iPad: while the app is away iPadOS redraws it at
    # other sizes (a notebook then hides its note). The place must survive.
    if wide:
        nb = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
          const nb = await V.saveNotebook(M.newNotebook({{ title: 'Place book', region: 'career' }}));
          const n = V.state.notes.get('{nid}'); await V.saveNote({{ ...n, notebook: nb.id, section: nb.sections[0].id, pageMode: 'down' }}, {{ touch: false }});
          return nb.id; }})()""")
        page.goto(BASE + f"#/notebook/{nb}?note={nid}"); page.wait_for_selector('.nb-pane #n-rich .ProseMirror p'); page.wait_for_timeout(2300)
        TOP = "Math.round(document.querySelectorAll('.nb-pane #n-rich .ProseMirror > p')[30].getBoundingClientRect().top)"
        page.mouse.move(700, 400); page.mouse.wheel(0, 300); page.wait_for_timeout(200)
        J("(() => { const p = document.querySelectorAll('.nb-pane #n-rich .ProseMirror > p')[30]; let sc = p.parentElement; while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 4)) sc = sc.parentElement; const d = p.getBoundingClientRect().top - 300; if (sc) sc.scrollTop += d; else window.scrollBy(0, d); })()")
        page.wait_for_timeout(700)
        t0 = J(TOP)
        hide = lambda v: J("(v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }", v)
        hide('hidden')
        page.set_viewport_size({'width': 820, 'height': 1180}); page.wait_for_timeout(700)
        page.set_viewport_size({'width': 1180, 'height': 820}); page.wait_for_timeout(700)
        hide('visible')
        page.wait_for_selector('.nb-pane #n-rich .ProseMirror p'); page.wait_for_timeout(2600)
        t1 = J(TOP); print('line 31 before switching apps', t0, 'after', t1)
        assert abs(t1 - t0) < 10, 'the note stays where you were reading after switching apps'
        # Handwritten: page 3 stays page 3.
        iid = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
          return (await V.saveNote(M.newNote({{ kind: 'ink', title: 'Five pages', titleAuto: false, notebook: '{nb}', region: 'career', inbox: false, pages: [1, 2, 3, 4, 5].map(() => M.newPage({{}})) }}))).id; }})()""")
        page.goto(BASE + f"#/notebook/{nb}?note={iid}"); page.wait_for_selector('.nb-pane .ink-page canvas.ink-main'); page.wait_for_timeout(900)
        J("(() => { const sc = document.querySelector('.nb-pane .ink-scroll'); const sl = sc.querySelectorAll('.ink-slot')[2]; sc.scrollTop = sl.offsetTop - 10; })()"); page.wait_for_timeout(900)
        SUB = "document.querySelector('.nb-pane #iv-sub').textContent"
        print('before:', J(SUB)); assert 'page 3 of 5' in J(SUB)
        hide('hidden')
        page.set_viewport_size({'width': 820, 'height': 1180}); page.wait_for_timeout(700)
        page.set_viewport_size({'width': 1180, 'height': 820}); page.wait_for_timeout(700)
        hide('visible')
        page.wait_for_selector('.nb-pane .ink-page canvas.ink-main'); page.wait_for_timeout(1800)
        vis = J("(() => { const sc = document.querySelector('.nb-pane .ink-scroll'); const mid = sc.getBoundingClientRect().top + sc.clientHeight * 0.4; return [...sc.querySelectorAll('.ink-slot')].findIndex(s => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }); })()")
        print('after:', J(SUB), '| page on screen:', vis + 1); assert 'page 3 of 5' in J(SUB) and vis == 2
    # 7. Ticking a checkbox while reading (no Edit) is saved, and unticking too.
    tk = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const item = (t) => ({ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Ticks', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [{ type: 'taskList', content: [item('Buy milk'), item('Call the bank')] }] } }))).id; })()""")
    page.goto(BASE + f'#/note/{tk}'); page.wait_for_selector('#n-rich li[data-checked] input'); page.wait_for_timeout(500)
    assert J("document.querySelector('#n-edit').textContent") == 'Edit'
    page.locator('#n-rich li[data-checked] input').nth(1).click(); page.wait_for_timeout(1300)
    CH = f"import('./js/vault.js').then(V => V.state.notes.get('{tk}').doc.content[0].content.map(i => [i.attrs.checked, !!i.attrs.doneAt]))"
    got = J(CH); print('ticked while reading:', got, '| still reading:', J("document.querySelector('#n-edit').textContent"))
    assert got == [[False, False], [True, True]] and J("document.querySelector('#n-edit').textContent") == 'Edit'
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    page.goto(BASE + f'#/note/{tk}'); page.wait_for_selector('#n-rich li[data-checked] input'); page.wait_for_timeout(500)
    assert J("[...document.querySelectorAll('#n-rich li[data-checked] input')].map(i => i.checked)") == [False, True], 'still ticked after coming back'
    page.locator('#n-rich li[data-checked] input').nth(1).click(); page.wait_for_timeout(1300)
    assert J(CH) == [[False, False], [False, False]], 'unticking is saved too'
    print('OK', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
