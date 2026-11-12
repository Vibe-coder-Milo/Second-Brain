"""Pages in typed notes (12 Nov): a typed note shows as one endless page (as
before, the default), or as A4 pages one under another (Scroll down) or one
at a time (Next page), chosen per note from the Pages button (iPad) or
Pages and layout in the ... menu (phone). Text flows onto the next page by
itself, Add page here (Pages panel, or Insert > New page) starts a new page
at the cursor, Contents and its Pages list jump to the right page, PDF export
has the same number of pages, Today's note has no pages, and laying out a
long note after a keystroke is quick."""
from dbg import *
import sys
OUT = 'shots5'

LONG = """(n) => {
  const words = 'the quick brown fox jumps over a lazy dog while seven bright owls watch from the old oak tree near the river'.split(' ');
  const para = (k, len) => ({ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: len }, (_, i) => words[(i * 7 + k) % words.length]).join(' ') + '.' }] });
  const content = [];
  for (let s = 0; s < n; s++) {
    content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${s + 1}` }] });
    for (let p = 0; p < 4; p++) content.push(para(s * 4 + p, 28 + ((s + p) % 5) * 9));
    if (s % 3 === 1) content.push({ type: 'bulletList', content: [1, 2, 3, 4, 5].map((i) => ({ type: 'listItem', content: [para(i, 8)] })) });
  }
  return { type: 'doc', content };
}"""

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)

    ids = J(f"""(async () => {{ const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const long = ({LONG})(12);
      const a = await V.saveNote(M.newNote({{ kind: 'note', title: 'Long essay', titleAuto: false, region: 'career', inbox: false, doc: long }}));
      const brk = {{ type: 'doc', content: [
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter one' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'A short first page.' }}] }},
        {{ type: 'pageBreak' }},
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter two' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'A short second page.' }}] }},
        {{ type: 'pageBreak' }},
        {{ type: 'heading', attrs: {{ level: 1 }}, content: [{{ type: 'text', text: 'Chapter three' }}] }},
        {{ type: 'paragraph', content: [{{ type: 'text', text: 'And a third.' }}] }} ] }};
      const b = await V.saveNote(M.newNote({{ kind: 'note', title: 'Three chapters', titleAuto: false, region: 'career', inbox: false, doc: brk, pageMode: 'down' }}));
      return {{ a: a.id, b: b.id }}; }})()""")

    def open_note(nid):
        page.goto(BASE + f"#/note/{nid}"); page.wait_for_selector('#n-rich .ProseMirror'); page.wait_for_timeout(500)

    # Sheets and blocks, in page coordinates.
    LAYOUT = """(() => { const w = document.querySelector('#n-sheets'); const p = w.pager;
      const sh = [...document.querySelectorAll('.pg-sheet')].map(s => { const r = s.getBoundingClientRect(); return [r.top, r.bottom]; });
      const P = p ? p.geometry().P : 0;
      const bl = [...document.querySelectorAll('#n-rich .ProseMirror > *')].flatMap(e => /^(UL|OL)$/.test(e.tagName) ? [...e.children] : [e]).filter(e => !e.classList.contains('page-break')).map(e => {
        const r = e.getBoundingClientRect(); const pg = e.classList.contains('pg-push') ? parseFloat(e.style.getPropertyValue('--pg')) : 0; return [r.top + pg, r.bottom, e.tagName]; });
      const labels = [...document.querySelectorAll('.pg-label')].map(l => l.textContent);
      return { sh, bl, P, labels, count: p ? p.count : 0, mode: p ? p.mode : 'endless' }; })()"""

    def check_inside(L, what):
        bad = []
        for (t, b, tg) in L['bl']:
            s = [i for i, (a, z) in enumerate(L['sh']) if a - 1 <= t <= z]
            if not s: bad.append(('starts between pages', t, tg)); continue
            a, z = L['sh'][s[0]]
            if b > z - L['P'] + 1 and b - t < (z - a) - 2 * L['P']: bad.append(('crosses the bottom', t, b, z, tg))
        print(what, 'blocks', len(L['bl']), 'pages', len(L['sh']), 'problems', bad[:4])
        assert not bad, f'{what}: every block sits inside a page'

    # 1. Existing long note: Endless, nothing changed.
    open_note(ids['a'])
    L = J(LAYOUT)
    assert L['mode'] == 'endless' and not L['sh'], 'an existing note is one endless page'
    assert J("getComputedStyle(document.querySelector('#n-sheets')).display") == 'contents', 'the page box adds nothing in Endless'
    upd0 = J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['a']}').updatedAt)")

    # 2. Pages button (iPad) / Pages and layout (phone) -> Scroll down.
    def open_panel():
        if wide:
            assert J("!!document.querySelector('.note-top [data-act=pages]')"), 'labelled Pages button on the iPad'
            page.locator('.note-top [data-act=pages]').click()
        else:
            assert not J("!!document.querySelector('.note-top [data-act=pages]')"), 'no Pages button on the phone top bar'
            page.locator('[data-act=more]').click(); page.wait_for_timeout(200)
            page.get_by_role('button', name='Pages and layout').click()
        page.wait_for_selector('.pp-panel [data-how]'); page.wait_for_timeout(200)
    open_panel()
    page.screenshot(path=f'{OUT}/o-panel-{tag}.png')
    assert J("document.querySelector('.pp-panel [data-how=endless]').getAttribute('aria-checked')") == 'true'
    page.locator('.pp-panel [data-how=down]').click(); page.wait_for_timeout(900)
    L = J(LAYOUT)
    print('scroll down:', L['count'], 'pages', L['labels'][:3])
    assert L['mode'] == 'down' and L['count'] >= 4, 'a long note is several pages'
    assert L['labels'][0] == f"Page 2 of {L['count']}", 'Page N of M between pages'
    check_inside(L, 'scroll down')
    page.screenshot(path=f'{OUT}/o-down-{tag}.png')
    print('ok so far', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
