import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..'))  # dbg.py, mockgh.py
from dbg import *
import sys
IDS = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] != 'all' else None
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    n = J("""async (ids) => { const C = await import('./js/covers.js'); await document.fonts.ready;
      const list = C.COVERS.filter(c => !ids || ids.includes(c.id));
      const titles = ['Property', 'Investing', 'Reading', 'Travel', 'Career', 'Ideas'];
      const el = document.createElement('div'); el.id = 'shot';
      el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#E9EDEB;overflow:auto;padding:16px;display:grid;grid-template-columns:repeat(6, 150px);gap:14px 12px;align-content:start';
      el.innerHTML = list.map((c, i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;font:12px sans-serif">${C.coverSVG({ title: titles[i % 6], cover: { style: c.id, titleStyle: 'printed' } }, { width: 140 })}<span style="font:600 12px Overpass, sans-serif;color:#1B2A38">${c.name}</span></div>`).join('');
      document.body.appendChild(el); await new Promise(r => setTimeout(r, 400)); return list.length; }""", IDS)
    page.set_viewport_size({'width': 6 * 162 + 40, 'height': 255 * ((n + 5) // 6) + 40})
    page.wait_for_timeout(400)
    page.screenshot(path='shots5/new-covers.png', full_page=False)
run(steps, vp=(1020, 800), mob=False)
