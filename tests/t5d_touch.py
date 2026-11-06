"""Board on a phone with a finger: a swipe scrolls, press-and-hold drags a card."""
from dbg import *
def steps(page):
    J = lambda js: page.evaluate(js)
    nbid = J("""async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Work', region: 'career', sections: [{ id: 's_p', name: 'Projects', fields: [{ id: 'f_st', name: 'Status', type: 'select', options: ['Idea', 'Doing', 'Done'] }], view: { mode: 'board', board: 'f_st' } }] }));
      for (const t of ['Alpha', 'Beta', 'Gamma']) await V.saveNote(M.newNote({ title: t, titleAuto: false, notebook: nb.id, section: 's_p', region: 'career', inbox: false, body: 'x', props: { f_st: 'Idea' } }));
      return nb.id; }""")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_timeout(500)
    page.locator('[data-act=table]').click(); page.wait_for_selector('.tv-col'); page.wait_for_timeout(300)
    cdp = page.context.new_cdp_session(page)
    def touch(kind, x, y):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
    card = page.locator('.tv-card', has_text='Beta').first.bounding_box()
    x0, y0 = card['x'] + 40, card['y'] + 30
    # 1. a quick swipe left scrolls the board
    touch('touchStart', x0, y0)
    for i in range(1, 11): touch('touchMove', x0 - i * 18, y0); page.wait_for_timeout(16)
    touch('touchEnd', 0, 0); page.wait_for_timeout(400)
    sl = J("document.querySelector('.tv-board').scrollLeft"); print('scrolled by swipe', sl)
    assert sl > 40, 'swipe did not scroll the board'
    assert J("document.querySelector('.tv-col[data-col-val=Idea]').querySelectorAll('.tv-card').length") == 3
    J("document.querySelector('.tv-board').scrollLeft = 0"); page.wait_for_timeout(200)
    # 2. press and hold, then drag to Doing
    card = page.locator('.tv-card', has_text='Beta').first.bounding_box()
    x0, y0 = card['x'] + 40, card['y'] + 30
    touch('touchStart', x0, y0); page.wait_for_timeout(450)
    assert J("!!document.querySelector('.tv-ghost')"), 'hold did not pick up the card'
    tb = page.locator('.tv-col[data-col-val=Doing]').bounding_box()
    tx, ty = min(tb['x'] + tb['width'] / 2, 380), tb['y'] + 50
    for i in range(1, 13): touch('touchMove', x0 + (tx - x0) * i / 12, y0 + (ty - y0) * i / 12); page.wait_for_timeout(30)
    for _ in range(30):
        tb = page.locator('.tv-col[data-col-val=Doing]').bounding_box()
        if tb['x'] + tb['width'] / 2 < 330: break
        page.wait_for_timeout(50)
    touch('touchMove', tb['x'] + tb['width'] / 2, ty); page.wait_for_timeout(60)
    touch('touchEnd', 0, 0); page.wait_for_timeout(700)
    page.screenshot(path='shots5/tv-board-touch.png')
    n = J("document.querySelector('.tv-col[data-col-val=Doing]').querySelectorAll('.tv-card').length"); print('in Doing', n)
    assert n == 1
    print('OK touch board')
run(steps)
