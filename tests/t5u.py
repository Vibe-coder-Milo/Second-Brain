"""Round 11: bring in many PDFs at once (Notability exports), a zip whose
folders become sections, dates kept, typed text searchable."""
from dbg import *
import sys, base64
OUT = 'shots5'
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    wide = page.viewport_size['width'] >= 900
    tag = 'ipad' if wide else 'phone'
    J("import('./js/vault.js').then(V => V.updateDevice({ organise: false, semantic: false }))")
    made = J("""(async () => { const L = await import('./vendor/pdf-lib.esm.min.js'); const F = await import('./vendor/fflate.min.js');
      const mk = async (title, n, date) => { const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
        for (let i = 0; i < n; i++) { const pg = doc.addPage([595, 842]); pg.drawText(`${title} page ${i + 1}`, { x: 60, y: 760, size: 22, font }); pg.drawText('Kopi with the team about the condo budget', { x: 60, y: 700, size: 12, font }); }
        if (date) doc.setCreationDate(new Date(date)); return await doc.save(); };
      const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
      const zip = F.zipSync({ 'Notability/Finance/Budget 2025.pdf': await mk('Budget', 2), 'Notability/Finance/Tax.pdf': await mk('Tax', 1), 'Notability/Travel/Japan trip.pdf': await mk('Japan', 3) });
      return { a: b64(await mk('Lecture 1', 2, '2023-05-04T10:00:00Z')), b: b64(await mk('Lecture 2', 1)), c: b64(await mk('Meeting notes', 4)), zip: b64(zip) }; })()""")
    files = [{'name': 'Lecture 1.pdf', 'mimeType': 'application/pdf', 'buffer': base64.b64decode(made['a'])},
             {'name': 'Lecture 2.pdf', 'mimeType': 'application/pdf', 'buffer': base64.b64decode(made['b'])},
             {'name': 'Meeting_notes.pdf', 'mimeType': 'application/pdf', 'buffer': base64.b64decode(made['c'])},
             {'name': 'Notability backup.zip', 'mimeType': 'application/zip', 'buffer': base64.b64decode(made['zip'])}]
    page.goto(BASE + '#/notebooks'); page.wait_for_selector('[data-import]')
    page.locator('[data-import]').click(); page.wait_for_selector('[data-pick]')
    page.screenshot(path=f'{OUT}/u-intro-{tag}.png')
    with page.expect_file_chooser() as fc: page.locator('[data-pick]').click()
    fc.value.set_files(files)
    page.wait_for_selector('.imp-count')
    print('ready:', page.locator('.imp-count').inner_text(), '|', page.locator('.imp-body .hint').first.inner_text())
    assert '6 notes' in page.locator('.imp-count').inner_text()
    page.locator('[data-dest]').click(); page.wait_for_selector('[data-newnb]'); page.locator('[data-newnb]').click()
    page.wait_for_selector('#nbs-name'); page.fill('#nbs-name', 'From Notability'); page.locator('.nbs-head [type=submit]').click()
    page.wait_for_selector('[data-go]')
    page.screenshot(path=f'{OUT}/u-ready-{tag}.png')
    page.locator('[data-go]').click()
    page.wait_for_selector('.imp-done', timeout=120000)
    print('done:', page.locator('.imp-body').inner_text().replace('\n', ' | ')[:160])
    page.screenshot(path=f'{OUT}/u-done-{tag}.png')
    page.locator('[data-open]').click(); page.wait_for_timeout(500)
    assert page.locator('.overlay').count() == 0
    r = J("""import('./js/vault.js').then(V => { const nb = [...V.state.notebooks.values()].find(b => b.title === 'From Notability'); const ns = [...V.state.notes.values()].filter(n => n.notebook === nb.id);
      const sec = (id) => nb.sections.find(s => s.id === id)?.name; return { sections: nb.sections.map(s => s.name), notes: ns.map(n => [n.title, sec(n.section), n.pages.length, new Date(n.createdAt).getUTCFullYear(), /condo budget/.test(n.body || '')]).sort() }; })""")
    print('sections:', r['sections']); [print('note', x) for x in r['notes']]
    assert sorted(r['sections']) == ['Finance', 'Notes', 'Travel']
    t = {x[0]: x for x in r['notes']}
    assert t['Budget 2025'][1] == 'Finance' and t['Japan trip'][1] == 'Travel' and t['Japan trip'][2] == 3 and t['Meeting notes'][2] == 4
    assert t['Lecture 1'][3] == 2023 and all(x[4] for x in r['notes'])
    # Search finds typed text inside the PDFs.
    page.goto(BASE + '#/notes?q=condo%20budget'); page.wait_for_timeout(800)
    hits = page.locator('.row-title').count(); print('search hits:', hits); assert hits >= 6
    # Inside a notebook, picking several PDFs goes to the bulk import with that notebook already chosen.
    nbid = J("import('./js/vault.js').then(V => [...V.state.notebooks.values()].find(b => b.title === 'From Notability').id)")
    page.goto(BASE + f'#/notebook/{nbid}'); page.wait_for_selector('[data-pdf]'); page.wait_for_timeout(300)
    page.locator('[data-pdf]').first.click(); page.wait_for_selector('.doc-choose')
    with page.expect_file_chooser() as fc: page.locator('.doc-choose').click()
    fc.value.set_files(files[:2])
    page.wait_for_selector('[data-go]')
    dest = page.locator('.imp-dest-t').inner_text(); print('notebook already chosen:', dest); assert dest == 'From Notability'
    print('OK')
if __name__ == '__main__':
    mob = len(sys.argv) > 1 and sys.argv[1] == 'phone'
    run(steps, vp=(390, 844) if mob else (1180, 820), mob=mob)
