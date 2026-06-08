// Proper modulo (handles negatives)
function mod(n, m) { return ((n % m) + m) % m; }

// Fisher-Yates shuffle (in-place, returns array)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Barrier key: canonical (smaller index first)
function barrierKey(r1, c1, r2, c2) {
  const a = r1 * 1000 + c1, b = r2 * 1000 + c2;
  return a < b ? `${r1},${c1},${r2},${c2}` : `${r2},${c2},${r1},${c1}`;
}

function hasBarrierL(layout, r1, c1, r2, c2) {
  return layout.barriers.has(barrierKey(r1, c1, r2, c2));
}

// Set of "dr,dc" strings for fast lookup
function cellSet(cells) {
  return new Set(cells.map(({dr, dc}) => `${dr},${dc}`));
}

// Bounding box of a cells array [{dr,dc}]
function cellsBBox(cells) {
  const rows = cells.map(c => c.dr), cols = cells.map(c => c.dc);
  return {
    minR: Math.min(...rows), maxR: Math.max(...rows),
    minC: Math.min(...cols), maxC: Math.max(...cols)
  };
}
