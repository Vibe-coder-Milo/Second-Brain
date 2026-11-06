"""Phase 1 smoke: create a vault, visit every screen on iPhone and iPad sizes."""
import os, sys, json
from playwright.sync_api import sync_playwright, expect
SP = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(SP, 'shots4'); os.makedirs(OUT, exist_ok=True)
BASE = 'http://127.0.0.1:8765/'; PASS = 'harbour lights fold four'
errors = []
def watch(page, tag):
    page.on('console', lambda m: m.type in ('error',) and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] PAGEERROR {e}'))
def create(page):
    page.goto(BASE)
    page.get_by_text('Start a new second brain').click()
    page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
    page.get_by_role('button', name='Create my second brain').click()
    page.wait_for_selector('.today-page', timeout=20000)
def main(p):
    b = p.chromium.launch()
    for tag, vp, mob in [('phone', {'width': 390, 'height': 844}, True), ('ipad', {'width': 1180, 'height': 820}, False)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2, is_mobile=mob, has_touch=True, service_workers='block')
        page = ctx.new_page(); watch(page, tag)
        create(page)
        for route in ['today', 'notebooks', 'tasks', 'labels', 'notes', 'map', 'inbox', 'ask', 'settings']:
            page.goto(BASE + '#/' + route); page.wait_for_timeout(700)
            page.screenshot(path=f'{OUT}/{tag}-{route}.png')
        # new notebook sheet
        page.goto(BASE + '#/notebooks'); page.wait_for_timeout(400)
        page.locator('[data-new]').last.click(); page.wait_for_timeout(600)
        page.screenshot(path=f'{OUT}/{tag}-newnb.png')
        page.fill('#nbs-name', 'Career'); page.wait_for_timeout(200)
        page.locator('.nbs-head [type=submit]').click(); page.wait_for_selector('.nbv'); page.wait_for_timeout(700)
        page.screenshot(path=f'{OUT}/{tag}-notebook.png')
        # typed note
        page.locator('[data-newnote=note]').first.click(); page.wait_for_timeout(1200)
        page.screenshot(path=f'{OUT}/{tag}-typed-new.png')
        # ink note
        page.goto(BASE + '#/notebooks'); page.wait_for_timeout(300)
        page.locator('.nb-card').first.click(); page.wait_for_timeout(500)
        page.locator('[data-newnote=ink]').first.click(); page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/{tag}-ink-new.png')
        ctx.close()
    b.close()
with sync_playwright() as p:
    try: main(p)
    finally: print('\n'.join(errors) or 'no errors')
