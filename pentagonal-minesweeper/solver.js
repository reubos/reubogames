"use strict";

/* Pentagonal Minesweeper — the laying of the laws, everything the solver can conclude, and the hints.
   One of five scripts sharing a single scope; the order they are
   loaded in is the order the one file used to run in. */

/* =====================================================================
   5a. THE RULESETS

   Each optional law needs three things. A way of laying mines that obeys
   it — scattering and checking is hopeless, since a random scatter obeys
   these laws about once in many thousands. A check that the laying really
   did obey it, because the laying is written down rather than trusted.
   And the deductions the law hands the player, which is the point of
   having one: those live in rulesetMoves further down, and the generator
   only accepts a board when the ordinary rules get stuck without them.
   ===================================================================== */

/* One group is not the same as one lump. The law asks only that the mines
   hold together, and a sprawling tree holds together as well as a blob
   while touching far more of the board — which is the difference between a
   board of numbers and a board of blanks with a clot in one corner.

   So the group is grown towards whatever cell currently stands furthest
   from it, over and over: each pass throws a branch out into the emptiest
   ground left, and the emptiest ground is never empty for long. */
function placeConnected(k) {
  mine.fill(0);
  const dist = new Int32Array(n), prev = new Int32Array(n), q = new Int32Array(n);
  let placed = 0;
  if (seedMotif) { for (const c of seedMotif.mines) { mine[c] = 1; placed++; } }
  else { mine[Math.floor(Math.random() * n)] = 1; placed++; }

  while (placed < k) {
    // how far off every cell stands from the group as it presently is
    dist.fill(-1);
    let head = 0, tail = 0, far = -1;
    for (let i = 0; i < n; i++) if (mine[i]) { dist[i] = 0; prev[i] = -1; q[tail++] = i; }
    while (head < tail) {
      const v = q[head++];
      for (const j of joinAdj()(v)) if (dist[j] < 0 && seedOK(j)) {
        dist[j] = dist[v] + 1; prev[j] = v; q[tail++] = j; far = j;
      }
    }
    if (far < 0) break;                       // the group already fills the board
    // one of the furthest cells at random, so the same board is not grown twice
    const picks = [];
    for (let i = 0; i < n; i++) if (dist[i] === dist[far]) picks.push(i);
    let v = picks[Math.floor(Math.random() * picks.length)];
    const path = [];
    while (v >= 0 && !mine[v]) { path.push(v); v = prev[v]; }
    // laid from the group outwards, so it is joined on at every step
    for (let a = path.length - 1; a >= 0 && placed < k; a--) { mine[path[a]] = 1; placed++; }
  }
  return placed === k;
}

/* Scattered anywhere at all, so long as no group of mines that meet along
   their edges grows past the cap. A cell is tried, and taken back again if
   it would join what is round it into something too big. */
function placeCapped(k, cap) {
  const order = [...Array(n).keys()];
  const groupAt = c => {
    const seen = new Set([c]), stack = [c];
    while (stack.length) {
      const v = stack.pop();
      for (const j of edgOf(v)) if (mine[j] && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
    return seen.size;
  };
  /* Taking cells in a random order and keeping whichever fit is a scatter
     that jams: it fills to about two fifths and then no cell will go
     anywhere. How far it gets varies, so a run that falls short is simply
     tried again rather than left for the count to be eased down. */
  for (let attempt = 0; attempt < 30; attempt++) {
    mine.fill(0);
    let placed = 0;
    if (seedMotif) {
      for (const c of seedMotif.mines) { mine[c] = 1; placed++; }
      if (seedMotif.mines.some(c => groupAt(c) > cap)) return false;
    }
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (const c of order) {
      if (placed === k) break;
      if (mine[c] || !seedOK(c)) continue;
      mine[c] = 1;
      if (groupAt(c) > cap) { mine[c] = 0; continue; }
      placed++;
    }
    if (placed === k) return true;
  }
  return false;
}

/* Mines that must not crowd. Anywhere at all, so long as no mine ends with
   more than the ceiling touching it — the cell laid and every cell it
   touches are checked, since laying one raises the count of all of them. */
function placeSparse(k, cap) {
  const order = [...Array(n).keys()];
  for (let attempt = 0; attempt < 30; attempt++) {
    mine.fill(0);
    let placed = 0;
    if (seedMotif) for (const c of seedMotif.mines) { mine[c] = 1; placed++; }
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const degOK = c => {
      let d = 0;
      for (const j of corOf(c)) if (mine[j]) d++;
      return d <= cap;
    };
    for (const c of order) {
      if (placed === k) break;
      if (mine[c] || !seedOK(c)) continue;
      mine[c] = 1;
      let ok = degOK(c);
      if (ok) for (const j of corOf(c)) if (mine[j] && !degOK(j)) { ok = false; break; }
      if (!ok) { mine[c] = 0; continue; }
      placed++;
    }
    if (placed === k && validRuleset()) return true;
  }
  return false;
}

/* Groups of exactly g cells, edge-joined, each laid where nothing already
   stands within an edge of it. Blocking an edge's reach is what stops one
   group running into the next and making a bigger one; a corner between two
   groups is left alone, since a corner does not join them. */
function placeGroups(k, g) {
  const blocked = new Uint8Array(n);
  let placed = 0;
  /* Planted groups go down first, whole, and block their surroundings as
     any laid group does; the motif is answerable for their being exactly
     the size the law wants. */
  if (seedMotif) {
    for (const c of seedMotif.mines) { mine[c] = 1; placed++; }
    for (const c of seedMotif.mines) {
      blocked[c] = 1;
      for (const j of edgOf(c)) blocked[j] = 1;
    }
  }
  const order = [...Array(n).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  for (const a of order) {
    if (placed >= k) break;
    if (blocked[a] || !seedOK(a)) continue;
    const blob = [a], seen = new Set([a]);
    while (blob.length < g) {
      const opts = [];
      for (const c of blob) for (const j of edgOf(c))
        if (!blocked[j] && !seen.has(j) && seedOK(j)) opts.push(j);
      if (!opts.length) break;
      const pick = opts[Math.floor(Math.random() * opts.length)];
      blob.push(pick); seen.add(pick);
    }
    if (blob.length < g) continue;
    for (const c of blob) { mine[c] = 1; placed++; }
    for (const c of blob) { blocked[c] = 1; for (const j of edgOf(c)) blocked[j] = 1; }
  }
  return placed === k;
}

/* How many ways the walk could carry on from a cell, were it taken: the
   neighbours it would leave touching the walk at exactly one place. */
function elbowRoom(c) {
  let r = 0;
  for (const j of edgOf(c)) {
    if (mine[j]) continue;
    let touch = 0;
    for (const z of edgOf(j)) if (mine[z] || z === c) touch++;
    if (touch === 1) r++;
  }
  return r;
}

/* A walk that only ever steps onto ground touching it at one place — which
   is exactly the promise a snake makes about itself — and that backs up when
   it runs out of room rather than starting over.

   Starting over is what a one-shot walk has to do, and the longer the walk
   the likelier it strands itself, so the length it can reach falls away as
   the board grows. Backing up one step and trying the next way on turns that
   from a gamble into a search. Which way to try first still matters: the
   tightest step, the one leaving fewest ways on from where it lands, spends
   the cramped ground early and keeps the open ground open. */
function walkOut(k, seed, allow, preset) {
  mine.fill(0);
  const stack = [];
  /* A preset is a stretch of the walk laid before it starts — the motif's
     segment — and the walk carries on from its far end. Backing up may not
     unwind into it: the planted stretch is the point. */
  if (preset && preset.length) {
    for (const c of preset) { mine[c] = 1; stack.push({ cell: c, ways: null, at: 0 }); }
  } else {
    mine[seed] = 1;
    stack.push({ cell: seed, ways: null, at: 0 });
  }
  const root = stack.length;
  let budget = 20000 + 40 * k;
  while (stack.length < k && budget-- > 0) {
    const top = stack[stack.length - 1];
    if (top.ways === null) {
      const list = [];
      for (const j of edgOf(top.cell)) if (!mine[j] && allow(j, top.cell, stack.length))
        list.push([j, elbowRoom(j) + Math.random()]);
      list.sort((x, y) => x[1] - y[1]);
      top.ways = list.map(e => e[0]);
    }
    if (top.at >= top.ways.length) {
      if (stack.length <= root) break;
      mine[top.cell] = 0;
      stack.pop();
      continue;
    }
    const next = top.ways[top.at++];
    if (mine[next]) continue;
    mine[next] = 1;
    stack.push({ cell: next, ways: null, at: 0 });
  }
  return stack.length === k;
}

function placeSnake(k) {
  const allow = (j, head) => {
    if (!seedOK(j)) return false;
    let touch = 0;
    for (const z of edgOf(j)) if (mine[z]) touch++;
    return touch === 1;               // the head, and nothing else
  };
  const seg = seedMotif && seedMotif.segment;
  if (seg) {
    for (let t = 0; t < 4; t++)
      if (walkOut(k, seg[0], allow, seg) && validRuleset()) return true;
    return false;
  }
  for (let t = 0; t < 8; t++)
    if (walkOut(k, Math.floor(Math.random() * n), allow)) return true;
  return false;
}


/* A loop is grown as a snake is, but with the way home kept in mind: the
   walk is only let onto ground it could still get back from in the steps it
   has left, and the cell laid last is the one that closes the ring. */
function placeLoop(k) {
  if (k < 4) return false;
  const dist = new Int32Array(n);
  const seg = seedMotif && seedMotif.segment;
  for (let t = 0; t < 8; t++) {
    const s = seg ? seg[0] : Math.floor(Math.random() * n);
    dist.fill(-1); dist[s] = 0;
    const q = [s];
    for (let a = 0; a < q.length; a++)
      for (const j of edgOf(q[a]))
        if (dist[j] < 0 && seedOK(j)) { dist[j] = dist[q[a]] + 1; q.push(j); }
    /* The last cell laid has to touch both the head and the start, closing the
       ring; every other touches only the head, and has to stand near enough to
       the start to still get home in the steps that are left. */
    const allow = (j, head, len) => {
      if (!seedOK(j)) return false;
      let touch = 0, meetsHead = false, meetsStart = false;
      for (const z of edgOf(j)) if (mine[z]) {
        touch++;
        if (z === head) meetsHead = true;
        if (z === s) meetsStart = true;
      }
      return len === k - 1
        ? touch === 2 && meetsHead && meetsStart
        : touch === 1 && meetsHead && dist[j] >= 0 && dist[j] <= k - len;
    };
    if (walkOut(k, s, allow, seg) && validRuleset()) return true;
    if (seg && t >= 3) return false;   // a segment that will not close is not going to
  }
  return false;
}

/* Boxes filled to their floor first, at random within each, and the rest of
   the mines scattered wherever a box still has room under its ceiling. There
   is nothing here to fail at so long as the count asked for sits between the
   two totals, which buildPuzzle sees to before it calls. */
function placeBoxed(k) {
  const { lo, hi } = boxBounds();
  mine.fill(0);
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  const held = new Int32Array(boxes.length);
  let placed = 0;
  if (seedMotif) for (const c of seedMotif.mines) {
    mine[c] = 1; placed++;
    if (boxOf[c] >= 0) held[boxOf[c]]++;
  }
  boxes.forEach((g, b) => {
    for (const c of shuffle(g.filter(c2 => !mine[c2] && seedOK(c2)))
        .slice(0, Math.max(0, lo - held[b]))) {
      mine[c] = 1; placed++; held[b]++;
    }
  });
  if (placed > k) return false;
  for (const c of shuffle([...Array(n).keys()])) {
    if (placed === k) break;
    if (mine[c] || !seedOK(c)) continue;
    const b = boxOf[c];
    if (b >= 0 && held[b] >= hi) continue;
    mine[c] = 1; placed++;
    if (b >= 0) held[b]++;
  }
  return placed === k;
}

/* Lumps against the border make a thick ring round a hollow middle. Fingers
   make a comb, and a comb reaches everywhere a ring cannot — so the mines
   are grown the same way as a connected group, but rooted at the border and
   stepping by edges, since that is the reach this law is written in.

   Every mine already laid counts as a place to grow from, and so does every
   border cell, which is what lets a fresh finger start anywhere along the
   rim. A finger that seals off a pocket of safe ground is drawn back a cell
   at a time until the safe ground is whole again. */
function placeOutside(k) {
  const dist = new Int32Array(n), prev = new Int32Array(n), q = new Int32Array(n);
  for (let attempt = 0; attempt < 12; attempt++) {
    mine.fill(0);
    let placed = 0, stuck = 0;
    /* Planted mines go down first, and each planted piece is walked out to
       the rim before anything else grows — the law owes every mine a chain
       there, and the motif cannot be left owing. */
    if (seedMotif) {
      for (const c of seedMotif.mines) { mine[c] = 1; placed++; }
      const { comps } = compsOver(i => mine[i] === 1, edgOf);
      for (const g of comps) {
        if (g.some(c => !interior[c])) continue;
        dist.fill(-1);
        let head = 0, tail = 0, hit = -1;
        for (const c of g) { dist[c] = 0; prev[c] = -1; q[tail++] = c; }
        while (head < tail && hit < 0) {
          const v = q[head++];
          for (const j of edgOf(v)) {
            if (dist[j] >= 0 || mine[j] || !seedOK(j)) continue;
            dist[j] = dist[v] + 1; prev[j] = v; q[tail++] = j;
            if (!interior[j]) { hit = j; break; }
          }
        }
        if (hit < 0) return false;
        for (let v = hit; v >= 0 && !mine[v]; v = prev[v]) { mine[v] = 1; placed++; }
      }
      if (placed > k) return false;
    }
    while (placed < k && stuck < 24) {
      dist.fill(-1);
      let head = 0, tail = 0, far = -1;
      for (let i = 0; i < n; i++)
        if (mine[i] || !interior[i]) { dist[i] = 0; prev[i] = -1; q[tail++] = i; }
      while (head < tail) {
        const v = q[head++];
        for (const j of edgOf(v)) if (dist[j] < 0 && !mine[j] && seedOK(j)) {
          dist[j] = dist[v] + 1; prev[j] = v; q[tail++] = j; far = j;
        }
      }
      if (far < 0 || !dist[far]) break;
      const picks = [];
      for (let i = 0; i < n; i++) if (dist[i] === dist[far]) picks.push(i);
      let v = picks[Math.floor(Math.random() * picks.length)];
      /* Back to whatever it grew from. A run that ends on bare border lays
         that border cell too, since a chain of mines must reach the rim
         itself and not merely lie against it. */
      const path = [];
      while (v >= 0 && !mine[v]) { path.push(v); v = prev[v]; }
      let laid = 0;
      for (let a = path.length - 1; a >= 0 && placed < k; a--) {
        mine[path[a]] = 1; placed++; laid++;
      }
      if (laid) stuck = 0; else stuck++;
    }
    if (placed === k && validRuleset()) return true;
  }
  return false;
}

// Components of the cells that pass `keep`, under the given adjacency.
function compsOver(keep, adjOf) {
  const id = new Int32Array(n).fill(-1);
  const comps = [];
  for (let i = 0; i < n; i++) {
    if (id[i] >= 0 || !keep(i)) continue;
    const grp = [i]; id[i] = comps.length;
    for (let a = 0; a < grp.length; a++)
      for (const j of adjOf(grp[a]))
        if (id[j] < 0 && keep(j)) { id[j] = comps.length; grp.push(j); }
    comps.push(grp);
  }
  return { id, comps };
}

// The laying is written down rather than trusted: check the law holds.
function validRuleset() {
  const isMine = i => mine[i] === 1;

  if (has('connected') && compsOver(isMine, joinAdj()).comps.length !== 1) return false;

  const g = groupSize();
  if (g && !compsOver(isMine, edgOf).comps.every(c => c.length === g)) return false;

  const cap = groupCap();
  if (cap && !compsOver(isMine, edgOf).comps.every(c => c.length <= cap)) return false;

  const dLo = degFloor(), dHi = degCap();
  if (dLo || dHi < 99) for (let i = 0; i < n; i++) {
    if (!mine[i]) continue;
    let d = 0;
    for (const j of corOf(i)) if (mine[j]) d++;
    if (d < dLo || d > dHi) return false;
  }

  if (has('snake')) {
    const { comps } = compsOver(isMine, edgOf);
    if (comps.length !== 1) return false;
    let ends = 0;
    for (const c of comps[0]) {
      const d = [...edgOf(c)].filter(j => mine[j]).length;
      if (d > 2) return false;
      if (d === 1) ends++;
    }
    if (!(comps[0].length === 1 || ends === 2)) return false;
  }

  if (has('loop')) {
    const { comps } = compsOver(isMine, edgOf);
    if (comps.length !== 1 || comps[0].length < 4) return false;
    // one piece with every cell of degree two is a ring and nothing else
    if (!comps[0].every(c => [...edgOf(c)].filter(j => mine[j]).length === 2)) return false;
  }

  if (has('outside') &&
      !compsOver(isMine, edgOf).comps.every(c => c.some(i => !interior[i]))) return false;

  const law = boxLaw();
  if (law === 'exact' || law === 'irregular') {
    // what a box says is part of the puzzle, so it must read true
    if (boxShown) for (let b = 0; b < boxes.length; b++) {
      if (boxMuted && boxMuted[b]) continue;      // a box that says nothing binds nothing
      let c = 0;
      for (const i of boxes[b]) c += mine[i];
      const [lo, hi] = boxRange(b);
      if (c < lo || c > hi) return false;
    }
  } else if (law) {
    const { lo, hi } = boxBounds();
    for (const box of boxes) {
      let c = 0;
      for (const i of box) c += mine[i];
      if (c < lo || c > hi) return false;
    }
  }
  return true;
}

/* A motif is a small arrangement planted on purpose: mines that must lie
   just so, cells that must stay clear, and for the path laws an ordered
   segment the walk must carry — so that a chosen kind of reasoning is
   waiting in the ground when the board is dealt, rather than hoped for.
   The placers honour whichever motif is set; the laying is still checked
   against the law like any other, and a motif that will not lay costs one
   failed attempt and nothing more. */
let seedMotif = null;          // { mines: [...], banned: Set, segment: [...] | null }
const seedOK = c => !seedMotif || !seedMotif.banned.has(c);
let dealSeeds = { hunted: 0, laid: 0, kept: 0, qualified: 0 };   // the last deal's planting, for the record
let keptGround = null;         // the kept board's motif cells, steering the muting

/* Lay by whichever law is on, and never take the laying on trust. Where two
   laws are in force the shape one does the laying; a box law that only writes
   the count on the box constrains nothing and so asks for nothing. */
function layByRule() {
  mine.fill(0);
  const g = groupSize();
  const ok = has('snake') ? placeSnake(mines)
           : has('loop') ? placeLoop(mines)
           : has('connected') ? placeConnected(mines)
           : g ? placeGroups(mines, g)
           : degCap() < 99 ? placeSparse(mines, degCap())
           : groupCap() ? placeCapped(mines, groupCap())
           : has('outside') ? placeOutside(mines)
           : (boxLaw() === 'exact' || boxLaw() === 'irregular') ? (layMines(new Set()), true)
           : placeBoxed(mines);
  if (!ok) return false;
  countFromMines();                    // which also writes down what the boxes hold
  return validRuleset();
}

/* =====================================================================
   5b. WHAT A RULESET LETS THE PLAYER CONCLUDE

   Every rule here is sound: it leans only on "the mines lie among the
   covered cells" and on the law itself, so nothing it marks safe or mine
   is ever a guess. The two heavy tools are shared. compsOver answers
   which covered ground a mine could reach at all; cutCells answers which
   single covered cell is the only way through — take it out, and some
   piece is left holding what it must not be cut off from. mode 'split'
   objects to a piece holding one anchor severed from another; 'strand'
   to a piece holding a B-cell but not one A-cell.
   ===================================================================== */

function cutCells(known, nodes, keep, adjOf, isA, isB, mode) {
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
  const subA = new Int32Array(n), subB = new Int32Array(n);
  const forced = [];
  let totalA = 0, totalB = 0, timer = 0;
  for (const v of nodes) { if (isA(v)) totalA++; if (isB(v)) totalB++; }
  if (mode === 'split' && totalA < 2) return forced;
  if (mode === 'strand' && (!totalA || !totalB)) return forced;

  const consider = (u, aIn, bIn) => {
    if (known[u] !== UNKNOWN) return;
    const aOut = totalA - aIn - (isA(u) ? 1 : 0);
    const bOut = totalB - bIn - (isB(u) ? 1 : 0);
    if (mode === 'split') { if (aIn > 0 && aOut > 0) forced.push(u); }
    else if ((bIn > 0 && !aIn) || (bOut > 0 && !aOut)) forced.push(u);
  };

  const root = nodes[0];
  disc[root] = low[root] = timer++;
  subA[root] = isA(root) ? 1 : 0; subB[root] = isB(root) ? 1 : 0;
  const stack = [[root, -1, 0]];
  const rootParts = [];
  while (stack.length) {
    const fr = stack[stack.length - 1], v = fr[0], adj = adjOf(v);
    if (fr[2] < adj.length) {
      const w = adj[fr[2]++];
      if (!keep(w)) continue;
      if (disc[w] < 0) {
        disc[w] = low[w] = timer++;
        subA[w] = isA(w) ? 1 : 0; subB[w] = isB(w) ? 1 : 0;
        stack.push([w, v, 0]);
      } else if (w !== fr[1]) low[v] = Math.min(low[v], disc[w]);
    } else {
      stack.pop();
      const p = fr[1];
      if (p < 0) break;
      low[p] = Math.min(low[p], low[v]);
      if (p === root) rootParts.push([subA[v], subB[v]]);
      else if (low[v] >= disc[p]) consider(p, subA[v], subB[v]);
      subA[p] += subA[v]; subB[p] += subB[v];
    }
  }
  if (rootParts.length >= 2)
    for (const [a, b] of rootParts) consider(root, a, b);
  return forced;
}

/* cutCells asks whether a cell parts the mines from each other. This asks
   whether it parts them from the room they still need.

   Take a covered cell away and the covered ground falls into pieces. The
   whole group has to sit in one piece, so that piece must hold every mine
   already found and have room for every mine there is. Where no piece left
   could serve, the cell taken away was the way through, and is a mine — a
   path with an end still to run, walled in by safe ground save for one gap,
   must take the gap.

   One walk of the piece answers it for every cell in it at once. For a cell
   that parts nothing, the single piece left is simply everything but itself;
   for one that parts, the pieces are the subtrees it cuts off and whatever
   remains after them. */
/* The cells whose going parts a piece of ground in two — the places worth
   asking a question of, when the question is what gets cut off from what.
   The usual walk, keeping the cells at which a child's reach never climbs
   back above its parent. The first cell is judged by how many children the
   walk hangs on it, since it has no parent to be cut from. */
function partingCells(nodes, keep, adjOf) {
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
  const out = [];
  const root = nodes[0];
  let timer = 0, rootKids = 0;
  disc[root] = low[root] = timer++;
  const stack = [[root, -1, 0]];
  while (stack.length) {
    const fr = stack[stack.length - 1], v = fr[0], adj = adjOf(v);
    if (fr[2] < adj.length) {
      const w = adj[fr[2]++];
      if (!keep(w)) continue;
      if (disc[w] < 0) {
        disc[w] = low[w] = timer++;
        if (v === root) rootKids++;
        stack.push([w, v, 0]);
      } else if (w !== fr[1]) low[v] = Math.min(low[v], disc[w]);
    } else {
      stack.pop();
      const p = fr[1];
      if (p < 0) break;
      low[p] = Math.min(low[p], low[v]);
      if (p !== root && low[v] >= disc[p] && !out.includes(p)) out.push(p);
    }
  }
  if (rootKids > 1) out.push(root);
  return out;
}

function tightCells(known, nodes, keep, adjOf, isM, need) {
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
  const sz = new Int32Array(n), hm = new Int32Array(n);
  const cutSz = new Int32Array(n), cutHm = new Int32Array(n);
  const roomy = new Uint8Array(n);       // some piece it cuts off would serve
  const forced = [];
  let total = 0, mineTotal = 0, timer = 0;
  for (const v of nodes) { total++; if (isM(v)) mineTotal++; }
  // with no mine found there is no piece the group is pinned to, and a piece
  // already too small for the group says the position is beyond saving
  if (!mineTotal || total < need) return forced;
  const serves = (s, m) => m === mineTotal && s >= need;

  const root = nodes[0];
  disc[root] = low[root] = timer++;
  sz[root] = 1; hm[root] = isM(root) ? 1 : 0;
  const stack = [[root, -1, 0]];
  const rootParts = [];
  while (stack.length) {
    const fr = stack[stack.length - 1], v = fr[0], adj = adjOf(v);
    if (fr[2] < adj.length) {
      const w = adj[fr[2]++];
      if (!keep(w)) continue;
      if (disc[w] < 0) {
        disc[w] = low[w] = timer++;
        sz[w] = 1; hm[w] = isM(w) ? 1 : 0;
        stack.push([w, v, 0]);
      } else if (w !== fr[1]) low[v] = Math.min(low[v], disc[w]);
    } else {
      stack.pop();
      const p = fr[1];
      if (p < 0) break;
      low[p] = Math.min(low[p], low[v]);
      if (p === root) rootParts.push([sz[v], hm[v]]);
      else if (low[v] >= disc[p]) {
        cutSz[p] += sz[v]; cutHm[p] += hm[v];
        if (serves(sz[v], hm[v])) roomy[p] = 1;
      }
      sz[p] += sz[v]; hm[p] += hm[v];
    }
  }

  // the root cuts off every one of its subtrees and leaves nothing besides
  if (known[root] === UNKNOWN && rootParts.length &&
      !rootParts.some(([s, m]) => serves(s, m))) forced.push(root);

  for (const v of nodes) {
    if (v === root || known[v] !== UNKNOWN || roomy[v]) continue;
    if (serves(total - 1 - cutSz[v], mineTotal - cutHm[v])) continue;
    forced.push(v);
  }
  return forced;
}

/* Every deduction a law hands over goes through `mark`, which carries not
   only what it settles but the rule it leaned on and the cells a player
   would have to look at to see it. That attribution is dead weight to the
   solver and the whole point to the hint system: in find mode nothing is
   settled at all, the first deduction is written down and the search is
   abandoned where it stands. */
let hintHit = null;
const HINT_STOP = {};

function rulesetMoves(known, find) {
  let moved = false;
  const isM = i => known[i] === KNOWN_MINE;
  // the ground a mine could still pass through
  const open = i => known[i] === UNKNOWN || known[i] === KNOWN_MINE;
  const mark = (j, kind, rule, clues) => {
    if (known[j] !== UNKNOWN || !allowRule(rule)) return;
    if (find) {
      hintHit = { cells: [j], kind, rule, clues: clues.filter(c => c !== j) };
      throw HINT_STOP;
    }
    if (chainLog) chainLog.push({ cell: j, kind, rule });
    if (kind === 'safe') markOpen(known, j); else known[j] = KNOWN_MINE;
    tallyRule(rule);
    moved = true;
  };
  /* Which clue to point the player at. The mine counter is a statement with
     no cell of its own to light up, so it cites nothing and the wording
     carries the reasoning instead. */
  const cite = c => (c.from >= 0 ? [c.from] : []);

  const theBoxLaw = boxLaw();
  if ((theBoxLaw === 'exact' || theBoxLaw === 'irregular') && boxShown) {
    /* A box with a number written on it is a clue like any other, only drawn
       round a group of cells instead of standing in one. Where the number is
       a floor or a ceiling rather than an exact count it reads the same way,
       with one side of the range simply left open. */
    for (let b = 0; b < boxes.length; b++) {
      if (boxMuted && boxMuted[b]) continue;      // a box that says nothing states nothing
      const g = boxes[b];
      let held = 0;
      const left = [];
      for (const c of g) {
        if (isM(c)) held++;
        else if (known[c] === UNKNOWN) left.push(c);
      }
      if (!left.length) continue;
      const [lo, hi] = boxRange(b);
      if (held >= hi) for (const c of left) mark(c, 'safe', 'box-exact', g);
      else if (lo - held === left.length) for (const c of left) mark(c, 'mine', 'box-exact', g);
    }
  } else if (theBoxLaw) {
    /* A box short of its floor with only just enough covered cells left to
       make it up holds nothing but mines; a box already at its ceiling has
       nothing but safe ground left. A floor can only ever prove a mine and a
       ceiling only ever prove safety, which is why the two play so unalike. */
    const { lo, hi } = boxBounds();
    for (const g of boxes) {
      let held = 0;
      const left = [];
      for (const c of g) {
        if (isM(c)) held++;
        else if (known[c] === UNKNOWN) left.push(c);
      }
      if (!left.length) continue;
      if (held >= hi) for (const c of left) mark(c, 'safe', 'box-full', g);
      else if (lo - held === left.length) for (const c of left) mark(c, 'mine', 'box-short', g);
    }
  }

  const gCap = groupCap();
  if (gCap) {
    /* Nothing may swell a group past the cap, so a cell that would is safe.
       A ceiling clears ground and never settles a mine, which is the opposite
       of what a floor does and the reason the two are worth having apart. */
    const { id, comps } = compsOver(isM, edgOf);
    for (let i2 = 0; i2 < n; i2++) {
      if (known[i2] !== UNKNOWN) continue;
      const near = new Set();
      for (const j2 of edgOf(i2)) if (isM(j2)) near.add(id[j2]);
      let total = 1;
      for (const c of near) total += comps[c].length;
      if (total > gCap) mark(i2, 'safe', 'cap-over', [...near].flatMap(c => comps[c]));
    }
  }

  /* What a mine owes, and what it may not exceed, in companions. A mine
     short of the floor must find the rest among the ground still covered; a
     mine already at the ceiling has nothing but safe ground round it. And a
     covered cell answers for itself: one touching more mines than the
     ceiling allows could never be a mine, and one with too few cells around
     it that could ever hold a mine could never reach the floor. */
  const dLo = degFloor(), dHi = degCap();
  if (dLo || dHi < 99) {
    for (let i2 = 0; i2 < n; i2++) {
      if (!isM(i2)) continue;
      const near = [...corOf(i2)];
      const mn = near.filter(isM);
      const unk = near.filter(j2 => known[j2] === UNKNOWN);
      if (mn.length >= dHi)
        for (const j2 of unk) mark(j2, 'safe', 'deg-full', [i2, ...mn]);
      else if (unk.length && dLo - mn.length === unk.length)
        for (const j2 of unk) mark(j2, 'mine', 'deg-grow', [i2, ...mn]);
    }
    for (let i2 = 0; i2 < n; i2++) {
      if (known[i2] !== UNKNOWN) continue;
      const near = [...corOf(i2)];
      let mn = 0, could = 0;
      for (const j2 of near) {
        if (isM(j2)) { mn++; could++; }
        else if (known[j2] === UNKNOWN) could++;
      }
      if (mn > dHi) mark(i2, 'safe', 'deg-over', near.filter(isM));
      else if (could < dLo) mark(i2, 'safe', 'deg-room', near);
    }
  }

  const gSize = groupSize();
  if (gSize) {
    /* Every group holds the same number of cells, so a group already that big
       has nothing but safe ground round it, one still short of it must grow,
       and a cell that would swell a group past the number cannot hold a mine.
       A cell with too little room left to make a whole group cannot either. */
    /* Settling a mine joins pieces together, so a reckoning of the pieces
       made before that is no longer the truth about them. The two passes are
       therefore kept apart, each on a reckoning of its own: first what a full
       group clears around it, then what a group short of its number must
       take. Running them together let a stale piece be judged full when it
       was not, and a board could come out unfinishable. */
    for (const g of compsOver(isM, edgOf).comps) {
      if (g.length !== gSize) continue;
      for (const c of g) for (const j2 of edgOf(c))
        if (known[j2] === UNKNOWN) mark(j2, 'safe', 'group-full', g);
    }

    /* Settling one mine can join two pieces into one, and a piece judged
       short against a reckoning made before that may not be short at all —
       so this stops at the first mine it settles. The solver comes straight
       back round with the pieces worked out afresh, which costs a sweep and
       is the whole difference between sound and not. */
    for (const g of compsOver(isM, edgOf).comps) {
      if (g.length >= gSize) continue;
      const frontier = [];
      for (const c of g) for (const j2 of edgOf(c))
        if (known[j2] === UNKNOWN && !frontier.includes(j2)) frontier.push(j2);
      // short of its number, and only one way left to make it up
      if (frontier.length !== 1) continue;
      mark(frontier[0], 'mine', 'group-grow', g);
      break;
    }

    /* Worked out afresh, since the pass above may have settled new mines and
       the pieces they belong to would not be in an older reckoning. */
    const { id, comps } = compsOver(isM, edgOf);
    for (let i2 = 0; i2 < n; i2++) {
      if (known[i2] !== UNKNOWN) continue;
      const near = new Set();
      for (const j2 of edgOf(i2)) if (isM(j2)) near.add(id[j2]);
      let total = 1;
      for (const c of near) total += comps[c].length;
      if (total > gSize) mark(i2, 'safe', 'group-big', [...near].flatMap(c => comps[c]));
    }

    // a mine's group has to fit somewhere: ground too cramped to hold one is safe
    for (const g of compsOver(i2 => known[i2] !== SAFE, edgOf).comps)
      if (g.length < gSize)
        for (const c of g) if (known[c] === UNKNOWN) mark(c, 'safe', 'group-room', g);
  }

  if (has('connected') || has('snake') || has('loop')) {
    const adj = (has('snake') || has('loop')) ? edgOf : joinAdj();

    if (has('snake') || has('loop')) {
      /* How many mines a mine must have beside it: a snake's have one or
         two, a loop's have two exactly — which turns every known mine into
         a little counting problem of its own. */
      const ring = has('loop');
      for (let i = 0; i < n; i++) {
        if (!isM(i)) continue;
        const mn = [...edgOf(i)].filter(isM);
        const cand = [...edgOf(i)].filter(j => known[j] === UNKNOWN);
        if (ring) {
          if (mn.length >= 2) for (const j of cand) mark(j, 'safe', 'loop-degree', [i, ...mn]);
          else if (cand.length && 2 - mn.length === cand.length)
            for (const j of cand) mark(j, 'mine', 'loop-degree', [i, ...mn]);
        } else if (mn.length >= 2) {
          // a full body cell: everything else beside it is safe
          for (const j of cand) mark(j, 'safe', 'snake-body', [i, ...mn]);
        } else if (!mn.length && mines >= 2 && cand.length === 1) {
          mark(cand[0], 'mine', 'snake-end', [i]);
        }
      }

      /* A cell against three mines would give one of them three neighbours,
         and a cell against two mines already joined would fold a bend onto
         itself: both are the line touching itself, either way. A cell against
         the two ends of one piece closes it into a ring — which is what a
         snake must never do, and what a loop must do exactly once, with every
         mine on the board and not a cell fewer. */
      const { id: segId, comps: segs } = compsOver(isM, edgOf);
      const touch = ring ? 'loop-degree' : 'snake-touch';
      for (let i = 0; i < n; i++) {
        if (known[i] !== UNKNOWN) continue;
        const km = [...edgOf(i)].filter(isM);
        if (km.length >= 3) { mark(i, 'safe', touch, km); continue; }
        if (km.length !== 2) continue;
        if ([...edgOf(km[0])].includes(km[1])) mark(i, 'safe', touch, km);
        else if (segId[km[0]] === segId[km[1]]) {
          if (!ring) mark(i, 'safe', 'snake-touch', km);
          else if (segs[segId[km[0]]].length + 1 !== mines)
            mark(i, 'safe', 'loop-short', segs[segId[km[0]]]);
        }
      }

      let placed = 0;
      for (let i = 0; i < n; i++) if (isM(i)) placed++;
      const spare = mines - placed;

      /* Pieces, against the mines left to join them. Every mine ends up in
         one piece, and none may have three neighbours, so a new mine can
         bring at most two pieces together — joining S pieces therefore costs
         at least S-1 mines. A cell that would leave more pieces behind than
         there are mines to join them cannot hold one. */
      if (segs.length) {
        const pieces = segs.flat();
        for (let i = 0; i < n; i++) {
          if (known[i] !== UNKNOWN) continue;
          const near = new Set();
          for (const j of edgOf(i)) if (isM(j)) near.add(segId[j]);
          if (spare - 1 < segs.length - near.size)
            mark(i, 'safe', 'piece-budget', pieces);
        }
      }

      /* One mine left to place and the rest of it lying in a single open
         piece: that mine can only be a cell joining the piece's two ends, so
         every cell that does not touch both of them is safe. */
      if (ring && spare === 1 && segs.length === 1) {
        const ends = segs[0].filter(c => [...edgOf(c)].filter(isM).length < 2);
        if (ends.length === 2) {
          const shuts = [];
          for (let i = 0; i < n; i++) {
            if (known[i] !== UNKNOWN) continue;
            const e = edgOf(i);
            if (e.includes(ends[0]) && e.includes(ends[1])) shuts.push(i);
          }
          if (shuts.length) {
            if (shuts.length === 1) mark(shuts[0], 'mine', 'loop-close', ends);
            for (let i = 0; i < n; i++)
              if (!shuts.includes(i)) mark(i, 'safe', 'loop-close', ends);
          }
        }
      }
    }

    // a mine can only reach the rest through covered ground
    {
      const { id, comps } = compsOver(open, adj);
      const withM = comps.filter(g => g.some(isM));
      if (withM.length) {
        for (const g of comps) if (!g.some(isM))
          for (const c of g) mark(c, 'safe', 'reach-pocket', g);
        for (const g of withM)
          for (const u of cutCells(known, g, x => id[x] === id[g[0]], adj, isM, isM, 'split'))
            mark(u, 'mine', 'reach-cut', [...adj(u)]);
      }
    }

    /* And the room the group still needs, rather than merely its own parts.

       Worked out afresh rather than off the reckoning just above: clearing a
       pocket runs the blanks out through corner neighbours, which under a
       path law are not the neighbours the pieces were reckoned by, so ground
       can leave a piece without the piece knowing. Mines found in two pieces
       at once would say the position is already beyond the law, and there is
       nothing to add to that.

       And not while the cheaper rules are still finding things: the solver
       comes back the moment they dry up, so waiting costs nothing and saves
       a walk of the whole piece on every sweep that did not need it. */
    if (!moved && allowRule('reach-room')) {
      const { id, comps } = compsOver(open, adj);
      const withM = comps.filter(g => g.some(isM));
      if (withM.length === 1) {
        const g = withM[0];
        for (const u of tightCells(known, g, x => id[x] === id[g[0]], adj, isM, mines))
          mark(u, 'mine', 'reach-room', [...adj(u)]);
      }
    }

    /* A mine that is owed but not yet placed anchors the ground as firmly as
       one already found. A number still wanting a mine says one of its
       covered cells holds one without saying which — and since every mine
       lies in the one piece of ground the group occupies, that piece must
       hold a cell of every number still owed. Two things follow.

       Where a number has only one candidate left inside that piece, the
       waiting mine can be nowhere else, and the cell is settled. And where
       taking a covered cell away would leave the piece holding none of some
       number's candidates, the owed mine could no longer join the group at
       all: the cell taken away is the way through, and is a mine. That is
       the bottleneck a player sees when a "1" sits in a pocket with one
       gap — the pocket owes a mine, and the mine owes the group a chain.

       Only cells whose going actually parts the ground are worth asking
       after for the second, so the parting cells are found once and asked
       one at a time — cheap enough that this one need not wait for narrow
       ground the way the priced routes do. It says nothing under the border
       law, where the mines owe the rim a chain apiece and need never gather
       into one piece at all. */
    if (!moved && allowRule('reach-owed') && !has('outside')) {
      const { id, comps } = compsOver(open, adj);
      const withM = comps.filter(g => g.some(isM));
      if (withM.length === 1) {
        const home = id[withM[0][0]];
        const owed = [];
        for (const c2 of constraintsOf(known))
          if (c2.lo >= 1) {
            const inHome = c2.cells.filter(x => id[x] === home);
            if (inHome.length) owed.push({ cells: inHome, from: c2.from });
          }

        // the one candidate left: the owed mine can be nowhere else
        for (const o of owed)
          if (o.cells.length === 1) mark(o.cells[0], 'mine', 'reach-owed', [o.from]);

        /* And the partings. A cell whose going splits the piece is found by
           the usual walk; then the part still holding the mines must hold a
           candidate of every number owed, or the going was impossible. */
        if (owed.length) {
          const nodes = withM[0];
          const inHome2 = new Uint8Array(n);
          for (const c of nodes) inHome2[c] = 1;
          for (const u of partingCells(nodes, c => inHome2[c] === 1, adj)) {
            if (known[u] !== UNKNOWN) continue;
            const seen2 = new Uint8Array(n);
            const part = [];
            const from = nodes.find(c => c !== u && isM(c));
            if (from === undefined) break;          // no mine to anchor on
            seen2[from] = 1; part.push(from);
            for (let a2 = 0; a2 < part.length; a2++)
              for (const j2 of adj(part[a2]))
                if (!seen2[j2] && j2 !== u && inHome2[j2]) { seen2[j2] = 1; part.push(j2); }
            let serves = part.length >= mines;
            if (serves) for (const c of nodes)
              if (isM(c) && !seen2[c]) { serves = false; break; }
            if (serves) for (const o of owed)
              if (!o.cells.some(c => c !== u && seen2[c])) { serves = false; break; }
            if (!serves) mark(u, 'mine', 'reach-owed', owed.map(o => o.from));
          }
        }
      }
    }

    /* One number, asked exhaustively, with the group law sitting in the
       judge's chair — what cap-ways does for the caps and group-ways for the
       sizes. Lay this number's mines every way it allows; throw out the ways
       under which the group could not survive; keep what the rest agree on.

       A "1" with two cells beside it, one of which would strand the mines,
       has its answer in the other. A number wanting one of three, where
       leaving two of them clear would break the group, must hold it in one
       of those two — so the third is clear, though which of the two it is
       stays open. Neither reading comes of asking about one cell at a time,
       which is why nothing above finds them.

       A way is thrown out only where it is certainly impossible: with those
       mines laid and those cells cleared, no piece of open ground holds
       every mine and has room for all of them. That is a necessary truth,
       so the ways kept can only be too many, never too few, and what they
       all agree on is agreed by the truth among them. Kept to short numbers
       and few ways, since each way costs a reckoning of the whole ground. */
    if (!moved && has('connected') && allowRule('conn-ways')) {
      const chainAdj = joinAdj();
      for (const c2 of constraintsWithTotal(known)) {
        const U = c2.cells, need = c2.left;
        if (need === undefined) continue;      // a clue speaking from one side
        // the counter is allowed a wider set than a number, since it is the
        // one statement worth asking when little ground is left
        if (need < 1 || need > U.length || U.length > (c2.from < 0 ? 8 : 6)) continue;
        let ways2 = 1;
        for (let a2 = 0; a2 < need; a2++) ways2 = ways2 * (U.length - a2) / (a2 + 1);
        if (ways2 > 20) continue;

        const inAll = new Array(U.length).fill(true);
        const inAny = new Array(U.length).fill(false);
        let live = 0;
        const canLive = (add, clear) => {
          const mineNow = i => isM(i) || add.has(i);
          const openNow = i => !clear.has(i) && (known[i] === UNKNOWN || mineNow(i));
          const { id, comps } = compsOver(openNow, chainAdj);
          const held = [];
          for (let i2 = 0; i2 < n; i2++) if (mineNow(i2)) held.push(i2);
          if (!held.length) return true;
          return comps.some(g =>
            g.length >= mines && held.every(m => id[m] === id[g[0]]));
        };
        const lay = (at, chosen) => {
          if (chosen.length === need) {
            const add = new Set(chosen);
            const clear = new Set(U.filter(x => !add.has(x)));
            if (!canLive(add, clear)) return;
            live++;
            for (let k2 = 0; k2 < U.length; k2++)
              if (add.has(U[k2])) inAny[k2] = true; else inAll[k2] = false;
            return;
          }
          if (at >= U.length || U.length - at < need - chosen.length) return;
          chosen.push(U[at]); lay(at + 1, chosen); chosen.pop();
          lay(at + 1, chosen);
        };
        lay(0, []);
        if (!live) continue;          // no way at all: the position is past saving
        for (let k2 = 0; k2 < U.length; k2++) {
          if (inAll[k2]) mark(U[k2], 'mine', 'conn-ways', cite(c2));
          else if (!inAny[k2]) mark(U[k2], 'safe', 'conn-ways', cite(c2));
        }
      }
    }

    /* How far the group can still stretch. Reaching a cell d steps off
       through ground not yet known safe costs d mines — the cells passed
       through and the cell itself — so anything standing further away than
       the mines that remain is out of the group's reach altogether. */
    const held = [];
    for (let i = 0; i < n; i++) if (isM(i)) held.push(i);
    if (held.length) {
      const budget = mines - held.length;
      const dist = new Int32Array(n).fill(-1);
      const queue = held.slice();
      for (const i of held) dist[i] = 0;
      for (let a = 0; a < queue.length; a++)
        for (const j of adj(queue[a]))
          if (dist[j] < 0 && known[j] !== SAFE) { dist[j] = dist[queue[a]] + 1; queue.push(j); }
      for (let i = 0; i < n; i++)
        if (known[i] === UNKNOWN && (dist[i] < 0 || dist[i] > budget))
          mark(i, 'safe', 'reach-budget', held);
    }
  }

  if (has('outside')) {
    const rimC = i => !interior[i];
    // the mines' side: every mine must reach the border through covered ground
    {
      const { id, comps } = compsOver(open, edgOf);
      for (const g of comps) {
        if (!g.some(rimC)) { for (const c of g) mark(c, 'safe', 'outside-pocket', g); continue; }
        if (g.some(isM))
          for (const u of cutCells(known, g, x => id[x] === id[g[0]], edgOf, rimC, isM, 'strand'))
            mark(u, 'mine', 'outside-cut', [...edgOf(u)]);
      }
    }
  }


  /* The same question put to the crowding laws, and it reaches what the
     counts above cannot. Every rule so far asks the ceiling of a mine
     already found — how much company it may still keep. None of them asks
     it of a covered cell, because a covered cell's own ceiling only binds
     if it turns out to be a mine, and a conditional truth is not a count
     that can be traded.

     Laid out as cases it binds perfectly well. Two covered cells side by
     side, each already touching two found mines, cannot both be mines:
     either one would take the other as a third companion and be crowded
     past the law. No bound written over found mines says so, since the two
     cells need share no mine at all. So a number's cells are laid every
     way it allows, and a way is thrown out where some mine — found or just
     laid — is crowded past the ceiling by what is certainly beside it, or
     cannot reach the floor even if every cell still open around it came in
     as a mine. Both refusals are certain, so the ways kept can only be too
     many, and what they all agree on is agreed by the truth among them. */
  if (!moved && (dLo || dHi < 99) && allowRule('deg-ways')) {
    for (const c2 of constraintsWithTotal(known)) {
      const U = c2.cells, need = c2.left;
      if (need === undefined) continue;        // a clue speaking from one side
      // as above: the counter may speak over more ground than any number
      if (need < 1 || need > U.length || U.length > 8) continue;
      let ways2 = 1;
      for (let a2 = 0; a2 < need; a2++) ways2 = ways2 * (U.length - a2) / (a2 + 1);
      if (ways2 > 40) continue;

      const inAll = new Array(U.length).fill(true);
      const inAny = new Array(U.length).fill(false);
      let live = 0;
      const fitsDeg = (add, clear) => {
        /* Certainly a mine, against certainly still able to become one:
           the first counts against the ceiling, the two together against
           the floor. Cells outside this number stay open on both counts. */
        const judge = c3 => {
          let sure = 0, may = 0;
          for (const j2 of corOf(c3)) {
            if (isM(j2) || add.has(j2)) sure++;
            else if (known[j2] === UNKNOWN && !clear.has(j2)) may++;
          }
          return sure <= dHi && sure + may >= dLo;
        };
        for (const c3 of add) if (!judge(c3)) return false;
        // and every mine already found whose company this laying changed
        for (const c3 of add)
          for (const j2 of corOf(c3)) if (isM(j2) && !judge(j2)) return false;
        for (const c3 of clear)
          for (const j2 of corOf(c3)) if (isM(j2) && !judge(j2)) return false;
        return true;
      };
      const lay = (at, chosen) => {
        if (chosen.length === need) {
          const add = new Set(chosen);
          const clear = new Set(U.filter(x => !add.has(x)));
          if (!fitsDeg(add, clear)) return;
          live++;
          for (let k2 = 0; k2 < U.length; k2++)
            if (add.has(U[k2])) inAny[k2] = true; else inAll[k2] = false;
          return;
        }
        if (at >= U.length || U.length - at < need - chosen.length) return;
        chosen.push(U[at]); lay(at + 1, chosen); chosen.pop();
        lay(at + 1, chosen);
      };
      lay(0, []);
      if (!live) continue;          // no way at all: the position is past saving
      for (let k2 = 0; k2 < U.length; k2++) {
        if (inAll[k2]) mark(U[k2], 'mine', 'deg-ways', cite(c2));
        else if (!inAny[k2]) mark(U[k2], 'safe', 'deg-ways', cite(c2));
      }
    }
  }

  /* ===== What a law says about several cells at once =====

     Everything above forces one cell from one fact. But much of what a law
     knows arrives as a bound over a set: the cells round this piece can take
     at most one more mine between them, this box still needs two, this
     mine's covered neighbours hold exactly one. Once the single-cell rules
     are done such a bound forces nothing on its own — it pays when set
     against another statement about overlapping ground, the way two numbers
     pay in the subset rule. So the bounds are gathered, the numbers laid
     beside them, and every overlapping pair made to trade.

     Every bound is written down whole, about cells named at the time of
     writing, before anything is marked — and a claim of that shape is about
     the true board, so it stays true no matter what is settled after it.
     That is the lesson group-grow above had to learn: judge a piece against
     ground reworked mid-sweep and the claim can be about a piece that no
     longer exists; gather first and mark after, and it cannot be.

     None of it is gathered while the single-cell rules are still finding
     things: the solver comes back here the moment they dry up, so waiting
     costs nothing and skips the dearest sweep on every pass that did not
     need it. Nor under a tier ceiling of one, since everything here is a
     rule of the second tier or the third. */
  if (!moved && (!tierCap || tierCap >= 2)) {
    const bounds = [];
    const bound = (cells, lo, hi, rule, clues) => {
      lo = Math.max(0, lo); hi = Math.min(hi, cells.length);
      if (!cells.length || (lo <= 0 && hi >= cells.length)) return;  // says nothing
      /* A bound under a switched-off rule stays out of the pool entirely, so
         a chain died at its first link cannot smuggle the rule's work in
         under another rule's name — the honesty the variety judging and the
         tier ceiling both lean on. */
      if (!allowRule(rule)) return;
      bounds.push({ cells, lo, hi, rule, clues });
    };

    // the boxes: what each still needs, and what room it has left
    if (theBoxLaw) {
      const plain = theBoxLaw === 'exact' || theBoxLaw === 'irregular' ? null : boxBounds();
      for (let b = 0; b < boxes.length; b++) {
        let lo, hi;
        if (plain) ({ lo, hi } = plain);
        else {
          if (!boxShown || (boxMuted && boxMuted[b])) continue;
          [lo, hi] = boxRange(b);
        }
        let held = 0;
        const left = [];
        for (const c of boxes[b]) {
          if (isM(c)) held++;
          else if (known[c] === UNKNOWN) left.push(c);
        }
        bound(left, lo - held, hi - held, 'box-count', boxes[b]);
      }
    }

    /* The pieces. Every mine beside a piece ends up in that piece's group,
       so under a cap the cells round it can take at most what would bring it
       to the cap — between them, not merely one by one — and under an exact
       size a short piece must take at least one of them, since whatever
       group it grows into reaches out through them. */
    if (gCap || gSize) {
      const limit = gCap || gSize;
      const groupRule = gCap ? 'cap-count' : 'group-count';
      const { id, comps } = compsOver(isM, edgOf);
      const frontier = comps.map(g => {
        const f = [];
        for (const c of g) for (const j2 of edgOf(c))
          if (known[j2] === UNKNOWN && !f.includes(j2)) f.push(j2);
        return f;
      });
      comps.forEach((g, k) =>
        bound(frontier[k], gSize && g.length < gSize ? 1 : 0, limit - g.length,
              groupRule, g));

      /* And the pairs: two cells that together would weld one group too big
         cannot both be mines. They are sure to weld only when they sit side
         by side or against the same piece — two mines near two separate
         pieces are two separate groups, and the law has nothing against
         that. A pair is a bound like any other, and it trades the same way:
         a number needing all but one of three cells, two of which are such a
         pair, has its third cell settled as a mine. */
      const beside = new Map();          // covered cell -> the pieces it touches
      for (let i2 = 0; i2 < n; i2++) {
        if (known[i2] !== UNKNOWN) continue;
        let s = null;
        for (const j2 of edgOf(i2)) if (isM(j2)) (s = s || new Set()).add(id[j2]);
        if (s) beside.set(i2, s);
      }
      const seen = new Set();
      const tryPair = (a, b2) => {
        const key = a < b2 ? a * n + b2 : b2 * n + a;
        if (seen.has(key)) return;
        seen.add(key);
        const u = new Set([...(beside.get(a) || []), ...(beside.get(b2) || [])]);
        let joint = 2;
        for (const k of u) joint += comps[k].length;
        if (joint > limit)
          bound([a, b2], 0, 1, groupRule, [...u].flatMap(k => comps[k]));
      };
      for (const f of frontier)
        for (let x = 0; x < f.length; x++)
          for (let y = x + 1; y < f.length; y++) tryPair(f[x], f[y]);
      for (const [a] of beside)
        for (const j2 of edgOf(a)) if (known[j2] === UNKNOWN) tryPair(a, j2);
      // alone of the sizes, singles forbids even a bare pair side by side
      if (gSize === 1)
        for (let i2 = 0; i2 < n; i2++) {
          if (known[i2] !== UNKNOWN) continue;
          for (const j2 of edgOf(i2))
            if (known[j2] === UNKNOWN && j2 > i2) tryPair(i2, j2);
        }

      /* One number, asked exhaustively. A "3" over a run of five covered
         cells under Singles takes its mines at the ends and the middle —
         which no trade of two statements reaches, since it needs two
         disjoint pairs and the number all speaking at once. So a number
         with few enough covered cells simply tries every way of laying its
         mines that the law does not refuse outright, and keeps whatever
         all the ways agree on.

         Refusal is only ever certain — a laying that welds a group past the
         limit, counting the mines already found it would join — so the ways
         kept can only be too many, never too few, and what they all agree
         on is agreed by the truth among them. Not asked unless the law can
         bite at all: more mines wanted than one group may hold, or laid
         ground already against the number's cells. */
      const waysRule = gCap ? 'cap-ways' : 'group-ways';
      for (const c2 of allowRule(waysRule) ? constraintsWithTotal(known) : []) {
        const U = c2.cells, need = c2.left;
        if (need === undefined) continue;      // a clue speaking from one side
        if (need < 2 || need >= U.length || U.length > 12) continue;
        const nearMine = U.some(u2 => [...edgOf(u2)].some(isM));
        if (need <= limit && !nearMine) continue;
        const okWay = S => {
          const set = new Set(S);
          const seen2 = new Set();
          for (const s2 of S) {
            if (seen2.has(s2)) continue;
            const grp = [s2]; seen2.add(s2);
            for (let a2 = 0; a2 < grp.length; a2++)
              for (const j2 of edgOf(grp[a2]))
                if ((set.has(j2) || isM(j2)) && !seen2.has(j2)) { seen2.add(j2); grp.push(j2); }
            if (grp.length > limit) return false;
          }
          return true;
        };
        const inAll = new Array(U.length).fill(true);
        const inAny = new Array(U.length).fill(false);
        let ways = 0;
        const lay = (at, chosen) => {
          if (chosen.length === need) {
            if (!okWay(chosen)) return;
            ways++;
            const has = new Set(chosen);
            for (let k2 = 0; k2 < U.length; k2++)
              if (has.has(U[k2])) inAny[k2] = true; else inAll[k2] = false;
            return;
          }
          if (at >= U.length || U.length - at < need - chosen.length) return;
          chosen.push(U[at]); lay(at + 1, chosen); chosen.pop();
          lay(at + 1, chosen);
        };
        lay(0, []);
        if (!ways) continue;      // no laying passes: the position is past saving
        const wClues = cite(c2);
        for (const u2 of U) for (const j2 of edgOf(u2))
          if (isM(j2) && !wClues.includes(j2)) wClues.push(j2);
        for (let k2 = 0; k2 < U.length; k2++) {
          if (inAll[k2]) mark(U[k2], 'mine', waysRule, wClues);
          else if (!inAny[k2]) mark(U[k2], 'safe', waysRule, wClues);
        }
      }

      /* A short piece, asked exhaustively — the piece's own casework, where
         the ways above were a number's. A lone mine under Doubles with two
         cells beside it takes one of them, and a cell touching both leans
         on a finished pair whichever is taken: no way keeps it, so it is
         safe. Every way of completing the piece to its exact size is laid
         out; cells no way can spare fall as mines, and cells every way
         pushes out — the completed group's own surroundings — fall safe.
         Only the exact sizes are asked: under a cap a piece may simply stay
         as it is, and a way in which nothing more is laid excludes nothing.

         Ways may weld pieces together, and a welding that lands the joined
         group on its exact size is a way like any other; one that overruns
         is refused. The reckoning is gathered whole before any marking, as
         every reckoning here is. */
      if (gSize && allowRule('group-fit')) {
        const { id: fid, comps: fcomps } = compsOver(isM, edgOf);
        for (const g of fcomps) {
          const needMore = gSize - g.length;
          if (needMore < 1 || needMore > 3) continue;
          /* The ground a completion could use: every covered cell the piece
             can reach by laying no more than it still needs. Reach is
             counted in cells laid, not in steps taken — passing through a
             mine already found costs nothing, since a way that welds that
             mine's piece in brings it along for free and carries on from the
             far side of it. Walking through covered ground alone missed
             those, and a completion missed is a way missed, which is exactly
             what makes an agreement between ways unsound. It takes three
             cells still wanted for the difference to show, so the sizes up
             to three never revealed it and Quads did at once. */
          const region = [];
          const rSeen = new Map();
          const walked = new Uint8Array(n);
          for (const c of g) walked[c] = 1;
          let ring = g.slice();
          for (let spent = 0; spent <= needMore; spent++) {
            for (let a2 = 0; a2 < ring.length; a2++)
              for (const j2 of edgOf(ring[a2]))
                if (!walked[j2] && isM(j2)) { walked[j2] = 1; ring.push(j2); }
            if (spent === needMore) break;
            const next = [];
            for (const c of ring) for (const j2 of edgOf(c))
              if (!walked[j2] && known[j2] === UNKNOWN) {
                walked[j2] = 1;
                rSeen.set(j2, region.length); region.push(j2); next.push(j2);
              }
            ring = next;
          }
          if (!region.length || region.length > 10) continue;

          const inAll2 = new Array(region.length).fill(true);
          const excluded = new Map();      // cell -> ways that push it out
          let ways2 = 0;
          const tryWay = S => {
            /* legal iff the piece's completed group is exactly the size,
               counting whatever known mines the way welds in */
            const set2 = new Set(S);
            const grown = [g[0]];
            const gSeen = new Set(grown);
            for (let a2 = 0; a2 < grown.length; a2++)
              for (const j2 of edgOf(grown[a2]))
                if ((isM(j2) || set2.has(j2)) && !gSeen.has(j2)) {
                  gSeen.add(j2); grown.push(j2);
                }
            if (grown.length !== gSize) return;
            if (S.some(c => !gSeen.has(c))) return;   // a stray, not a completion
            ways2++;
            const has2 = new Set(S);
            for (let r2 = 0; r2 < region.length; r2++)
              if (!has2.has(region[r2])) inAll2[r2] = false;
            /* What the finished group pushes out — each cell once per way,
               however many of the group's cells it happens to touch. */
            const out2 = new Set();
            for (const c of grown) for (const j2 of edgOf(c))
              if (known[j2] === UNKNOWN && !gSeen.has(j2)) out2.add(j2);
            for (const j2 of out2)
              excluded.set(j2, (excluded.get(j2) || 0) + 1);
          };
          /* Every size up to the need is a candidate way, not only the full
             deficit: a completion that welds a neighbouring piece in brings
             that piece's cells with it and wants fewer new ones. The size
             check inside tryWay is what says whether a way truly lands. */
          const pickWay = (at, chosen) => {
            if (chosen.length) tryWay(chosen);
            if (chosen.length === needMore) return;
            for (let i2 = at; i2 < region.length; i2++) {
              chosen.push(region[i2]); pickWay(i2 + 1, chosen); chosen.pop();
            }
          };
          pickWay(0, []);
          if (!ways2) continue;
          for (let r2 = 0; r2 < region.length; r2++)
            if (inAll2[r2]) mark(region[r2], 'mine', 'group-fit', g);
          for (const [c, k2] of excluded)
            if (k2 === ways2) mark(c, 'safe', 'group-fit', g);
          /* A mark redraws the ground the next piece would be reckoned on —
             a region walked over cells that have since become mines misses
             true completions, and a missed completion is an unsound
             intersection. One piece per sweep, as group-grow learnt. */
          if (moved) break;
        }
      }
    }

    /* The path and the loop: how many mines a known mine must still find
       among its covered neighbours is a count over exactly those cells. The
       degree rules above spend it when it settles the whole set; written as
       a bound it also trades with any number watching the same ground. */
    /* The same two facts as counts over named cells, so they can be set
       against a number watching the same ground: what a mine still owes its
       floor, and what room the ceiling leaves it. */
    if (dLo || dHi < 99) {
      for (let i2 = 0; i2 < n; i2++) {
        if (!isM(i2)) continue;
        const near = [...corOf(i2)];
        const mn = near.filter(isM).length;
        const unk = near.filter(j2 => known[j2] === UNKNOWN);
        bound(unk, dLo - mn, dHi - mn, 'deg-count', [i2]);
      }
    }

    if (has('snake') || has('loop')) {
      const ring = has('loop');
      /* Two mines already worn down to one mine neighbour and no covered
         ground left are the path's two ends, found: after that, every other
         mine is body and wants exactly two beside it. */
      let endsFound = 0;
      if (!ring) for (let i2 = 0; i2 < n; i2++) {
        if (!isM(i2)) continue;
        let mn = 0, unk = 0;
        for (const j2 of edgOf(i2)) {
          if (isM(j2)) mn++;
          else if (known[j2] === UNKNOWN) unk++;
        }
        if (mn === 1 && !unk) endsFound++;
      }
      for (let i2 = 0; i2 < n; i2++) {
        if (!isM(i2)) continue;
        const mn = [...edgOf(i2)].filter(isM);
        const unk = [...edgOf(i2)].filter(j2 => known[j2] === UNKNOWN);
        const lo2 = ring || endsFound >= 2 ? 2 - mn.length
                  : mines >= 2 ? 1 - mn.length : 0;
        bound(unk, lo2, 2 - mn.length,
              ring ? 'loop-count' : 'snake-count', [i2, ...mn]);
      }
    }

    /* Where two pieces can only join through one of two cells, the pair owes
       the chain a mine between them — a floor of one over the two, which
       forces nothing alone and everything in company: spent through a box's
       ceiling or a number's count, it is the first link of the chains.

       Every two-cell cut has at least one member on any single route from
       piece to piece, so the members are found by walking one such route,
       taking each of its cells away in turn, and asking what the ground then
       funnels through — the same question the corridor rule asks, put to the
       bare ground. A cell whose removal strands the far end entirely is a
       cut of one, which reach-cut already forces, and is left to it. */
    if ((has('connected') || has('snake') || has('loop') || has('outside'))) {
      const chainAdj = has('connected') ? joinAdj() : edgOf;
      const passable = c => known[c] === UNKNOWN || isM(c);
      const { id: pid, comps: pieces } = compsOver(isM, chainAdj);
      const toRim = has('outside');
      if (pieces.length >= (toRim ? 1 : 2) && pieces.length <= 6) {
        const pairsOf = [];
        if (toRim) for (let p = 0; p < pieces.length; p++) pairsOf.push([p, -1]);
        else for (let p = 0; p < pieces.length; p++)
          for (let p2 = p + 1; p2 < pieces.length; p2++) pairsOf.push([p, p2]);
        const seenCut = new Set();
        for (const [pa, pb] of pairsOf) {
          // one route from A to B, by breadth
          const prev = new Int32Array(n).fill(-2);
          const q = [];
          for (const c of pieces[pa]) { prev[c] = -1; q.push(c); }
          let hit = -1;
          const isEnd = pb >= 0 ? (c => pid[c] === pb) : (c => !interior[c]);
          for (let h2 = 0; h2 < q.length && hit < 0; h2++)
            for (const j2 of chainAdj(q[h2])) {
              if (prev[j2] !== -2 || !passable(j2)) continue;
              prev[j2] = q[h2]; q.push(j2);
              if (isEnd(j2)) { hit = j2; break; }
            }
          if (hit < 0) continue;
          const route = [];
          for (let c = hit; c >= 0; c = prev[c])
            if (known[c] === UNKNOWN) route.push(c);
          if (route.length > 24) continue;

          for (const u of route) {
            /* the ground with u taken away, walked from the A side */
            const seen2 = new Uint8Array(n);
            const nodes = [];
            for (const c of pieces[pa]) { seen2[c] = 1; nodes.push(c); }
            for (let h2 = 0; h2 < nodes.length; h2++)
              for (const j2 of chainAdj(nodes[h2]))
                if (!seen2[j2] && j2 !== u && passable(j2)) {
                  seen2[j2] = 1; nodes.push(j2);
                }
            if (!nodes.some(isEnd)) continue;    // u alone cuts: reach-cut's case
            for (const v of cutCells(known, nodes, c => seen2[c] === 1, chainAdj,
                                     isEnd, c => pid[c] === pa, 'strand')) {
              const key2 = u < v ? u * n + v : v * n + u;
              if (seenCut.has(key2)) continue;
              seenCut.add(key2);
              bound([u, v], 1, 2, 'reach-need',
                    pieces[pa].concat(pb >= 0 ? pieces[pb] : []));
            }
          }
        }
      }
    }

    /* A bound whose own range pins its whole set spends itself, no partner
       needed. The unary rules above catch most of these, but not all: a
       path mine whose two ends are found must reach its full two, and when
       one of its covered neighbours proves safe, "at least one of what is
       left" can narrow to one cell that no older rule names. Leaving this
       out made the solver non-monotone — a conclusion reachable from the
       opening could become unreachable to a player who knew strictly more,
       because it had been reachable only through a trade whose partner was
       now spent — and a hint game stalled on ground the deal had promised. */
    for (const A of bounds) {
      if (A.lo >= A.cells.length) for (const x of A.cells) mark(x, 'mine', A.rule, A.clues);
      else if (A.hi <= 0) for (const x of A.cells) mark(x, 'safe', A.rule, A.clues);
    }

    /* A chain is priced in the coin of the number it crosses. Under the
       chain laws a mine must reach beyond itself — to the rest of the group,
       or out to the rim — and a mine deep among one number's cells spends
       that number's own count on every link of its way out. Price each cell
       of the number's watch by the cheapest route to ground beyond the
       watch: a route out through d of the number's cells means d mines
       against a count of k, so any cell whose every way out costs more than
       k can hold no mine. A "2" over a four-cell stem hanging off open
       ground prices the outer two cells at three and four, and both fall.

       The group must genuinely extend beyond the watch for the argument to
       bind — a mine already found anywhere does it, since one group must
       reach it, and so do more mines remaining than the number holds. The
       rim needs no such promise: every mine owes it a chain regardless. */
    if (has('connected') || has('snake') || has('loop') || has('outside')) {
      const chainAdj = has('connected') ? joinAdj() : edgOf;
      let foundAll = 0;
      for (let i2 = 0; i2 < n; i2++) if (isM(i2)) foundAll++;
      const binds = has('outside') || foundAll > 0;
      for (const c2 of allowRule('reach-toll') ? constraintsOf(known) : []) {
        const U = c2.cells, k = c2.left;
        if (k === undefined || k < 1 || k >= U.length) continue;
        if (!binds && mines - foundAll <= k) continue;
        const inU = new Map();
        U.forEach((u2, ix) => inU.set(u2, ix));
        const cost = new Int32Array(U.length).fill(-1);
        const q = [];
        for (let ix = 0; ix < U.length; ix++) {
          const u2 = U[ix];
          let exit = has('outside') && !interior[u2];
          if (!exit) for (const j2 of chainAdj(u2))
            if (isM(j2) || (known[j2] === UNKNOWN && !inU.has(j2))) { exit = true; break; }
          if (exit) { cost[ix] = 1; q.push(ix); }
        }
        for (let h2 = 0; h2 < q.length; h2++) {
          const ix = q[h2];
          if (cost[ix] >= k) continue;     // anything deeper is past paying anyway
          for (const j2 of chainAdj(U[ix])) {
            const jx = inU.get(j2);
            if (jx !== undefined && cost[jx] < 0) { cost[jx] = cost[ix] + 1; q.push(jx); }
          }
        }
        for (let ix = 0; ix < U.length; ix++)
          if (cost[ix] < 0 || cost[ix] > k)
            mark(U[ix], 'safe', 'reach-toll', [c2.from]);
      }
    }

    /* The trade itself, worked for any two statements about overlapping
       ground. What the shared cells can hold is pinned from both sides —
       no more than either statement allows, no less than either must put
       there — and each statement's own remainder follows. The subset rule
       is the special case where one set swallows the other.

       And what a trade learns short of forcing is not thrown away: a bound
       carved off the shared cells or a remainder is written back into the
       pool as a statement of its own, and the trading goes round again
       until a round learns nothing new. That is what lets a chain run — a
       floor from the ground's shape spent through a box's ceiling into a
       number, and the number's change of due spent somewhere else again.
       Every derived bound is plain arithmetic on statements true of the
       board, so the chain is as sound at its third link as at its first.
       Rounds and pool are capped: past a few links a chain is casework in
       costume, and the search rules bear that instead. */
    if (bounds.length) {
      const pool = bounds.slice();
      for (const c of constraintsOf(known))
        pool.push({ cells: c.cells, lo: c.lo, hi: c.hi, rule: '', clues: [c.from] });

      // one entry per distinct set, kept at the tightest range yet known
      const keyOf = cells => cells.slice().sort((x, y) => x - y).join(',');
      const best = new Map();
      for (const c of pool) {
        const key = keyOf(c.cells);
        const o = best.get(key);
        if (!o) best.set(key, [c.lo, c.hi]);
        else { o[0] = Math.max(o[0], c.lo); o[1] = Math.min(o[1], c.hi); }
      }

      const owner = new Map();
      const enroll = (c, k) => {
        for (const x of c.cells) {
          let w = owner.get(x); if (!w) owner.set(x, w = []);
          w.push(k);
        }
      };
      pool.forEach(enroll);

      const inA = new Uint8Array(n);
      let from = 0;                      // entries older than this have all met
      for (let round = 0; round < 3 && from < pool.length; round++) {
        const upto = pool.length;
        const fresh = [];
        const derive = (cells, lo, hi, rule, clues) => {
          lo = Math.max(0, lo); hi = Math.min(hi, cells.length);
          if (lo > hi || (lo <= 0 && hi >= cells.length)) return;
          if (cells.length < 1 || cells.length > 12) return;
          if (pool.length + fresh.length > 400) return;
          const key = keyOf(cells);
          const o = best.get(key);
          if (o && lo <= o[0] && hi >= o[1]) return;      // says nothing new
          if (!o) best.set(key, [lo, hi]);
          else { o[0] = Math.max(o[0], lo); o[1] = Math.min(o[1], hi); }
          fresh.push({ cells, lo, hi, rule, clues: clues.slice(0, 12) });
        };

        /* A fresh entry leads every trade it is part of, which is what keeps
           the rounds from re-treading old ground: entries older than `from`
           have already met everything older than themselves. */
        for (let ai = from; ai < upto; ai++) {
          const A = pool[ai];
          if (!A.rule) continue;         // plain numbers never lead a trade
          for (const x of A.cells) inA[x] = 1;
          const partners = new Set();
          for (const x of A.cells) for (const k of owner.get(x)) partners.add(k);
          partners.delete(ai);
          for (const bi of partners) {
            if (pool[bi].rule && bi >= from && bi < ai) continue;  // met already
            if (A.cells.length <= 2 && pool[bi].cells.length <= 2 &&
                pool[bi].rule) continue;  // two bare pairs have nothing to trade
            const B = pool[bi];
            const inter = [], bOut = [];
            for (const x of B.cells) (inA[x] ? inter : bOut).push(x);
            if (!inter.length) continue;
            const aOut = [];
            if (A.cells.length !== inter.length) {
              const inB = new Set(B.cells);
              for (const x of A.cells) if (!inB.has(x)) aOut.push(x);
            }
            const inHi = Math.min(A.hi, B.hi, inter.length);
            const inLo = Math.max(A.lo - aOut.length, B.lo - bOut.length, 0);
            if (inLo > inHi) continue;
            const rule = A.rule || B.rule, clues = A.clues.concat(B.clues);
            if (bOut.length) {
              if (B.hi - inLo <= 0) for (const x of bOut) mark(x, 'safe', rule, clues);
              else if (B.lo - inHi >= bOut.length)
                for (const x of bOut) mark(x, 'mine', rule, clues);
              else derive(bOut, B.lo - inHi, B.hi - inLo, rule, clues);
            }
            if (aOut.length) {
              const aSafe = A.hi - inLo <= 0, aMine = A.lo - inHi >= aOut.length;
              if (aSafe || aMine)
                for (const x of aOut) mark(x, aSafe ? 'safe' : 'mine', rule, clues);
              else derive(aOut, A.lo - inHi, A.hi - inLo, rule, clues);
            }
            if (inLo >= inter.length) for (const x of inter) mark(x, 'mine', rule, clues);
            else if (inHi <= 0) for (const x of inter) mark(x, 'safe', rule, clues);
            else derive(inter, inLo, inHi, rule, clues);
          }
          for (const x of A.cells) inA[x] = 0;
        }

        from = upto;
        for (const c of fresh) { enroll(c, pool.length); pool.push(c); }
      }
    }

    /* And priced across, not merely priced to stay — and dearest of all, so
       asked only when every other rule has gone quiet. Two pieces that must
       join can have several ways between them, and a number watching a
       corridor prices every route that crosses its cells: a two-cell way
       under a "1" is unaffordable though either cell alone is cheap. So for
       each number and each pair of pieces, keep only the ground that lies on
       some route the number can afford — crossings counted from both ends —
       and where that affordable ground all funnels through one cell, the
       chain has no other way: the cell is a mine.

       Sound whatever else is true of the routes: the affordable ground can
       only be too generous, never too mean, since it prices against one
       number and ignores every other law of the chain — so a funnel found
       in it holds for the true routes too. Under Outside the far end is the
       rim itself, which every piece owes a chain regardless. */
    if (!moved && (has('connected') || has('snake') || has('loop') || has('outside')) &&
        (allowRule('reach-way') || allowRule('reach-fare'))) {
      const chainAdj = has('connected') ? joinAdj() : edgOf;
      const passable = c => known[c] === UNKNOWN || isM(c);
      const { id: pid, comps: pieces } = compsOver(isM, chainAdj);
      const toRim = has('outside');
      /* Wide-open ground holds no funnels worth asking after when the coin
         is a number's count — routes abound at that price — so that pricing
         waits until the covered part has narrowed to where a corridor could
         exist at all. Paying in mines is a tighter purse, and finds its
         funnels on open ground too, so it does not wait. */
      let unknownLeft = 0;
      for (let i2 = 0; i2 < n; i2++) if (known[i2] === UNKNOWN) unknownLeft++;
      if (pieces.length >= (toRim ? 1 : 2) && pieces.length <= 6) {
        /* Fewest crossings of the watched cells on any chain from the seed.
           Costs run in small layers, so a bucket a crossing dearer than the
           budget is far enough to look. */
        const price = (seeds, costOf, cap2) => {
          const dist = new Int32Array(n).fill(127);
          const q = Array.from({ length: cap2 + 2 }, () => []);
          for (const [c, d0] of seeds)
            if (d0 <= cap2 + 1 && d0 < dist[c]) { dist[c] = d0; q[d0].push(c); }
          for (let d0 = 0; d0 <= cap2 + 1; d0++)
            for (let h2 = 0; h2 < q[d0].length; h2++) {
              const c = q[d0][h2];
              if (dist[c] < d0) continue;
              for (const j2 of chainAdj(c)) {
                if (!passable(j2)) continue;
                const nd = d0 + costOf(j2);
                if (nd < dist[j2] && nd <= cap2 + 1) { dist[j2] = nd; q[nd].push(j2); }
              }
            }
          return dist;
        };
        // what a route pays: a number's cells for reach-way, every fresh mine for the fare
        const tollOf = inU2 => c => (inU2.has(c) ? 1 : 0);
        const fareOf = c => (isM(c) ? 0 : 1);

        const seedsOf = p => pieces[p].map(c => [c, 0]);
        const pairs = [];
        if (toRim) {
          for (let p = 0; p < pieces.length; p++) pairs.push([p, -1]);
        } else {
          for (let p = 0; p < pieces.length; p++)
            for (let p2 = p + 1; p2 < pieces.length; p2++) pairs.push([p, p2]);
        }

        for (const c2 of allowRule('reach-way') && unknownLeft <= 140
                         ? constraintsOf(known) : []) {
          const k = c2.left;
          if (k === undefined || k < 1 || k > 2 || c2.cells.length <= k) continue;
          const inU2 = new Set(c2.cells);
          for (const [pa, pb] of pairs) {
            const dA = price(seedsOf(pa), tollOf(inU2), k);
            const seedsB = pb >= 0 ? seedsOf(pb)
              : (() => {                     // the rim, wherever a chain could end
                  const s = [];
                  for (let i2 = 0; i2 < n; i2++)
                    if (!interior[i2] && passable(i2))
                      s.push([i2, inU2.has(i2) ? 1 : 0]);
                  return s;
                })();
            if (!seedsB.length) continue;
            const dB = price(seedsB, tollOf(inU2), k);

            // the ground on some route the number can afford
            const inK = c =>
              passable(c) && dA[c] + dB[c] - (inU2.has(c) ? 1 : 0) <= k;
            const start = pieces[pa][0];
            if (!inK(start)) continue;       // no affordable route at all: not ours to fix
            const nodes = [start];
            const seen2 = new Uint8Array(n);
            seen2[start] = 1;
            for (let h2 = 0; h2 < nodes.length; h2++)
              for (const j2 of chainAdj(nodes[h2]))
                if (!seen2[j2] && inK(j2)) { seen2[j2] = 1; nodes.push(j2); }
            const isA2 = pb >= 0 ? (c => pid[c] === pb) : (c => !interior[c]);
            const isB2 = c => pid[c] === pa;
            if (!nodes.some(isA2)) continue; // the far end never came affordable
            for (const u of cutCells(known, nodes, c => seen2[c] === 1,
                                     chainAdj, isA2, isB2, 'strand'))
              mark(u, 'mine', 'reach-way', [c2.from, ...pieces[pa]]);
          }
        }

        /* And the same routes priced in the plainer coin: not what a number
           can pay, but what the board can. Every covered cell a route runs
           through is a mine spent, and only so many are left — so a way of
           five cells cannot be walked with three mines in hand. Keep the
           ground on some route the purse can afford, and where that ground
           funnels through one cell, the join has no other way.

           Mines already found cost nothing to pass, being spent already.
           The purse is what is left after them, and it is the same purse for
           every pair, so a pair that cannot be afforded at all simply says
           nothing here — some other pair is meeting the cost. */
        if (allowRule('reach-fare')) {
          let found = 0;
          for (let i2 = 0; i2 < n; i2++) if (isM(i2)) found++;
          const purse = mines - found;
          if (purse >= 1) for (const [pa, pb] of pairs) {
            const dA = price(seedsOf(pa), fareOf, purse);
            const seedsB = pb >= 0 ? seedsOf(pb)
              : (() => {
                  const s = [];
                  for (let i2 = 0; i2 < n; i2++)
                    if (!interior[i2] && passable(i2)) s.push([i2, isM(i2) ? 0 : 1]);
                  return s;
                })();
            if (!seedsB.length) continue;
            const dB = price(seedsB, fareOf, purse);
            const inK = c =>
              passable(c) && dA[c] + dB[c] - (isM(c) ? 0 : 1) <= purse;
            const start = pieces[pa][0];
            if (!inK(start)) continue;
            const nodes = [start];
            const seen2 = new Uint8Array(n);
            seen2[start] = 1;
            for (let h2 = 0; h2 < nodes.length; h2++)
              for (const j2 of chainAdj(nodes[h2]))
                if (!seen2[j2] && inK(j2)) { seen2[j2] = 1; nodes.push(j2); }
            const isA2 = pb >= 0 ? (c => pid[c] === pb) : (c => !interior[c]);
            const isB2 = c => pid[c] === pa;
            if (!nodes.some(isA2)) continue;
            for (const u of cutCells(known, nodes, c => seen2[c] === 1,
                                     chainAdj, isA2, isB2, 'strand'))
              mark(u, 'mine', 'reach-fare', pieces[pa]);
          }
        }
      }
    }

  }
  return moved;
}

// The same sweep, run for its findings rather than its effects.
function rulesetHint(known) {
  hintHit = null;
  try { rulesetMoves(known, true); }
  catch (e) { if (e !== HINT_STOP) throw e; }
  return hintHit;
}

/* Everything that is true of every board consistent with what is on show.
   Sound and nothing but: each rule it uses is a valid inference from the
   numbers uncovered, the mine counter and the law, so a cell it marks safe
   is safe whatever the rest of the board turns out to be. */
function visibleClosure() {
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (state[i] === OPEN) known[i] = SAFE;
  visibleOnly = true;
  try { deduce(known); } finally { visibleOnly = false; }
  return known;
}

/* Could a mine be here at all? The closure settles most cells outright and
   cheaply, and where it does the answer is already in hand. Where it does
   not, the question has to be put properly, because "my rules cannot show
   this empty" is not the same as "this could hold a mine" — and a player who
   reasons better than the solver was being punished for the difference.

   So: hold everything the closure did settle, and search the rest for any
   arrangement fitting every number on show, the mine counter and the law,
   with a mine on the cell in question. Fixing what is already known keeps
   that search small. A search too large to finish gives the player the
   benefit of the doubt, since killing them on a maybe is the failure that
   matters. */
let strictWitness = null;              // the board the last search turned up
let searchBlown = false;               // the last search gave up, not answered

function couldBeMine(cell) { return couldHold(cell, 1); }

/* Could the cell hold `bit` in any complete board that fits every number on
   show, the mine counter and the law? Asked with 1 it is the strict law's
   question; asked with 0 it is the other side of the same coin — no board
   without a mine here means a mine here — and the hint of last resort asks
   both. */
function couldHold(cell, bit) {
  strictWitness = null;
  searchBlown = false;
  const sure = visibleClosure();
  if (sure[cell] === SAFE) return bit === 0;
  if (sure[cell] === KNOWN_MINE) return bit === 1;

  const vi = new Int32Array(n).fill(-1);
  const fixed = new Uint8Array(n);
  const vars = [];
  for (let i = 0; i < n; i++) {
    if (state[i] === OPEN) continue;
    if (sure[i] === UNKNOWN) { vi[i] = vars.length; vars.push(i); }
    else if (sure[i] === KNOWN_MINE) fixed[i] = 1;
  }

  const cons = [];
  const add = (cells, need) => { if (cells.length) cons.push({ cells, need }); };
  for (let i = 0; i < n; i++) {
    if (state[i] !== OPEN || muted[i]) continue;
    const cells = [];
    let need = count[i];
    for (const j of nbOf(i)) {
      if (state[j] === OPEN) continue;
      if (vi[j] >= 0) cells.push(vi[j]); else need -= fixed[j];
    }
    add(cells, need);
  }
  {
    const cells = [];
    let need = mines;
    for (let i = 0; i < n; i++) {
      if (state[i] === OPEN) continue;
      if (vi[i] >= 0) cells.push(vi[i]); else need -= fixed[i];
    }
    add(cells, need);
  }

  const val = new Int8Array(vars.length).fill(-1);
  const ones = new Int32Array(cons.length), free = new Int32Array(cons.length);
  cons.forEach((c, k) => { free[k] = c.cells.length; });
  const inCons = vars.map(() => []);
  cons.forEach((c, k) => { for (const v of c.cells) inCons[v].push(k); });

  const feasible = () => {
    for (let k = 0; k < cons.length; k++) {
      const left = cons[k].need - ones[k];
      if (left < 0 || left > free[k]) return false;
    }
    return true;
  };
  const set = (v, b) => { val[v] = b; for (const k of inCons[v]) { free[k]--; if (b) ones[k]++; } };
  const drop = (v, b) => { val[v] = -1; for (const k of inCons[v]) { free[k]++; if (b) ones[k]--; } };

  const truth = mine.slice();
  let hit = false, blown = false, nodes = 0;
  const rec = () => {
    if (hit || blown) return;
    if (++nodes > 300000) { blown = true; return; }
    if (!feasible()) return;
    let best = -1, bf = Infinity;
    for (let k = 0; k < cons.length; k++) if (free[k] > 0 && free[k] < bf) { bf = free[k]; best = k; }
    if (best < 0) {
      const board = new Uint8Array(n);
      for (let i = 0; i < n; i++) board[i] = state[i] === OPEN ? 0 : fixed[i];
      vars.forEach((c, v) => { board[c] = val[v]; });
      if (ruleset !== 'none') {
        mine.set(board);
        const ok = validRuleset();
        mine.set(truth);
        if (!ok) return;
      }
      strictWitness = board;             // an entire board this could have been
      hit = true;
      return;
    }
    const v = cons[best].cells.find(c => val[c] < 0);
    for (const b of [1, 0]) { set(v, b); rec(); drop(v, b); if (hit || blown) return; }
  };
  set(vi[cell], bit);                    // insist, then look
  rec();
  mine.set(truth);
  searchBlown = blown;
  /* A search too large to finish lets the player through. The ordinary rule
     still applies underneath, so a real mine kills them anyway; what this
     avoids is killing them over a cell nobody could settle either way. */
  return blown ? false : hit;
}

function reveal(i) {
  if (over || state[i] !== COVERED) return;
  if (!seeded) seed(i);

  /* The strict law, applied before the board is consulted at all: if what is
     on show leaves any room for this cell to hold a mine, then it holds one.
     Under strict the board really is rewritten to put a mine there — the one
     the search turned up, so that every number on show still reads true and
     the law is still kept — and then the mine is forgiven like any other. */
  if (strict && !dealing && couldBeMine(i)) {
    if (strictWitness) { mine.set(strictWitness); countFromMines(); }
    else mine[i] = 1;            // the solver had already settled it as a mine
    mistakes++;
    flashCell = i; flashUntil = performance.now() + 550;
    return;
  }

  if (mine[i]) {
    mistakes++;
    flashCell = i; flashUntil = performance.now() + 550;
    return;                        // the cell stays covered, the game stays on
  }

  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (state[j] !== COVERED) continue;
    state[j] = OPEN; opened++;
    // only a plain nought cascades: a blank kept back would be given away by it
    if (count[j] === 0 && !muted[j])
      for (const m of nbOf(j)) if (state[m] === COVERED) stack.push(m);
  }
  if (opened === n - mines) win();
}

/* Clicking an open number with exactly its own number of flags round it
   opens everything else it touches — the usual shortcut, and the usual
   punishment if the flags are in the wrong places. */
function chord(i) {
  // nothing to chord on a cell whose number the player cannot see
  if (over || state[i] !== OPEN || muted[i] || count[i] === 0) return;
  let f = 0;
  for (const j of nbOf(i)) if (state[j] === FLAG) f++;
  if (f !== count[i]) return;
  for (const j of nbOf(i)) {
    if (state[j] === COVERED) reveal(j);
    if (over) return;
  }
}

function flag(i) {
  if (over || state[i] === OPEN) return;
  if (state[i] === FLAG) { state[i] = COVERED; flags--; }
  else { state[i] = FLAG; flags++; }
}

/* Giving up. Nothing on the board can end a game any more, so this is the
   only way one ends unwon: the player asks to see it. Everything is turned
   face up, mines included, and the clock stops where it stood. */
function giveUp() {
  if (over) return;
  over = true; won = false; exploded = -1;
  endTime = startTime ? performance.now() : 0;
  for (let j = 0; j < n; j++) if (state[j] !== OPEN) state[j] = OPEN;
  clearHint();
}

function win() {
  over = true; won = true;
  endTime = performance.now();
  /* A record needs a clock that was really running — startTime is only set by
     the player's own first move — a board from a standard size, and a board
     played clean: not a mine touched, not a hint asked for. A forgiven mine
     costs nothing but the record, which is the whole of what it costs. */
  const key = startTime && !strict && !mistakes && !hintsUsed && !historyLost && bestKey();
  if (key) {
    const t = endTime - startTime;
    if (!(key in bests) || t < bests[key]) { bests[key] = t; newBest = true; saveBests(); }
  }
  for (let j = 0; j < n; j++) if (mine[j] && state[j] !== FLAG) { state[j] = FLAG; flags++; }
}

/* =====================================================================
   6. NO GUESSING

   A board is only fair if every cell that is not a mine can be reasoned
   out. Three kinds of reasoning are allowed here, and they are the three
   a player actually uses:

     counting  a number with its mines all accounted for has nothing but
               safe ground left, and one with only just enough covered
               cells left to hold its mines has nothing but mines;

     subsets   if one number's covered cells all lie inside another's,
               the difference between the two numbers is spread over
               exactly the cells the second has and the first has not —
               which is the 1-2-1 and all its relatives;

     the total the mine counter is information too, and near the end it
               is often the only thing that settles the last corner.

   The generator scatters mines, then follows that reasoning as far as it
   goes. Wherever it stops short it hands over one more cell for nothing
   and carries on. Those handed-over cells are what the board starts with
   showing. Since the three rules alone always finish the job, a player
   who knows them never has to guess — and a player who reasons better
   than they do is only ever further ahead.

   None of this knows or cares which tiling it is working on. It asks the
   board who touches whom and nothing else, so a tiling whose cells have
   nine neighbours is no different to it than one whose cells have five.
   ===================================================================== */

const UNKNOWN = 0, SAFE = 1, KNOWN_MINE = 2;

// Opening a cell the way the board does, cascading through the blanks.
function markOpen(known, i) {
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (known[j] !== UNKNOWN) continue;
    known[j] = SAFE;
    // the same conditions the uncovering itself applies; and under a
    // supposition a blank not already proven cannot cascade, for the same
    // reason its number cannot be read
    if (count[j] === 0 && !muted[j] && !visibleOnly && (!hypoKnown || hypoKnown[j] === SAFE))
      for (const m of nbOf(j)) if (known[m] === UNKNOWN) stack.push(m);
  }
}

/* What each open number still has to say: the covered cells it looks at and
   how many mines are left among them. Each is a true statement about the
   board, so it stays true as other cells are worked out — which is why a
   whole sweep of them can be used before any of them is rebuilt. */
/* Ordinarily the solver may read the number on a cell it has only proved safe,
   because the player could uncover it for nothing and would then see it. Asking
   what the board shows *now* is a different question, and for that the solver
   must be held to the cells actually uncovered. */
let visibleOnly = false;

/* Every clue as an interval over the cells it still watches. A number says
   the same thing from both sides at once, so its floor and its ceiling are
   the one figure; the trades and the ways rules read the two ends, which is
   what lets the box laws' looser statements sit beside the numbers. */
function constraintsOf(known) {
  const cons = [];
  for (let i = 0; i < n; i++) {
    if (known[i] !== SAFE || muted[i]) continue;    // a muted cell states nothing
    /* Under a supposition, a number is readable only where the position
       before the supposing had already proven it: a cell derived safe inside
       the hypothetical cannot be clicked — the assumption might be false —
       so its number is not the player's to lean on. */
    if (hypoKnown && hypoKnown[i] !== SAFE) continue;
    if (visibleOnly && state[i] !== OPEN) continue;  // nor does one still covered
    const cells = [];
    let found = 0;
    for (const j of nbOf(i)) {
      if (known[j] === UNKNOWN) cells.push(j);
      else if (known[j] === KNOWN_MINE) found++;
    }
    if (!cells.length) continue;
    const left = count[i] - found;
    cons.push({ from: i, cells, left, lo: left, hi: left });
  }
  return cons;
}

/* The mine counter, set among the numbers. The rules that lay a number's
   mines every way its law allows treat each number as a statement about
   named cells; the count of mines still out there is exactly such a
   statement, over all the covered ground at once, and towards the end of a
   board it is often the only one still saying anything.

   Four mines left over five covered cells, four of which all touch each
   other under a law that forbids a huddle that size, settles the fifth —
   and no number on the board says so, because the reasoning is the
   counter's and not any number's. Handed over only while the ground left is
   small enough to lay out, which is precisely what the endgame is. */
function constraintsWithTotal(known) {
  const cons = constraintsOf(known);
  let left = mines;
  const cells = [];
  for (let i = 0; i < n; i++) {
    if (known[i] === KNOWN_MINE) left--;
    else if (known[i] === UNKNOWN) cells.push(i);
  }
  /* Eight cells and no more. The rules that take this statement lay it out
     case by case, and the cases double with every cell — at eight there are
     seventy at the worst, which is nothing, and at twelve there are nine
     hundred, which is felt in every deal. Eight is well past the size of
     endgame the counter is wanted for. */
  if (cells.length && cells.length <= 8 && left >= 0 && left <= cells.length)
    cons.push({ from: -1, cells, left, lo: left, hi: left });
  return cons;
}

/* Follow the rules as far as they go. Returns how many cells came out safe.
   With a ruleset on, its logic joins in; mode 'base' keeps it out, which is
   how the generator proves a board cannot be solved while ignoring the law. */
function deduce(known, mode) {
  const setSafe = j => {
    if (known[j] !== UNKNOWN) return false;
    if (chainLog) chainLog.push({ cell: j, kind: 'safe', rule: '' });
    markOpen(known, j);
    return true;
  };
  const setMine = j => {
    if (known[j] !== UNKNOWN) return false;
    if (chainLog) chainLog.push({ cell: j, kind: 'mine', rule: '' });
    known[j] = KNOWN_MINE;
    return true;
  };

  const counting = () => {
    let moved = false;
    for (const c of constraintsOf(known)) {
      /* A ceiling of nought clears the ground under it, and a floor as high
         as the ground is wide fills it. A plain number is both at once, and
         so reaches whichever of the two applies, exactly as before. */
      if (c.hi === 0 && allowRule('counting-clear'))
        for (const j of c.cells) { if (setSafe(j)) { moved = true; tallyRule('counting-clear'); } }
      else if (c.lo === c.cells.length && allowRule('counting-full'))
        for (const j of c.cells) { if (setMine(j)) { moved = true; tallyRule('counting-full'); } }
    }
    return moved;
  };

  const subsets = () => {
    if (!allowRule('subset')) return false;
    const cons = constraintsOf(known);
    const owner = new Map();                 // cell -> the numbers watching it
    for (const c of cons) for (const x of c.cells) {
      let w = owner.get(x); if (!w) owner.set(x, w = []); w.push(c);
    }
    let moved = false;
    for (const a of cons) {
      const seen = new Set();
      for (const x of a.cells) for (const b of owner.get(x)) {
        if (b === a || seen.has(b) || b.cells.length <= a.cells.length) continue;
        seen.add(b);
        if (!a.cells.every(y => b.cells.includes(y))) continue;
        const diff = b.cells.filter(y => !a.cells.includes(y));
        /* What the difference must hold is at least the larger's floor less
           the smaller's ceiling, and at most the larger's ceiling less the
           smaller's floor. For two plain numbers both come to the same
           figure, which is the old rule unchanged. */
        if (b.hi - a.lo <= 0)
          for (const j of diff) { if (setSafe(j)) { moved = true; tallyRule('subset'); } }
        else if (b.lo - a.hi >= diff.length)
          for (const j of diff) { if (setMine(j)) { moved = true; tallyRule('subset'); } }
      }
    }
    return moved;
  };

  /* Two numbers whose cells overlap without either containing the other
     still pin the shared ground between them: it can hold no more than
     either number allows over its own cells, and no less than either must
     put there once its private cells are all given over. When that squeeze
     leaves a number's remainder nothing or everything, cells are settled
     that no subset could reach. The subset rule is the special case where
     one set swallows the other; this is the rest of that idea. */
  const crossed = () => {
    if (!allowRule('crossed')) return false;
    const cons = constraintsOf(known);
    const owner = new Map();
    for (const c of cons) for (const x of c.cells) {
      let w = owner.get(x); if (!w) owner.set(x, w = []); w.push(c);
    }
    let moved = false;
    const took = v => { if (v) { moved = true; tallyRule('crossed'); } return v; };
    for (const a of cons) {
      const seen = new Set([a]);
      const inA = new Set(a.cells);
      for (const x of a.cells) for (const b of owner.get(x)) {
        if (seen.has(b)) continue;
        seen.add(b);
        let interN = 0;
        for (const y of b.cells) if (inA.has(y)) interN++;
        const aOut = a.cells.length - interN, bOut = b.cells.length - interN;
        const inHi = Math.min(a.hi, b.hi, interN);
        const inLo = Math.max(a.lo - aOut, b.lo - bOut, 0);
        if (inLo > inHi) continue;
        if (bOut) {
          if (b.hi - inLo <= 0) {
            for (const y of b.cells) if (!inA.has(y)) took(setSafe(y));
          } else if (b.lo - inHi >= bOut) {
            for (const y of b.cells) if (!inA.has(y)) took(setMine(y));
          }
        }
        if (aOut) {
          const inB = new Set(b.cells);
          if (a.hi - inLo <= 0) {
            for (const y of a.cells) if (!inB.has(y)) took(setSafe(y));
          } else if (a.lo - inHi >= aOut) {
            for (const y of a.cells) if (!inB.has(y)) took(setMine(y));
          }
        }
        if (interN && inLo >= interN)
          for (const y of b.cells) if (inA.has(y)) took(setMine(y));
      }
    }
    return moved;
  };

  const total = () => {
    const covered = [];
    let found = 0;
    for (let i = 0; i < n; i++) {
      if (known[i] === UNKNOWN) covered.push(i);
      else if (known[i] === KNOWN_MINE) found++;
    }
    const left = mines - found;
    let moved = false;
    if (left === 0 && allowRule('total-none')) {
      for (const j of covered) { if (setSafe(j)) { moved = true; tallyRule('total-none'); } }
      return moved;
    }
    if (left === covered.length && allowRule('total-all')) {
      for (const j of covered) { if (setMine(j)) { moved = true; tallyRule('total-all'); } }
      return moved;
    }
    // one number holding every mine that is left leaves the rest of the board clear
    for (const a of constraintsOf(known)) {
      const inA = new Set(a.cells);
      if (a.left === left && allowRule('total-elsewhere-clear'))
        for (const j of covered) {
          if (!inA.has(j) && setSafe(j)) { moved = true; tallyRule('total-elsewhere-clear'); }
        }
      else if (left - a.left === covered.length - a.cells.length &&
               allowRule('total-elsewhere-mined'))
        for (const j of covered) {
          if (!inA.has(j) && setMine(j)) { moved = true; tallyRule('total-elsewhere-mined'); }
        }
      if (moved) break;
    }
    return moved;
  };

  const structural = () =>
    ruleset !== 'none' && mode !== 'base' && rulesetMoves(known);

  /* Cheapest reasoning first, and back to it the moment anything gives way.
     The stages run to a fixpoint, so the order they are tried in cannot
     change what comes out — only how long it takes to get there, and a law
     is dearer to ask than a sweep of subsets is. Asking the law after them
     rather than before saves a quarter of the time on a snake, which is
     worth having now that Harder solves a board over and over to find out
     what it can spare. Crossed numbers earn their keep rarely, so they are
     asked rarest of all. */
  /* And dearest of all, the supposition — one clone of the whole position
     per candidate, so it runs only where it is asked for: the measurements,
     and the qualification of boards that must need it. The hints reach it
     by their own road and are not gated here. */
  const supposition = () => {
    if (!supposeOn || supposing || mode === 'base' || !allowRule('suppose')) return false;
    const s2 = supposeFind(known);
    if (!s2) return false;
    if (s2.kind === 'safe' ? setSafe(s2.cell) : setMine(s2.cell)) { tallyRule('suppose'); return true; }
    return false;
  };

  while (counting() || subsets() || structural() || crossed() || total() ||
         supposition()) { /* keep going */ }

  let safe = 0;
  for (let i = 0; i < n; i++) if (known[i] === SAFE) safe++;
  return safe;
}

/* =====================================================================
   6a. HINTS

   A hint is the solver stopped at the first thing it finds, and then asked
   where that came from. The escalation is the solver's own — counting,
   then the law, then subsets, then the mine counter — so a hint never
   reaches for a harder tool than the position actually calls for.

   A flag is the player's opinion, and an opinion is not evidence: a hint
   worked out around a misplaced flag would be a falsehood told with a
   straight face. So every flag is checked against the board first, and a
   wrong one is reported in place of the hint: asking once says only that
   one of them is wrong, asking again says which. Once they have all been
   checked they are true, and the hint may then stand on them and carry on
   from where the player really is.
   ===================================================================== */

/* Asked at tier one first, then two, then three, so a hint names the
   gentlest kind of reasoning the position yields to: a player is never shown
   a crossed-number argument where a subset would have done, whatever order
   the rules happen to sit in. The same ceiling the generator reasons under,
   worn here for a different end. */
/* =====================================================================
   THE SUPPOSITION — reasoning by granting the opposite.

   Suppose a covered cell held a mine (or did not), and follow the ordinary
   named rules forward inside that supposed world. If they arrive at
   something no board could be — a number owed more than its ground, mines
   cut off from one another, a group grown past its law — the supposition
   was false, and the cell is settled the other way.

   This is the chain the flat rules cannot make: a disjunction carried
   through several numbers' arithmetic at once. Its soundness rests on two
   things. Every rule used inside the supposed world is itself sound, so a
   contradiction really does condemn the assumption; and the supposed world
   is told nothing the player could not know — numbers are readable only
   where the position had already proven them, which is what hypoKnown
   masks. Its explainability rests on the same design: the refutation is a
   sequence of named steps, each with its own wording, so the hint can walk
   a player through the story one press at a time.
   ===================================================================== */
let supposing = false;         // no suppositions inside suppositions
let hypoKnown = null;          // while set, the mask described above

/* What no board could be. Only certainties: every check here must be a law
   or a count already violated beyond saving, since the whole argument
   stands on the breaking being real. */
function lawBroken(k2) {
  for (const c of constraintsOf(k2))
    if (c.left < 0 || c.left > c.cells.length)
      return 'a number is owed more than its ground could ever give';
  let found = 0, covered = 0;
  for (let i = 0; i < n; i++) {
    if (k2[i] === KNOWN_MINE) found++;
    else if (k2[i] === UNKNOWN) covered++;
  }
  if (found > mines) return 'more mines than the board holds';
  if (found + covered < mines) return 'too little ground is left for the mines that remain';
  const dHi = degCap();
  if (dHi < 99) for (let i = 0; i < n; i++) {
    if (k2[i] !== KNOWN_MINE) continue;
    let d = 0;
    for (const j of corOf(i)) if (k2[j] === KNOWN_MINE) d++;
    if (d > dHi) return 'a mine ends up more crowded than the law allows';
  }
  const gLim = groupSize() || groupCap();
  if (gLim) {
    const seen = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (k2[i] !== KNOWN_MINE || seen[i]) continue;
      let size = 0;
      const st = [i]; seen[i] = 1;
      while (st.length) {
        const c = st.pop(); size++;
        for (const j of edgOf(c)) if (k2[j] === KNOWN_MINE && !seen[j]) { seen[j] = 1; st.push(j); }
      }
      if (size > gLim) return 'a group grows past what the law allows';
    }
  }
  if (has('snake') || has('loop')) for (let i = 0; i < n; i++) {
    if (k2[i] !== KNOWN_MINE) continue;
    let d = 0;
    for (const j of edgOf(i)) if (k2[j] === KNOWN_MINE) d++;
    if (d > 2) return 'the path would have to run alongside itself';
  }
  if (has('connected')) {
    const adj = joinAdj();
    const open = i => k2[i] === UNKNOWN || k2[i] === KNOWN_MINE;
    const { id, comps } = compsOver(open, adj);
    const held = [];
    for (let i = 0; i < n; i++) if (k2[i] === KNOWN_MINE) held.push(i);
    if (held.length) {
      if (held.some(m => id[m] !== id[held[0]]))
        return 'mines end up cut off from one another';
      const home = comps.find(g => id[g[0]] === id[held[0]]);
      if (home && home.length < mines)
        return 'the mines are shut in a piece too small to hold them all';
    }
  }
  return '';
}

// the cells worth supposing about: covered ground some number is watching
function supposeCands(known) {
  const seen = new Set(), out = [];
  for (const c of constraintsOf(known))
    for (const j of c.cells)
      if (!seen.has(j)) { seen.add(j); out.push(j); }
  if (out.length > 40) out.length = 40;
  return out;
}

/* One supposition, tried to its end: assume, propagate with the full rule
   set under the mask, and report what broke — or nothing. */
function supposeTry(known, c, bit) {
  const k2 = known.slice();
  if (bit) k2[c] = KNOWN_MINE; else k2[c] = SAFE;
  const keepT = ruleTally;
  hypoKnown = known; ruleTally = null; supposing = true;
  let why = '';
  try {
    deduce(k2);
    why = lawBroken(k2);
  } finally { hypoKnown = null; ruleTally = keepT; supposing = false; }
  return why;
}

// the first cell a supposition settles, with which way and why
function supposeFind(known) {
  for (const c of supposeCands(known)) {
    for (const bit of [1, 0]) {
      const why = supposeTry(known, c, bit);
      if (why) return { cell: c, kind: bit ? 'safe' : 'mine', why };
    }
  }
  return null;
}

/* The story, taken down rather than re-derived. An earlier version walked
   the refutation again with the hint machinery, one rule at a time, and on
   the path laws it never arrived: this solver is not monotone, so a walk in
   a different order can dodge the very cut that broke the law for the batch
   solve. What cannot diverge is a recording. The batch run keeps a log of
   every mark it makes inside the supposed world, each stamped with its
   rule; the log is then replayed from the assumption and cut at the first
   moment the law is already broken, and what remains — grouped by rule, in
   the order it truly happened — is the proof itself, step by step. */
function supposeStory(known, cell, kind) {
  const k2 = known.slice();
  if (kind === 'safe') k2[cell] = KNOWN_MINE; else k2[cell] = SAFE;
  const keepT = ruleTally;
  hypoKnown = known; ruleTally = null; supposing = true; chainLog = [];
  let log;
  try {
    deduce(k2);
    log = chainLog;
  } finally { hypoKnown = null; ruleTally = keepT; supposing = false; chainLog = null; }

  // group the marks into steps: one step per unbroken run of the same rule
  const steps = [];
  for (const e of log) {
    const last = steps[steps.length - 1];
    if (last && last.rule === e.rule && last.kind === e.kind) last.cells.push(e.cell);
    else steps.push({ rule: e.rule || 'counting-clear', kind: e.kind, cells: [e.cell], clues: [] });
  }
  if (steps.length > 20) return null;      // a saga is no hint; stand without it

  // replay from the assumption and cut where the law is first already broken
  const k3 = known.slice();
  if (kind === 'safe') k3[cell] = KNOWN_MINE; else k3[cell] = SAFE;
  hypoKnown = known;
  try {
    let why = lawBroken(k3);
    let upTo = steps.length;
    for (let t = 0; t < steps.length && !why; t++) {
      for (const c of steps[t].cells) {
        if (steps[t].kind === 'safe') markOpen(k3, c); else k3[c] = KNOWN_MINE;
      }
      why = lawBroken(k3);
      if (why) upTo = t + 1;
    }
    if (!why) return null;                 // the log did not carry the break
    return { steps: steps.slice(0, upTo), why };
  } finally { hypoKnown = null; }
}

function supposeHint(known) {
  const s = supposeFind(known);
  if (!s) return null;
  const tale = supposeStory(known, s.cell, s.kind);
  return { cells: [s.cell], kind: s.kind, rule: 'suppose', clues: [],
           steps: tale ? tale.steps : null, why: tale ? tale.why : s.why };
}

function findHint(known) {
  for (const cap of [1, 2, 3]) {
    tierCap = cap;
    try {
      const h = findHintAt(known);
      if (h) return h;
    } finally { tierCap = 0; }
  }
  return searchHint(known) || replayHint(known);
}

/* The very last resort under the last one. The exhaustion search proves its
   answers by trying every completion, and on a board hiding most of its
   numbers there can be too little to prune by: the refutations it needs
   blow their budget and it comes home empty. But the deal itself once
   solved this board, from the opening, by the named rules — that is the
   promise every board is built on — and a player who wandered another way
   still holds everything the opening held. So the solve is played again
   from the dealt cells alone, in quiet, until it settles something the
   player has not: that hint was good on the day the board was made, and
   what was sound then is sound now. */
function replayHint(known) {
  if (!dealt.length) return null;
  const k0 = new Uint8Array(n);
  for (const g of dealt) markOpen(k0, g);
  for (let guard = 0; guard < 100000; guard++) {
    let h = null;
    for (const cap of [1, 2, 3]) {
      tierCap = cap;
      try { h = findHintAt(k0); } finally { tierCap = 0; }
      if (h) break;
    }
    if (!h) break;
    if (h.cells.some(c => known[c] === UNKNOWN))
      return { cells: h.cells.filter(c => known[c] === UNKNOWN),
               kind: h.kind, rule: h.rule, clues: h.clues };
    for (const c of h.cells) {
      if (h.kind === 'safe') markOpen(k0, c); else k0[c] = KNOWN_MINE;
    }
  }

  /* The hints walk the rules in their own order, and that order is not the
     solver's: some rules read the lie of the ground, and two sound paths
     from the same opening can part ways. When the hint-ordered replay runs
     dry, the solve itself is run instead — the very computation the deal
     was accepted on — and anything it settles that the player has not is
     handed over. It cannot come home empty on a board this build dealt. */
  const k1 = new Uint8Array(n);
  for (const g of dealt) markOpen(k1, g);
  deduce(k1);
  for (let c = 0; c < n; c++) {
    if (known[c] !== UNKNOWN || k1[c] === UNKNOWN) continue;
    return { cells: [c], kind: k1[c] === SAFE ? 'safe' : 'mine',
             rule: 'replay', clues: [] };
  }
  return null;
}

function findHintAt(known) {
  const cons = constraintsOf(known);

  for (const c of cons) {
    if (c.hi === 0)
      return { cells: c.cells.slice(), kind: 'safe', rule: 'counting-clear', clues: [c.from] };
    if (c.lo === c.cells.length)
      return { cells: c.cells.slice(), kind: 'mine', rule: 'counting-full', clues: [c.from] };
  }

  if (ruleset !== 'none') {
    const h = rulesetHint(known);
    if (h) return h;
  }

  const owner = new Map();                 // cell -> the numbers watching it
  for (const c of cons) for (const x of c.cells) {
    let w = owner.get(x); if (!w) owner.set(x, w = []); w.push(c);
  }
  for (const a of allowRule('subset') ? cons : []) {
    const seen = new Set();
    for (const x of a.cells) for (const b of owner.get(x)) {
      if (b === a || seen.has(b) || b.cells.length <= a.cells.length) continue;
      seen.add(b);
      if (!a.cells.every(y => b.cells.includes(y))) continue;
      const diff = b.cells.filter(y => !a.cells.includes(y));
      if (b.hi - a.lo <= 0) return { cells: diff, kind: 'safe', rule: 'subset', clues: [a.from, b.from] };
      if (b.lo - a.hi >= diff.length) return { cells: diff, kind: 'mine', rule: 'subset', clues: [a.from, b.from] };
    }
  }

  // crossed numbers, where neither set swallows the other — deduce's twin
  for (const a of allowRule('crossed') ? cons : []) {
    const seen = new Set([a]);
    const inA = new Set(a.cells);
    for (const x of a.cells) for (const b of owner.get(x)) {
      if (seen.has(b)) continue;
      seen.add(b);
      const inter = b.cells.filter(y => inA.has(y));
      const aOut = a.cells.length - inter.length, bOut = b.cells.length - inter.length;
      const inHi = Math.min(a.hi, b.hi, inter.length);
      const inLo = Math.max(a.lo - aOut, b.lo - bOut, 0);
      if (inLo > inHi) continue;
      const say = (cells, kind) =>
        ({ cells, kind, rule: 'crossed', clues: [a.from, b.from] });
      if (bOut) {
        const diff = b.cells.filter(y => !inA.has(y));
        if (b.hi - inLo <= 0) return say(diff, 'safe');
        if (b.lo - inHi >= bOut) return say(diff, 'mine');
      }
      if (aOut) {
        const inB = new Set(b.cells);
        const diff = a.cells.filter(y => !inB.has(y));
        if (a.hi - inLo <= 0) return say(diff, 'safe');
        if (a.lo - inHi >= aOut) return say(diff, 'mine');
      }
      if (inter.length && inLo >= inter.length) return say(inter, 'mine');
    }
  }

  const covered = [];
  let found = 0;
  for (let i = 0; i < n; i++) {
    if (known[i] === UNKNOWN) covered.push(i);
    else if (known[i] === KNOWN_MINE) found++;
  }
  if (!covered.length) return null;
  const left = mines - found;
  if (left === 0) return { cells: covered, kind: 'safe', rule: 'total-none', clues: [] };
  if (left === covered.length) return { cells: covered, kind: 'mine', rule: 'total-all', clues: [] };
  for (const a of allowRule('total-elsewhere-clear') ? cons : []) {
    const inA = new Set(a.cells);
    const rest = covered.filter(j => !inA.has(j));
    if (!rest.length) continue;
    /* Two different readings, and they deserve to be told apart: one number
       wanting every mine that is left says nothing about its own neighbours
       and everything about the rest of the board. */
    if (a.left === left)
      return { cells: rest, kind: 'safe', rule: 'total-elsewhere-clear', clues: [a.from] };
    if (left - a.left === covered.length - a.cells.length)
      return { cells: rest, kind: 'mine', rule: 'total-elsewhere-mined', clues: [a.from] };
  }
  /* Dearest of all, so it is asked last: the supposition. Gated by its
     tier like every rule, and never inside another supposition's world. */
  if (!supposing && allowRule('suppose')) {
    const h = supposeHint(known);
    if (h) return h;
  }

  return null;
}

/* The last method there is. The named rules are not the whole of reasoning,
   and a rare position slips past every one of them: some rules read the lie
   of the covered ground, and ground read one way from the opening can be
   unreadable from the larger knowledge of a player who took another path to
   the same place. So when the rules run dry, the completions themselves are
   tried — a cell that comes out the same in every board the clues still
   allow is settled, whatever the reasoning would have been called. On a
   solvable board reached by true steps such a cell always exists; only a
   search too big to finish can decline to name it, and the cells against
   the numbers are asked first, where the answer is likeliest to be quick. */
function searchHint(known) {
  const covered = [];
  for (let i = 0; i < n; i++) if (known[i] === UNKNOWN) covered.push(i);
  const nearby = [], farOff = [];
  for (const c of covered)
    ([...nbOf(c)].some(j => known[j] === SAFE && !muted[j]) ? nearby : farOff).push(c);
  const stop = performance.now() + 800;
  for (const c of nearby.concat(farOff)) {
    if (performance.now() > stop) break;
    if (!couldHold(c, 1) && !searchBlown)
      return { cells: [c], kind: 'safe', rule: 'search', clues: [] };
    if (!couldHold(c, 0) && !searchBlown)
      return { cells: [c], kind: 'mine', rule: 'search', clues: [] };
  }
  return null;
}

// The second tier: what kind of reasoning the marked cells are asking for.
const HINTWORDS = {
  'counting-clear': 'Counting. A number here already has all its mines accounted for, so the rest of what it touches is clear.',
  'counting-full': 'Counting. A number here has only just enough covered cells left to hold its mines.',
  'subset': "Overlap. One number's covered cells lie wholly inside another's, and the difference between the two numbers settles the cells only the larger one touches.",
  'total-none': 'The mine counter. Every mine has been found, so all the covered ground left is clear.',
  'total-all': 'The mine counter. One covered cell is left for every mine still out there, so all of them are mines.',
  'total-elsewhere-clear': 'The mine counter, against one number. That number still wants every mine the counter says is left, which leaves none for anywhere else — so the covered cells it does NOT touch are clear. Which of its own neighbours hold the mines is still open.',
  'total-elsewhere-mined': 'The mine counter, against one number. Set that number aside and the mines still out there exactly fill the covered cells it does NOT touch — so all of those are mines. Its own neighbours are still open.',
  'snake-body': 'The path. This mine already has both its neighbours, so the path passes it by.',
  'snake-end': 'The path. This end has only one way left to carry on.',
  'snake-touch': 'The path. A mine here would make the path run alongside itself or close into a ring.',
  'loop-degree': 'The loop. Every mine has exactly two mines beside it — count the ones around this one.',
  'loop-short': 'The loop. A mine here would close a ring too small to hold every mine on the board.',
  'loop-close': 'The loop. One mine is left, and it can only be the cell joining the two loose ends.',
  'box-exact': 'The boxes. This box says how many mines it holds, and between what is found and what is left there is only one way to read it.',
  'cap-over': 'The groups. A mine here would join what is beside it into a group bigger than the law allows.',
  'group-full': 'The groups. This group is already the size a group may be, so nothing beside it can be a mine.',
  'group-grow': 'The groups. This group is short of its size and has only one cell left it could grow into.',
  'group-big': 'The groups. A mine here would join what is beside it into a group larger than the law allows.',
  'group-room': 'The groups. There is not enough ground here for a whole group to fit, so none of it can be mine.',
  'box-short': 'The boxes. This box is short of the mines it must hold, and has only just enough covered cells left to make them up.',
  'box-full': 'The boxes. This box already holds every mine it is allowed, so the rest of it is clear.',
  'piece-budget': 'The pieces. The mines end up in one piece, and joining the pieces already showing would take more mines than are left — a mine here would leave one piece too many.',
  'reach-budget': 'The pieces. Reaching this far from the mines already found would cost more mines than remain, so the group cannot stretch to it.',
  'reach-pocket': 'Connectedness. No mine could reach this ground without leaving the group behind.',
  'reach-cut': 'Connectedness. This is the only cell the group has to pass through.',
  'reach-room': 'Connectedness. Take this cell away and no piece of ground left has both the mines already found and room for all of them — so the group must come through here.',
  'reach-owed': 'Connectedness. A number here is still owed a mine, and wherever that mine turns out to be it must join the group — which leaves it only this way through.',
  'conn-ways': 'Connectedness. Take a number — or the mine counter itself, once little ground is left — and lay its mines every way it allows; throw out the ways that would strand the group, and every way left agrees about this cell.',
  'deg-full': 'The crowding. This mine already touches as many mines as the law allows, so everything else beside it is clear.',
  'deg-grow': 'The huddle. This mine is short of the companions it must have, and only just enough covered cells are left to give them.',
  'deg-over': 'The crowding. A mine here would touch more mines than the law allows.',
  'deg-room': 'The huddle. There are too few cells around this one that could ever hold a mine for it to find the companions it would need.',
  'deg-count': 'The huddle. How many companions this mine still owes, or has room for, is a count over the covered cells beside it — and a number watching the same cells trades against it.',
  'suppose': 'The supposition. Grant the opposite for a moment — a mine here, or none — and follow the ordinary rules: they break against the board. Keep pressing to walk the story one step at a time.',
  'deg-ways': 'The crowding, laid out. Take a number — or the mine counter itself, once little ground is left — and lay its mines every way it allows; throw out the ways that crowd some mine past the law, or that leave one unable ever to find its companions, and every way left agrees about this cell. Two cells beside each other that each already touch their fill cannot both be mines, however little else connects them.',
  'reach-fare': 'Connectedness. Every covered cell a route runs through is a mine spent, and only one way of joining these pieces can be paid for with the mines that are left — it comes through here.',
  'reach-toll': 'The chain, priced. A mine here could only chain out through more of this number’s cells than the number has mines to give, so no chain can carry it.',
  'reach-way': 'The one affordable way. Of every route the pieces could still join by, all that this number can pay for pass through here — so the chain does too.',
  'reach-need': 'The narrow join. The pieces can only meet through one of two cells, so between them those two owe a mine — and what watches them spends it.',
  'group-fit': 'The groups. Complete this piece every way its size allows, and every way agrees about this cell.',
  'outside-pocket': 'The border. Every mine must chain edge to edge out to the rim, and no chain could reach this ground.',
  'outside-cut': 'The border. This is the only way left from here out to the rim, so the chain must come through it.',
  'crossed': "Two numbers, crossed. Neither's cells lie wholly inside the other's, but the shared cells are pinned between the two of them, and what is left over on one side is settled by it.",
  'box-count': 'The boxes. What a box can still hold is a count over its covered cells, and a number reaching into it trades against that count until one side’s remainder is settled.',
  'cap-count': 'The groups. The cells round a piece can take only so many mines between them before it grows past the law — so a number watching the same cells must put the rest of its due elsewhere.',
  'group-count': 'The groups. A piece short of its size must take from the cells beside it, and a number watching those cells has that much of its answer spoken for.',
  'snake-count': 'The path. How many mines this mine must still find beside it is a count over its covered neighbours, and a number watching the same cells trades against it.',
  'loop-count': 'The loop. A mine’s covered neighbours must hold exactly what brings it to two, and a number watching the same cells has the difference settled for it.',
  'cap-ways': 'The groups. Take a number — or the mine counter itself, once little ground is left — and lay its mines every way that does not weld a group past the law; every way agrees about this cell.',
  'group-ways': 'The groups. Take a number — or the mine counter itself, once little ground is left — and lay its mines every way that does not swell a group past its size; every way agrees about this cell.',
  'search': 'Exhaustion. Every board the clues still allow has been tried, and in all of them this cell comes out the same way.',
  'replay': 'The deal remembers. Solved from the opening cells alone, the board settles this — retrace it from what was first shown.',
};

const HINTIDLE = 'Asking once marks what to look at; asking again names the reasoning.';

/* What is lit and what has been said. Asking twice about the same position
   says more; touching the board puts the marks out again. */
let hintClues = [], hintLevel = 0, hintAt = '', hintNote = false;

function clearHint() {
  hintAt = '';
  hintClues = [];
  if (hintNote) { hintNote = false; el('noteHint').textContent = HINTIDLE; }
}

/* Which flags sit on cells holding no mine, told the way a hint is told: the
   first ask says only that one of them is wrong, the second says which.

   `clean` decides what happens when they are all right — the hint button has
   a hint to get on with and says nothing, while the check button has nothing
   else to offer and so says so. Returns whether it spoke. */
function reportFlags(clean) {
  const wrong = [];
  for (let i = 0; i < n; i++) if (state[i] === FLAG && !mine[i]) wrong.push(i);

  if (!wrong.length) {
    if (!clean) return false;
    hintClues = []; hintLevel = 0; hintAt = '';
    el('noteHint').textContent = !flags
      ? 'No flags planted yet, so nothing to check.'
      : flags === 1 ? 'Your flag is on a mine.'
      : 'All ' + flags + ' of your flags are on mines.';
    draw();
    return true;
  }

  const sig = 'flags:' + opened + ':' + flags + ':' + wrong.join(',');
  hintLevel = sig === hintAt ? Math.min(2, hintLevel + 1) : 1;
  hintAt = sig;
  const one = wrong.length === 1;
  if (hintLevel >= 2) {
    hintClues = wrong.slice();
    el('noteHint').textContent = one
      ? 'Marked in gold: that flag is on a cell that holds no mine.'
      : 'Marked in gold: those flags are on cells that hold no mine.';
  } else {
    hintClues = [];
    el('noteHint').textContent = (one
      ? 'One of your flags is on a cell that holds no mine.'
      : wrong.length + ' of your flags are on cells that hold no mine.') +
      ' Ask again to be shown where.';
  }
  draw();
  return true;
}

// The flags and nothing else: no deduction is offered either way.
function checkFlags() {
  if (over || !n) return;
  hintNote = true;
  reportFlags(true);
}

function askHint() {
  if (over || !n) return;
  hintNote = true;
  const say = t => { hintClues = []; hintLevel = 0; hintAt = ''; el('noteHint').textContent = t; draw(); };

  // a wrong flag is reported before any hint is worked out
  if (reportFlags(false)) return;

  /* Every flag has just been checked, so the flags can be leaned on: the
     hint then carries on from where the player actually is, rather than
     re-finding mines they marked ten moves ago. */
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (state[i] === OPEN) known[i] = SAFE;
    else if (state[i] === FLAG) known[i] = KNOWN_MINE;
  }

  const h = findHint(known);
  /* Nothing found is not the same as nothing left. Every board this build
     deals proves itself as it is made, so on one of those the hints cannot
     run dry before the end — when they do, the board is almost certainly
     from an older save, resumed across an update that changed what its
     clues meant. Saying "all settled" here was wrong twice over. */
  if (!h) {
    say('No hint was found — which should not happen on a freshly dealt ' +
        'board. This one may predate an update; a new game will always ' +
        'see itself through.');
    return;
  }

  const sig = opened + ':' + flags + ':' + h.rule + ':' + h.cells.join(',');
  /* Most hints have two levels: the ground, then the reasoning. A
     supposition with its story has more — one press per step of the
     refutation, and a verdict at the end — and stays on the verdict once
     it gets there. */
  const walked = h.rule === 'suppose' && h.steps && h.steps.length;
  const top = walked ? 3 + h.steps.length : 2;
  hintLevel = sig === hintAt ? Math.min(top, hintLevel + 1) : 1;
  hintAt = sig;
  // asking the same hint again for its reasoning is the one ask, not two
  if (hintLevel === 1) hintsUsed++;
  // the clues if the rule named any, and otherwise the ground it is talking about
  hintClues = (h.clues.length ? h.clues : h.cells).slice();
  if (walked && hintLevel > 2) {
    const at = hintLevel - 3;               // the steps, then the verdict
    if (at < h.steps.length) {
      const st = h.steps[at];
      hintClues = (st.clues && st.clues.length ? st.clues.concat(st.cells) : st.cells).slice();
      el('noteHint').textContent = 'Under the supposition, step ' + (at + 1) +
        ' of ' + h.steps.length + ': ' + (HINTWORDS[st.rule] || st.rule);
    } else {
      hintClues = h.cells.slice();
      el('noteHint').textContent = 'And there it breaks: ' + h.why +
        '. The supposition was false, so this cell is ' +
        (h.kind === 'safe' ? 'clear.' : 'a mine.');
    }
  } else if (hintLevel >= 2 && h.rule === 'suppose' && !walked) {
    el('noteHint').textContent = (HINTWORDS.suppose || '') +
      ' (This one keeps its working to itself: suppose it, follow the rules, and ' +
      (h.why ? 'find that ' + h.why + '.' : 'watch them break.') + ')';
  } else {
    el('noteHint').textContent = hintLevel >= 2
      ? HINTWORDS[h.rule] || HINTIDLE
      : 'Marked in gold: the clues to work from — the cells they settle may lie ' +
        'elsewhere. Ask again to be told how.';
  }
  draw();
}

/* Which cell to hand over. The first is the opening, and wants to be a blank,
   since a blank cascades and gives the player a region to work from. Every
   handout after that wants the opposite: a bare number, touching ground that
   is already open, which gives away one cell and no more. Handing over another
   blank would cascade too, and a board that cascades twice has told the player
   most of what it knows. */
function pickGiven(known, opening) {
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    if (known[i] !== UNKNOWN || mine[i]) continue;
    let touches = 0;
    for (const j of nbOf(i)) if (known[j] === SAFE) touches++;
    const score = (opening
      ? (openTight ? (count[i] === 0 ? -100 : count[i])
                   : (count[i] === 0 ? 100 : 10 - count[i]))
      : (count[i] === 0 ? 0 : 60) + (touches ? 40 : 0) + count[i]) + Math.random();
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

// How much of the board a set of handouts actually puts on show, cascades and all.
/* Ground the board gives away before a cell is clicked. A box reading
   nought hands over every cell it holds — they can be clicked straight
   away — and a box wanting as many mines as it has cells left hands them
   over just as surely. On the boxed laws that free start can be half again
   what the opening shows, so a level asking for a small opening was getting
   a large one in disguise. Counted here so the judging can see it. */
function freeByBoxes(shown) {
  const law = boxLaw();
  if (!boxes.length) return 0;
  let free = 0;
  for (let b = 0; b < boxes.length; b++) {
    const left = [];
    let held = 0;
    for (const c of boxes[b]) {
      if (mine[c]) held++;
      else if (!shown || shown[c] !== SAFE) left.push(c);
    }
    if (!left.length) continue;
    let lo, hi;
    if (law === 'exact' || law === 'irregular') {
      if (!boxShown) continue;
      [lo, hi] = boxRange(b);
    } else if (law) ({ lo, hi } = boxBounds());
    else return 0;
    // settled outright: no room for another mine, or only room for mines
    if (held >= hi || lo - held >= left.length) free += left.length;
  }
  return free;
}

function shownBy(list) {
  const shown = new Uint8Array(n);
  for (const g of list) markOpen(shown, g);
  let cells = 0;
  for (let i = 0; i < n; i++) if (shown[i] === SAFE) cells++;
  return cells;
}

/* Scatter, reason, hand over, repeat — and since every handout opens at least
   one new cell, it cannot fail to finish.

   Many layouts are tried and the best kept, judged first on how many hints it
   needs beyond the opening. Most layouts of an ordinary density need none at
   all, and one that needs none is just the familiar game with its first click
   already made. Hints are the fallback for crowded boards, where no scattering
   of that many mines can be picked apart from one opening alone. Between two
   layouts asking for the same number of hints the tie goes to the one whose
   opening is nearest a quarter of the board — big enough to work from, small
   enough to leave a game. */
