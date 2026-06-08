// ---------------------------------------------------------------------------
// Solver for TILE SHIFT
// ---------------------------------------------------------------------------
// solvePuzzle()          — optimal A* (W=1), 50 000 node limit
// solvePuzzleSuboptimal()— weighted A* with escalating W, larger limits
//
// Both return {moves: [{id,dr,dc},...], suboptimal: bool} or null.
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
  // Keep only the n lowest-f nodes, discarding the rest
  trim(n) {
    if (this._h.length <= n) return;
    this._h.sort((a, b) => a.f - b.f);
    this._h.length = n;
    // Rebuild heap property (Floyd's algorithm — O(n))
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) this._down(i);
  }
}

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

function _edgeBonus(g, tileCells, layout) {
  // Returns an additive bonus for unsolved tiles whose goal position has at least
  // one exterior side constrained by a grid edge (non-wrapping), a barrier, or a
  // blocked cell. Checks all cells of the tile, not just the anchor.
  // +1 for one constrained exterior side, +2 for two or more.
  if (!layout) return 0;
  const {rows, cols, rowWrap, colWrap, cells: layoutCells, barriers} = layout;

  // Build and cache a barrier lookup set on the layout object (computed once per layout)
  if (!layout._barrierSet) {
    layout._barrierSet = new Set();
    for (const b of (barriers || [])) {
      const [r1, c1, r2, c2] = b.split(',').map(Number);
      layout._barrierSet.add(`${r1},${c1},${r2},${c2}`);
      layout._barrierSet.add(`${r2},${c2},${r1},${c1}`);
    }
  }
  const bs = layout._barrierSet;

  // Build a set of relative offsets for this tile's cells so we can skip
  // directions that face another cell of the same tile (not exterior sides)
  const cellOffsets = tileCells || [{dr: 0, dc: 0}];
  const tileSet = new Set(cellOffsets.map(({dr, dc}) => `${dr},${dc}`));

  let count = 0;

  for (const {dr: cdr, dc: cdc} of cellOffsets) {
    const cr = g.r + cdr; // actual goal row of this tile cell
    const cc = g.c + cdc; // actual goal col of this tile cell

    for (const [ndr, ndc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      // Skip directions that lead to another cell of the same tile
      if (tileSet.has(`${cdr + ndr},${cdc + ndc}`)) continue;

      const nr = cr + ndr, nc = cc + ndc;

      // Hard grid edge (no wrap in this direction)
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
        const wraps = ndc === 0 ? (colWrap && colWrap[cc]) : (rowWrap && rowWrap[cr]);
        if (!wraps) count++;
        continue;
      }

      // Barrier between this cell and its neighbour
      if (bs.has(`${cr},${cc},${nr},${nc}`)) { count++; continue; }

      // Neighbour is a blocked cell
      if (layoutCells && layoutCells[nr] && layoutCells[nr][nc] &&
          layoutCells[nr][nc].type === 'blocked') count++;
    }
  }

  // Cap scales with tile size: larger tiles have more constrained exterior sides
  // and are harder to move, so a higher cap better reflects their true difficulty
  const cap = Math.max(2, cellOffsets.length);
  return Math.min(count, cap);
}

function _heuristic(tilePos, goalPos, rows, cols, layout, useSizeWeights = false) {
  // Wrap-aware Manhattan distance. Unsolved tiles whose goal is on a constrained
  // side (grid edge, barrier, or blocked neighbour) get +1 or +2 added to their
  // distance, nudging the solver to place them first.
  // useSizeWeights: if true, larger tiles contribute proportionally more to the
  // heuristic (used by the scramble phases to encourage displacing large tiles).
  let h = 0;
  for (const [id, {r, c, cells}] of tilePos) {
    const g = goalPos.get(id);
    if (!g) continue;
    const rd = Math.abs(r - g.r), cd = Math.abs(c - g.c);
    const dist = Math.min(rd, rows - rd) + Math.min(cd, cols - cd);
    const tileSize = cells ? cells.length : 1;
    const sizeWeight = useSizeWeights
      ? (tileSize >= 4 ? 20 : tileSize === 3 ? 5 : tileSize === 2 ? 2 : 1)
      : 1;
    if (dist > 0) h += dist * sizeWeight + _edgeBonus(g, cells, layout);
  }
  return h;
}

function _encodeState(tilePos) {
  // Map insertion order is always consistent (keys added once, Map.set
  // preserves order), so we can iterate directly without sorting
  let s = '';
  for (const [, {r, c}] of tilePos) s += r + ',' + c + ';';
  return s;
}

function _copyTilePos(tp) {
  const m = new Map();
  for (const [id, {r, c, cells}] of tp) m.set(id, {r, c, cells}); // cells is immutable
  return m;
}

// Reconstruct move list from a node back to the root
function _extractMoves(node) {
  const moves = [];
  let cur = node;
  while (cur.move) { moves.unshift(cur.move); cur = cur.parent; }
  return moves;
}


// Core weighted best-first search — async, chunked so the UI can repaint between chunks.
// weight=1        → optimal A*
// weight>1        → suboptimal weighted A* (f = g + weight*h)
// weight=Infinity → pure greedy best-first (f = h only)
//
// onProgress(0..1) is called after each chunk so the caller can update a progress indicator.
// Resolves to { moves, partial, bestH }:
//   partial=false → moves is a complete solution
//   partial=true  → moves leads to the closest state found (bestH steps away)
function _solveWeightedAsync(layout, initBoard, initTilePos, goalPos, weight, maxNodes, onProgress, tag = 'solver', extendIfClose = false, maxOpen = Infinity) {
  return new Promise(resolve => {
    const {rows, cols} = layout;

    const rawH = tp => _heuristic(tp, goalPos, rows, cols, null);
    const startRawH = rawH(initTilePos);
    if (startRawH === 0) {
      if (onProgress) onProgress(1);
      resolve({ moves: [], partial: false, bestH: 0 });
      return;
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

    const CHUNK = 2500; // nodes per chunk before yielding to the browser

    function step() {
      let i = 0;
      while (open.size > 0 && expanded < nodeLimit && i < CHUNK) {
        const node = open.pop();
        expanded++;
        i++;

        const rh = rawH(node.tilePos);
        if (rh < bestRawH) { bestRawH = rh; bestNode = node; }

        if (rh === 0) {
          const moves = _extractMoves(node);
          console.log(`[${tag}] w=${weight} → ${moves.length} moves, ${expanded} nodes`);
          if (onProgress) onProgress(1);
          resolve({ moves, partial: false, bestH: 0 });
          return;
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
      }

      if (open.size > maxOpen) {
        open.trim(Math.floor(maxOpen * 0.75));
        console.log(`[${tag}] heap trimmed to ${open.size} nodes`);
      }

      if (onProgress) onProgress(Math.min(expanded / nodeLimit, 1));

      if (open.size === 0 || expanded >= nodeLimit) {
        // If within 10 of goal and not yet extended, grant a 50% node extension
        if (extendIfClose && !extended && bestRawH <= 10 && open.size > 0) {
          const extension = Math.floor(maxNodes * 0.5);
          extended  = true;
          nodeLimit = expanded + extension;
          console.log(`[${tag}] w=${weight} within ${bestRawH} of goal — extending by ${extension} nodes`);
          setTimeout(step, 0);
          return;
        }
        const moves = _extractMoves(bestNode);
        console.log(`[${tag}] w=${weight} exhausted after ${expanded} nodes — best partial: ${bestRawH} away, ${moves.length} moves`);
        resolve({ moves, partial: true, bestH: bestRawH });
        return;
      }

      setTimeout(step, 0);
    }

    setTimeout(step, 0);
  });
}

// ---------------------------------------------------------------------------
// Public API  (all async — progress callbacks are optional)
// ---------------------------------------------------------------------------

// Stage 1: optimal A* W=1 — 50 000 nodes. Returns null on failure → caller escalates.
async function solvePuzzle(layout, initBoard, initTilePos, goalPos, onProgress) {
  const r = await _solveWeightedAsync(layout, initBoard, initTilePos, goalPos, 1, 50000, onProgress, 'solver', true, 75000);
  if (r.partial) return null;
  return { moves: r.moves, suboptimal: false, partial: false, bestH: 0 };
}

// Stage 2: weighted A* W=10 — 200 000 nodes. Returns null on failure → caller escalates.
async function solvePuzzleWeighted(layout, initBoard, initTilePos, goalPos, onProgress) {
  const r = await _solveWeightedAsync(layout, initBoard, initTilePos, goalPos, 10, 200000, onProgress, 'solver', true, 100000);
  if (r.partial) return null;
  return { moves: r.moves, suboptimal: true, partial: false, bestH: 0 };
}

// Stage 3: pure greedy W=∞ — 500 000 nodes. Always returns something (worst case a partial).
async function solvePuzzleGreedy(layout, initBoard, initTilePos, goalPos, onProgress) {
  const r = await _solveWeightedAsync(layout, initBoard, initTilePos, goalPos, Infinity, 500000, onProgress, 'solver', true, 150000);
  return { moves: r.moves, suboptimal: true, partial: r.partial, bestH: r.bestH };
}

// ---------------------------------------------------------------------------
// Solution shortcutting
// ---------------------------------------------------------------------------
// Scans a solution in STEP-move increments and attempts a quick re-solve from
// each checkpoint. If a shorter path to the goal is found, the tail is replaced.
// Only worth running on suboptimal (greedy) solutions.

async function shortenSolution(layout, initBoard, initTilePos, goalPos, moves, startFrac, weights, budgets, onProgress) {
  if (moves.length <= 1) return moves;

  const STEP       = 20; // moves between checkpoints
  const MAX_PASSES = 5;

  // Estimate total checkpoints assuming all MAX_PASSES run on the initial solution length.
  // Each pass scans the (1 - startFrac) tail in STEP increments.
  const checkpointsPerPass = Math.ceil(moves.length * (1 - startFrac) / STEP);
  const estimatedTotal     = MAX_PASSES * checkpointsPerPass;
  let   totalChecked       = 0;

  let pass = 0;

  while (pass < MAX_PASSES) {
    let improved = false;
    let i = Math.floor(moves.length * startFrac);
    // Round down to nearest STEP boundary for consistent checkpoint spacing
    i = Math.floor(i / STEP) * STEP;

    while (i < moves.length) {
      const remaining = moves.length - i;
      if (remaining <= 1) break;

      // Replay from the start to reach the board state at checkpoint i
      const board   = [...initBoard];
      const tilePos = _copyTilePos(initTilePos);
      for (let k = 0; k < i; k++) {
        const m = moves[k];
        if (m.slide) {
          if (m.axis === 'row') slideRow(board, tilePos, m.index, m.dir, layout);
          else                  slideCol(board, tilePos, m.index, m.dir, layout);
        } else {
          applyMove(board, tilePos, m.id, m.dr, m.dc, layout);
        }
      }

      const weight = weights[Math.min(pass, weights.length - 1)];
      const budget = budgets[Math.min(pass, budgets.length - 1)];
      const r = await _solveWeightedAsync(layout, board, tilePos, goalPos, weight, budget, null, 'shorten');

      if (!r.partial && r.moves.length < remaining) {
        const saved = remaining - r.moves.length;
        console.log(`[shorten] pass ${pass + 1}, checkpoint ${i}: tail ${remaining} → ${r.moves.length} moves (${saved} saved)`);
        moves    = [...moves.slice(0, i), ...r.moves];
        improved = true;
      }

      i += STEP;
      totalChecked++;
      if (onProgress) onProgress(Math.min(totalChecked / estimatedTotal, 0.99));
    }

    if (!improved) break; // full pass with no shortcuts — done
    pass++;
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Segment shortcutting
// ---------------------------------------------------------------------------
// Divides the solution into SEGMENTS equal chunks and for each chunk attempts
// to find a shorter path to the same intermediate board state (next checkpoint).
// Complements shortenSolution — catches small local inefficiencies it misses.

async function shortenBySegments(layout, initBoard, initTilePos, moves, weight, budget, segments, onProgress) {
  if (moves.length <= 1) return moves;

  const SEGMENTS = segments || 5;

  function replayTo(upTo) {
    const board   = [...initBoard];
    const tilePos = _copyTilePos(initTilePos);
    for (let k = 0; k < upTo; k++) {
      const m = moves[k];
      if (m.slide) {
        if (m.axis === 'row') slideRow(board, tilePos, m.index, m.dir, layout);
        else                  slideCol(board, tilePos, m.index, m.dir, layout);
      } else {
        applyMove(board, tilePos, m.id, m.dr, m.dc, layout);
      }
    }
    return {board, tilePos};
  }

  for (let seg = 0; seg < SEGMENTS; seg++) {
    const segSize = Math.ceil(moves.length / SEGMENTS);
    const start   = seg * segSize;
    const end     = Math.min(start + segSize, moves.length);
    if (end <= start + 1) continue;

    // Board state at segment start
    const {board: startBoard, tilePos: startTilePos} = replayTo(start);

    // Board state at segment end — used as the intermediate goal
    const {tilePos: segGoalPos} = replayTo(end);

    const segLen = end - start;
    const result = await _solveWeightedAsync(layout, startBoard, startTilePos, segGoalPos, weight, budget, null, 'segment');

    if (!result.partial && result.moves.length < segLen) {
      const saved = segLen - result.moves.length;
      console.log(`[segment] seg ${seg + 1}/${SEGMENTS} (moves ${start}–${end}): ${segLen} → ${result.moves.length} moves (${saved} saved)`);
      moves = [...moves.slice(0, start), ...result.moves, ...moves.slice(end)];
    }

    if (onProgress) onProgress((seg + 1) / SEGMENTS);
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Rollout solver
