"""Round 3: typed toolbar like the handwritten one, fields folded, dot grid paper, dark pages."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 700
    tag = 'ipad' if wide else 'phone'
    vw = page.viewport_size['width']
    # typed note: the toolbar is there while reading, and the text doesn't move when editing starts
    nid = J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const n = await V.saveNote(M.newNote({ title: 'Toolbar check', titleAuto: false, region: 'career', inbox: false, body: 'First line of text.' })); return n.id; }""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-tools [data-act=bold]'); page.wait_for_timeout(500)
    top0 = J("document.querySelector('#n-rich').getBoundingClientRect().top")
    for sel in ['#n-tools', '#n-fprops']:
        r = J(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.left, r.right, r.height]; }})()")
        print(sel, r); assert r[0] >= 0 and r[1] <= vw + 0.5, f'{sel} off screen'
    page.locator('.ProseMirror p').first.click(); page.wait_for_timeout(500)
    top1 = J("document.querySelector('#n-rich').getBoundingClientRect().top")
    print('text top read/edit', top0, top1); assert abs(top0 - top1) < 2, 'text jumped when editing started'
    page.keyboard.press('End'); page.keyboard.press('Shift+Home')
    page.locator('#n-tools [data-act=bold]').click(); page.wait_for_timeout(300)
    assert page.locator('.ProseMirror strong').count() == 1
    # toolbar row heights match the handwritten one
    t_h = J("[document.querySelector('#n-tools').offsetHeight, document.querySelector('#n-fprops').offsetHeight]")
    page.locator('#n-edit').click(); page.wait_for_timeout(600)
    # Bold from reading mode starts editing
    page.locator('#n-tools [data-act=bullets]').click(); page.wait_for_timeout(300)
    assert page.locator('#n-edit').inner_text().strip() == 'Done' and page.locator('.ProseMirror ul').count() == 1
    page.screenshot(path=f'{OUT}/l-typed-{tag}.png')
    # a new handwritten note is on dot grid
    page.goto(BASE + '#/note/new?kind=ink'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    ink_id = J("location.hash.match(/note\\/([^?&]+)/)[1]")
    i_h = J("[document.querySelector('#iv-tools').offsetHeight, document.querySelector('#iv-props').offsetHeight]")
    print('row heights typed/ink', t_h, i_h); assert t_h == i_h
    paper = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ink_id}').pages[0].paper)"); print('paper', paper); assert paper == 'dotted'
    # the paper picker changes the whole note
    page.locator('[data-act=pages]').click(); page.wait_for_selector('.paper-tile')
    page.locator('.paper-tile[data-paper=ruled]').click(); page.wait_for_timeout(600)
    paper = J(f"import('./js/vault.js').then(V => [V.state.notes.get('{ink_id}').pages.map(p => p.paper), V.state.device.paper])"); print('after pick', paper); assert paper == [['ruled'], 'ruled']
    page.locator('.paper-tile[data-paper=dotted]').click(); page.wait_for_timeout(600)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    # write something, then switch the app to dark: the page goes dark, the ink light
    pg = page.locator('.ink-page').bounding_box()
    x, y = pg['x'] + pg['width'] * 0.3, pg['y'] + 200
    page.mouse.move(x, y); page.mouse.down()
    for i in range(1, 16): page.mouse.move(x + i * 10, y + (8 if i % 2 else -8))
    page.mouse.up(); page.wait_for_timeout(600)
    px = lambda js: J(f"""(() => {{ const c = document.querySelector('canvas.{js}'); const d = c.getContext('2d').getImageData(Math.round(c.width * 0.9), Math.round(c.height * 0.5), 1, 1).data; return [d[0], d[1], d[2]]; }})()""")
    light_bg = px('ink-bg'); print('paper light', light_bg); assert sum(light_bg) > 600
    page.goto(BASE + '#/settings'); page.wait_for_selector('[data-theme-pick=dark]'); page.locator('[data-theme-pick=dark]').click(); page.wait_for_timeout(300)
    assert J("document.documentElement.dataset.theme") == 'dark'
    page.goto(BASE + f'#/note/{ink_id}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    dark_bg = px('ink-bg'); print('paper dark', dark_bg); assert sum(dark_bg) < 200
    ink = J("""(() => { const c = document.querySelector('canvas.ink-main'); const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let best = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) best = Math.max(best, d[i] + d[i + 1] + d[i + 2]); return best; })()""")
    print('brightest ink', ink); assert ink > 550, 'ink should show light on dark paper'
    page.screenshot(path=f'{OUT}/l-dark-ink-{tag}.png')
    # exports stay light
    exp = J(f"""import('./js/export.js').then(async E => {{ const V = await import('./js/vault.js'); const [c] = await E.noteCanvases(V.state.notes.get('{ink_id}')); const d = c.getContext('2d').getImageData(Math.round(c.width * 0.9), Math.round(c.height * 0.5), 1, 1).data; return [d[0], d[1], d[2]]; }})""")
    print('export paper', exp); assert sum(exp) > 600
    # turning off dark pages keeps paper light in dark mode
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-darkpaper'); page.locator('#s-darkpaper').uncheck(); page.wait_for_timeout(300)
    page.goto(BASE + f'#/note/{ink_id}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    print('paper, dark pages off', px('ink-bg')); assert sum(px('ink-bg')) > 600
    page.goto(BASE + '#/settings'); page.locator('#s-darkpaper').check(); page.locator('[data-theme-pick=auto]').click(); page.wait_for_timeout(200)
    assert J("document.documentElement.dataset.theme || ''") == ''
    # old notebooks on lined paper switch to dot grid once
    res = J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Old', paper: 'ruled' }));
      await V.saveConfig({ paperV2: false }); return nb.id; }""")
    J("import('./js/vault.js').then(V => { setTimeout(() => V.lock(), 50); })")
    page.wait_for_timeout(800); page.goto(BASE + '#/today'); page.reload(); page.wait_for_selector('input[type=password]'); page.fill('input[type=password]', PASS); page.keyboard.press('Enter'); page.wait_for_selector('.today-page', timeout=20000); page.wait_for_timeout(800)
    nbp = J(f"import('./js/vault.js').then(V => [V.state.notebooks.get('{res}').paper, V.state.config.paperV2])"); print('migrated', nbp); assert nbp == ['dotted', True]
    print('OK round 3')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
