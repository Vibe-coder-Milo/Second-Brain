"""Sync for notebooks, typed docs and handwritten pages; page merges; version history."""
import os, json, time
from playwright.sync_api import sync_playwright, expect
from mockgh import MockRepo, install
SP = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(SP, 'shots4')
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
repo = MockRepo(); errors = []
def watch(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] PAGEERROR {e}'))
def sync(page): return page.evaluate("import('./js/sync.js').then(m => m.syncNow()).then(() => 'ok', e => 'ERR ' + (e.message || e))")
def wait_until(page, js, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js): return True
        time.sleep(0.25)
    raise AssertionError('timed out: ' + js)
ADD_STROKE = """async ([tag, x]) => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(m=>m.kind==='ink'); const pid=n.pages[0].id; const d=await V.loadPage(pid);
  const s={id:'k_'+tag+Math.random().toString(36).slice(2,7), t:'pen', pen:'fountain', c:'#1B2A38', s:3.4, sp:1, pts:[x,100,0.5,x+50,120,0.5,x+100,110,0.5]};
  await V.savePage(pid, {...d, strokes:[...d.strokes, s]}, {sealed:false}); return s.id; }"""
STROKES = """async () => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(m=>m.kind==='ink'); V.forgetPageCache(); const d=await V.loadPage(n.pages[0].id); return d.strokes.map(s=>s.id).sort(); }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    A = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block')
    install(A, repo); a = A.new_page(); watch(a, 'A')
    a.goto(BASE); a.get_by_text('Start a new second brain').click()
    a.fill('#p1', PASS); a.fill('#p2', PASS); a.check('#ack')
    a.get_by_role('button', name='Create my second brain').click(); a.wait_for_selector('.today-page', timeout=20000)
    a.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const R = await import('./js/editor/rich.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Career', region: 'career', cover: { style: 'tide', titleStyle: 'printed' } }));
      const doc = R.mdToDoc('## Story\\n\\nLead with what I did.\\n\\n- [ ] Ask Wei Ling to sponsor 📅 2026-11-03');
      await V.saveNote(M.newNote({ title: 'Promotion case 2027', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false, doc, body: R.markdownOf(doc) }));
      const page = M.newPage({ paper: 'dotted' });
      const ink = await V.saveNote(M.newNote({ kind: 'ink', title: 'Mentor coffee', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false, pages: [page] }));
      await V.savePage(page.id, { v: 1, strokes: [{ id: 'k_base', t: 'pen', pen: 'fountain', c: '#1B2A38', s: 3.4, sp: 1, pts: [100,100,0.5,200,140,0.5,300,120,0.5] }], objects: [{ id: 'o_lab', type: 'label', label: 'important', x: 400, y: 100, w: 140, h: 46, rot: 0, t: Date.now() }], tomb: [], at: 0 });
      const N = await import('./js/notework.js'); await N.refreshInkSummary(ink.id);
      await V.saveConfig({ labels: [...V.state.config.labels, { id: 'kyoto', name: 'Kyoto', color: '#4277B5' }] });
    }""")
    a.goto(BASE + '#/settings'); a.fill('#s-token', 'test-token'); a.get_by_role('button', name='Connect').click()
    expect(a.locator('#toast')).to_contain_text('Connected and synced', timeout=30000)
    blob = b''.join(repo.files().values())
    for leak in [b'Career', b'Promotion', b'Mentor', b'Kyoto', b'Wei Ling', b'important']:
        assert leak not in blob, f'plaintext leaked: {leak}'
    print('repo has', len(repo.files()), 'files; only ciphertext: ok')
    # B joins on iPad
    B = b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, has_touch=True, service_workers='block')
    install(B, repo); bp = B.new_page(); watch(bp, 'B')
    bp.goto(BASE); bp.get_by_text('Set up from another device').click()
    bp.fill('#j-token', 'test-token'); bp.fill('#jp', PASS)
    bp.get_by_role('button', name='Connect and download').click()
    expect(bp.locator('.sidebar')).to_be_visible(timeout=30000)
    wait_until(bp, "import('./js/vault.js').then(V => V.state.notebooks.size === 1 && V.state.notes.size >= 2)")
    nbid = bp.evaluate("import('./js/vault.js').then(V => [...V.state.notebooks.keys()][0])")
    bp.goto(BASE + f'#/notebook/{nbid}'); bp.wait_for_timeout(800)
    assert bp.locator('.nb-row').count() == 2, bp.locator('.nb-side').inner_text()
    bp.locator('.nb-row', has_text='Mentor coffee').click(); bp.wait_for_selector('.nb-pane .ink-page canvas'); bp.wait_for_timeout(800)
    bp.screenshot(path=f'{OUT}/c-ipad-pane.png')
    assert bp.evaluate(STROKES) == ['k_base'] and 'kyoto' in bp.evaluate("import('./js/vault.js').then(V => V.state.config.labels.map(l=>l.id))")
    print('B sees notebook, typed and handwritten notes, labels: ok')
    # Both write on the same page before syncing
    sa = a.evaluate(ADD_STROKE, ['A', 300]); sb = bp.evaluate(ADD_STROKE, ['B', 500])
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'; assert sync(a) == 'ok'
    ka, kb = a.evaluate(STROKES), bp.evaluate(STROKES)
    print('strokes A', ka, 'B', kb); assert ka == kb and sa in ka and sb in ka and 'k_base' in ka
    print('page edited on two devices: both strokes kept')
    # Erase on A carries over
    a.evaluate("""async () => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(m=>m.kind==='ink'); const pid=n.pages[0].id; const d=await V.loadPage(pid);
      await V.savePage(pid, {...d, strokes: d.strokes.filter(s=>s.id!=='k_base'), tomb:[...d.tomb,'k_base']}, {sealed:false}); }""")
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'
    assert 'k_base' not in bp.evaluate(STROKES); print('erase synced: ok')
    # The open page on B redraws with the remote change
    bp.wait_for_timeout(600); bp.screenshot(path=f'{OUT}/c-ipad-pane2.png')
    # Typed note history: two edits with syncs between
    for body in ['Lead with outcomes, not tasks.', 'Lead with outcomes, not tasks.\n\nOne clear ask at the end.']:
        a.evaluate("""async (md) => { const V = await import('./js/vault.js'); const R = await import('./js/editor/rich.js'); const n=[...V.state.notes.values()].find(m=>m.title==='Promotion case 2027');
          const doc = R.mdToDoc('## Story\\n\\n' + md); await V.saveNote({...n, doc, body: R.markdownOf(doc)}); }""", body)
        assert sync(a) == 'ok'
    assert sync(bp) == 'ok'
    pid = bp.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(m=>m.title==='Promotion case 2027').id)")
    bp.goto(BASE + f'#/notebook/{nbid}?note={pid}'); bp.wait_for_timeout(1200)
    bp.locator('[data-act=history]').click()
    bp.wait_for_selector('.vh-item', timeout=20000); bp.wait_for_timeout(500)
    n = bp.locator('.vh-item').count(); print('versions', n); assert n >= 3
    bp.screenshot(path=f'{OUT}/c-history.png')
    assert bp.locator('.df.add', has_text='One clear ask').count() == 1
    bp.locator('.vh-head').nth(2).click(); bp.wait_for_timeout(300)
    bp.locator('[data-restore]').click(); bp.locator('[data-yes]').click(); bp.wait_for_timeout(800)
    body = bp.evaluate(f"import('./js/vault.js').then(V => V.state.notes.get('{pid}').body)")
    print('restored body:', body.replace('\n', ' | ')); assert 'Lead with what I did' in body
    # Handwritten page history
    iid = bp.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(m=>m.kind==='ink').id)")
    bp.goto(BASE + f'#/notebook/{nbid}?note={iid}'); bp.wait_for_selector('.nb-pane .ink-page canvas'); bp.wait_for_timeout(500)
    bp.locator('.nb-pane [data-act=more]').click(); bp.locator('.menu button', has_text='Version history').click()
    bp.wait_for_selector('.vh-canvas', timeout=20000); bp.wait_for_timeout(300)
    bp.screenshot(path=f'{OUT}/c-ink-history.png')
    print('page versions', bp.locator('.vh-item').count())
    b.close()
print('\n'.join(errors) or 'no errors')
