"""Default text in Settings: font, size and colour for new typed text. Typed
notes and Today's note use them (headings grow with the size), a colour shows
brightened in dark mode, new text boxes on handwritten pages start with them,
and the choice is kept in the synced settings."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    nid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'note', title: 'Text check', titleAuto: false, region: 'career', inbox: false,
        doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Big heading' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Some words to read.' }] }] } }))).id; })()""")
    style = lambda sel: J("""(sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), color: c.color, font: c.fontFamily }; }""", sel)
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(300)
    before = style('#n-rich .rich p'); h1 = style('#n-rich .rich h1')
    print('before:', before, 'heading', h1['size'])
    assert abs(before['size'] - 18) < 0.5 and 'Spectral' in before['font'], 'usual text is Spectral 18'
    # Settings: pick 22, Chart blue, Atkinson Hyperlegible.
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
    page.locator('#s-text-h').scroll_into_view_if_needed()
    page.locator('[data-text-size="22"]').click(); page.wait_for_timeout(300)
    page.locator('[data-text-colour="#2B5684"]').click(); page.wait_for_timeout(300)
    page.select_option('#s-text-font', 'Atkinson Hyperlegible'); page.wait_for_timeout(400)
    page.locator('#s-text-h').scroll_into_view_if_needed(); page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/a-settings-{tag}.png')
    cfg = J("import('./js/vault.js').then(V => V.state.config.text)")
    print('saved:', cfg)
    assert cfg == {'font': 'Atkinson Hyperlegible', 'size': 22, 'color': '#2B5684'}
    assert J("document.querySelector('[data-text-size=\"22\"]').getAttribute('aria-checked')") == 'true'
    # The typed note now uses them.
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(300)
    after = style('#n-rich .rich p'); h1b = style('#n-rich .rich h1')
    print('after:', after, 'heading', h1b['size'])
    assert abs(after['size'] - 22) < 0.5 and after['color'] == 'rgb(43, 86, 132)' and 'Atkinson' in after['font']
    assert h1b['size'] > h1['size'] * 1.15, 'headings grow with the text'
    page.screenshot(path=f'{OUT}/a-note-{tag}.png')
    # A note with its own font keeps it.
    J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{nid}'); await V.saveNote({{ ...n, font: 'Caveat' }}); }})")
    page.goto(BASE + '#/today'); page.wait_for_timeout(200); page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-rich .rich p'); page.wait_for_timeout(300)
    own = style('#n-rich .rich p'); print('own font:', own['font']); assert 'Caveat' in own['font']
    # Dark mode: the colour is brightened so it reads.
    J("import('./js/theme.js').then(T => T.applyTheme('dark'))"); page.wait_for_timeout(300)
    dark = style('#n-rich .rich p'); print('dark:', dark['color']); assert dark['color'] != 'rgb(43, 86, 132)'
    J("import('./js/theme.js').then(T => T.applyTheme('light'))"); page.wait_for_timeout(200)
    # Today's note follows too.
    page.goto(BASE + '#/today'); page.wait_for_selector('#t-rich .rich'); page.wait_for_timeout(300)
    t = style('#t-rich .rich'); print('today:', t); assert abs(t['size'] - 22) < 0.5 and 'Atkinson' in t['font']
    # A new text box on a handwritten page starts with them (22 there is 24 on the page).
    iid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      return (await V.saveNote(M.newNote({ kind: 'ink', title: 'Box check', titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({})] }))).id; })()""")
    page.goto(BASE + f'#/note/{iid}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(600)
    page.locator('#iv-tools [data-tool=text]').click(); page.wait_for_timeout(150)
    if page.locator('.popover').count(): page.keyboard.press('Escape')
    r = J("(() => { const r = document.querySelector('.ink-page').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    page.mouse.click(r[0] + r[2] * 0.2, r[1] + 120); page.wait_for_selector('.tb-edit .ProseMirror'); page.wait_for_timeout(300)
    page.keyboard.type('Typed on the page'); page.wait_for_timeout(200)
    ed = style('.tb-edit .tb-rich'); print('text box while typing:', ed); assert ed['color'] == 'rgb(43, 86, 132)' and 'Atkinson' in ed['font']
    page.locator('.tb-done').click(); page.wait_for_timeout(900)
    o = J(f"import('./js/vault.js').then(async V => {{ const n = V.state.notes.get('{iid}'); const d = await V.loadPage(n.pages[0].id); return d.objects.filter(o => o.type === 'text').map(o => [o.size, o.color, o.font]); }})")
    print('saved text box:', o)
    assert o == [[24, '#2B5684', 'Atkinson Hyperlegible']]
    # Back to usual: the "usual ink" swatch and the usual font.
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-text')
    page.locator('[data-text-colour=""]').click(); page.wait_for_timeout(300)
    page.select_option('#s-text-font', ''); page.wait_for_timeout(300)
    page.locator('[data-text-size="18"]').click(); page.wait_for_timeout(300)
    cfg = J("import('./js/vault.js').then(V => V.state.config.text)"); print('reset:', cfg)
    assert cfg == {'font': None, 'size': 18, 'color': None}
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
