"""Recently deleted. Deleting a note, board or notebook moves it to Recently
deleted (kept, encrypted and synced, out of every other screen) for 30 days.
Put it back with its pages, files and links; a notebook comes back with the
notes deleted with it. Delete now / Empty remove it for good (files too), and
after 30 days it goes by itself."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const a = await V.saveNote(M.newNote({ kind: 'note', title: 'Promotion case', titleAuto: false, region: 'career', inbox: false, body: 'Lead with outcomes.' }));
      const c = await V.saveNote(M.newNote({ kind: 'note', title: 'Mentor coffee', titleAuto: false, region: 'career', inbox: false, body: 'Ask about the case.' }));
      await V.linkNotes(a.id, c.id);
      const pg = M.newPage({}); await V.savePage(pg.id, { ...V.emptyPageData(), strokes: [{ id: 'k1', t: 'pen', pen: 'ballpoint', c: '#1B2A38', s: 3, sp: 1, pts: [100, 100, 0.5, 200, 120, 0.5, 300, 100, 0.5], at: 1 }] });
      const ink = await V.saveNote(M.newNote({ kind: 'ink', title: 'Meeting with Wei Ling', titleAuto: false, region: 'career', inbox: false, pages: [pg] }));
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Kyoto trip', region: 'travel' }));
      const n1 = await V.saveNote(M.newNote({ kind: 'note', title: 'Ryokan', titleAuto: false, notebook: nb.id, region: 'travel', inbox: false, body: 'Booked for March.' }));
      const n2 = await V.saveNote(M.newNote({ kind: 'note', title: 'Temples', titleAuto: false, notebook: nb.id, region: 'travel', inbox: false, body: 'Fushimi Inari early.' }));
      return { a: a.id, c: c.id, ink: ink.id, page: pg.id, nb: nb.id, n1: n1.id, n2: n2.id }; })()""")
    # 1. Delete the typed note from its own screen: it goes to Recently deleted, not away.
    page.goto(BASE + f"#/note/{ids['a']}"); page.wait_for_selector('#n-rich .rich'); page.wait_for_timeout(300)
    J(f"""(async () => {{ const V = await import('./js/vault.js'); await V.binNote('{ids['a']}'); }})()""")
    st = J(f"""import('./js/vault.js').then(async V => {{ const db = await import('./js/db.js'); const r = await db.records.get('{ids['a']}');
      return {{ live: V.state.notes.has('{ids['a']}'), binned: V.state.bin.has('{ids['a']}'), stored: !!r && !r.deleted, dirty: !!r?.dirty, links: V.state.bin.get('{ids['a']}').links }}; }})""")
    print('after deleting a note:', st)
    assert not st['live'] and st['binned'] and st['stored'] and st['dirty'], 'kept (and to be synced), out of sight'
    assert st['links'] == [ids['c']], 'it keeps its link for when it comes back'
    # It's gone from All notes and search.
    page.goto(BASE + '#/notes'); page.wait_for_timeout(500)
    assert 'Promotion case' not in page.locator('main').inner_text()
    # 2. The handwritten note and the notebook (with its notes).
    J(f"""(async () => {{ const V = await import('./js/vault.js'); await V.binNote('{ids['ink']}'); await V.binNotebook('{ids['nb']}'); }})()""")
    # Still there after loading everything again (as on the next unlock).
    J("import('./js/vault.js').then(V => V.loadAll())")
    page.goto(BASE + '#/deleted'); page.wait_for_selector('.deleted-page'); page.wait_for_timeout(300)
    rows = page.locator('.bin-row').all_inner_texts()
    print('Recently deleted:', [r.replace('\\n', ' | ') for r in rows])
    assert len(rows) == 3 and any('Kyoto trip' in r and 'with 2 notes' in r for r in rows) and any('Handwritten note' in r for r in rows)
    assert all('Goes for good in 30 days' in r for r in rows)
    if wide: assert '3' in page.locator('.side-link[href="#/deleted"]').inner_text()
    page.screenshot(path=f'{OUT}/b-deleted-{tag}.png')
    # 3. Put back: the notebook brings its notes; the note gets its link back on the map's terms.
    page.locator(f'[data-restore="{ids["nb"]}"]').click(); page.wait_for_timeout(500)
    page.locator(f'[data-restore="{ids["a"]}"]').click(); page.wait_for_timeout(500)
    back = J(f"""import('./js/vault.js').then(V => ({{ nb: V.state.notebooks.has('{ids['nb']}'), notes: ['{ids['n1']}', '{ids['n2']}', '{ids['a']}'].every(id => V.state.notes.has(id)), inNb: V.state.notes.get('{ids['n1']}')?.notebook === '{ids['nb']}', bin: [...V.state.bin.keys()] }}))""")
    print('after putting back:', back)
    assert back['nb'] and back['notes'] and back['inNb'] and back['bin'] == [ids['ink']]
    conn = J(f"import('./js/connections.js').then(C => import('./js/vault.js').then(V => C.linkedWith(V.state.notes.get('{ids['a']}')).map(x => x.note?.id || x.id)))")
    print('links of the note put back:', conn); assert ids['c'] in str(conn)
    # 4. Delete now: the handwritten note and its page go for good.
    page.locator(f'[data-forever="{ids["ink"]}"]').click(); page.wait_for_selector('.sheet'); page.locator('.sheet [data-yes]').click(); page.wait_for_timeout(600)
    gone = J(f"""import('./js/vault.js').then(async V => {{ const db = await import('./js/db.js'); const r = await db.records.get('{ids['ink']}');
      return {{ bin: V.state.bin.has('{ids['ink']}'), record: !r || r.deleted, page: !(await V.fileBytes('{ids['page']}')) }}; }})""")
    print('deleted for good:', gone); assert not gone['bin'] and gone['record'] and gone['page']
    assert page.locator('.deleted-page .empty').count() == 1
    # 5. After 30 days it goes by itself.
    J(f"""(async () => {{ const V = await import('./js/vault.js'); await V.binNote('{ids['c']}'); }})()""")
    kept = J("import('./js/vault.js').then(V => V.purgeBin(Date.now() + 29 * 864e5))")
    gone30 = J("import('./js/vault.js').then(V => V.purgeBin(Date.now() + 31 * 864e5))")
    print('purged at 29 days:', kept, '| at 31 days:', gone30); assert kept == 0 and gone30 == 1
    # 6. Empty: everything in it goes.
    J(f"""(async () => {{ const V = await import('./js/vault.js'); await V.binNote('{ids['a']}'); await V.binNotebook('{ids['nb']}'); }})()""")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200); page.goto(BASE + '#/deleted'); page.wait_for_selector('.deleted-page')
    page.locator('[data-act=empty]').click(); page.wait_for_selector('.sheet'); page.locator('.sheet [data-yes]').click(); page.wait_for_timeout(800)
    left = J(f"import('./js/vault.js').then(V => ({{ bin: V.state.bin.size, nb: V.state.notebooks.has('{ids['nb']}'), n1: V.state.notes.has('{ids['n1']}') }}))")
    print('after Empty:', left); assert left == {'bin': 0, 'nb': False, 'n1': False}
    # 7. The Delete button on a note now says where it goes.
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Scratch', titleAuto: false, region: 'career', inbox: false, body: 'x' }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich'); page.wait_for_timeout(300)
    page.locator('[data-act=more]').first.click(); page.wait_for_selector('.sheet .menu')
    page.locator('.sheet .menu button', has_text='Delete note').click(); page.wait_for_timeout(300)
    body = page.locator('.sheet').last.inner_text(); print('delete sheet:', body.replace('\n', ' | '))
    assert 'Recently deleted' in body
    page.locator('.sheet [data-yes]').click(); page.wait_for_timeout(600)
    assert J(f"import('./js/vault.js').then(V => V.state.bin.has('{nid}'))"), 'the Delete button moves it to Recently deleted'
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
