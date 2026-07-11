# Validation mirror of sim-proto.js (same algorithm, run with system Python).
# The JS file is the artifact to embed; this proves the engine logic is correct.
import re

COLORS = {'+x': 'Red', '-x': 'Orange', '+y': 'White', '-y': 'Yellow', '+z': 'Green', '-z': 'Blue'}
DIRS = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0), '-y': (0, -1, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}
I3 = ((1, 0, 0), (0, 1, 0), (0, 0, 1))

def dot(a, b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def matvec(M, v): return (dot(M[0], v), dot(M[1], v), dot(M[2], v))
def transpose(M): return tuple(tuple(M[r][i] for r in range(3)) for i in range(3))
def matmul(A, B):
    Bt = transpose(B)
    return tuple(tuple(dot(A[i], Bt[j]) for j in range(3)) for i in range(3))

P = {'x': ((1, 0, 0), (0, 0, -1), (0, 1, 0)),
     'y': ((0, 0, 1), (0, 1, 0), (-1, 0, 0)),
     'z': ((0, -1, 0), (1, 0, 0), (0, 0, 1))}
def matpow(M, e): return M if e == 1 else transpose(M) if e == -1 else matmul(M, M)

AXIS = {'R': 'x', 'L': 'x', 'U': 'y', 'D': 'y', 'F': 'z', 'B': 'z'}
IDX = {'x': 0, 'y': 1, 'z': 2}
POSITIVE = {'R', 'U', 'F'}
def base_sign(face): return -1 if face in POSITIVE else 1
def span(n): return [-(n - 1) + 2 * i for i in range(n)]

def build_solved(w, h, d):
    xs, ys, zs = span(w), span(h), span(d)
    xmax, xmin, ymax, ymin, zmax, zmin = max(xs), min(xs), max(ys), min(ys), max(zs), min(zs)
    cubies = []
    for x in xs:
        for y in ys:
            for z in zs:
                st = {}
                if x == xmax: st['+x'] = COLORS['+x']
                if x == xmin: st['-x'] = COLORS['-x']
                if y == ymax: st['+y'] = COLORS['+y']
                if y == ymin: st['-y'] = COLORS['-y']
                if z == zmax: st['+z'] = COLORS['+z']
                if z == zmin: st['-z'] = COLORS['-z']
                # fc = functional coordinate (effective-space position). Seeded to
                # the physical position (effective == physical while solved); it
                # rotates with the piece and is coarsened at each phase boundary.
                cubies.append({'home': (x, y, z), 'pos': (x, y, z), 'ori': I3,
                               'fc': (x, y, z), 'stickers': st})
    return cubies

def coarsen(cubies, eff):
    # Reduce each cubie's functional coord to the phase's effective dims by
    # centre-aligned clamping: physical layers outside the effective range fold
    # onto the outermost retained functional layer (outer-fat bandaging).
    lim = [e - 1 for e in eff]
    for c in cubies:
        f = c['fc']
        c['fc'] = tuple(max(-lim[k], min(lim[k], f[k])) for k in range(3))

def parse_move(m):
    x = re.match(r'^(\d+)?([RLUDFB])(w?)(2|\')?$', m)
    if not x: raise ValueError('bad move: ' + m)
    return {'layer': int(x.group(1)) if x.group(1) else 1, 'face': x.group(2),
            'wide': x.group(3) == 'w', 'mod': x.group(4) or ''}

def select_coords(cubies, mv):
    # Functional-layer selection: a move on functional layer k from the named
    # face grabs every cubie whose FUNCTIONAL coord on that axis matches. Bandaged
    # physical layers share an fc value (from coarsening), so they come together
    # automatically -- no geometry inference.
    face, layer, wide = mv['face'], mv['layer'], mv['wide']
    k, pos = IDX[AXIS[face]], face in POSITIVE
    coords = sorted({c['fc'][k] for c in cubies}, reverse=pos)  # from face inward
    return set(coords[:layer]) if wide else {coords[layer - 1]}

def apply_move(cubies, move):
    mv = parse_move(move) if isinstance(move, str) else move
    face, mod = mv['face'], mv['mod']
    ax, k = AXIS[face], IDX[AXIS[face]]
    sel = select_coords(cubies, mv)
    sign = base_sign(face)
    exp = 2 if mod == '2' else (-sign if mod == "'" else sign)
    R = matpow(P[ax], exp)
    for c in cubies:
        if c['fc'][k] in sel:
            c['pos'] = matvec(R, c['pos'])
            c['ori'] = matmul(R, c['ori'])
            c['fc'] = matvec(R, c['fc'])

def apply_scramble(cubies, seq):
    for tok in seq.split():
        apply_move(cubies, tok)

def world_stickers(c):
    out, oriT = {}, transpose(c['ori'])
    for key, wv in DIRS.items():
        lv = matvec(oriT, wv)
        lk = next(kk for kk in DIRS if DIRS[kk] == lv)
        if c['stickers'].get(lk): out[key] = c['stickers'][lk]
    return out

def is_solved(cubies): return all(c['pos'] == c['home'] and c['ori'] == I3 for c in cubies)
def bounding_cells(cubies):
    def ext(k):
        v = [c['pos'][k] for c in cubies]
        return (max(v) - min(v)) // 2 + 1
    return [ext(0), ext(1), ext(2)]

ok = True
def check(cond, msg):
    global ok
    print(('PASS' if cond else 'FAIL') + '  ' + msg)
    ok = ok and cond

print('=== build 3x3x3 ===')
c = build_solved(3, 3, 3)
check(len(c) == 27, 'cubie count = 27 (got %d)' % len(c))
corner = next(x for x in c if x['home'] == (2, 2, 2))
print('  +x+y+z corner stickers:', world_stickers(corner))

print('\n=== identity laws (3x3x3) ===')
for mv in ['R', 'U', 'F', "L'", '2R', '3Fw']:
    c = build_solved(3, 3, 3)
    for _ in range(4): apply_move(c, mv)
    check(is_solved(c), '%s x4 = solved' % mv)
c = build_solved(3, 3, 3)
apply_scramble(c, "R U R' U'")
apply_scramble(c, "U R U' R'")
check(is_solved(c), "sexy move . its inverse = solved")

print('\n=== non-shapeshifting quarter turn (3x3x3 stays a cube) ===')
c = build_solved(3, 3, 3)
apply_move(c, 'R')
check(bounding_cells(c) == [3, 3, 3], 'bounding box after R = 3x3x3 (got %s)' % bounding_cells(c))

print('\n=== bandaged selection via fc: U after R on 3x5x7 (phase 2 eff 3x5x5) ===')
c = build_solved(3, 5, 7)
coarsen(c, (3, 5, 5))                     # enter phase 2: depth 7 -> functional 5
apply_move(c, 'R')                        # R/L now effectively square -> quarter turn shapeshifts
print('  after R  bounding cells:', bounding_cells(c))
sel = select_coords(c, parse_move('U'))   # top functional layer, selected by fc
moved_y = sorted({x['pos'][1] for x in c if x['fc'][1] in sel}, reverse=True)
print('  U moves physical y-coords:', moved_y)
check(moved_y == [6, 4], 'U grabs body top (y=4) + bandaged protrusion (y=6), NOT y=6 alone')
moved = [x for x in c if x['fc'][1] in sel]
check(len(moved) == 24, 'U after R moves 24 cubies, got %d' % len(moved))
apply_move(c, 'U'); apply_move(c, "U'"); apply_move(c, "R'")
check(is_solved(c), "R U U' R' returns to solved box")

print('\n=== fc handles the 7x3x5 F\' case cleanly (no subset test) ===')
c = build_solved(7, 3, 5)
coarsen(c, (5, 3, 5))                      # a phase where U/D is square
apply_move(c, 'U')                         # quarter turn, shapeshifts
sel = select_coords(c, parse_move("F'"))
moved_z = sorted({x['pos'][2] for x in c if x['fc'][2] in sel}, reverse=True)
print('  F\' moves physical z-coords:', moved_z)
check(len(sel) == 1, "F' selects exactly one functional depth layer (got %d)" % len(sel))
apply_move(c, "F'"); apply_move(c, 'F'); apply_move(c, "U'")
check(is_solved(c), "U F' F U' returns to solved box")

print('\n=== sample state dump (2x2x3 after F) ===')
c = build_solved(2, 2, 3)
apply_move(c, 'F')
shown = [cu for cu in c if len(world_stickers(cu)) >= 2][:6]
for cu in shown:
    print('  pos', cu['pos'], 'colors', world_stickers(cu))

print('\nALL PASS' if ok else '\nSOME FAILED')
