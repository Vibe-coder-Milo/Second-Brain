"""Handwritten notes: pen, highlighter, eraser, undo, stickers, post-it, text box tasks, lasso, pages, PDF in and out."""
from dbg import *
import os
OUT='shots4'
SP=os.path.dirname(os.path.abspath(__file__))
def stroke(page, pts):
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p, steps=3)
    page.mouse.up()
def steps(page):
    J = lambda js: page.evaluate(js)
    note = lambda: J("""async () => { const V = await import('./js/vault.js'); const n=[...V.state.notes.values()].find(x=>x.kind==='ink'); if(!n) return null; const d = await V.loadPage(n.pages[0].id); return {id:n.id, pages:n.pages.length, strokes:d.strokes.length, objects:d.objects.map(o=>o.type), labels:n.labels.map(l=>l.l), tasks:n.tasks.map(t=>[t.text,t.checked]), body:n.body}; }""")
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(300)
    page.locator('[data-new]').last.click(); page.wait_for_timeout(400)
    page.fill('#nbs-name', 'Career'); page.locator('[data-cover=contour]').click()
    page.locator('.nbs-head [type=submit]').click(); page.wait_for_selector('.nbv'); page.wait_for_timeout(300)
    page.locator('[data-newnote=ink]').first.click(); page.wait_for_selector('.ink-page canvas'); page.wait_for_timeout(800)
    box = page.locator('.ink-page').bounding_box()
    X = lambda u: box['x'] + u * box['width'] / 1000
    Y = lambda u: box['y'] + u * box['width'] / 1000
    # Pen: a heading underline and two words-ish scribbles
    stroke(page, [(X(140), Y(200)), (X(260), Y(170)), (X(380), Y(210)), (X(520), Y(180))])
    stroke(page, [(X(140), Y(270)), (X(200), Y(240)), (X(260), Y(290)), (X(330), Y(250))])
    stroke(page, [(X(140), Y(330)), (X(600), Y(332))])
    page.wait_for_timeout(900)
    n = note(); print('after pen', n['strokes']); assert n['strokes'] == 3
    # Highlighter
    page.locator('[data-tool=hl]').click()
    stroke(page, [(X(140), Y(262)), (X(330), Y(266))])
    # Eraser over the second scribble, then undo
    page.locator('[data-tool=eraser]').click()
    stroke(page, [(X(195), Y(220)), (X(205), Y(300))])
    page.wait_for_timeout(900)
    n = note(); print('after erase', n['strokes'])
    page.locator('[data-act=undo] >> visible=true').first.click(); page.wait_for_timeout(900)
    n2 = note(); print('after undo', n2['strokes']); assert n2['strokes'] == 4
    # Label sticker
    page.locator('#iv-tools [data-act=label]').click(); page.wait_for_selector('.popover [data-l=important]')
    page.screenshot(path=f'{OUT}/b-drawer.png')
    page.locator('.popover [data-l=important]').click(); page.wait_for_timeout(500)
    assert page.locator('.sel-bar').count() == 1
    # Marks pack star
    page.locator('[data-act=insert]').click(); page.locator('[data-ins=sticker]').click(); page.wait_for_timeout(300)
    page.locator('#sd-tabs [data-t=marks]').click(); page.locator('.sticker-cell[aria-label="Place Star"]').click(); page.wait_for_timeout(300)
    # Post-it
    page.locator('[data-act=insert]').click(); page.locator('[data-ins=postit]').click(); page.wait_for_timeout(300)
    page.locator('.sticker-cell[aria-label="Place a yellow post-it"]').click(); page.wait_for_timeout(400)
    page.fill('.postit-edit textarea', 'call the bank\nabout the loan')
    page.locator('.postit-edit [data-done]').click(); page.wait_for_timeout(300)
    # Washi tape
    page.locator('[data-act=insert]').click(); page.locator('[data-ins=sticker]').click(); page.wait_for_timeout(300)
    page.locator('#sd-tabs [data-t=tape]').click(); page.locator('.sticker-cell').first.click(); page.wait_for_timeout(300)
    # Text box with a checklist
    page.locator('[data-tool=text]').click()
    page.mouse.click(X(140), Y(720)); page.wait_for_selector('.tb-edit .rich'); page.wait_for_timeout(400)
    page.keyboard.type('### Decisions'); page.keyboard.press('Enter')
    page.keyboard.type('[ ] Draft promo case'); page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/b-textbox.png')
    page.locator('.tb-done').click(); page.wait_for_timeout(1300)
    n = note(); print('objects', n['objects'], 'labels', n['labels'], 'tasks', n['tasks']); print(n['body'])
    assert 'label' in n['objects'] and 'postit' in n['objects'] and 'text' in n['objects'] and 'sticker' in n['objects'] and 'tape' in n['objects']
    assert n['labels'] == ['important'] and n['tasks'] == [['Draft promo case', False]]
    assert 'call the bank' in n['body'] and '### Decisions' in n['body']
    page.screenshot(path=f'{OUT}/b-page.png')
    # Lasso the first stroke and move it
    page.evaluate("document.querySelector('.ink-scroll').scrollTop = 0"); page.wait_for_timeout(200)
    box = page.locator('.ink-page').bounding_box()
    page.locator('[data-tool=lasso]').click()
    stroke(page, [(X(120), Y(150)), (X(560), Y(140)), (X(560), Y(225)), (X(120), Y(230)), (X(118), Y(152))])
    page.wait_for_timeout(300)
    assert page.locator('.sel-box').count() == 1, 'lasso selected nothing'
    page.screenshot(path=f'{OUT}/b-lasso.png')
    stroke(page, [(X(330), Y(190)), (X(380), Y(450))])
    page.wait_for_timeout(900)
    # Pages
    page.locator('[data-act=pages]').click(); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/b-pages.png')
    page.set_input_files('.overlay [data-pdf]', os.path.join(SP, 'sample.pdf'))
    page.wait_for_function("() => document.getElementById('toast').innerText.includes('Imported')", timeout=60000)
    page.wait_for_timeout(800)
    n = note(); print('pages', n['pages']); assert n['pages'] == 3
    page.screenshot(path=f'{OUT}/b-pdfpage.png')
    pdf_text = J("""async () => { const V = await import('./js/vault.js'); return [...V.state.notes.values()].find(x=>x.kind==='ink').body; }""")
    assert 'REIT' in pdf_text, 'PDF text not kept'
    # Draw on the PDF page
    box = page.locator('.ink-page').bounding_box()
    page.locator('[data-tool=pen]').click()
    stroke(page, [(box['x']+100, box['y']+200), (box['x']+300, box['y']+210)])
    page.wait_for_timeout(900)
    # Export PDF
    with page.expect_download() as dl:
        page.locator('[data-act=export]').click()
    path = dl.value.path(); data = open(path,'rb').read()
    print('pdf bytes', len(data)); assert data[:4] == b'%PDF'
    # Tasks screen: tick the handwritten task
    page.goto(BASE + '#/tasks'); page.wait_for_timeout(600)
    row = page.locator('.task', has_text='Draft promo case'); assert row.count() == 1
    row.locator('[data-tick]').click(); page.wait_for_timeout(1200)
    n = note(); print('tasks now', n['tasks']); assert n['tasks'] == [['Draft promo case', True]]
    # Labels screen with a preview crop
    page.goto(BASE + '#/labels?l=important'); page.wait_for_timeout(1500)
    assert page.locator('.label-hit').count() == 1 and page.locator('.lh-canvas').count() == 1
    page.screenshot(path=f'{OUT}/b-labels.png')
    # Notebook export
    page.goto(BASE + '#/notebooks'); page.wait_for_timeout(300); page.locator('.nb-card').first.click(); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/b-notebook.png')
    page.locator('[data-act=more]').first.click(); page.wait_for_timeout(300)
    with page.expect_download(timeout=60000) as dl:
        page.locator('.menu button', has_text='Export notebook as PDF').click()
    data = open(dl.value.path(),'rb').read(); print('notebook pdf', len(data)); assert data[:4] == b'%PDF'
    page.locator('[data-act=more]').first.click(); page.wait_for_timeout(300)
    with page.expect_download(timeout=60000) as dl:
        page.locator('.menu button', has_text='Export notebook as Markdown').click()
    import zipfile
    z = zipfile.ZipFile(dl.value.path()); print('zip', z.namelist()[:8])
    print('OK ink')
run(steps, vp=(1180, 820), mob=False)
