"""Three fixes from 6 Nov: (1) notes in a notebook are listed newest first, by
when they were last written in (or made), sub-notes too; (2) tapping a typed
note's title while reading lets you change it, every time, in the notebook
pane and on its own; (3) a text box dragged out with the text tool on a
handwritten page sits exactly where it was drawn and its words wrap inside it
(long words too, on the page as well as while typing), and a tapped text box
stays inside the part of the page on screen when zoomed in."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const wait = () => new Promise(r => setTimeout(r, 15));
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Order check', region: 'career' }));
      const at = { notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false };
      const a = await V.saveNote(M.newNote({ kind: 'note', title: 'First made', titleAuto: false, ...at, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Words.' }] }] } })); await wait();
      const b = await V.saveNote(M.newNote({ kind: 'note', title: 'Second made', titleAuto: false, ...at })); await wait();
      const i = await V.saveNote(M.newNote({ kind: 'ink', title: 'Third made', titleAuto: false, ...at, pages: [M.newPage({})] })); await wait();
      const k1 = await V.saveNote(M.newNote({ kind: 'note', title: 'Sub one', titleAuto: false, ...at, parent: b.id })); await wait();
      const k2 = await V.saveNote(M.newNote({ kind: 'note', title: 'Sub two', titleAuto: false, ...at, parent: b.id })); await wait();
      return { nb: nb.id, a: a.id, b: b.id, i: i.id, k1: k1.id }; })()""")
    order = lambda: J("[...document.querySelectorAll('.nb-tree-wrap .nb-row .t')].map(e => e.textContent)")
    top = lambda: J("[...document.querySelectorAll('.nb-tree-wrap > .nb-sec > .nb-tree > li > .nb-row .t')].map(e => e.textContent)")

    # (1) Newest first.
    page.goto(BASE + f"#/notebook/{ids['nb']}"); page.wait_for_selector('.nb-row'); page.wait_for_timeout(300)
    print('made order:', order())
    assert top() == ['Third made', 'Second made', 'First made'], 'the newest note is at the top'
    assert order().index('Sub two') < order().index('Sub one'), 'sub-notes are newest first too'
    # Changing the first note brings it to the top; changing a sub-note brings it up within its parent.
    J(f"""import('./js/vault.js').then(async V => {{ await V.saveNote({{ ...V.state.notes.get('{ids['a']}'), title: 'First made, changed' }});
      await new Promise(r => setTimeout(r, 15)); await V.saveNote({{ ...V.state.notes.get('{ids['k1']}'), title: 'Sub one, changed' }}); }})""")
    page.wait_for_timeout(500)
    print('after changes:', order())
    assert top()[0] == 'First made, changed', 'a changed note goes to the top'
    assert order().index('Sub one, changed') < order().index('Sub two'), 'a changed sub-note goes up'

    # (2) Tap the title of a typed note while reading to change it, twice in a row.
    for where in (['pane', 'own'] if wide else ['own']):
        page.goto(BASE + (f"#/notebook/{ids['nb']}?note={ids['b']}" if where == 'pane' else f"#/note/{ids['b']}"))
        page.wait_for_selector('h1.note-title'); page.wait_for_timeout(400)
        for k in range(2):
            name = f'Renamed {where} {k}'
            page.locator('h1.note-title').tap(); page.wait_for_timeout(250)
            st = J("(() => { const t = document.querySelector('#n-title'); return t && { focused: document.activeElement === t, end: t.selectionStart === t.value.length }; })()")
            print(where, k, 'after tapping the title:', st)
            assert st and st['focused'] and st['end'], 'the title is ready to change, cursor at the end'
            page.fill('#n-title', name)
            page.locator('#n-edit').tap(); page.wait_for_timeout(900)
            got = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['b']}').title)")
            print(where, k, 'saved title:', got)
            assert got == name and J("document.querySelector('h1.note-title')?.textContent") == name, 'the new title is saved and shown'
    page.screenshot(path=f'{OUT}/g-title-{tag}.png')

    # (3) A drawn text box sits exactly where it was drawn.
    page.goto(BASE + (f"#/notebook/{ids['nb']}?note={ids['i']}" if wide else f"#/note/{ids['i']}"))
    page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(700)
    page.locator('#iv-tools [data-tool=text]').click(); page.wait_for_timeout(150)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    sc = r[2] / 1000  # page units to screen
    x1, y1, x2, y2 = r[0] + r[2] * 0.55, r[1] + 140, r[0] + r[2] * 0.85, r[1] + 140 + 45 * sc
    page.mouse.move(x1, y1); page.mouse.down()
    page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, steps=4); page.mouse.move(x2, y2, steps=4)
    d = J("(() => { const e = document.querySelector('.tb-draft'); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; })()")
    print('outline while dragging:', d and [round(v) for v in d])
    assert d and abs(d[0] - x1) < 3 and abs(d[2] - x2) < 3 and abs(d[3] - y2) < 3, 'a dashed outline follows the drag'
    page.screenshot(path=f'{OUT}/g-drag-{tag}.png')
    page.mouse.up()
    page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    assert not J("!!document.querySelector('.tb-draft')"), 'the outline goes when you lift'
    box = lambda: J("(() => { const b = document.querySelector('.tb-edit').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; })()")
    b0 = box(); print('drawn', [round(v) for v in (x1, y1, x2, y2)], 'box', [round(v) for v in b0])
    assert abs(b0[0] - x1) < 3 and abs(b0[1] - y1) < 3 and abs(b0[2] - x2) < 3, 'the box starts where drawn and is as wide as drawn'
    assert abs(b0[3] - y2) < 6, 'the box is as tall as drawn while typing'
    page.keyboard.type('A longer sentence that has to wrap onto several lines inside the box, plus Supercalifragilisticexpialidocious_and_more_letters_without_spaces')
    page.wait_for_timeout(300)
    b1 = box(); print('after typing', [round(v) for v in b1])
    assert abs(b1[0] - x1) < 3 and abs(b1[2] - x2) < 3, 'the width stays as drawn; the words wrap'
    assert b1[3] > b0[3], 'the box grows down as the words need'
    page.screenshot(path=f'{OUT}/g-box-{tag}.png')
    page.locator('.tb-done').click(); page.wait_for_timeout(900)
    o = J(f"""import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{ids['i']}'); const d = await V.loadPage(n.pages[0].id); return d.objects.filter(o => o.type === 'text').map(o => ({{ x: o.x, y: o.y, w: o.w, h: o.h, keys: Object.keys(o) }})); }})""")
    print('saved:', o)
    assert len(o) == 1 and abs(o[0]['x'] - 550) < 4 and abs(o[0]['w'] - 300) < 4, 'saved where drawn (page units)'
    assert 'drawnH' not in o[0]['keys'] and 'fresh' not in o[0]['keys']
    # On the page (not typing), long words break inside the box too.
    h = J("""import('./js/editor/inkdraw.js').then(D => { const c = document.createElement('canvas').getContext('2d');
      const one = D.drawRichText(c, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }, 0, 0, 100, { size: 20 });
      const long = D.drawRichText(c, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz' }] }] }, 0, 0, 100, { size: 20 });
      return [one, long]; })""")
    print('one line vs long word:', h)
    assert h[1] > h[0] * 3, 'a word wider than the box breaks onto more lines'
    page.screenshot(path=f'{OUT}/g-done-{tag}.png')

    # A tap still makes a box; zoomed in, it stays on screen.
    J("""(() => { const sc = document.querySelector('.ink-scroll'); for (let i = 0; i < 8; i++) sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })); })()""")
    page.wait_for_timeout(600)
    vis = J("(() => { const r = document.querySelector('.ink-scroll').getBoundingClientRect(); return [Math.max(r.left, 0), Math.min(r.right, innerWidth), r.top]; })()")
    page.mouse.click(vis[0] + (vis[1] - vis[0]) * 0.6, vis[2] + 200); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    b2 = box(); print('zoomed tap box', [round(v) for v in b2], 'screen', [round(v) for v in vis])
    assert b2[2] <= vis[1] + 1 and b2[0] >= vis[0] - 1, 'the tapped box fits on the screen'
    assert b2[2] - b2[0] > 100, 'and is still a useful width'
    page.keyboard.type('Fits'); page.locator('.tb-done').click(); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/g-zoomed-{tag}.png')
    print('ok', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
