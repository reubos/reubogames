"use strict";

/* Pentagonal Minesweeper — the six tilings and their geometry: duals, unit cells, the cut of a board.
   One of five scripts sharing a single scope; the order they are
   loaded in is the order the one file used to run in. */

/* =====================================================================
   1. GEOMETRY PRIMITIVES

   Every tiling here is described as a fundamental unit cell — a handful
   of polygons — plus two lattice vectors. Polygons are built with reg()
   and attach() rather than typed-in coordinates, which keeps them exact.
   All have edge length 1 and are wound counter-clockwise.

   This engine, and the dual operator below, are lifted from the Lights
   Out tiling picker on this site, which is where they were worked out.
   ===================================================================== */

const TAU = Math.PI * 2, S3 = Math.sqrt(3);

// Regular n-gon, edge length 1, centred at (cx,cy), first vertex at `start`.
function reg(n, cx, cy, start) {
  const R = 1 / (2 * Math.sin(Math.PI / n));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = start + TAU * k / n;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

// Regular n-gon glued to the outside of edge k of a CCW polygon.
function attach(poly, k, n) {
  const a = poly[k], b = poly[(k + 1) % poly.length];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const nx = dy / L, ny = -dx / L;                 // outward normal for CCW winding
  const ap = 1 / (2 * Math.tan(Math.PI / n));      // apothem for edge length 1
  const cx = (a[0] + b[0]) / 2 + nx * ap;
  const cy = (a[1] + b[1]) / 2 + ny * ap;
  return reg(n, cx, cy, Math.atan2(b[1] - cy, b[0] - cx));
}

const translate = (poly, ox, oy) => poly.map(p => [p[0] + ox, p[1] + oy]);
const rot = (v, ang) => [v[0] * Math.cos(ang) - v[1] * Math.sin(ang),
                         v[0] * Math.sin(ang) + v[1] * Math.cos(ang)];

const inBox = (p, h) => p.every(q =>
  q[0] >= -h - 1e-6 && q[0] <= h + 1e-6 && q[1] >= -h - 1e-6 && q[1] <= h + 1e-6);

/* A tiling source: repeat the unit cell over the lattice, far enough to
   fill a square of half-size h. `density` is tiles per unit area, which is
   what turns a wanted cell count into a size on the plane. */
function lattice(cellFn, v1, v2) {
  const A = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]);
  const pitch = Math.sqrt(A);

  /* Tiles and vertices per unit area, straight off the cell: F, and
     V = E - F by Euler on the torus. The dual has one tile per vertex of
     this one, so it needs the second. */
  const cell0 = cellFn();
  const F = cell0.length;
  const E = cell0.reduce((s, p) => s + p.length, 0) / 2;

  function raw(h) {
    const cell = cellFn();
    let rad = 0;
    for (const p of cell) for (const q of p) rad = Math.max(rad, Math.hypot(q[0], q[1]));
    const reach = h * Math.SQRT2 + rad + 1;
    const n1 = Math.ceil(reach * Math.hypot(v2[0], v2[1]) / A) + 1;
    const n2 = Math.ceil(reach * Math.hypot(v1[0], v1[1]) / A) + 1;
    const out = [];
    for (let i = -n1; i <= n1; i++) for (let j = -n2; j <= n2; j++) {
      const ox = i * v1[0] + j * v2[0], oy = i * v1[1] + j * v2[1];
      if (Math.hypot(ox, oy) > reach) continue;
      for (const p of cell) out.push(translate(p, ox, oy));
    }
    return out;
  }

  // v1 and v2 travel with the tiling: a board cut along the lattice rather than
  // along the screen needs to know which way the lattice runs.
  return { pitch, density: F / A, vertexDensity: (E - F) / A, v1, v2, raw };
}

const fromCells = d => lattice(() => d.cell.map(c => reg(c[0], c[1], c[2], c[3])), d.v1, d.v2);

// The same tiling stood at a different angle. Turning it so that its lattice
// runs along the page is what lets a board be cut square to the screen and
// square to the tiling at the same time.
const turned = (src, ang) => ({
  pitch: src.pitch, density: src.density, vertexDensity: src.vertexDensity,
  v1: rot(src.v1, ang), v2: rot(src.v2, ang),
  raw: h => src.raw(h).map(p => p.map(q => rot(q, ang)))
});

/* =====================================================================
   2. VERTEX TOPOLOGY AND THE DUAL

   Snapping merges corners that coincide to within a fraction of an edge.
   Everything downstream — who touches whom, and the dual operator that
   makes the pentagons in the first place — is read off this.
   ===================================================================== */

function topology(polys) {
  const pts = [], buckets = new Map(), EPS = 0.02;
  function snap(x, y) {
    const ix = Math.round(x / 0.25), iy = Math.round(y / 0.25);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const b = buckets.get((ix + dx) + ',' + (iy + dy));
      if (b) for (const p of b) if (Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS) return p.id;
    }
    const p = { x, y, id: pts.length };
    pts.push(p);
    const k = ix + ',' + iy;
    let b = buckets.get(k); if (!b) buckets.set(k, b = []);
    b.push(p);
    return p.id;
  }

  const faces = polys.map(poly => {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p[0]; sy += p[1]; }
    return { poly, v: poly.map(p => snap(p[0], p[1])),
             cx: sx / poly.length, cy: sy / poly.length };
  });

  const edgeMap = new Map(), vertFaces = new Map();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.v.length; i++) {
      const a = f.v[i], b = f.v[(i + 1) % f.v.length];
      const k = a < b ? a + ':' + b : b + ':' + a;
      let e = edgeMap.get(k); if (!e) edgeMap.set(k, e = []); e.push(fi);
      let w = vertFaces.get(a); if (!w) vertFaces.set(a, w = []); w.push(fi);
    }
  });

  return { pts, faces, edgeMap, vertFaces };
}

// Interior angle that face `f` occupies at vertex id `vid`.
function angleAt(f, vid) {
  const i = f.v.indexOf(vid);
  const m = f.poly.length;
  const c = f.poly[i], p = f.poly[(i - 1 + m) % m], q = f.poly[(i + 1) % m];
  let d = Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]);
  while (d < 0) d += TAU;
  while (d > TAU) d -= TAU;
  return d;
}

/* Each fully surrounded vertex of the parent becomes one face of the dual,
   its corners being the centres of the faces around it. A vertex whose
   angles do not come to a full turn is on the rim of the patch and has no
   face to give. */
function dualPolys(polys) {
  const { pts, faces, vertFaces } = topology(polys);
  const out = [];
  for (const [vid, fl] of vertFaces) {
    const around = [...new Set(fl)];
    let sum = 0;
    for (const fi of around) sum += angleAt(faces[fi], vid);
    if (Math.abs(sum - TAU) > 1e-6) continue;
    const v = pts[vid];
    const ring = around.map(fi => faces[fi])
      .map(f => ({ p: [f.cx, f.cy], a: Math.atan2(f.cy - v.y, f.cx - v.x) }))
      .sort((m, k) => m.a - k.a)
      .map(m => m.p);
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

function dualOf(base) {
  return {
    pitch: base.pitch,
    density: base.vertexDensity, vertexDensity: base.density,
    // the dual repeats on exactly the lattice its parent does
    v1: base.v1, v2: base.v2,
    // dualPolys only yields faces well inside the parent patch, so the parent
    // is grown by a margin and the result trimmed back to what was asked for
    raw: h => dualPolys(base.raw(h + 2.5 * base.pitch)).filter(p => inBox(p, h))
  };
}

/* =====================================================================
   3. THE TILINGS

   There are fifteen kinds of convex pentagon that tile the plane, but
   only a few tilings in which every tile is a pentagon and every tile is
   alike, or alike in a small number of ways. Each of the ones here is
   the dual of a tiling of regular polygons, so none of them needs any
   geometry written down beyond its parent:

     the Cairo pentagon is the dual of a 3.3.4.3.4 vertex,
     the prismatic pentagon the dual of a 3.3.3.4.4 vertex,
     the floret pentagon the dual of a 3.3.3.3.6 vertex.

   A tiling using only Cairo and prismatic pentagons is therefore the
   dual of a tiling using only those two vertex types. Three of those are
   known, and all three are below — they differ in how many Cairo
   pentagons accompany each prismatic one, and in how the two are laid
   out. The unit cells for those three were recovered in the Lights Out
   project and are copied here as [sides, cx, cy, rotation] per tile.
   ===================================================================== */

// Snub square 3.3.4.3.4 : square, its four triangles, and one rotated square.
const T_snubSquare = lattice(() => {
  const q = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const t = [0, 1, 2, 3].map(k => attach(q, k, 3));
  return [q, ...t, attach(t[2], 1, 4)];
}, [1 + S3 / 2, 0.5], [-0.5, 1 + S3 / 2]);

// Elongated triangular 3.3.3.4.4 : a square row and a triangle row.
const T_elongTri = lattice(() => {
  const q = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const t = attach(q, 2, 3);
  return [q, t, attach(t, 1, 3)];
}, [1, 0], [0.5, 1 + S3 / 2]);

// Snub trihexagonal 3.3.3.3.6 : hexagon, its six triangles, plus two in the gaps.
const T_snubTrihex = lattice(() => {
  const h = reg(6, 0, 0, 0);
  const t = [0, 1, 2, 3, 4, 5].map(k => attach(h, k, 3));
  return [h, ...t, attach(t[0], 2, 3), attach(t[1], 2, 3)];
}, [2.5, S3 / 2], rot([2.5, S3 / 2], Math.PI / 3));

// 2-uniform [3³.4²; 3².4.3.4], the two ways it can be done.
const T_n16 = fromCells({
  v1: [-2.366, 2.366], v2: [-2.366, -2.366],
  cell: [[3,1.9434,-0.1572,1.5708],[3,-2.2886,0.1314,0.5236],[4,1.2604,0.2371,0.2618],
         [4,-0.4226,1.4201,0.7854],[3,-1.7886,-0.1572,1.5708],[4,0.0774,-1.4459,0.7854],
         [3,-0.7113,-1.4459,1.0472],[3,0.5774,0.6314,0.5236],[3,0.8661,-0.4459,0],
         [3,-1.2113,1.4201,1.0472],[3,-0.4226,0.6314,0.5236],[4,-1.7886,-0.9459,0.7854],
         [4,-1.1056,0.2371,1.309],[3,-1.5,0.9201,2.0944],[4,0.0774,-0.4459,0.7854],
         [3,-1,-0.9459,2.0944],[3,0.0774,0.3428,1.5708],[3,-0.7113,-0.4459,1.0472]] });
const T_n17 = fromCells({
  v1: [-0.5, 1.866], v2: [3.7321, 1],
  cell: [[3,-1.5515,-1.1555,1.5708],[3,-1.0515,-0.8668,0.5236],[3,1.6806,0.1332,0.5236],
         [4,1.6806,0.9219,0.7854],[3,-1.0515,0.7105,1.5708],[4,-1.0515,-0.0781,0.7854],
         [4,0.9975,-0.2612,1.309],[3,0.8919,0.9219,1.0472],[4,-0.3685,1.1049,1.309],
         [3,-0.2628,-0.0781,2.0944],[3,0.6032,0.4219,0],[3,0.0259,0.4219,1.0472]] });

// 3-uniform [(3³.4²)²; 3².4.3.4]: two orbits of prismatic to one of Cairo.
const T_k53 = fromCells({
  v1: [1.866, -0.5], v2: [1.5, 5.5981],
  cell: [[4,-1.1728,-1.8524,0.2618],[4,-0.1728,2.8796,0.2618],[4,0.0102,-1.1694,0.7854],
         [4,0.0102,-0.1694,0.7854],[4,0.0102,0.8306,0.7854],[4,1.1932,1.5136,0.2618],
         [3,-1.0672,-0.6694,0],[3,-0.7785,-1.1694,1.0472],[3,-0.7785,-0.1694,1.0472],
         [3,-0.4898,-2.8241,0.5236],[3,-0.4898,-2.2467,1.5708],[3,0.0102,-1.9581,0.5236],
         [3,0.0102,1.6193,1.5708],[3,0.5102,1.908,0.5236],[3,0.5102,2.4853,1.5708],
         [3,0.7988,-0.1694,0],[3,0.7988,0.8306,2.0944],[3,1.0875,0.3306,1.0472]] });

const TILINGS = [
  /* Turned so its lattice stands square to the page. Four pentagons pinwheel
     about each right-angled corner and that group of four is the unit cell, so
     a board counted out in whole cells is a board of whole pinwheels. */
  { id: 'cairo', name: 'Cairo Pentagonal',
    src: turned(dualOf(T_snubSquare), -Math.atan2(0.5, 1 + S3 / 2)),
    region: { kind: 'para' },
    note: 'The dual of the snub square tiling. One pentagon, with two right angles and three of ' +
          '120°, four of them pinwheeling about each right-angled corner. The board is a whole ' +
          'number of those pinwheels across by a whole number down.' },
  { id: 'prismatic', name: 'Prismatic Pentagonal', src: dualOf(T_elongTri),
    region: { kind: 'rows' },
    boxMul: [2, 1],          // its repeat is two tiles, so a box of four is two of them
    note: 'The dual of the elongated triangular tiling: rows of pentagons standing on a flat ' +
          'course, each row facing the opposite way to the last. The rows fall into pairs — two ' +
          'level with each other, then two starting half a cell further right — and the board is ' +
          'counted out along them, so it leans as the rows do.' },
  { id: 'floret', name: 'Floret Pentagonal', src: dualOf(T_snubTrihex),
    region: { kind: 'hex', anchor: 'sixfold', groups: 'florets' },
    note: 'The dual of the snub trihexagonal tiling. Six pentagons turn about a common corner to ' +
          'make a flower, and the flowers tile as hexagons do. The board is a hexagonal ball of ' +
          'whole flowers, built out from one such corner in the middle — no flower is ever cut.' },
  { id: 'cp11', name: 'Cairo and Prismatic 1', src: dualOf(T_n17),
    /* A row runs prismatic, Cairo, prismatic, ... across to the right, dropping
       a whole cell every four; the row below starts one step down the chain of
       prismatic fenceposts, which leans left. Four cells to a row-step and two
       rows to a fencepost-step is eight, which is what the repeat holds. */
    spin: 75 * Math.PI / 180,
    region: { kind: 'walk', start: 'prismatic',
              step: [0.7, 1.15, -0.25, 0.7], drop: [-0.7, 0.15, 0.65, 1.25],
              open: [-0.7, -0.25, 0.65, 0.95], period: 2, units: true },
    note: 'Both pentagons at once, one of each, and the smaller of the two ways that can be done ' +
          '— the dual of a 2-uniform tiling of 3³.4² and 3².4.3.4 vertices. Its rows run ' +
          'prismatic, Cairo, prismatic and so on, sloping gently down as they go; each row starts ' +
          'one place further down the chain of prismatic fenceposts, so the board leans left as ' +
          'it descends.' },
  { id: 'cp21', name: 'Cairo and Prismatic 2', src: dualOf(T_n16),
    spin: 45 * Math.PI / 180,
    region: { kind: 'boxCentre', anchor: 'prismaticPair', units: true },
    note: 'The same two pentagons on a larger repeat, with two Cairo pentagons to each prismatic ' +
          'one instead of one apiece. Its rows run flat across, nine cells with a prismatic in ' +
          'the middle, then eight, with pairs of prismatic pentagons between; the board is a ' +
          'rectangle of them centred on the upright edge that joins one such pair.' },
  /* Here a row runs Cairo, prismatic, prismatic and repeats, and it runs down
     the page rather than across it; the next row stands a cell to the right and
     a little higher. Six cells to a row-step and two rows to the other is
     twelve, which is what this repeat holds. */
  { id: 'cp3', name: 'Cairo and Prismatic 3', src: dualOf(T_k53),
    /* Cairo pentagons sit here in more than one attitude, and the step down to
       the next row does not tell them apart on its own — a board can come out
       with the right cells in it and every one of them turned a quarter. So the
       opening cell must also be able to take the leaning step along its row,
       which is what settles which way up the whole board stands. */
    spin: 15 * Math.PI / 180,
    region: { kind: 'walk', start: 'Cairo',
              step: [-0.2, 0.65, 0.75, 1.15], drop: [0.7, 1.15, -0.7, 0.2],
              open: [0.7, 0.95, -0.7, -0.3], first: [0.35, 0.65, 0.75, 0.95],
              period: 3, units: true },
    note: 'Two prismatic pentagons to each Cairo one, from a 3-uniform parent — the prismatic ' +
          'pentagons here fall into two families that sit differently among their neighbours. Its ' +
          'rows run Cairo, prismatic, prismatic down the page, and each row stands a cell right ' +
          'of the last and a little higher, so the board leans as it goes.' }
];

/* =====================================================================
   4. THE BOARD

   A board is a rectangle cut out of one of those tilings: every tile
   that falls wholly inside it. That is the only sizing rule that can
   serve all of them, since none but the square grid comes in rows that
   can be counted off. Two cells are neighbours if they touch at all —
   sharing an edge, or only a corner — and how many neighbours that
   comes to is left to the tiling to decide, cell by cell.
   ===================================================================== */

let tiling = TILINGS[0];
let n = 0;                    // cells
let poly = [];                // poly[i] = the cell's corners
let mids = [];                // centroid per cell, for hanging a glyph on
let inr = [];                 // biggest circle that fits, per cell
let shapeOf = [];             // which pentagon shape each cell is
let shapeCount = 1;
let interior = [];            // is the cell fully surrounded, or on the rim?
let bounds = null, cellPitch = 1;

// adjacency held twice, as touching-at-all and as sharing-an-edge, each in
// compact form: nbAll[nbOff[i] .. nbOff[i+1]] are the neighbours of cell i
let nbOffC, nbAllC, nbOffE, nbAllE;
let nbOff, nbAll;
const nbOf = i => nbAll.subarray(nbOff[i], nbOff[i + 1]);

function centroidOf(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += cross;
    cx += (pts[j][0] + pts[i][0]) * cross;
    cy += (pts[j][1] + pts[i][1]) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function inradiusOf(pts, c) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ex = pts[i][0] - pts[j][0], ey = pts[i][1] - pts[j][1];
    best = Math.min(best, Math.abs((c[0] - pts[j][0]) * ey - (c[1] - pts[j][1]) * ex) / Math.hypot(ex, ey));
  }
  return best;
}

/* The corner angles of a tile, in order round it, in degrees. */
function anglesOf(pts) {
  const a = [];
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i], p = pts[(i + pts.length - 1) % pts.length], q = pts[(i + 1) % pts.length];
    let d = Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]);
    while (d < 0) d += TAU;
    a.push(Math.round(d * 180 / Math.PI));
  }
  return a;
}

/* Which pentagon a tile is. The Cairo and the prismatic have exactly the same
   angles — 90, 90, 120, 120, 120 — and are not told apart by them at all. What
   separates them is where the two right angles sit: side by side in the
   prismatic pentagon, held apart by a 120 in the Cairo one. The floret has no
   right angle at all, having a 60 instead. */
function pentagonKind(pts) {
  const a = anglesOf(pts);
  if (a.length !== 5) return 'not a pentagon';
  if (a.includes(60)) return 'floret';
  const right = a.map((v, i) => v === 90 ? i : -1).filter(i => i >= 0);
  if (right.length !== 2) return 'other';
  const gap = Math.abs(right[0] - right[1]);
  return (gap === 1 || gap === 4) ? 'prismatic' : 'Cairo';
}

/* Two tiles count as the same shape when their edges and their angles agree
   as multisets. Since the angles alone cannot separate Cairo from prismatic,
   it is the edges that do the work here. */
function shapeKey(pts) {
  const lens = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    lens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  lens.sort((x, y) => x - y);
  return lens.map(v => v.toFixed(2)).join(',') + '|' + anglesOf(pts).sort((x, y) => x - y).join(',');
}

/* =====================================================================
   4a. THE SHAPE OF A BOARD

   A rectangle is the obvious thing to cut a tiling to, and for a tiling
   laid out in rows and columns it is the right thing. The others each
   read better cut to a shape of their own — one that follows how the
   tiling is actually built rather than fighting it.

   A shape has two parts: where to centre it, and what region to keep.
   The region is written in lattice coordinates wherever the shape is
   meant to follow the tiling, so its sides land on the tiling's own
   lines instead of slicing across them.
   ===================================================================== */

// Who touches whom, over any list of tiles: by an edge, and by any corner.
function adjacencyOf(polys) {
  const topo = topology(polys);
  const m = polys.length;
  const byEdge = Array.from({ length: m }, () => new Set());
  for (const fl of topo.edgeMap.values())
    if (fl.length === 2) { byEdge[fl[0]].add(fl[1]); byEdge[fl[1]].add(fl[0]); }
  const byCorner = Array.from({ length: m }, () => new Set());
  for (const fl of topo.vertFaces.values()) {
    const around = [...new Set(fl)];
    for (const x of around) for (const y of around) if (x !== y) byCorner[x].add(y);
  }
  return { topo, byEdge, byCorner };
}

/* The floret tiling's six pentagons about a common corner are a flower, and a
   flower is the natural piece to build a board out of — a board that cut
   through one would leave a petal with nothing to belong to. Every pentagon has
   exactly one corner where six meet, so the flowers fall out as a clean
   partition rather than an overlapping cover. */
/* The 1:1 tiling reads as blocks of six with a flat top and a flat bottom.
   A row of it runs Cairo, prismatic, Cairo — a prismatic with one Cairo level
   on each side — and a block is two such rows, the lower set a little to the
   left of the upper. The two prismatics are consecutive along one of the
   zigzag chains, joined by the leaning step rather than the upright one.

   Not every prismatic has a Cairo on both sides. Those that do not are the
   fenceposts, and they are what runs down the seams between one column of
   blocks and the next; they belong to no block and are kept on their own. */
function blocks11(polys) {
  const { byCorner } = adjacencyOf(polys);
  const kind = polys.map(pentagonKind), mid = polys.map(centroidOf);

  const flank = i => {
    let L = -1, R = -1;
    for (const j of byCorner[i]) {
      if (kind[j] !== 'Cairo') continue;
      const dx = mid[j][0] - mid[i][0], dy = mid[j][1] - mid[i][1];
      if (Math.abs(dy) > 0.35 || Math.abs(dx) > 1.4) continue;
      if (dx < 0) L = j; else R = j;
    }
    return [L, R];
  };

  const wings = polys.map((p, i) => kind[i] === 'prismatic' ? flank(i) : [-1, -1]);
  const inBlock = wings.map(w => w[0] >= 0 && w[1] >= 0);
  const groups = [], taken = new Set();

  for (let i = 0; i < polys.length; i++) {
    if (!inBlock[i] || taken.has(i)) continue;
    for (const j of byCorner[i]) {
      if (j <= i || !inBlock[j] || taken.has(j)) continue;
      const dx = mid[j][0] - mid[i][0], dy = mid[j][1] - mid[i][1];
      if (Math.abs(dx) < 0.25 || Math.abs(dx) > 0.8) continue;   // the upright step, not this one
      if (Math.abs(dy) < 0.6 || Math.abs(dy) > 1.2) continue;
      groups.push([i, j, ...wings[i], ...wings[j]]);
      taken.add(i); taken.add(j);
      break;
    }
  }
  // the fenceposts, and anything the rim left without a partner, stand alone
  const held = new Set();
  for (const g of groups) for (const c of g) held.add(c);
  for (let i = 0; i < polys.length; i++) if (!held.has(i)) groups.push([i]);
  return groups;
}

function floretsOf(polys) {
  const { topo } = adjacencyOf(polys);
  const groups = [];
  for (const fl of topo.vertFaces.values()) {
    const around = [...new Set(fl)];
    if (around.length === 6) groups.push(around);
  }
  return groups;
}

// A point in lattice coordinates: p = a*v1 + b*v2.
function latticeCoords(src) {
  const [ax, ay] = src.v1, [bx, by] = src.v2;
  const det = ax * by - ay * bx;
  return (x, y) => [(x * by - y * bx) / det, (ax * y - ay * x) / det];
}

/* The tiling's own repeating unit, as a grouping of tiles. Which unit a tile
   belongs to is settled by where its middle falls in the lattice — but the
   lattice has no preferred origin, and the wrong one slices every unit in
   two, so the origin is searched for: the one that leaves the most units
   whole is the one the tiling meant. Some boxes are asked to be more than
   one unit across, which is what mul is for.

   A box is measured in whole tiles, so this is also what the boxed law will
   want when it comes to be written. */
const cellKey = p => {
  const c = centroidOf(p);
  return Math.round(c[0] * 200) + ',' + Math.round(c[1] * 200);
};

function tilesPerUnit(src, mul) {
  const area = Math.abs(src.v1[0] * src.v2[1] - src.v1[1] * src.v2[0]);
  return Math.max(1, Math.round(src.density * area)) * (mul ? mul[0] * mul[1] : 1);
}

function unitCellsOf(polys, src, per, mul) {
  const [m1, m2] = mul || [1, 1];
  const toAB = latticeCoords(src);
  const ab = polys.map(p => {
    const c = centroidOf(p);
    const [a, b] = toAB(c[0], c[1]);
    return [a / m1, b / m2];
  });
  let best = null;
  for (let oa = 0; oa < 8; oa++) for (let ob = 0; ob < 8; ob++) {
    const g = new Map();
    for (let i = 0; i < ab.length; i++) {
      const k = Math.floor(ab[i][0] + oa / 8 + 1e-6) + ':' + Math.floor(ab[i][1] + ob / 8 + 1e-6);
      let v = g.get(k); if (!v) g.set(k, v = []);
      v.push(i);
    }
    let whole = 0;
    for (const v of g.values()) if (v.length === per) whole++;
    if (!best || whole > best.whole) best = { whole, groups: g };
  }
  return best.groups;
}

/* A board drawn to look right will cut some units in half, because the units
   were there first. A unit that kept half its tiles or more is taken entire
   and one that kept fewer is let go — which holds the size near the one asked
   for, rather than always growing the board or always trimming it. */
function unitsOver(t, patch, per) {
  const groups = unitCellsOf(patch, t.src, per);
  const home = new Map();
  for (const [k, g] of groups) for (const i of g) home.set(cellKey(patch[i]), k);
  return { groups, home, patch, per };
}

function wholeUnits(u, kept, need) {
  const want = need || Math.ceil(u.per / 2);
  const count = new Map();
  for (const p of kept) {
    const k = u.home.get(cellKey(p));
    if (k !== undefined) count.set(k, (count.get(k) || 0) + 1);
  }
  const out = [];
  for (const [k, c] of count) {
    const g = u.groups.get(k);
    // a unit the patch itself ran out before finishing is no use to anyone
    if (g.length === u.per && c >= want) for (const i of g) out.push(u.patch[i]);
  }
  return out;
}

/* The boxes of the board in play: which cells make up each copy of the repeat,
   and which box a cell belongs to. Worked out once when the board is built,
   since the laying, the checking, the deducing and the drawing all want it. */
let boxes = [], boxOf = null, boxMid = [], boxTop = [], boxShown = null;
/* What each box says about itself: a number, and how to read it. An empty
   relation means the number is exact; otherwise the number is a floor or a
   ceiling and the box may hold more, or fewer. */
let boxRel = [];
/* A box may keep its number to itself, the way a cell can. It still holds
   what it holds; it simply does not say so. */
let boxMuted = null;
let boxSrc = null;             // the lattice as the board is actually stood

/* Boxes of no fixed shape: the board grown into connected patches of a few
   cells apiece, each its own size and outline. Where the boxes are copies of
   the tiling's repeat their shape tells the player nothing, so the whole clue
   is the number; here the shape is part of the puzzle too. */
function irregularBoxes() {
  const own = new Int32Array(n).fill(-1);
  const groups = [];
  const order = [...Array(n).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  for (const seed of order) {
    if (own[seed] >= 0) continue;
    const want = 3 + Math.floor(Math.random() * 5);      // three cells to seven
    const g = [seed];
    own[seed] = groups.length;
    while (g.length < want) {
      const opts = [];
      for (const c of g) for (const j of edgOf(c)) if (own[j] < 0) opts.push(j);
      if (!opts.length) break;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      own[pick] = groups.length; g.push(pick);
    }
    groups.push(g);
  }
  // a patch left too small to be worth a clue is folded into a neighbour
  for (let b = 0; b < groups.length; b++) {
    if (groups[b].length >= 2) continue;
    const c = groups[b][0];
    let into = -1;
    for (const j of edgOf(c)) if (own[j] >= 0 && own[j] !== b) { into = own[j]; break; }
    if (into < 0) continue;
    groups[into].push(c); own[c] = into; groups[b] = [];
  }
  return groups.filter(g => g.length);
}

function findBoxes() {
  if (boxLaw() === 'irregular') { boxes = irregularBoxes(); return finishBoxes(true); }
  const per = tilesPerUnit(tiling.src, tiling.boxMul);
  const groups = unitCellsOf(poly, boxSrc || tiling.src, per, tiling.boxMul);
  boxes = [...groups.values()].filter(g => g.length === per);
  return finishBoxes(false);
}

function finishBoxes(irregular) {
  boxOf = new Int32Array(n).fill(-1);
  boxes.forEach((g, b) => { for (const i of g) boxOf[i] = b; });
  // straight off the polygons, since the cell middles are not worked out yet
  boxMid = boxes.map(g => {
    let x = 0, y = 0;
    for (const i of g) { const c = centroidOf(poly[i]); x += c[0]; y += c[1]; }
    return [x / g.length, y / g.length];
  });
  /* A box wears its number at its highest corner rather than in its middle.
     A corner is where cells meet, so it is about as far from any cell's own
     number as a point can be — measured across the six tilings it keeps three
     fifths of a cell's width clear, where the middle of a twelve-cell box can
     come within a third. Drawing it downwards from there puts the figure
     inside the box it belongs to.

     Every box is a copy of the same repeat, so the number belongs in the same
     place in each. Picking the highest corner box by box looks the same until
     two corners come out level — a floret's do — and then the choice falls to
     rounding and the labels wander from one side to the other. So the offset
     is settled once, on the box nearest the middle of the board, and every
     box wears its number at that same remove from its own centre. */
  boxTop = [];
  if (irregular) {
    // no two boxes are alike, so each finds its own highest corner
    boxTop = boxes.map(g => {
      let top = null;
      for (const i of g) for (const q of poly[i])
        if (!top || q[1] < top[1] - 1e-6 ||
            (Math.abs(q[1] - top[1]) <= 1e-6 && q[0] < top[0])) top = q;
      return top;
    });
  } else if (boxes.length) {
    let cx = 0, cy = 0;
    for (const m of boxMid) { cx += m[0]; cy += m[1]; }
    cx /= boxMid.length; cy /= boxMid.length;
    let ref = 0, near = Infinity;
    boxMid.forEach((m, b) => {
      const d = Math.hypot(m[0] - cx, m[1] - cy);
      if (d < near) { near = d; ref = b; }
    });
    let top = null;
    for (const i of boxes[ref]) for (const q of poly[i])
      if (!top || q[1] < top[1] - 1e-6 ||
          (Math.abs(q[1] - top[1]) <= 1e-6 && q[0] < top[0])) top = q;
    const dx = top[0] - boxMid[ref][0], dy = top[1] - boxMid[ref][1];
    boxTop = boxMid.map(m => [m[0] + dx, m[1] + dy]);
  }
  boxShown = null;
  boxMuted = new Uint8Array(boxes.length);
}

/* How many mines a box may hold, by the number of cells in it. The floor sits
   a little under what a board of this density would put there by chance and
   the ceiling a little over, so that each bites about as often as the other.
   Boxed 1 keeps only the floor, boxed 2 only the ceiling, boxed 3 both. */
const BOXRULE = { 4: [1, 2], 6: [2, 3], 8: [2, 4], 12: [3, 5] };

function boxBounds() {
  const per = boxes.length ? boxes[0].length : 0;
  const r = BOXRULE[per] ||
    [Math.max(1, Math.round(per * 0.25)), Math.max(1, Math.round(per * 0.45))];
  const law = boxLaw();
  return { per, lo: law === 'ceiling' ? 0 : r[0], hi: law === 'floor' ? per : r[1] };
}

function regionOf(t) {
  const kind = (t.region || {}).kind || 'rect';

  /* A ball of whole flowers about the centre one. With the lattice vectors
     sixty degrees apart, a, b are the usual hexagonal coordinates: the six
     nearest flowers are v1, v2 and v1-v2 with their opposites, and the ball of
     radius R is where none of a, b and a+b exceeds it. Bounding a-b instead
     would let two of the six corners run out to R(v1+v2), which is half as far
     again, and the hexagon would come out a lozenge. */
  /* A ball is round, so it takes its size straight from the parameter, counted
     in flowers, and pays no attention to how the board was asked for in across
     and down. Sizing it off the shorter side would stop a wide board ever
     growing past the height it was given. */
  if (kind === 'hex') {
    const toAB = latticeCoords(t.src);
    return (x, y, R) => {
      const [a, b] = toAB(x, y);
      return Math.abs(a) <= R && Math.abs(b) <= R && Math.abs(a + b) <= R;
    };
  }

  /* A square counted along the lattice. This tiling's lattice is square and
     stands at forty-five degrees, so that reads on the page as a diamond, and
     its edges follow the tiling's own lines. The two bounds have to be equal:
     a mirror down the middle of the page carries the lattice (a, b) to (-b, -a),
     swapping the two, so any board bounding them differently comes out lopsided
     — heavy at two opposite corners and light at the other two. */
  if (kind === 'lsq') {
    const toAB = latticeCoords(t.src);
    /* The slack matters, and it has to be generous. Two tiles that answer to
       each other across the mirror have their a and b swapped, so they stand or
       fall together — but this tiling's unit cell is written down to four
       decimal places, so they agree only to about that. A bound landing between
       them takes one and drops the other, which is how a board loses two cells
       out of sixty-four and its symmetry with them. The gap between one lattice
       coordinate and the next is nearer a third, so there is room to be loose. */
    return (x, y, A) => {
      const [a, b] = toAB(x, y);
      return Math.abs(a) <= A + 2e-3 && Math.abs(b) <= A + 2e-3;
    };
  }

  /* A plain rectangle, but taking a tile when its centre is inside rather than
     when the whole of it is. Insisting on the whole tile shaves a half-cell off
     every side and leaves the edge ragged; going by the centre keeps the rows
     full and lets the tiles overhang, which is what the edge of this tiling
     looks like anyway. */
  if (kind === 'boxCentre')
    return (x, y, hx, hy) => Math.abs(x) <= hx && Math.abs(y) <= hy;

  // A diamond, squared up to the screen rather than to the lattice.
  if (kind === 'diamond')
    return (x, y, hx, hy) => Math.abs(x) / hx + Math.abs(y) / hy <= 1;

  return (x, y, hx, hy) => Math.abs(x) <= hx && Math.abs(y) <= hy;
}

/* Where to put the middle. Some shapes want a particular feature of the tiling
   at their centre rather than whatever the generator happened to leave at the
   origin, so the whole patch is slid until that feature is there.

   Only the tiles near the origin are searched. Whatever is being looked for
   repeats every unit cell, so it is certainly among them, and searching the
   whole patch instead would cost a great deal for no better answer. */
function anchorOf(t, polys) {
  const want = (t.region || {}).anchor;
  if (!want) return [0, 0];

  const reach = 2.5 * t.src.pitch;
  const near = polys.filter(p => {
    const c = centroidOf(p);
    return Math.hypot(c[0], c[1]) < reach;
  });

  if (want === 'sixfold') {
    // the corner nearest the middle where six tiles meet: a flower's hub
    const topo = topology(near);
    let best = null;
    for (const [vid, fl] of topo.vertFaces) {
      if (new Set(fl).size !== 6) continue;
      const p = topo.pts[vid], d = Math.hypot(p.x, p.y);
      if (!best || d < best.d) best = { d, at: [p.x, p.y] };
    }
    return best ? best.at : [0, 0];
  }

  if (want === 'prismaticPair') {
    /* The middle of the upright edge shared by two prismatic pentagons. In this
       tiling the prismatic pentagons come in pairs, and half of those pairs are
       joined along an upright edge — that join is the centre of the diamond. */
    const p2 = near.filter(p => pentagonKind(p) === 'prismatic');
    let best = null;
    for (let i = 0; i < p2.length; i++)
      for (let j = i + 1; j < p2.length; j++) {
        const shared = p2[i].filter(p =>
          p2[j].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3));
        if (shared.length !== 2 || Math.abs(shared[0][0] - shared[1][0]) > 1e-3) continue;
        const at = [(shared[0][0] + shared[1][0]) / 2, (shared[0][1] + shared[1][1]) / 2];
        const d = Math.hypot(at[0], at[1]);
        if (!best || d < best.d) best = { d, at };
      }
    return best ? best.at : [0, 0];
  }

  return [0, 0];
}

// A coarse grid over the board, so that finding the cell under a point does
// not mean testing every cell on it.
let buckets = null, bucketSize = 1, bx0 = 0, by0 = 0, bw = 0, bh = 0;

/* A parallelogram counted out in whole unit cells rather than cut from the
   plane. Cutting leaves the rows that meet the edge short — one board came out
   with a top row of seven where every other row held fifteen — but a whole
   number of unit cells across by a whole number down gives rows that all end
   together, which is what a parallelogram ought to look like.

   Any consistent choice of unit parallelogram partitions the tiles between
   them, so the count per cell is fixed and the total comes out exact. The
   offset only keeps the dividing lines off the tile centres, where a rounding
   could otherwise fall either way. */
function paraBoard(t, across, down) {
  const cp = 1 / Math.sqrt(t.src.density);
  const area = Math.abs(t.src.v1[0] * t.src.v2[1] - t.src.v1[1] * t.src.v2[0]);
  const per = Math.max(1, Math.round(t.src.density * area));       // tiles per unit cell
  const nb = Math.max(1, Math.round(down * cp / Math.abs(t.src.v2[1])));
  const na = Math.max(1, Math.round(across * down / (nb * per)));

  const toAB = latticeCoords(t.src);
  // the parallelogram is centred, so its reach is half its diagonal
  const reach = (na * Math.hypot(...t.src.v1) + nb * Math.hypot(...t.src.v2)) / 2 + 3 * cp;
  const raw = t.src.raw(reach);
  const off = anchorOf(t, raw);
  const all = (off[0] || off[1]) ? raw.map(p => translate(p, -off[0], -off[1])) : raw;

  const a0 = -na / 2, b0 = -nb / 2, eps = 0.137;
  const keep = [];
  for (const p of all) {
    const c = centroidOf(p);
    const [a, b] = toAB(c[0], c[1]);
    const ia = Math.floor(a - a0 + eps), ib = Math.floor(b - b0 + eps);
    if (ia >= 0 && ia < na && ib >= 0 && ib < nb) keep.push(p);
  }
  return keep;
}

/* The prismatic tiling comes in flat rows, and its rows fall into pairs: two
   rows share a left edge, then the next two start half a cell further right,
   and so on down. So a board is counted out in rows — so many cells along each,
   so many rows down — with the left edge stepping half a cell every second row.
   Cutting to a shape instead leaves rows ending short of one another, and
   grouping by unit cell pairs the rows across the wrong boundary. */
function rowBoard(t, across, down) {
  const cp = 1 / Math.sqrt(t.src.density);
  const reach = (across + down) * cp;
  const all = t.src.raw(reach);

  const rows = new Map();
  for (const p of all) {
    const c = centroidOf(p);
    const k = Math.round(c[1] * 1000) / 1000;
    let w = rows.get(k); if (!w) rows.set(k, w = []);
    w.push({ p, x: c[0] });
  }
  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  for (const r of ordered) r.sort((a, b) => a.x - b.x);

  /* A pair starts where two rows running share a left edge. Stepping starts on
     one of those, so that the two rows of every pair come out level. */
  const phase = r => Math.abs(r[0].x - Math.round(r[0].x)) < 0.25 ? 0 : 1;
  let start = Math.max(0, Math.floor((ordered.length - down) / 2));
  while (start + 1 < ordered.length && phase(ordered[start]) !== phase(ordered[start + 1])) start++;

  const mid = ordered[start + Math.floor(down / 2)] || ordered[start];
  const base = mid[Math.max(0, Math.floor((mid.length - across) / 2))].x
             - 0.5 * Math.floor(down / 2 / 2);

  const keep = [];
  for (let i = 0; i < down; i++) {
    const r = ordered[start + i];
    if (!r) break;
    const left = base + 0.5 * Math.floor(i / 2);
    const run = r.filter(c => c.x > left - 0.25);
    for (const c of run.slice(0, across)) keep.push(c.p);
  }
  return keep;
}

/* Rings of whole unit cells about a middle one. The 2:1 tiling's lattice is
   square and stands at forty-five degrees, so a ring of unit cells reads on the
   page as a diamond, and taking whole rings means the board grows evenly all
   round and its edge never cuts a repeat in half. The count is whatever a whole
   number of rings comes to, which is the point of counting them. */
function ringBoard(t, rings) {
  const cp = 1 / Math.sqrt(t.src.density);
  const step = Math.max(Math.hypot(...t.src.v1), Math.hypot(...t.src.v2));
  const raw = t.src.raw((rings + 1.5) * step + 2 * cp);
  const off = anchorOf(t, raw);
  const all = (off[0] || off[1]) ? raw.map(p => translate(p, -off[0], -off[1])) : raw;

  const toAB = latticeCoords(t.src);
  const keep = [];
  for (const p of all) {
    const c = centroidOf(p);
    const [a, b] = toAB(c[0], c[1]);
    const ia = Math.round(a), ib = Math.round(b);
    if (Math.max(Math.abs(ia), Math.abs(ib)) <= rings) keep.push(p);
  }

  /* A tile sitting all but exactly on the line between two unit cells can round
     to the wrong side of it — this tiling is written down to four decimal
     places, so a tile and its reflection do not agree to better than that. The
     board is evened up afterwards, which puts any such stray back. */
  const seen = new Set(keep.map(p => {
    const c = centroidOf(p); return Math.round(c[0] * 200) + ',' + Math.round(c[1] * 200);
  }));
  for (const p of all) {
    const c = centroidOf(p);
    const me = Math.round(c[0] * 200) + ',' + Math.round(c[1] * 200);
    const mirror = Math.round(-c[0] * 200) + ',' + Math.round(c[1] * 200);
    if (!seen.has(me) && seen.has(mirror)) { keep.push(p); seen.add(me); }
  }
  return keep;
}

/* Some tilings are best described by walking them rather than by cutting a
   shape out of them. A row is a run of cells each a fixed step from the last,
   and the row below starts one further step from the row above — and since
   neither step is along a line of the page, no region drawn on the page picks
   them out. So the board is walked: `across` cells along each row, `down` rows
   down, following the tiling from cell to cell.

   Each step is given as the window its move falls in, [dx from, dx to, dy from,
   dy to], and only one neighbour of a cell ever lies in it. Walking the same
   windows backwards from the middle is what puts the first cell of the first
   row where the board comes out centred. */
function walkBoard(t, across, down, spec) {
  /* A row ought to finish on the same kind of cell it began on — a prismatic at
     both ends of the 1:1's rows, a Cairo at both ends of the 3-uniform's. The
     kinds repeat every second cell along the one and every third along the
     other, so only some widths close the pattern, and the width asked for is
     nudged to the nearest that does. */
  if (spec.period) across = Math.max(spec.period + 1,
    Math.round((across - 1) / spec.period) * spec.period + 1);

  const cp = 1 / Math.sqrt(t.src.density);
  /* The walk starts in the middle and goes at most half the cells each way, and
     no step covers much more than one cell, so this reaches comfortably past
     the furthest corner without generating a patch four times the size. */
  const all = t.src.raw((across + down) / 2 * 1.15 * cp + 4 * cp);
  const { byCorner } = adjacencyOf(all);
  const mid = all.map(centroidOf), kind = all.map(pentagonKind);

  const move = (i, w) => {
    for (const j of byCorner[i]) {
      const dx = mid[j][0] - mid[i][0], dy = mid[j][1] - mid[i][1];
      if (dx >= w[0] && dx <= w[1] && dy >= w[2] && dy <= w[3]) return j;
    }
    return -1;
  };
  const back = w => [-w[1], -w[0], -w[3], -w[2]];

  /* Which cell a board opens on is not just a matter of its kind. Going down,
     the step to the next row alternates between a leaning one and an upright
     one, so cells of the one kind come in two phases, and the two are the same
     pentagon stood a different way up. A board begun on the wrong phase has the
     right pattern of kinds and every tile turned the other way. `open` is the
     step the first row must be able to take, which picks the phase out. */
  const rightPhase = i => kind[i] === spec.start
    && (!spec.open || move(i, spec.open) >= 0)
    && (!spec.first || move(i, spec.first) >= 0);

  let seed = -1, bd = Infinity;
  for (let i = 0; i < all.length; i++) {
    if (!rightPhase(i)) continue;
    const d = Math.hypot(mid[i][0], mid[i][1]);
    if (d < bd) { bd = d; seed = i; }
  }
  if (seed < 0) return [];

  let corner = seed;
  for (let k = 0; k < Math.floor(down / 2); k++) {
    const j = move(corner, back(spec.drop)); if (j < 0) break; corner = j;
  }
  for (let k = 0; k < Math.floor(across / 2); k++) {
    const j = move(corner, back(spec.step)); if (j < 0) break; corner = j;
  }

  /* Walking back lands wherever the counting leaves it, which need not be the
     kind of cell a row is meant to open on — the kinds repeat every two cells
     along one of these rows and every three along the other, so half the sizes
     would start a row in the middle of its pattern. Stepping on until the kind
     comes right sets every row's opening straight, since the move to the next
     row keeps to the one kind. */
  for (let k = 0; k < 8 && !rightPhase(corner); k++) {
    const j = move(corner, spec.step); if (j < 0) break; corner = j;
  }

  const keep = [];
  let rowStart = corner;
  for (let r = 0; r < down && rowStart >= 0; r++) {
    let c = rowStart;
    for (let s = 0; s < across && c >= 0; s++) { keep.push(all[c]); c = move(c, spec.step); }
    rowStart = move(rowStart, spec.drop);
  }
  return keep;
}

function buildBoard(t, across, down) {
  tiling = t;

  /* Some of these tilings read far better stood at an angle — turned so that
     a row of cell middles runs level rather than uphill. The 1:1 wants three
     quarters of a right angle and the 2:1 half of one; measured, that takes
     the 1:1 from a hundred and thirty ragged rows to thirty-two of exactly
     eight.

     The turn comes at the end, once the board has been cut, so that the walk
     windows and the region rules keep the frame they were written in. Two
     things have to be squared with it. A board cut to a rectangle is cut in
     the turned frame, or a wide board would come out a diamond. And a walked
     board turned most of a right angle is asked for the other way about, or
     a long board would come out a tall one. */
  const spin = t.spin || 0;
  const spinC = Math.cos(spin), spinS = Math.sin(spin);
  const turn = q => [q[0] * spinC - q[1] * spinS, q[0] * spinS + q[1] * spinC];
  /* A walk counts its cells along a row and its rows across the board, but
     which way a row runs is the tiling's business, not the board's: the 1:1's
     rows go across the page and the 3-uniform's go down it, and turning them
     moves both again. So the step is taken as it will finally lie, and where
     it runs down rather than across, the two sides asked for are swapped —
     otherwise a board asked to be long comes back tall. */
  const stepWin = (t.region || {}).step;
  if (stepWin) {
    const [dx, dy] = turn([(stepWin[0] + stepWin[1]) / 2, (stepWin[2] + stepWin[3]) / 2]);
    if (Math.abs(dy) > Math.abs(dx)) { const swap = across; across = down; down = swap; }
  }

  cellPitch = 1 / Math.sqrt(t.src.density);          // mean width of a cell
  const want = across * down;
  const hx = across * cellPitch / 2, hy = down * cellPitch / 2;
  const kind = (t.region || {}).kind || 'rect';

  if (kind === 'walk') {
    /* A walked board counts cells along its rows, which knows nothing of where
       the tiling's units begin and end, so it is snapped to whole ones after
       the fact. The patch has to reach past the board, since a unit the walk
       cut short is completed out of it.

       Snapping only ever takes or leaves whole units, so a board asked for in
       rows and columns lands where it lands. A few sizes about the one asked
       for are walked and the nearest kept, which stops a board of sixty-four
       coming back half as big again. */
    const snap = raw => {
      if (!(t.region || {}).units || !raw.length) return raw;
      let span = 0;
      for (const p of raw) for (const q of p)
        span = Math.max(span, Math.abs(q[0]), Math.abs(q[1]));
      const u = unitsOver(t, t.src.raw(span + 3 * cellPitch), tilesPerUnit(t.src));
      /* How much of a unit the walk had to cover for it to be taken decides
         how far the rim reaches, so it is swept from a single tile up to the
         whole unit and whichever setting lands nearest the size asked for is
         kept. One walk, and the sizing costs only a regrouping apiece. */
      let out = [];
      for (let need = 1; need <= u.per; need++) {
        const got = wholeUnits(u, raw, need);
        if (got.length && (!out.length ||
            Math.abs(got.length - want) < Math.abs(out.length - want))) out = got;
      }
      return out;
    };
    poly = snap(walkBoard(t, across, down, t.region));
    n = poly.length;
  } else if (kind === 'rings') {
    /* Whichever whole number of rings comes nearest the size asked for. A ring
       of this lattice is twelve cells to a unit and the rings go 1, 9, 25 units,
       so the sizes it can take are far apart — which is why these boards are
       better spoken of as small, medium and large than as a count. */
    const per = Math.max(1, Math.round(t.src.density *
      Math.abs(t.src.v1[0] * t.src.v2[1] - t.src.v1[1] * t.src.v2[0])));
    let best = 1;
    for (let r = 1; r <= 8; r++)
      if (Math.abs((2 * r + 1) ** 2 * per - want) < Math.abs((2 * best + 1) ** 2 * per - want)) best = r;
    poly = ringBoard(t, best);
    n = poly.length;
  } else if (kind === 'rows') {
    poly = rowBoard(t, across, down);
    n = poly.length;
  } else if (kind === 'para') {
    poly = paraBoard(t, across, down);
    n = poly.length;
  } else {

  /* Only tiles falling wholly inside the region are kept, which costs about
     half a cell all the way round, and a shape that is not a rectangle needs
     more room again to hold the same number of cells. So the region is grown
     until the count lands on the size wanted. The patch is generated once and
     only the clipping is repeated, which is cheap enough to bisect on.

     A plain rectangle is sized by a margin added all round, which is what it
     always was; the shaped boards scale instead, since adding the same margin
     to both sides of a long board would quietly change its proportions. */
  const byMargin = kind === 'rect', byRadius = kind === 'hex' || kind === 'lsq';
  // a square counted in lattice steps is judged by where a tile sits, not by
  // where its corners reach, so that the bound stays exactly symmetric
  const byCentre = kind === 'lsq' || kind === 'boxCentre';
  const area = Math.abs(t.src.v1[0] * t.src.v2[1] - t.src.v1[1] * t.src.v2[0]);
  const per = Math.max(1, Math.round(t.src.density * area));        // tiles per unit cell
  // a ball of R flowers holds 3R^2+3R+1 of them, so this is the radius that
  // could hold the board asked for, with a ring or two in hand
  const rMax = Math.ceil(Math.sqrt(want / (3 * per))) + 2;

  const KLO = byMargin ? -cellPitch : byRadius ? 0.4 : 0.2;
  const KHI = byMargin ? 1.5 * cellPitch : byRadius ? rMax : 1.7;
  const extents = k => byMargin ? [hx + k, hy + k] : byRadius ? [k, k] : [hx * k, hy * k];

  const spanOf = k => byRadius
    ? k * Math.max(Math.hypot(...t.src.v1), Math.hypot(...t.src.v2))
    : Math.max(...extents(k));
  const all0 = t.src.raw(spanOf(KHI) + 2 * cellPitch);
  const off = anchorOf(t, all0);
  const all = (off[0] || off[1]) ? all0.map(p => translate(p, -off[0], -off[1])) : all0;

  const inside = regionOf(t);
  const fits = (p, k) => {
    const [ex, ey] = extents(k);
    // judged in the frame the board will be seen in, not the one it was built in
    if (byCentre) { const c = turn(centroidOf(p)); return inside(c[0], c[1], ex, ey); }
    return p.every(q => inside(q[0], q[1], ex + 1e-6, ey + 1e-6));
  };

  /* Most shapes keep a tile if the tile fits. A tiling built out of blocks
     instead keeps a block only if the whole block fits, and then keeps every
     tile of it, so that no tile is ever left without the rest of its group. */
  const grouper = (t.region || {}).groups;
  const blocks = grouper === 'florets' ? floretsOf(all)
               : grouper === 'blocks11' ? blocks11(all) : null;

  /* A board asked to be even about the middle is made so outright, by taking in
     any tile whose reflection is already in. Leaving it to the bound does not
     work: reflected tiles ought to agree exactly, but this tiling is written
     down to four decimal places and they come out a couple of ten-thousandths
     apart — enough for a bound to fall between a tile and its reflection and
     drop one of the pair. */
  const evenUp = (t.region || {}).even;
  const centreKey = c => Math.round(c[0] * 200) + ',' + Math.round(c[1] * 200);
  const symmetrise = kept => {
    if (!evenUp) return kept;
    const have = new Set(kept.map(p => centreKey(centroidOf(p))));
    const out = kept.slice();
    for (const p of all) {
      const c = centroidOf(p);
      if (have.has(centreKey(c))) continue;
      if (have.has(centreKey([-c[0], c[1]]))) { out.push(p); have.add(centreKey(c)); }
    }
    return out;
  };

  /* Snapping to whole units is folded into the sizing rather than done after
     it, so that the search for a size lands on what the board will really
     hold. The units are worked out once, since the patch does not change. */
  const units = (t.region || {}).units ? unitsOver(t, all, per) : null;
  const keptAt = k => {
    let kept;
    if (!blocks) kept = symmetrise(all.filter(p => fits(p, k)));
    else {
      const keep = new Set();
      for (const g of blocks) if (g.every(i => fits(all[i], k))) for (const i of g) keep.add(i);
      kept = symmetrise([...keep].sort((a, b) => a - b).map(i => all[i]));
    }
    return units ? wholeUnits(units, kept) : kept;
  };
  const countAt = k => keptAt(k).length;

  let lo = KLO, hi = KHI;
  if (countAt(hi) >= want)
    for (let it = 0; it < 34; it++) {
      const mid = (lo + hi) / 2;
      if (countAt(mid) < want) lo = mid; else hi = mid;
    }

  /* A board of whole blocks can only come in the sizes its blocks allow, and
     the nearest of those is better than the smallest one that will do — a ring
     of flowers is thirty-six cells, and always rounding up would hand back a
     board half as big again as the one asked for. A plain rectangle keeps the
     old rule, which is to take the first size that holds enough. */
  poly = keptAt((blocks || units) &&
    Math.abs(countAt(lo) - want) < Math.abs(countAt(hi) - want) ? lo : hi);
  n = poly.length;

  }

  if (spin) poly = poly.map(pg => pg.map(turn));
  /* The boxes are found by where a tile sits in the lattice, so the lattice
     has to be turned with the tiles. */
  boxSrc = spin ? { v1: turn(t.src.v1), v2: turn(t.src.v2), density: t.src.density } : t.src;

  // who touches whom
  const { topo, byEdge, byCorner } = adjacencyOf(poly);
  [nbOffC, nbAllC] = pack(byCorner);
  [nbOffE, nbAllE] = pack(byEdge);

  /* The boxes come after that, not before: an irregular cut is grown from
     cell to cell along their shared edges, so it needs to know which cells
     those are. A cut made first walks the last board's neighbours. */
  findBoxes();
  boxSeg = null;                 // a new board wants its boxes drawn afresh

  /* A corner is complete when the tiles at it come to a full turn, and a cell
     is off the rim when every one of its corners is. Only those cells have the
     neighbourhood the tiling really gives — the rest are cut short by the edge
     of the board, and it would be the board talking, not the tiling. */
  const closed = new Set();
  for (const [vid, fl] of topo.vertFaces) {
    let sum = 0;
    for (const fi of [...new Set(fl)]) sum += angleAt(topo.faces[fi], vid);
    if (Math.abs(sum - TAU) < 1e-6) closed.add(vid);
  }
  interior = topo.faces.map(f => f.v.every(v => closed.has(v)));

  // shapes, centres and room for a glyph
  const keys = new Map();
  mids = new Array(n); inr = new Array(n); shapeOf = new Array(n);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    mids[i] = centroidOf(poly[i]);
    inr[i] = inradiusOf(poly[i], mids[i]);
    const k = shapeKey(poly[i]);
    if (!keys.has(k)) keys.set(k, keys.size);
    shapeOf[i] = keys.get(k);
    for (const q of poly[i]) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
  }
  shapeCount = keys.size;
  bounds = { x0, y0, w: x1 - x0, h: y1 - y0 };

  // the lookup grid
  bucketSize = cellPitch;
  bx0 = x0; by0 = y0;
  bw = Math.max(1, Math.ceil(bounds.w / bucketSize) + 1);
  bh = Math.max(1, Math.ceil(bounds.h / bucketSize) + 1);
  buckets = Array.from({ length: bw * bh }, () => []);
  for (let i = 0; i < n; i++) {
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (const q of poly[i]) {
      a0 = Math.min(a0, q[0]); a1 = Math.max(a1, q[0]);
      b0 = Math.min(b0, q[1]); b1 = Math.max(b1, q[1]);
    }
    for (let gx = Math.floor((a0 - bx0) / bucketSize); gx <= Math.floor((a1 - bx0) / bucketSize); gx++)
      for (let gy = Math.floor((b0 - by0) / bucketSize); gy <= Math.floor((b1 - by0) / bucketSize); gy++)
        if (gx >= 0 && gx < bw && gy >= 0 && gy < bh) buckets[gy * bw + gx].push(i);
  }
}

function pack(sets) {
  const off = new Int32Array(sets.length + 1);
  for (let i = 0; i < sets.length; i++) off[i + 1] = off[i] + sets[i].size;
  const all = new Int32Array(off[sets.length]);
  let w = 0;
  for (const s of sets) for (const v of s) all[w++] = v;
  return [off, all];
}

function useCorners(on) {
  nbOff = on ? nbOffC : nbOffE;
  nbAll = on ? nbAllC : nbAllE;
}

// The two neighbourhoods by name, whatever the game is currently using —
// the rulesets speak of edges and corners each in their own right.
const corOf = i => nbAllC.subarray(nbOffC[i], nbOffC[i + 1]);
const edgOf = i => nbAllE.subarray(nbOffE[i], nbOffE[i + 1]);
