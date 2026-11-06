"""Whiteboard: cards, stickies, text, frames, arrows, pen, move, undo, persistence, export."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js: page.evaluate(js)
    wide = page.viewport_size['width'] >= 900
    tag = int(wide)
    nbid = J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Career', region: 'career' }));
      for (const [t, b] of [['Led the Q3 platform rollout', 'Coordinated four teams to ship a week early. Same-day set-up for new users.'], ['Town hall deck', 'Cut it to six slides. MD sent the team a thank-you.'], ['Coaching two new joiners', 'Both up to speed in month one.'], ['Promotion case 2027', 'Move up a grade in the March 2027 cycle. Lead with outcomes, one clear ask.']])
        await V.saveNote(M.newNote({ title: t, titleAuto: false, notebook: nb.id, region: 'career', inbox: false, body: b }));
      return nb.id; }""")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_timeout(500)
    page.locator('.nb-new [data-newnote=board]').click()
    page.wait_for_selector('.bd-stage'); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/bd-empty-{tag}.png')
    bid = J("location.hash.match(/note\\/(n[^?&]+)/)?.[1] || location.hash"); print('board route', bid)
    # cards through the picker
    for t in ['Led the Q3', 'Promotion case']:
        page.locator('[data-tool=card]').click(); page.wait_for_selector('#np-q'); page.fill('#np-q', t); page.wait_for_timeout(200)
        page.locator('#np-list [data-id]').first.click(); page.wait_for_timeout(400)
    assert page.locator('.bo-card').count() == 2
    # a new note from the picker
    page.locator('[data-tool=card]').click(); page.wait_for_selector('#np-q'); page.fill('#np-q', 'Ask Wei Ling to sponsor'); page.wait_for_timeout(200)
    page.locator('#np-list [data-new]').click(); page.wait_for_timeout(500)
    assert page.locator('.bo-card').count() == 3
    made = J("import('./js/vault.js').then(V => [...V.state.notes.values()].some(n => n.title === 'Ask Wei Ling to sponsor'))"); assert made
    st = page.locator('#bd-stage').bounding_box()
    # move cards apart with the mouse (select tool)
    def drag(loc, dx, dy):
        b = loc.bounding_box(); x, y = b['x'] + 20, b['y'] + 12
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + dx / 2, y + dy / 2, steps=4); page.mouse.move(x + dx, y + dy, steps=4); page.mouse.up(); page.wait_for_timeout(150)
    cards = page.locator('.bo-card')
    k = 1 if wide else 0.42
    if not wide:
        for _ in range(3): page.locator('[data-act=zoom-out]').click()
        page.wait_for_timeout(200)
    drag(cards.nth(0), -260 * k, -120 * k - (40 if not wide else 0))
    drag(cards.nth(1), 260 * k, 40 * k)
    drag(cards.nth(2), -200 * k, 170 * k + (60 if not wide else 0))
    # sticky
    page.locator('[data-tool=sticky]').click(); page.mouse.click(st['x'] + st['width'] * 0.5, st['y'] + st['height'] * 0.4)
    page.wait_for_selector('.bo-sticky .bt[contenteditable]'); page.keyboard.type('Outcome first'); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    assert page.locator('.bo-sticky').inner_text().strip() == 'Outcome first'
    # text
    page.locator('[data-tool=text]').click(); page.mouse.click(st['x'] + st['width'] * 0.62, st['y'] + st['height'] * 0.78)
    page.wait_for_selector('.bo-text .bt[contenteditable]'); page.keyboard.type('send by 8 Nov!'); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # arrow from the first card to the Promotion card
    a = page.locator('.bo-card', has_text='Led the Q3').bounding_box(); b = page.locator('.bo-card', has_text='Promotion case').bounding_box()
    page.locator('[data-tool=arrow]').click()
    page.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2); page.mouse.down(); page.mouse.move(b['x'] + 30, b['y'] + 30, steps=10); page.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2, steps=4); page.mouse.up(); page.wait_for_timeout(200)
    arrows = J("[...document.querySelectorAll('[data-aid]')].length"); print('arrows', arrows)
    if arrows != 1: page.screenshot(path=f'{OUT}/bd-dbg-{tag}.png'); print('A', a, 'B', b)
    assert arrows == 1
    # frame around the sticky with a drag
    s = page.locator('.bo-sticky').bounding_box()
    page.locator('[data-tool=frame]').click()
    page.mouse.move(s['x'] - 40, s['y'] - 40); page.mouse.down(); page.mouse.move(s['x'] + s['width'] + 60, s['y'] + s['height'] + 40, steps=8); page.mouse.up(); page.wait_for_timeout(200)
    page.keyboard.type('Story'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    assert page.locator('.bf-title').inner_text().strip() == 'Story'
    # pen: draw a squiggle
    page.locator('[data-tool=pen]').click()
    x0, y0 = st['x'] + st['width'] * 0.3, st['y'] + st['height'] * 0.8
    page.mouse.move(x0, y0); page.mouse.down()
    for i in range(1, 30): page.mouse.move(x0 + i * 6, y0 + (12 if i % 2 else -12))
    page.mouse.up(); page.wait_for_timeout(200)
    page.keyboard.press('Escape')
    strokes = J("document.querySelectorAll('#bd-strokes [data-sid]').length"); assert strokes == 1
    # moving the frame carries the sticky
    sb = page.locator('.bo-sticky').bounding_box()
    t = page.locator('.bf-title').bounding_box()
    page.mouse.move(t['x'] + 10, t['y'] + 8); page.mouse.down(); page.mouse.move(t['x'] + 40, t['y'] + 30, steps=5); page.mouse.move(t['x'] + 70, t['y'] + 50, steps=5); page.mouse.up(); page.wait_for_timeout(200)
    sb2 = page.locator('.bo-sticky').bounding_box(); print('sticky moved by', sb2['x'] - sb['x'], sb2['y'] - sb['y'])
    assert sb2['x'] - sb['x'] > 30 and sb2['y'] - sb['y'] > 20, 'frame did not carry the sticky'
    # undo the move, redo it
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    sb3 = page.locator('.bo-sticky').bounding_box(); assert abs(sb3['x'] - sb['x']) < 2, ('undo', sb3, sb)
    page.keyboard.press('Control+Shift+z'); page.wait_for_timeout(200)
    sb4 = page.locator('.bo-sticky').bounding_box(); assert abs(sb4['x'] - sb2['x']) < 2
    # select the sticky: selection bar, recolour
    page.keyboard.press('Escape')
    sb = page.locator('.bo-sticky').bounding_box(); page.mouse.click(sb['x'] + 20, sb['y'] + sb['height'] - 15); page.wait_for_timeout(200)
    assert page.locator('#bd-selbar').is_visible()
    page.locator('#bd-selbar [data-sbcol=pink]').click(); page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/bd-board-{tag}.png')
    # fit and screenshot
    page.locator('[data-act=zoom-fit]').click(); page.wait_for_timeout(400)
    page.mouse.click(st['x'] + st['width'] - 30, st['y'] + st['height'] * 0.5); page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/bd-fit-{tag}.png')
    # leave and come back: everything saved
    page.wait_for_timeout(900)
    nid = J("location.hash.match(/note[=\\/]([^?&]+)/)[1]")
    body = J(f"import('./js/vault.js').then(V => V.state.notes.get('{nid}').body)"); print('BODY:', body.replace('\n', ' | '))
    assert '[[Led the Q3 platform rollout]]' in body and '## Story' in body and 'Outcome first' in body and '→' in body
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_timeout(500)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.bo-card'); page.wait_for_timeout(400)
    counts = J("({cards: document.querySelectorAll('.bo-card').length, stickies: document.querySelectorAll('.bo-sticky').length, frames: document.querySelectorAll('.bo-frame').length, texts: document.querySelectorAll('.bo-text').length, arrows: document.querySelectorAll('[data-aid]').length, strokes: document.querySelectorAll('[data-sid]').length})"); print('after reload', counts)
    assert counts == {'cards': 3, 'stickies': 1, 'frames': 1, 'texts': 1, 'arrows': 1, 'strokes': 1}
    # the Led note shows the board as a mention
    led = J("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title.startsWith('Led')).id)")
    from_conn = J(f"import('./js/connections.js').then(C => import('./js/vault.js').then(V => {{ const n = V.state.notes.get('{led}'); return Object.keys(C).filter(k => typeof C[k] === 'function').map(k => {{ try {{ const r = C[k](n); return k + ':' + (Array.isArray(r) ? r.map(x => (x.note || x).title).join(',') : '') }} catch(e) {{ return k + ':err' }} }}) }}))"); print('connections of Led:', from_conn)
    # export renders
    size = J(f"""import('./js/boarddraw.js').then(async B => {{ const V = await import('./js/vault.js'); const n = V.state.notes.get('{nid}'); const c = await B.renderBoardCanvas(await V.loadPage(n.pages[0].id), {{ widthPx: 1600 }}); return [c.width, c.height]; }})"""); print('export canvas', size)
    J(f"""import('./js/boarddraw.js').then(async B => {{ const V = await import('./js/vault.js'); const n = V.state.notes.get('{nid}'); const c = await B.renderBoardCanvas(await V.loadPage(n.pages[0].id), {{ widthPx: 1600 }}); window.__png = c.toDataURL('image/png'); }})""")
    import base64
    png = J("window.__png"); open(f'{OUT}/bd-export-{tag}.png', 'wb').write(base64.b64decode(png.split(',')[1]))
    # delete a card removes its arrow; undo brings both back
    c = page.locator('.bo-card', has_text='Promotion case').bounding_box(); page.mouse.click(c['x'] + c['width'] * 0.6, c['y'] + c['height'] - 12); page.wait_for_timeout(150)
    page.keyboard.press('Delete'); page.wait_for_timeout(200)
    assert J("document.querySelectorAll('[data-aid]').length") == 0 and page.locator('.bo-card').count() == 2
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    assert J("document.querySelectorAll('[data-aid]').length") == 1 and page.locator('.bo-card').count() == 3
    print('OK board')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
