// Headless cuboid state engine — prototype for the hover-state feature.
// Models the PHYSICAL puzzle at the cubie level with exact integer arithmetic.
// No dependencies: run with `node sim-proto.js`.
//
// Coordinates: right-handed, x = right, y = up, z = front (toward viewer).
// Doubled-integer lattice: a w×h×d puzzle has centers at odd/even integers so
// every 90° rotation stays exact. A cubie of side 2 sits at each center.

// ---------- colour scheme ----------
const COLORS = {
  '+x': 'Red',    // Right
  '-x': 'Orange', // Left
  '+y': 'White',  // Up
  '-y': 'Yellow', // Down
  '+z': 'Green',  // Front
  '-z': 'Blue',   // Back
};
const DIRS = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

// ---------- integer linear algebra ----------
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const matVec = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const transpose = (M) => [0, 1, 2].map(i => [M[0][i], M[1][i], M[2][i]]);
const matMul = (A, B) => {
  const Bt = transpose(B);
  return A.map(row => Bt.map(col => dot(row, col)));
};
const vecEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const matEq = (A, B) => A.every((r, i) => vecEq(r, B[i]));

// +90° rotation matrices about each principal axis.
const P = {
  x: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  y: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  z: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
};
const matPow = (M, e) => e === 1 ? M : e === -1 ? transpose(M) : matMul(M, M); // e ∈ {1,-1,2}

// ---------- move geometry ----------
const AXIS = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };
const IDX = { x: 0, y: 1, z: 2 };
const POSITIVE = new Set(['R', 'U', 'F']); // named face sits on the + end of its axis
// A plain (mod '') outer turn is clockwise viewed from that face; clockwise from
// the + end is a −90° rotation, from the − end a +90° rotation.
const BASE_SIGN = (face) => POSITIVE.has(face) ? -1 : 1;

// ---------- build & moves ----------
const span = (n) => Array.from({ length: n }, (_, i) => -(n - 1) + 2 * i); // doubled centers

function buildSolved(w, h, d) {
  const xs = span(w), ys = span(h), zs = span(d);
  const [xmax, xmin] = [Math.max(...xs), Math.min(...xs)];
  const [ymax, ymin] = [Math.max(...ys), Math.min(...ys)];
  const [zmax, zmin] = [Math.max(...zs), Math.min(...zs)];
  const cubies = [];
  for (const x of xs) for (const y of ys) for (const z of zs) {
    const stickers = {}; // keyed by LOCAL face dir (== world dir while solved)
    if (x === xmax) stickers['+x'] = COLORS['+x'];
    if (x === xmin) stickers['-x'] = COLORS['-x'];
    if (y === ymax) stickers['+y'] = COLORS['+y'];
    if (y === ymin) stickers['-y'] = COLORS['-y'];
    if (z === zmax) stickers['+z'] = COLORS['+z'];
    if (z === zmin) stickers['-z'] = COLORS['-z'];
    // fc = functional coordinate (effective-space position): seeded to the
    // physical position, rotates with the piece, coarsened at phase boundaries.
    cubies.push({ home: [x, y, z], pos: [x, y, z], ori: I3, fc: [x, y, z], stickers });
  }
  return cubies;
}

// Reduce each fc to the phase's effective dims by centre-aligned clamping:
// physical layers outside the effective range fold onto the outermost retained
// functional layer (outer-fat bandaging).
function coarsen(cubies, eff) {
  const lim = eff.map(e => e - 1);
  for (const c of cubies) c.fc = c.fc.map((v, k) => Math.max(-lim[k], Math.min(lim[k], v)));
}

function parseMove(m) {
  const x = m.match(/^(\d+)?([RLUDFB])(w?)(2|')?$/);
  if (!x) throw new Error('bad move: ' + m);
  return { layer: x[1] ? +x[1] : 1, face: x[2], wide: x[3] === 'w', mod: x[4] || '' };
}

// Functional-layer selection: a move on functional layer k from the named face
// grabs every cubie whose FUNCTIONAL coord on that axis matches. Bandaged
// physical layers share an fc value (set by coarsen), so they come together
// automatically — no geometry inference.
function selectCoords(cubies, mv) {
  const { face, layer, wide } = mv;
  const k = IDX[AXIS[face]], pos = POSITIVE.has(face);
  const coords = [...new Set(cubies.map(c => c.fc[k]))].sort((a, b) => pos ? b - a : a - b);
  return new Set(wide ? coords.slice(0, layer) : [coords[layer - 1]]);
}
function applyMove(cubies, move) {
  const mv = typeof move === 'string' ? parseMove(move) : move;
  const ax = AXIS[mv.face], k = IDX[ax];
  const sel = selectCoords(cubies, mv);
  const sign = BASE_SIGN(mv.face);
  const exp = mv.mod === '2' ? 2 : mv.mod === "'" ? -sign : sign;
  const R = matPow(P[ax], exp);
  for (const c of cubies) {
    if (!sel.has(c.fc[k])) continue;
    c.pos = matVec(R, c.pos);
    c.ori = matMul(R, c.ori);
    c.fc = matVec(R, c.fc);
  }
}

function applyScramble(cubies, seq) {
  for (const tok of seq.trim().split(/\s+/).filter(Boolean)) applyMove(cubies, tok);
}

// ---------- readouts ----------
function worldStickers(c) {
  // color visible on each world face = sticker on the local face that now points there
  const out = {};
  const oriT = transpose(c.ori);
  for (const [key, wv] of Object.entries(DIRS)) {
    const localVec = matVec(oriT, wv);
    const localKey = Object.keys(DIRS).find(kk => vecEq(DIRS[kk], localVec));
    if (c.stickers[localKey]) out[key] = c.stickers[localKey];
  }
  return out;
}
function isSolved(cubies) {
  return cubies.every(c => vecEq(c.pos, c.home) && matEq(c.ori, I3));
}
function boundingCells(cubies) {
  const ext = (k) => {
    const vals = cubies.map(c => c.pos[k]);
    return (Math.max(...vals) - Math.min(...vals)) / 2 + 1;
  };
  return [ext(0), ext(1), ext(2)];
}

// ---------- tests ----------
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) process.exitCode = 1;
}

console.log('=== build 3×3×3 ===');
let c = buildSolved(3, 3, 3);
assert(c.length === 27, `cubie count = 27 (got ${c.length})`);
const corner = c.find(x => vecEq(x.home, [2, 2, 2]));
console.log('  +x+y+z corner stickers:', worldStickers(corner)); // Red/White/Green

console.log('\n=== identity laws (3×3×3) ===');
for (const mv of ['R', 'U', 'F', "L'", '2R', '3Fw']) {
  c = buildSolved(3, 3, 3);
  for (let i = 0; i < 4; i++) applyMove(c, mv);
  assert(isSolved(c), `${mv} ×4 = solved`);
}
c = buildSolved(3, 3, 3);
applyScramble(c, "R U R' U'");
applyScramble(c, "U R U' R'"); // inverse of the above, reversed
assert(isSolved(c), `sexy move · its inverse = solved`);

console.log('\n=== non-shapeshifting quarter turn (3×3×3 stays a cube) ===');
c = buildSolved(3, 3, 3);
applyMove(c, 'R');
assert(JSON.stringify(boundingCells(c)) === JSON.stringify([3, 3, 3]),
  `bounding box after R = 3×3×3 (got ${boundingCells(c)})`);

console.log('\n=== shapeshift demo (3×5×7, R quarter turn) ===');
c = buildSolved(3, 5, 7);
console.log('  solved bounding cells:', boundingCells(c)); // [3,5,7]
applyMove(c, 'R');
console.log('  after R  bounding cells:', boundingCells(c)); // y and z extents swap on the R slab
const protruding = c.filter(x => Math.abs(x.pos[1]) > 4); // beyond the 5-tall box
assert(protruding.length > 0, `R shapeshifts: ${protruding.length} cubies protrude past the 5-tall body`);
console.log('  sample protruding cubie:', {
  home: protruding[0].home, pos: protruding[0].pos, stickers: worldStickers(protruding[0]),
});
applyMove(c, "R'");
assert(isSolved(c), `R then R' returns to solved box`);

console.log('\n=== sample state dump (2×2×3 after F) ===');
c = buildSolved(2, 2, 3);
applyMove(c, 'F');
for (const cu of c.filter(x => Object.keys(worldStickers(x)).length >= 2).slice(0, 6)) {
  console.log('  pos', JSON.stringify(cu.pos), 'colors', worldStickers(cu));
}
