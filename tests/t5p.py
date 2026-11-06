"""Round 6b: a note's own map, time filter, themes, the week on Today, linking by itself."""
from dbg import *
from calib import FILED, INBOX
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    ids = J("""async ({ filed, inbox }) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false });
      const ids = {};
      for (const [r, t, b] of filed) ids[t] = (await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: r, inbox: false }))).id;
      for (const [r, t, b] of inbox) ids[t] = (await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: null, inbox: true }))).id;
      const promo = V.state.notes.get(ids['Q3 promotion case']);
      await V.saveNote({ ...promo, body: promo.body + '\\n\\nSee [[Feedback from MD]] and [[Team offsite agenda]].' });
      await V.saveNote(M.newNote({ title: 'Promo case: evidence', titleAuto: false, body: 'Evidence for the promotion case.', region: 'career', inbox: false, parent: ids['Q3 promotion case'] }));
      // an old note, to test the time filter
      const old = await V.saveNote(M.newNote({ title: 'Old trip notes', titleAuto: false, body: 'Bali 2023', region: 'travel', inbox: false }));
      await V.saveNote({ ...old, createdAt: Date.now() - 200 * 86400000, updatedAt: Date.now() - 200 * 86400000 }, { touch: false });
      const O = await import('./js/organiser.js'); await O.apply(await O.plan([...V.state.notes.values()].filter((n) => n.inbox)));
      return ids; }""", {'filed': FILED, 'inbox': INBOX})
    # a note's own map
    page.goto(BASE + f"#/note/{ids['Q3 promotion case']}"); page.wait_for_selector('.minimap svg'); page.wait_for_timeout(400)
    n_nodes = page.locator('.minimap svg circle').count(); print('mini-map nodes', n_nodes); assert n_nodes >= 4
    page.locator('.minimap').scroll_into_view_if_needed(); page.screenshot(path=f'{OUT}/p-minimap-{tag}.png')
    page.locator('.minimap .mm-head a').click(); page.wait_for_selector('#map-state:not([hidden])', timeout=10000); page.wait_for_timeout(800)
    assert 'Connections of' in page.locator('#map-state').inner_text()
    page.screenshot(path=f'{OUT}/p-focus-{tag}.png')
    # time filter
    page.goto(BASE + '#/map'); page.wait_for_selector('[data-time]'); page.wait_for_timeout(500)
    page.locator('[data-time]').click(); page.locator('.popover [data-days="30"]').click(); page.wait_for_timeout(300)
    m = J("import('./js/vault.js').then(V => [...V.state.notes.values()].length)")
    assert 'Past month' in page.locator('[data-time]').inner_text()
    # themes, once related lines are worked out
    th = []
    for _ in range(60):
        page.wait_for_timeout(500)
        th = J("import('./js/mapdata.js').then(D => D.themes(D.connections().edges).map(t => [t.region, t.name, t.ids.length]))")
        if th: break
    print('themes', th); assert th and th[0][0] == 'property'
    page.screenshot(path=f'{OUT}/p-themes-{tag}.png')
    # the week on Today
    page.goto(BASE + '#/today'); page.wait_for_selector('.week-card', timeout=15000)
    wk = page.locator('.week-card').inner_text(); print('week:', wk.replace('\n', ' | ')); assert 'new notes' in wk and 'Property & home' in wk
    page.screenshot(path=f'{OUT}/p-week-{tag}.png')
    page.locator('[data-wk-hide]').click(); page.wait_for_timeout(200); assert page.locator('.week-card').count() == 0
    # linking by itself (off by default), with undo
    links0 = J("import('./js/mapdata.js').then(D => D.connections().counts.link)")
    made = J("""import('./js/mapassist.js').then(async A => { const V = await import('./js/vault.js'); A.AUTO_LINK_MIN; await V.updateDevice({ autoLink: true }); return A.autoLink(); })""")
    links1 = J("import('./js/mapdata.js').then(D => D.connections().counts.link)"); print('auto-linked', made, links0, '->', links1)
    if made:
        assert links1 > links0
        page.goto(BASE + '#/inbox'); page.wait_for_selector('.org-move'); 
        assert page.locator('.org-move', has_text='linked them').count() >= 1
        page.locator('.org-move', has_text='linked them').first.locator('[data-undo]').click(); page.wait_for_timeout(500)
        links2 = J("import('./js/mapdata.js').then(D => D.connections().counts.link)"); print('after undo', links2); assert links2 == links1 - 1
    print('OK round 6')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
