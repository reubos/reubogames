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
                cubies.append({'home': (x, y, z), 'pos': (x, y, z), 'ori': I3, 'stickers': st})
    return cubies

def parse_move(m):
    x = re.match(r'^(\d+)?([RLUDFB])(w?)(2|\')?$', m)
    if not x: raise ValueError('bad move: ' + m)
    return {'layer': int(x.group(1)) if x.group(1) else 1, 'face': x.group(2),
            'wide': x.group(3) == 'w', 'mod': x.group(4) or ''}

def apply_move(cubies, move):
    mv = parse_move(move) if isinstance(move, str) else move
    face, layer, mod, wide = mv['face'], mv['layer'], mv['mod'], mv['wide']
    ax, k, pos = AXIS[face], IDX[AXIS[face]], face in POSITIVE
    coords = sorted({c['pos'][k] for c in cubies}, reverse=pos)
    sel = set(coords[:layer] if wide else [coords[layer - 1]])
    sign = base_sign(face)
    exp = 2 if mod == '2' else (-sign if mod == "'" else sign)
    R = matpow(P[ax], exp)
    for c in cubies:
        if c['pos'][k] in sel:
            c['pos'] = matvec(R, c['pos'])
            c['ori'] = matmul(R, c['ori'])

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

print('\n=== shapeshift demo (3x5x7, R quarter turn) ===')
c = build_solved(3, 5, 7)
print('  solved bounding cells:', bounding_cells(c))
apply_move(c, 'R')
print('  after R  bounding cells:', bounding_cells(c))
protruding = [x for x in c if abs(x['pos'][1]) > 4]
check(len(protruding) > 0, 'R shapeshifts: %d cubies protrude past the 5-tall body' % len(protruding))
print('  sample protruding cubie:', {'home': protruding[0]['home'], 'pos': protruding[0]['pos'],
                                      'stickers': world_stickers(protruding[0])})
apply_move(c, "R'")
check(is_solved(c), 'R then R\' returns to solved box')

print('\n=== sample state dump (2x2x3 after F) ===')
c = build_solved(2, 2, 3)
apply_move(c, 'F')
shown = [cu for cu in c if len(world_stickers(cu)) >= 2][:6]
for cu in shown:
    print('  pos', cu['pos'], 'colors', world_stickers(cu))

print('\nALL PASS' if ok else '\nSOME FAILED')
