import sys
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8765/'; PASS='harbour lights fold four'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(service_workers='block'); page=ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.goto(BASE); page.wait_for_selector('text=Start a new second brain')
    res=page.evaluate("performance.getEntriesByType('resource').map(r => [r.name.replace(location.origin, ''), r.encodedBodySize || 0])")
    js=[r for r in res if r[0].endswith(('.js','.mjs'))]
    print(f'LOCK SCREEN: {len(js)} scripts {sum(r[1] for r in js)/1024:.0f} KB')
    for r in sorted(js,key=lambda r:-r[1])[:12]: print('  ',r[0],f'{r[1]/1024:.0f}')
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click(); page.wait_for_selector('.today-page', timeout=20000); page.wait_for_timeout(1500)
    res2=page.evaluate("performance.getEntriesByType('resource').map(r => [r.name.replace(location.origin, ''), r.encodedBodySize || 0])")
    js2=[r for r in res2 if r[0].endswith(('.js','.mjs'))]
    print(f'AFTER UNLOCK (today): {len(js2)} scripts {sum(r[1] for r in js2)/1024:.0f} KB')
    for r in sorted(js2,key=lambda r:-r[1])[:10]: print('  ',r[0],f'{r[1]/1024:.0f}')
    b.close()
