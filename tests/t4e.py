from dbg import *
def steps(page):
    r = page.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const db = await import('./js/db.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Journal', region: 'people' }));
      const pg = M.newPage({});
      const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Private page', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'people', inbox: false, pages: [pg] }));
      await V.savePage(pg.id, { v: 1, strokes: [{ id: 'k1', t: 'pen', pen: 'fountain', c: '#000', s: 3, sp: 1, pts: [1,1,0.5,50,50,0.5] }], objects: [], tomb: [], at: 0 });
      await V.setupSealed('quiet orchid ledger nine');
      await V.setNotebookSealed(nb.id, true);
      const fk = (await db.files.get(pg.id)).k, rk = (await db.records.get(n.id)).env.k, bk = (await db.records.get(nb.id)).env.k;
      V.lockSealed();
      const hidden = !V.state.notebooks.has(nb.id) && !V.state.notes.has(n.id);
      let blocked = false; try { V.forgetPageCache(); await V.loadPage(pg.id); } catch { blocked = true; }
      await V.unlockSealed('quiet orchid ledger nine');
      V.forgetPageCache();
      const d = await V.loadPage(pg.id);
      return { fk, rk, bk, hidden, blocked, back: V.state.notebooks.has(nb.id) && d.strokes.length === 1 };
    }""")
    print(r); assert r == {'fk': 's', 'rk': 's', 'bk': 's', 'hidden': True, 'blocked': True, 'back': True}
    print('sealed notebook: ok')
run(steps)
