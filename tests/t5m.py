"""Round 4: the map organiser (files notes, adds regions, undo, runs by itself), colour picker, version in Settings."""
from dbg import *
from calib import FILED, INBOX
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 700
    tag = 'ipad' if wide else 'phone'
    J("""async ({ filed, inbox }) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      for (const [r, t, b] of filed) await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: r, inbox: false }));
      for (const [r, t, b] of inbox) { const n = M.newNote({ title: t, titleAuto: false, body: b, region: null, inbox: true }); await V.saveNote(n); } }""", {'filed': FILED, 'inbox': INBOX[:8]})
    J("import('./js/vault.js').then(V => V.updateDevice({ organise: false }))")  # manual first
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-org'); page.wait_for_timeout(400)
    page.locator('#map-org').click(); page.wait_for_selector('.org-group', timeout=120000); page.wait_for_timeout(300)
    groups = page.locator('.org-group h3').all_inner_texts(); print('groups', [g.replace('\n', ' ') for g in groups])
    assert any('Property & home' in g and 'New region' in g for g in groups)
    page.screenshot(path=f'{OUT}/m-review-{tag}.png')
    page.locator('[data-apply]').click(); page.wait_for_timeout(1200)
    st = J("""import('./js/vault.js').then(V => ({ regions: V.state.config.regions.map(r => r.name), inbox: [...V.state.notes.values()].filter(n => n.inbox).map(n => n.title),
      prop: [...V.state.notes.values()].filter(n => n.region === 'property').map(n => n.title) }))"""); print(st)
    assert 'Property & home' in st['regions'] and len(st['prop']) == 4
    assert page.locator('#map-chips .chip', has_text='Property').count() == 1
    page.screenshot(path=f'{OUT}/m-map-{tag}.png')
    # undo from the inbox puts a note back
    page.goto(BASE + '#/inbox'); page.wait_for_selector('[data-undo]'); n_undo = page.locator('[data-undo]').count(); print('moves listed', n_undo)
    page.screenshot(path=f'{OUT}/m-inbox-{tag}.png', full_page=True)
    title = page.locator('.org-move .row-title').first.inner_text()
    page.locator('[data-undo]').first.click(); page.wait_for_timeout(600)
    back = J(f"import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title === {title!r}).inbox)"); print('undo', title, back); assert back
    # undoing every move into a new region removes the region again
    J("""async () => { const O = await import('./js/organiser.js'); for (const e of [...O.organiserLog()]) await O.undo(e.id); }""")
    regs = J("import('./js/vault.js').then(V => V.state.config.regions.map(r => r.name))"); print('after undo all', regs)
    assert 'Property & home' not in regs
    # on its own: inbox notes that have settled get filed
    J("""async () => { const V = await import('./js/vault.js'); await V.updateDevice({ organise: true });
      for (const n of [...V.state.notes.values()].filter(n => n.inbox)) await V.saveNote({ ...n, updatedAt: Date.now() - 60000 }, { touch: false }); }""")
    page.goto(BASE + '#/today'); page.wait_for_timeout(300)
    res = J("import('./js/organiser.js').then(O => O.autoRun()).then(r => r && { filed: r.filed, created: r.created.map(x => x.name) })"); print('auto', res)
    assert res and res['filed'] >= 4 and 'Property & home' in res['created']
    # colour picker: text colours by hue, highlights, recent
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); return (await V.saveNote(M.newNote({ title: 'Colours', titleAuto: false, region: 'career', inbox: false, body: 'Some words to colour' }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-fprops [data-act=colour]'); page.wait_for_timeout(400)
    page.locator('.ProseMirror p').first.click(); page.keyboard.press('End')
    # Shift+Home selects nothing in Chromium's phone emulation; select letter by letter.
    for _ in range(25): page.keyboard.press('Shift+ArrowLeft')
    page.locator('#n-fprops [data-act=colour]').click(); page.wait_for_selector('.cpick')
    assert page.locator('.cpick .cgrid').first.locator('.cswatch').count() == 30
    page.locator('.cpick [data-color="#9B2C2C"]').click(); page.wait_for_timeout(300)
    style = J("document.querySelector('.ProseMirror span[style]').getAttribute('style')"); print('style', style); assert '--tcd' in style
    assert page.locator('#n-fprops [data-tcol="#9B2C2C"]').count() == 1, 'recent colour shows in the toolbar'
    # version in settings
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-version'); page.wait_for_timeout(500)
    print('version', page.locator('#s-version').inner_text())
    print('OK round 4')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
