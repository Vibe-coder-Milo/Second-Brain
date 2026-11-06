"""How the app copes with lots of notes. Usage: scale.py N"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..'))  # dbg.py, mockgh.py
import sys, time
from dbg import *
N = int(sys.argv[1])
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    t = J("""async (N) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: false });
      const words = 'renovation mortgage condo tenant dividend portfolio REIT promotion manager stakeholder rollout kyoto flight hotel marathon recipe laksa github bug feature budget tax insurance coffee mentor birthday book podcast framework lesson fraud mule conduct model data team review quarterly plan'.split(' ');
      const regions = V.state.config.regions.map((r) => r.id); const t0 = performance.now(); const batch = [];
      for (let i = 0; i < N; i++) { const w = () => words[Math.floor(Math.random() * words.length)];
        batch.push(M.newNote({ title: `Note ${i} ${w()} ${w()}`, titleAuto: false, body: Array.from({ length: 8 }, () => Array.from({ length: 16 }, w).join(' ')).join('\\n\\n') + (i > 3 && i % 5 === 0 ? `\\n\\nSee [[Note ${i - 3} ${'x'}]]` : ''), region: regions[i % regions.length], inbox: i % 15 === 0, createdAt: Date.now() - Math.random() * 3 * 365 * 864e5 }));
        if (batch.length === 200) { await V.saveNotes(batch.splice(0)); } }
      if (batch.length) await V.saveNotes(batch); return performance.now() - t0; }""", N)
    print(f'seeded {N} notes in {t/1000:.1f}s')
    J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))"); page.wait_for_timeout(1500)
    page.wait_for_selector('input[type=password]')
    t0 = time.time(); page.fill('input[type=password]', PASS); page.keyboard.press('Enter'); page.wait_for_selector('.today-page', timeout=120000)
    print(f'unlock: {(time.time()-t0)*1000:.0f} ms')
    heap = J("Math.round(performance.memory.usedJSHeapSize / 1048576)"); print('memory MB', heap)
    for route, sel in [('#/notes', '.row-title'), ('#/notes?q=condo%20budget', '.row-title'), ('#/today', '.today-page'), ('#/inbox', '.page'), ('#/tasks', '.page'), ('#/notebooks', '.page')]:
        t0 = time.time(); page.goto(BASE + route); page.wait_for_selector(sel, timeout=60000); page.wait_for_timeout(50)
        print(f'{route}: {(time.time()-t0)*1000:.0f} ms')
    m = J("""(async () => { const D = await import('./js/mapdata.js'); const A = await import('./js/mapassist.js');
      const T = (f) => { const t = performance.now(); f(); return Math.round(performance.now() - t); };
      return { connections: T(() => D.connections()), themes: T(() => D.themes(D.connections().edges)), noticed: T(() => A.noticed()), digest: T(() => A.weekDigest()) }; })()""")
    print('map data (ms):', m)
    t0 = time.time(); page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas', timeout=60000); t_open = time.time() - t0
    page.wait_for_timeout(1500)
    busy = """(async () => { let total = 0, last = performance.now(); const end = last + 3000; while (performance.now() < end) { await new Promise(r => setTimeout(r, 0)); const now = performance.now(); if (now - last > 8) total += now - last; last = now; } return Math.round(total); })()"""
    print(f'map: open {t_open*1000:.0f} ms, busy {J(busy)} ms of the next 3 s')
    page.wait_for_timeout(8000)
    print(f'map settled: busy {J(busy)} ms of 3 s')
    # Typing in a note: the save cost
    nid = J("import('./js/vault.js').then(V => [...V.state.notes.values()][5].id)")
    s = J("""(async (id) => { const V = await import('./js/vault.js'); const n = V.state.notes.get(id); const t = performance.now(); await V.saveNote({ ...n, body: n.body + ' more' }); return Math.round(performance.now() - t); })""", nid)
    print('save one note (on map):', s, 'ms')
    # Cost of working out "close in meaning" for every pair (the old way) with N vectors:
    est = J("""(N) => { const D = 384; const vs = Array.from({ length: Math.min(N, 2000) }, () => { const v = new Float32Array(D); for (let i = 0; i < D; i++) v[i] = Math.random() - 0.5; return v; });
      const t = performance.now(); let s = 0; for (let i = 0; i < vs.length; i++) { const a = vs[i]; for (let j = i + 1; j < vs.length; j++) { const b = vs[j]; let d = 0; for (let k = 0; k < D; k++) d += a[k] * b[k]; s += d; } }
      const ms = performance.now() - t; const pairs = vs.length * (vs.length - 1) / 2; return Math.round(ms * (N * (N - 1) / 2) / pairs); }""", N)
    print(f'all-pairs meaning comparison at {N} notes would take ~{est} ms')
run(steps, vp=(1180, 820), mob=False)
