"""Round 12: sync stays within GitHub's upload limits. A big import goes up in
batches, everyday edits go first, a note's files go before the note, and a
"slow down" answer from GitHub waits instead of failing."""
import json
from playwright.sync_api import sync_playwright
from mockgh import MockRepo, install
BASE = 'http://127.0.0.1:8765/'
PASS = 'harbour lights fold four'

class LimitedRepo(MockRepo):
    def __init__(self):
        super().__init__()
        self.limit_next = 0
    def handle(self, method, url, headers, body):
        if method == 'POST' and url.endswith('/git/blobs') and self.limit_next:
            self.limit_next -= 1
            return 403, {'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after, x-ratelimit-remaining, x-ratelimit-reset', 'retry-after': '2', 'content-type': 'application/json'}, json.dumps({'message': 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.'})
        return super().handle(method, url, headers, body)

repo = LimitedRepo()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1180, 'height': 820}, service_workers='block')
    install(ctx, repo)
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    J = lambda js, arg=None: page.evaluate(js, arg)
    page.goto(BASE)
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click()
    page.wait_for_selector('.today-page', timeout=20000)
    J("import('./js/vault.js').then(V => V.updateDevice({ organise: false, semantic: false }))")
    page.goto(BASE + '#/settings'); page.fill('#s-token', 'test-token'); page.get_by_role('button', name='Connect').click()
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('Connected')", timeout=30000)
    # A "big import": one note with 150 page files.
    big = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const pages = [];
      for (let i = 0; i < 150; i++) { const id = await V.addFile(new TextEncoder().encode('page ' + i + ' '.repeat(200)), { type: 'image/jpeg' }); pages.push(M.newPage({ paper: 'blank', bg: id })); }
      const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Big PDF', titleAuto: false, region: 'career', inbox: false, pages })); return n.id; })()""")
    # Then three everyday notes.
    small = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const ids = [];
      for (let i = 0; i < 3; i++) ids.push((await V.saveNote(M.newNote({ title: 'Quick ' + i, titleAuto: false, body: 'hi', region: 'career', inbox: false }))).id); return ids; })()""")
    reset_budget = lambda: J("localStorage.removeItem('sb-gh-uploads')")
    run = lambda: J("import('./js/sync.js').then(S => S.syncNow()).then(() => 'ok', e => 'ERR ' + e.message)")
    st = lambda: J("import('./js/vault.js').then(V => ({ state: V.state.sync.state, left: V.state.sync.left || 0 }))")
    in_repo = lambda: set(repo.files().keys())
    reset_budget()
    print('batch 1:', run(), st())
    have = in_repo()
    assert all(f'notes/{i}.json' in have for i in small), 'everyday notes go first'
    assert f'notes/{big}.json' not in have, 'the big note waits for its pages'
    blobs1 = sum(1 for k in have if k.startswith('files/'))
    print('  everyday notes up first: yes | page files up so far:', blobs1, '| big note held back: yes')
    assert st()['state'] == 'uploading' and st()['left'] > 0 and blobs1 <= 57
    # Without waiting (budget used up): no new uploads, and no error.
    print('straight away again:', run(), st()); assert st()['state'] == 'uploading' and len(in_repo()) - len(have) <= 10
    # GitHub says slow down once: it waits, it doesn't fail.
    reset_budget(); repo.limit_next = 1
    print('GitHub says slow down:', run(), st()); assert st()['state'] == 'uploading'
    page.wait_for_timeout(2500)
    # Let the rest go up (time passes: budget reset between batches).
    for k in range(8):
        reset_budget(); r = run(); s = st()
        if s['state'] == 'idle': break
    have = in_repo()
    files_up = sum(1 for k in have if k.startswith('files/'))
    print('finished:', s, '| page files in repo:', files_up, '| big note in repo:', f'notes/{big}.json' in have)
    assert s['state'] == 'idle' and files_up >= 150 and f'notes/{big}.json' in have
    # Commits were each a small batch.
    sizes = [len(c['message']) for c in repo.commits.values()]
    msgs = [c['message'] for c in repo.commits.values() if c['message'].startswith('Sync')]
    print('commits:', len(msgs), msgs[:3])
    assert len(msgs) >= 3
    # Settings explains it while uploading (fake a waiting state).
    J("import('./js/vault.js').then(V => { V.state.sync = { ...V.state.sync, state: 'uploading', left: 420, resumeAt: Date.now() + 30 * 60000 }; V.emit({ type: 'sync' }); })")
    page.goto(BASE + '#/settings'); page.wait_for_timeout(500)
    txt = page.locator('section[aria-labelledby=s-sync]').inner_text()
    print('settings says:', txt.replace('\n', ' | ')[:220]); assert '420 left' in txt and '500 uploads an hour' in txt
    print('OK')
    b.close()
