"""Recording while writing, replay with fading, tap to jump, on-device transcript, search."""
import os, time
from playwright.sync_api import sync_playwright
SP = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(SP, 'shots5'); os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
def stroke(page, pts):
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p, steps=4)
    page.mouse.up()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={SP}/jfk.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, has_touch=True, service_workers='block', permissions=['microphone'])
    page = ctx.new_page()
    page.on('console', lambda m: (m.type == 'error' or 'DBG' in m.text) and print('CONSOLE', m.text[:200]))
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.goto(BASE); page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click(); page.wait_for_selector('.today-page', timeout=20000)
    nid = page.evaluate("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Career', region: 'career' }));
      const n = await V.saveNote(M.newNote({ kind: 'ink', title: 'Mentor coffee', titleAuto: false, notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false, pages: [M.newPage({})] }));
      return n.id; }""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('.ink-page canvas'); page.wait_for_timeout(600)
    box = page.locator('.ink-page').bounding_box(); X = lambda u: box['x'] + u * box['width'] / 1000; Y = lambda u: box['y'] + u * box['width'] / 1000
    page.locator('[data-act=record]').click(); page.wait_for_selector('.rec-bar', timeout=10000)
    page.wait_for_timeout(1500)
    stroke(page, [(X(140), Y(200)), (X(300), Y(180)), (X(460), Y(210))])
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/rec-bar.png')
    page.wait_for_timeout(3500)
    stroke(page, [(X(140), Y(320)), (X(300), Y(300)), (X(460), Y(330))])
    page.wait_for_timeout(5500)
    page.locator('.rec-bar [data-rec=stop]').click()
    page.wait_for_function("() => !document.querySelector('.rec-bar')", timeout=10000); page.wait_for_timeout(1200)
    info = page.evaluate(f"import('./js/vault.js').then(V => {{ const n = V.state.notes.get('{nid}'); return n.recordings.map(r => ({{dur: r.dur, mime: r.mime, size: r.size, segs: r.segs.length}})); }})")
    print('recordings', info); assert len(info) == 1 and info[0]['dur'] > 8
    # Replay
    page.locator('[data-act=replay]').click(); page.wait_for_selector('.replay-dock .pl-play', timeout=10000); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/replay-start.png')
    box = page.locator('.ink-page').bounding_box()
    # Tap the second line: player should jump near when it was written (~5s)
    page.evaluate("window.__dbg = []; const orig = HTMLMediaElement.prototype.play;")
    print(page.evaluate(f"""async () => {{ const V = await import('./js/vault.js'); const n = V.state.notes.get('{nid}'); const d = await V.loadPage(n.pages[0].id); return {{ ats: d.strokes.map(s => s.at), rec: n.recordings[0].segs }}; }}"""))
    page.mouse.click(X(300), Y(302)); page.wait_for_timeout(800)
    print('plmsg', page.evaluate("document.querySelector('.pl-msg')?.textContent"), page.evaluate("document.querySelector('.replay-dock').innerText.slice(0,120)"))
    print('toast', page.evaluate("document.getElementById('toast').innerText"), page.evaluate("document.elementFromPoint(%f, %f)?.className" % (X(300), Y(302))))
    print('audio', page.evaluate("[...document.querySelectorAll('audio')].length"), page.evaluate("document.querySelector('.ink-page') && getComputedStyle(document.querySelector('.ink-page')).pointerEvents"))
    t = page.evaluate("document.querySelector('#pl-now').textContent"); print('after tapping line 2:', t)
    page.locator('.pl-play').click(); page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUT}/replay-mid.png')
    page.locator('.pl-play').click()
    # Transcribe
    page.locator('[data-pl=transcribe]').click()
    page.wait_for_selector('.transcript', timeout=180000); page.wait_for_timeout(300)
    tr = page.locator('.transcript').inner_text(); print('TRANSCRIPT:', tr.replace('\n', ' ')[:200])
    assert 'countr' in tr.lower() or 'american' in tr.lower()
    page.screenshot(path=f'{OUT}/replay-transcript.png')
    # Search finds it by what was said
    page.goto(BASE + '#/notes?q=what%20your%20country'); page.wait_for_timeout(800)
    assert page.locator('.row-title', has_text='Mentor coffee').count() >= 1; print('found by transcript: ok')
    # Typed note recording
    page.locator('[data-action=capture] >> visible=true').first.click(); page.locator('[data-kind=note]').click(); page.wait_for_selector('#n-rich .rich')
    page.fill('#n-title', 'Call with Wei Ling'); page.keyboard.press('Enter'); page.keyboard.type('Notes from the call'); page.wait_for_timeout(1200)
    page.locator('[data-act=record]').click(); page.wait_for_selector('.rec-bar'); page.wait_for_timeout(3000)
    page.locator('.rec-bar [data-rec=stop]').click(); page.wait_for_selector('#n-recs:not([hidden]) .pl-play', timeout=10000); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/typed-recording.png', full_page=True)
    print('typed note recording: ok')
    b.close()
