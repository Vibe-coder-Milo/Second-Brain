"""Builds the second set of notebook cover artwork: Futuristic, AI & data,
more Nature, Lined & paper, Fun and Calm. Writes js/coverart2.js (the SVG
symbols for the cover sprite, plus each cover's name, collection and title
space). Original designs, drawn from simple shapes.
Run from the repo root: python3 tools/covergen2.py"""
import json, math, random, os

SP = '<rect width="12" height="280" fill="#000" fill-opacity="0.18"/><line x1="12.5" y1="0" x2="12.5" y2="280" stroke="#fff" stroke-opacity="0.15"/>'
defs, symbols, covers = [], [], []


def sym(cid, body, spine=True):
    symbols.append(f'<symbol id="cv-{cid}" viewBox="0 0 210 280">{body}{SP if spine else ""}</symbol>')


def cover(cid, name, group, **t):
    covers.append(dict(id=cid, name=name, group=group, t=t))


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


def star4(cx, cy, s, fill):
    """A four-pointed sparkle."""
    return (f'<path d="M{f(cx)} {f(cy - s)} Q{f(cx)} {f(cy)} {f(cx + s)} {f(cy)} Q{f(cx)} {f(cy)} {f(cx)} {f(cy + s)} '
            f'Q{f(cx)} {f(cy)} {f(cx - s)} {f(cy)} Q{f(cx)} {f(cy)} {f(cx)} {f(cy - s)} Z" fill="{fill}"/>')


# =============================================================== Futuristic
# ---- Neon grid: a striped sun over a glowing grid floor.
random.seed(11)
defs.append('<linearGradient id="cv-g-neonsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140733"/><stop offset="0.55" stop-color="#3E1460"/><stop offset="1" stop-color="#9C2A6E"/></linearGradient>')
defs.append('<linearGradient id="cv-g-neonsun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#FF4F8B"/></linearGradient>')
cuts = ''.join(f'<rect x="0" y="{y}" width="210" height="{h}" fill="#000"/>' for y, h in [(150, 3), (158, 4), (167, 5), (177, 6)])
defs.append(f'<mask id="cv-m-neonsun" maskUnits="userSpaceOnUse" x="0" y="0" width="210" height="280"><rect width="210" height="280" fill="#FFF"/>{cuts}</mask>')
stars = ''.join(f'<circle cx="{random.randint(16, 205)}" cy="{random.randint(8, 120)}" r="{random.choice([0.6, 0.8, 1.1])}" fill-opacity="{random.choice([0.5, 0.7, 0.9])}"/>' for _ in range(34))
grid = ''
for y in [188, 194, 202, 213, 228, 248, 274]:
    grid += f'<line x1="0" y1="{y}" x2="210" y2="{y}"/>'
for i in range(-8, 9):
    grid += f'<line x1="{f(111 + i * 9)}" y1="184" x2="{f(111 + i * 70)}" y2="280"/>'
sym('neon',
    '<rect width="210" height="280" fill="url(#cv-g-neonsky)"/><g fill="#FFFFFF">' + stars + '</g>'
    '<circle cx="111" cy="140" r="50" fill="url(#cv-g-neonsun)" mask="url(#cv-m-neonsun)"/>'
    '<rect x="0" y="184" width="210" height="96" fill="#12052B"/>'
    '<g stroke="#FF4FD8" stroke-width="1" stroke-opacity="0.75">' + grid + '</g>'
    '<line x1="0" y1="184" x2="210" y2="184" stroke="#5CE8FF" stroke-width="1.6"/>')
cover('neon', 'Neon grid', 'future', x=111, y=50, font='sans', weight=700, size=24, fill='#FDEBFF', anchor='middle', max=170, g='mid', b=[14, 84])

# ---- Holographic foil: soft iridescent bands.
defs.append('<linearGradient id="cv-g-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F9C5E8"/><stop offset="0.28" stop-color="#C9B8FF"/><stop offset="0.52" stop-color="#A8EEF0"/><stop offset="0.76" stop-color="#FCF0B6"/><stop offset="1" stop-color="#F5B5D6"/></linearGradient>')
defs.append('<filter id="cv-f-holo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>')
bands = ''.join(f'<rect x="-60" y="{y}" width="340" height="{h}" fill="{c}" fill-opacity="{o}" transform="rotate(-28 105 140)"/>' for y, h, c, o in [(30, 26, '#FFFFFF', 0.45), (96, 18, '#9EE7FF', 0.45), (150, 30, '#FFFFFF', 0.35), (212, 20, '#F7A8E0', 0.4)])
sheen = ''.join(f'<line x1="{x}" y1="0" x2="{x - 120}" y2="280"/>' for x in range(30, 360, 14))
sym('holo',
    '<rect width="210" height="280" fill="url(#cv-g-holo)"/><g filter="url(#cv-f-holo)">' + bands + '</g>'
    '<g stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="0.6">' + sheen + '</g>')
cover('holo', 'Holographic', 'future', x=26, y=262, font='sans', weight=700, size=26, fill='#2A2350', max=168, g='up')

# ---- Circuit board: copper traces running to a chip that holds the title.
random.seed(5)
tr = ''
pads = ''
for i, x in enumerate(range(60, 165, 12)):
    # From the chip's top pins up, then off at 45 degrees towards an edge.
    ytop = random.randint(36, 84)
    d = -1 if x < 111 else 1
    run = random.randint(14, 40)
    tr += f'<path d="M{x} 106 V{ytop} l{d * run} {-run * 0.6:.0f}"/>'
    pads += f'<circle cx="{x + d * run}" cy="{ytop - round(run * 0.6)}" r="3"/>'
    ybot = random.randint(200, 250)
    run = random.randint(14, 40)
    tr += f'<path d="M{x} 178 V{ybot} l{d * run} {run * 0.6:.0f}"/>'
    pads += f'<circle cx="{x + d * run}" cy="{ybot + round(run * 0.6)}" r="3"/>'
for y in [120, 136, 152, 166]:
    tr += f'<path d="M48 {y} H{random.randint(20, 34)}"/><path d="M174 {y} H{random.randint(186, 200)}"/>'
pins = ''.join(f'<rect x="{x - 2}" y="100" width="4" height="8"/><rect x="{x - 2}" y="176" width="4" height="8"/>' for x in range(60, 165, 12))
pins += ''.join(f'<rect x="40" y="{y - 2}" width="8" height="4"/><rect x="174" y="{y - 2}" width="8" height="4"/>' for y in [120, 136, 152, 166])
sym('circuit',
    '<rect width="210" height="280" fill="#0E3B2E"/>'
    '<g fill="none" stroke="#C98A3D" stroke-opacity="0.85" stroke-width="1.6" stroke-linejoin="round">' + tr + '</g>'
    '<g fill="#E2A55A" stroke="#0E3B2E" stroke-width="1.4">' + pads + '</g>'
    '<g fill="#B9C0C6">' + pins + '</g>'
    '<rect x="46" y="106" width="130" height="72" rx="5" fill="#15181C"/><rect x="50" y="110" width="122" height="64" rx="3" fill="none" stroke="#FFFFFF" stroke-opacity="0.12"/>'
    '<circle cx="58" cy="118" r="2.4" fill="#FFFFFF" fill-opacity="0.35"/>')
cover('circuit', 'Circuit board', 'future', x=111, y=147, font='sans', weight=600, size=16, fill='#E7F5EC', anchor='middle', max=108, g='mid', b=[115, 170])

# ---- Hyperspace: stars stretched into streaks around a bright centre.
random.seed(3)
defs.append('<radialGradient id="cv-g-warp" cx="0.55" cy="0.42" r="0.75"><stop offset="0" stop-color="#2A4A8C"/><stop offset="0.45" stop-color="#101C3E"/><stop offset="1" stop-color="#04060E"/></radialGradient>')
defs.append('<linearGradient id="cv-g-warpfoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04060E" stop-opacity="0"/><stop offset="1" stop-color="#04060E" stop-opacity="0.75"/></linearGradient>')
streaks = ''
cx, cy = 116, 118
for _ in range(90):
    a = random.uniform(0, math.tau)
    r1 = random.uniform(8, 70)
    ln = random.uniform(14, 80) * (0.5 + r1 / 70)
    x1, y1 = cx + math.cos(a) * r1, cy + math.sin(a) * r1
    x2, y2 = cx + math.cos(a) * (r1 + ln), cy + math.sin(a) * (r1 + ln)
    streaks += f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke-width="{random.choice([0.6, 0.9, 1.3])}" stroke-opacity="{random.choice([0.35, 0.55, 0.8])}"/>'
sym('warp',
    '<rect width="210" height="280" fill="url(#cv-g-warp)"/>'
    '<g stroke="#CFE2FF" stroke-linecap="round">' + streaks + '</g>'
    '<circle cx="116" cy="118" r="5" fill="#FFFFFF" fill-opacity="0.9"/>'
    '<rect x="0" y="190" width="210" height="90" fill="url(#cv-g-warpfoot)"/>')
cover('warp', 'Hyperspace', 'future', x=26, y=264, font='sans', weight=700, size=24, fill='#F2F6FF', max=168, g='up')

# =============================================================== AI & data
# ---- Neural network: layers of nodes, every node linked to the next layer.
defs.append('<linearGradient id="cv-g-neural" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101838"/><stop offset="1" stop-color="#26164C"/></linearGradient>')
random.seed(21)
layers = [(46, 3), (86, 5), (126, 5), (166, 2)]
nodes = []
for x, n in layers:
    span = (n - 1) * 30
    nodes.append([(x + 12 // 2, 120 - span / 2 + i * 30) for i in range(n)])
edges = ''
hot = ''
for a, b in zip(nodes, nodes[1:]):
    for p in a:
        for q in b:
            line = f'<line x1="{f(p[0])}" y1="{f(p[1])}" x2="{f(q[0])}" y2="{f(q[1])}"/>'
            if random.random() < 0.16:
                hot += line
            else:
                edges += line
dots = ''
for li, layer in enumerate(nodes):
    for p in layer:
        lit = random.random() < 0.3
        dots += f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="6.5" fill="{"#FF9AD5" if lit else "#141C3E"}" stroke="{"#FFC4E6" if lit else "#9CC2FF"}" stroke-width="1.6"/>'
sym('neural',
    '<rect width="210" height="280" fill="url(#cv-g-neural)"/>'
    '<g stroke="#8FB4FF" stroke-opacity="0.28" stroke-width="0.8">' + edges + '</g>'
    '<g stroke="#FF9AD5" stroke-opacity="0.75" stroke-width="1.2">' + hot + '</g>' + dots)
cover('neural', 'Neural network', 'ai', x=26, y=262, font='sans', weight=700, size=24, fill='#EEF2FF', max=168, g='up', b=[200, 280])

# ---- Tokens: words broken into soft rounded pieces.
random.seed(8)
cols = ['#F2C6B4', '#C9DDF2', '#CFE8D0', '#E6D6F2', '#F5E3A8', '#F7D0DE']
chips = ''
for y in range(22, 190, 21):
    x = 20 + random.randint(0, 10)
    while x < 196:
        w = random.choice([16, 22, 28, 34, 40, 48])
        if x + w > 204:
            break
        c = random.choice(cols)
        chips += f'<rect x="{x}" y="{y}" width="{w}" height="14" rx="7" fill="{c}"/>'
        if random.random() < 0.12:
            chips += f'<rect x="{x}" y="{y}" width="{w}" height="14" rx="7" fill="none" stroke="#1B2A38" stroke-width="1"/>'
        x += w + 5
sym('tokens',
    '<rect width="210" height="280" fill="#F6F3EC"/>' + chips +
    '<line x1="26" y1="204" x2="186" y2="204" stroke="#1B2A38" stroke-opacity="0.2" stroke-width="1"/>')
cover('tokens', 'Tokens', 'ai', x=26, y=258, font='sans', weight=700, size=24, fill='#1B2A38', max=168, g='up', b=[208, 276])

# ---- Sparkle: the four-pointed star people draw for "AI".
defs.append('<linearGradient id="cv-g-sparkbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF5E6"/><stop offset="1" stop-color="#F8D6CC"/></linearGradient>')
defs.append('<linearGradient id="cv-g-spark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9A5B"/><stop offset="1" stop-color="#C2477E"/></linearGradient>')
sym('sparkle',
    '<rect width="210" height="280" fill="url(#cv-g-sparkbg)"/>'
    + star4(124, 104, 66, 'url(#cv-g-spark)') + star4(58, 52, 20, '#E9785F') + star4(176, 186, 13, '#C2477E') + star4(64, 170, 8, '#F2A65A'))
cover('sparkle', 'Sparkle', 'ai', x=26, y=260, font='sans', weight=700, size=24, fill='#4A1F3A', max=168, g='up', b=[196, 280])

# ---- Heatmap: a grid of dots, bigger and brighter where the values are high.
def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hexc(c):
    return '#%02X%02X%02X' % c


lo, mid, hi = (0x1F, 0x64, 0x67), (0x4F, 0xD1, 0xC5), (0xF6, 0xE5, 0x8D)
hm = ''
for r in range(12):
    for c in range(12):
        x, y = 26 + c * 15, 96 + r * 15
        v = (math.sin(c * 0.55 + 0.4) * math.cos(r * 0.42 - 0.6) + math.sin((c + r) * 0.3)) / 2 * 0.5 + 0.5
        v = max(0.0, min(1.0, v))
        col = lerp(lo, mid, v * 2) if v < 0.5 else lerp(mid, hi, (v - 0.5) * 2)
        hm += f'<circle cx="{x}" cy="{y}" r="{f(1.6 + v * 4.8)}" fill="{hexc(col)}"/>'
sym('heatmap', '<rect width="210" height="280" fill="#0F2B30"/>' + hm)
cover('heatmap', 'Heatmap', 'ai', x=26, y=46, font='sans', weight=700, size=24, fill='#E8F7F4', max=170, g='down', b=[12, 84])

# ---- Signal: overlapping waves.
waves = ''
for amp, freq, ph, col, w in [(34, 0.045, 0, '#5EE6C8', 2.2), (24, 0.07, 1.2, '#7AA8FF', 1.8), (16, 0.11, 2.4, '#FF8FB1', 1.6), (40, 0.03, 3.1, '#F6E58D', 1.2)]:
    pts = []
    for x in range(14, 212, 3):
        env = math.sin((x - 14) / 196 * math.pi)
        pts.append(f'{x} {f(162 + amp * env * math.sin(x * freq * 2 * math.pi / 3 + ph))}')
    waves += f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="{w}" stroke-opacity="0.85" stroke-linejoin="round"/>'
sym('signal', '<rect width="210" height="280" fill="#10151F"/><line x1="14" y1="162" x2="210" y2="162" stroke="#FFFFFF" stroke-opacity="0.12"/>' + waves)
cover('signal', 'Signal', 'ai', x=26, y=56, font='sans', weight=700, size=24, fill='#F2F5F8', max=170, g='down', b=[18, 104])

# =============================================================== Nature (more)
# ---- Dunes at sunset.
defs.append('<linearGradient id="cv-g-dunesky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE3BC"/><stop offset="1" stop-color="#F4A86E"/></linearGradient>')
sym('dunes',
    '<rect width="210" height="280" fill="url(#cv-g-dunesky)"/><circle cx="64" cy="128" r="22" fill="#FFF3DC"/>'
    '<path d="M0 160 C 50 136, 90 150, 130 140 S 190 128, 210 138 V280 H0 Z" fill="#EBA463"/>'
    '<path d="M0 196 C 40 170, 96 188, 140 168 S 196 172, 210 166 V280 H0 Z" fill="#DA8746"/>'
    '<path d="M0 230 C 60 204, 110 226, 150 206 S 200 214, 210 210 V280 H0 Z" fill="#C46C34"/>'
    '<path d="M0 262 C 54 240, 120 258, 210 238 V280 H0 Z" fill="#A35528"/>'
    '<path d="M0 196 C 40 170, 96 188, 140 168" fill="none" stroke="#F7C48C" stroke-width="1.2" stroke-opacity="0.7"/>'
    '<path d="M0 230 C 60 204, 110 226, 150 206" fill="none" stroke="#E79A5E" stroke-width="1.2" stroke-opacity="0.7"/>')
cover('dunes', 'Dunes', 'nature', x=26, y=52, font='serif', italic=True, size=25, fill='#5A2A14', max=168, g='down', b=[14, 100])

# ---- Bamboo grove, with a paper label.
random.seed(4)
bam = ''
for x, w, c in [(22, 12, '#7BA05B'), (46, 15, '#5E8A45'), (78, 11, '#94B86E'), (104, 16, '#6B9650'), (138, 12, '#86AD60'), (162, 15, '#5E8A45'), (190, 11, '#94B86E')]:
    bam += f'<rect x="{x}" y="0" width="{w}" height="280" fill="{c}"/>'
    y = random.randint(-10, 20)
    while y < 280:
        bam += f'<rect x="{x - 1}" y="{y}" width="{w + 2}" height="3" rx="1.5" fill="#4C7436"/>'
        y += random.randint(44, 64)
leaves = ''
for _ in range(16):
    x, y, a = random.randint(14, 205), random.randint(10, 190), random.randint(-60, 60)
    leaves += f'<ellipse cx="{x}" cy="{y}" rx="16" ry="3.6" transform="rotate({a} {x} {y})" fill="{random.choice(["#3F6B2E", "#4E7F38", "#355E27"])}"/>'
sym('bamboo',
    '<rect width="210" height="280" fill="#E6EFD8"/>' + bam + leaves +
    '<rect x="34" y="204" width="154" height="52" rx="3" fill="#F7F3E6"/><rect x="38" y="208" width="146" height="44" rx="2" fill="none" stroke="#5E8A45" stroke-width="0.8"/>')
cover('bamboo', 'Bamboo', 'nature', x=111, y=236, font='serif', size=21, fill='#2F4B2A', anchor='middle', max=132, g='mid', b=[211, 250])

# ---- Autumn leaves falling.
random.seed(13)
lv = ''
for _ in range(22):
    x, y = random.randint(20, 200), random.randint(10, 196)
    a = random.randint(0, 360)
    s = random.uniform(0.7, 1.25)
    c = random.choice(['#C8552D', '#E08A2E', '#B5433A', '#D9A43A', '#8C5A2B'])
    lv += (f'<g transform="translate({x} {y}) rotate({a}) scale({f(s)})"><path d="M0 -14 C 9 -8, 9 6, 0 14 C -9 6, -9 -8, 0 -14 Z" fill="{c}"/>'
           f'<path d="M0 -12 V16" stroke="#5A2E1E" stroke-opacity="0.5" stroke-width="0.8"/></g>')
sym('autumn', '<rect width="210" height="280" fill="#F4E8D6"/>' + lv)
cover('autumn', 'Autumn leaves', 'nature', x=26, y=262, font='serif', italic=True, size=26, fill='#5A2E1E', max=168, g='up', b=[208, 280])

# ---- Rain on a pond: rings spreading.
random.seed(17)
defs.append('<linearGradient id="cv-g-rain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA9B6"/><stop offset="1" stop-color="#4F6E7E"/></linearGradient>')
rp = ''
for _ in range(9):
    x, y = random.randint(30, 190), random.randint(110, 262)
    for k, r in enumerate([6, 13, 21][:random.randint(2, 3)]):
        rp += f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{f(r * 0.36)}" stroke-opacity="{[0.6, 0.42, 0.25][k]}"/>'
drops = ''.join(f'<line x1="{x}" y1="{y}" x2="{x - 3}" y2="{y + 10}"/>' for x, y in [(random.randint(20, 205), random.randint(90, 250)) for _ in range(30)])
sym('rain',
    '<rect width="210" height="280" fill="url(#cv-g-rain)"/>'
    '<g fill="none" stroke="#FFFFFF" stroke-width="1">' + rp + '</g>'
    '<g stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="0.8" stroke-linecap="round">' + drops + '</g>')
cover('rain', 'Rain', 'nature', x=26, y=56, font='serif', italic=True, size=26, fill='#F4F8FA', max=168, g='down', b=[16, 96])

# =============================================================== Lined & paper
# ---- Ruled paper with a red margin.
lines = ''.join(f'<line x1="12" y1="{y}" x2="210" y2="{y}"/>' for y in range(42, 280, 18))
sym('ruled',
    '<rect width="210" height="280" fill="#FBFBF6"/><g stroke="#A9C4E4" stroke-width="0.9">' + lines + '</g>'
    '<line x1="44" y1="0" x2="44" y2="280" stroke="#E07A7A" stroke-width="1.1"/>'
    '<g fill="#E9E9E2"><circle cx="26" cy="60" r="5"/><circle cx="26" cy="140" r="5"/><circle cx="26" cy="220" r="5"/></g>')
cover('ruled', 'Ruled', 'lined', x=54, y=113, font='hand', size=27, fill='#2B4C8C', max=146, g='down', b=[80, 170])

# ---- Graph paper with a white label.
minor = ''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="280"/>' for x in range(12, 211, 7)) + ''.join(f'<line x1="12" y1="{y}" x2="210" y2="{y}"/>' for y in range(0, 281, 7))
major = ''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="280"/>' for x in range(12, 211, 35)) + ''.join(f'<line x1="12" y1="{y}" x2="210" y2="{y}"/>' for y in range(0, 281, 35))
sym('graph',
    '<rect width="210" height="280" fill="#F3F8F3"/><g stroke="#CFE3D3" stroke-width="0.6">' + minor + '</g><g stroke="#9CC7A6" stroke-width="0.9">' + major + '</g>'
    '<rect x="30" y="112" width="162" height="58" fill="#FFFFFF" stroke="#6FA67E" stroke-width="1.2"/>')
cover('graph', 'Graph paper', 'lined', x=111, y=146, font='sans', weight=600, size=20, fill='#23523A', anchor='middle', max=146, g='mid', b=[117, 166])

# ---- Dot grid, with a ribbon bookmark.
dg = ''.join(f'<circle cx="{x}" cy="{y}" r="0.95"/>' for x in range(24, 210, 12) for y in range(12, 280, 12))
sym('dotgrid',
    '<rect width="210" height="280" fill="#FAF8F2"/><g fill="#B5AFA2">' + dg + '</g>'
    '<path d="M176 0 H188 V64 L182 58 L176 64 Z" fill="#D9644E"/>')
cover('dotgrid', 'Dot grid', 'lined', x=26, y=58, font='sans', weight=700, size=24, fill='#2B2F33', max=140, g='down', b=[22, 130])

# ---- Yellow legal pad.
lg = ''.join(f'<line x1="12" y1="{y}" x2="210" y2="{y}"/>' for y in range(64, 280, 16))
sym('legal',
    '<rect width="210" height="280" fill="#F8EC92"/><g stroke="#7FA6D6" stroke-width="0.9">' + lg + '</g>'
    '<g stroke="#D9644E" stroke-width="1"><line x1="40" y1="30" x2="40" y2="280"/><line x1="44" y1="30" x2="44" y2="280"/></g>'
    '<rect x="0" y="0" width="210" height="30" fill="#8C2F2F"/><rect x="0" y="28" width="210" height="3" fill="#000" fill-opacity="0.15"/>', spine=False)
cover('legal', 'Legal pad', 'lined', x=54, y=108, font='hand', size=27, fill='#1F2F5C', max=146, g='down', b=[52, 200])

# ---- Ledger: an account book.
lr = ''.join(f'<line x1="12" y1="{y}" x2="210" y2="{y}"/>' for y in range(86, 280, 14))
sym('ledger',
    '<rect width="210" height="280" fill="#EFE6CF"/><g stroke="#B8C7A8" stroke-width="0.7">' + lr + '</g>'
    '<g stroke="#C0504D" stroke-width="0.9"><line x1="40" y1="72" x2="40" y2="280"/><line x1="43" y1="72" x2="43" y2="280"/></g>'
    '<g stroke="#6A9A78" stroke-width="0.9"><line x1="146" y1="72" x2="146" y2="280"/><line x1="176" y1="72" x2="176" y2="280"/></g>'
    '<rect x="24" y="18" width="174" height="48" fill="#F6F0DE" stroke="#6A9A78" stroke-width="1"/>')
cover('ledger', 'Ledger', 'lined', x=111, y=48, font='serif', size=21, fill='#3A3226', anchor='middle', max=160, g='mid', b=[22, 62])

# ---- Music paper: staves with a few notes.
random.seed(29)
staff = ''
notes = ''
for top in range(108, 250, 36):
    staff += ''.join(f'<line x1="22" y1="{top + i * 5}" x2="200" y2="{top + i * 5}"/>' for i in range(5))
    for x in random.sample(range(40, 196, 14), 4):
        ny = top + random.randint(0, 8) * 2.5
        notes += f'<ellipse cx="{x}" cy="{f(ny)}" rx="3.6" ry="2.6" transform="rotate(-20 {x} {f(ny)})"/><rect x="{f(x + 2.8)}" y="{f(ny - 16)}" width="1.1" height="16"/>'
sym('music',
    '<rect width="210" height="280" fill="#FBF7EE"/><g stroke="#3A3A3A" stroke-opacity="0.55" stroke-width="0.7">' + staff + '</g>'
    '<g fill="#2B2F33">' + notes + '</g>')
cover('music', 'Music paper', 'lined', x=26, y=58, font='serif', italic=True, size=26, fill='#2B2F33', max=170, g='down', b=[18, 100])

# =============================================================== Fun
# ---- Confetti.
random.seed(31)
cf = ''
pal = ['#FF5C8A', '#FFC23D', '#3DD6B0', '#5B8CFF', '#B57BFF', '#FF8A3D']
for _ in range(80):
    x, y = random.randint(14, 206), random.randint(4, 276)
    if 104 < y < 178 and 24 < x < 198:
        continue
    c = random.choice(pal)
    k = random.random()
    a = random.randint(0, 180)
    if k < 0.45:
        cf += f'<rect x="{x - 4}" y="{y - 2}" width="8" height="4" rx="1" fill="{c}" transform="rotate({a} {x} {y})"/>'
    elif k < 0.75:
        cf += f'<circle cx="{x}" cy="{y}" r="2.6" fill="{c}"/>'
    else:
        cf += f'<path d="M{x - 6} {y} q3 -4 6 0 t6 0" fill="none" stroke="{c}" stroke-width="1.8" stroke-linecap="round" transform="rotate({a} {x} {y})"/>'
sym('confetti', '<rect width="210" height="280" fill="#FFE6EE"/>' + cf + '<rect x="30" y="112" width="162" height="58" rx="29" fill="#FFFFFF"/>')
cover('confetti', 'Confetti', 'fun', x=111, y=146, font='sans', weight=700, size=20, fill='#C2255C', anchor='middle', max=140, g='mid', b=[117, 166])

# ---- Sprinkles on chocolate.
random.seed(37)
sp = ''
for _ in range(110):
    x, y = random.randint(16, 206), random.randint(4, 200)
    a = random.randint(0, 180)
    c = random.choice(['#FF7AA8', '#FFE066', '#7FE0C9', '#8FB8FF', '#FFFFFF', '#FF9F5A'])
    sp += f'<line x1="{x - 4}" y1="{y}" x2="{x + 4}" y2="{y}" stroke="{c}" transform="rotate({a} {x} {y})"/>'
sym('sprinkles', '<rect width="210" height="280" fill="#4A2C21"/><g stroke-width="3" stroke-linecap="round">' + sp + '</g>')
cover('sprinkles', 'Sprinkles', 'fun', x=26, y=262, font='sans', weight=700, size=26, fill='#FFF4EA', max=168, g='up', b=[206, 280])

# ---- Smiles: simple happy faces on sunny yellow.
random.seed(41)
sm = ''
spots = [(46, 44), (120, 30), (182, 66), (74, 106), (152, 128), (36, 168), (110, 178), (184, 186)]
for x, y in spots:
    r = random.choice([13, 16, 19])
    sm += (f'<g transform="translate({x} {y}) rotate({random.randint(-25, 25)})"><circle r="{r}" fill="#FFFFFF" fill-opacity="0.35" stroke="#1B1B1B" stroke-width="2"/>'
           f'<circle cx="{-r * 0.35:.1f}" cy="{-r * 0.2:.1f}" r="{r * 0.1:.1f}" fill="#1B1B1B"/><circle cx="{r * 0.35:.1f}" cy="{-r * 0.2:.1f}" r="{r * 0.1:.1f}" fill="#1B1B1B"/>'
           f'<path d="M{-r * 0.45:.1f} {r * 0.15:.1f} Q0 {r * 0.6:.1f} {r * 0.45:.1f} {r * 0.15:.1f}" fill="none" stroke="#1B1B1B" stroke-width="2" stroke-linecap="round"/></g>')
sym('smiles', '<rect width="210" height="280" fill="#FFD84A"/>' + sm + '<rect x="26" y="214" width="170" height="46" rx="8" fill="#1B1B1B"/>')
cover('smiles', 'Smiles', 'fun', x=111, y=243, font='sans', weight=700, size=20, fill='#FFD84A', anchor='middle', max=150, g='mid', b=[219, 255])

# ---- Pixel hearts and gems.
HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
GEM = ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']


def pix(bm, x0, y0, s, c):
    out = ''
    for r, row in enumerate(bm):
        for c_, ch in enumerate(row):
            if ch == 'X':
                out += f'<rect x="{x0 + c_ * s}" y="{y0 + r * s}" width="{s}" height="{s}"/>'
    return f'<g fill="{c}">{out}</g>'


px = (pix(HEART, 40, 112, 7, '#FF5C8A') + pix(GEM, 128, 100, 6, '#FFD166') + pix(HEART, 150, 196, 5, '#5EE6C8')
      + pix(GEM, 30, 206, 5, '#5EE6C8') + pix(HEART, 96, 236, 4, '#FFD166') + pix(GEM, 176, 158, 3, '#FF5C8A'))
grid = ''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="280"/>' for x in range(12, 211, 14))
sym('pixels', '<rect width="210" height="280" fill="#2B1B4A"/><g stroke="#FFFFFF" stroke-opacity="0.05">' + grid + '</g>' + px)
cover('pixels', 'Pixel hearts', 'fun', x=26, y=54, font='sans', weight=700, size=24, fill='#FFFFFF', max=170, g='down', b=[16, 96])

# ---- Rainbow and clouds.
rb = ''.join(f'<path d="M{111 - r} 236 A{r} {r} 0 0 1 {111 + r} 236" fill="none" stroke="{c}" stroke-width="12"/>' for r, c in zip(range(126, 50, -12), ['#E85D5D', '#F39C3D', '#F7D85C', '#5CCB8A', '#5CA8E0', '#A57CC8']))
cloud = lambda x, y, s: f'<g transform="translate({x} {y}) scale({s})" fill="#FFFFFF"><ellipse cx="0" cy="0" rx="26" ry="12"/><ellipse cx="-12" cy="-8" rx="13" ry="11"/><ellipse cx="10" cy="-11" rx="15" ry="13"/></g>'
sym('rainbow', '<rect width="210" height="280" fill="#BFE4F6"/>' + rb + cloud(30, 240, 1.1) + cloud(192, 240, 1.1))
cover('rainbow', 'Rainbow', 'fun', x=26, y=50, font='sans', weight=700, size=24, fill='#1F4E79', max=150, g='down', b=[14, 98])

# ---- Balloons.
random.seed(43)
bl = ''
for x, y, c, s in [(64, 70, '#FF6B6B', 1.0), (112, 52, '#4DABF7', 1.1), (158, 84, '#FFD43B', 0.95), (88, 124, '#51CF66', 0.85), (140, 140, '#CC5DE8', 0.9)]:
    bl += (f'<path d="M{x} {y + 30 * s} q-6 26 4 52 t-2 46" fill="none" stroke="#5B6B7A" stroke-width="0.9"/>'
           f'<ellipse cx="{x}" cy="{y}" rx="{f(22 * s)}" ry="{f(28 * s)}" fill="{c}"/><path d="M{f(x - 3)} {f(y + 28 * s)} h6 l-3 5 Z" fill="{c}"/>'
           f'<ellipse cx="{f(x - 8 * s)}" cy="{f(y - 10 * s)}" rx="{f(5 * s)}" ry="{f(8 * s)}" fill="#FFFFFF" fill-opacity="0.45" transform="rotate(-20 {f(x - 8 * s)} {f(y - 10 * s)})"/>')
sym('balloons', '<rect width="210" height="280" fill="#EAF5FC"/>' + bl)
cover('balloons', 'Balloons', 'fun', x=26, y=262, font='sans', weight=700, size=24, fill='#1F3B5C', max=168, g='up', b=[224, 280])

# =============================================================== Calm
# ---- Misty hills.
defs.append('<linearGradient id="cv-g-mistsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEE8F4"/><stop offset="1" stop-color="#F7EFEA"/></linearGradient>')
defs.append('<linearGradient id="cv-g-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.55"/></linearGradient>')
hills = ''
for base, col in [(150, '#DCD2E8'), (178, '#C6B9DA'), (206, '#AC9EC8'), (236, '#8D80B2')]:
    hills += f'<path d="M0 {base} C 40 {base - 26}, 80 {base - 6}, 120 {base - 22} S 180 {base - 10}, 210 {base - 28} V280 H0 Z" fill="{col}"/><rect x="0" y="{base - 20}" width="210" height="34" fill="url(#cv-g-fog)"/>'
sym('mist', '<rect width="210" height="280" fill="url(#cv-g-mistsky)"/><circle cx="156" cy="96" r="18" fill="#FFFFFF" fill-opacity="0.8"/>' + hills)
cover('mist', 'Misty hills', 'calm', x=26, y=56, font='serif', italic=True, size=26, fill='#4A3F66', max=168, g='down', b=[16, 110])

# ---- Moon phases.
phases = ''
for i, x in enumerate(range(40, 190, 34)):
    k = [-1, -0.5, 0, 0.5, 1][i]
    phases += f'<circle cx="{x}" cy="118" r="12" fill="#F1E9D2"/>'
    if k != 0:
        phases += f'<circle cx="{f(x + k * 9)}" cy="118" r="12" fill="#1E2A44"/>'
sym('moons',
    '<rect width="210" height="280" fill="#1E2A44"/>'
    '<g fill="#F1E9D2" fill-opacity="0.6"><circle cx="34" cy="40" r="0.9"/><circle cx="96" cy="26" r="1.1"/><circle cx="170" cy="48" r="0.8"/><circle cx="140" cy="182" r="0.9"/><circle cx="60" cy="196" r="1"/></g>'
    + phases + '<line x1="40" y1="150" x2="176" y2="150" stroke="#F1E9D2" stroke-opacity="0.3"/>')
cover('moons', 'Moon phases', 'calm', x=111, y=226, font='serif', size=24, fill='#F1E9D2', anchor='middle', max=164, g='mid', b=[176, 272])

# ---- A soft arch.
sym('arch',
    '<rect width="210" height="280" fill="#EFE4D6"/>'
    '<path d="M50 222 V122 A61 61 0 0 1 172 122 V222 Z" fill="#DDBB9C"/><circle cx="111" cy="146" r="20" fill="#C97A55"/>'
    '<line x1="38" y1="222" x2="184" y2="222" stroke="#B48A6A" stroke-width="1.2"/>')
cover('arch', 'Soft arch', 'calm', x=111, y=256, font='serif', size=22, fill='#5A3E2B', anchor='middle', max=160, g='mid', b=[234, 276])

art = ''.join(defs) + ''.join(symbols)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'coverart2.js')
with open(out, 'w') as fh:
    fh.write('// The second set of cover artwork (generated by tools/covergen2.py; edit\n'
             '// that, not this): Futuristic, AI & data, more Nature, Lined & paper,\n'
             '// Fun and Calm. SVG patterns and symbols for the shared cover sprite,\n'
             '// and each cover\'s name, collection and title space (see covers.js).\n\n')
    fh.write('export const NEW_ART = ' + json.dumps(art) + ';\n\n')
    fh.write('export const NEW_COVERS = [\n' + ''.join('  ' + json.dumps(c, separators=(', ', ': ')) + ',\n' for c in covers) + '];\n')
print(len(covers), 'covers,', len(art), 'bytes of art')
