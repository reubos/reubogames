// ---------------------------------------------------------------------------
// Layout building
// ---------------------------------------------------------------------------

// Convert editor grid into a layout object used by the game engine.
// Tiles are identified by `group` IDs on edCells. Each unique group forms
// one tile; the tile's shape is the set of relative offsets from its anchor.
function buildLayout() {
  const groups = new Map(); // groupId -> [{r,c}]
  const holes = [];
  const blocked = new Set();

  for (let r = 0; r < edRows; r++) {
    for (let c = 0; c < edCols; c++) {
      const cell = edCells[r][c];
      if (cell.type === 'blocked') { blocked.add(r * edCols + c); continue; }
      if (cell.type === 'hole')    { holes.push({r, c}); continue; }
      if (cell.type === 'active') {
        const g = cell.group;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push({r, c});
      }
    }
  }

  // Build tiles from groups
  let nextId = 1;
  const tiles = [];
  for (const [, gcells] of groups) {
    // Anchor = cell with smallest r, then smallest c
    gcells.sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);
    const {r: r0, c: c0} = gcells[0];
    const shapeCells = gcells.map(({r, c}) => ({dr: r - r0, dc: c - c0}));
    tiles.push({id: nextId++, r0, c0, cells: shapeCells});
  }

  // Remove tiles that share a cell with a hole
  const holePosSet = new Set(holes.map(({r, c}) => `${r},${c}`));
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (t.cells.some(({dr, dc}) => holePosSet.has(`${t.r0 + dr},${t.c0 + dc}`))) {
      tiles.splice(i, 1);
    }
  }

  return {
    cols: edCols, rows: edRows, tiles, blocked,
    rowWrap: [...rowWrap], colWrap: [...colWrap],
    barriers: new Set(barriers)
  };
}

// Build the initial board array from a layout.
// -1 = blocked, 0 = empty, N = tile id
function layoutToBoard(layout) {
  const {cols, rows, tiles, blocked} = layout;
  const board = Array(rows * cols).fill(0);
  for (const pos of blocked) board[pos] = -1;
  for (const t of tiles) {
    for (const {dr, dc} of t.cells) {
      board[mod(t.r0 + dr, rows) * cols + mod(t.c0 + dc, cols)] = t.id;
    }
  }
  return board;
}

// Initial tilePos map from layout tiles
function buildTilePos(tiles) {
  const m = new Map();
  tiles.forEach(t => m.set(t.id, {r: t.r0, c: t.c0, cells: t.cells}));
  return m;
}

// Goal positions (anchor r,c) for each tile id
function buildGoalPos(tiles) {
  const m = new Map();
  tiles.forEach(t => m.set(t.id, {r: t.r0, c: t.c0}));
  return m;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function canMove(board, tilePos, id, movedr, movedc, layout) {
  const {rows, cols, rowWrap, colWrap} = layout;
  const {r, c, cells} = tilePos.get(id);
  const cs = cellSet(cells);

  // Current board indices (to detect which new cells are "entering")
  const curIdx = new Set(
    cells.map(({dr, dc}) => mod(r + dr, rows) * cols + mod(c + dc, cols))
  );

  // For each cell on the leading edge (no neighbour in move direction),
  // check wrapping permission and barrier crossing.
  for (const {dr, dc} of cells) {
    if (cs.has(`${dr + movedr},${dc + movedc}`)) continue; // not leading edge

    const fromR = mod(r + dr, rows), fromC = mod(c + dc, cols);
    const rawToR = r + dr + movedr, rawToC = c + dc + movedc;
    const toR = mod(rawToR, rows), toC = mod(rawToC, cols);

    if (movedr !== 0 && (rawToR < 0 || rawToR >= rows) && !colWrap[fromC]) return false;
    if (movedc !== 0 && (rawToC < 0 || rawToC >= cols) && !rowWrap[fromR]) return false;
    if (hasBarrierL(layout, fromR, fromC, toR, toC)) return false;
  }

  // New anchor
  const nr = mod(r + movedr, rows), nc = mod(c + movedc, cols);

  // Check entering cells are empty
  for (const {dr, dc} of cells) {
    const idx = mod(nr + dr, rows) * cols + mod(nc + dc, cols);
    if (!curIdx.has(idx) && board[idx] !== 0) return false;
  }

  // Check no internal barriers within the tile at new position
  for (const {dr, dc} of cells) {
    const r1 = mod(nr + dr, rows), c1 = mod(nc + dc, cols);
    if (cs.has(`${dr},${dc + 1}`)) {
      if (hasBarrierL(layout, r1, c1, r1, mod(nc + dc + 1, cols))) return false;
    }
    if (cs.has(`${dr + 1},${dc}`)) {
      if (hasBarrierL(layout, r1, c1, mod(nr + dr + 1, rows), c1)) return false;
    }
  }

  return true;
}

function applyMove(board, tilePos, id, movedr, movedc, layout) {
  const {rows, cols} = layout;
  const {r, c, cells} = tilePos.get(id);
  for (const {dr, dc} of cells) board[mod(r + dr, rows) * cols + mod(c + dc, cols)] = 0;
  const nr = mod(r + movedr, rows), nc = mod(c + movedc, cols);
  tilePos.set(id, {r: nr, c: nc, cells});
  for (const {dr, dc} of cells) board[mod(nr + dr, rows) * cols + mod(nc + dc, cols)] = id;
}

// A move "wraps" if any leading-edge cell crosses the grid boundary
function isWrapMove(tilePos, id, movedr, movedc, rows, cols) {
  const {r, c, cells} = tilePos.get(id);
  const cs = cellSet(cells);
  // Also wrapping if tile currently straddles boundary
  for (const {dr, dc} of cells) {
    if (r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols) return true;
  }
  for (const {dr, dc} of cells) {
    if (cs.has(`${dr + movedr},${dc + movedc}`)) continue;
    const rawR = r + dr + movedr, rawC = c + dc + movedc;
    if (rawR < 0 || rawR >= rows || rawC < 0 || rawC >= cols) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Row / column sliding
// ---------------------------------------------------------------------------

function canSlideRow(board, tilePos, row, layout) {
  const {cols, rows, rowWrap} = layout;
  if (!rowWrap[row]) return false;
  for (let c = 0; c < cols; c++) {
    const id = board[row * cols + c];
    if (id <= 0) return false;
    const pos = tilePos.get(id);
    if (!pos) return false;
    // All cells of this tile must be in this row
    if (!pos.cells.every(({dr, dc}) => mod(pos.r + dr, rows) === row)) return false;
    if (c > 0 && hasBarrierL(layout, row, c - 1, row, c)) return false;
  }
  return true;
}

function canSlideCol(board, tilePos, col, layout) {
  const {cols, rows, colWrap} = layout;
  if (!colWrap[col]) return false;
  for (let r = 0; r < rows; r++) {
    const id = board[r * cols + col];
    if (id <= 0) return false;
    const pos = tilePos.get(id);
    if (!pos) return false;
    if (!pos.cells.every(({dr, dc}) => mod(pos.c + dc, cols) === col)) return false;
    if (r > 0 && hasBarrierL(layout, r - 1, col, r, col)) return false;
  }
  return true;
}

function slideRow(board, tilePos, row, dir, layout) {
  const {cols} = layout;
  const ids = Array.from({length: cols}, (_, c) => board[row * cols + c]);
  const s = dir === 1 ? [ids[cols - 1], ...ids.slice(0, -1)] : [...ids.slice(1), ids[0]];
  for (let c = 0; c < cols; c++) board[row * cols + c] = s[c];
  const seen = new Set();
  for (let c = 0; c < cols; c++) {
    const id = s[c];
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      const pos = tilePos.get(id);
      tilePos.set(id, {...pos, c: mod(pos.c + dir, cols)});
    }
  }
}

function slideCol(board, tilePos, col, dir, layout) {
  const {cols, rows} = layout;
  const ids = Array.from({length: rows}, (_, r) => board[r * cols + col]);
  const s = dir === 1 ? [ids[rows - 1], ...ids.slice(0, -1)] : [...ids.slice(1), ids[0]];
  for (let r = 0; r < rows; r++) board[r * cols + col] = s[r];
  const seen = new Set();
  for (let r = 0; r < rows; r++) {
    const id = s[r];
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      const pos = tilePos.get(id);
      tilePos.set(id, {...pos, r: mod(pos.r + dir, rows)});
    }
  }
}

// ---------------------------------------------------------------------------
// Shuffle & solve helpers
// ---------------------------------------------------------------------------

function shuffleBoard(board, tiles, layout) {
  const {rows, cols} = layout;

  // Build solved board and tilePos
  const solvedBoard = [...board];
  const tilePos = buildTilePos(tiles);
  for (const t of tiles) {
    for (const {dr, dc} of t.cells) {
      solvedBoard[mod(t.r0 + dr, rows) * cols + mod(t.c0 + dc, cols)] = t.id;
    }
  }

  // goalPos = solved positions (used by _heuristic)
  const goalPos = new Map();
  for (const [id, {r, c}] of tilePos) goalPos.set(id, {r, c});

  // Phase 1: greedy best-first search for most-scrambled reachable state.
  // Expand states with the HIGHEST heuristic first (f = -h in a min-heap).
  // Track the highest-h node seen across all expansions.
  const MAX_NODES        = 100000;
  const STAGNATION_LIMIT = 20000; // stop early if bestH hasn't improved in this many nodes
  const LOG_EVERY1       = 5000;  // log interval for phase 1 (nodes)
  const NOISE_K          = 1;     // jitter magnitude for f values (option 3: noise, option 4: tiebreak)
  const open    = new MinHeap();
  const visited = new Set();

  const startH = _heuristic(tilePos, goalPos, rows, cols, layout, true);
  open.push({ board: [...solvedBoard], tilePos: _copyTilePos(tilePos), f: -startH, depth: 0, parent: null, move: null });
  visited.add(_encodeState(tilePos));

  let bestNode        = { board: [...solvedBoard], tilePos: _copyTilePos(tilePos), depth: 0, parent: null, move: null };
  let bestH           = startH;
  let expanded        = 0;
  let lastImprovement = 0;

  console.log(`[shuffle] phase1 start — h=${startH}`);

  while (open.size > 0 && expanded < MAX_NODES) {
    const node = open.pop();
    expanded++;

    const h = _heuristic(node.tilePos, goalPos, rows, cols, layout);
    if (h > bestH) { bestH = h; bestNode = node; lastImprovement = expanded; }

    if (expanded - lastImprovement > STAGNATION_LIMIT) {
      console.log(`[shuffle] phase1 stagnated — no improvement in ${STAGNATION_LIMIT} nodes, stopping at ${expanded}`);
      break;
    }

    if (expanded % LOG_EVERY1 === 0) {
      console.log(`[shuffle] phase1 — nodes=${expanded} currentH=${h} bestH=${bestH} openSize=${open.size}`);
    }

    // Tile moves
    for (const [id] of node.tilePos) {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (!canMove(node.board, node.tilePos, id, dr, dc, layout)) continue;
        const nb  = [...node.board];
        const ntp = _copyTilePos(node.tilePos);
        applyMove(nb, ntp, id, dr, dc, layout);
        const key = _encodeState(ntp);
        if (visited.has(key)) continue;
        visited.add(key);
        const nh = _heuristic(ntp, goalPos, rows, cols, layout);
        open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {id, dr, dc} });
      }
    }
    // Slide moves (rows and columns with wrapping)
    for (let r = 0; r < rows; r++) {
      if (!canSlideRow(node.board, node.tilePos, r, layout)) continue;
      for (const dir of [1, -1]) {
        const nb  = [...node.board];
        const ntp = _copyTilePos(node.tilePos);
        slideRow(nb, ntp, r, dir, layout);
        const key = _encodeState(ntp);
        if (visited.has(key)) continue;
        visited.add(key);
        const nh = _heuristic(ntp, goalPos, rows, cols, layout);
        open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {slide: true, axis: 'row', index: r, dir} });
      }
    }
    for (let c = 0; c < cols; c++) {
      if (!canSlideCol(node.board, node.tilePos, c, layout)) continue;
      for (const dir of [1, -1]) {
        const nb  = [...node.board];
        const ntp = _copyTilePos(node.tilePos);
        slideCol(nb, ntp, c, dir, layout);
        const key = _encodeState(ntp);
        if (visited.has(key)) continue;
        visited.add(key);
        const nh = _heuristic(ntp, goalPos, rows, cols, layout);
        open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {slide: true, axis: 'col', index: c, dir} });
      }
    }
  }

  console.log(`[shuffle] phase1 done — expanded=${expanded} bestH=${bestH} phase1Moves=${bestNode.depth}`);

  // Phase 1.5: dedicated greedy search to maximise displacement of large tiles (3+ cells).
  // Starts from bestNode and uses a heuristic that only rewards large-tile distance from goal.
  // Runs for a small budget; the node with the highest large-tile displacement becomes the new bestNode.
  // Skipped entirely if the layout has no tiles with 3+ cells.
  const hasLargeTiles = layout.tiles.some(t => t.cells && t.cells.length >= 3);
  if (hasLargeTiles) {
    const PHASE15_NODES      = 100000;
    const PHASE15_STAGNATION = 20000;
    const largeTileH = tp => {
      let h = 0;
      for (const [id, {r, c, cells}] of tp) {
        if (!cells || cells.length < 3) continue;
        const g = goalPos.get(id);
        if (!g) continue;
        const rd = Math.abs(r - g.r), cd = Math.abs(c - g.c);
        h += Math.min(rd, rows - rd) + Math.min(cd, cols - cd);
      }
      return h;
    };

    const p15Open    = new MinHeap();
    const p15Visited = new Set();
    const p15StartH  = largeTileH(bestNode.tilePos);
    p15Open.push({ board: [...bestNode.board], tilePos: _copyTilePos(bestNode.tilePos),
                   f: -(p15StartH + Math.random() * NOISE_K), depth: bestNode.depth, parent: bestNode, move: null });
    p15Visited.add(_encodeState(bestNode.tilePos));

    let p15Best = bestNode, p15BestH = p15StartH, p15Expanded = 0, p15LastImprovement = 0;

    while (p15Open.size > 0 && p15Expanded < PHASE15_NODES) {
      const node = p15Open.pop();
      p15Expanded++;
      const h = largeTileH(node.tilePos);
      if (h > p15BestH) { p15BestH = h; p15Best = node; p15LastImprovement = p15Expanded; }
      if (p15Expanded - p15LastImprovement > PHASE15_STAGNATION) {
        console.log(`[shuffle] phase1.5 stagnated — no improvement in ${PHASE15_STAGNATION} nodes, stopping at ${p15Expanded}`);
        break;
      }

      for (const [id] of node.tilePos) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (!canMove(node.board, node.tilePos, id, dr, dc, layout)) continue;
          const nb = [...node.board], ntp = _copyTilePos(node.tilePos);
          applyMove(nb, ntp, id, dr, dc, layout);
          const key = _encodeState(ntp);
          if (p15Visited.has(key)) continue;
          p15Visited.add(key);
          const nh = largeTileH(ntp);
          p15Open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {id, dr, dc} });
        }
      }
      for (let r = 0; r < rows; r++) {
        if (!canSlideRow(node.board, node.tilePos, r, layout)) continue;
        for (const dir of [1, -1]) {
          const nb = [...node.board], ntp = _copyTilePos(node.tilePos);
          slideRow(nb, ntp, r, dir, layout);
          const key = _encodeState(ntp);
          if (p15Visited.has(key)) continue;
          p15Visited.add(key);
          const nh = largeTileH(ntp);
          p15Open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {slide: true, axis: 'row', index: r, dir} });
        }
      }
      for (let c = 0; c < cols; c++) {
        if (!canSlideCol(node.board, node.tilePos, c, layout)) continue;
        for (const dir of [1, -1]) {
          const nb = [...node.board], ntp = _copyTilePos(node.tilePos);
          slideCol(nb, ntp, c, dir, layout);
          const key = _encodeState(ntp);
          if (p15Visited.has(key)) continue;
          p15Visited.add(key);
          const nh = largeTileH(ntp);
          p15Open.push({ board: nb, tilePos: ntp, f: -(nh + Math.random() * NOISE_K), depth: node.depth + 1, parent: node, move: {slide: true, axis: 'col', index: c, dir} });
        }
      }
    }

    console.log(`[shuffle] phase1.5 done — expanded=${p15Expanded} largeTileH: ${p15StartH} → ${p15BestH}`);
    bestNode = p15Best;
  }

  // Phase 2: 3000 random moves from the most-scrambled state
  const LOG_EVERY2 = 500; // log interval for phase 2 (moves)
  const b      = bestNode.board;
  const tp     = bestNode.tilePos;
  let lastMove   = null;
  const phase2MovesList = [];

  console.log(`[shuffle] phase2 start — h=${_heuristic(tp, goalPos, rows, cols, layout)}`);

  const PHASE2_MOVES = Math.round(10000 * (rows * cols) / 49);
  for (let k = 0; k < PHASE2_MOVES; k++) {
    const cands = [];
    // Tile move candidates (skip immediate reversal)
    for (const [id] of tp) {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (lastMove && !lastMove.slide && lastMove.id === id && lastMove.dr === -dr && lastMove.dc === -dc) continue;
        if (canMove(b, tp, id, dr, dc, layout)) cands.push({id, dr, dc});
      }
    }
    // Slide move candidates (skip immediate reversal)
    for (let r = 0; r < rows; r++) {
      if (!canSlideRow(b, tp, r, layout)) continue;
      for (const dir of [1, -1]) {
        if (lastMove && lastMove.slide && lastMove.axis === 'row' && lastMove.index === r && lastMove.dir === -dir) continue;
        cands.push({slide: true, axis: 'row', index: r, dir});
      }
    }
    for (let c = 0; c < cols; c++) {
      if (!canSlideCol(b, tp, c, layout)) continue;
      for (const dir of [1, -1]) {
        if (lastMove && lastMove.slide && lastMove.axis === 'col' && lastMove.index === c && lastMove.dir === -dir) continue;
        cands.push({slide: true, axis: 'col', index: c, dir});
      }
    }
    // If reversal-avoidance left no candidates, allow all moves (including reversal)
    if (!cands.length) {
      for (const [id] of tp) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (canMove(b, tp, id, dr, dc, layout)) cands.push({id, dr, dc});
        }
      }
      for (let r = 0; r < rows; r++) {
        if (!canSlideRow(b, tp, r, layout)) continue;
        for (const dir of [1, -1]) cands.push({slide: true, axis: 'row', index: r, dir});
      }
      for (let c = 0; c < cols; c++) {
        if (!canSlideCol(b, tp, c, layout)) continue;
        for (const dir of [1, -1]) cands.push({slide: true, axis: 'col', index: c, dir});
      }
    }
    if (!cands.length) break; // truly no moves possible (e.g. no hole, no wrapping)
    const pick = cands[Math.floor(Math.random() * cands.length)];
    if (pick.slide) {
      if (pick.axis === 'row') slideRow(b, tp, pick.index, pick.dir, layout);
      else                     slideCol(b, tp, pick.index, pick.dir, layout);
    } else {
      applyMove(b, tp, pick.id, pick.dr, pick.dc, layout);
    }
    lastMove = pick;
    phase2MovesList.push(pick);

    if ((k + 1) % LOG_EVERY2 === 0) {
      console.log(`[shuffle] phase2 — move=${k + 1} h=${_heuristic(tp, goalPos, rows, cols, layout)}`);
    }
  }

  // Build scramble move list: Phase 1 path (extracted from bestNode chain) + Phase 2 random moves
  const phase1MovesList = _extractMoves(bestNode);
  const scrambleMoves = [...phase1MovesList, ...phase2MovesList];

  console.log(`[shuffle] done — phase1Moves=${phase1MovesList.length} phase2Moves=${phase2MovesList.length} totalMoves=${scrambleMoves.length} finalH=${_heuristic(tp, goalPos, rows, cols, layout)}`);

  return { board: b, tilePos: tp, scrambleMoves };
}
function countMisplaced(tilePos, goalPos) {
  let n = 0;
  for (const [id, pos] of tilePos) {
    const g = goalPos.get(id);
    if (!g || pos.r !== g.r || pos.c !== g.c) n++;
  }
  return n;
}

function isSolved(tilePos, goalPos) { return countMisplaced(tilePos, goalPos) === 0; }

// ---------------------------------------------------------------------------
// Randomisation helpers
// ---------------------------------------------------------------------------

function applyRandomGoals(goalPos, layout) {
  const {rows, cols} = layout;

  // Build blocked set as "r,c" strings
  const blocked = new Set();
  for (const idx of layout.blocked) blocked.add(`${Math.floor(idx / cols)},${idx % cols}`);

  const occupied = new Set();
  const placed = new Map();
  const tiles = shuffle([...layout.tiles]);

  function canPlace(r0, c0, cells) {
    for (const {dr, dc} of cells) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
      if (blocked.has(`${r},${c}`) || occupied.has(`${r},${c}`)) return false;
    }
    return true;
  }

  function place(i) {
    if (i === tiles.length) return true;
    const {id, cells} = tiles[i];
    const bbox = cellsBBox(cells);
    const positions = [];
    for (let r = -bbox.minR; r < rows - bbox.maxR; r++) {
      for (let c = -bbox.minC; c < cols - bbox.maxC; c++) {
        if (canPlace(r, c, cells)) positions.push({r, c});
      }
    }
    shuffle(positions);
    for (const {r, c} of positions) {
      const keys = cells.map(({dr, dc}) => `${r + dr},${c + dc}`);
      keys.forEach(k => occupied.add(k));
      placed.set(id, {r, c});
      if (place(i + 1)) return true;
      keys.forEach(k => occupied.delete(k));
      placed.delete(id);
    }
    return false;
  }

  if (place(0)) {
    for (const [id, pos] of placed) goalPos.set(id, pos);
  }
}

function applyRandomBarriers(layout) {
  const count = layout.barriers.size;
  if (!count) return;
  const edges = [];
  for (let r = 0; r < layout.rows; r++)
    for (let c = 0; c < layout.cols - 1; c++) edges.push(barrierKey(r, c, r, c + 1));
  for (let c = 0; c < layout.cols; c++)
    for (let r = 0; r < layout.rows - 1; r++) edges.push(barrierKey(r, c, r + 1, c));
  shuffle(edges);
  layout.barriers = new Set(edges.slice(0, count));
}

function applyRandomWarps(layout) {
  layout.rowWrap = shuffle([...layout.rowWrap]);
  layout.colWrap = shuffle([...layout.colWrap]);
}
