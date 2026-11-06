"""Offline start via the service worker, map framing on a phone, and the review/answer flow."""
import os, json, time
from playwright.sync_api import sync_playwright, expect

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SP, 'shots')
BASE = 'http://127.0.0.1:8765/'
PASS = 'harbour lights fold four'
errors = []

def wait_until(page, js, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        time.sleep(0.25)
    raise AssertionError('timed out: ' + js)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR {e}'))
    page.goto(BASE)
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click()
    expect(page.locator('.tabbar')).to_be_visible(timeout=20000)
    page.evaluate("""async () => {
      const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const regions = ['career', 'investing', 'travel', 'ideas', 'people'];
      const words = ['Promotion case', 'Q3 rollout', 'MD feedback', 'D05 thesis', 'Japan REITs', 'Momentum test', 'Kyoto plan', 'Ryokan list', 'Trip budget', 'Thinking in Bets', 'Managing up', 'Second brain', 'Mentor chat', 'Coffee log', 'Book notes', 'Deck review', 'Bond ladder', 'ETF fees', 'Flight deals', 'Onsen towns'];
      const made = [];
      for (let i = 0; i < 40; i++) {
        const n = M.newNote({ title: `${words[i % words.length]}${i >= 20 ? ' II' : ''}`, titleAuto: false, region: regions[i % 5], inbox: false, source: 'thought' });
        if (made.length && i % 3 === 0) n.links.push(made[(i * 7) % made.length].id);
        made.push(n);
      }
      for (let i = 0; i < 5; i++) made.push(M.newNote({ body: 'Unsorted thought ' + i, source: 'thought' }));
      for (const n of made) await V.saveNote(n);
    }""")
    page.goto(BASE + '#/map')
    page.wait_for_timeout(4000)
    page.screenshot(path=f'{OUT}/30-map-phone-40.png')

    # Answer-type reply
    first = page.evaluate("import('./js/vault.js').then(V => [...V.state.notes.values()][0].title)")
    reply = {'format': 'second-brain/v1', 'kind': 'answer', 'answer': f'You keep coming back to trust. See [[{first}]] and [[Managing up]].', 'suggestedLinks': []}
    page.goto(BASE + '#/ask')
    page.fill('#question', 'What do I keep coming back to?')
    page.get_by_role('button', name='Import Claude’s reply').click()
    page.fill('#imp-text', json.dumps(reply))
    page.get_by_role('button', name='Review').click()
    expect(page.locator('.answer a.wikilink').first).to_be_visible()
    page.screenshot(path=f'{OUT}/31-answer.png')
    page.locator('[data-apply]').click()
    expect(page.locator('.note-title')).to_contain_text('Q: What do I keep coming back to?')

    # Bad import shows a clear error
    page.goto(BASE + '#/ask')
    page.get_by_role('button', name='Import Claude’s reply').click()
    page.fill('#imp-text', 'just some text')
    page.get_by_role('button', name='Review').click()
    expect(page.locator('#imp-err')).to_contain_text('Couldn')

    # Offline start from the service worker cache
    page.wait_for_timeout(1500)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))")
    print('service worker active:', sw)
    ctx.set_offline(True)
    page.reload()
    expect(page.get_by_role('button', name='Unlock')).to_be_visible(timeout=15000)
    page.fill('#pass', PASS); page.get_by_role('button', name='Unlock').click()
    expect(page.locator('.tabbar')).to_be_visible(timeout=20000)
    wait_until(page, "import('./js/vault.js').then(V => V.state.notes.size > 40)")
    print('offline unlock with notes: ok')
    ctx.set_offline(False)
    b.close()

print('ERRORS:', json.dumps(errors, indent=1) if errors else 'none')
print('TEST3 PASS')
