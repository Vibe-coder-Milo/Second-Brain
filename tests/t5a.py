"""Search by meaning and related notes, on device."""
from dbg import *
import time
def steps(page):
    page.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const mk = (title, region, body) => V.saveNote(M.newNote({ title, titleAuto: false, region, inbox: false, body, source: 'thought' }));
      await mk('Promotion case 2027', 'career', 'Move up a grade in the March 2027 cycle. Lead with outcomes, one clear ask.');
      await mk('Mentor coffee', 'career', 'She said sponsorship matters more than visibility. Find a senior sponsor before the review.');
      await mk('D05 dividend thesis', 'investing', 'Bank dividend yield near 6%. Payout ratio sustainable if margins hold.');
      await mk('Japan REIT yields', 'investing', 'Office 4.1%, residential 3.8%, logistics 3.6%.');
      await mk('Kyoto, March 2027', 'travel', 'Ryokan in Higashiyama, temples early morning, day trip to Nara.');
      await mk('Packing list', 'travel', 'Passport, adapters, walking shoes, rail pass.');
      await mk('Managing up', 'ideas', 'Share weekly wins with my manager, ask what she needs from me.');
    }""")
    t0 = time.time()
    page.evaluate("import('./js/semantic.js').then(S => S.buildIndex())")
    st = page.evaluate("import('./js/semantic.js').then(S => ({...S.semState}))")
    print('index built in', round(time.time() - t0, 1), 's', st)
    print(page.evaluate("import('./js/semantic.js').then(async S => (await S.searchByMeaning('how do I get a higher grade at work', {min: 0})).map(h => [h.note.title, +h.score.toFixed(3)]))"))
    print(page.evaluate("import('./js/model.js').then(async M => { const V = await import('./js/vault.js'); return M.searchNotes([...V.state.notes.values()], 'how do I get a higher grade at work').map(n => n.title); })"))
    page.goto(BASE + '#/notes?q=' + 'how%20do%20I%20get%20a%20higher%20grade%20at%20work'); page.wait_for_timeout(2500)
    txt = page.locator('#nq-meaning').inner_text(); print('MEANING:', txt.replace('\n', ' | ')[:300])
    first = page.locator('#nq-meaning .row-title').first.inner_text()
    assert first in ('Promotion case 2027', 'Managing up', 'Mentor coffee'), first
    page.screenshot(path='shots4/e-meaning.png', full_page=True)
    page.goto(BASE + '#/notes?q=' + 'stocks%20that%20pay%20income'); page.wait_for_timeout(2000)
    tops = page.locator('#nq-meaning .row-title').all_inner_texts()[:2]; print('income ->', tops)
    assert tops[0] in {'D05 dividend thesis', 'Japan REIT yields'}
    print(page.evaluate("import('./js/semantic.js').then(async S => { const V = await import('./js/vault.js'); const out = {}; for (const n of V.state.notes.values()) out[n.title] = S.similarNotes(n, {min: -1, limit: 3}).map(x => [x.note.title, +x.score.toFixed(2)]); return out; })"))
    nid = page.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title === 'D05 dividend thesis').id)")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_timeout(1200)
    conn = page.locator('#n-conn').inner_text(); print('CONN:', conn.replace('\n', ' | ')[:300])
    assert 'Close in meaning' in conn
    # persisted encrypted, reload uses the cache
    rows = page.evaluate("import('./js/db.js').then(async D => (await D.local.all()).map(r => [r.id, r.data.byteLength]))")
    print('stored vectors', len(rows), rows[:2])
    raw = page.evaluate("import('./js/db.js').then(async D => { const r = (await D.local.all())[0]; return Array.from(r.data.slice(0, 40)); })")
    print('settings'); page.goto(BASE + '#/settings'); page.wait_for_timeout(500)
    print(page.locator('#s-sem-status').inner_text())
    # Ask Claude with only the closest notes
    page.goto(BASE + '#/ask'); page.wait_for_timeout(800)
    page.fill('#question', 'Which dividend stocks should I look at again?'); page.wait_for_timeout(1500)
    print('ASK:', page.locator('#ask-count').inner_text())
    assert 'closest' in page.locator('#ask-count').inner_text()
    page.locator('[data-copy=question]').click(); page.wait_for_timeout(500)
    clip = page.evaluate("navigator.clipboard.readText()")
    print('request has D05:', 'D05 dividend thesis' in clip, 'has Kyoto:', 'Kyoto' in clip)
    assert 'D05 dividend thesis' in clip
    print('OK meaning')
run(steps)
