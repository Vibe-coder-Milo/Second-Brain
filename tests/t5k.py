"""The page must not jump when the tool changes (props row keeps one height)."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    tag = 'ipad' if page.viewport_size['width'] >= 700 else 'phone'
    page.goto(BASE + '#/note/new?kind=ink'); page.wait_for_selector('.ink-page canvas.ink-main'); page.wait_for_timeout(500)
    out = []
    for t in ['pen', 'hl', 'eraser', 'lasso', 'move', 'text', 'pen']:
        page.locator(f'#iv-tools [data-tool={t}]').click(); page.wait_for_timeout(150)
        if page.locator('.popover').count(): page.keyboard.press('Escape'); page.wait_for_timeout(100)
        out.append((t, J("(() => { const p = document.querySelector('#iv-props').getBoundingClientRect(); const g = document.querySelector('.ink-page').getBoundingClientRect(); return [Math.round(p.height), Math.round(g.y)]; })()")))
        page.screenshot(path=f'{OUT}/props-{t}-{tag}.png', clip={'x': 0, 'y': 0, 'width': page.viewport_size['width'], 'height': 360})
    print('props height, page top', out)
    assert len(set(tuple(v) for _, v in out)) == 1, 'page moved when the tool changed'
    print('OK steady')
mob = sys.argv[1:] != ['ipad']
run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
