import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..'))  # dbg.py, mockgh.py
import sys, json, collections
from dbg import *
N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SEM = (sys.argv[2] if len(sys.argv) > 2 else '1') == '1'
def top(profile, label, k=14):
    nodes = {n['id']: n for n in profile['nodes']}
    self_t = collections.Counter()
    dt = profile.get('timeDeltas', []); samples = profile.get('samples', [])
    for s, d in zip(samples, dt):
        cf = nodes[s]['callFrame']; self_t[(cf['functionName'] or '(anon)') + ' ' + cf['url'].split('/')[-1] + ':' + str(cf['lineNumber']+1)] += d
    tot = sum(dt)/1000
    print(f'--- {label}: {tot:.0f} ms sampled')
    for f, t in self_t.most_common(k): print(f'  {t/1000:7.1f} ms  {f}')
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    J("""async ([N, SEM]) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: SEM });
      const words = 'renovation mortgage condo tenant dividend portfolio REIT promotion manager stakeholder rollout kyoto flight hotel marathon recipe laksa github bug feature budget tax insurance coffee mentor birthday book podcast framework lesson'.split(' ');
      const regions = V.state.config.regions.map((r) => r.id);
      for (let i = 0; i < N; i++) { const w = () => words[Math.floor(Math.random() * words.length)];
        await V.saveNote(M.newNote({ title: `Note ${i} ${w()} ${w()}`, titleAuto: false, body: Array.from({ length: 3 }, () => Array.from({ length: 12 }, w).join(' ')).join('\\n\\n') + (i % 5 === 0 && i ? `\\n\\nSee [[Note ${i-1}]]` : ''), region: regions[i % regions.length], inbox: false })); }
      if (SEM) { const S = await import('./js/semantic.js'); await S.buildIndex(); } }""", [N, SEM])
    page.goto(BASE + '#/map'); page.wait_for_selector('#map-canvas canvas'); page.wait_for_timeout(4000)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 200})
    cdp.send('Profiler.start')
    t = J("""(async () => { const V = await import('./js/vault.js'); const n = [...V.state.notes.values()][7]; const t0 = performance.now(); await V.saveNote({ ...n, body: n.body + ' y' }); return performance.now() - t0; })()""")
    prof = cdp.send('Profiler.stop')['profile']
    print(f'save on map: {t:.0f} ms'); top(prof, 'save on map')
    cdp.send('Profiler.start'); page.wait_for_timeout(1000); prof = cdp.send('Profiler.stop')['profile']; top(prof, 'map idle 1s after save')
    page.wait_for_timeout(6000)
    cdp.send('Profiler.start'); page.wait_for_timeout(1000); prof = cdp.send('Profiler.stop')['profile']; top(prof, 'map settled 1s', 8)
if __name__ == "__main__": run(steps, vp=(1180, 820), mob=False)
