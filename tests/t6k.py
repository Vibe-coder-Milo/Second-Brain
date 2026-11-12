"""Outline panel and the page's width on wide screens (1376 x 1032, an iPad
13-inch in landscape). The Outline panel sits beside the page and the page
makes room for it, but only when the panel is really shown. (1) A typed note
opened inside a notebook (its pane) has no Outline panel, so the page must
sit centred in the pane, not pushed to the right. (2) The same note opened on
its own still shows the Outline panel beside the page."""
from dbg import *
import sys
OUT = 'shots5'
LONG = ('This paragraph is here so the note has some length to scroll through, '
        'with a few sentences that wrap onto several lines at this width. ') * 4
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    os.makedirs(OUT, exist_ok=True)
    ids = J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const nb = await V.saveNotebook(M.newNotebook({ title: 'Outline check', region: 'career' }));
      const at = { notebook: nb.id, section: nb.sections[0].id, region: 'career', inbox: false };
      const H = (t) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t }] });
      const P = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
      const L = %s;
      const doc = { type: 'doc', content: [H('First part'), P(L), H('Second part'), P(L), H('Third part'), P(L)] };
      const n = await V.saveNote(M.newNote({ kind: 'note', title: 'Long typed note', titleAuto: false, ...at, doc }));
      return { nb: nb.id, id: n.id }; })()""" % repr(LONG).replace("'", '"'))
    page.goto(BASE + f"#/notebook/{ids['nb']}?note={ids['id']}")
    page.wait_for_selector('#n-rich .rich h2'); page.wait_for_timeout(500)
    st = J("""(() => { const np = document.querySelector('#np'); const rich = document.querySelector('#n-rich');
      const pane = document.querySelector('#nb-pane'); const outline = document.querySelector('#n-outline');
      return { withOutline: np.classList.contains('with-outline'), richLeft: rich.getBoundingClientRect().left,
        paneLeft: pane ? pane.getBoundingClientRect().left : null, paneRight: pane ? pane.getBoundingClientRect().right : null,
        richRight: rich.getBoundingClientRect().right, outlineHidden: outline ? outline.hidden : null }; })()""")
    print('inside notebook:', st)
    page.screenshot(path=f'{OUT}/k-notebook-pane.png')
    assert not st['withOutline'], 'no room is made for the Outline inside a notebook'
    # The page sits centred in the pane: as much space on the left as on the right.
    gapL = st['richLeft'] - st['paneLeft']; gapR = st['paneRight'] - st['richRight']
    print('gaps in pane: left', round(gapL), 'right', round(gapR))
    assert st['paneLeft'] is not None and abs(gapL - gapR) < 20, 'the page is centred in the notebook pane, not pushed right'

    page.goto(BASE + f"#/note/{ids['id']}")
    page.wait_for_selector('#n-rich .rich h2'); page.wait_for_timeout(500)
    st2 = J("""(() => { const o = document.querySelector('#n-outline'); return { withOutline: document.querySelector('#np').classList.contains('with-outline'),
      hidden: o.hidden, shown: getComputedStyle(o).display !== 'none' }; })()""")
    print('own page:', st2)
    page.screenshot(path=f'{OUT}/k-own-page.png')
    assert st2['withOutline'] and not st2['hidden'] and st2['shown'], 'on its own, the Outline panel is shown beside the page'
    print('ok')

if __name__ == '__main__':
    run(steps, vp=(1376, 1032), mob=False)
