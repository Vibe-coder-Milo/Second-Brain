import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..'))  # dbg.py, mockgh.py
import sys, time
from dbg import *
from prof import top
N = int(sys.argv[1])
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    J("""async (N) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: false });
      const words = 'renovation mortgage condo tenant dividend portfolio REIT promotion manager stakeholder rollout kyoto flight hotel marathon recipe laksa github bug feature budget tax insurance coffee mentor birthday book podcast framework lesson fraud mule conduct model data team review quarterly plan'.split(' ');
      const regions = V.state.config.regions.map((r) => r.id); const batch = [];
      for (let i = 0; i < N; i++) { const w = () => words[Math.floor(Math.random() * words.length)];
        batch.push(M.newNote({ title: `Note ${i} ${w()} ${w()}`, titleAuto: false, body: Array.from({ length: 8 }, () => Array.from({ length: 16 }, w).join(' ')).join('\\n\\n') + (i > 3 && i % 5 === 0 ? `\\n\\nSee [[Note ${i - 3} x]]` : ''), region: regions[i % regions.length], inbox: i % 15 === 0 }));
        if (batch.length === 200) await V.saveNotes(batch.splice(0)); }
      if (batch.length) await V.saveNotes(batch); }""", N)
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas', timeout=60000); page.wait_for_timeout(9000)
    cdp = page.context.new_cdp_session(page); cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 100}); cdp.send('Profiler.start')
    s = J("""(async () => { const V = await import('./js/vault.js'); const n = [...V.state.notes.values()][5]; const t = performance.now(); await V.saveNote({ ...n, body: n.body + ' more' }); return Math.round(performance.now() - t); })()""")
    print('save on map', s, 'ms'); top(cdp.send('Profiler.stop')['profile'], 'save', 16)
run(steps, vp=(1180, 820), mob=False)
