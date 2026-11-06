"""Table views: presets, add rows, edit cells, group, sort, filter, cards, timeline, board drag, note properties."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js: page.evaluate(js)
    nbid = J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Career', region: 'career', sections: [{ id: 's_wins', name: 'Wins' }, { id: 's_11', name: '1:1s' }] }));
      for (const [t, d] of [['Led the Q3 platform rollout', '2026-09-14'], ['Town hall deck', '2026-08-22'], ['Cleaned up month-end reporting', '2025-06-03']])
        await V.saveNote(M.newNote({ title: t, titleAuto: false, notebook: nb.id, section: 's_wins', region: 'career', inbox: false, body: 'Notes about ' + t, props: {} }));
      return nb.id; }""")
    wide = page.viewport_size['width'] >= 900
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_timeout(500)
    page.locator('[data-view=s_wins]').click(); page.wait_for_selector('.tv-presets')
    page.screenshot(path=f'{OUT}/tv-setup-{int(wide)}.png')
    page.locator('[data-preset=wins]').click(); page.wait_for_selector('.tv-table'); page.wait_for_timeout(300)
    # set dates and other props
    fields = J(f"import('./js/vault.js').then(V => V.state.notebooks.get('{nbid}').sections[0].fields.map(f => [f.id, f.name, f.type]))"); print('fields', fields)
    page.locator('tr', has_text='Led the Q3').locator('td.tv-date .tv-cell').click(); page.wait_for_selector('.popover #dp-in')
    page.fill('.popover #dp-in', '2026-09-14'); page.wait_for_timeout(400)
    page.locator('tr', has_text='Led the Q3').locator('td.tv-text .tv-cell').click(); page.fill('.popover #tv-ed', 'Same-day set-up for new users'); page.keyboard.press('Enter'); page.wait_for_timeout(400)
    page.locator('tr', has_text='Led the Q3').locator('td.tv-tags .tv-cell').click(); page.fill('.popover #tv-q', 'Delivery'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    page.fill('.popover #tv-q', 'Stakeholders'); page.keyboard.press('Enter'); page.wait_for_timeout(200); page.keyboard.press('Escape'); page.wait_for_timeout(400)
    page.locator('tr', has_text='Led the Q3').locator('td.tv-person .tv-cell').click(); page.fill('.popover #tv-q', 'Wei Ling'); page.keyboard.press('Enter'); page.wait_for_timeout(200); page.keyboard.press('Escape'); page.wait_for_timeout(400)
    for t, d in [('Town hall deck', '2026-08-22'), ('Cleaned up month-end', '2025-06-03')]:
        page.locator('tr', has_text=t).locator('td.tv-date .tv-cell').click(); page.wait_for_selector('.popover #dp-in'); page.fill('.popover #dp-in', d); page.wait_for_timeout(400)
    props = J("""import('./js/vault.js').then(V => [...V.state.notes.values()].filter(n => n.title.startsWith('Led')).map(n => n.props)[0])"""); print('props', props)
    assert sorted(sum([v if isinstance(v, list) else [v] for v in props.values()], [])) == sorted(['2026-09-14', 'Same-day set-up for new users', 'Delivery', 'Stakeholders', 'Wei Ling'])
    # new row from the table
    page.locator('[data-tv=new]').click(); page.wait_for_selector('#tv-newtitle'); page.fill('#tv-newtitle', 'Coaching two new joiners'); page.keyboard.press('Enter'); page.wait_for_timeout(600); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    groups = page.locator('.tv-group').all_inner_texts(); print('groups', groups)
    assert any('2026' in g for g in groups) and any('2025' in g for g in groups)
    page.screenshot(path=f'{OUT}/tv-table-{int(wide)}.png')
    # filter by skill
    page.locator('[data-tv=filter]').click(); page.locator('.popover select').first.select_option('Delivery'); page.wait_for_timeout(500); page.keyboard.press('Escape')
    rows = page.locator('.tv-table tbody tr:not(.tv-group)').count(); print('filtered rows', rows); assert rows == 1
    page.locator('[data-tv=filter]').click(); page.locator('[data-clearf]').click(); page.wait_for_timeout(400)
    # other views
    for m in ['cards', 'timeline']:
        page.locator(f'[data-mode={m}]').click(); page.wait_for_timeout(500); page.screenshot(path=f'{OUT}/tv-{m}-{int(wide)}.png')
    assert page.locator('.tl-item').count() == 4
    page.locator('[data-mode=board]').click(); page.wait_for_selector('[data-tv=addstatus]'); page.locator('[data-tv=addstatus]').click(); page.wait_for_selector('.tv-col'); page.wait_for_timeout(300)
    print('COLS', page.evaluate("[...document.querySelectorAll('.tv-col')].map(c => c.dataset.colVal + ':' + c.querySelectorAll('.tv-card').length)"), page.evaluate("document.querySelector('.tv-board').outerHTML.length"))
    card = page.locator('.tv-card', has_text='Town hall deck').first
    target = page.locator('.tv-col[data-col-val=Doing]')
    cb = card.bounding_box(); tb = target.bounding_box(); vw = page.viewport_size['width']
    page.mouse.move(cb['x'] + 30, cb['y'] + 40); page.mouse.down(); page.mouse.move(cb['x'] + 60, cb['y'] + 60, steps=4)
    if tb['x'] + tb['width'] / 2 > vw - 20:
        # The Doing column is off to the right: hold near the edge so the board scrolls to it.
        page.mouse.move(vw - 8, tb['y'] + 60, steps=8)
        for _ in range(40):
            page.wait_for_timeout(50); tb = target.bounding_box()
            if tb['x'] + tb['width'] / 2 < vw - 70: break
        print('scrolled to', tb['x'])
    page.mouse.move(tb['x'] + tb['width'] / 2, tb['y'] + 60, steps=8); page.mouse.up(); page.wait_for_timeout(700)
    page.screenshot(path=f'{OUT}/tv-board-{int(wide)}.png')
    assert page.locator('.tv-col[data-col-val=Doing] .tv-card', has_text='Town hall deck').count() == 1, 'drag did not move the card'
    # note shows its properties
    nid = J("import('./js/vault.js').then(V => [...V.state.notes.values()].find(n => n.title.startsWith('Led')).id)")
    page.goto(BASE + f'#/note/{nid}'); page.wait_for_selector('#n-props:not([hidden])'); page.wait_for_timeout(300)
    # fields are folded away below the text, not between the title and it
    geo = J("(() => { const p = document.querySelector('#n-props').getBoundingClientRect(); const r = document.querySelector('#n-rich').getBoundingClientRect(); return [p.top, r.bottom, document.querySelector('#n-props details').open]; })()"); print('fields at', geo)
    assert geo[0] >= geo[1] - 1 and not geo[2]
    print('SUMMARY:', page.locator('#n-props summary').inner_text().replace('\n', ' '))
    page.locator('#n-props summary').click(); page.wait_for_timeout(200)
    print('PROPS:', page.locator('#n-props').inner_text().replace('\n', ' | '))
    assert 'Wei Ling' in page.locator('#n-props').inner_text()
    page.screenshot(path=f'{OUT}/tv-noteprops-{int(wide)}.png')
    print('OK table')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
