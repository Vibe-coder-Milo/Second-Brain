"""Menu numbers, tasks by region, more region colours, and Contents / Pages
for long typed notes. (1) The menu shows "N due" beside Today and Tasks (the
same count: tasks due today or earlier), how many tasks are left, one line
per region under Tasks, and how many labelled spots and highlights there are;
ticking a task updates them. A region line opens Tasks by region showing only
that region. (2) 25 region colours in a grid in Settings. (3) A long typed
note's Contents lists its headings with reading times and marks the one
you're in; tapping one jumps there (on its own and inside a notebook); Back
to top / To the end; Pages shows it as printed pages and a tap goes there."""
from dbg import *
import sys
OUT = 'shots5'

def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    os.makedirs(OUT, exist_ok=True)
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); const D = await import('./js/doc.js');
      const today = D.isoToday(); const add = (d, k) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
      const task = (text, due, checked = false) => ({ type: 'taskItem', attrs: { checked }, content: [{ type: 'paragraph', content: [{ type: 'text', text }, ...(due ? [{ type: 'text', text: ' ' }, { type: 'dueDate', attrs: { date: due } }] : [])] }] });
      const list = (...items) => ({ type: 'taskList', content: items });
      const career = await V.saveNote(M.newNote({ title: 'Career tasks', titleAuto: false, region: 'career', inbox: false, doc: { type: 'doc', content: [list(task('Send the numbers', add(today, -1)), task('Draft the summary', today), task('Book a mentor chat', null), task('Old one', null, true))] } }));
      const inv = await V.saveNote(M.newNote({ title: 'Investing tasks', titleAuto: false, region: 'investing', inbox: false, doc: { type: 'doc', content: [list(task('Check dividend dates', add(today, 1)))] } }));
      const inbox = await V.saveNote(M.newNote({ title: 'Loose task', titleAuto: false, inbox: true, region: null, doc: { type: 'doc', content: [list(task('Reply to the landlord', today))] } }));
      const labelled = await V.saveNote(M.newNote({ title: 'Labelled', titleAuto: false, region: 'ideas', inbox: false, doc: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'labelChip', attrs: { label: 'important' } }, { type: 'text', text: ' first, and ' }, { type: 'text', marks: [{ type: 'highlight', attrs: { color: '#FFF1B8' } }], text: 'a highlighted bit' }] },
        { type: 'paragraph', content: [{ type: 'labelChip', attrs: { label: 'follow-up' } }, { type: 'text', text: ' second' }] }] } }));
      const pg = M.newPage({});
      const ink = await V.saveNote(M.newNote({ kind: 'ink', title: 'Marked PDF', titleAuto: false, region: 'ideas', inbox: false, pages: [pg] }));
      const hl = (id, y, at) => ({ id, t: 'hl', c: '#F7D046', s: 18, sp: 1, at, pts: [100, y, 0.5, 300, y, 0.5, 500, y, 0.5] });
      await V.savePage(pg.id, { v: 1, strokes: [hl('h1', 200, 1000), hl('h2', 600, 500000)], objects: [], tomb: [], at: 0 });
      const N = await import('./js/notework.js'); await N.refreshInkSummary(ink.id);
      return { career: career.id, inv: inv.id, inbox: inbox.id, ink: ink.id }; })()""")
    assert J(f"import('./js/vault.js').then(V => V.state.notes.get('{ids['ink']}').hlCount)") == 2, 'the handwritten note counts its 2 highlights'

    # (1) Menu numbers (the side menu is on wide screens).
    page.goto(BASE + '#/today'); page.wait_for_timeout(800)
    side = lambda: J("""(() => { const g = (h) => { const a = document.querySelector(`#sidebar a.side-link[href="${h}"]`); return a && { due: a.querySelector('.due-count')?.textContent || '', n: a.querySelector('.count')?.textContent || '' }; };
      return { today: g('#/today'), tasks: g('#/tasks'), labels: g('#/labels'), hl: g('#/highlights'),
        regions: [...document.querySelectorAll('#sidebar .side-sub a')].map(a => a.querySelector('.grow').textContent + ' ' + a.querySelector('.count').textContent) }; })()""")
    if wide:
        m = side(); print('menu:', m)
        assert m['today']['due'] == '3 due' and m['tasks']['due'] == '3 due', 'Today and Tasks say the same: 3 due (yesterday, today, inbox today)'
        assert m['tasks']['n'] == '5', '5 left to do'
        assert m['regions'] == ['Career 3', 'Investing 1', 'No region 1'], 'one line per region with tasks'
        assert m['labels']['n'] == '2' and m['hl']['n'] == '3', '2 labels; 3 highlights (1 typed, 2 handwritten)'
        assert not J("!!document.querySelector('#sidebar .late-count')"), 'no "late" wording any more'
        page.screenshot(path=f'{OUT}/j-menu-{tag}.png', clip={'x': 0, 'y': 0, 'width': 260, 'height': 820})
        # Ticking a due task updates the numbers.
        J(f"""import('./js/notework.js').then(async N => {{ const t = N.allTasks().find(t => t.text.includes('Send the numbers')); await N.setTask(t, {{ checked: true }}); }})""")
        page.wait_for_timeout(700)
        m = side(); print('after ticking:', m)
        assert m['today']['due'] == '2 due' and m['tasks']['due'] == '2 due' and m['tasks']['n'] == '4' and m['regions'][0] == 'Career 2'
        # A region line opens Tasks by region, just that region.
        page.locator('#sidebar .side-sub a', has_text='Career').click(); page.wait_for_timeout(500)
    else:
        J(f"""import('./js/notework.js').then(async N => {{ const t = N.allTasks().find(t => t.text.includes('Send the numbers')); await N.setTask(t, {{ checked: true }}); }})""")
        page.goto(BASE + '#/tasks?by=region&region=career'); page.wait_for_timeout(600)
    heads = J("[...document.querySelectorAll('.tg-h.region')].map(h => h.textContent.replace(/\\s+/g, ' ').trim())")
    print('tasks, career only:', heads)
    assert len(heads) == 1 and heads[0].startswith('Career') and '2 to do' in heads[0] and '1 due' in heads[0]
    assert J("document.querySelector('[data-mode=region]').getAttribute('aria-checked')") == 'true'
    page.locator('[data-all-regions]').click(); page.wait_for_timeout(300)
    heads = J("[...document.querySelectorAll('.tg-h.region')].map(h => [...h.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim())")
    print('all regions:', heads); assert heads == ['Career', 'Investing', 'No region']
    assert '1 due' in J("document.querySelector('.page-sub').textContent") or '2 due' in J("document.querySelector('.page-sub').textContent")
    page.screenshot(path=f'{OUT}/j-tasks-region-{tag}.png')

    # (2) Region colours: a grid of 25, the picked one saved.
    page.goto(BASE + '#/settings'); page.wait_for_selector('#s-regions')
    page.locator('#s-regions').scroll_into_view_if_needed()
    page.locator('.region-colour').first.click(); page.wait_for_selector('.rc-grid')
    n_sw = J("document.querySelectorAll('.rc-grid [data-pick]').length"); print('colours offered:', n_sw)
    assert n_sw == 25 and J("document.querySelectorAll('.rc-grid .rc-used').length") >= 4, 'all 25, the ones other regions use marked'
    page.screenshot(path=f'{OUT}/j-colours-{tag}.png')
    page.locator('.rc-grid [data-pick=navy]').click(); page.wait_for_timeout(500)
    assert J("import('./js/vault.js').then(V => V.state.config.regions[0].color)") == 'navy'
    assert 'Navy' in J("document.querySelector('.region-colour').textContent")

    # (3) Contents and Pages in a long typed note.
    long = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const para = (k) => ({ type: 'paragraph', content: [{ type: 'text', text: ('Words that fill the page so the note runs long. ').repeat(14) + k }] });
      const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
      const content = [];
      for (const [lv, t] of [[1, 'Summary'], [2, 'Wins this year'], [3, 'Q1 launch'], [2, 'Client renewals'], [2, 'Feedback'], [2, 'Next steps']]) { content.push(h(lv, t)); for (let k = 0; k < 6; k++) content.push(para(k)); }
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Career 2026', region: 'career' }));
      return { nb: nb.id, id: (await V.saveNote(M.newNote({ title: 'Promotion case', titleAuto: false, region: 'career', inbox: false, notebook: nb.id, section: nb.sections[0].id, doc: { type: 'doc', content } }))).id }; })()""")
    where = [('own', f"#/note/{long['id']}")] + ([('pane', f"#/notebook/{long['nb']}?note={long['id']}")] if wide else [])
    for w, h in where:
        page.goto(BASE + h); page.wait_for_selector('#n-rich .rich h2'); page.wait_for_timeout(600)
        page.locator('[data-act=contents]').click(); page.wait_for_selector('.cts-item')
        items = J("[...document.querySelectorAll('.cts-item')].map(b => b.querySelector('.cts-t').textContent + '|' + (b.querySelector('.cts-min, .cts-here')?.textContent || ''))")
        print(w, 'contents:', items)
        assert [i.split('|')[0] for i in items] == ['Summary', 'Wins this year', 'Q1 launch', 'Client renewals', 'Feedback', 'Next steps']
        assert any('min' in i for i in items), 'reading times shown'
        if w == 'own': page.screenshot(path=f'{OUT}/j-contents-{tag}.png')
        page.locator('.cts-item', has_text='Client renewals').click(); page.wait_for_timeout(900)
        pos = J("""(() => { const hd = [...document.querySelectorAll('#n-rich .rich h2')].find(x => x.textContent === 'Client renewals'); const st = document.querySelector('#n-sticky').getBoundingClientRect().bottom; return { top: Math.round(hd.getBoundingClientRect().top), sticky: Math.round(st) }; })()""")
        print(w, 'after jumping:', pos)
        assert pos['sticky'] - 2 <= pos['top'] <= pos['sticky'] + 60, 'the heading lands just under the toolbar'
        page.locator('[data-act=contents]').click(); page.wait_for_selector('.cts-item')
        here = J("document.querySelector('.cts-item[aria-current]')?.querySelector('.cts-t').textContent")
        print(w, 'marked as here:', here); assert here == 'Client renewals'
        page.locator('[data-end]').click(); page.wait_for_timeout(900)
        last = J("(() => { const b = [...document.querySelectorAll('#n-rich .rich > *')].pop().getBoundingClientRect(); return b.bottom <= innerHeight + 2 && b.bottom > 0; })()")
        assert last, 'To the end shows the last paragraph'
        page.locator('[data-act=contents]').click(); page.wait_for_selector('[data-top]'); page.locator('[data-top]').click(); page.wait_for_timeout(900)
        assert J("document.querySelector('#n-head').getBoundingClientRect().top >= 0"), 'Back to top'
        # Pages: the note as printed pages; tap the 4th.
        page.locator('[data-act=contents]').click(); page.wait_for_selector('[data-pages]'); page.locator('[data-pages]').click()
        page.wait_for_selector('#pv-grid canvas', timeout=15000); page.wait_for_timeout(400)
        pv = J("({ n: document.querySelectorAll('#pv-grid [data-pg]').length, labels: [...document.querySelectorAll('#pv-grid .pv-label')].map(l => l.textContent), cur: [...document.querySelectorAll('#pv-grid [data-pg]')].findIndex(b => b.classList.contains('current')) })")
        print(w, 'pages:', pv)
        assert pv['n'] >= 4 and pv['cur'] == 0, 'several pages, the first one marked (at the top)'
        if w == 'own': page.screenshot(path=f'{OUT}/j-pages-{tag}.png')
        page.locator('#pv-grid [data-pg="3"]').click(); page.wait_for_timeout(1000)
        page.locator('[data-act=contents]').click(); page.wait_for_selector('[data-pages]'); page.locator('[data-pages]').click()
        page.wait_for_selector('#pv-grid canvas', timeout=15000); page.wait_for_timeout(300)
        cur = J("[...document.querySelectorAll('#pv-grid [data-pg]')].findIndex(b => b.classList.contains('current'))")
        print(w, 'after tapping page 4, marked:', cur + 1); assert cur in (2, 3), 'went to page 4 (or the line just before it)'
        page.locator('.pages-sheet [data-close]').click(); page.wait_for_timeout(200)
    print('ok', tag)

if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
