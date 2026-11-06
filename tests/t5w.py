"""Round 13: notes close in meaning, kept up to date by changes only, in the
background for big sets, and saved between sessions. Checked against a full
recompute with the real on-device model."""
from dbg import *
import sys
N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
TOPICS = ['condo renovation quotes and contractor schedule', 'mortgage refinancing with the bank and interest rates', 'marathon training plan and long runs',
          'laksa and chicken rice recipes for the weekend', 'quarterly fraud model review with the data team', 'Kyoto trip hotels and train passes',
          'dividend portfolio and REIT allocation', 'mentoring a junior analyst on stakeholder updates', 'podcast notes on habits and focus', 'github bug triage and feature rollout']
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    J("""async ([N, T]) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: true }); const regions = V.state.config.regions.map(r => r.id);
      const batch = []; for (let i = 0; i < N; i++) batch.push(M.newNote({ title: `${T[i % T.length]} ${i}`, titleAuto: false, body: `Notes about ${T[i % T.length]}. Item ${i}. ${T[(i * 7) % T.length]}.`, region: regions[i % regions.length], inbox: false }));
      await V.saveNotes(batch); const S = await import('./js/semantic.js'); const t = performance.now(); await S.buildIndex(); return performance.now() - t; }""", [N, TOPICS])
    same = """import('./js/semantic.js').then(S => { const a = S.nearLists(); const b = S.nearFull(); if (S.nearBusyNow()) return 'busy';
      let diff = 0; for (const [id, l] of b) { const k = a.get(id) || []; if (k.map(x => x.id).join() !== l.map(x => x.id).join()) diff++; } return { rows: b.size, kept: a.size, diff }; })"""
    def wait_ready():
        for k in range(60):
            st = J("import('./js/semantic.js').then(S => { S.nearLists(); return { nv: S.nearVersion(), iv: S.indexVersion(), busy: S.nearBusyNow() }; })")
            if not st['busy'] and st['nv'] == st['iv']: return
            page.wait_for_timeout(1500)
        raise AssertionError('lists never caught up')
    t0 = J("performance.now()")
    first = J("import('./js/semantic.js').then(S => { const t = performance.now(); S.nearLists(); return { busy: S.nearBusyNow(), ms: Math.round(performance.now() - t) }; })")
    print(f'{N} notes: first ask took {first["ms"]} ms on the spot, in the background: {first["busy"]}')
    if N > 700: assert first['busy'] and first['ms'] < 100
    wait_ready()
    r = J(same); print('after the first full pass:', r); assert r['diff'] == 0
    # Change three notes' topics, delete two, add one.
    J("""async (T) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const ns = [...V.state.notes.values()].filter(n => !n.daily);
      for (const k of [1, 5, 9]) await V.saveNote({ ...ns[k], body: `Completely different: ${T[(k + 3) % T.length]} and more ${T[(k + 3) % T.length]}` });
      await V.deleteNote(ns[2].id); await V.deleteNote(ns[3].id);
      await V.saveNote(M.newNote({ title: 'Fresh note', titleAuto: false, body: `About ${T[4]}`, region: V.state.config.regions[0].id, inbox: false }));
      const S = await import('./js/semantic.js'); await S.buildIndex(); }""", TOPICS)
    t = J("import('./js/semantic.js').then(S => { const t = performance.now(); S.nearLists(); return Math.round(performance.now() - t); })")
    wait_ready()
    r = J(same); print(f'after changing 3, deleting 2, adding 1 (update took {t} ms):', r); assert r['diff'] == 0
    # Saved between sessions: unlock again, and the kept lists are used (only changes redone).
    page.wait_for_timeout(4500)
    saved = J("import('./js/db.js').then(async D => { const r = await D.local.get('near:lists'); return r ? { k: r.k, bytes: r.data.length } : null; })")
    print('saved encrypted on this device:', saved); assert saved and saved['k'] == 'm'
    J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))"); page.wait_for_timeout(1500)
    page.wait_for_selector('input[type=password]'); page.fill('input[type=password]', PASS); page.keyboard.press('Enter'); page.wait_for_selector('.shell', timeout=60000)
    J("import('./js/semantic.js').then(S => S.buildIndex())")
    t = J("import('./js/semantic.js').then(S => { const t = performance.now(); S.nearLists(); return { ms: Math.round(performance.now() - t), busy: S.nearBusyNow() }; })")
    wait_ready()
    r = J(same); print('after unlocking again:', t, r); assert r['diff'] == 0 and not t['busy']
    print('OK')
run(steps, vp=(1180, 820), mob=False)
