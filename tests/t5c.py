"""Scanning: edge detection, straightening, clean-up, OCR, into a note and into handwritten pages."""
from dbg import *
import os
SP = os.path.dirname(os.path.abspath(__file__)); OUT = 'shots5'
def steps(page):
    page.locator('[data-action=capture] >> visible=true').first.click()
    page.locator('#cap-scan').click(); page.wait_for_selector('.scan-pick')
    page.screenshot(path=f'{OUT}/scan-pick.png')
    page.set_input_files('.scan-pick [data-in=photos]', os.path.join(SP, 'scanphoto.jpg'))
    page.wait_for_selector('#crop-stage img'); page.wait_for_timeout(600)
    corners = page.evaluate("""() => [...document.querySelectorAll('.crop-handle')].map(h => { const r = h.parentElement.querySelector('img').getBoundingClientRect(); const b = h.getBoundingClientRect(); return [+(((b.left + b.width/2) - r.left) / r.width).toFixed(3), +(((b.top + b.height/2) - r.top) / r.height).toFixed(3)]; })""")
    print('found corners', corners)
    true = [(0.173, 0.165), (0.86, 0.125), (0.92, 0.86), (0.113, 0.9)]
    err = max(max(abs(a[0]-b[0]), abs(a[1]-b[1])) for a, b in zip(corners, true)); print('max corner error', round(err, 3))
    assert err < 0.03, 'edges not found'
    page.screenshot(path=f'{OUT}/scan-crop.png')
    page.locator('[data-x=next]').click(); page.wait_for_selector('#sc-prev[src]'); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/scan-colour.png')
    page.locator('[data-f=bw]').click(); page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/scan-bw.png')
    page.locator('[data-x=keep]').click(); page.wait_for_selector('.scan-pages img'); page.wait_for_timeout(300)
    page.locator('[data-x=save]').click(); page.wait_for_timeout(1000)
    page.goto(BASE + '#/inbox')
    page.wait_for_function("() => !document.body.innerText.includes('Reading text')", timeout=120000); page.wait_for_timeout(800)
    txt = page.locator('#main').inner_text(); print('INBOX:', txt[:300].replace('\n', ' | '))
    assert 'Quarterly review' in txt or 'dividend' in txt.lower(), 'OCR did not read the scan'
    page.screenshot(path=f'{OUT}/scan-inbox.png', full_page=True)
    print('OK scan')
run(steps)
