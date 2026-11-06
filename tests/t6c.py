"""Old notes come back on Today: "On this day" lists notes written on today's
date in earlier years (newest first), and "Worth another look" shows one
older, untouched note (the same one all day; "Another" passes over it).
Sealed notes and recent notes never show; with nothing old, the section hides."""
from dbg import *
import sys
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    # A brand-new vault: nothing old, so the section stays hidden.
    page.goto(BASE + '#/today'); page.wait_for_selector('.today-page'); page.wait_for_timeout(300)
    assert J("document.getElementById('t-back-sec')?.hidden") is True, 'hidden with nothing old'
    J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      const now = new Date(); const yearsAgo = (y, extraDays = 0) => { const d = new Date(now); d.setFullYear(d.getFullYear() - y); d.setHours(10); return d.getTime() - extraDays * 864e5; };
      const mk = (o) => V.saveNote(M.newNote({ kind: 'note', titleAuto: false, region: 'career', inbox: false, ...o }), { touch: false });
      await mk({ title: 'Started the new role', body: 'First day. Met the team.', createdAt: yearsAgo(1), updatedAt: yearsAgo(1) });
      await mk({ title: 'Kyoto, first trip', body: 'Fushimi Inari at dawn.', region: 'travel', createdAt: yearsAgo(3), updatedAt: yearsAgo(3) });
      await mk({ title: 'Secret plan', body: 'Sealed.', sealed: false, createdAt: yearsAgo(2), updatedAt: yearsAgo(2), _sealMe: true });
      for (let i = 0; i < 6; i++) await mk({ title: `Book notes ${i + 1}`, body: `Idea number ${i + 1} worth keeping.`, region: 'ideas', createdAt: Date.now() - (80 + i * 20) * 864e5, updatedAt: Date.now() - (70 + i * 20) * 864e5 });
      await mk({ title: 'Written last week', body: 'Too new to come back.', createdAt: Date.now() - 7 * 864e5, updatedAt: Date.now() - 7 * 864e5 });
      // The sealed one: mark it sealed in memory only (as if sealed and unlocked).
      const s = [...V.state.notes.values()].find(n => n.title === 'Secret plan'); V.state.notes.set(s.id, { ...s, sealed: true });
    })()""")
    page.goto(BASE + '#/map'); page.wait_for_timeout(200); page.goto(BASE + '#/today'); page.wait_for_selector('#t-back-sec:not([hidden])'); page.wait_for_timeout(300)
    on = page.locator('.back-list li').all_inner_texts()
    print('On this day:', [x.replace('\n', ' | ') for x in on])
    assert len(on) == 2 and '1 year ago' in on[0] and 'Started the new role' in on[0] and '3 years ago' in on[1]
    assert not any('Secret plan' in x for x in on), 'sealed notes never show'
    first = page.locator('.back-card .back-open .t').inner_text()
    card = page.locator('.back-card').inner_text()
    print('Worth another look:', card.replace('\n', ' | '))
    assert first.startswith('Book notes') and 'written' in card
    page.locator('#t-back-sec').scroll_into_view_if_needed(); page.screenshot(path=f'{OUT}/c-back-{tag}.png')
    # Same pick all day: leaving and coming back shows the same note.
    page.goto(BASE + '#/map'); page.wait_for_timeout(200); page.goto(BASE + '#/today'); page.wait_for_selector('#t-back-sec:not([hidden])')
    assert page.locator('.back-card .back-open .t').inner_text() == first, 'steady for the day'
    # "Another" passes over it, and keeps passing over it today.
    seen = {first}
    for _ in range(3):
        page.locator('[data-back-next]').click(); page.wait_for_timeout(200)
        t = page.locator('.back-card .back-open .t').inner_text(); print('another:', t)
        assert t not in seen and t.startswith('Book notes'); seen.add(t)
    page.goto(BASE + '#/map'); page.wait_for_timeout(200); page.goto(BASE + '#/today'); page.wait_for_selector('#t-back-sec:not([hidden])')
    assert page.locator('.back-card .back-open .t').inner_text() == t, 'passed-over notes stay passed over today; the last one shown stays'
    # Opening it goes to the note.
    page.locator('.back-card .back-open').click(); page.wait_for_timeout(500)
    assert '#/note/' in page.url
    # Notes too new never come back; the pick ignores them.
    picks = J("""Promise.all([import('./js/resurface.js'), import('./js/vault.js'), import('./js/notework.js')]).then(([R, V, W]) => R.worthAnotherLook([...V.state.notes.values()], W.isoToday()).map(n => n.title))""")
    print('candidates:', picks); assert 'Written last week' not in picks and 'Secret plan' not in picks and len(picks) == 8
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
