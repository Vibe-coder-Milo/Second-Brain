"""Round 5: hide the side panel while writing, coloured links, the map's connections and assistant."""
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
      for (const [r, t, b] of inbox) ids[t] = (await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: r === 'none' ? null : (['property', 'health', 'food', 'projects', 'money'].includes(r) ? null : r), inbox: ['property', 'health', 'food', 'projects', 'money', 'none'].includes(r) }))).id;
      const promo = V.state.notes.get(ids['Q3 promotion case']);
      await V.saveNote({ ...promo, body: promo.body + '\\n\\nSee [[Feedback from MD]] and [[Team offsite agenda]].' });
      await V.saveNote(M.newNote({ title: 'Promo case: evidence', titleAuto: false, body: 'Evidence for the promotion case.', region: 'career', inbox: false, parent: ids['Q3 promotion case'] }));
      return ids; }""", {'filed': FILED, 'inbox': INBOX})
    # coloured links in a typed note
    page.goto(BASE + f"#/note/{ids['Q3 promotion case']}"); page.wait_for_selector('.ProseMirror .wikilink:not(.wl-br)'); page.wait_for_timeout(400)
    col = J("[getComputedStyle(document.querySelector('.ProseMirror .wikilink:not(.wl-br)')).color, getComputedStyle(document.querySelector('.ProseMirror p')).color, getComputedStyle(document.querySelector('.ProseMirror .wikilink:not(.wl-br)')).fontWeight]")
    print('link colour vs text', col); assert col[0] != col[1] and int(col[2]) >= 600
    # hide the side panel (iPad and computers)
    if wide:
        w0 = J("document.querySelector('#n-rich').getBoundingClientRect().width")
        page.locator('.focus-btn').click(); page.wait_for_timeout(400)
        w1 = J("document.querySelector('#n-rich').getBoundingClientRect().width")
        side = J("getComputedStyle(document.querySelector('.sidebar')).display"); print('typed width', w0, w1, 'sidebar', side)
        assert side == 'none' and w1 > w0 + 100
        page.goto(BASE + '#/map'); page.wait_for_selector('#map-org'); page.wait_for_timeout(300)
        assert J("getComputedStyle(document.querySelector('.sidebar')).display") != 'none', 'side panel comes back on other screens'
        page.goto(BASE + f"#/note/{ids['Feedback from MD']}"); page.wait_for_selector('.focus-btn[aria-pressed=true]'); page.wait_for_timeout(300)
        assert J("getComputedStyle(document.querySelector('.sidebar')).display") == 'none', 'remembered'
        page.locator('.focus-btn').click(); page.wait_for_timeout(300)
    else:
        assert not page.locator('.focus-btn').is_visible()
    # the map: every kind of connection, the assistant's findings
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-org')
    for _ in range(80):
        page.wait_for_timeout(500)
        if J("import('./js/mapdata.js').then(D => D.connections().counts.related)"): break
    counts = J("import('./js/mapdata.js').then(D => D.connections().counts)"); print('counts', counts)
    assert counts['link'] >= 2 and counts['sub'] == 1 and counts['related'] >= 2
    if not wide: page.locator('#map-legend-btn').click(); page.wait_for_timeout(200)
    legend = page.locator('#map-legend').inner_text(); assert 'Your links' in legend and 'Related' in legend
    page.locator('[data-kind=related]').click(); page.wait_for_timeout(300)
    assert 'related' not in J("import('./js/views/map.js').then(() => JSON.parse(localStorage.getItem('sb-map-shown')))")
    page.locator('[data-kind=related]').click(); page.wait_for_timeout(300)
    if not wide: page.locator('#map-legend-btn').click(); page.wait_for_timeout(200)
    page.wait_for_selector('#map-notice-btn:not([hidden])', timeout=20000)
    page.locator('#map-notice-btn').click(); page.wait_for_selector('#map-notice.open')
    text = page.locator('#map-notice').inner_text(); print('noticed:', text.replace('\n', ' | ')[:300])
    assert 'belong together' in text
    page.screenshot(path=f'{OUT}/n-notice-{tag}.png')
    page.locator('#map-notice [data-show]').first.click(); page.wait_for_timeout(1200)
    assert page.locator('#map-state:not([hidden])').count() == 1
    page.screenshot(path=f'{OUT}/n-show-{tag}.png')
    # link a group the assistant found: the related lines become your links
    before = counts['link']
    J("import('./js/mapassist.js').then(async A => { const g = A.noticed().find(x => x.kind === 'group'); await g.action.run(); })"); page.wait_for_timeout(600)
    after = J("import('./js/mapdata.js').then(D => D.connections().counts.link)"); print('links', before, '->', after); assert after > before
    # dismiss a related line: it stays gone
    pair = J("import('./js/mapdata.js').then(D => { const e = D.connections().edges.find(x => x.kind === 'related'); return e && [e.a, e.b]; })")
    if pair:
        J(f"import('./js/mapassist.js').then(A => A.notRelated({pair[0]!r}, {pair[1]!r}))"); page.wait_for_timeout(400)
        gone = J(f"import('./js/mapdata.js').then(D => !D.connections().edges.some(x => x.kind === 'related' && [x.a, x.b].sort().join() === [{pair[0]!r}, {pair[1]!r}].sort().join()))")
        print('dismissed stays gone', gone); assert gone
    print('OK round 5')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
