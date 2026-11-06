"""Sync between two devices through a mock GitHub, conflicts, deletes, sealed notes,
importing a Claude sweep reply, and the iPad layout."""
import os, json, time
from playwright.sync_api import sync_playwright, expect
from mockgh import MockRepo, install

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SP, 'shots')
BASE = 'http://127.0.0.1:8765/'
PASS = 'harbour lights fold four'
PASS2 = 'tide chart lantern seven'
SEALPASS = 'quiet orchid ledger nine'
repo = MockRepo()
errors = []

def watch(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] PAGEERROR {e}'))

def sync(page):
    return page.evaluate("import('./js/sync.js').then(m => m.syncNow()).then(() => 'ok', e => 'ERR ' + (e.message || e))")

def titles(page):
    return page.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].map(n => n.title).sort())")

def note_id(page, title):
    return page.evaluate("t => import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title === t)?.id)", title)

def set_title(page, old, new):
    page.evaluate("""([o, n]) => import('./js/vault.js').then(async V => {
      const x = [...V.state.notes.values()].find(m => m.title === o); await V.saveNote({ ...x, title: n });
    })""", [old, new])

def wait_until(page, js, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        time.sleep(0.25)
    raise AssertionError('timed out: ' + js)

def blobs_text():
    return b''.join(repo.files().values())

with sync_playwright() as p:
    b = p.chromium.launch()
    A = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                      service_workers='block', permissions=['clipboard-read', 'clipboard-write'])
    install(A, repo)
    a = A.new_page(); watch(a, 'A')
    a.goto(BASE)
    a.get_by_text('Start a new second brain').click()
    a.fill('#p1', PASS); a.fill('#p2', PASS); a.check('#ack')
    a.get_by_role('button', name='Create my second brain').click()
    expect(a.locator('.tabbar')).to_be_visible(timeout=20000)

    # A capture with an image, so files sync too
    a.locator('.tabbar [data-action=capture]').click()
    a.fill('#cap-text', 'Team dinner after the Q3 launch')
    a.set_input_files('#cap-photos', os.path.join(SP, 'shot1.png'))
    a.locator('#cap-save').click()
    expect(a.locator('#toast')).to_contain_text('Saved')
    a.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const mk = (title, region, body = '') => M.newNote({ title, titleAuto: false, region, inbox: !region, body, source: 'thought' });
      for (const [t, r, body] of [['Promotion case 2027', 'career', 'Outcomes, not tasks.'], ['Managing up', 'ideas', ''], ['D05 dividend thesis', 'investing', ''],
        ['Kyoto, March 2027', 'travel', ''], ['Savings plan for 2027', 'ideas', 'Private numbers here'], ['Delete me later', 'ideas', ''], ['Conflict target', 'career', '']]) await V.saveNote(mk(t, r, body));
    }""")

    # Connect sync through Settings
    a.goto(BASE + '#/settings')
    a.fill('#s-token', 'test-token')
    a.get_by_role('button', name='Connect').click()
    expect(a.locator('#toast')).to_contain_text('Connected and synced', timeout=30000)
    files = repo.files()
    print('repo files:', sorted(k.split('/')[0] for k in files).count('notes'), 'notes,', sum(1 for k in files if k.startswith('files/')), 'files, keyring' if 'keyring.json' in files else 'NO KEYRING')
    assert 'keyring.json' in files and any(k.startswith('files/') for k in files)
    assert b'Promotion' not in blobs_text() and b'Outcomes' not in blobs_text(), 'plaintext leaked to GitHub'
    print('github sees only ciphertext: ok')
    a.screenshot(path=f'{OUT}/20-settings-synced.png')

    # Device B: iPad, joins from GitHub
    B = b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, has_touch=True, service_workers='block')
    install(B, repo)
    bp = B.new_page(); watch(bp, 'B')
    bp.goto(BASE)
    bp.get_by_text('Set up from another device').click()
    bp.fill('#j-token', 'test-token'); bp.fill('#jp', 'not the passphrase')
    bp.get_by_role('button', name='Connect and download').click()
    expect(bp.locator('#err')).to_contain_text('doesn', timeout=20000)
    bp.fill('#jp', PASS)
    bp.get_by_role('button', name='Connect and download').click()
    expect(bp.locator('.sidebar')).to_be_visible(timeout=30000)
    wait_until(bp, "import('./js/vault.js').then(V => V.state.notes.size >= 8)")
    ta, tb = titles(a), titles(bp)
    assert ta == tb, (ta, tb)
    print('B has same notes as A:', len(tb))
    # Image decrypts on B
    dinner = bp.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.files.length)?.id)")
    bp.goto(BASE + f'#/note/{dinner}')
    bp.wait_for_function("() => document.querySelector('img[data-file]')?.src.startsWith('blob:')", timeout=20000)
    print('image decrypted on B: ok')
    bp.goto(BASE + '#/map?note=' + note_id(bp, 'Promotion case 2027'))
    bp.wait_for_timeout(3000)
    bp.screenshot(path=f'{OUT}/21-ipad-map-panel.png')
    bp.goto(BASE + '#/inbox'); bp.screenshot(path=f'{OUT}/22-ipad-inbox.png')

    # Edit on B, sync to A
    set_title(bp, 'Managing up', 'Managing up well')
    assert sync(bp) == 'ok'; assert sync(a) == 'ok'
    assert 'Managing up well' in titles(a); print('edit B -> A: ok')

    # Conflict: both edit the same note
    set_title(a, 'Conflict target', 'Conflict A edit')
    time.sleep(0.05)
    set_title(bp, 'Conflict target', 'Conflict B edit')
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'; assert sync(a) == 'ok'
    for dev in (a, bp):
        t = titles(dev)
        assert 'Conflict B edit' in t and 'Conflict A edit (conflict copy)' in t, t
    print('conflict resolved, copy kept on both: ok')

    # Delete on A reaches B
    a.evaluate("import('./js/vault.js').then(V => V.deleteNote([...V.state.notes.values()].find(n => n.title === 'Delete me later').id))")
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'
    assert 'Delete me later' not in titles(bp); print('delete A -> B: ok')

    # A push collides with another writer: retried automatically
    set_title(a, 'Kyoto, March 2027', 'Kyoto, late March 2027')
    repo.fail_next_ref_update = True
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'
    assert 'Kyoto, late March 2027' in titles(bp); print('ref race retry: ok')

    # Sealed notes on A
    a.goto(BASE + '#/settings')
    a.fill('#sp1', SEALPASS); a.fill('#sp2', SEALPASS)
    a.get_by_role('button', name='Set up sealed notes').click()
    expect(a.locator('#toast')).to_contain_text('Sealed notes are ready')
    sid = note_id(a, 'Savings plan for 2027')
    a.goto(BASE + f'#/note/{sid}')
    a.get_by_role('button', name='More actions').click()
    a.locator('.menu button', has_text='Seal this note').click()
    wait_until(a, f"import('./js/vault.js').then(V => V.state.notes.get('{sid}')?.sealed)", 15)
    expect(a.locator('.note-meta')).to_contain_text('Sealed')
    req = a.evaluate("import('./js/claude.js').then(C => C.buildQuestionRequest('test', ['career','investing','travel','ideas','people']))")
    assert 'Savings plan' not in req and 'Private numbers' not in req, 'sealed note leaked into Ask request'
    print('sealed note excluded from Claude requests: ok')
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'
    assert 'Savings plan for 2027' not in titles(bp), 'sealed note visible while locked on B'
    bp.goto(BASE + '#/map')
    bp.locator('[data-action=toggle-sealed]').click()
    bp.fill('#ps-p', SEALPASS)
    bp.locator('.sheet button[type=submit]').click()
    wait_until(bp, "import('./js/vault.js').then(V => [...V.state.notes.values()].some(n => n.title === 'Savings plan for 2027'))")
    print('sealed note opens on B with sealed passphrase: ok')

    # Import a Claude sweep reply on A
    inbox_id = a.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.inbox)?.id)")
    promo = note_id(a, 'Promotion case 2027')
    reply = {
      'format': 'second-brain/v1', 'kind': 'sweep', 'sweep': {'from': '2026-10-01', 'to': '2026-10-30', 'chatsReviewed': 27},
      'newNotes': [
        {'ref': 'new1', 'title': 'Build my own second brain app', 'body': 'Encrypted, map view, chat sweeps on demand.', 'type': 'decision', 'region': 'ideas', 'linksTo': [promo], 'why': 'A decision with reasons', 'chat': {'title': 'My second brain', 'url': 'https://claude.ai/chat/abc'}},
        {'ref': 'new2', 'title': 'My car’s tyre pressure', 'body': '36 psi front and back.', 'type': 'reference', 'region': None, 'why': 'Asked twice'},
        {'ref': 'new3', 'title': 'Budget for next year', 'body': 'Plan', 'type': 'plan', 'region': 'ideas', 'sealSuggested': True, 'why': 'Personal finances'},
      ],
      'updates': [{'id': inbox_id, 'setRegion': 'career', 'why': 'A team win'}],
      'suggestedLinks': [{'from': 'new1', 'to': note_id(a, 'Managing up well'), 'reason': 'Both about working style'}],
      'skipped': [{'chatTitle': 'SGD to JPY rate', 'reason': 'lookup'}, {'chatTitle': 'Fix a VLOOKUP error', 'reason': 'one-off task'}],
    }
    a.goto(BASE + '#/ask')
    a.get_by_role('button', name='Import Claude’s reply').click()
    a.fill('#imp-text', 'Here you go!\n```json\n' + json.dumps(reply, indent=2) + '\n```')
    a.get_by_role('button', name='Review').click()
    expect(a.locator('.page-title')).to_have_text('3 worth keeping')
    a.locator('[data-skip="0"]').click()
    a.screenshot(path=f'{OUT}/23-sweep-review.png', full_page=True)
    a.locator('[data-apply]').click()
    expect(a.locator('#toast')).to_contain_text('added to inbox', timeout=15000)
    t = titles(a)
    assert 'Build my own second brain app' in t and 'Revisit: SGD to JPY rate' in t, t
    sealed_ok = a.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title === 'Budget for next year')?.sealed)")
    filed = a.evaluate(f"import('./js/vault.js').then(V => V.state.notes.get('{inbox_id}').region)")
    last = a.evaluate("import('./js/vault.js').then(V => V.state.config.lastSweepAt)")
    print('import applied; sealed:', sealed_ok, 'filed:', filed, 'lastSweepAt set:', bool(last))
    assert sealed_ok and filed == 'career' and last
    a.goto(BASE + '#/inbox'); a.screenshot(path=f'{OUT}/24-inbox-after-sweep.png', full_page=True)

    # Change passphrase on A; B must use the new one after locking
    a.goto(BASE + '#/settings')
    a.get_by_role('button', name='Change passphrase').click()
    a.fill('#pw-old', PASS); a.fill('#pw-new', PASS2); a.fill('#pw-new2', PASS2)
    a.locator('#pw-form button[type=submit]').click()
    expect(a.locator('#toast')).to_contain_text('Passphrase changed', timeout=20000)
    assert sync(a) == 'ok'; assert sync(bp) == 'ok'
    bp.evaluate("import('./js/vault.js').then(V => V.lock())")
    bp.wait_for_selector('#pass')
    bp.fill('#pass', PASS2); bp.get_by_role('button', name='Unlock').click()
    expect(bp.locator('.sidebar')).to_be_visible(timeout=20000)
    print('new passphrase works on B: ok')
    bp.emulate_media(color_scheme='dark')
    bp.goto(BASE + '#/map'); bp.wait_for_timeout(3000)
    bp.screenshot(path=f'{OUT}/25-ipad-map-dark.png')
    print('commits in repo:', len(repo.commits), 'calls:', len(repo.calls))
    b.close()

print('ERRORS:', json.dumps(errors, indent=1) if errors else 'none')
print('TEST2 PASS')
