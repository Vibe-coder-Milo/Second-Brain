"""Builds the new notebook cover artwork (SVG symbols for the cover sprite).
Run: python3 covergen.py > covers_extra.json"""
import json, math, random

SP = '<rect width="12" height="280" fill="#000" fill-opacity="0.18"/><line x1="12.5" y1="0" x2="12.5" y2="280" stroke="#fff" stroke-opacity="0.15"/>'
defs = []      # shared patterns, gradients, groups
symbols = []   # one per cover
covers = []    # metadata


def sym(cid, body):
    symbols.append(f'<symbol id="cv-{cid}" viewBox="0 0 210 280">{body}{SP}</symbol>')


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


# ---------------------------------------------------------------- Shophouses
defs.append('<pattern id="cv-pt-shtile" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#FFFFFF" fill-opacity="0.75"/><path d="M4 0.8 L7.2 4 L4 7.2 L0.8 4 Z" fill="#2A8C9C" fill-opacity="0.7"/><circle cx="4" cy="4" r="1.1" fill="#D9644E"/></pattern>')
defs.append('<g id="cv-shf">'
            '<rect x="0" y="10" width="66" height="210" fill="currentColor"/>'
            '<rect x="-1" y="3" width="68" height="9" fill="#B5543C"/><rect x="-1" y="12" width="68" height="3" fill="#FFFFFF" fill-opacity="0.75"/>'
            '<rect x="0" y="15" width="4" height="205" fill="#FFFFFF" fill-opacity="0.5"/><rect x="62" y="15" width="4" height="205" fill="#FFFFFF" fill-opacity="0.5"/>'
            '<path d="M9 62 V36 a10 10 0 0 1 20 0 V62 Z M37 62 V36 a10 10 0 0 1 20 0 V62 Z" fill="#2F6B5A"/>'
            '<path d="M19 27 V62 M47 27 V62 M9 44 H29 M9 52 H29 M37 44 H57 M37 52 H57" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="0.9"/>'
            '<rect x="7" y="62" width="24" height="3" fill="#FFFFFF" fill-opacity="0.85"/><rect x="35" y="62" width="24" height="3" fill="#FFFFFF" fill-opacity="0.85"/>'
            '<rect x="4" y="72" width="58" height="8" fill="url(#cv-pt-shtile)"/>'
            '<path d="M7 220 V156 a26 22 0 0 1 52 0 V220 Z" fill="#000000" fill-opacity="0.16"/>'
            '<rect x="22" y="172" width="22" height="48" fill="#7A4A2E"/><path d="M33 172 V220 M22 194 H44" stroke="#5A321E" stroke-width="1"/>'
            '<circle cx="15" cy="168" r="4" fill="#D9644E"/><path d="M15 172 V178" stroke="#E0A526" stroke-width="1"/>'
            '</g>')
sym('shophouse',
    '<rect width="210" height="280" fill="#F6E7CF"/><circle cx="176" cy="30" r="13" fill="#F2B652" fill-opacity="0.9"/>'
    '<use href="#cv-shf" x="12" y="54" color="#9ED2C6"/><use href="#cv-shf" x="78" y="54" color="#F4A9A0"/><use href="#cv-shf" x="144" y="54" color="#F3D27A"/>'
    '<rect x="12" y="272" width="198" height="8" fill="#B9A58C"/>'
    '<rect x="24" y="144" width="174" height="34" rx="2" fill="#1E3A34" stroke="#D8B25C" stroke-width="1.6"/>')
covers.append(dict(id='shophouse', name='Shophouses', group='asia', t=dict(x=111, y=167, font='serif', size=17, fill='#E8C46A', anchor='middle', max=152)))

# ---------------------------------------------------------------- HDB estate
defs.append('<pattern id="cv-pt-hdb" patternUnits="userSpaceOnUse" width="14" height="13"><rect x="3" y="2" width="8" height="6" fill="#2E4A5E" fill-opacity="0.5"/><rect y="10" width="14" height="2.2" fill="#FFFFFF" fill-opacity="0.6"/></pattern>')
defs.append('<linearGradient id="cv-g-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFDDF0"/><stop offset="1" stop-color="#EAF4F8"/></linearGradient>')
cl = ['#D9483B', '#3D7DD8', '#F2C14E', '#FFFFFF', '#2BB3A3']
random.seed(7)
poles = ''
for (x0, x1, y) in [(92, 112, 118), (92, 112, 170), (92, 110, 222), (118, 100, 146), (118, 100, 198)]:
    poles += f'<path d="M{x0} {y} H{x1}" stroke="#8A6A4A" stroke-width="1.2"/>'
    lo, hi = sorted([x0, x1])
    xx = lo + 2
    while xx < hi - 3:
        c = random.choice(cl)
        poles += f'<rect x="{xx}" y="{y + 0.8}" width="4" height="{random.choice([5, 6, 7])}" fill="{c}"/>'
        xx += 5.5
trees = ''
for i, x in enumerate(range(10, 216, 17)):
    r = 13 + (i % 3) * 3
    trees += f'<circle cx="{x}" cy="{262 - (i % 2) * 5}" r="{r}" fill="{"#3E7F57" if i % 2 else "#4E9A6B"}"/>'
sym('estate',
    '<rect width="210" height="280" fill="url(#cv-g-sky)"/>'
    '<rect x="18" y="84" width="74" height="196" fill="#F2C6A0"/><rect x="18" y="84" width="74" height="196" fill="url(#cv-pt-hdb)"/><rect x="18" y="78" width="74" height="8" fill="#D9A27C"/><rect x="40" y="68" width="22" height="10" fill="#C98F6A"/>'
    '<rect x="118" y="64" width="80" height="216" fill="#BFD9C2"/><rect x="118" y="64" width="80" height="216" fill="url(#cv-pt-hdb)"/><rect x="118" y="58" width="80" height="8" fill="#97BFA0"/><rect x="150" y="48" width="24" height="10" fill="#86AF90"/>'
    + poles + trees +
    '<rect x="0" y="270" width="210" height="10" fill="#9A8E7A"/>')
covers.append(dict(id='estate', name='HDB estate', group='asia', t=dict(x=24, y=40, font='serif', size=22, fill='#1B2A38', max=170)))

# ---------------------------------------------------------------- Lanterns
defs.append('<radialGradient id="cv-g-red" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#9E2420"/><stop offset="1" stop-color="#4E0B10"/></radialGradient>')
defs.append('<radialGradient id="cv-g-glow"><stop offset="0" stop-color="#FFC66B" stop-opacity="0.55"/><stop offset="1" stop-color="#FFC66B" stop-opacity="0"/></radialGradient>')
defs.append('<radialGradient id="cv-g-lan" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#FF8A5C"/><stop offset="0.6" stop-color="#E2452B"/><stop offset="1" stop-color="#A9251A"/></radialGradient>')
defs.append('<g id="cv-lan"><circle r="50" fill="url(#cv-g-glow)"/><line x1="0" y1="-120" x2="0" y2="-35" stroke="#E8B04A" stroke-width="1"/>'
            '<rect x="-10" y="-36" width="20" height="7" rx="1.5" fill="#E8B04A"/><ellipse rx="27" ry="29" fill="url(#cv-g-lan)"/>'
            '<g fill="none" stroke="#FFC16B" stroke-opacity="0.55" stroke-width="1"><ellipse rx="18.5" ry="29"/><ellipse rx="8" ry="29"/></g>'
            '<rect x="-10" y="27" width="20" height="7" rx="1.5" fill="#E8B04A"/><path d="M-4 34 V54 M0 34 V58 M4 34 V54" stroke="#E8B04A" stroke-width="1.3"/></g>')
sym('lanterns',
    '<rect width="210" height="280" fill="url(#cv-g-red)"/>'
    '<path d="M12 18 Q 110 52 210 14" fill="none" stroke="#E8B04A" stroke-opacity="0.6" stroke-width="0.8"/>'
    '<use href="#cv-lan" transform="translate(58 92) scale(0.78)"/><use href="#cv-lan" transform="translate(150 116) scale(1.05)"/><use href="#cv-lan" transform="translate(88 168) scale(0.62)"/>'
    '<g fill="#FFD27A"><circle cx="34" cy="200" r="1.2" fill-opacity="0.6"/><circle cx="186" cy="196" r="1" fill-opacity="0.5"/><circle cx="128" cy="60" r="1" fill-opacity="0.5"/></g>'
    '<line x1="40" y1="232" x2="182" y2="232" stroke="#E8B04A" stroke-opacity="0.5" stroke-width="0.8"/>')
covers.append(dict(id='lanterns', name='Lanterns', group='asia', t=dict(x=111, y=260, font='serif', size=24, fill='#F2C76A', anchor='middle', max=160)))

# ---------------------------------------------------------------- Seigaiha waves
defs.append('<g id="cv-sg"><circle r="26" fill="#1F3A68"/><circle r="23" fill="#F3EBDD"/><circle r="19" fill="#1F3A68"/><circle r="15.5" fill="#F3EBDD"/><circle r="11.5" fill="#1F3A68"/><circle r="8" fill="#F3EBDD"/><circle r="4" fill="#1F3A68"/></g>')
uses = ''
for r in range(0, 17):
    y = r * 13
    off = 26 if r % 2 else 0
    for c in range(-1, 6):
        uses += f'<use href="#cv-sg" x="{c * 52 + off}" y="{y}"/>'
sym('waves', '<rect width="210" height="280" fill="#F3EBDD"/>' + uses +
    '<rect x="0" y="206" width="210" height="74" fill="#1F3A68"/><line x1="0" y1="210" x2="210" y2="210" stroke="#F3EBDD" stroke-width="1"/>')
covers.append(dict(id='waves', name='Waves', group='asia', t=dict(x=111, y=252, font='serif', size=24, fill='#F3EBDD', anchor='middle', max=160)))

# ---------------------------------------------------------------- Koi pond
defs.append('<clipPath id="cv-koiclip"><path d="M0 -30 C 12 -24, 13 6, 4 26 C 2 30, -2 30, -4 26 C -13 6, -12 -24, 0 -30 Z"/></clipPath>')
body = 'M0 -30 C 12 -24, 13 6, 4 26 C 2 30, -2 30, -4 26 C -13 6, -12 -24, 0 -30 Z'
tail = 'M-3 25 C -14 32, -17 44, -11 49 C -5 41, -1 37, 0 31 C 1 37, 5 41, 11 49 C 17 44, 14 32, 3 25 Z'
fins = '<ellipse cx="-11" cy="-6" rx="8" ry="3.5" transform="rotate(35 -11 -6)"/><ellipse cx="11" cy="-6" rx="8" ry="3.5" transform="rotate(-35 11 -6)"/>'
defs.append(f'<g id="cv-koi1"><g fill="#F3EDE3" fill-opacity="0.9">{fins}</g><path d="{tail}" fill="#F08A3C" fill-opacity="0.9"/><path d="{body}" fill="#F7F2EA"/>'
            f'<g clip-path="url(#cv-koiclip)" fill="#E8592A"><ellipse cx="4" cy="-4" rx="9" ry="12"/><ellipse cx="-6" cy="16" rx="7" ry="8"/></g><circle cx="-3.5" cy="-24" r="1" fill="#1B2A38"/><circle cx="3.5" cy="-24" r="1" fill="#1B2A38"/></g>')
defs.append(f'<g id="cv-koi2"><g fill="#F6B04A" fill-opacity="0.9">{fins}</g><path d="{tail}" fill="#F6B04A" fill-opacity="0.85"/><path d="{body}" fill="#EE6A2F"/>'
            f'<g clip-path="url(#cv-koiclip)" fill="#F7F2EA"><ellipse cx="0" cy="-26" rx="9" ry="8"/></g><circle cx="-3.5" cy="-24" r="1" fill="#1B2A38"/><circle cx="3.5" cy="-24" r="1" fill="#1B2A38"/></g>')
pad = 'M0 0 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0'
defs.append('<g id="cv-pad"><path d="M0 0 L20 -3 A20 20 0 1 1 18 -9 Z" fill="#4E9F6A"/><path d="M0 0 L-14 10 M0 0 L-4 -16 M0 0 L10 14 M0 0 L-16 -6" stroke="#7CC08F" stroke-width="0.8"/></g>')
sym('koi',
    '<rect width="210" height="280" fill="#2B6E6B"/>'
    '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12"><circle cx="60" cy="70" r="20"/><circle cx="60" cy="70" r="34"/><circle cx="160" cy="210" r="16"/><circle cx="160" cy="210" r="28"/><circle cx="160" cy="210" r="42"/></g>'
    '<use href="#cv-pad" transform="translate(168 52) scale(1.1) rotate(20)"/><use href="#cv-pad" transform="translate(42 196) scale(0.9) rotate(-60)"/><use href="#cv-pad" transform="translate(186 152) scale(0.6) rotate(110)"/>'
    '<circle cx="164" cy="46" r="3" fill="#F7B7C8"/>'
    '<use href="#cv-koi1" transform="translate(96 108) rotate(28) scale(1.15)"/><use href="#cv-koi2" transform="translate(128 176) rotate(-150) scale(1)"/><use href="#cv-koi1" transform="translate(52 128) rotate(-20) scale(0.7)"/>')
covers.append(dict(id='koi', name='Koi pond', group='asia', t=dict(x=26, y=262, font='serif', italic=True, size=26, fill='#F4EFE6', max=165)))

# ---------------------------------------------------------------- Shibori
defs.append('<filter id="cv-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.9"/></filter>')
defs.append('<pattern id="cv-pt-shib" patternUnits="userSpaceOnUse" width="52" height="52"><g fill="none" stroke="#F4F1EA">'
            '<circle cx="13" cy="13" r="10" stroke-width="4.5" stroke-opacity="0.85"/><circle cx="39" cy="39" r="10" stroke-width="4.5" stroke-opacity="0.85"/>'
            '<path d="M26 0 V52 M0 26 H52" stroke-width="1.6" stroke-opacity="0.35"/></g>'
            '<circle cx="13" cy="13" r="2.6" fill="#F4F1EA" fill-opacity="0.8"/><circle cx="39" cy="39" r="2.6" fill="#F4F1EA" fill-opacity="0.8"/></pattern>')
sym('shibori',
    '<rect width="210" height="280" fill="#1E2F63"/><rect width="210" height="280" fill="url(#cv-pt-shib)" filter="url(#cv-soft)"/>'
    '<rect x="40" y="212" width="142" height="40" fill="#F4F1EA"/><rect x="44" y="216" width="134" height="32" fill="none" stroke="#1E2F63" stroke-width="0.6"/>')
covers.append(dict(id='shibori', name='Shibori', group='asia', t=dict(x=111, y=238, font='serif', size=17, fill='#1E2F63', anchor='middle', max=122)))

# ---------------------------------------------------------------- Peaks at dawn
defs.append('<linearGradient id="cv-g-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE6CB"/><stop offset="0.55" stop-color="#F3B79B"/></linearGradient>')
sym('peaks',
    '<rect width="210" height="280" fill="url(#cv-g-dawn)"/><circle cx="142" cy="94" r="24" fill="#FFF5E4" fill-opacity="0.92"/>'
    '<path d="M118 52 l4 3 l4 -3 M130 44 l3 2.4 l3 -2.4" fill="none" stroke="#5B4A6A" stroke-width="1" stroke-linecap="round"/>'
    '<path d="M0 128 L32 104 L58 118 L92 86 L128 112 L160 92 L210 120 V280 H0 Z" fill="#CBA9B6"/>'
    '<path d="M0 152 L40 128 L70 146 L112 110 L150 140 L184 122 L210 136 V280 H0 Z" fill="#9D88AC"/>'
    '<path d="M104 117 L112 110 L120 118 L114 116 L110 120 Z" fill="#F4ECF0" fill-opacity="0.85"/>'
    '<path d="M0 184 L30 162 L64 178 L100 146 L136 172 L176 150 L210 168 V280 H0 Z" fill="#6F6B97"/>'
    '<path d="M0 214 L44 190 L84 210 L124 184 L166 206 L210 192 V280 H0 Z" fill="#474A76"/>'
    '<path d="M0 240 L50 222 L100 238 L150 220 L210 236 V280 H0 Z" fill="#2C2F52"/>')
covers.append(dict(id='peaks', name='Peaks at dawn', group='nature', t=dict(x=26, y=266, font='serif', italic=True, size=25, fill='#F6EEE6', max=165)))

# ---------------------------------------------------------------- Pine forest
defs.append('<linearGradient id="cv-g-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4ECE6"/><stop offset="1" stop-color="#B7CBC1"/></linearGradient>')
defs.append('<linearGradient id="cv-g-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9F0EB" stop-opacity="0"/><stop offset="1" stop-color="#E9F0EB" stop-opacity="0.75"/></linearGradient>')
defs.append('<g id="cv-pine"><path d="M0 -42 L9 -24 L5 -24 L14 -8 L8 -8 L18 10 L-18 10 L-8 -8 L-14 -8 L-5 -24 L-9 -24 Z"/><rect x="-1.6" y="10" width="3.2" height="6"/></g>')
random.seed(3)
rows = ''
for (base, sc, col, step) in [(132, 0.62, '#9EB6AB', 13), (186, 0.9, '#6F907F', 17), (246, 1.3, '#3E5E52', 24)]:
    rows += f'<g fill="{col}">'
    x = -6
    while x < 222:
        s = sc * random.uniform(0.82, 1.15)
        rows += f'<use href="#cv-pine" transform="translate({f(x)} {f(base + random.uniform(-4, 4))}) scale({f(s)})"/>'
        x += step * random.uniform(0.8, 1.15)
    rows += f'<rect x="0" y="{base + 8}" width="210" height="{280 - base}"/></g>'
    if base < 240:
        rows += f'<rect x="0" y="{base - 6}" width="210" height="26" fill="url(#cv-g-fog)"/>'
sym('pines', '<rect width="210" height="280" fill="url(#cv-g-mist)"/><circle cx="174" cy="96" r="12" fill="#F6F3E8" fill-opacity="0.85"/>' + rows)
covers.append(dict(id='pines', name='Pine forest', group='nature', t=dict(x=26, y=54, font='serif', italic=True, size=25, fill='#2F4B40', max=168)))

# ---------------------------------------------------------------- Wildflowers
# One daisy and one small bloom, reused at different places and sizes.
_pet = ''.join(f'<ellipse cy="-10" rx="3.2" ry="6.2" transform="rotate({k * 36})"/>' for k in range(10))
defs.append(f'<g id="cv-daisy"><g fill="#FFFFFF" stroke="#D9D1C2" stroke-width="0.4">{_pet}</g><circle r="3.8" fill="#E8B33A"/></g>')
_b5 = ''.join(f'<circle cx="{f(5.5 * math.cos(math.radians(k * 72)))}" cy="{f(5.5 * math.sin(math.radians(k * 72)))}" r="5"/>' for k in range(5))
defs.append(f'<g id="cv-bloom">{_b5}<circle r="2.2" fill="#F6E6A8"/></g>')
_b4 = ''.join(f'<circle cx="{f(5.5 * math.cos(math.radians(k * 90 + 45)))}" cy="{f(5.5 * math.sin(math.radians(k * 90 + 45)))}" r="5.5"/>' for k in range(4))
defs.append(f'<g id="cv-poppy"><g fill="#D9573F">{_b4}</g><circle r="2.6" fill="#2B2B2B"/></g>')

def daisy(cx, cy, r):
    return f'<use href="#cv-daisy" transform="translate({f(cx)} {f(cy)}) scale({f(r / 10)})"/>'

stems = ''
flowers = ''
spec = [(44, 150, 'daisy', 14), (72, 186, 'poppy', 13), (98, 128, 'lav', 0), (122, 170, 'blue', 0), (146, 140, 'daisy', 11), (170, 182, 'poppy', 10), (190, 150, 'lav', 0), (60, 214, 'blue', 0)]
for (x, y, kind, r) in spec:
    bend = random.uniform(-14, 14)
    stems += f'<path d="M{x + bend * 0.4} 280 Q {f(x + bend)} {f((y + 280) / 2)} {x} {y}" fill="none" stroke="#6F8B5E" stroke-width="1.4"/>'
    ly = (y + 280) / 2 + 10
    stems += f'<ellipse cx="{f(x + bend * 0.7 + 7)}" cy="{f(ly)}" rx="8" ry="3" transform="rotate(-30 {f(x + bend * 0.7 + 7)} {f(ly)})" fill="#8FA878"/>'
    if kind == 'daisy':
        flowers += daisy(x, y, r)
    elif kind == 'poppy':
        flowers += f'<use href="#cv-poppy" transform="translate({x} {y}) scale({f(r / 8)})"/>'
    elif kind == 'lav':
        for k in range(7):
            flowers += f'<ellipse cx="{f(x + (2.5 if k % 2 else -2.5))}" cy="{y + k * 6}" rx="3" ry="4.2" fill="#8C7CC4"/>'
    else:
        for (dx, dy) in [(0, 0), (9, 6), (-8, 7), (2, 13)]:
            flowers += f'<use href="#cv-bloom" x="{x + dx}" y="{y + dy}" fill="#7FA6D9" transform="scale(1)"/>'
sym('wildflowers', '<rect width="210" height="280" fill="#F4EEE2"/><line x1="70" y1="86" x2="152" y2="86" stroke="#B7AC98" stroke-width="0.8"/>' + stems + flowers)
covers.append(dict(id='wildflowers', name='Wildflowers', group='nature', t=dict(x=111, y=72, font='serif', italic=True, size=24, fill='#3B3A36', anchor='middle', max=160)))

# ---------------------------------------------------------------- Monstera
leaf = 'M0 -60 C 34 -58, 58 -30, 56 4 C 54 34, 30 56, 0 62 C -30 56, -54 34, -56 4 C -58 -30, -34 -58, 0 -60 Z'
slits = ''
for (yi, yo) in [(-36, -46), (-14, -20), (10, 8), (32, 38)]:
    slits += f'<path d="M5 {yi} L62 {yo - 5} L62 {yo + 4} Z"/><path d="M-5 {yi} L-62 {yo - 5} L-62 {yo + 4} Z"/>'
holes = '<ellipse cx="24" cy="-25" rx="4.5" ry="2.6" transform="rotate(-20 24 -25)"/><ellipse cx="26" cy="-2" rx="4.5" ry="2.6"/><ellipse cx="-24" cy="-24" rx="4.5" ry="2.6" transform="rotate(20 -24 -24)"/><ellipse cx="-26" cy="0" rx="4.5" ry="2.6"/>'
defs.append(f'<mask id="cv-mm" maskUnits="userSpaceOnUse" x="-70" y="-70" width="140" height="140"><path d="{leaf}" fill="#FFFFFF"/><g fill="#000000">{slits}{holes}</g></mask>')
defs.append(f'<g id="cv-leaf"><path d="M0 60 Q 4 90, 12 130" fill="none" stroke="currentColor" stroke-width="3"/><path d="{leaf}" fill="currentColor" mask="url(#cv-mm)"/><path d="M0 -54 Q 3 0, 0 60" fill="none" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1.6"/></g>')
sym('monstera',
    '<rect width="210" height="280" fill="#F3D9CF"/><circle cx="40" cy="120" r="46" fill="#EFC9BC"/>'
    '<use href="#cv-leaf" transform="translate(58 214) rotate(28)" color="#3B7D5C"/>'
    '<use href="#cv-leaf" transform="translate(148 146) rotate(-22) scale(1.15)" color="#2F6B4F"/>'
    '<use href="#cv-leaf" transform="translate(182 250) rotate(-40) scale(0.62)" color="#275A43"/>')
covers.append(dict(id='monstera', name='Monstera', group='nature', t=dict(x=26, y=50, font='serif', italic=True, size=25, fill='#244A38', max=168)))

# ---------------------------------------------------------------- Aurora
defs.append('<linearGradient id="cv-g-polar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#08131F"/><stop offset="1" stop-color="#123447"/></linearGradient>')
defs.append('<linearGradient id="cv-g-aur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6CF0B0" stop-opacity="0"/><stop offset="0.3" stop-color="#6CF0B0"/><stop offset="0.75" stop-color="#5BD6C8"/><stop offset="1" stop-color="#A88BF0"/></linearGradient>')
defs.append('<filter id="cv-blur6" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>')
random.seed(11)
stars = ''.join(f'<circle cx="{random.randint(14, 206)}" cy="{random.randint(6, 190)}" r="{random.choice([0.6, 0.7, 0.9, 1.1])}" fill-opacity="{random.choice([0.5, 0.7, 0.9])}"/>' for _ in range(34))
sym('aurora',
    '<rect width="210" height="280" fill="url(#cv-g-polar)"/><g fill="#E8F2EE">' + stars + '</g>'
    '<g filter="url(#cv-blur6)" fill="none" stroke-linecap="round"><path d="M-10 120 C 40 60, 90 150, 140 84 S 200 64, 230 40" stroke="url(#cv-g-aur)" stroke-width="26" stroke-opacity="0.6"/>'
    '<path d="M-10 156 C 50 110, 100 170, 150 120 S 210 100, 230 92" stroke="url(#cv-g-aur)" stroke-width="16" stroke-opacity="0.45"/></g>'
    '<path d="M-10 120 C 40 60, 90 150, 140 84 S 200 64, 230 40" fill="none" stroke="#B8FFD9" stroke-opacity="0.35" stroke-width="1"/>'
    '<path d="M0 226 L30 202 L55 218 L90 186 L120 212 L150 194 L182 214 L210 198 V280 H0 Z" fill="#06101A"/>')
covers.append(dict(id='aurora', name='Aurora', group='night', t=dict(x=26, y=262, font='serif', size=25, fill='#E8F2EE', max=165)))

# ---------------------------------------------------------------- Orbit
defs.append('<radialGradient id="cv-g-planet" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#F7A27E"/><stop offset="1" stop-color="#B33F57"/></radialGradient>')
defs.append('<radialGradient id="cv-g-ring" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FAD98C"/><stop offset="1" stop-color="#D99A3A"/></radialGradient>')
random.seed(5)
stars2 = ''.join(f'<circle cx="{random.randint(14, 206)}" cy="{random.randint(6, 274)}" r="{random.choice([0.5, 0.7, 0.9])}" fill-opacity="{random.choice([0.4, 0.6, 0.9])}"/>' for _ in range(40))
sym('orbit',
    '<rect width="210" height="280" fill="#141B3A"/><g fill="#F2F0E8">' + stars2 + '</g>'
    '<ellipse cx="110" cy="150" rx="118" ry="58" transform="rotate(-14 110 150)" fill="none" stroke="#FFFFFF" stroke-opacity="0.25" stroke-dasharray="2 4"/>'
    '<ellipse cx="110" cy="150" rx="76" ry="34" transform="rotate(-14 110 150)" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-dasharray="2 4"/>'
    '<circle cx="190" cy="262" r="74" fill="url(#cv-g-planet)"/>'
    '<path d="M44 116 A 42 10 -16 0 1 124 94" fill="none" stroke="#F6E2B5" stroke-width="3" stroke-opacity="0.85"/>'
    '<circle cx="84" cy="108" r="22" fill="url(#cv-g-ring)"/>'
    '<path d="M44 116 A 42 10 -16 0 0 124 94" fill="none" stroke="#F6E2B5" stroke-width="3"/>'
    '<circle cx="180" cy="122" r="5" fill="#BFD7F2"/><circle cx="38" cy="190" r="3" fill="#E8E2D2"/>')
covers.append(dict(id='orbit', name='Orbit', group='night', t=dict(x=26, y=50, font='sans', weight=700, size=22, fill='#F2F0E8', max=165)))

# ---------------------------------------------------------------- City at dusk
defs.append('<linearGradient id="cv-g-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2E5A"/><stop offset="0.45" stop-color="#8C5A86"/><stop offset="0.75" stop-color="#F2A07B"/></linearGradient>')
random.seed(21)
bld = ''
win = ''
x = 12
while x < 210:
    w = random.choice([14, 16, 18, 22, 26])
    h = random.choice([40, 52, 64, 78, 96, 110])
    top = 206 - h
    bld += f'<rect x="{x}" y="{top}" width="{w}" height="{h}"/>'
    if h > 70 and random.random() < 0.4:
        bld += f'<rect x="{x + w / 2 - 1}" y="{top - 12}" width="2" height="12"/>'
    for wy in range(top + 6, 200, 8):
        for wx in range(x + 3, x + w - 3, 5):
            if random.random() < 0.28:
                win += f'<rect x="{wx}" y="{wy}" width="2" height="3"/>'
    x += w + random.choice([0, 1, 2])
sym('city',
    '<rect width="210" height="280" fill="url(#cv-g-dusk)"/><circle cx="118" cy="196" r="34" fill="#FFD29A" fill-opacity="0.95"/>'
    '<g fill="#1E2142">' + bld + '</g><g fill="#FFD98A" fill-opacity="0.85">' + win + '</g>'
    '<rect x="0" y="206" width="210" height="74" fill="#22264A"/>'
    '<g stroke="#FFD29A" stroke-linecap="round"><line x1="96" y1="214" x2="140" y2="214" stroke-opacity="0.6" stroke-width="2"/><line x1="102" y1="222" x2="134" y2="222" stroke-opacity="0.45" stroke-width="2"/><line x1="108" y1="230" x2="128" y2="230" stroke-opacity="0.35" stroke-width="2"/><line x1="113" y1="238" x2="123" y2="238" stroke-opacity="0.25" stroke-width="2"/></g>')
covers.append(dict(id='city', name='City at dusk', group='night', t=dict(x=26, y=54, font='serif', italic=True, size=26, fill='#F6EAF0', max=165)))

# ---------------------------------------------------------------- Art deco
rays = ''
for k in range(15):
    a = math.radians(180 + 12 * k)
    rays += f'<line x1="111" y1="252" x2="{f(111 + 260 * math.cos(a))}" y2="{f(252 + 260 * math.sin(a))}"/>'
defs.append('<clipPath id="cv-decoclip"><rect x="26" y="26" width="170" height="228"/></clipPath>')
sym('deco',
    '<rect width="210" height="280" fill="#15171C"/>'
    '<g clip-path="url(#cv-decoclip)" stroke="#D9B45E" stroke-opacity="0.45" stroke-width="0.8">' + rays + '</g>'
    '<g fill="none" stroke="#D9B45E"><path d="M71 252 A 40 40 0 0 1 151 252" stroke-width="1.4"/><path d="M51 252 A 60 60 0 0 1 171 252" stroke-width="0.8"/><path d="M91 252 A 20 20 0 0 1 131 252" fill="#D9B45E"/></g>'
    '<rect x="20" y="20" width="182" height="240" fill="none" stroke="#D9B45E" stroke-width="1.6"/><rect x="26" y="26" width="170" height="228" fill="none" stroke="#D9B45E" stroke-width="0.6"/>'
    '<g fill="#D9B45E"><path d="M20 20 h14 l-14 14 Z"/><path d="M202 20 h-14 l14 14 Z"/><path d="M20 260 h14 l-14 -14 Z"/><path d="M202 260 h-14 l14 -14 Z"/></g>'
    '<rect x="40" y="62" width="142" height="40" fill="#15171C" stroke="#D9B45E" stroke-width="1"/><rect x="44" y="66" width="134" height="32" fill="none" stroke="#D9B45E" stroke-width="0.5"/>')
covers.append(dict(id='deco', name='Art deco', group='night', t=dict(x=111, y=88, font='sans', weight=600, size=15, fill='#E2C27A', anchor='middle', max=124)))

# ---------------------------------------------------------------- Gingham
defs.append('<pattern id="cv-pt-ging" patternUnits="userSpaceOnUse" width="20" height="20"><rect width="20" height="20" fill="#FBFAF6"/><rect width="10" height="20" fill="#7FA88F" fill-opacity="0.45"/><rect width="20" height="10" fill="#7FA88F" fill-opacity="0.45"/></pattern>')
sym('gingham',
    '<rect width="210" height="280" fill="url(#cv-pt-ging)"/>'
    '<rect x="38" y="98" width="146" height="74" rx="8" fill="#FBFAF6" stroke="#7FA88F" stroke-width="1.4"/><rect x="44" y="104" width="134" height="62" rx="5" fill="none" stroke="#7FA88F" stroke-width="0.8" stroke-dasharray="3 2.5"/>')
covers.append(dict(id='gingham', name='Gingham', group='pattern', t=dict(x=111, y=142, font='serif', size=20, fill='#2F4B3C', anchor='middle', max=120)))

# ---------------------------------------------------------------- Herringbone tweed
defs.append('<pattern id="cv-pt-herr" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#66615B"/>'
            '<path d="M0 6 L6 0 M0 12 L6 6 M-1 1 L1 -1" stroke="#8E877D" stroke-width="1.7"/><path d="M6 0 L12 6 M6 6 L12 12" stroke="#4F4A44" stroke-width="1.7"/></pattern>')
sym('tweed',
    '<rect width="210" height="280" fill="url(#cv-pt-herr)"/>'
    '<rect x="52" y="196" width="118" height="42" rx="4" fill="#8A5A3B"/><rect x="56" y="200" width="110" height="34" rx="2.5" fill="none" stroke="#D9B48A" stroke-width="0.8" stroke-dasharray="3 2"/>')
covers.append(dict(id='tweed', name='Tweed', group='pattern', t=dict(x=111, y=222, font='serif', size=15, fill='#F2E3CB', anchor='middle', max=100)))

# ---------------------------------------------------------------- Polka dots
defs.append('<pattern id="cv-pt-polka" patternUnits="userSpaceOnUse" width="24" height="24"><rect width="24" height="24" fill="#C8323A"/><circle cx="6" cy="6" r="3.6" fill="#F6EBD9"/><circle cx="18" cy="18" r="3.6" fill="#F6EBD9"/></pattern>')
sym('polka',
    '<rect width="210" height="280" fill="url(#cv-pt-polka)"/>'
    '<rect x="12" y="212" width="198" height="48" fill="#F6EBD9"/><line x1="12" y1="216" x2="210" y2="216" stroke="#C8323A" stroke-width="0.8"/><line x1="12" y1="256" x2="210" y2="256" stroke="#C8323A" stroke-width="0.8"/>')
covers.append(dict(id='polka', name='Polka dots', group='pattern', t=dict(x=111, y=243, font='serif', size=22, fill='#9E2430', anchor='middle', max=170)))

# ---------------------------------------------------------------- Breton stripes
defs.append('<pattern id="cv-pt-stripe" patternUnits="userSpaceOnUse" width="20" height="20"><rect width="20" height="20" fill="#F7F5EF"/><rect y="6" width="20" height="8" fill="#1F2E55"/></pattern>')
sym('stripes',
    '<rect width="210" height="280" fill="url(#cv-pt-stripe)"/>'
    '<rect x="12" y="116" width="198" height="48" fill="#D04A3A"/><rect x="12" y="119" width="198" height="1" fill="#F7F5EF" fill-opacity="0.6"/><rect x="12" y="160" width="198" height="1" fill="#F7F5EF" fill-opacity="0.6"/>')
covers.append(dict(id='stripes', name='Stripes', group='pattern', t=dict(x=111, y=147, font='sans', weight=700, size=20, fill='#FFFFFF', anchor='middle', max=172)))

# ---------------------------------------------------------------- Tartan
defs.append('<pattern id="cv-pt-tartan" patternUnits="userSpaceOnUse" width="48" height="48"><rect width="48" height="48" fill="#1F3B5C"/>'
            '<rect x="0" width="16" height="48" fill="#2C6047" fill-opacity="0.6"/><rect y="0" width="48" height="16" fill="#2C6047" fill-opacity="0.6"/>'
            '<rect x="28" width="3" height="48" fill="#0F1E30" fill-opacity="0.5"/><rect y="28" width="48" height="3" fill="#0F1E30" fill-opacity="0.5"/>'
            '<rect x="38" width="1.6" height="48" fill="#C8423C" fill-opacity="0.85"/><rect y="38" width="48" height="1.6" fill="#C8423C" fill-opacity="0.85"/>'
            '<rect x="7" width="1" height="48" fill="#E8C45A" fill-opacity="0.75"/><rect y="7" width="48" height="1" fill="#E8C45A" fill-opacity="0.75"/></pattern>')
sym('tartan',
    '<rect width="210" height="280" fill="url(#cv-pt-tartan)"/>'
    '<rect x="42" y="40" width="138" height="54" fill="#F4EFE4"/><rect x="46" y="44" width="130" height="46" fill="none" stroke="#1F3B5C" stroke-width="0.7"/>')
covers.append(dict(id='tartan', name='Tartan', group='pattern', t=dict(x=111, y=73, font='serif', size=18, fill='#1F3B5C', anchor='middle', max=118)))

# ---------------------------------------------------------------- Composition book
random.seed(13)
blobs = ''
for _ in range(26):
    cx, cy = random.uniform(0, 70), random.uniform(0, 70)
    r = random.uniform(1.5, 6.5)
    n = random.randint(5, 7)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + random.uniform(-0.3, 0.3)
        rr = r * random.uniform(0.55, 1.35)
        pts.append(f'{f(cx + rr * math.cos(a))},{f(cy + rr * math.sin(a) * random.uniform(0.6, 1))}')
    blobs += f'<polygon points="{" ".join(pts)}"/>'
defs.append(f'<pattern id="cv-pt-comp" patternUnits="userSpaceOnUse" width="70" height="70"><rect width="70" height="70" fill="#151515"/><g fill="#F2F0EA">{blobs}</g></pattern>')
sym('composition',
    '<rect width="210" height="280" fill="url(#cv-pt-comp)"/><rect x="0" y="0" width="30" height="280" fill="#111111"/>'
    '<g fill="#3A3A3A">' + ''.join(f'<circle cx="24" cy="{y}" r="0.9"/>' for y in range(8, 280, 9)) + '</g>'
    '<rect x="56" y="54" width="128" height="80" rx="3" fill="#FBFAF4"/><rect x="60" y="58" width="120" height="72" rx="2" fill="none" stroke="#151515" stroke-width="0.7"/>'
    '<line x1="68" y1="104" x2="172" y2="104" stroke="#9FB8D6" stroke-width="0.7"/><line x1="68" y1="118" x2="172" y2="118" stroke="#9FB8D6" stroke-width="0.7"/>')
covers.append(dict(id='composition', name='Composition', group='classic', t=dict(x=120, y=96, font='hand', size=24, fill='#1B2A38', anchor='middle', max=106)))

# ---------------------------------------------------------------- Leather journal
random.seed(17)
grain = ''.join(f'<circle cx="{f(random.uniform(0, 30))}" cy="{f(random.uniform(0, 30))}" r="{f(random.uniform(0.4, 1.1))}" fill="{random.choice(["#000", "#fff"])}" fill-opacity="{random.choice([0.08, 0.12, 0.05])}"/>' for _ in range(28))
defs.append(f'<pattern id="cv-pt-grain" patternUnits="userSpaceOnUse" width="30" height="30">{grain}</pattern>')
defs.append('<radialGradient id="cv-g-vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>')
sym('leather',
    '<rect width="210" height="280" fill="#6A4128"/><rect width="210" height="280" fill="url(#cv-pt-grain)"/><rect width="210" height="280" fill="url(#cv-g-vig)"/>'
    '<rect x="22" y="14" width="172" height="252" rx="6" fill="none" stroke="#C9A27A" stroke-width="1.1" stroke-dasharray="4 3"/>'
    '<rect x="34" y="106" width="134" height="44" rx="3" fill="#000" fill-opacity="0.1" stroke="#D9B46A" stroke-opacity="0.55" stroke-width="0.8"/><rect x="37" y="109" width="128" height="38" rx="2" fill="none" stroke="#D9B46A" stroke-opacity="0.3" stroke-width="0.5"/>'
    '<path d="M150 266 V292 L156 286 L162 292 V266 Z" fill="#9E2B2B"/>'
    '<rect x="178" y="0" width="9" height="280" fill="#24160D"/><rect x="179" y="0" width="1.4" height="280" fill="#FFFFFF" fill-opacity="0.12"/>')
covers.append(dict(id='leather', name='Leather', group='classic', t=dict(x=101, y=134, font='serif', size=20, fill='#E2C27A', anchor='middle', max=122)))

# ---------------------------------------------------------------- Memphis
sym('memphis',
    '<rect width="210" height="280" fill="#FCE8D8"/>'
    '<circle cx="168" cy="56" r="30" fill="#F7C948"/>'
    '<path d="M36 42 L70 96 L18 96 Z" fill="none" stroke="#2BB3A3" stroke-width="5" stroke-linejoin="round"/>'
    '<path d="M100 40 q 8 -12 16 0 t 16 0 t 16 0" fill="none" stroke="#F06C9B" stroke-width="5" stroke-linecap="round"/>'
    '<path d="M150 200 l10 -12 l10 12 l10 -12 l10 12" fill="none" stroke="#1B1B1B" stroke-width="3" stroke-linejoin="round"/>'
    '<path d="M30 280 A 44 44 0 0 1 118 280 Z" fill="#3D7DD8"/>'
    '<g fill="#1B1B1B">' + ''.join(f'<circle cx="{x}" cy="{y}" r="1.4"/>' for x in range(130, 196, 9) for y in range(226, 268, 9)) + '</g>'
    '<g fill="#F06C9B"><rect x="96" y="96" width="10" height="4" transform="rotate(30 101 98)"/><rect x="176" y="112" width="10" height="4" transform="rotate(-25 181 114)"/></g>'
    '<g fill="#2BB3A3"><rect x="58" y="196" width="10" height="4" transform="rotate(-40 63 198)"/></g><circle cx="122" cy="106" r="5" fill="#3D7DD8"/><circle cx="26" cy="196" r="4" fill="#F7C948"/>')
covers.append(dict(id='memphis', name='Memphis', group='bold', t=dict(x=26, y=160, font='sans', weight=700, size=30, fill='#1B1B1B', max=172)))

# ---------------------------------------------------------------- Aura
for gid, col in [('cv-g-a1', '#F7A8C4'), ('cv-g-a2', '#FFC27A'), ('cv-g-a3', '#B9A6F2'), ('cv-g-a4', '#9FE0D2')]:
    defs.append(f'<radialGradient id="{gid}"><stop offset="0" stop-color="{col}"/><stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>')
sym('aura',
    '<rect width="210" height="280" fill="#F6F1EA"/>'
    '<circle cx="56" cy="74" r="112" fill="url(#cv-g-a1)"/><circle cx="182" cy="196" r="124" fill="url(#cv-g-a2)"/><circle cx="48" cy="252" r="100" fill="url(#cv-g-a3)"/><circle cx="196" cy="34" r="80" fill="url(#cv-g-a4)"/>')
covers.append(dict(id='aura', name='Aura', group='bold', t=dict(x=111, y=150, font='serif', italic=True, size=28, fill='#2C2440', anchor='middle', max=160)))

# ---------------------------------------------------------------- Retro rainbow
sym('retro',
    '<rect width="210" height="280" fill="#F4E6CC"/>'
    '<circle cx="12" cy="280" r="196" fill="#C2462E"/><circle cx="12" cy="280" r="166" fill="#E08A2E"/><circle cx="12" cy="280" r="136" fill="#E8B83D"/><circle cx="12" cy="280" r="106" fill="#7E8C4A"/><circle cx="12" cy="280" r="76" fill="#F4E6CC"/>'
    '<circle cx="12" cy="280" r="196" fill="none" stroke="#F4E6CC" stroke-width="3"/><circle cx="12" cy="280" r="166" fill="none" stroke="#F4E6CC" stroke-width="3"/><circle cx="12" cy="280" r="136" fill="none" stroke="#F4E6CC" stroke-width="3"/><circle cx="12" cy="280" r="106" fill="none" stroke="#F4E6CC" stroke-width="3"/>')
covers.append(dict(id='retro', name='Seventies', group='bold', t=dict(x=198, y=50, font='sans', weight=700, size=22, fill='#5A2E1E', anchor='end', max=150)))

# ---------------------------------------------------------------- Paper planes
defs.append('<g id="cv-plane"><path d="M30 0 L-20 -16 L-8 2 Z" fill="#FFFFFF"/><path d="M30 0 L-8 2 L-14 16 Z" fill="#DDE6EE"/><path d="M30 0 L-8 2 L-3 8 Z" fill="#B9C6D3"/></g>')
sym('planes',
    '<rect width="210" height="280" fill="#CFE4F5"/>'
    '<g fill="#FFFFFF" fill-opacity="0.9"><ellipse cx="54" cy="58" rx="26" ry="9"/><ellipse cx="68" cy="51" rx="15" ry="9"/><ellipse cx="170" cy="168" rx="24" ry="8"/><ellipse cx="182" cy="162" rx="12" ry="8"/><ellipse cx="44" cy="206" rx="18" ry="6"/></g>'
    '<g fill="none" stroke="#3A6EA5" stroke-width="1.2" stroke-dasharray="3 4" stroke-linecap="round"><path d="M20 150 C 60 120, 70 200, 110 160 S 150 90, 150 110"/><path d="M34 226 C 74 208, 112 232, 146 214"/><path d="M60 110 C 90 80, 120 100, 150 70"/></g>'
    '<use href="#cv-plane" transform="translate(162 112) rotate(-40) scale(0.9)"/><use href="#cv-plane" transform="translate(162 220) rotate(-35) scale(0.8)"/><use href="#cv-plane" transform="translate(162 62) rotate(-20) scale(0.6)"/>')
covers.append(dict(id='planes', name='Paper planes', group='bold', t=dict(x=26, y=264, font='sans', weight=700, size=22, fill='#21436E', max=170)))

# ---------------------------------------------------------------- Citrus
def slice_(cx, cy, r, rind, flesh):
    s = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{rind}"/><circle cx="{cx}" cy="{cy}" r="{f(r * 0.86)}" fill="#FFF6E0"/><circle cx="{cx}" cy="{cy}" r="{f(r * 0.78)}" fill="{flesh}"/>'
    s += f'<g stroke="#FFF6E0" stroke-width="1.1">'
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        s += f'<line x1="{cx}" y1="{cy}" x2="{f(cx + r * 0.78 * math.cos(a))}" y2="{f(cy + r * 0.78 * math.sin(a))}"/>'
    return s + f'</g><circle cx="{cx}" cy="{cy}" r="1.8" fill="#FFF6E0"/>'
defs.append('<pattern id="cv-pt-citrus" patternUnits="userSpaceOnUse" width="64" height="64"><rect width="64" height="64" fill="#DDEEF4"/>'
            + slice_(16, 16, 12, '#E8A21D', '#F7CC4A') + slice_(48, 48, 12, '#E9752A', '#F6A04A')
            + '<ellipse cx="44" cy="14" rx="6" ry="2.6" transform="rotate(-30 44 14)" fill="#6FAE6A"/><ellipse cx="18" cy="48" rx="6" ry="2.6" transform="rotate(25 18 48)" fill="#6FAE6A"/></pattern>')
sym('citrus',
    '<rect width="210" height="280" fill="url(#cv-pt-citrus)"/>'
    '<rect x="34" y="208" width="154" height="44" rx="22" fill="#FFFFFF"/>')
covers.append(dict(id='citrus', name='Citrus', group='bold', t=dict(x=111, y=236, font='sans', weight=700, size=18, fill='#D2691E', anchor='middle', max=132)))

print(json.dumps({'sprite': ''.join(defs) + ''.join(symbols), 'covers': covers}))
