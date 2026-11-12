"""Fonts: the typed-note font menu lists all 15 fonts, each of the 8 added fonts
works as the Default text font (typed notes and new text boxes on handwritten
pages), a font file is fetched only once used, and the app makes no request
to any host other than the local server while doing all this."""
from dbg import *
import sys
from urllib.parse import urlparse
OUT = 'shots'
NEW = ['Lora', 'EB Garamond', 'Merriweather', 'Playfair Display', 'Inter', 'Lexend', 'Patrick Hand', 'Kalam']
REQUESTS = []

def run_test(steps, vp, mob):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=2, is_mobile=mob, has_touch=True, service_workers='block', permissions=['clipboard-read', 'clipboard-write'])
        page = ctx.new_page()
        page.on('console', lambda m: m.type in ('error', 'warning') and print('CONSOLE', m.type, m.text))
        page.on('pageerror', lambda e: print('PAGEERROR', e))
        page.on('request', lambda r: REQUESTS.append(r.url))
        page.goto(BASE)
        page.get_by_text('Start a new second brain').click()
        page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
        page.get_by_role('button', name='Create my second brain').click()
        page.wait_for_selector('.today-page', timeout=20000)
        steps(page)
        b.close()

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Font check', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some words to read.' }] }] } }))).id; })()""")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(300)

    # 1. The font menu lists all 15 fonts, in the order of js/fonts.js.
    page.locator('#n-rich .rich p').click(); page.wait_for_timeout(300)
    page.locator('[data-act=font]').first.click(); page.wait_for_selector('.font-menu'); page.wait_for_timeout(200)
    listed = J("[...document.querySelectorAll('.font-menu [data-font]')].map(b => b.dataset.font)")
    ids = J("import('./js/fonts.js').then(F => F.FONT_IDS)")
    print('menu:', len(listed), listed)
    assert len(listed) == 15 and listed == ids, 'the menu lists all 15 fonts'
    page.screenshot(path=f'{OUT}/p-menu-{tag}.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 2. Each added font as the Default text font (Settings) applies to a typed note.
    for name in NEW:
        page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
        page.select_option('#s-text-font', name); page.wait_for_timeout(400)
        cfg = J("import('./js/vault.js').then(V => V.state.config.text.font)")
        assert cfg == name, cfg
        page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(400)
        fam = J("getComputedStyle(document.querySelector('#n-rich .rich p')).fontFamily")
        ok = J(f"document.fonts.check('16px \"{name}\"')")
        print(f'{name}: note uses {fam[:45]}; loaded={ok}')
        assert name in fam, f'{name} applies to the typed note'
        assert ok, f'{name} is loaded after use'
    page.screenshot(path=f'{OUT}/p-note-{tag}.png')
    slug = 'lora-latin-400-normal.woff2'
    assert any(u.endswith('/fonts/' + slug) for u in REQUESTS), 'a font file is fetched when it is used'

    # 3. A new text box on a handwritten page starts with a new font (Kalam).
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
    page.select_option('#s-text-font', 'Kalam'); page.wait_for_timeout(300)
    iid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Font box', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{iid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(600)
    page.locator('#iv-tools [data-tool=text]').click(); page.wait_for_timeout(150)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    page.mouse.click(r[0] + r[2] * 0.2, r[1] + 120); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    page.keyboard.type('Written in Kalam'); page.wait_for_timeout(200)
    ed = J("getComputedStyle(document.querySelector('.tb-edit .tb-rich')).fontFamily"); print('text box:', ed[:45])
    assert 'Kalam' in ed, 'a new text box uses the new font'
    page.locator('.tb-done').click(); page.wait_for_timeout(900)
    o = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{iid}'); const d = await V.loadPage(n.pages[0].id); return d.objects.filter(o => o.type === 'text').map(o => o.font); }})")
    print('saved text box fonts:', o)
    assert o == ['Kalam']
    page.screenshot(path=f'{OUT}/p-box-{tag}.png')

    # 4. Back to the usual font.
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
    page.select_option('#s-text-font', ''); page.wait_for_timeout(300)
    cfg = J("import('./js/vault.js').then(V => V.state.config.text.font)")
    assert cfg is None, cfg

    # Nothing was requested from outside this local server.
    local = urlparse(BASE).netloc
    outside = [u for u in REQUESTS if not u.startswith(('data:', 'blob:')) and urlparse(u).netloc != local]
    print('requests:', len(REQUESTS), 'hosts:', sorted({urlparse(u).netloc for u in REQUESTS}))
    assert not outside, f'requests outside this server: {outside[:5]}'
    print('OK')

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run_test(steps, (390, 844) if mob else (1180, 820), mob)
