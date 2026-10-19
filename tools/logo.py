# Генератор кружевного логотипа TEMPT: буквы из плиток с фестонами, розетками и сеткой.
import math, sys
C = 20                      # размер клетки
GLYPHS = {
 'T': ["#####","..#..","..#..","..#..","..#.."],
 'E': ["####","#...","###.","#...","####"],
 'M': ["#####","#.#.#","#.#.#","#.#.#","#.#.#"],
 'P': ["#####","#...#","#####","#....","#...."],
}
import os
WORD = os.environ.get("WORD", "TEMPT"); GAP = 1.2
cells = []; x0 = 0
for ch in WORD:
    g = GLYPHS[ch]
    for r,row in enumerate(g):
        for c,v in enumerate(row):
            if v == '#': cells.append((x0 + c*C, r*C))
    x0 += len(g[0])*C + GAP*C
W = x0 - GAP*C; H = 5*C
S = set(cells)
R = 3.6                     # радиус фестона
IN = 2.7                    # отступ внутренней обводки (кордонне)
pad = R + 2
shape, holes, solids = [], [], []
f = lambda v: f"{v:.2f}".rstrip('0').rstrip('.')
for (x,y) in cells:
    shape.append(f'<rect x="{f(x-0.3)}" y="{f(y-0.3)}" width="{f(C+0.6)}" height="{f(C+0.6)}"/>')
    # фестоны по внешним краям: 2 полукруга на сторону, в каждом пико-дырочка
    for dx,dy,ex,ey in ((0,-1,1,0),(0,1,1,0),(-1,0,0,1),(1,0,0,1)):
        if (x+dx*C, y+dy*C) in S: continue
        bx = x + (C if dx==1 else 0) if dx else x
        by = y + (C if dy==1 else 0) if dy else y
        for t in (1/6, 0.5, 5/6):
            cx = bx + ex*C*t; cy = by + ey*C*t
            shape.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{R}"/>')
            holes.append(f'<circle cx="{f(cx+dx*1.5)}" cy="{f(cy+dy*1.5)}" r="0.75"/>')
        # кордонне: тонкая прорезь вдоль края, внутри плитки
        if dy:
            a0 = x + (IN if (x-C, y) not in S else 0); a1 = x + C - (IN if (x+C, y) not in S else 0)
            yy = y + (IN if dy < 0 else C - IN)
            holes.append(f'<rect x="{f(a0)}" y="{f(yy-0.45)}" width="{f(a1-a0)}" height="0.9"/>')
        else:
            a0 = y + (IN if (x, y-C) not in S else 0); a1 = y + C - (IN if (x, y+C) not in S else 0)
            xx = x + (IN if dx < 0 else C - IN)
            holes.append(f'<rect x="{f(xx-0.45)}" y="{f(a0)}" width="0.9" height="{f(a1-a0)}"/>')
    cx, cy = x + C/2, y + C/2
    i = int(x//C + y//C)
    if i % 2 == 0:
        # розетка: 8 лепестков-прорезей вокруг плотной серединки, кольцо точек
        for k in range(8):
            a = k*math.pi/4
            px, py = cx + 3.9*math.cos(a), cy + 3.9*math.sin(a)
            holes.append(f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="2.2" ry="0.95" transform="rotate({k*45} {f(px)} {f(py)})"/>')
            b = a + math.pi/8
            holes.append(f'<circle cx="{f(cx + 6.6*math.cos(b))}" cy="{f(cy + 6.6*math.sin(b))}" r="0.65"/>')
        holes.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="1.3"/>')
        solids.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="0.7"/>')
    else:
        # сетка: ромбическая решётка дырочек
        # тюль: соты из мелких дырочек
        for j, gy in enumerate((-5.4, -1.8, 1.8, 5.4)):
            for gx in ((-5.4, -1.8, 1.8, 5.4) if j % 2 == 0 else (-3.6, 0, 3.6)):
                holes.append(f'<circle cx="{f(cx+gx)}" cy="{f(cy+gy)}" r="1.05"/>')
color = sys.argv[1] if len(sys.argv) > 1 else '#111'
vb = f"{f(-pad)} {f(-pad)} {f(W+2*pad)} {f(H+2*pad)}"
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="TEMPT">
<defs><mask id="lace" maskUnits="userSpaceOnUse" x="{f(-pad)}" y="{f(-pad)}" width="{f(W+2*pad)}" height="{f(H+2*pad)}"><g fill="#fff">{''.join(shape)}</g><g fill="#000">{''.join(holes)}</g><g fill="#fff">{''.join(solids)}</g></mask></defs>
<rect x="{f(-pad)}" y="{f(-pad)}" width="{f(W+2*pad)}" height="{f(H+2*pad)}" fill="{color}" mask="url(#lace)"/>
</svg>'''
open(sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/logo/logo.svg','w').write(svg)
print(len(svg), 'bytes', vb)
