"""Phone flow: create vault, capture a screenshot, OCR, file it, map, note, ask."""
import os, sys, time, json
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright, expect

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SP, 'shots')
os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8765/'
PASS = 'harbour lights fold four'

# A fake phone screenshot with readable text.
img = Image.new('RGB', (1179, 2556), 'white')
d = ImageDraw.Draw(img)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 64)
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
d.text((80, 260), 'Japan REIT yields', font=fb, fill='black')
d.text((80, 380), 'by sector, September 2026', font=f, fill='black')
y = 560
for line in ['Office 4.1%', 'Residential 3.8%', 'Logistics 3.6%', 'Hotels 4.9%', 'Retail 4.4%']:
    d.text((80, y), line, font=f, fill=(40, 40, 40)); y += 110
shot = os.path.join(SP, 'shot1.png')
img.save(shot)

errors = []
def watch(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] PAGEERROR {e}'))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        service_workers='block', permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page(); watch(page, 'phone')
    page.goto(BASE)
    expect(page.get_by_text('Start a new second brain')).to_be_visible()
    page.screenshot(path=f'{OUT}/01-onboarding.png')
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS)
    page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click()
    expect(page.locator('.today-page')).to_be_visible(timeout=20000)
    page.goto(BASE + '#/map')
    expect(page.locator('#map-empty')).to_be_visible(timeout=20000)
    page.screenshot(path=f'{OUT}/02-map-empty.png')

    # Capture a thought
    page.locator('.tabbar [data-action=capture]').click()
    page.fill('#cap-text', 'Mentor said: write the promotion case as outcomes, not tasks.')
    page.screenshot(path=f'{OUT}/03-capture.png')
    page.get_by_role('button', name='Save to inbox').click()
    expect(page.locator('#toast')).to_contain_text('Saved to inbox')

    # Capture a screenshot
    page.locator('.tabbar [data-action=capture]').click()
    page.set_input_files('#cap-photos', shot)
    expect(page.locator('.shot img')).to_have_count(1)
    page.screenshot(path=f'{OUT}/04-capture-shot.png')
    page.locator('#cap-save').click()
    expect(page.locator('#toast')).to_contain_text('Saved to inbox')

    page.goto(BASE + '#/inbox')
    expect(page.locator('.page-sub')).to_contain_text('2 captures')
    # OCR should finish and retitle the screenshot note
    t0 = time.time()
    page.wait_for_function("() => !document.body.innerText.includes('Reading text')", timeout=120000)
    print('ocr seconds', round(time.time() - t0, 1))
    page.screenshot(path=f'{OUT}/05-inbox.png', full_page=True)
    body = page.locator('#main').inner_text()
    print('inbox text:', body[:400].replace('\n', ' | '))
    assert 'REIT' in body or 'Japan' in body, 'OCR text not found'

    # File the screenshot in Investing via suggestion chip
    row = page.locator('li.row', has_text='Japan')
    chip = row.locator('[data-file-in]', has_text='Investing')
    if chip.count():
        chip.first.click()
    else:
        row.locator('[data-other]').click(); page.locator('.menu button', has_text='Investing').click()
    expect(page.locator('#toast')).to_contain_text('Filed in Investing')

    # Seed a richer vault through the app's own module
    page.evaluate("""async () => {
      const V = await import('./js/vault.js');
      const M = await import('./js/model.js');
      const mk = (title, region, body = '', type = 'note') => M.newNote({ title, titleAuto: false, region, inbox: !region, body, type, source: 'thought' });
      const notes = {
        q3: mk('Led the Q3 platform rollout', 'career', '## What happened\\nCoordinated four teams to ship a week early.\\n\\n## Impact\\nNew users set up the same day.', 'highlight'),
        md: mk('MD feedback on the town hall deck', 'career'),
        promo: mk('Promotion case 2027', 'career', 'Outcomes, not tasks. See [[Led the Q3 platform rollout]].', 'plan'),
        pres: mk('Presenting with fewer slides', 'ideas'),
        mentor: mk('Mentor: Wei Ling', 'people', '', 'person'),
        coffee: mk('Coffee chats log', 'people'),
        d05: mk('D05 dividend thesis', 'investing'),
        mom: mk('Momentum backtest', 'investing'),
        mq: mk('Merlion-Quant notes', 'investing'),
        bets: mk('Thinking in Bets', 'ideas', 'Decisions are bets.'),
        manage: mk('Managing up', 'ideas', 'Earn trust with senior stakeholders.'),
        sb: mk('Second brain design', 'ideas', '', 'decision'),
        kyoto: mk('Kyoto, March 2027', 'travel', '', 'plan'),
        ryokan: mk('Ryokan shortlist', 'travel'),
        budget: mk('Trip budget', 'travel'),
      };
      const L = (a, b) => notes[a].links.push(notes[b].id);
      L('manage', 'mentor'); L('mentor', 'promo'); L('pres', 'md'); L('bets', 'mom'); L('bets', 'd05'); L('sb', 'mq'); L('q3', 'pres'); L('kyoto', 'ryokan'); L('kyoto', 'budget');
      notes.q3.suggested.push({ id: notes.manage.id, reason: 'Both are about earning trust with senior stakeholders.' });
      for (const n of Object.values(notes)) await V.saveNote(n);
      return Object.keys(notes).length;
    }""")
    page.goto(BASE + '#/map')
    page.wait_for_timeout(3500)
    page.screenshot(path=f'{OUT}/06-map.png')

    # Open a note from the list
    page.goto(BASE + '#/notes?region=career')
    page.locator('a.note-row').filter(has=page.locator('.row-title', has_text='Led the Q3')).click()
    expect(page.locator('.note-title')).to_have_text('Led the Q3 platform rollout')
    page.screenshot(path=f'{OUT}/07-note.png', full_page=True)
    # Accept suggested link
    page.locator('[data-accept]').click()
    expect(page.locator('.links-list')).to_contain_text('Managing up')

    # Wikilink renders as a link
    page.goto(BASE + '#/notes?q=promotion%20case')
    page.locator('a.note-row').filter(has=page.locator('.row-title', has_text='Promotion case 2027')).click()
    expect(page.locator('.wikilink:not(.wl-br)')).to_have_text('Led the Q3 platform rollout')

    # Edit a note
    page.locator('#n-edit').click()
    page.fill('#n-title', 'Promotion case for 2027')
    page.locator('.note-details > summary').click()
    page.select_option('#e-type', 'plan')
    page.locator('#n-edit').click()
    expect(page.locator('h1.note-title')).to_have_text('Promotion case for 2027')

    # Ask screen + copy sweep
    page.goto(BASE + '#/ask')
    page.screenshot(path=f'{OUT}/08-ask.png', full_page=True)
    page.locator('[data-copy=sweep]').click()
    expect(page.locator('.copied')).to_be_visible()
    clip = page.evaluate('navigator.clipboard.readText()')
    assert 'chat sweep' in clip and 'Led the Q3 platform rollout' in clip, clip[:300]
    print('sweep request chars', len(clip))

    # Notes list + search screenshot
    page.goto(BASE + '#/notes')
    page.screenshot(path=f'{OUT}/09-notes.png')
    page.goto(BASE + '#/settings')
    page.screenshot(path=f'{OUT}/10-settings.png', full_page=True)

    # Lock and unlock
    page.get_by_role('button', name='Lock now').click()
    expect(page.get_by_role('button', name='Unlock')).to_be_visible()
    page.fill('#pass', 'wrong passphrase here')
    page.get_by_role('button', name='Unlock').click()
    expect(page.locator('#err')).to_contain_text('doesn')
    page.screenshot(path=f'{OUT}/11-unlock-error.png')
    page.fill('#pass', PASS)
    page.get_by_role('button', name='Unlock').click()
    expect(page.locator('.tabbar')).to_be_visible(timeout=20000)
    page.goto(BASE + '#/notes')
    expect(page.locator('.page-sub')).to_contain_text('notes')
    print('after unlock:', page.locator('.page-sub').inner_text())

    # Dark mode map
    page.emulate_media(color_scheme='dark')
    page.goto(BASE + '#/map')
    page.wait_for_timeout(2500)
    page.screenshot(path=f'{OUT}/12-map-dark.png')
    page.goto(BASE + '#/inbox')
    page.screenshot(path=f'{OUT}/13-inbox-dark.png')
    page.emulate_media(color_scheme='light')

    # Check nothing readable is stored in IndexedDB
    leak = page.evaluate("""async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('second-brain'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const t = db.transaction('records').objectStore('records').getAll(); t.onsuccess = () => r(t.result); });
      return JSON.stringify(all).includes('Promotion case');
    }""")
    assert not leak, 'plaintext found in IndexedDB'
    print('storage encrypted: ok')
    ctx.storage_state(path=os.path.join(SP, 'state1.json'), indexed_db=True)
    b.close()

print('ERRORS:', json.dumps(errors, indent=1) if errors else 'none')
print('TEST1 PASS')
