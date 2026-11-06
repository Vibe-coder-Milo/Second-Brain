"""Emptying Recently deleted reaches the other devices by itself. A computer
deletes a typed note, a handwritten note and a notebook (with a note in it)
and syncs; the iPad gets them in its Recently deleted. The iPad taps Empty
(or Delete for good on one item) and does nothing else: the app syncs on its
own within a few seconds (at once if the app is put away), the notes and their page files leave the sync repo,
and after the computer's next sync its Recently deleted is empty too."""
import os, time, sys
from playwright.sync_api import sync_playwright, expect
from mockgh import MockRepo, install
SP = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(SP, 'shots5')
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
repo = MockRepo(); errors = []
def watch(page, tag):
    page.on('console', lambda m: m.type == 'error' and 'Service Worker' not in m.text and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] PAGEERROR {e}'))
def sync(page): return page.evaluate("import('./js/sync.js').then(m => m.syncNow()).then(() => 'ok', e => 'ERR ' + (e.message || e))")
def wait_until(fn, what, timeout=30, page=None):
    # Wait with the page's clock, not time.sleep: the stand-in GitHub answers
    # from this same program, so sleeping would leave the app's requests hanging.
    t0 = time.time()
    while time.time() - t0 < timeout:
        if fn(): return round(time.time() - t0, 1)
        page.wait_for_timeout(250)
    raise AssertionError('timed out: ' + what)
BIN = "import('./js/vault.js').then(V => [...V.state.bin.keys()].sort())"
in_repo = lambda ids: [i for i in ids if f'notes/{i}.json' in repo.files()]

with sync_playwright() as p:
    b = p.chromium.launch()
    os.makedirs(OUT, exist_ok=True)
    # The computer.
    A = b.new_context(viewport={'width': 1280, 'height': 800}, service_workers='block')
    install(A, repo); a = A.new_page(); watch(a, 'computer')
    a.goto(BASE); a.get_by_text('Start a new second brain').click()
    a.fill('#p1', PASS); a.fill('#p2', PASS); a.check('#ack')
    a.get_by_role('button', name='Create my second brain').click(); a.wait_for_selector('.today-page', timeout=20000)
    ids = a.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Old project', region: 'career' }));
      const inNb = await V.saveNote(M.newNote({ title: 'Inside the notebook', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false }));
      const t = await V.saveNote(M.newNote({ title: 'Typed to delete', titleAuto: false, region: 'career', inbox: false }));
      const t2 = await V.saveNote(M.newNote({ title: 'Typed, one by one', titleAuto: false, region: 'career', inbox: false }));
      const page = M.newPage({});
      const ink = await V.saveNote(M.newNote({ kind: 'ink', title: 'Ink to delete', titleAuto: false, region: 'career', inbox: false, pages: [page] }));
      await V.savePage(page.id, { v: 1, strokes: [{ id: 'k1', t: 'pen', pen: 'fountain', c: '#1B2A38', s: 3, sp: 1, pts: [100,100,0.5,200,140,0.5] }], objects: [], tomb: [], at: 0 });
      return { nb: nb.id, inNb: inNb.id, t: t.id, t2: t2.id, ink: ink.id, page: page.id }; }""")
    a.goto(BASE + '#/settings'); a.fill('#s-token', 'test-token'); a.get_by_role('button', name='Connect').click()
    expect(a.locator('#toast')).to_contain_text('Connected and synced', timeout=30000)
    gone = [ids['t'], ids['t2'], ids['ink'], ids['inNb'], ids['nb']]
    assert in_repo(gone) == gone and f"files/{ids['page']}.bin" in repo.files()

    # The iPad joins.
    B = b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, has_touch=True, service_workers='block')
    install(B, repo); bp = B.new_page(); watch(bp, 'iPad')
    bp.goto(BASE); bp.get_by_text('Set up from another device').click()
    bp.fill('#j-token', 'test-token'); bp.fill('#jp', PASS)
    bp.get_by_role('button', name='Connect and download').click()
    expect(bp.locator('.sidebar')).to_be_visible(timeout=30000)
    wait_until(lambda: bp.evaluate("import('./js/vault.js').then(V => V.state.notes.size >= 4)"), 'iPad has the notes', page=bp)

    # The computer deletes them (to Recently deleted) and syncs; the iPad gets that.
    a.evaluate(f"""async () => {{ const V = await import('./js/vault.js');
      await V.binNote('{ids['t']}'); await V.binNote('{ids['t2']}'); await V.binNote('{ids['ink']}'); await V.binNotebook('{ids['nb']}'); }}""")
    assert sync(a) == 'ok'
    assert sync(bp) == 'ok'
    print('iPad Recently deleted:', bp.evaluate(BIN))
    assert bp.evaluate(BIN) == sorted(gone)

    # On the iPad: delete one for good, then Empty the rest. No manual sync.
    bp.goto(BASE + '#/deleted'); bp.wait_for_selector('[data-act=empty]'); bp.wait_for_timeout(300)
    bp.locator(f"[data-forever=\"{ids['t2']}\"]").tap()
    bp.locator('.sheet .btn-danger, .overlay .btn-danger').last.tap(); bp.wait_for_timeout(300)
    assert ids['t2'] not in bp.evaluate(BIN), 'gone from the iPad'
    # ...and the app is put away straight after (home screen): it syncs then, not 4 s later.
    HIDE = "(v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
    bp.evaluate(HIDE, 'hidden')
    t = wait_until(lambda: not in_repo([ids['t2']]), 'one deleted for good leaves the repo as the app is put away', 2.5, page=bp)
    print('one item gone from the repo after', t, 's (app put away)')
    bp.evaluate(HIDE, 'visible'); bp.wait_for_timeout(1500)
    bp.locator('[data-act=empty]').tap()
    bp.locator('.sheet .btn-danger, .overlay .btn-danger').last.tap()
    expect(bp.locator('#toast')).to_contain_text('Recently deleted is empty', timeout=10000)
    t = wait_until(lambda: not in_repo(gone), 'everything emptied leaves the repo by itself', 20, page=bp)
    print('emptied items gone from the repo after', t, 's; page file left:', f"files/{ids['page']}.bin" in repo.files())
    assert f"files/{ids['page']}.bin" not in repo.files(), 'the handwritten page goes too'
    bp.screenshot(path=f'{OUT}/h-ipad-empty.png')

    # The computer, on its Recently deleted screen, syncs as it does every few minutes: empty there too.
    a.goto(BASE + '#/deleted'); a.wait_for_selector('[data-act=empty]'); a.wait_for_timeout(300)
    assert sync(a) == 'ok'
    a.wait_for_timeout(400)
    print('computer Recently deleted after sync:', a.evaluate(BIN))
    assert a.evaluate(BIN) == [], 'empty on the computer too'
    assert a.locator('[data-act=empty]').count() == 0 and a.locator('[data-forever]').count() == 0, 'the screen shows it'
    a.screenshot(path=f'{OUT}/h-computer-empty.png')
    # Nothing comes back on a later round.
    assert sync(bp) == 'ok' and sync(a) == 'ok' and bp.evaluate(BIN) == [] and a.evaluate(BIN) == [] and not in_repo(gone)
    b.close()
print('errors:', errors)
assert not errors
print('ok')
