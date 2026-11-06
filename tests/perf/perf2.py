import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..'))  # dbg.py, mockgh.py
import sys, time
from dbg import *
N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    t = J("""async (N) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false });
      const words = 'renovation mortgage condo tenant dividend portfolio REIT promotion manager stakeholder rollout kyoto flight hotel marathon recipe laksa github bug feature budget tax insurance coffee mentor birthday book podcast framework lesson'.split(' ');
      const regions = V.state.config.regions.map((r) => r.id);
      for (let i = 0; i < N; i++) { const w = () => words[Math.floor(Math.random() * words.length)];
        await V.saveNote(M.newNote({ title: `Note ${i} ${w()} ${w()}`, titleAuto: false, body: Array.from({ length: 3 }, () => Array.from({ length: 12 }, w).join(' ')).join('\\n\\n'), region: regions[i % regions.length], inbox: false })); }
      const S = await import('./js/semantic.js'); const t0 = performance.now(); await S.buildIndex(); return performance.now() - t0; }""", N)
    print(f'index {N} notes: {t/1000:.1f} s')
    m = J("""(async () => { const D = await import('./js/mapdata.js'); const A = await import('./js/mapassist.js');
      const T = (f) => { const t = performance.now(); f(); return Math.round(performance.now() - t); };
      return { connections: T(() => D.connections()), again: T(() => D.connections()), themes: T(() => D.themes(D.connections().edges)), noticed: T(() => A.noticed()), digest: T(() => A.weekDigest()) }; })()""")
    print('WITH MEANING (ms)', m)
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas'); page.wait_for_timeout(1500)
    prof = J("""(async () => { const V = await import('./js/vault.js'); const D = await import('./js/mapdata.js'); const n = [...V.state.notes.values()][7];
      const lt = []; const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(Math.round(e.duration)); }); ob.observe({ type: 'longtask', buffered: false });
      const t0 = performance.now(); await V.saveNote({ ...n, body: n.body + ' y' }); const tSave = performance.now() - t0;
      const t1 = performance.now(); D.connections(); const tConn = performance.now() - t1;
      await new Promise(r => setTimeout(r, 1500)); ob.disconnect(); return { save: Math.round(tSave), connAfterSave: Math.round(tConn), longTasks: lt }; })()""")
    print('PROFILE', prof)
    upd = J("""(async () => { const V = await import('./js/vault.js'); const n = [...V.state.notes.values()][5]; const t = performance.now(); await V.saveNote({ ...n, body: n.body + ' x' }); await new Promise(r => setTimeout(r, 600)); return performance.now() - t; })()""")
    lt = J("(() => { const t = performance.now(); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t)))); })()")
    print(f'map: one note saved -> settled {upd:.0f} ms, frame {lt:.0f} ms')
run(steps, vp=(1180, 820), mob=False)
