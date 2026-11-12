"""Round 6l: how pages show, per note. Pages button with a word on wide screens,
"Pages and layout" in the more menu; one chooser (Scroll down / Next page /
Endless) that only changes the note it is opened on and keeps its choice;
choosing it does not move the note in notebook lists (updatedAt); Endless is
not offered on a PDF markup; Add page works in both views."""
from dbg import *
import sys, os
OUT = 'shots5'
SP = os.path.dirname(os.path.abspath(__file__))
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const mk = async (t) => (await V.saveNote(M.newNote({ kind: 'ink', title: t, titleAuto: false, region: 'career', inbox: false, pages: [M.newPage({}), M.newPage({})] }))).id;
      return { a: await mk('Alpha'), b: await mk('Beta') }; })()""")
    note = lambda i: J(f"import('./js/vault.js').then(V => {{ const n = V.state.notes.get('{i}'); return {{ layout: n.layout, pageView: n.pageView, updatedAt: n.updatedAt, pages: n.pages.length }}; }})")
    device = lambda: J("import('./js/vault.js').then(V => V.state.device?.pageView || null)")
    stack = lambda: J("!!document.querySelector('.ink-stack .ink-page')")
    def open_note(i, want_stack):
        page.goto(BASE + '#/today'); page.wait_for_timeout(300)
        page.goto(BASE + f'#/note/{i}'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(700)
    def open_chooser():
        if wide:
            b = page.locator('[data-act=pages]')
            assert b.inner_text().strip() == 'Pages', 'the Pages button has a word on wide screens'
            assert b.get_attribute('aria-label'), 'and keeps its label'
            b.click()
        else:
            assert page.locator('[data-act=pages]').inner_text().strip() == '', 'phones keep the icon only'
            page.locator('[data-act=more]').click(); page.get_by_text('Pages and layout').click()
        page.wait_for_selector('[data-how]'); page.wait_for_timeout(300)
    hows = lambda: J("[...document.querySelectorAll('[data-how]')].map(b => [b.textContent, b.getAttribute('aria-checked')])")

    open_note(ids['a'], True)
    assert stack(), 'new notes follow the device setting: pages one under another'
    page.wait_for_timeout(1500); t0 = note(ids['a'])['updatedAt']
    open_chooser()
    print('options', hows()); assert hows() == [['Scroll down', 'true'], ['Next page', 'false'], ['Endless', 'false']]
    if not wide:
        vis = J("(() => { const h = document.querySelector('#pg-how').getBoundingClientRect(); return h.top >= 0 && h.bottom <= innerHeight; })()")
        assert vis, 'the menu entry scrolls the chooser into view'
    page.screenshot(path=f'{OUT}/l-sheet-{tag}.png')
    page.locator('[data-how=next]').click(); page.wait_for_timeout(900)
    a = note(ids['a']); print('A after', a)
    assert a['pageView'] == 'single' and a['layout'] == 'pages' and a['updatedAt'] == t0, 'saved on the note without moving it in lists'
    assert device() is None, 'the device setting is untouched'
    assert not stack() and page.locator('.ink-pagenav [data-pg=next]').is_visible() and 'Previous' in page.locator('.ink-pagenav').inner_text(), 'one page at a time with Previous and Next'
    page.screenshot(path=f'{OUT}/l-next-{tag}.png')

    open_note(ids['b'], True)
    assert stack(), 'the other note still scrolls down'
    open_note(ids['a'], False)
    assert not stack() and note(ids['a'])['pageView'] == 'single', 'A kept its choice after leaving and coming back'

    # Add page in one-at-a-time view (from the last page).
    page.locator('.ink-pagenav [data-pg=next]').click(); page.wait_for_timeout(600)
    page.locator('.ink-pagenav [data-pg=add]').click(); page.wait_for_timeout(900)
    assert note(ids['a'])['pages'] == 3, 'Add page in one-at-a-time view'

    # Endless, then back to Scroll down.
    open_chooser(); page.locator('[data-how=endless]').click(); page.wait_for_timeout(900)
    assert note(ids['a'])['layout'] == 'scroll', 'Endless sets the long page layout'
    open_chooser(); print('options', hows()); assert [h for h in hows() if h[1] == 'true'] == [['Endless', 'true']]
    page.locator('[data-how=down]').click(); page.wait_for_timeout(1200)
    a = note(ids['a']); assert a['layout'] == 'pages' and a['pageView'] == 'continuous', a
    assert stack(), 'pages one under another again'
    page.locator('.ink-pagenav [data-pg=add]').click(); page.wait_for_timeout(1000)
    assert note(ids['a'])['pages'] == 4, 'Add page in the scrolling view'
    page.screenshot(path=f'{OUT}/l-down-{tag}.png')

    # A PDF markup cannot be endless.
    nbid = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); return (await V.saveNotebook(M.newNotebook({ title: 'Papers', region: 'investing' }))).id; })()""")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_selector('[data-pdf]'); page.wait_for_timeout(300)
    page.locator('[data-pdf]').first.click(); page.wait_for_selector('.doc-choose')
    with page.expect_file_chooser() as fc:
        page.locator('.doc-choose').click()
    fc.value.set_files(os.path.join(SP, 'sample.pdf'))
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=60000)
    page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(800)
    open_chooser()
    print('pdf options', hows()); assert [h[0] for h in hows()] == ['Scroll down', 'Next page'], 'no Endless on a PDF'
    page.screenshot(path=f'{OUT}/l-pdf-{tag}.png')
    page.locator('[data-how=next]').click(); page.wait_for_timeout(900)
    assert not stack() and page.locator('.ink-pagenav [data-pg=next]').is_visible(), 'a PDF markup can show one page at a time'
    print('OK how pages show')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
