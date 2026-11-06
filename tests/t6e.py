"""Two notes side by side (iPad and wider). The button in a note's top bar
opens a picker; the chosen note opens on the right. Each side is a whole note:
writing on the left lands in the left note, on the right in the right one;
pens are shared. The middle bar resizes; Swap and Close right work; the pair is
remembered when the note is opened again (until closed). "Beside" next to a
connection opens it there. On a phone, notes open one at a time."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const a = await V.saveNote(M.newNote({ kind: 'ink', title: 'Lecture notes', titleAuto: false, region: 'ideas', inbox: false, pages: [M.newPage({})] }));
      const b = await V.saveNote(M.newNote({ kind: 'ink', title: 'Reading: dividends', titleAuto: false, region: 'investing', inbox: false, pages: [M.newPage({ paper: 'ruled' })] }));
      const c = await V.saveNote(M.newNote({ kind: 'note', title: 'Typed summary', titleAuto: false, region: 'investing', inbox: false, body: 'Payout ratio matters.' }));
      await V.linkNotes(c.id, b.id);
      return { a: a.id, b: b.id, c: c.id }; })()""")
    page.goto(BASE + f"#/note/{ids['a']}"); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    if not wide:
        assert page.locator('[data-beside-pick]').count() == 0, 'no side by side on a phone'
        page.goto(BASE + f"#/note/{ids['a']}?beside={ids['b']}"); page.wait_for_timeout(800)
        assert page.locator('.split').count() == 0 and page.locator('.ink-page').count() >= 1, 'on a phone it opens one note'
        print('OK'); return
    # 1. The button and the picker.
    page.locator('[data-beside-pick]').first.click(); page.wait_for_selector('#np-list [data-id]')
    page.locator(f"#np-list [data-id=\"{ids['b']}\"]").click()
    page.wait_for_selector('.split [data-side=b] .ink-page canvas.ink-main'); page.wait_for_timeout(800)
    assert f"beside={ids['b']}" in page.url
    titles = J("[...document.querySelectorAll('.split-pane')].map(p => p.querySelector('#iv-title, .iv-title, h1, .ink-title')?.textContent?.trim() || '')")
    print('sides:', titles)
    page.screenshot(path=f'{OUT}/e-split-{tag}.png')
    # 2. Write on each side: each lands in its own note.
    def write(side, x0=0.3):
        r = J(f"(() => {{ const p = document.querySelector('.split [data-side={side}] .ink-page').getBoundingClientRect(); return [p.left, p.top, p.width]; }})()")
        x, y = r[0] + r[2] * x0, r[1] + 140
        page.mouse.move(x, y); page.mouse.down()
        for i in range(1, 12): page.mouse.move(x + i * 5, y + (i % 3) * 3)
        page.mouse.up(); page.wait_for_timeout(900)
    page.locator('.split [data-side=a] #iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    write('a')
    page.locator('.split [data-side=b] #iv-tools [data-tool=pen]').click(); page.wait_for_timeout(100)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    write('b'); write('b', 0.5)
    counts = J(f"""import('./js/vault.js').then(async V => {{ const out = {{}}; for (const k of ['{ids['a']}', '{ids['b']}']) {{ const n = V.state.notes.get(k); out[k] = (await V.loadPage(n.pages[0].id)).strokes.length; }} return out; }})""")
    print('strokes per note:', counts); assert counts[ids['a']] == 1 and counts[ids['b']] == 2
    assert J("document.querySelector('.split [data-side=b]').classList.contains('active')"), 'the side last written on is the active one'
    # 3. Pens are shared: choosing the highlighter on the right shows on the left too.
    page.locator('.split [data-side=b] #iv-tools [data-tool=hl]').click(); page.wait_for_timeout(900)
    if page.locator('.popover').count(): page.keyboard.press('Escape'); page.wait_for_timeout(200)
    left_tool = J("document.querySelector('.split [data-side=a] #iv-tools [data-tool=hl]')?.getAttribute('aria-pressed')")
    print('left side highlighter pressed:', left_tool); assert left_tool == 'true'
    # 4. The middle bar resizes.
    bar = page.locator('.split-bar').bounding_box()
    w0 = J("document.querySelector('.split [data-side=a]').getBoundingClientRect().width")
    page.mouse.move(bar['x'] + 7, bar['y'] + bar['height'] / 2); page.mouse.down(); page.mouse.move(bar['x'] - 150, bar['y'] + bar['height'] / 2, steps=8); page.mouse.up(); page.wait_for_timeout(500)
    w1 = J("document.querySelector('.split [data-side=a]').getBoundingClientRect().width")
    print('left side width:', round(w0), '->', round(w1)); assert w1 < w0 - 100
    # 5. Swap sides.
    page.locator('[data-split=swap]').click(); page.wait_for_timeout(1200)
    assert f"#/note/{ids['b']}?beside={ids['a']}" in page.url
    # 6. Opened again later: the pair comes back.
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    page.goto(BASE + f"#/note/{ids['b']}"); page.wait_for_selector('.split [data-side=b] .ink-page'); page.wait_for_timeout(500)
    assert f"beside={ids['a']}" in page.url, 'the pair is remembered'
    # 7. Close right: one note again, and the pair is forgotten.
    page.locator('[data-split=close]').click(); page.wait_for_timeout(800)
    assert page.locator('.split').count() == 0 and 'beside=' not in page.url
    page.goto(BASE + '#/today'); page.wait_for_timeout(300); page.goto(BASE + f"#/note/{ids['b']}"); page.wait_for_timeout(800)
    assert page.locator('.split').count() == 0, 'closed pairs stay closed'
    # 8. "Beside" next to a connection, from a typed note.
    page.goto(BASE + f"#/note/{ids['c']}"); page.wait_for_selector('.connections [data-beside]'); page.wait_for_timeout(300)
    page.locator(f".connections [data-beside=\"{ids['b']}\"]").first.click()
    page.wait_for_selector('.split [data-side=b] .ink-page canvas.ink-main', timeout=10000); page.wait_for_timeout(500)
    assert f"#/note/{ids['c']}?beside={ids['b']}" in page.url
    assert page.locator('.split [data-side=a] .rich').count() == 1, 'the typed note stays on the left'
    page.screenshot(path=f'{OUT}/e-split-typed-{tag}.png')
    page.locator('[data-split=close]').click(); page.wait_for_timeout(500)
    # 9. From a note open inside a notebook (how the iPad shows notebooks), tapped with a finger.
    nb = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const b = await V.saveNotebook(M.newNotebook({{ title: 'Investing', region: 'investing' }}));
      const n = V.state.notes.get('{ids['a']}'); await V.saveNote({{ ...n, notebook: b.id, section: b.sections[0].id }});
      return b.id; }})()""")
    page.goto(BASE + f"#/notebook/{nb}?note={ids['a']}"); page.wait_for_selector('#nb-pane .ink-page canvas.ink-main'); page.wait_for_timeout(600)
    page.locator('#nb-pane [data-beside-pick]').first.tap(); page.wait_for_selector('#np-list [data-id]')
    page.locator(f"#np-list [data-id=\"{ids['b']}\"]").tap()
    page.wait_for_selector('.split [data-side=b] .ink-page canvas.ink-main', timeout=10000)
    assert f"#/note/{ids['a']}?beside={ids['b']}" in page.url, 'opens beside from inside a notebook'
    page.locator('[data-split=close]').tap(); page.wait_for_timeout(500)
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
