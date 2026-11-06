"""Round 10: unlock with Touch ID / Face ID (a passkey's PRF secret), tested
with Chromium's virtual authenticator on http://localhost (passkeys can't use
an IP address)."""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
PASS = 'harbour lights fold four'
OUT = 'shots5'

def main(mob):
    vp = (390, 844) if mob else (1180, 820)
    tag = 'phone' if mob else 'ipad'
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=2, is_mobile=mob, has_touch=True, service_workers='block')
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: (errs.append(str(e)), print('PAGEERROR', e)))
        cdp = ctx.new_cdp_session(page)
        cdp.send('WebAuthn.enable', {'enableUI': False})
        auth = cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'ctap2Version': 'ctap2_1', 'transport': 'internal', 'hasResidentKey': True, 'hasUserVerification': True, 'isUserVerified': True, 'hasPrf': True, 'automaticPresenceSimulation': True}})['authenticatorId']
        J = lambda js, arg=None: page.evaluate(js, arg)
        page.goto(BASE)
        page.get_by_text('Start a new second brain').click()
        page.fill('#p1', PASS); page.fill('#p2', PASS); page.check('#ack')
        page.get_by_role('button', name='Create my second brain').click()
        page.wait_for_selector('.shell', timeout=20000)
        J("""(async () => { const V = await import('./js/vault.js'); const M = await import('./js/model.js'); await V.updateDevice({ organise: false, semantic: false }); await V.saveNote(M.newNote({ title: 'Secret plan', titleAuto: false, body: 'Only for me', region: 'career', inbox: false })); })()""")
        # Settings: turn it on.
        page.goto(BASE + '#/settings'); page.wait_for_selector('#s-bio')
        print('switch enabled:', page.locator('#s-bio').is_enabled(), '|', page.locator('#s-bio').locator('xpath=../following-sibling::p').inner_text()[:90])
        page.locator('#s-bio').check(); page.wait_for_selector('#bio-p')
        page.fill('#bio-p', 'wrong words here'); page.locator('#bio-f [type=submit]').click(); page.wait_for_timeout(1500)
        print('wrong passphrase:', page.locator('#bio-err').inner_text()); assert 'doesn’t match' in page.locator('#bio-err').inner_text()
        page.fill('#bio-p', PASS); page.locator('#bio-f [type=submit]').click(); page.wait_for_selector('#bio-btn', state='visible', timeout=10000)
        page.screenshot(path=f'{OUT}/t-setup-{tag}.png')
        page.locator('#bio-btn').click()
        page.wait_for_function("() => !document.querySelector('#bio-btn')", timeout=15000)
        page.wait_for_timeout(600)
        on = J("import('./js/deviceunlock.js').then(async B => { const e = await B.enrolment(); return e && { v: e.v, hasBlob: !!e.blob.ct, cred: e.credId.length }; })")
        print('set up on this device:', on, '| switch:', page.locator('#s-bio').is_checked()); assert on and page.locator('#s-bio').is_checked()
        page.screenshot(path=f'{OUT}/t-settings-{tag}.png')
        # Nothing of it goes to sync: it lives in device-only storage, and the vault key itself isn't in it unencrypted.
        leak = J("""import('./js/db.js').then(async D => { const e = await D.meta.get('deviceUnlock'); return JSON.stringify(e).includes('Only for me'); })""")
        assert not leak
        # Lock: the unlock screen asks for Touch ID straight away (virtual sensor says yes).
        J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))")
        page.wait_for_selector('.shell', timeout=20000)
        n = J("import('./js/vault.js').then(V => [...V.state.notes.values()].find(x => x.title === 'Secret plan')?.body)")
        print('unlocked by fingerprint on opening:', n == 'Only for me'); assert n == 'Only for me'
        # Fingerprint not recognised: the button stays, the passphrase still works.
        cdp.send('WebAuthn.setUserVerified', {'authenticatorId': auth, 'isUserVerified': False})
        J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))")
        page.wait_for_selector('#bio', timeout=10000); page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/t-lock-{tag}.png')
        still = page.locator('#bio').is_visible()
        page.locator('#use-pass').click(); page.fill('#pass', PASS); page.keyboard.press('Enter')
        page.wait_for_selector('.shell', timeout=20000)
        print('not recognised -> button stays:', still, '| passphrase still works: yes'); assert still
        cdp.send('WebAuthn.setUserVerified', {'authenticatorId': auth, 'isUserVerified': True})
        # A month without the passphrase: it's asked for (no Touch ID button), then Touch ID is back.
        page.wait_for_timeout(1000)
        J("""import('./js/db.js').then(async D => { const e = await D.meta.get('deviceUnlock'); e.passAt = Date.now() - 31 * 86400000; await D.meta.set('deviceUnlock', e); })""")
        J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))")
        page.wait_for_selector('#pass', timeout=10000); page.wait_for_timeout(800)
        due = J("({ bio: !!document.querySelector('#bio'), hint: document.querySelector('#pass-box .hint')?.textContent || '' })")
        print('after a month:', due); assert not due['bio'] and 'month' in due['hint']
        page.fill('#pass', PASS); page.keyboard.press('Enter'); page.wait_for_selector('.shell', timeout=20000)
        J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))")
        page.wait_for_selector('.shell', timeout=20000)
        print('Touch ID back after the passphrase: yes')
        # A copy of the key from another passkey (wrong secret) is refused.
        bad = J("""(async () => { const C = await import('./js/crypto.js'); const D = await import('./js/db.js'); const e = await D.meta.get('deviceUnlock'); try { await C.unwrapKeyFromDevice(e.blob, crypto.getRandomValues(new Uint8Array(32))); return 'opened'; } catch (x) { return x.code; } })()""")
        print('wrong secret:', bad); assert bad == 'DEVICE_KEY_MISMATCH'
        # Turn it off: the copy is deleted; the unlock screen asks for the passphrase.
        page.goto(BASE + '#/settings'); page.wait_for_selector('#s-bio'); page.locator('#s-bio').uncheck(); page.wait_for_timeout(600)
        gone = J("import('./js/db.js').then(async D => !(await D.meta.get('deviceUnlock')))")
        J("import('./js/vault.js').then(V => setTimeout(() => V.lock(), 50))")
        page.wait_for_selector('#pass', timeout=10000); page.wait_for_timeout(600)
        print('turned off: copy deleted', gone, '| Touch ID button:', page.locator('#bio').count()); assert gone and page.locator('#bio').count() == 0
        assert not errs
        print('OK')
        b.close()

main(len(sys.argv) > 1 and sys.argv[1] == 'phone')
