// ---------------------------------------------------------------------------
// Solver Web Worker for TILE SHIFT
// ---------------------------------------------------------------------------
// Runs the full solve pipeline (A*, weighted A*, greedy, shortcutting) on a
// background thread. Communicates with the main thread via postMessage:
//
//   Incoming: { type:'solve', board, tilePos, goalPos, layout,
//                              scrambleMoves, moveHistory }
//   Outgoing: { type:'progress', label, pct }
//           | { type:'result', moves, suboptimal, partial, bestH, backup }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Utilities (from utils.js)
// ---------------------------------------------------------------------------

function mod(n, m) { return ((n % m) + m) % m; }

function barrierKey(r1, c1, r2, c2) {
  const a = r1 * 1000 + c1, b = r2 * 1000 + c2;
  return a < b ? `${r1},${c1},${r2},${c2}` : `${r2},${c2},${r1},${c1}`;
}

function hasBarrierL(layout, r1, c1, r2, c2) {
  return layout.barriers.has(barrierKey(r1, c1, r2, c2));
}

function cellSet(cells) {
  return new Set(cells.map(({dr, dc}) => `${dr},${dc}`));
}

// ---------------------------------------------------------------------------
// Movement (from layout.js)
// ---------------------------------------------------------------------------

function canMove(board, tilePos, id, movedr, movedc, layout) {
  const {rows, cols, rowWrap, colWrap} = layout;
  const {r, c, cells} = tilePos.get(id);
  const cs = cellSet(cells);

  const curIdx = new Set(
    cells.map(({dr, dc}) => mod(r + dr, rows) * cols + mod(c + dc, cols))
  );

  for (const {dr, dc} of cells) {
    if (cs.has(`${dr + movedr},${dc + movedc}`)) continue;

    const fromR = mod(r + dr, rows), fromC = mod(c + dc, cols);
    const rawToR = r + dr + movedr, rawToC = c + dc + movedc;
    const toR = mod(rawToR, rows), toC = mod(rawToC, cols);

    if (movedr !== 0 && (rawToR < 0 || rawToR >= rows) && !colWrap[fromC]) return false;
    if (movedc !== 0 && (rawToC < 0 || rawToC >= cols) && !rowWrap[fromR]) return false;
    if (hasBarrierL(layout, fromR, fromC, toR, toC)) return false;
  }

  const nr = mod(r + movedr, rows), nc = mod(c + movedc, cols);

  for (const {dr, dc} of cells) {
    const idx = mod(nr + dr, rows) * cols + mod(nc + dc, cols);
    if (!curIdx.has(idx) && board[idx] !== 0) return false;
  }

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

function canSlideRow(board, tilePos, row, layout) {
  const {cols, rows, rowWrap} = layout;
  if (!rowWrap[row]) return false;
  for (let c = 0; c < cols; c++) {
    const id = board[row * cols + c];
    if (id <= 0) return false;
    const pos = tilePos.get(id);
    if (!pos) return false;
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

function getRowGroup(board, tilePos, seedRow, layout) {
  const {rows, cols} = layout;
  const group = new Set([seedRow]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of group) {
      for (let c = 0; c < cols; c++) {
        const id = board[r * cols + c];
        if (id <= 0) continue;
        const pos = tilePos.get(id);
        if (!pos) continue;
        for (const {dr} of pos.cells) {
          const cellRow = mod(pos.r + dr, rows);
          if (!group.has(cellRow)) { group.add(cellRow); changed = true; }
        }
      }
    }
  }
  return [...group].sort((a, b) => a - b);
}

function canSlideRowGroup(board, tilePos, groupRows, layout) {
  const {cols, rows, rowWrap} = layout;
  const groupSet = new Set(groupRows);
  for (const r of groupRows) {
    if (!rowWrap[r]) return false;
    for (let c = 0; c < cols; c++) {
      const id = board[r * cols + c];
      if (id <= 0) return false;
      const pos = tilePos.get(id);
      if (!pos) return false;
      if (!pos.cells.every(({dr}) => groupSet.has(mod(pos.r + dr, rows)))) return false;
      if (c > 0 && hasBarrierL(layout, r, c - 1, r, c)) return false;
    }
  }
  return true;
}

function slideRowGroup(board, tilePos, groupRows, dir, layout) {
  const {cols} = layout;
  const rowData = {};
  for (const r of groupRows) rowData[r] = Array.from({length: cols}, (_, c) => board[r * cols + c]);
  const seen = new Set();
  for (const r of groupRows) {
    const ids = rowData[r];
    const s = dir === 1 ? [ids[cols - 1], ...ids.slice(0, -1)] : [...ids.slice(1), ids[0]];
    for (let c = 0; c < cols; c++) board[r * cols + c] = s[c];
    for (let c = 0; c < cols; c++) {
      const id = s[c];
      if (id > 0 && !seen.has(id)) {
        seen.add(id);
        const pos = tilePos.get(id);
        tilePos.set(id, {...pos, c: mod(pos.c + dir, cols)});
      }
    }
  }
}

function getColGroup(board, tilePos, seedCol, layout) {
  const {rows, cols} = layout;
  const group = new Set([seedCol]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of group) {
      for (let r = 0; r < rows; r++) {
        const id = board[r * cols + c];
        if (id <= 0) continue;
        const pos = tilePos.get(id);
        if (!pos) continue;
        for (const {dc} of pos.cells) {
          const cellCol = mod(pos.c + dc, cols);
          if (!group.has(cellCol)) { group.add(cellCol); changed = true; }
        }
      }
    }
  }
  return [...group].sort((a, b) => a - b);
}

function canSlideColGroup(board, tilePos, groupCols, layout) {
  const {cols, rows, colWrap} = layout;
  const groupSet = new Set(groupCols);
  for (const c of groupCols) {
    if (!colWrap[c]) return false;
    for (let r = 0; r < rows; r++) {
      const id = board[r * cols + c];
      if (id <= 0) return false;
      const pos = tilePos.get(id);
      if (!pos) return false;
      if (!pos.cells.every(({dc}) => groupSet.has(mod(pos.c + dc, cols)))) return false;
      if (r > 0 && hasBarrierL(layout, r - 1, c, r, c)) return false;
    }
  }
  return true;
}

function slideColGroup(board, tilePos, groupCols, dir, layout) {
  const {cols, rows} = layout;
  const colData = {};
  for (const c of groupCols) colData[c] = Array.from({length: rows}, (_, r) => board[r * cols + c]);
  const seen = new Set();
  for (const c of groupCols) {
    const ids = colData[c];
    const s = dir === 1 ? [ids[rows - 1], ...ids.slice(0, -1)] : [...ids.slice(1), ids[0]];
    for (let r = 0; r < rows; r++) board[r * cols + c] = s[r];
    for (let r = 0; r < rows; r++) {
      const id = s[r];
      if (id > 0 && !seen.has(id)) {
        seen.add(id);
        const pos = tilePos.get(id);
        tilePos.set(id, {...pos, r: mod(pos.r + dir, rows)});
      }
    }
  }
}

function applySlideMove(board, tilePos, m, layout) {
  if (m.axis === 'row') {
    if (m.indices) slideRowGroup(board, tilePos, m.indices, m.dir, layout);
    else           slideRow(board, tilePos, m.index, m.dir, layout);
  } else {
    if (m.indices) slideColGroup(board, tilePos, m.indices, m.dir, layout);
    else           slideCol(board, tilePos, m.index, m.dir, layout);
  }
}

// ---------------------------------------------------------------------------
// Solver internals (from solver.js)
// ---------------------------------------------------------------------------

class MinHeap {
  constructor() { this._h = []; }
  get size() { return this._h.length; }
  push(node) { this._h.push(node); this._up(this._h.length - 1); }
  pop() {
    const top = this._h[0];
    const last = this._h.pop();
    if (this._h.length) { this._h[0] = last; this._down(0); }
    return top;
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._h[p].f <= this._h[i].f) break;
      [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this._h.length;
    for (;;) {
      let m = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._h[l].f < this._h[m].f) m = l;
      if (r < n && this._h[r].f < this._h[m].f) m = r;
      if (m === i) break;
      [this._h[m], this._h[i]] = [this._h[i], this._h[m]];
      i = m;
    }
  }
  trim(n) {
    if (this._h.length <= n) return;
    this._h.sort((a, b) => a.f - b.f);
    this._h.length = n;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) this._down(i);
  }
}

function _edgeBonus(g, tileCells, layout) {
  if (!layout) return 0;
  const {rows, cols, rowWrap, colWrap, cells: layoutCells, barriers} = layout;

  if (!layout._barrierSet) {
    layout._barrierSet = new Set();
    for (const b of (barriers || [])) {
      if (typeof b !== 'string') continue;
      const [r1, c1, r2, c2] = b.split(',').map(Number);
      layout._barrierSet.add(`${r1},${c1},${r2},${c2}`);
      layout._barrierSet.add(`${r2},${c2},${r1},${c1}`);
    }
  }
  const bs = layout._barrierSet;

  const cellOffsets = tileCells || [{dr: 0, dc: 0}];
  const tileSet = new Set(cellOffsets.map(({dr, dc}) => `${dr},${dc}`));

  let count = 0;

  for (const {dr: cdr, dc: cdc} of cellOffsets) {
    const cr = g.r + cdr;
    const cc = g.c + cdc;

    for (const [ndr, ndc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (tileSet.has(`${cdr + ndr},${cdc + ndc}`)) continue;

      const nr = cr + ndr, nc = cc + ndc;

      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
        const wraps = ndc === 0 ? (colWrap && colWrap[cc]) : (rowWrap && rowWrap[cr]);
        if (!wraps) count++;
        continue;
      }

      if (bs.has(`${cr},${cc},${nr},${nc}`)) { count++; continue; }

      if (layoutCells && layoutCells[nr] && layoutCells[nr][nc] &&
          layoutCells[nr][nc].type === 'blocked') count++;
    }
  }

  const cap = Math.max(2, cellOffsets.length);
  return Math.min(count, cap);
}

function _heuristic(tilePos, goalPos, rows, cols, layout) {
  let h = 0;
  for (const [id, {r, c, cells}] of tilePos) {
    const g = goalPos.get(id);
    if (!g) continue;
    const rd = Math.abs(r - g.r), cd = Math.abs(c - g.c);
    const dist = Math.min(rd, rows - rd) + Math.min(cd, cols - cd);
    if (dist > 0) h += dist + _edgeBonus(g, cells, layout);
  }
  return h;
}

function _encodeState(tilePos) {
  let s = '';
  for (const [, {r, c}] of tilePos) s += r + ',' + c + ';';
  return s;
}

function _copyTilePos(tp) {
  const m = new Map();
  for (const [id, {r, c, cells}] of tp) m.set(id, {r, c, cells});
  return m;
}

function _extractMoves(node) {
  const moves = [];
  let cur = node;
  while (cur.move) { moves.unshift(cur.move); cur = cur.parent; }
  return moves;
}

function _invertMove(m) {
  if (m.slide) return {...m, dir: -m.dir};
  return {id: m.id, dr: -m.dr, dc: -m.dc};
}

// ---------------------------------------------------------------------------
// Core synchronous solver — no setTimeout needed in a worker
// ---------------------------------------------------------------------------

function _solveSync(layout, initBoard, initTilePos, goalPos, weight, maxNodes, tag, extendIfClose, maxOpen, onProgress) {
  const {rows, cols} = layout;

  const rawH = tp => _heuristic(tp, goalPos, rows, cols, null);
  const startRawH = rawH(initTilePos);
  if (startRawH === 0) {
    if (onProgress) onProgress(1);
    return { moves: [], partial: false, bestH: 0 };
  }

  const startWeightedH = _heuristic(initTilePos, goalPos, rows, cols, layout);
  const startNode = {
    board:   [...initBoard],
    tilePos: _copyTilePos(initTilePos),
    g: 0,
    f: weight === Infinity ? startWeightedH : weight * startWeightedH,
    parent: null,
    move: null
  };

  const open    = new MinHeap();
  const visited = new Set();
  open.push(startNode);
  visited.add(_encodeState(initTilePos));

  let expanded    = 0;
  let bestNode    = startNode;
  let bestRawH    = startRawH;
  let nodeLimit   = maxNodes;
  let extended    = false;

  const PROGRESS_INTERVAL = 5000;

  outer: while (true) {
    while (open.size > 0 && expanded < nodeLimit) {
      const node = open.pop();
      expanded++;

      const rh = rawH(node.tilePos);
      if (rh < bestRawH) { bestRawH = rh; bestNode = node; }

      if (rh === 0) {
        const moves = _extractMoves(node);
        if (onProgress) onProgress(1);
        return { moves, partial: false, bestH: 0 };
      }

      // Tile moves
      for (const [id] of node.tilePos) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          if (!canMove(node.board, node.tilePos, id, dr, dc, layout)) continue;
          const newBoard   = [...node.board];
          const newTilePos = _copyTilePos(node.tilePos);
          applyMove(newBoard, newTilePos, id, dr, dc, layout);
          const key = _encodeState(newTilePos);
          if (visited.has(key)) continue;
          visited.add(key);
          const g  = node.g + 1;
          const wh = _heuristic(newTilePos, goalPos, rows, cols, layout);
          const f  = weight === Infinity ? wh : g + weight * wh;
          open.push({ board: newBoard, tilePos: newTilePos, g, f, parent: node, move: {id, dr, dc} });
        }
      }
      // Slide moves
      for (let r = 0; r < rows; r++) {
        if (!canSlideRow(node.board, node.tilePos, r, layout)) continue;
        for (const dir of [1, -1]) {
          const newBoard   = [...node.board];
          const newTilePos = _copyTilePos(node.tilePos);
          slideRow(newBoard, newTilePos, r, dir, layout);
          const key = _encodeState(newTilePos);
          if (visited.has(key)) continue;
          visited.add(key);
          const g  = node.g + 1;
          const wh = _heuristic(newTilePos, goalPos, rows, cols, layout);
          const f  = weight === Infinity ? wh : g + weight * wh;
          open.push({ board: newBoard, tilePos: newTilePos, g, f, parent: node,
                      move: {slide: true, axis: 'row', index: r, dir} });
        }
      }
      for (let c = 0; c < cols; c++) {
        if (!canSlideCol(node.board, node.tilePos, c, layout)) continue;
        for (const dir of [1, -1]) {
          const newBoard   = [...node.board];
          const newTilePos = _copyTilePos(node.tilePos);
          slideCol(newBoard, newTilePos, c, dir, layout);
          const key = _encodeState(newTilePos);
          if (visited.has(key)) continue;
          visited.add(key);
          const g  = node.g + 1;
          const wh = _heuristic(newTilePos, goalPos, rows, cols, layout);
          const f  = weight === Infinity ? wh : g + weight * wh;
          open.push({ board: newBoard, tilePos: newTilePos, g, f, parent: node,
                      move: {slide: true, axis: 'col', index: c, dir} });
        }
      }
      // Group slide moves
      const seenRowGroups = new Set();
      for (let r = 0; r < rows; r++) {
        if (canSlideRow(node.board, node.tilePos, r, layout)) continue;
        const group = getRowGroup(node.board, node.tilePos, r, layout);
        const gkey = group.join(',');
        if (seenRowGroups.has(gkey)) continue;
        seenRowGroups.add(gkey);
        if (!canSlideRowGroup(node.board, node.tilePos, group, layout)) continue;
        for (const dir of [1, -1]) {
          const newBoard   = [...node.board];
          const newTilePos = _copyTilePos(node.tilePos);
          slideRowGroup(newBoard, newTilePos, group, dir, layout);
          const key = _encodeState(newTilePos);
          if (visited.has(key)) continue;
          visited.add(key);
          const g  = node.g + 1;
          const wh = _heuristic(newTilePos, goalPos, rows, cols, layout);
          const f  = weight === Infinity ? wh : g + weight * wh;
          open.push({ board: newBoard, tilePos: newTilePos, g, f, parent: node,
                      move: {slide: true, axis: 'row', indices: group, dir} });
        }
      }
      const seenColGroups = new Set();
      for (let c = 0; c < cols; c++) {
        if (canSlideCol(node.board, node.tilePos, c, layout)) continue;
        const group = getColGroup(node.board, node.tilePos, c, layout);
        const gkey = group.join(',');
        if (seenColGroups.has(gkey)) continue;
        seenColGroups.add(gkey);
        if (!canSlideColGroup(node.board, node.tilePos, group, layout)) continue;
        for (const dir of [1, -1]) {
          const newBoard   = [...node.board];
          const newTilePos = _copyTilePos(node.tilePos);
          slideColGroup(newBoard, newTilePos, group, dir, layout);
          const key = _encodeState(newTilePos);
          if (visited.has(key)) continue;
          visited.add(key);
          const g  = node.g + 1;
          const wh = _heuristic(newTilePos, goalPos, rows, cols, layout);
          const f  = weight === Infinity ? wh : g + weight * wh;
          open.push({ board: newBoard, tilePos: newTilePos, g, f, parent: node,
                      move: {slide: true, axis: 'col', indices: group, dir} });
        }
      }

      if (open.size > maxOpen) {
        open.trim(Math.floor(maxOpen * 0.75));
      }

      if (expanded % PROGRESS_INTERVAL === 0 && onProgress) {
        onProgress(Math.min(expanded / nodeLimit, 0.99));
      }
    }

    // Extension: if close to goal and budget not yet extended, grant extra nodes
    if (extendIfClose && !extended && bestRawH <= 10 && open.size > 0) {
      extended  = true;
      nodeLimit = expanded + Math.floor(maxNodes * 0.5);
      continue outer;
    }
    break;
  }

  const moves = _extractMoves(bestNode);
  return { moves, partial: true, bestH: bestRawH };
}

// ---------------------------------------------------------------------------
// Shortcutting (synchronous versions)
// ---------------------------------------------------------------------------

function _shortenSolutionSync(layout, initBoard, initTilePos, goalPos, moves, startFrac, weights, budgets, onProgress) {
  if (moves.length <= 1) return moves;

  const STEP       = 20;
  const MAX_PASSES = 5;

  const checkpointsPerPass = Math.ceil(moves.length * (1 - startFrac) / STEP);
  const estimatedTotal     = MAX_PASSES * checkpointsPerPass;
  let   totalChecked       = 0;

  let pass = 0;

  while (pass < MAX_PASSES) {
    let improved = false;
    let i = Math.floor(Math.floor(moves.length * startFrac) / STEP) * STEP;

    while (i < moves.length) {
      const remaining = moves.length - i;
      if (remaining <= 1) break;

      const board   = [...initBoard];
      const tilePos = _copyTilePos(initTilePos);
      for (let k = 0; k < i; k++) {
        applySlideMove(board, tilePos, moves[k], layout);
      }

      const weight = weights[Math.min(pass, weights.length - 1)];
      const budget = budgets[Math.min(pass, budgets.length - 1)];
      const r = _solveSync(layout, board, tilePos, goalPos, weight, budget, 'shorten', false, Infinity, null);

      if (!r.partial && r.moves.length < remaining) {
        moves    = [...moves.slice(0, i), ...r.moves];
        improved = true;
      }

      i += STEP;
      totalChecked++;
      if (onProgress) onProgress(Math.min(totalChecked / estimatedTotal, 0.99));
    }

    if (!improved) break;
    pass++;
  }

  return moves;
}

function _shortenBySegmentsSync(layout, initBoard, initTilePos, moves, weight, budget, segments, onProgress) {
  if (moves.length <= 1) return moves;

  const SEGMENTS = segments || 5;

  function replayTo(upTo) {
    const board   = [...initBoard];
    const tilePos = _copyTilePos(initTilePos);
    for (let k = 0; k < upTo; k++) applySlideMove(board, tilePos, moves[k], layout);
    return {board, tilePos};
  }

  for (let seg = 0; seg < SEGMENTS; seg++) {
    const segSize = Math.ceil(moves.length / SEGMENTS);
    const start   = seg * segSize;
    const end     = Math.min(start + segSize, moves.length);
    if (end <= start + 1) continue;

    const {board: startBoard, tilePos: startTilePos} = replayTo(start);
    const {tilePos: segGoalPos} = replayTo(end);

    const segLen = end - start;
    const result = _solveSync(layout, startBoard, startTilePos, segGoalPos, weight, budget, 'segment', false, Infinity, null);

    if (!result.partial && result.moves.length < segLen) {
      moves = [...moves.slice(0, start), ...result.moves, ...moves.slice(end)];
    }

    if (onProgress) onProgress((seg + 1) / SEGMENTS);
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Full solve pipeline
// ---------------------------------------------------------------------------

function _solveAll(layout, board, tilePos, goalPos, scrambleMoves, moveHistory) {
  const post = (label, pct) => self.postMessage({ type: 'progress', label, pct });

  let result    = null;
  let solveStage = 1;

  // Stage 1: optimal A*
  post('trying to solve... (first attempt)', 0);
  const r1 = _solveSync(layout, board, tilePos, goalPos, 1, 50000, 'solver', true, 75000,
    pct => post('trying to solve... (first attempt)', pct));
  if (!r1.partial) {
    result     = { moves: r1.moves, suboptimal: false, partial: false, bestH: 0 };
    solveStage = 1;
  }

  // Stage 2: weighted A* W=10
  if (!result) {
    post('trying to solve... (second attempt)', 0);
    const r2 = _solveSync(layout, board, tilePos, goalPos, 10, 200000, 'solver', true, 100000,
      pct => post('trying to solve... (second attempt)', pct));
    if (!r2.partial) {
      result     = { moves: r2.moves, suboptimal: true, partial: false, bestH: 0 };
      solveStage = 2;
    }
  }

  // Stage 3: pure greedy
  if (!result) {
    post('trying to solve... (third attempt)', 0);
    const r3 = _solveSync(layout, board, tilePos, goalPos, Infinity, 500000, 'solver', true, 150000,
      pct => post('trying to solve... (third attempt)', pct));
    result     = { moves: r3.moves, suboptimal: true, partial: r3.partial, bestH: r3.bestH };
    solveStage = 3;
  }

  // Backup: inverted scramble + inverted player history
  if (result.partial && scrambleMoves && scrambleMoves.length > 0) {
    const invertedScramble = [...scrambleMoves].reverse().map(_invertMove);
    const invertedHistory  = [...(moveHistory || [])].reverse().map(_invertMove);
    const backupMoves      = [...invertedHistory, ...invertedScramble];
    if (backupMoves.length > 0) {
      result     = { moves: backupMoves, suboptimal: true, partial: false, bestH: 0, backup: true };
      solveStage = 3;
    }
  }

  const { moves, suboptimal, partial } = result;

  if (moves.length === 0 && !partial) {
    return { moves: [], suboptimal: false, partial: false, bestH: 0 };
  }

  // Shortcutting (only for suboptimal complete solutions)
  if (suboptimal && !partial) {
    let current = moves;

    if (solveStage === 3 && !result.backup) {
      const MAX_SEG_PASSES = 6;
      for (let segPass = 1; segPass <= MAX_SEG_PASSES; segPass++) {
        const segments  = [50, 20, 10, 6, 4, 3][segPass - 1];
        const beforeSeg = current.length;
        post(`shortcutting (segments ${segPass}/${MAX_SEG_PASSES})...`, 0);
        current = _shortenBySegmentsSync(layout, board, tilePos, current, 10, 10000, segments,
          pct => post(`shortcutting (segments ${segPass}/${MAX_SEG_PASSES})...`, pct));
        if (current.length >= beforeSeg) break; // no improvement — stop early
      }
    }

    if (!result.backup) {
      const startFrac = solveStage === 2 ? 0.0 : 0.8;
      post('shortcutting...', 0);
      current = _shortenSolutionSync(layout, board, tilePos, goalPos, current, startFrac, [5, 2], [10000, 10000],
        pct => post('shortcutting...', pct));
    }

    result = { ...result, moves: current };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

function _deserializeLayout(data) {
  return {
    ...data,
    barriers: new Set(data.barriers || []),
    blocked:  new Set(data.blocked  || []),
  };
}

function _deserializeTilePos(entries) {
  return new Map(entries);
}

function _deserializeGoalPos(entries) {
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = function(e) {
  if (e.data.type !== 'solve') return;

  const layout   = _deserializeLayout(e.data.layout);
  const board    = e.data.board;
  const tilePos  = _deserializeTilePos(e.data.tilePos);
  const goalPos  = _deserializeGoalPos(e.data.goalPos);
  const scrambleMoves = e.data.scrambleMoves || [];
  const moveHistory   = e.data.moveHistory   || [];

  const result = _solveAll(layout, board, tilePos, goalPos, scrambleMoves, moveHistory);

  self.postMessage({ type: 'result', ...result });
};
