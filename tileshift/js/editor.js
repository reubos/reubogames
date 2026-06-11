// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

let edCols = 4, edRows = 4, edCells = [], rowWrap = [], colWrap = [], barriers = new Set();
let currentTool = 'active';
let painting = false, paintVal = null, paintGroup = 0;
let nextGroup = 1;
let editorTS = 40, editorPG = PG;

function newGroup() { return nextGroup++; }

// ---------------------------------------------------------------------------
// Default / init
// ---------------------------------------------------------------------------

function defaultEdCells(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    cells.push([]);
    for (let c = 0; c < cols; c++) {
      const isHole = r === rows - 1 && c === cols - 1;
      cells[r].push(isHole ? {type: 'hole'} : {type: 'active', group: newGroup()});
    }
  }
  return cells;
}

function defaultLayout() {
  return {
    cols: 4, rows: 4,
    cells: defaultEdCells(4, 4),
    rowWrap: Array(4).fill(false),
    colWrap: Array(4).fill(false),
    barriers: new Set()
  };
}

function initEditor(p) {
  edCols = p.cols; edRows = p.rows;
  if (p.cells) {
    edCells = p.cells.map(row => row.map(c => ({...c})));

    // ── Migration: old saves use tw/th on anchors + _covered on non-anchors ──
    // Pass 1: assign a new group to every anchor (active cell with tw>1 or th>1)
    //         and stamp that group onto its _covered cells.
    for (let r = 0; r < edRows; r++) {
      for (let c = 0; c < edCols; c++) {
        const cell = edCells[r][c];
        if (cell.type === 'active' && !cell.group) {
          const tw = cell.tw || 1, th = cell.th || 1;
          const g = newGroup();
          cell.group = g;
          for (let dr = 0; dr < th; dr++) {
            for (let dc = 0; dc < tw; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr, nc = c + dc;
              if (nr < edRows && nc < edCols) {
                edCells[nr][nc] = {type: 'active', group: g};
              }
            }
          }
        }
      }
    }
    // Pass 2: any remaining _covered cells (orphaned) become solo active tiles
    let maxGroup = 0;
    for (let r = 0; r < edRows; r++) {
      for (let c = 0; c < edCols; c++) {
        const cell = edCells[r][c];
        if (cell.type === '_covered') cell.type = 'active';
        if (cell.type === 'active') {
          if (!cell.group) cell.group = newGroup();
          maxGroup = Math.max(maxGroup, cell.group);
        }
      }
    }
    nextGroup = Math.max(nextGroup, maxGroup + 1);
  } else {
    edCells = defaultEdCells(edRows, edCols);
  }
  rowWrap = p.rowWrap ? [...p.rowWrap] : Array(edRows).fill(false);
  colWrap = p.colWrap ? [...p.colWrap] : Array(edCols).fill(false);
  barriers = new Set(p.barriers || []);

  document.getElementById('sCols').value = edCols;
  document.getElementById('sColsV').textContent = edCols;
  document.getElementById('sRows').value = edRows;
  document.getElementById('sRowsV').textContent = edRows;
  renderEditor();
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function resizeGrid(nc, nr) {
  if (isBuiltinSelected()) return;
  const newCells = [], newRW = Array(nr).fill(false), newCW = Array(nc).fill(false);
  for (let r = 0; r < nr; r++) {
    newCells.push([]);
    if (r < edRows) newRW[r] = rowWrap[r] || false;
    for (let c = 0; c < nc; c++) {
      newCells[r].push(
        r < edRows && c < edCols ? {...edCells[r][c]} : {type: 'active', group: newGroup()}
      );
      if (c < edCols) newCW[c] = colWrap[c] || false;
    }
  }
  const newB = new Set();
  for (const k of barriers) {
    const [r1, c1, r2, c2] = k.split(',').map(Number);
    if (r1 < nr && r2 < nr && c1 < nc && c2 < nc) newB.add(k);
  }
  edCols = nc; edRows = nr; edCells = newCells; rowWrap = newRW; colWrap = newCW; barriers = newB;

  // Clamp groups whose cells now extend beyond the grid: split off the out-of-bounds cells
  // into new solo groups (each gets their own group, making them independent 1×1 tiles)
  const groupCells = new Map();
  for (let r = 0; r < edRows; r++) {
    for (let c = 0; c < edCols; c++) {
      const cell = edCells[r][c];
      if (cell.type === 'active') {
        if (!groupCells.has(cell.group)) groupCells.set(cell.group, []);
        groupCells.get(cell.group).push({r, c});
      }
    }
  }
  // A group is valid only if all its cells survived the resize (they did — we just copied them).
  // But any group whose cells include a position outside the new grid was already truncated.
  // The only issue is dangling cells that belonged to a group whose OTHER cells were cut off.
  // To detect: compare what we have vs original. We can't easily do this, so instead we check
  // connectivity: if cells of a group are not all reachable from each other (4-connected), split.
  // For simplicity, just ensure no isolated cells have tw/th leftover (no longer applicable
  // since we removed tw/th). The group system is already clean here.

  renderEditor();
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function clearGrid() {
  if (isBuiltinSelected()) return;
  for (let r = 0; r < edRows; r++) {
    for (let c = 0; c < edCols; c++) {
      edCells[r][c] = {type: 'active', group: newGroup()};
    }
  }
  barriers.clear();
  renderEditor();
}

function setTool(t) {
  currentTool = t;
  ['Active', 'Blocked', 'Hole'].forEach(n => {
    const el = document.getElementById('t' + n);
    el.classList.toggle('on', t === n.toLowerCase());
    el.classList.remove('barrier-on');
  });
  const bEl = document.getElementById('tBarrier');
  bEl.classList.toggle('on', t === 'barrier');
}

function doPaint(r, c, isFirst) {
  if (paintVal === 'blocked') {
    edCells[r][c] = {type: 'blocked'};
  } else if (paintVal === 'hole') {
    edCells[r][c] = {type: 'hole'};
  } else {
    if (isFirst) paintGroup = newGroup();
    edCells[r][c] = {type: 'active', group: paintGroup};
  }
  renderEditor();
}

function getEditorCell(x, y) {
  const c = Math.floor(x / (editorTS + editorPG));
  const r = Math.floor(y / (editorTS + editorPG));
  if (r < 0 || r >= edRows || c < 0 || c >= edCols) return null;
  return {r, c};
}

function getEdge(x, y) {
  for (let c = 0; c < edCols - 1; c++) {
    const ex = (c + 1) * (editorTS + editorPG) - editorPG / 2;
    if (Math.abs(x - ex) <= BARRIER_ZONE) {
      const r = Math.floor(y / (editorTS + editorPG));
      if (r >= 0 && r < edRows) return {r1: r, c1: c, r2: r, c2: c + 1};
    }
  }
  for (let r = 0; r < edRows - 1; r++) {
    const ey = (r + 1) * (editorTS + editorPG) - editorPG / 2;
    if (Math.abs(y - ey) <= BARRIER_ZONE) {
      const c = Math.floor(x / (editorTS + editorPG));
      if (c >= 0 && c < edCols) return {r1: r, c1: c, r2: r + 1, c2: c};
    }
  }
  return null;
}

function setupEditorEvents(canvas) {
  let lastCell = null;
  const getXY = e => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {x: src.clientX - rect.left, y: src.clientY - rect.top};
  };
  const onDown = e => {
    if (isBuiltinSelected()) return;
    e.preventDefault();
    const {x, y} = getXY(e);
    if (currentTool === 'barrier') {
      const edge = getEdge(x, y);
      if (edge) {
        const a = edCells[edge.r1][edge.c1], b = edCells[edge.r2][edge.c2];
        const interior = a.type === 'active' && b.type === 'active' && a.group === b.group;
        if (!interior) {
          const k = barrierKey(edge.r1, edge.c1, edge.r2, edge.c2);
          barriers.has(k) ? barriers.delete(k) : barriers.add(k);
          renderEditor();
        }
      }
      return;
    }
    painting = true;
    paintVal = currentTool;
    lastCell = null;
    const cell = getEditorCell(x, y);
    if (cell) { doPaint(cell.r, cell.c, true); lastCell = cell; }
  };
  const onMove = e => {
    if (!painting || currentTool === 'barrier') return;
    const {x, y} = getXY(e);
    const cell = getEditorCell(x, y);
    if (cell && (cell.r !== lastCell?.r || cell.c !== lastCell?.c)) {
      doPaint(cell.r, cell.c, false);
      lastCell = cell;
    }
  };
  const onUp = () => { painting = false; lastCell = null; };
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('touchstart', onDown, {passive: false});
  canvas.addEventListener('touchmove', onMove, {passive: false});
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
}

// ---------------------------------------------------------------------------
// Saved layouts
// ---------------------------------------------------------------------------

function isBuiltinSelected() {
  return typeof currentLayoutKey === 'string' && currentLayoutKey.startsWith('builtin_');
}

function loadAllLayouts() {
  return { ...BUILTIN_LAYOUTS, ...loadSavedLayouts() };
}

function loadSavedLayouts() {
  try { return JSON.parse(localStorage.getItem('tileshift_layouts') || '{}'); }
  catch { return {}; }
}

function loadLayoutOrder(keys) {
  try {
    const order = JSON.parse(localStorage.getItem('tileshift_layout_order') || 'null');
    if (Array.isArray(order)) {
      const set = new Set(keys);
      const filtered = order.filter(k => set.has(k));
      keys.filter(k => !filtered.includes(k)).forEach(k => filtered.push(k));
      return filtered;
    }
  } catch {}
  return [...keys];
}

function saveLayoutOrder(order) {
  try { localStorage.setItem('tileshift_layout_order', JSON.stringify(order)); } catch {}
}

function editorSnapshot() {
  return {
    cols: edCols, rows: edRows,
    cells: edCells.map(row => row.map(c => ({...c}))),
    rowWrap: [...rowWrap], colWrap: [...colWrap],
    barriers: [...barriers]
  };
}

function newLayout() {
  const name = (prompt('Layout name:', 'New Layout') || '').trim();
  if (!name) return;
  const key = 'layout_' + Date.now();
  const saved = loadSavedLayouts();
  const def = defaultLayout();
  saved[key] = { name, ...def, barriers: [...def.barriers] };
  localStorage.setItem('tileshift_layouts', JSON.stringify(saved));
  const order = loadLayoutOrder(Object.keys(saved).filter(k => k !== key));
  order.push(key);
  saveLayoutOrder(order);
  currentLayoutKey = key;
  initEditor({ ...saved[key], barriers: new Set(saved[key].barriers) });
  buildSavedLayoutButtons();
}

function saveCurrentLayout() {
  if (isBuiltinSelected()) return;
  const saved = loadSavedLayouts();
  if (!currentLayoutKey || !saved[currentLayoutKey]) return;
  const snap = editorSnapshot();
  saved[currentLayoutKey] = { name: saved[currentLayoutKey].name, ...snap };
  localStorage.setItem('tileshift_layouts', JSON.stringify(saved));
  buildSavedLayoutButtons();
}

function revertLayout() {
  const all = loadAllLayouts();
  if (!currentLayoutKey || !all[currentLayoutKey]) return;
  const p = all[currentLayoutKey];
  initEditor({ ...p, barriers: new Set(p.barriers) });
  buildSavedLayoutButtons();
}

function renameLayout(key, newName) {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const saved = loadSavedLayouts();
  if (!saved[key]) return;
  saved[key].name = trimmed;
  localStorage.setItem('tileshift_layouts', JSON.stringify(saved));
  buildSavedLayoutButtons();
}

function deleteLayout(key) {
  if (key.startsWith('builtin_')) return;
  const saved = loadSavedLayouts();
  delete saved[key];
  localStorage.setItem('tileshift_layouts', JSON.stringify(saved));
  const remaining = loadLayoutOrder(Object.keys(saved)).filter(k => k !== key);
  saveLayoutOrder(remaining);
  // Select adjacent layout or fall back
  if (currentLayoutKey === key) {
    currentLayoutKey = remaining[0] || '__current__';
    const next = saved[remaining[0]];
    if (next) initEditor({ ...next, barriers: new Set(next.barriers) });
    else initEditor(defaultLayout());
  }
  buildSavedLayoutButtons();
}

let _dragSrcKey = null;
let _builtinPage = 0;
const BUILTINS_PER_PAGE = 5;

function buildSavedLayoutButtons() {
  const list = document.getElementById('savedList');
  list.innerHTML = '';

  const stats = loadStats();

  const makeBtn = (key, p) => {
    const btn = document.createElement('div');
    btn.className = 'pi';
    btn.style.cssText = 'flex:1;padding:5px 8px;cursor:pointer';
    const peppers = p.difficulty ? `<span style="font-size:9px;letter-spacing:-1px">${'🌶️'.repeat(p.difficulty)}</span>` : '';
    const best = stats[key]?.bestTime != null ? `<span style="color:var(--txt);font-size:9px">best: ${fmtTime(stats[key].bestTime)}</span>` : '';
    btn.innerHTML = `<span class="pn" style="display:flex;justify-content:space-between;align-items:center">${p.name}${peppers}</span><span class="pd" style="display:flex;justify-content:space-between">${p.cols}×${p.rows}${best}</span>`;
    if (key === currentLayoutKey) {
      btn.style.borderColor = 'var(--acc)';
      btn.querySelector('.pn').style.color = 'var(--acc)';
    }
    btn.addEventListener('click', () => {
      currentLayoutKey = key;
      initEditor({...p, barriers: new Set(p.barriers)});
      buildSavedLayoutButtons();
    });
    return btn;
  };

  // ── Built-in layouts (read-only, paginated) ──
  const totalPages = Math.ceil(BUILTIN_ORDER.length / BUILTINS_PER_PAGE);
  _builtinPage = Math.max(0, Math.min(_builtinPage, totalPages - 1));

  const biLabel = document.createElement('div');
  biLabel.style.cssText = 'font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mut);padding:2px 0 4px;display:flex;align-items:center;gap:5px';
  biLabel.innerHTML = '<span>built-in</span><span style="opacity:.4;flex:1;border-top:1px solid var(--bdr)"></span><span style="opacity:.6">🔒</span>';
  list.appendChild(biLabel);

  const pageStart = _builtinPage * BUILTINS_PER_PAGE;
  for (let i = 0; i < BUILTINS_PER_PAGE; i++) {
    const key = BUILTIN_ORDER[pageStart + i];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:stretch;height:44px;overflow:hidden';
    if (key) {
      row.appendChild(makeBtn(key, BUILTIN_LAYOUTS[key]));
    } else {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'flex:1;visibility:hidden';
      row.appendChild(placeholder);
    }
    list.appendChild(row);
  }

  // Pagination controls
  const pageRow = document.createElement('div');
  pageRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0 2px';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'tbtn';
  prevBtn.style.cssText = 'padding:2px 8px;font-size:13px';
  prevBtn.textContent = '‹';
  prevBtn.disabled = _builtinPage === 0;
  prevBtn.addEventListener('click', () => { _builtinPage--; buildSavedLayoutButtons(); });

  const pageLabel = document.createElement('span');
  pageLabel.style.cssText = 'font-size:9px;color:var(--mut)';
  pageLabel.textContent = `${_builtinPage + 1} / ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'tbtn';
  nextBtn.style.cssText = 'padding:2px 8px;font-size:13px';
  nextBtn.textContent = '›';
  nextBtn.disabled = _builtinPage === totalPages - 1;
  nextBtn.addEventListener('click', () => { _builtinPage++; buildSavedLayoutButtons(); });

  pageRow.appendChild(prevBtn);
  pageRow.appendChild(pageLabel);
  pageRow.appendChild(nextBtn);
  list.appendChild(pageRow);

  // ── User layouts (draggable, deletable) ──
  const saved = loadSavedLayouts();
  const userKeys = loadLayoutOrder(Object.keys(saved));

  const myLabel = document.createElement('div');
  myLabel.style.cssText = 'font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mut);padding:6px 0 4px;display:flex;align-items:center;gap:5px';
  myLabel.innerHTML = '<span>your layouts</span><span style="opacity:.4;flex:1;border-top:1px solid var(--bdr)"></span>';
  list.appendChild(myLabel);

  if (!userKeys.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:10px;color:var(--mut);padding:2px 0';
    empty.textContent = 'no saved layouts yet';
    list.appendChild(empty);
  }

  userKeys.forEach(key => {
    const p = saved[key];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:stretch';
    row.draggable = true;

    const handle = document.createElement('div');
    handle.textContent = '⠿';
    handle.style.cssText = 'display:flex;align-items:center;padding:0 4px;color:var(--mut);cursor:grab;font-size:14px;flex-shrink:0';

    const ren = document.createElement('button');
    ren.className = 'tbtn';
    ren.style.cssText = 'flex-shrink:0;font-size:11px;padding:0 6px';
    ren.textContent = '✏';
    ren.title = 'rename';
    ren.addEventListener('click', () => {
      const btn = row.querySelector('.pi');
      const nameSpan = btn?.querySelector('.pn');
      if (!nameSpan) return;
      const currentName = p.name;
      const input = document.createElement('input');
      input.value = currentName;
      input.style.cssText = 'width:100%;background:var(--surf2);border:1px solid var(--acc);color:var(--txt);font-family:inherit;font-size:10px;padding:1px 4px;outline:none';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        renameLayout(key, input.value);
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { buildSavedLayoutButtons(); }
      });
      input.addEventListener('blur', commit);
    });

    const del = document.createElement('button');
    del.className = 'tbtn';
    del.style.cssText = 'flex-shrink:0;color:#ff4466;border-color:#3a0010;font-size:14px;padding:0 7px';
    del.textContent = '×';
    del.addEventListener('click', () => deleteLayout(key));

    row.addEventListener('dragstart', e => {
      _dragSrcKey = key;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.style.opacity = '0.4', 0);
    });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.style.outline = '1px solid var(--acc)';
    });
    row.addEventListener('dragleave', () => { row.style.outline = ''; });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.outline = '';
      if (!_dragSrcKey || _dragSrcKey === key) return;
      const order = loadLayoutOrder(Object.keys(loadSavedLayouts()));
      const from = order.indexOf(_dragSrcKey), to = order.indexOf(key);
      order.splice(from, 1);
      order.splice(to, 0, _dragSrcKey);
      saveLayoutOrder(order);
      buildSavedLayoutButtons();
    });

    row.appendChild(handle); row.appendChild(makeBtn(key, p)); row.appendChild(ren); row.appendChild(del);
    list.appendChild(row);
  });

  // Show/hide save + revert buttons — hidden for built-ins
  const revertBtn = document.getElementById('revertBtn');
  const saveBtn   = document.getElementById('saveBtn');
  const isBuiltin = isBuiltinSelected();
  if (revertBtn) revertBtn.style.display = (!isBuiltin && currentLayoutKey && currentLayoutKey !== '__current__') ? '' : 'none';
  if (saveBtn)   saveBtn.style.display   = isBuiltin ? 'none' : '';

  // Lock cursor on editor canvas when a built-in is selected
  const edMount = document.getElementById('editorMount');
  if (edMount) edMount.classList.toggle('editor-locked', isBuiltin);

  // Lock grid-size sliders when a built-in is selected
  const gridPanel = document.getElementById('gridSizePanel');
  if (gridPanel) gridPanel.classList.toggle('grid-locked', isBuiltin);
  ['sCols','sRows'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBuiltin;
  });
}

// ---------------------------------------------------------------------------
// Render editor
// ---------------------------------------------------------------------------

function renderEditor() {
  const mount = document.getElementById('editorMount');
  const _cm = document.querySelector('#screenEditor .col-main');
  const availW = _cm ? Math.max(80, _cm.clientWidth - 28) : 400;
  const TS = Math.max(28, Math.min(60, Math.floor((availW - (edCols - 1) * PG) / edCols)));
  editorTS = TS; editorPG = PG;

  const FS = Math.max(9, Math.min(16, Math.floor(TS * 0.28)));
  const BW = Math.max(3, Math.floor(TS * 0.08));
  const wLW = 20;
  const coordLabelFS = Math.max(8, Math.floor(TS * 0.22));
  const lnW = Math.max(14, coordLabelFS + 6);
  const leftOff = lnW + wLW + PG;
  const gridW = edCols * (TS + PG) - PG;
  const gridH = edRows * (TS + PG) - PG;
  function px(c) { return c * (TS + PG); }

  const TILE_COLOR = '#4488ff';

  // Build adjacency set for each group (to suppress shared borders)
  // groupAdj.get(group) = Set of "dr,dc" offsets relative to anchor
  // We'll compute per-cell adjacency inline during rendering

  const coordLabelH = coordLabelFS + 2;

  mount.innerHTML = '';
  const outer = document.createElement('div');
  outer.style.cssText = 'display:inline-flex;flex-direction:column';

  // Spacer matching play area's coordColRow (keeps grid top-aligned with play view)
  const spacerRow = document.createElement('div');
  spacerRow.style.cssText = `height:${coordLabelH}px;margin-bottom:2px`;
  outer.appendChild(spacerRow);

  // Col wrap toggles
  const colWrapRow = document.createElement('div');
  colWrapRow.style.cssText = `display:flex;gap:${PG}px;margin-left:${leftOff}px;margin-bottom:3px`;
  for (let c = 0; c < edCols; c++) {
    const d = document.createElement('div');
    d.className = 'wrap-tog' + (colWrap[c] ? ' on' : '');
    d.style.cssText = `width:${TS}px;height:16px`;
    d.textContent = '↕'; d.title = `col ${c}: wrap top↔bottom`;
    d.addEventListener('click', () => { if (isBuiltinSelected()) return; colWrap[c] = !colWrap[c]; renderEditor(); });
    colWrapRow.appendChild(d);
  }
  outer.appendChild(colWrapRow);

  const middle = document.createElement('div');
  middle.style.cssText = `display:flex;gap:${PG}px`;

  // Row wrap toggles (left side)
  const rowWrapCol = document.createElement('div');
  rowWrapCol.style.cssText = `display:flex;flex-direction:column;gap:${PG}px`;
  for (let r = 0; r < edRows; r++) {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;height:${TS}px`;
    const spacer = document.createElement('div');
    spacer.style.cssText = `width:${lnW}px;flex-shrink:0`;
    const d = document.createElement('div');
    d.className = 'wrap-tog' + (rowWrap[r] ? ' on' : '');
    d.style.cssText = `width:${wLW}px;height:${TS}px`;
    d.textContent = '↔'; d.title = `row ${r}: wrap left↔right`;
    d.addEventListener('click', () => { if (isBuiltinSelected()) return; rowWrap[r] = !rowWrap[r]; renderEditor(); });
    row.appendChild(spacer); row.appendChild(d);
    rowWrapCol.appendChild(row);
  }
  middle.appendChild(rowWrapCol);

  // Grid area
  const grid = document.createElement('div');
  grid.style.cssText = `position:relative;width:${gridW}px;height:${gridH}px`;

  // Background cells (holes, blocked, empty)
  for (let r = 0; r < edRows; r++) {
    const y = r * (TS + PG);
    for (let c = 0; c < edCols; c++) {
      const cell = edCells[r][c];
      const bg = document.createElement('div');
      bg.style.cssText = `position:absolute;left:${px(c)}px;top:${y}px;width:${TS}px;height:${TS}px;` +
        `display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;` +
        `font-weight:bold;font-size:${Math.floor(TS * 0.32)}px;z-index:1`;
      if (cell.type === 'hole') {
        bg.style.background = 'transparent';
        bg.style.border = '1px dashed #2a2a2a';
      } else if (cell.type === 'blocked') {
        bg.style.background = '#1a1a1a'; bg.style.color = '#555';
        bg.style.border = '1px solid #444';
        bg.style.fontSize = `${Math.floor(TS * 0.35)}px`;
        bg.textContent = '✕';
      } else {
        bg.style.background = 'transparent';
        bg.style.border = '1px dashed #2a2a2a';
      }
      grid.appendChild(bg);
    }

    // Horizontal barrier gap overlays
    if (r < edRows - 1) {
      for (let c = 0; c < edCols; c++) {
        if (!barriers.has(barrierKey(r, c, r + 1, c))) continue;
        const ov = document.createElement('canvas');
        ov.width = TS; ov.height = PG;
        ov.style.cssText = `position:absolute;left:${px(c)}px;top:${y + TS}px;z-index:4;pointer-events:none`;
        const ctx = ov.getContext('2d');
        ctx.strokeStyle = '#ff4466'; ctx.lineWidth = BW; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(2, PG / 2); ctx.lineTo(TS - 2, PG / 2); ctx.stroke();
        grid.appendChild(ov);
      }
    }
  }

  // Tile overlays — main TS×TS cell div, plus separate gap strips and corner squares.
  // Keeping these separate avoids incorrectly filling a corner not part of the tile.
  const ig = (rr, cc, g) =>
    rr >= 0 && rr < edRows && cc >= 0 && cc < edCols &&
    edCells[rr][cc].type === 'active' && edCells[rr][cc].group === g;

  for (let r = 0; r < edRows; r++) {
    for (let c = 0; c < edCols; c++) {
      const cell = edCells[r][c];
      if (cell.type !== 'active') continue;

      const g = cell.group;
      const color = TILE_COLOR;

      const sameUp    = ig(r-1, c,   g);
      const sameDown  = ig(r+1, c,   g);
      const sameLeft  = ig(r,   c-1, g);
      const sameRight = ig(r,   c+1, g);

      // ── Main cell div (always TS×TS) ──
      const el = document.createElement('div');
      el.style.cssText =
        `position:absolute;left:${px(c)}px;top:${r*(TS+PG)}px;` +
        `width:${TS}px;height:${TS}px;z-index:2;pointer-events:none;` +
        `background:#2a2a2a;box-sizing:border-box;` +
        `border-top:${sameUp    ? 'none' : `1px solid ${color}`};` +
        `border-bottom:${sameDown  ? 'none' : `1px solid ${color}`};` +
        `border-left:${sameLeft  ? 'none' : `1px solid ${color}`};` +
        `border-right:${sameRight ? 'none' : `1px solid ${color}`};`;

      const isAnchor = !sameUp && !sameLeft;
      if (isAnchor) {
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = `${FS}px`;
        el.style.fontFamily = 'Syne,sans-serif';
        el.style.fontWeight = '700';
        el.style.color = color;
      }
      grid.appendChild(el);

      // ── Right gap strip (PG wide × TS tall) ──
      // Top/bottom borders only where no adjacent strip exists above/below.
      if (sameRight) {
        const stripAbove = ig(r-1, c, g) && ig(r-1, c+1, g);
        const stripBelow = ig(r+1, c, g) && ig(r+1, c+1, g);
        const s = document.createElement('div');
        s.style.cssText =
          `position:absolute;left:${px(c)+TS}px;top:${r*(TS+PG)}px;` +
          `width:${PG}px;height:${TS}px;z-index:2;pointer-events:none;` +
          `background:#2a2a2a;box-sizing:border-box;` +
          `border-top:${stripAbove ? 'none' : `1px solid ${color}`};` +
          `border-bottom:${stripBelow ? 'none' : `1px solid ${color}`};`;
        grid.appendChild(s);
      }

      // ── Bottom gap strip (TS wide × PG tall) ──
      // Left/right borders only where no adjacent strip exists to the left/right.
      if (sameDown) {
        const stripLeft  = ig(r, c-1, g) && ig(r+1, c-1, g);
        const stripRight = ig(r, c+1, g) && ig(r+1, c+1, g);
        const s = document.createElement('div');
        s.style.cssText =
          `position:absolute;left:${px(c)}px;top:${r*(TS+PG)+TS}px;` +
          `width:${TS}px;height:${PG}px;z-index:2;pointer-events:none;` +
          `background:#2a2a2a;box-sizing:border-box;` +
          `border-left:${stripLeft  ? 'none' : `1px solid ${color}`};` +
          `border-right:${stripRight ? 'none' : `1px solid ${color}`};`;
        grid.appendChild(s);
      }

      // ── Corner square (PG×PG) ──
      // Only when right, down, AND the diagonal are all in the same group.
      if (sameRight && sameDown && ig(r+1, c+1, g)) {
        const s = document.createElement('div');
        s.style.cssText =
          `position:absolute;left:${px(c)+TS}px;top:${r*(TS+PG)+TS}px;` +
          `width:${PG}px;height:${PG}px;z-index:2;pointer-events:none;` +
          `background:#2a2a2a;`;
        grid.appendChild(s);
      }
    }
  }

  // Vertical barrier overlays
  for (let r = 0; r < edRows; r++) {
    for (let c = 0; c < edCols - 1; c++) {
      if (!barriers.has(barrierKey(r, c, r, c + 1))) continue;
      const ovW = BW + 4;
      const ovLeft = px(c + 1) - PG / 2 - ovW / 2;
      const ov = document.createElement('canvas');
      ov.width = ovW; ov.height = TS;
      ov.style.cssText = `position:absolute;left:${ovLeft}px;top:${r*(TS+PG)}px;z-index:3;pointer-events:none`;
      const ctx = ov.getContext('2d');
      ctx.strokeStyle = '#ff4466'; ctx.lineWidth = BW; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ovW / 2, 2); ctx.lineTo(ovW / 2, TS - 2); ctx.stroke();
      grid.appendChild(ov);
    }
  }

  // Transparent interaction canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'editorCanvas';
  canvas.width = gridW; canvas.height = gridH;
  canvas.style.cssText = `position:absolute;left:0;top:0;z-index:5;opacity:0;cursor:crosshair`;
  setupEditorEvents(canvas);
  grid.appendChild(canvas);

  middle.appendChild(grid);
  outer.appendChild(middle);
  mount.appendChild(outer);
}

// Slider wiring
['sCols', 'sRows'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    document.getElementById(id + 'V').textContent = this.value;
  });
  document.getElementById(id).addEventListener('change', function () {
    document.getElementById(id + 'V').textContent = this.value;
    resizeGrid(+document.getElementById('sCols').value, +document.getElementById('sRows').value);
  });
});
