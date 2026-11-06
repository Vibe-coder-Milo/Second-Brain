import os, sys
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
def run(steps, vp=(390,844), mob=True):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=2, is_mobile=mob, has_touch=True, service_workers='block', permissions=['clipboard-read', 'clipboard-write'])
        page = ctx.new_page()
        page.on('console', lambda m: m.type in ('error','warning') and print('CONSOLE', m.type, m.text))
        page.on('pageerror', lambda e: print('PAGEERROR', e, (e.stack or '')[:600]))
        page.goto(BASE)
        page.get_by_text('Start a new second brain').click()
        page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
        page.get_by_role('button', name='Create my second brain').click()
        page.wait_for_selector('.today-page', timeout=20000)
        steps(page)
        b.close()
