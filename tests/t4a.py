"""Typed notes: headings, bullets, checklist, callout, label, table, [[link]], Tasks and Labels."""
from dbg import *
import json
OUT='shots4'
def steps(page):
    J = lambda js: page.evaluate(js)
    # A note to link to
    page.locator('[data-action=capture] >> visible=true').first.click()
    page.fill('#cap-text', 'Wei Ling\nMentor, met at the town hall.')
    page.get_by_role('button', name='Save to inbox').click(); page.wait_for_timeout(400)
    page.locator('[data-action=capture] >> visible=true').first.click()
    page.locator('[data-kind=note]').click()
    page.wait_for_selector('#n-title'); page.wait_for_timeout(500)
    page.wait_for_selector('#n-rich .rich')
    page.fill('#n-title', 'Q4 planning')
    page.keyboard.press('Enter')
    k = page.keyboard
    k.type('## Goals'); k.press('Enter')
    k.type('### Career'); k.press('Enter')
    k.type('- Send the promotion case'); k.press('Enter'); k.press('Tab'); k.type('Evidence list first'); k.press('Enter')
    k.type('Ask Wei Ling to review'); k.press('Enter'); k.press('Enter'); k.press('Enter')
    k.type('[ ] Book the December coffee'); k.press('Enter'); k.press('Enter')
    k.type('/call'); page.wait_for_timeout(300)
    assert page.locator('.popover .style-menu').count() == 1, 'slash menu did not open'
    page.screenshot(path=f'{OUT}/a-slash.png')
    k.press('Enter'); page.wait_for_timeout(200)
    k.type('No new side projects until the case is in.'); k.press('Enter'); k.press('Enter')
    k.type('Talk to [[Wei'); page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/a-wiki.png')
    k.press('Enter'); page.wait_for_timeout(200)
    # label from the toolbar
    page.locator('#n-tools [data-act=label]').click(); page.wait_for_timeout(300)
    page.locator('.popover [data-l=follow-up]').click(); page.wait_for_timeout(200)
    k.press('Enter'); k.type('/table'); page.wait_for_timeout(200); k.press('Enter'); page.wait_for_timeout(200)
    k.type('Option'); k.press('Tab'); k.type('Cost'); page.wait_for_timeout(1200)
    page.screenshot(path=f'{OUT}/a-editing.png', full_page=True)
    page.locator('#n-edit').click(); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/a-read.png', full_page=True)
    info = J("""async () => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(x=>x.title==='Q4 planning'); return {body:n.body, kinds:[...new Set(JSON.stringify(n.doc).match(/"type":"\\w+"/g))]}; }""")
    print(info['body']); print(info['kinds'])
    for need in ['## Goals', '### Career', '- Send the promotion case', '  - Evidence list first', '- [ ] Book the December coffee', '> [!important]', '[[Wei Ling]]', '#Follow-up', '| Option | Cost |']:
        assert need in info['body'], 'missing ' + need
    rich = page.locator('.rich')
    assert rich.locator('h2').count() == 1 and rich.locator('h3').count() == 1
    assert rich.locator('.callout .callout-label').inner_text().strip() == 'Important'
    assert rich.locator('.wikilink:not(.missing):not(.wl-br)').count() == 1
    # Follow the link while reading
    rich.locator('.wikilink:not(.wl-br)').click(); page.wait_for_timeout(600)
    assert 'Wei Ling' in page.locator('.note-title').first.inner_text(), 'wikilink did not open'
    page.screenshot(path=f'{OUT}/a-linked.png', full_page=True)
    print('backlinks:', page.locator('#n-conn').inner_text()[:200].replace('\n',' | '))
    assert 'Q4 planning' in page.locator('#n-conn').inner_text()
    # Tasks screen
    page.goto(BASE + '#/tasks'); page.wait_for_timeout(500)
    assert page.locator('.task-text', has_text='Book the December coffee').count() == 1
    page.locator('.task', has_text='Book the December coffee').locator('[data-due]').click(); page.wait_for_timeout(300)
    page.locator('.popover [data-d]').first.click(); page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/a-tasks.png', full_page=True)
    assert page.locator('#tg-today').count() == 1, 'not due today'
    page.locator('.task', has_text='Book the December coffee').locator('[data-tick]').click(); page.wait_for_timeout(700)
    body = J("""async () => { const V = await import('./js/vault.js'); return [...V.state.notes.values()].find(x=>x.title==='Q4 planning').body; }""")
    assert '- [x] Book the December coffee 📅' in body, body
    # Today shows quick add into today's note
    page.goto(BASE + '#/today'); page.wait_for_timeout(500)
    page.fill('#t-add-in', 'Call the bank'); page.locator('#t-add button[type=submit]').click(); page.wait_for_timeout(800)
    assert page.locator('#t-tasks .task-text', has_text='Call the bank').count() == 1
    bb = page.locator('.today-note').bounding_box(); page.mouse.click(bb['x'] + bb['width'] - 12, bb['y'] + bb['height'] - 6); page.wait_for_timeout(300); page.keyboard.press('Enter'); page.keyboard.press('Enter'); page.keyboard.type('Finished the mockups.'); page.wait_for_timeout(1300)
    page.screenshot(path=f'{OUT}/a-today.png', full_page=True)
    d = J("""async () => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(x=>x.daily); return n && n.body; }""")
    print('daily:', d); assert 'Call the bank' in d and 'Finished the mockups' in d
    # Labels screen
    page.goto(BASE + '#/labels?l=follow-up'); page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/a-labels.png', full_page=True)
    assert page.locator('.label-hit').count() == 1
    page.goto(BASE + '#/labels?l=important'); page.wait_for_timeout(600)
    assert page.locator('.label-hit').count() == 1
    # Export Markdown of the note
    print('OK typed')
import sys
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390,844) if mob else (1180,820), mob=mob)
