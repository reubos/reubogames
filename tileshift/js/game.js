// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let gameState = null;
let timerInterval = null, startTime = null;
let currentLayoutKey = '__current__';
const options = {
  markColor: MARK_COLORS[0],
  highlightMoves: false, highlightCorrect: true, sounds: true, showArrows: false,
  solveSpeed: 250 // ms between moves during auto-solve playback
};

// Load persisted options
(function () {
  try {
    const saved = JSON.parse(localStorage.getItem('tileshift_options') || '{}');
    if (saved.markColor      !== undefined) options.markColor      = saved.markColor;
    if (saved.highlightMoves !== undefined) options.highlightMoves = saved.highlightMoves;
    if (saved.highlightCorrect !== undefined) options.highlightCorrect = saved.highlightCorrect;
    if (saved.sounds         !== undefined) options.sounds         = saved.sounds;
    if (saved.showArrows     !== undefined) options.showArrows     = saved.showArrows;
    if (saved.solveSpeed     !== undefined) options.solveSpeed     = saved.solveSpeed;
  } catch (e) {}
})();

function saveOptions() {
  try { localStorage.setItem('tileshift_options', JSON.stringify(options)); } catch (e) {}
}

function setOption(key, val) {
  options[key] = val;
  saveOptions();
  if (key === 'markColor') renderMarkPicker();
  if (key === 'highlightMoves') document.getElementById('puzzleMount').classList.toggle('hl-moves', val);
  if (key === 'highlightCorrect') document.getElementById('puzzleMount').classList.toggle('hl-correct', val);
  if (gameState) renderPuzzle();
}

// Sync checkboxes to loaded option values
function syncOptionCheckboxes() {
  const el = id => document.getElementById(id);
  el('optHighlightMoves').checked   = options.highlightMoves;
  el('optHighlightCorrect').checked = options.highlightCorrect;
  el('optSounds').checked           = options.sounds;
  el('optShowArrows').checked       = options.showArrows;
  el('optSolveSpeed').value         = options.solveSpeed;
  el('optSolveSpeedV').textContent  = options.solveSpeed + 'ms';
  if (options.highlightMoves)   document.getElementById('puzzleMount').classList.add('hl-moves');
  if (options.highlightCorrect) document.getElementById('puzzleMount').classList.add('hl-correct');
}

// ---------------------------------------------------------------------------
// Layout stats
// ---------------------------------------------------------------------------

function loadStats() {
  try { return JSON.parse(localStorage.getItem('tileshift_stats') || '{}'); } catch { return {}; }
}
function saveStats(stats) {
  try { localStorage.setItem('tileshift_stats', JSON.stringify(stats)); } catch {}
}

function fmtTime(ms) {
  const totalS = ms / 1000;
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return m + ':' + String(Math.floor(s)).padStart(2, '0') + '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0');
}

function ao5(vals) {
  // vals: array of exactly 5 numbers — drop best and worst, average the middle 3
  const s = [...vals].sort((a, b) => a - b);
  return (s[1] + s[2] + s[3]) / 3;
}

function recordResult(ms, moves) {
  const stats = loadStats();
  if (!stats[currentLayoutKey]) stats[currentLayoutKey] =
    {bestTime: null, bestMoves: null, bestAo5Time: null, bestAo5Moves: null, recent: []};
  const s = stats[currentLayoutKey];
  if (s.bestTime  === null || ms    < s.bestTime)  s.bestTime  = ms;
  if (s.bestMoves === null || moves < s.bestMoves) s.bestMoves = moves;
  s.recent.unshift({time: ms, moves});
  if (s.recent.length > 5) s.recent.pop();
  // Update best Ao5 when we have a full set of 5
  if (s.recent.length === 5) {
    const curAo5T = ao5(s.recent.map(r => r.time));
    const curAo5M = ao5(s.recent.map(r => r.moves));
    if (s.bestAo5Time  === null || curAo5T < s.bestAo5Time)  s.bestAo5Time  = curAo5T;
    if (s.bestAo5Moves === null || curAo5M < s.bestAo5Moves) s.bestAo5Moves = curAo5M;
  }
  saveStats(stats);
  renderLayoutStats();
}

function renderLayoutStats() {
  const panel   = document.getElementById('layoutStatsPanel');
  const content = document.getElementById('layoutStatsContent');
  if (!panel || !content) return;
  const stats = loadStats();
  const s = stats[currentLayoutKey];
  if (!s || !s.recent.length) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const row = (label, right, color = 'var(--mut)') =>
    `<div style="display:flex;justify-content:space-between;font-size:10px;color:${color};padding:1px 0">` +
    `<span>${label}</span><span>${right}</span></div>`;
  const divider = `<div style="border-top:1px solid var(--bdr);margin:5px 0"></div>`;

  let html = '';

  // Best single
  html += row('best', `${s.bestMoves} mv · ${fmtTime(s.bestTime)}`, 'var(--acc)');

  // Ao5 — current and best (only shown once ≥5 solves recorded)
  if (s.recent.length === 5) {
    const curAo5T = ao5(s.recent.map(r => r.time));
    const curAo5M = ao5(s.recent.map(r => r.moves));
    html += row('cur ao5', `${curAo5M.toFixed(1)} mv · ${fmtTime(curAo5T)}`,'var(--txt)');
  }
  if (s.bestAo5Time !== null) {
    html += row('best ao5', `${s.bestAo5Moves.toFixed(1)} mv · ${fmtTime(s.bestAo5Time)}`, 'var(--acc)');
  }

  // Recent 5
  html += divider;
  s.recent.forEach((r, i) => {
    html += row(`#${i + 1}`, `${r.moves} mv · ${fmtTime(r.time)}`, i === 0 ? 'var(--txt)' : 'var(--mut)');
  });

  content.innerHTML = html;
}

function clearLayoutStats() {
  const stats = loadStats();
  delete stats[currentLayoutKey];
  saveStats(stats);
  renderLayoutStats();
}

function renderMarkPicker() {
  const wrap = document.getElementById('markColorPicker');
  if (!wrap) return;
  wrap.innerHTML = '';
  MARK_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'ms' + (options.markColor === c ? ' ms-active' : '');
    sw.style.cssText = `background:${c};cursor:pointer`;
    sw.title = c;
    sw.addEventListener('click', () => setOption('markColor', c));
    wrap.appendChild(sw);
  });
}

function toggleTileMark(tileId) {
  if (!gameState) return;
  const c = options.markColor;
  if (gameState.tileMarks.get(tileId) === c) gameState.tileMarks.delete(tileId);
  else gameState.tileMarks.set(tileId, c);
  renderPuzzle();
}

// Label for the whole tile (goal anchor position)
function tileLabel(id) {
  if (!gameState) return String(id);
  const g = gameState.goalPos.get(id); if (!g) return String(id);
  return String.fromCharCode(65 + g.c) + (g.r + 1);
}

function tileCellLabel(id, dr, dc) {
  if (!gameState) return String(id);
  const g = gameState.goalPos.get(id); if (!g) return String(id);
  return String.fromCharCode(65 + g.c + dc) + (g.r + dr + 1);
}

// ---------------------------------------------------------------------------
// Start / reshuffle
// ---------------------------------------------------------------------------

function getRndOpts() {
  return {
    goals: document.getElementById('rndGoals').checked,
    barriers: document.getElementById('rndBarriers').checked,
    warps: document.getElementById('rndWarps').checked
  };
}

// ---------------------------------------------------------------------------
// Auto-solve
// ---------------------------------------------------------------------------

let _solveTimer = null;

// Invert a single move (reverses tile move direction, or flips slide direction)
function _invertMove(m) {
  if (m.slide) return {...m, dir: -m.dir};
  return {...m, dr: -m.dr, dc: -m.dc};
}

async function showSolution() {
  if (!gameState || gameState.won) return;
  stopAutoSolve();

  const btn    = document.getElementById('solveBtn');
  const status = document.getElementById('solveStatus');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ solving...'; }
  if (status) status.style.display = 'block';

  // Snapshot the current board state — used consistently for solving and shortcutting
  const snapBoard   = [...gameState.board];
  const snapTilePos = _copyTilePos(gameState.tilePos);
  const layout      = gameState.layout;
  const goalPos     = gameState.goalPos;

  // Updates the status line with label + percentage
  const setStatus = (label, pct) => {
    if (!status) return;
    const pctStr = pct != null ? ` ${Math.round(pct * 100)}%` : '';
    status.textContent = label + pctStr;
  };

  // Stage 1: optimal A*
  setStatus('trying to solve... (first attempt)', 0);
  let result    = await solvePuzzle(layout, snapBoard, snapTilePos, goalPos,
    pct => setStatus('trying to solve... (first attempt)', pct)
  );
  let solveStage = 1;

  // Stage 2: weighted A* W=10
  if (result === null) {
    setStatus('trying to solve... (second attempt)', 0);
    result     = await solvePuzzleWeighted(layout, snapBoard, snapTilePos, goalPos,
      pct => setStatus('trying to solve... (second attempt)', pct)
    );
    solveStage = 2;
  }

  // Stage 3: pure greedy (always returns something — worst case a partial)
  if (result === null) {
    setStatus('trying to solve... (third attempt)', 0);
    result     = await solvePuzzleGreedy(layout, snapBoard, snapTilePos, goalPos,
      pct => setStatus('trying to solve... (third attempt)', pct)
    );
    solveStage = 3;
  }

  // Backup solution: if stage 3 was partial, reconstruct from inverted scramble + inverted player moves
  if (result.partial && gameState.scrambleMoves && gameState.scrambleMoves.length > 0) {
    const invertedScramble  = [...gameState.scrambleMoves].reverse().map(_invertMove);
    const invertedHistory   = [...gameState.moveHistory].reverse().map(_invertMove);
    const backupMoves       = [...invertedHistory, ...invertedScramble];
    if (backupMoves.length > 0) {
      console.log(`[backup] using inverted scramble (${invertedScramble.length} moves) + inverted player history (${invertedHistory.length} moves) = ${backupMoves.length} total`);
      result     = { moves: backupMoves, suboptimal: true, partial: false, bestH: 0, backup: true };
      solveStage = 3; // use Stage 3 shortcut params for backup
    }
  }

  // Shortcutting — only for suboptimal complete solutions
  // Stage 2:          shortenSolution only (start 0%, w=5/2, 10K each)
  // Stage 3/backup:   up to 5 segment passes (w=10, 10K) until no progress,
  //                   then shortenSolution (start 80%, w=5, 10K — single pass)
  if (result.suboptimal && !result.partial) {
    if (solveStage === 3) {
      const MAX_SEG_PASSES = 6;
      for (let segPass = 1; segPass <= MAX_SEG_PASSES; segPass++) {
        const segments  = [50, 20, 10, 6, 4, 3][segPass - 1]; // 2% / 5% / 10% / ~17% / 25% / ~33% chunks
        const beforeSeg = result.moves.length;
        setStatus(`shortcutting (segments ${segPass}/${MAX_SEG_PASSES})...`, 0);
        const segResult = await shortenBySegments(layout, snapBoard, snapTilePos,
          result.moves, 10, 10000, segments,
          pct => setStatus(`shortcutting (segments ${segPass}/${MAX_SEG_PASSES})...`, pct)
        );
        if (segResult.length < beforeSeg) {
          console.log(`[segment] pass ${segPass}: ${beforeSeg} → ${segResult.length} moves`);
        } else {
          console.log(`[segment] pass ${segPass}: no improvement`);
        }
        result = { ...result, moves: segResult };
      }
    }

    // shortenSolution for Stage 2 and Stage 3 only (not Backup)
    if (!result.backup) {
      const before    = result.moves.length;
      const startFrac = solveStage === 2 ? 0.0 : 0.8;
      const weights   = [5, 2];
      const budgets   = [10000, 10000];
      setStatus('shortcutting...', 0);
      const shortened = await shortenSolution(layout, snapBoard, snapTilePos, goalPos,
        result.moves, startFrac, weights, budgets,
        pct => setStatus('shortcutting...', pct)
      );
      if (shortened.length < before) console.log(`[shorten] total: ${before} → ${shortened.length} moves`);
      result = { ...result, moves: shortened };
    }
  }

  const { moves, suboptimal, partial, bestH } = result;

  if (moves.length === 0 && !partial) {
    if (btn)    { btn.disabled = false; btn.innerHTML = '🔍 autosolve<br><span style="font-size:9px;color:var(--mut);font-weight:normal">(takes a long time on hard puzzles)</span>'; }
    if (status) { status.textContent = 'already solved!'; setTimeout(() => stopAutoSolve(), 2000); }
    return;
  }

  let label;
  if (partial) {
    label = `couldn't fully solve — playing closest attempt (${bestH} step${bestH !== 1 ? 's' : ''} away)`;
  } else if (result.backup) {
    label = `playing backup solution — ${moves.length} moves`;
  } else if (suboptimal) {
    label = `playing suboptimal solution — ${moves.length} moves`;
  } else {
    label = `playing solution — ${moves.length} moves`;
  }
  if (status) status.textContent = label;

  gameState.autoSolving    = true;
  gameState.solverAssisted = true;

  let idx = 0;
  function playNext() {
    if (!gameState || !gameState.autoSolving || gameState.won) { stopAutoSolve(); return; }
    if (idx >= moves.length) { stopAutoSolve(); return; }
    const m = moves[idx];
    if (m.slide) {
      _solverApplySlide(m);
    } else {
      _solverMove(m.id, m.dr, m.dc);
    }
    idx++;
    _solveTimer = setTimeout(playNext, options.solveSpeed);
  }
  _solveTimer = setTimeout(playNext, Math.max(options.solveSpeed, 400));
}

function stopAutoSolve() {
  if (_solveTimer) { clearTimeout(_solveTimer); _solveTimer = null; }
  if (gameState) gameState.autoSolving = false;
  const btn    = document.getElementById('solveBtn');
  const status = document.getElementById('solveStatus');
  if (btn)    { btn.disabled = false; btn.innerHTML = '🔍 autosolve<br><span style="font-size:9px;color:var(--mut);font-weight:normal">(takes a long time on hard puzzles)</span>'; }
  if (status) status.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Start / reshuffle
// ---------------------------------------------------------------------------

// Load the play area in the solved position (no scramble) — used on first app load
function startGameSolved() {
  stopAutoSolve();
  const layout = buildLayout();
  if (!layout || !layout.tiles.length) return;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  startTime = null;
  document.getElementById('timerVal').textContent = '0:00.00';
  const goalPos = buildGoalPos(layout.tiles);
  const board   = layoutToBoard(layout);
  const tilePos = buildTilePos(layout.tiles);
  gameState = {layout, board, tilePos, goalPos, moves: 0, won: false, tileMarks: new Map(),
               scrambleMoves: [], moveHistory: []};
  document.getElementById('moveCount').textContent = '0';
  document.getElementById('misplacedV').textContent = countMisplaced(tilePos, goalPos);
  document.getElementById('winOverlay').classList.remove('show');
  renderPuzzle();
  renderLayoutStats();
}

function _setShuffling(on) {
  document.body.classList.toggle('is-shuffling', on);
}

function reshuffleWithFeedback(btn, before) {
  const orig = btn.textContent;
  btn.textContent = 'shuffling...';
  btn.disabled = true;
  _setShuffling(true);
  setTimeout(() => {
    if (before) before();
    reshuffleGame();
    btn.textContent = orig;
    btn.disabled = false;
    _setShuffling(false);
  }, 0);
}

function startGameAndPlay() {
  const btn = document.getElementById('playBtn');
  if (btn) { btn.textContent = 'shuffling...'; btn.disabled = true; }
  _setShuffling(true);
  setTimeout(() => {
    startGame();
    showScreen('play');
    if (btn) { btn.textContent = 'play ▶'; btn.disabled = false; }
    _setShuffling(false);
  }, 0);
}

function startGame() {
  stopAutoSolve();
  const layout = buildLayout();
  if (!layout || !layout.tiles.length) { alert('Need at least one tile and one hole.'); return; }

  // Warn if the puzzle has no hole and no wrapping — it cannot be scrambled
  const hasHole    = edCells.some(row => row.some(cell => cell.type === 'hole'));
  const hasWrapping = rowWrap.some(Boolean) || colWrap.some(Boolean);
  if (!hasHole && !hasWrapping) {
    const proceed = confirm(
      'This puzzle has no empty cell and no wrapping, so it cannot be scrambled.\n\n' +
      'Add an empty cell (hole) in the editor, or enable row/column wrapping, to allow scrambling.\n\n' +
      'Continue anyway?'
    );
    if (!proceed) return;
  }

  const rnd = getRndOpts();
  if (rnd.barriers) applyRandomBarriers(layout);
  if (rnd.warps)    applyRandomWarps(layout);

  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  startTime = null;
  document.getElementById('timerVal').textContent = '0:00.00';

  const goalPos = buildGoalPos(layout.tiles);
  if (rnd.goals) {
    applyRandomGoals(goalPos, layout);
    // Sync tile starting positions to the new goals so shuffle begins from goal state
    for (const t of layout.tiles) {
      const g = goalPos.get(t.id);
      if (g) { t.r0 = g.r; t.c0 = g.c; }
    }
  }

  const shuffled = _tryShuffleBoard(layout, goalPos);
  if (!shuffled) return; // failed — message already shown
  gameState = {layout, board: shuffled.board, tilePos: shuffled.tilePos, goalPos, moves: 0, won: false, tileMarks: new Map(),
               scrambleMoves: shuffled.scrambleMoves || [], moveHistory: []};
  document.getElementById('moveCount').textContent = '0';
  document.getElementById('misplacedV').textContent = countMisplaced(shuffled.tilePos, goalPos);
  document.getElementById('winOverlay').classList.remove('show');
  renderPuzzle();
  renderLayoutStats();
}

function reshuffleGame() {
  stopAutoSolve();
  if (!gameState) { startGame(); return; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  startTime = null;
  document.getElementById('timerVal').textContent = '0:00.00';
  const {layout, goalPos} = gameState;
  // Re-sync layout tiles to goalPos anchors for shuffle
  for (const t of layout.tiles) {
    const g = goalPos.get(t.id);
    if (g) { t.r0 = g.r; t.c0 = g.c; }
  }
  const shuffled = _tryShuffleBoard(layout, goalPos);
  if (!shuffled) return; // failed — message already shown
  gameState = {...gameState, board: shuffled.board, tilePos: shuffled.tilePos, moves: 0, won: false,
               scrambleMoves: shuffled.scrambleMoves || [], moveHistory: []};
  document.getElementById('moveCount').textContent = '0';
  document.getElementById('misplacedV').textContent = countMisplaced(shuffled.tilePos, goalPos);
  document.getElementById('winOverlay').classList.remove('show');
  renderPuzzle();
}

// Attempt to shuffle up to 3 times; returns {board, tilePos} or null on failure.
function _tryShuffleBoard(layout, goalPos) {
  const MAX_ATTEMPTS = 3;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = shuffleBoard(layoutToBoard(layout), layout.tiles, layout);
    if (!isSolved(result.tilePos, goalPos)) return result;
    console.log(`[shuffle] attempt ${i + 1} returned solved state, retrying...`);
  }
  alert('The puzzle could not be scrambled after 3 attempts.\n\nTry adding an empty cell or enabling row/column wrapping.');
  return null;
}

// ---------------------------------------------------------------------------
// Move handlers
// ---------------------------------------------------------------------------

function tickTimer() {
  if (!startTime) {
    startTime = Date.now();
    timerInterval = setInterval(() => {
      document.getElementById('timerVal').textContent = fmtTime(Date.now() - startTime);
    }, 100);
  }
}

function afterMove() {
  document.getElementById('moveCount').textContent = gameState.moves;
  document.getElementById('misplacedV').textContent = countMisplaced(gameState.tilePos, gameState.goalPos);
  renderPuzzle();
  if (isSolved(gameState.tilePos, gameState.goalPos)) {
    gameState.won = true;
    stopAutoSolve();
    clearInterval(timerInterval); timerInterval = null;
    const elapsed = startTime ? Date.now() - startTime : 0;
    document.getElementById('timerVal').textContent = fmtTime(elapsed);
    if (!gameState.solverAssisted) recordResult(elapsed, gameState.moves);
    playVictory();
    setTimeout(() => {
      document.getElementById('winStats').textContent =
        `${gameState.moves} moves · ${fmtTime(elapsed)}`;
      document.getElementById('winOverlay').classList.add('show');
    }, 300);
  }
}

function doTileMove(id, dr, dc) {
  if (!gameState || gameState.won) return;
  if (gameState.autoSolving) return; // block user interaction during auto-solve
  tickTimer();
  applyMove(gameState.board, gameState.tilePos, id, dr, dc, gameState.layout);
  gameState.moves++;
  gameState.moveHistory.push({id, dr, dc});
  playMove();
  afterMove();
}

// Internal moves used by auto-solver — bypass user-interaction block
function _solverMove(id, dr, dc) {
  if (!gameState || gameState.won) return;
  tickTimer();
  applyMove(gameState.board, gameState.tilePos, id, dr, dc, gameState.layout);
  gameState.moves++;
  playMove();
  afterMove();
}

function _solverApplySlide(m) {
  if (!gameState || gameState.won) return;
  tickTimer();
  applySlideMove(gameState.board, gameState.tilePos, m, gameState.layout);
  gameState.moves++;
  playMove();
  afterMove();
}

function doSlideRow(row, dir) {
  if (!gameState || gameState.won) return;
  tickTimer();
  slideRow(gameState.board, gameState.tilePos, row, dir, gameState.layout);
  gameState.moves++;
  gameState.moveHistory.push({slide: true, axis: 'row', index: row, dir});
  playMove();
  afterMove();
}

function doSlideCol(col, dir) {
  if (!gameState || gameState.won) return;
  tickTimer();
  slideCol(gameState.board, gameState.tilePos, col, dir, gameState.layout);
  gameState.moves++;
  gameState.moveHistory.push({slide: true, axis: 'col', index: col, dir});
  playMove();
  afterMove();
}

function doSlideRowGroup(indices, dir) {
  if (!gameState || gameState.won) return;
  tickTimer();
  slideRowGroup(gameState.board, gameState.tilePos, indices, dir, gameState.layout);
  gameState.moves++;
  gameState.moveHistory.push({slide: true, axis: 'row', indices, dir});
  playMove();
  afterMove();
}

function doSlideColGroup(indices, dir) {
  if (!gameState || gameState.won) return;
  tickTimer();
  slideColGroup(gameState.board, gameState.tilePos, indices, dir, gameState.layout);
  gameState.moves++;
  gameState.moveHistory.push({slide: true, axis: 'col', indices, dir});
  playMove();
  afterMove();
}

// ---------------------------------------------------------------------------
// Render puzzle
// ---------------------------------------------------------------------------

function renderPuzzle() {
  const mount = document.getElementById('puzzleMount');
  if (!gameState) { mount.innerHTML = ''; return; }
  const {layout, board, tilePos} = gameState;
  const {cols, rows, rowWrap, colWrap, barriers: lb} = layout;

  const _cm = document.querySelector('#screenPlay .col-main');
  const availW = _cm && _cm.clientWidth
    ? Math.max(80, _cm.clientWidth - 28)
    : Math.max(80, window.innerWidth - 468);
  const TS = Math.max(28, Math.min(60, Math.floor((availW - (cols - 1) * PG) / cols)));
  const FS = Math.max(9, Math.min(18, Math.floor(TS * 0.32)));
  const ASZ = Math.max(11, Math.floor(TS * 0.25));
  const BW = Math.max(3, Math.floor(TS * 0.08));
  const wLW = 20;
  const coordLabelFS = Math.max(8, Math.floor(TS * 0.22));
  const lnW = Math.max(14, coordLabelFS + 6);
  const leftOff = lnW + wLW + PG;
  function px(c) { return c * (TS + PG); }
  const W = cols * (TS + PG) - PG;

  // Determine movable tiles
  const movable = new Map();
  for (const [id] of tilePos) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (canMove(board, tilePos, id, dr, dc, layout)) {
        if (!movable.has(id)) movable.set(id, []);
        movable.get(id).push({dr, dc, wrap: isWrapMove(tilePos, id, dr, dc, rows, cols)});
      }
    }
  }

  const area = document.createElement('div');
  area.className = 'puzzle-area';
  area.style.position = 'relative';

  // Column wrap row (slide buttons or ↕ indicator)
  const colWrapRow = document.createElement('div');
  colWrapRow.style.cssText = `display:flex;gap:${PG}px;margin-left:${leftOff}px;margin-bottom:3px`;
  for (let c = 0; c < cols; c++) {
    const d = document.createElement('div');
    d.style.cssText = `width:${TS}px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--cyan)`;
    if (colWrap[c]) {
      const _colGroup = getColGroup(board, tilePos, c, layout);
      const _colCanSlide = canSlideCol(board, tilePos, c, layout);
      const _colGroupSlide = !_colCanSlide && canSlideColGroup(board, tilePos, _colGroup, layout);
      if (_colCanSlide || _colGroupSlide) {
        d.style.gap = '2px';
        const bu = document.createElement('button');
        bu.className = 'slide-btn';
        bu.style.cssText = `flex:1;height:16px;font-size:${ASZ}px`;
        bu.textContent = '▲';
        if (_colGroupSlide) bu.title = `slides ${_colGroup.length} cols together`;
        bu.addEventListener('click', () => _colCanSlide ? doSlideCol(c, -1) : doSlideColGroup(_colGroup, -1));
        const bd = document.createElement('button');
        bd.className = 'slide-btn';
        bd.style.cssText = `flex:1;height:16px;font-size:${ASZ}px`;
        bd.textContent = '▼';
        if (_colGroupSlide) bd.title = `slides ${_colGroup.length} cols together`;
        bd.addEventListener('click', () => _colCanSlide ? doSlideCol(c, 1) : doSlideColGroup(_colGroup, 1));
        d.appendChild(bu); d.appendChild(bd);
      } else {
        d.textContent = '↕';
      }
    }
    colWrapRow.appendChild(d);
  }

  const coordLabelH = coordLabelFS + 2;
  const coordColRow = document.createElement('div');
  coordColRow.style.cssText = `display:flex;gap:${PG}px;margin-left:${leftOff}px;margin-bottom:2px;height:${coordLabelH}px;align-items:center`;
  for (let c = 0; c < cols; c++) {
    const d = document.createElement('div');
    d.style.cssText = `width:${TS}px;text-align:center;font-size:${coordLabelFS}px;color:var(--mut);font-family:'Space Mono',monospace`;
    d.textContent = String.fromCharCode(65 + c);
    coordColRow.appendChild(d);
  }
  area.appendChild(coordColRow);
  area.appendChild(colWrapRow);
  const colWrapH = 21 + coordLabelH;

  // Rows
  for (let r = 0; r < rows; r++) {
    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = 'display:flex;align-items:flex-start';

    const rn = document.createElement('div');
    rn.style.cssText = `width:${lnW}px;height:${TS}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:${coordLabelFS}px;color:var(--mut);font-family:'Space Mono',monospace`;
    rn.textContent = String(r + 1);
    rowDiv.appendChild(rn);

    const lbl = document.createElement('div');
    lbl.style.cssText = `width:${wLW}px;height:${TS}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:9px;color:var(--cyan)`;
    if (rowWrap[r]) {
      const _rowGroup = getRowGroup(board, tilePos, r, layout);
      const _rowCanSlide = canSlideRow(board, tilePos, r, layout);
      const _rowGroupSlide = !_rowCanSlide && canSlideRowGroup(board, tilePos, _rowGroup, layout);
      if (_rowCanSlide || _rowGroupSlide) {
        const bl = document.createElement('button');
        bl.className = 'slide-btn';
        bl.style.cssText = `width:${wLW-2}px;height:${Math.floor(TS/2)-1}px;font-size:${ASZ}px`;
        bl.textContent = '◀';
        if (_rowGroupSlide) bl.title = `slides ${_rowGroup.length} rows together`;
        bl.addEventListener('click', () => _rowCanSlide ? doSlideRow(r, -1) : doSlideRowGroup(_rowGroup, -1));
        const br = document.createElement('button');
        br.className = 'slide-btn';
        br.style.cssText = `width:${wLW-2}px;height:${Math.floor(TS/2)-1}px;font-size:${ASZ}px`;
        br.textContent = '▶';
        if (_rowGroupSlide) br.title = `slides ${_rowGroup.length} rows together`;
        br.addEventListener('click', () => _rowCanSlide ? doSlideRow(r, 1) : doSlideRowGroup(_rowGroup, 1));
        lbl.appendChild(bl); lbl.appendChild(br);
      } else {
        lbl.textContent = '↔';
      }
    }
    rowDiv.appendChild(lbl);

    // Row background canvas (blocked / empty cells)
    const rowCanvas = document.createElement('canvas');
    rowCanvas.width = W; rowCanvas.height = TS;
    rowCanvas.style.cssText = `display:block;margin-left:${PG}px`;
    const ctx = rowCanvas.getContext('2d');
    for (let c = 0; c < cols; c++) {
      const x = px(c), id = board[r * cols + c];
      if (id === -1) {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, 0, TS, TS);
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 0.5, TS - 1, TS - 1);
        ctx.fillStyle = '#555';
        ctx.font = `bold ${Math.floor(TS * 0.35)}px Syne`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', x + TS / 2, TS / 2);
      } else if (id === 0) {
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 0.5, 0.5, TS - 1, TS - 1); ctx.setLineDash([]);
      }
    }
    rowDiv.appendChild(rowCanvas);
    area.appendChild(rowDiv);

    // Horizontal barrier gaps
    if (r < rows - 1) {
      const bDiv = document.createElement('div');
      bDiv.style.cssText = `display:flex;margin-left:${leftOff}px;height:${PG}px;gap:${PG}px`;
      for (let c = 0; c < cols; c++) {
        const seg = document.createElement('canvas');
        seg.width = TS; seg.height = PG;
        seg.style.cssText = 'display:block;position:relative;z-index:4';
        if (lb.has(barrierKey(r, c, r + 1, c))) {
          const sctx = seg.getContext('2d');
          sctx.strokeStyle = '#ff4466'; sctx.lineWidth = BW; sctx.lineCap = 'round';
          sctx.beginPath(); sctx.moveTo(2, PG / 2); sctx.lineTo(TS - 2, PG / 2); sctx.stroke();
        }
        bDiv.appendChild(seg);
      }
      area.appendChild(bDiv);
    }
  }

  // Group slide indicator lines — drawn over the arrow area to show which rows/cols move together
  const seenRowGroupLines = new Set();
  for (let r = 0; r < rows; r++) {
    if (!rowWrap[r]) continue;
    const grp = getRowGroup(board, tilePos, r, layout);
    const gk = grp.join(',');
    if (seenRowGroupLines.has(gk)) continue;
    seenRowGroupLines.add(gk);
    if (grp.length < 2 || !canSlideRowGroup(board, tilePos, grp, layout)) continue;
    // Split into contiguous runs and draw one line per run
    const rowRuns = [];
    let rStart = grp[0], rEnd = grp[0];
    for (let i = 1; i < grp.length; i++) {
      if (grp[i] === rEnd + 1) { rEnd = grp[i]; }
      else { rowRuns.push([rStart, rEnd]); rStart = rEnd = grp[i]; }
    }
    rowRuns.push([rStart, rEnd]);
    for (const [r1, r2] of rowRuns) {
      const lineTop    = colWrapH + r1 * (TS + PG);
      const lineBottom = colWrapH + r2 * (TS + PG) + TS;
      const line = document.createElement('div');
      line.style.cssText = `position:absolute;left:${lnW + wLW - 2}px;top:${lineTop}px;width:2px;height:${lineBottom - lineTop}px;background:var(--cyan);pointer-events:none;border-radius:1px`;
      area.appendChild(line);
    }
  }
  const seenColGroupLines = new Set();
  for (let c = 0; c < cols; c++) {
    if (!colWrap[c]) continue;
    const grp = getColGroup(board, tilePos, c, layout);
    const gk = grp.join(',');
    if (seenColGroupLines.has(gk)) continue;
    seenColGroupLines.add(gk);
    if (grp.length < 2 || !canSlideColGroup(board, tilePos, grp, layout)) continue;
    // Split into contiguous runs and draw one line per run
    const colRuns = [];
    let cStart = grp[0], cEnd = grp[0];
    for (let i = 1; i < grp.length; i++) {
      if (grp[i] === cEnd + 1) { cEnd = grp[i]; }
      else { colRuns.push([cStart, cEnd]); cStart = cEnd = grp[i]; }
    }
    colRuns.push([cStart, cEnd]);
    const lineY = coordLabelH + 2 + 15;
    for (const [c1, c2] of colRuns) {
      const lineLeft  = leftOff + c1 * (TS + PG);
      const lineRight = leftOff + c2 * (TS + PG) + TS;
      const line = document.createElement('div');
      line.style.cssText = `position:absolute;left:${lineLeft}px;top:${lineY}px;width:${lineRight - lineLeft}px;height:2px;background:var(--cyan);pointer-events:none;border-radius:1px`;
      area.appendChild(line);
    }
  }

  mount.innerHTML = '';
  mount.appendChild(area);

  // ---------------------------------------------------------------------------
  // Tile overlays — one div per cell of each tile
  // ---------------------------------------------------------------------------
  const rendered = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = board[r * cols + c];
      if (id <= 0 || rendered.has(id)) continue;
      rendered.add(id);

      const pos = tilePos.get(id);
      if (!pos) continue;
      const {r: tr, c: tc, cells} = pos;
      const cs = cellSet(cells);
      const moves = movable.get(id) || [];
      const anyWrap = moves.some(m => m.wrap) || cells.some(({dr, dc}) => {
        return tr + dr < 0 || tr + dr >= rows || tc + dc < 0 || tc + dc >= cols;
      });
      const g = gameState.goalPos.get(id);
      const isCorrect = g && pos.r === g.r && pos.c === g.c;
      const mark = gameState.tileMarks && gameState.tileMarks.get(id);

      // Build set of board positions for this tile (for border suppression)
      const boardPosSet = new Set(
        cells.map(({dr, dc}) => `${mod(tr + dr, rows)},${mod(tc + dc, cols)}`)
      );

      const isMovable = moves.length > 0;
      const isMultiDir = moves.length > 1;

      // ── Build per-cell elements ──
      const tileEls = []; // main cell divs only (arrows/clicks)
      const allEls  = []; // all visual divs (hover highlight)
      cells.forEach(({dr, dc}) => {
        const br = mod(tr + dr, rows), bc = mod(tc + dc, cols);
        const adjUp    = boardPosSet.has(`${mod(br-1,rows)},${bc}`) && br > 0;
        const adjDown  = boardPosSet.has(`${mod(br+1,rows)},${bc}`) && br < rows-1;
        const adjLeft  = boardPosSet.has(`${br},${mod(bc-1,cols)}`) && bc > 0;
        const adjRight = boardPosSet.has(`${br},${mod(bc+1,cols)}`) && bc < cols-1;
        const contUp    = cs.has(`${dr-1},${dc}`) && !adjUp;
        const contDown  = cs.has(`${dr+1},${dc}`) && !adjDown;
        const contLeft  = cs.has(`${dr},${dc-1}`) && !adjLeft;
        const contRight = cs.has(`${dr},${dc+1}`) && !adjRight;

        const left = leftOff + px(bc), top = colWrapH + br * (TS + PG);

        // ── Main TS×TS cell div ──
        const el = document.createElement('div');
        let cls = 'tile-el ';
        if (!isMovable) cls += 'inert';
        else if (isMultiDir) cls += 'movable multi-dir' + (anyWrap ? ' wrap-move' : '');
        else cls += 'movable' + (anyWrap ? ' wrap-move' : '');
        el.className = cls;

        let borderTop    = adjUp    ? 'none' : '';
        let borderBottom = adjDown  ? 'none' : '';
        let borderLeft2  = adjLeft  ? 'none' : '';
        let borderRight2 = adjRight ? 'none' : '';
        if (contUp)    borderTop    = '2px dashed var(--cyan)';
        if (contDown)  borderBottom = '2px dashed var(--cyan)';
        if (contLeft)  borderLeft2  = '2px dashed var(--cyan)';
        if (contRight) borderRight2 = '2px dashed var(--cyan)';

        el.style.cssText =
          `left:${left}px;top:${top}px;width:${TS}px;height:${TS}px;` +
          `font-size:${FS}px;position:absolute;z-index:2;` +
          `display:flex;align-items:center;justify-content:center;` +
          (borderTop    ? `border-top:${borderTop};` : '') +
          (borderBottom ? `border-bottom:${borderBottom};` : '') +
          (borderLeft2  ? `border-left:${borderLeft2};` : '') +
          (borderRight2 ? `border-right:${borderRight2};` : '');

        el.textContent = tileCellLabel(id, dr, dc);

        if (g && (pos.r !== g.r || pos.c !== g.c)) el.classList.add('misplaced');
        else if (g) el.classList.add('correct');
        if (mark) {
          el.classList.add('marked');
          el.style.setProperty('--mc', mark);
          el.style.setProperty('--mc-bg', mark);
        }

        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (!gameState || gameState.won) return;
          toggleTileMark(id);
        });
        let _lpt;
        el.addEventListener('touchstart', e => {
          _lpt = setTimeout(() => {
            if (gameState && !gameState.won) { e.preventDefault(); toggleTileMark(id); }
          }, 500);
        }, {passive: true});
        el.addEventListener('touchend', () => clearTimeout(_lpt));
        el.addEventListener('touchmove', () => clearTimeout(_lpt));

        area.appendChild(el);
        tileEls.push({el, dr, dc});
        allEls.push(el);

        // ── Right gap strip (PG×TS) ──
        if (adjRight) {
          const diagInTile = boardPosSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
          const strip = document.createElement('div');
          strip.className = cls;
          const stripTop    = adjUp   ? 'none' : '';
          const stripBottom = (adjDown && diagInTile) ? 'none' : '';
          strip.style.cssText =
            `left:${left + TS}px;top:${top}px;width:${PG}px;height:${TS}px;` +
            `position:absolute;z-index:2;border-left:none;border-right:none;` +
            (stripTop    ? `border-top:none;` : '') +
            (stripBottom ? `border-bottom:none;` : '');
          if (mark) {
            strip.classList.add('marked');
            strip.style.setProperty('--mc-bg', mark);
          }
          if (g && (pos.r !== g.r || pos.c !== g.c)) strip.classList.add('misplaced');
          else if (g) strip.classList.add('correct');
          area.appendChild(strip);
          allEls.push(strip);
        }

        // ── Bottom gap strip (TS×PG) ──
        if (adjDown) {
          const diagInTile = boardPosSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
          const strip = document.createElement('div');
          strip.className = cls;
          const stripLeft  = adjLeft  ? 'none' : '';
          const stripRight = (adjRight && diagInTile) ? 'none' : '';
          strip.style.cssText =
            `left:${left}px;top:${top + TS}px;width:${TS}px;height:${PG}px;` +
            `position:absolute;z-index:2;border-top:none;border-bottom:none;` +
            (stripLeft  ? `border-left:none;` : '') +
            (stripRight ? `border-right:none;` : '');
          if (mark) {
            strip.classList.add('marked');
            strip.style.setProperty('--mc-bg', mark);
          }
          if (g && (pos.r !== g.r || pos.c !== g.c)) strip.classList.add('misplaced');
          else if (g) strip.classList.add('correct');
          area.appendChild(strip);
          allEls.push(strip);
        }

        // ── Corner square (PG×PG) only when diagonal is also in this tile ──
        if (adjRight && adjDown) {
          const diagInTile = boardPosSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
          if (diagInTile) {
            const corner = document.createElement('div');
            corner.className = cls;
            corner.style.cssText =
              `left:${left + TS}px;top:${top + TS}px;width:${PG}px;height:${PG}px;` +
              `position:absolute;z-index:2;border:none;`;
            if (mark) {
              corner.classList.add('marked');
              corner.style.setProperty('--mc-bg', mark);
            }
            if (g && (pos.r !== g.r || pos.c !== g.c)) corner.classList.add('misplaced');
            else if (g) corner.classList.add('correct');
            area.appendChild(corner);
            allEls.push(corner);
          }
        }
      });

      // ── Shared hover highlight across all visual divs of this tile ──
      if (isMovable) {
        allEls.forEach(el => {
          el.addEventListener('mouseenter', () => allEls.forEach(e => e.classList.add('tile-hover')));
          el.addEventListener('mouseleave', () => allEls.forEach(e => e.classList.remove('tile-hover')));
        });
      }

      // ── Click / arrow handlers ──
      const addArrows = (moveList) => {
        moveList.forEach(({dr: mdr, dc: mdc, wrap}) => {
          tileEls.forEach(({el, dr, dc}) => {
            if (cs.has(`${dr + mdr},${dc + mdc}`)) return; // interior edge — skip
            const btn = document.createElement('button');
            btn.className = 'arr-btn ' + DIRNAME[`${mdr},${mdc}`] + (wrap ? ' wrap-arr' : '');
            btn.style.cssText = `width:${ASZ}px;height:${ASZ}px;font-size:${Math.floor(ASZ * 0.7)}px`;
            btn.textContent = ARROW[`${mdr},${mdc}`];
            btn.addEventListener('click', e => { e.stopPropagation(); doTileMove(id, mdr, mdc); });
            el.appendChild(btn);
          });
        });
      };

      if (!isMovable) {
        tileEls.forEach(({el}) => el.addEventListener('click', () => playInvalid()));
      } else if (isMultiDir) {
        addArrows(moves);
      } else if (options.showArrows) {
        addArrows(moves);
        tileEls.forEach(({el}) => el.addEventListener('click', () => doTileMove(id, moves[0].dr, moves[0].dc)));
      } else {
        tileEls.forEach(({el}) => el.addEventListener('click', () => doTileMove(id, moves[0].dr, moves[0].dc)));
      }
    }
  }

  // ── Correct-tile outlines (canvas overlay, drawn per edge with gap extensions) ──
  if (options.highlightCorrect) {
    const OW = 3, OC = '#1a7a40';
    const canvasW = leftOff + W;
    const canvasH = colWrapH + rows * (TS + PG) - PG;
    const oc = document.createElement('canvas');
    oc.width = canvasW; oc.height = canvasH;
    oc.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;z-index:6`;
    const octx = oc.getContext('2d');
    octx.strokeStyle = OC;
    octx.lineWidth = OW;
    octx.lineCap = 'butt';
    const H = OW / 2; // half stroke width — used to close outer corners cleanly

    const drawLine = (x1, y1, x2, y2) => {
      octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x2, y2); octx.stroke();
    };

    const renderedOutline = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = board[r * cols + c];
        if (id <= 0 || renderedOutline.has(id)) continue;
        renderedOutline.add(id);

        const pos = tilePos.get(id); if (!pos) continue;
        const g = gameState.goalPos.get(id);
        if (!g || pos.r !== g.r || pos.c !== g.c) continue; // not correct

        const {r: tr, c: tc, cells} = pos;
        const cs = cellSet(cells);

        cells.forEach(({dr, dc}) => {
          const br = mod(tr + dr, rows), bc = mod(tc + dc, cols);
          const cx = leftOff + px(bc), cy = colWrapH + br * (TS + PG);
          const aU = cs.has(`${dr-1},${dc}`);
          const aD = cs.has(`${dr+1},${dc}`);
          const aL = cs.has(`${dr},${dc-1}`);
          const aR = cs.has(`${dr},${dc+1}`);

          // Right edge (vertical). Extend into gap when connected; add H at outer corners.
          if (!aR) drawLine(cx+TS, cy - (aU ? PG+OW : H), cx+TS, cy+TS + (aD ? PG+OW : H));
          // Left edge
          if (!aL) drawLine(cx,    cy - (aU ? PG+OW : H), cx,    cy+TS + (aD ? PG+OW : H));
          // Top edge (horizontal). Extend into gap when connected; add H at outer corners.
          if (!aU) drawLine(cx - (aL ? PG+OW : H), cy,    cx+TS + (aR ? PG+OW : H), cy);
          // Bottom edge
          if (!aD) drawLine(cx - (aL ? PG+OW : H), cy+TS, cx+TS + (aR ? PG+OW : H), cy+TS);
        });
      }
    }
    area.appendChild(oc);
  }

  // Vertical barrier overlays (above tiles, z-index:3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!lb.has(barrierKey(r, c, r, c + 1))) continue;
      const ovW = BW + 4;
      const gapCentreX = leftOff + px(c + 1) - PG / 2;
      const ov = document.createElement('canvas');
      ov.width = ovW; ov.height = TS;
      ov.style.cssText =
        `position:absolute;left:${gapCentreX - ovW/2}px;top:${colWrapH + r*(TS+PG)}px;z-index:3;pointer-events:none`;
      const ctx = ov.getContext('2d');
      ctx.strokeStyle = '#ff4466'; ctx.lineWidth = BW; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ovW / 2, 2); ctx.lineTo(ovW / 2, TS - 2); ctx.stroke();
      area.appendChild(ov);
    }
  }

  // Ghost background — solid cover over canvas rows so current board state doesn't show through
  const ghostBg = document.createElement('div');
  ghostBg.className = 'ghost-bg';
  area.appendChild(ghostBg);

  // Ghost grid — dashed outline for every cell edge, omitting interiors of multi-cell tiles
  {
    // Build goal-state board: "r,c" -> tile id
    const goalBoard = new Map();
    for (const t of gameState.layout.tiles) {
      const gp = gameState.goalPos.get(t.id);
      if (!gp) continue;
      for (const {dr, dc} of t.cells)
        goalBoard.set(`${mod(gp.r + dr, rows)},${mod(gp.c + dc, cols)}`, t.id);
    }

    const gg = document.createElement('canvas');
    gg.className = 'ghost-grid';
    gg.width  = leftOff + W;
    gg.height = colWrapH + rows * (TS + PG) - PG;
    const gctx = gg.getContext('2d');
    gctx.strokeStyle = '#2a2a2a';
    gctx.lineWidth = 1;
    gctx.setLineDash([3, 3]);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tid = goalBoard.get(`${r},${c}`);
        const x = leftOff + px(c) + 0.5, y = colWrapH + r * (TS + PG) + 0.5;
        const same = (nr, nc) => tid && goalBoard.get(`${mod(nr, rows)},${mod(nc, cols)}`) === tid;

        if (!same(r-1, c)) { gctx.beginPath(); gctx.moveTo(x,      y);   gctx.lineTo(x+TS-1, y);      gctx.stroke(); }
        if (!same(r+1, c)) { gctx.beginPath(); gctx.moveTo(x,      y+TS-1); gctx.lineTo(x+TS-1, y+TS-1); gctx.stroke(); }
        if (!same(r, c-1)) { gctx.beginPath(); gctx.moveTo(x,      y);   gctx.lineTo(x,      y+TS-1); gctx.stroke(); }
        if (!same(r, c+1)) { gctx.beginPath(); gctx.moveTo(x+TS-1, y);   gctx.lineTo(x+TS-1, y+TS-1); gctx.stroke(); }
      }
    }
    area.appendChild(gg);
  }

  // Blocked cell ✕ marks on the ghost layer — one canvas per row, matching normal row canvas exactly
  for (let r = 0; r < rows; r++) {
    const hasBlocked = Array.from({length: cols}, (_, c) => layout.blocked.has(r * cols + c)).some(Boolean);
    if (!hasBlocked) continue;
    const gc = document.createElement('canvas');
    gc.width  = W;
    gc.height = TS;
    gc.className = 'ghost-tile';
    gc.style.cssText =
      `position:absolute;left:${leftOff}px;top:${colWrapH + r * (TS + PG)}px;` +
      `pointer-events:none;z-index:6`;
    const gctx = gc.getContext('2d');
    for (let c = 0; c < cols; c++) {
      if (!layout.blocked.has(r * cols + c)) continue;
      const x = px(c);
      gctx.fillStyle = '#1a1a1a'; gctx.fillRect(x, 0, TS, TS);
      gctx.strokeStyle = '#444'; gctx.lineWidth = 1;
      gctx.strokeRect(x + 0.5, 0.5, TS - 1, TS - 1);
      gctx.fillStyle = '#555';
      gctx.font = `bold ${Math.floor(TS * 0.35)}px Syne`;
      gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
      gctx.fillText('✕', x + TS / 2, TS / 2);
    }
    area.appendChild(gc);
  }

  // Ghost tiles (goal position overlay, shown on hover of "goal" stat)
  for (const t of gameState.layout.tiles) {
    const gp = gameState.goalPos.get(t.id);
    if (!gp) continue;
    const curPos = gameState.tilePos.get(t.id);
    const isCorrect = curPos && curPos.r === gp.r && curPos.c === gp.c;

    // Build set of board positions for goal
    const ghostBoardSet = new Set(
      t.cells.map(({dr, dc}) => `${mod(gp.r + dr, rows)},${mod(gp.c + dc, cols)}`)
    );

    t.cells.forEach(({dr, dc}) => {
      const br = mod(gp.r + dr, rows), bc = mod(gp.c + dc, cols);
      const adjUp    = ghostBoardSet.has(`${mod(br-1,rows)},${bc}`) && br > 0;
      const adjDown  = ghostBoardSet.has(`${mod(br+1,rows)},${bc}`) && br < rows-1;
      const adjLeft  = ghostBoardSet.has(`${br},${mod(bc-1,cols)}`) && bc > 0;
      const adjRight = ghostBoardSet.has(`${br},${mod(bc+1,cols)}`) && bc < cols-1;

      const gleft = leftOff + px(bc), gtop = colWrapH + br * (TS + PG);
      const gcls = 'ghost-tile ' + (isCorrect ? 'ghost-correct' : 'ghost-wrong');

      // Main TS×TS cell
      const ghost = document.createElement('div');
      ghost.className = gcls;
      ghost.style.cssText =
        `left:${gleft}px;top:${gtop}px;width:${TS}px;height:${TS}px;` +
        `font-size:${FS}px;position:absolute;` +
        `align-items:center;justify-content:center;` +
        (adjUp    ? 'border-top:none;' : '') +
        (adjDown  ? 'border-bottom:none;' : '') +
        (adjLeft  ? 'border-left:none;' : '') +
        (adjRight ? 'border-right:none;' : '');
      ghost.textContent = tileCellLabel(t.id, dr, dc);
      area.appendChild(ghost);

      // Right gap strip
      if (adjRight) {
        const diagIn = ghostBoardSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
        const s = document.createElement('div');
        s.className = gcls;
        s.style.cssText =
          `left:${gleft+TS}px;top:${gtop}px;width:${PG}px;height:${TS}px;` +
          `position:absolute;border-left:none;border-right:none;` +
          (adjUp              ? 'border-top:none;' : '') +
          (adjDown && diagIn  ? 'border-bottom:none;' : '');
        area.appendChild(s);
      }

      // Bottom gap strip
      if (adjDown) {
        const diagIn = ghostBoardSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
        const s = document.createElement('div');
        s.className = gcls;
        s.style.cssText =
          `left:${gleft}px;top:${gtop+TS}px;width:${TS}px;height:${PG}px;` +
          `position:absolute;border-top:none;border-bottom:none;` +
          (adjLeft             ? 'border-left:none;' : '') +
          (adjRight && diagIn  ? 'border-right:none;' : '');
        area.appendChild(s);
      }

      // Corner square
      if (adjRight && adjDown) {
        const diagIn = ghostBoardSet.has(`${mod(br+1,rows)},${mod(bc+1,cols)}`);
        if (diagIn) {
          const s = document.createElement('div');
          s.className = gcls;
          s.style.cssText =
            `left:${gleft+TS}px;top:${gtop+TS}px;width:${PG}px;height:${PG}px;` +
            `position:absolute;border:none;`;
          area.appendChild(s);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Screen switching
// ---------------------------------------------------------------------------

function showScreen(name) {
  document.getElementById('screenEditor').classList.toggle('active', name === 'editor');
  document.getElementById('screenPlay').classList.toggle('active', name === 'play');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.screen === name));
  if (name === 'play') {
    requestAnimationFrame(function() {
      const input = document.getElementById('optSolveSpeed');
      const lbl   = document.getElementById('optSolveSpeedV');
      if (!input || !lbl) return;
      const f = (+input.value - +input.min) / (+input.max - +input.min);
      const r = 8, w = input.offsetWidth - r * 2;
      lbl.style.left = (r + f * w) + 'px';
    });
  }
}
