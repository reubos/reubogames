"use strict";

/* Pentagonal Minesweeper — drawing, pointing, the controls, the self-check, and go.
   One of five scripts sharing a single scope; the order they are
   loaded in is the order the one file used to run in. */

/* =====================================================================
   7. DRAWING
   ===================================================================== */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let cellPath = [];
let view = { s: 1, ox: 0, oy: 0 };
let hover = -1;

const DUG = '#1b3620', LINE = '#16301b', RIM = '#4a7d55';
const BOOM = '#b91c1c', MINED = '#7f1d1d';
const MUTE = '#6f8c74';        // a question mark, dimmer than any number
const HINT = '#facc15';        // the gold a hint marks its cells with
const BOXLINE = '#cfe7d6';     // the pale line drawn round a box of the repeat
const BOXNUM = '#9dbca5';      // and the quieter tone its number is written in
const ADJ = '#bfe3ff';         // the wash over the cells a hovered number counts
const SPENT = '#5c7a62';       // a number whose flags are all planted
/* A number carrying more flags than it asked for. Colouring the digit alone
   was no use: the palette already writes every 3 in that same red, so an
   over-flagged 3 looked exactly like an ordinary one. It gets the cell
   instead — a red wash under it and a rim round it, with the digit in white
   above — which no ordinary number ever wears. */
const OVER = '#ff2d2d';        // the rim and wash under an over-flagged number
const OVERINK = '#fff4f4';     // and the digit written over it
/* How crowded a flag is under Sparse: room, at the cap, over it. Deliberately
   not the palette the numbers use. The first set drawn here took its green
   from the 2, its amber from the hint gold and its red from the 3 — the same
   values exactly, so a count beside a flag read as a tile's number. These sit
   a measured distance off every one of them: the nearest clash is fourteen
   for the mint, thirteen for the lemon and twelve for the red, where before
   all three were nought. The red is the one the over-flagged cell wears, both
   meaning the same thing — a law the flags as placed have broken. */
const CROWD = ['#a7f3d0', '#fef08a', '#ff2d2d'];
// one green per pentagon shape, used only when asked for
const COVERS = ['#35603d', '#2c5a4c', '#3d5f33', '#2f5560'];
const COVER_HI = '#4b8557';
const NUMS = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fbbf24',
              '#22d3ee', '#f9a8d4', '#fb923c', '#a3e635', '#e879f9', '#94a3b8', '#fca5a5'];

/* The line round each box: every edge of the tiles in it, less the ones two
   of them share. Worked out when a board first asks for it and thrown away
   with the board, since nothing else needs it.

   A box keeping its number to itself is left unlined as well as unlabelled.
   Where the boxes carry numbers the line is what points at one, and a line
   round nothing only sends the eye somewhere there is nothing to read. The
   boxes that say the same thing all over — at least one mine apiece, and the
   like — are lined every one of them, since there the line is the clue.

   Which boxes are keeping quiet is not settled until the board has been muted
   or pared, and by then the first draw has already been asked for its lines.
   So what is kept is the line round every box, each on its own, and the ones
   to leave out are chosen afresh at each drawing — the dear part cached, the
   part that changes not. */
let boxSeg = null;

function boxSegments() {
  if (!boxSeg) {
    const at = q => Math.round(q[0] * 2000) + ',' + Math.round(q[1] * 2000);
    boxSeg = boxes.map(g => {
      const rim = new Map();
      for (const i of g) {
        const p = poly[i];
        for (let k = 0, m = p.length - 1; k < p.length; m = k++) {
          const u = at(p[m]), v = at(p[k]);
          const e = u < v ? u + '|' + v : v + '|' + u;
          if (rim.has(e)) rim.delete(e); else rim.set(e, [p[m], p[k]]);
        }
      }
      return [...rim.values()];
    });
  }
  /* A box that keeps its number to itself is left unlined only where the
     line was the only thing pointing at a number: the irregular cut, whose
     boxes are of no fixed shape, so a line round a silent one sends the eye
     somewhere there is nothing to read. Where the boxes come of the tiling's
     own repeat they are all lined, silent or not — the grid is part of how
     the board reads, and half a grid reads worse than none. */
  const hideSilent = boxLaw() === 'irregular';
  const out = [];
  for (let b = 0; b < boxes.length; b++) {
    if (hideSilent && boxMuted && boxMuted[b]) continue;
    for (const seg of boxSeg[b]) out.push(seg);
  }
  return out;
}

function buildPaths() {
  cellPath = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = new Path2D(), s = poly[i];
    p.moveTo(s[0][0], s[0][1]);
    for (let m = 1; m < s.length; m++) p.lineTo(s[m][0], s[m][1]);
    p.closePath();
    cellPath[i] = p;
  }
  layout();
}

// The canvas takes the panel's width and whatever height the board needs.
function layout() {
  if (!bounds) return;
  const cssW = canvas.parentElement.clientWidth - 20;
  const pad = 4;
  const s = Math.min((cssW - pad * 2) / bounds.w, 46 / cellPitch);
  const cssH = bounds.h * s + pad * 2;

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  view = {
    s: s * dpr,
    ox: ((cssW - bounds.w * s) / 2 - bounds.x0 * s) * dpr,
    oy: (pad - bounds.y0 * s) * dpr
  };
  draw();
}

// A mine: a disc with four spikes, drawn in screen pixels.
function drawMine(x, y, rad) {
  ctx.fillStyle = '#0d1a0f';
  ctx.strokeStyle = '#0d1a0f';
  ctx.lineWidth = Math.max(1, rad * 0.26);
  ctx.beginPath();
  for (let t = 0; t < 4; t++) {
    const a = t * Math.PI / 4;
    ctx.moveTo(x - Math.cos(a) * rad * 1.5, y - Math.sin(a) * rad * 1.5);
    ctx.lineTo(x + Math.cos(a) * rad * 1.5, y + Math.sin(a) * rad * 1.5);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#516b55';
  ctx.beginPath();
  ctx.arc(x - rad * 0.33, y - rad * 0.33, rad * 0.26, 0, TAU);
  ctx.fill();
}

/* A flag: a pole on a foot with a pennant. The pennant wears the law's
   verdict where a law is on: red for a flag whose requirement the flags as
   placed already satisfy, amber for one still short of it — a pair not yet
   paired, a group not yet joined, a chain not yet reaching the rim. Amber
   is not an accusation; it only says the law is not yet met here. */
/* Six company colours, ranked by size, and ordered so that the ones a board
   actually uses are the ones furthest apart: most positions show two or three
   companies, so red, blue and yellow lead, and the closest pair — orange
   against red — sits at the sixth rank, where six companies must be on the
   board at once before it is ever drawn. The pair a reader confuses first is
   blue against cyan, and the old set held both: a blue second and a cyan
   fourth, near enough on a pennant this small to read as one company. */
const FLAGHUES = ['#ef4444', '#60a5fa', '#facc15', '#e879f9', '#4ade80', '#fb923c'];
function drawFlag(x, y, rad, ok) {
  ctx.strokeStyle = '#e2eee2';
  ctx.lineWidth = Math.max(1, rad * 0.2);
  ctx.beginPath();
  ctx.moveTo(x + rad * 0.25, y - rad);
  ctx.lineTo(x + rad * 0.25, y + rad * 0.7);
  ctx.moveTo(x - rad * 0.5, y + rad * 0.85);
  ctx.lineTo(x + rad * 0.9, y + rad * 0.85);
  ctx.stroke();
  /* The pennant's verdict comes in three languages. True and undefined are
     the plain red of a satisfied or unjudged flag; false is the amber of a
     law not yet met; and a number is a company colour — under the two-group
     laws every connected company of flags wears its own, the six largest
     each distinct and the rest grey, so the pennants map the grouping at a
     glance. */
  ctx.fillStyle = typeof ok === 'number'
    ? (ok < 0 ? '#9ca3af' : FLAGHUES[ok])
    : ok === false ? '#f59e0b' : '#ef4444';
  ctx.beginPath();
  ctx.moveTo(x + rad * 0.25, y - rad);
  ctx.lineTo(x - rad * 0.85, y - rad * 0.42);
  ctx.lineTo(x + rad * 0.25, y + rad * 0.15);
  ctx.closePath();
  ctx.fill();
}

/* Whether each flag's law-requirement is met by the flags as placed —
   nothing guessed, nothing peeked: only the flags and the geometry. Under
   the laws that speak of the whole board at once, the reading is global, as
   chosen: on connected every flag is red only while all the flags form one
   joined group, since two tidy pairs on a connected board are still a board
   the law refuses. Returns null where no law watches the flags. */
/* Flags planted around a cell. The numbers count every neighbour, and so
   does the crowding law, so both read the same ring. */
function flagsAround(i) {
  let k = 0;
  for (const j of nbOf(i)) if (state[j] === FLAG) k++;
  return k;
}

function flagVerdicts() {
  if (ruleset === 'none') return null;
  const flagged = [];
  for (let i = 0; i < n; i++) if (state[i] === FLAG) flagged.push(i);
  if (!flagged.length) return null;
  const isF = new Uint8Array(n);
  for (const f of flagged) isF[f] = 1;
  const ok = new Map();
  for (const f of flagged) ok.set(f, true);

  // the edge-joined pieces of the flags, reused by most of the laws
  const pieces = [];
  {
    const seen = new Uint8Array(n);
    for (const f of flagged) {
      if (seen[f]) continue;
      const piece = [f]; seen[f] = 1;
      for (let at = 0; at < piece.length; at++)
        for (const j of edgOf(piece[at]))
          if (isF[j] && !seen[j]) { seen[j] = 1; piece.push(j); }
      pieces.push(piece);
    }
  }

  const gSize = groupSize(), gCap = groupCap();
  if (gSize || gCap) {
    for (const piece of pieces) {
      const good = gSize ? piece.length === gSize : piece.length <= gCap;
      if (!good) for (const c of piece) ok.set(c, false);
    }
  }

  if (has('twogroups')) {
    /* Every connected company wears its own colour, six of them distinct and
       any beyond that grey — the pennants are a map of the grouping itself,
       which under a two-group law is the whole question.

       Which company gets which colour goes by age, not by size. Size was the
       obvious ranking and the wrong one: a company wore the colour its size
       had earned, so laying one mine beside the second-largest company and
       making it the largest swapped two colours at once, and the map redrew
       itself under the hand that was drawing it. A company is dated by its
       oldest flag instead, which laying more flags cannot alter. Two
       companies merging still gives up a colour, as it must — there is one
       company where there were two — and the survivor keeps the older of the
       two colours. */
    const laid = new Int32Array(n).fill(0x7fffffff);
    flagOrder.forEach((c, k) => { laid[c] = k; });
    const aged = pieces.slice().sort((x, y) => {
      const ax = Math.min(...x.map(c => laid[c]));
      const ay = Math.min(...y.map(c => laid[c]));
      return ax - ay;
    });
    aged.forEach((piece, at) => {
      for (const c of piece) ok.set(c, at < 6 ? at : -1);
    });
  }

  if (has('safeconn')) {
    /* The law binds the ground, so the flags answer together: red while the
       open cells all stand in one sea of unflagged ground, amber the moment
       the flags cut that sea in two. */
    const seen = new Uint8Array(n);
    let start = -1;
    for (let i = 0; i < n; i++) if (state[i] === OPEN) { start = i; break; }
    if (start >= 0) {
      const st = [start]; seen[start] = 1;
      while (st.length) {
        const c = st.pop();
        for (const j of edgOf(c))
          if (!seen[j] && state[j] !== FLAG) { seen[j] = 1; st.push(j); }
      }
      let cut = false;
      for (let i = 0; i < n; i++) if (state[i] === OPEN && !seen[i]) { cut = true; break; }
      if (cut) for (const f of flagged) ok.set(f, false);
    }
  }

  if (has('connected')) {
    /* The largest group leads and the rest read amber: a flag is red while
       it stands with the biggest connected company on the board, by the
       law's own adjacency — corners, for connected. Groups tied for largest
       all read red, neither having more claim than the other. */
    const adj = joinAdj();
    const seen = new Uint8Array(n);
    const groups = [];
    for (const f of flagged) {
      if (seen[f]) continue;
      const walk = [f]; seen[f] = 1;
      for (let at = 0; at < walk.length; at++)
        for (const j of adj(walk[at]))
          if (isF[j] && !seen[j]) { seen[j] = 1; walk.push(j); }
      groups.push(walk);
    }
    const most = Math.max(...groups.map(g => g.length));
    for (const g of groups)
      if (g.length < most) for (const f of g) ok.set(f, false);
  }

  if (has('outside')) {
    // a flag stands right while its piece reaches the rim
    for (const piece of pieces)
      if (!piece.some(c => !interior[c]))
        for (const c of piece) ok.set(c, false);
  }

  if (has('snake') || has('loop')) {
    /* One path, or one ring: a single piece, no flag with three neighbours,
       and for the path no ring closed, for the loop nothing but the ring.
       A lone segment mid-board reads amber until the whole shape is one. */
    const ring = has('loop');
    let edges = 0, worst = 0;
    for (const f of flagged) {
      let d = 0;
      for (const j of edgOf(f)) if (isF[j]) d++;
      if (d > worst) worst = d;
      edges += d;
    }
    edges /= 2;
    const one = pieces.length === 1;
    const shape = ring
      ? one && worst <= 2 && edges === flagged.length && flagged.length >= 3
      : one && worst <= 2 && edges === flagged.length - 1;
    if (!shape) for (const f of flagged) ok.set(f, false);
  }

  const dHi = degCap();
  if (dHi < 99) {
    for (const f of flagged) {
      let d = 0;
      for (const j of corOf(f)) if (isF[j]) d++;
      if (d > dHi) ok.set(f, false);
    }
  }

  if (boxLaw() && boxes.length && boxOf) {
    const inBox = new Array(boxes.length).fill(0);
    for (const f of flagged) if (boxOf[f] >= 0) inBox[boxOf[f]]++;
    for (const f of flagged) {
      const b = boxOf[f];
      if (b < 0) continue;
      if (boxMuted && boxMuted[b]) continue;      // a silent box asks nothing
      const [lo, hi] = boxRange(b);
      if (inBox[b] < lo || inBox[b] > hi) ok.set(f, false);
    }
  }

  return ok;
}

/* A ghost: the same marks at half presence. An imagined mine wears the
   flag's own shape faded; imagined safe ground wears a pale ring, the
   nearest thing to an open cell that is not one. */
function drawGhost(x, y, rad, kind) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  if (kind === 'mine') drawFlag(x, y, rad);
  else {
    ctx.strokeStyle = '#a7e3b4';
    ctx.lineWidth = Math.max(1.5, rad * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.6, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

// A cross, for a flag that turned out to be planted on nothing.
function drawCross(x, y, rad) {
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = Math.max(1, rad * 0.22);
  ctx.beginPath();
  ctx.moveTo(x - rad * 0.8, y - rad * 0.8); ctx.lineTo(x + rad * 0.8, y + rad * 0.8);
  ctx.moveTo(x + rad * 0.8, y - rad * 0.8); ctx.lineTo(x - rad * 0.8, y + rad * 0.8);
  ctx.stroke();
}

function draw() {
  if (!n || cellPath.length !== n) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  /* A board mid-deal is a half-truth — mines laid, clues not yet pared back —
     and showing it would give away what the paring is about to take. So the
     canvas stays empty until the deal is over, and the line under it says
     how far along that is. */
  if (dealNote) return;

  const flashing = flashCell >= 0 && performance.now() < flashUntil;

  // the tiling first, one cell at a time, in board units
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
  ctx.lineJoin = 'round';
  ctx.lineWidth = cellPitch * 0.06;
  for (let i = 0; i < n; i++) {
    const open = state[i] === OPEN;
    if (flashing && i === flashCell) ctx.fillStyle = BOOM;
    else if (open && mine[i]) ctx.fillStyle = i === exploded ? BOOM : MINED;
    else if (open) ctx.fillStyle = DUG;
    else if (i === hover && !over) ctx.fillStyle = COVER_HI;
    else ctx.fillStyle = COVERS[0];
    ctx.fill(cellPath[i]);
    ctx.strokeStyle = open ? LINE : RIM;
    ctx.stroke(cellPath[i]);
  }

  /* The neighbourhood under the pointer, washed over lightly enough to read
     the cells through it, with the cell itself ringed. Only a number is worth
     asking this of: a covered cell counts nothing yet, a blank has already
     opened everything it touches, and a muted one is keeping its number to
     itself. */
  /* Laid under the cells' own numbers so the digit still reads on top. Only
     ever the player's own miscount, never anything about the board. */
  if (quotaOn && !over) {
    ctx.save();
    for (let i = 0; i < n; i++) {
      if (state[i] !== OPEN || muted[i] || !count[i]) continue;
      if (flagsAround(i) <= count[i]) continue;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = OVER;
      ctx.fill(cellPath[i]);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = OVER;
      ctx.lineWidth = cellPitch * 0.09;
      ctx.stroke(cellPath[i]);
    }
    ctx.restore();
    ctx.lineWidth = cellPitch * 0.06;
  }

  if (adjOn && hover >= 0 && !over &&
      state[hover] === OPEN && !muted[hover] && count[hover]) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ADJ;
    for (const j of nbOf(hover)) ctx.fill(cellPath[j]);
    ctx.restore();
    ctx.strokeStyle = ADJ;
    ctx.lineWidth = cellPitch * 0.08;
    ctx.stroke(cellPath[hover]);
    ctx.lineWidth = cellPitch * 0.06;
  }

  /* Whatever the last hint pointed at, ringed — but ringed on the inside of
     the cell rather than along its edge. The line round a box runs along cell
     edges too, and a ring drawn there would bury it just when the boxes are
     most worth seeing. Clipping to the cell and stroking at twice the width
     leaves only the inner half, which keeps the edge itself clear. */
  if (hintClues.length) {
    ctx.strokeStyle = HINT;
    ctx.lineWidth = cellPitch * 0.24;
    for (const i of hintClues) {
      ctx.save();
      ctx.clip(cellPath[i]);
      ctx.stroke(cellPath[i]);
      ctx.restore();
    }
    ctx.lineWidth = cellPitch * 0.06;
  }

  // and the boxes over the top of everything, since they are the ground plan
  /* The box under the pointer is lifted out of the lattice: its rim drawn
     brighter, and — where the boxes carry numbers — its clue brightened to
     match, so a cell can be traced to the clue that speaks for it. The
     lattice alone cannot say which figure belongs to which box at a glance,
     the corners being shared ground. A box keeping its number to itself is
     left unlit, since there would be nothing at the end of the pointing. */
  const hoverBox = !over && hover >= 0 && boxOf && boxLaw() &&
                   !(boxMuted && boxMuted[boxOf[hover]]) ? boxOf[hover] : -1;
  if (boxLaw()) {
    ctx.strokeStyle = BOXLINE;
    ctx.lineWidth = cellPitch * 0.11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [u, v] of boxSegments()) { ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); }
    ctx.stroke();
    if (hoverBox >= 0 && boxSeg && boxSeg[hoverBox]) {
      ctx.strokeStyle = '#f2fbf5';
      ctx.lineWidth = cellPitch * 0.15;
      ctx.beginPath();
      for (const [u, v] of boxSeg[hoverBox]) { ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); }
      ctx.stroke();
    }
    ctx.lineWidth = cellPitch * 0.06;
  }

  // then the glyphs, in screen pixels, so the type stays crisp
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const verdicts = hueOn ? flagVerdicts() : null;
  for (let i = 0; i < n; i++) {
    if (state[i] === COVERED) {
      if (ghost[i]) {
        const x = mids[i][0] * view.s + view.ox, y = mids[i][1] * view.s + view.oy;
        drawGhost(x, y, inr[i] * view.s * 0.55, ghost[i] === 1 ? 'mine' : 'safe');
      }
      continue;
    }
    const x = mids[i][0] * view.s + view.ox, y = mids[i][1] * view.s + view.oy;
    const rad = inr[i] * view.s * 0.55;
    if (state[i] === FLAG) {
      drawFlag(x, y, rad, verdicts ? verdicts.get(i) : undefined);
      /* Under the crowding law a flag carries its own company as a subscript,
         since what the law forbids is a mine keeping too much of it: green
         while there is room, amber at the cap, red past it. It rides with the
         flag colours, being the same kind of thing — the board answering for
         the law as you plant. */
      if (hueOn && degCap() < 99 && !over) {
        const k = flagsAround(i);
        /* Big enough to read at a glance and haloed in the board's own line
           colour, since it sits over the flag, the pole and the cell by turns
           and was illegible against all three at subscript size. */
        const size = rad * 1.25;
        ctx.font = '700 ' + size.toFixed(1) + 'px "Segoe UI", sans-serif';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, size * 0.42);
        ctx.strokeStyle = '#0d1a0f';
        ctx.fillStyle = CROWD[k < degCap() ? 0 : k === degCap() ? 1 : 2];
        ctx.textAlign = 'left';
        ctx.strokeText(k, x + rad * 0.55, y + rad * 0.7);
        ctx.fillText(k, x + rad * 0.55, y + rad * 0.7);
        ctx.textAlign = 'center';
        ctx.lineWidth = cellPitch * 0.06;
      }
      if (over && !mine[i]) drawCross(x, y, rad * 1.3);
    } else if (mine[i]) {
      drawMine(x, y, rad * 0.62);
    } else if (muted[i]) {
      ctx.font = '600 ' + (inr[i] * view.s * 1.15).toFixed(1) + 'px "Segoe UI", sans-serif';
      ctx.fillStyle = MUTE;
      ctx.fillText('?', x, y);
    } else if (count[i]) {
      ctx.font = '600 ' + (inr[i] * view.s * 1.15).toFixed(1) + 'px "Segoe UI", sans-serif';
      /* A number with all its flags planted has nothing left to say and steps
         back; one with too many has been given something it never asked for. */
      const planted = quotaOn && !over ? flagsAround(i) : -1;
      ctx.fillStyle = planted < 0 || planted < count[i]
        ? NUMS[Math.min(count[i], NUMS.length - 1)]
        : planted > count[i] ? OVERINK : SPENT;
      ctx.fillText(count[i], x, y);
    }
  }

  /* A box that carries its own number wears it high up and quietly, in a
     lighter weight than a cell's number and a duller colour, with a dark halo
     so that it stays legible over whatever it happens to lie on. It is meant
     to be found when looked for, not to compete with the clues. */
  if ((boxLaw() === 'exact' || boxLaw() === 'irregular') &&
      boxShown && boxTop.length === boxes.length) {
    const size = cellPitch * view.s * 0.34;
    ctx.font = '600 ' + size.toFixed(1) + 'px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';            // hung below the corner, inside the box
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.34);
    ctx.strokeStyle = LINE;
    ctx.fillStyle = BOXNUM;
    for (let b = 0; b < boxes.length; b++) {
      /* A box keeping its number to itself simply goes bare. A cell has to
         say something, since a blank cell and a nought look alike; a box
         writes its nought down, so nothing written can only mean nothing
         known. */
      if (boxMuted && boxMuted[b]) continue;
      const x = boxTop[b][0] * view.s + view.ox, y = boxTop[b][1] * view.s + view.oy;
      const say = (boxRel[b] || '') + boxShown[b];
      ctx.fillStyle = b === hoverBox ? '#f2fbf5' : BOXNUM;
      ctx.strokeText(say, x, y);
      ctx.fillText(say, x, y);
    }
    ctx.textBaseline = 'middle';
  }

  // the hint's supposed world, in the same ghost marks the player sketches with
  for (const g of hintGhosts)
    if (state[g.cell] === COVERED)
      drawGhost(mids[g.cell][0] * view.s + view.ox,
                mids[g.cell][1] * view.s + view.oy,
                inr[g.cell] * view.s * 0.55, g.kind);

  // the forgiven mine, shown on its covered cell for as long as the flash lasts
  if (flashing)
    drawMine(mids[flashCell][0] * view.s + view.ox,
             mids[flashCell][1] * view.s + view.oy,
             inr[flashCell] * view.s * 0.34);
}

/* =====================================================================
   8. POINTING AT A CELL
   ===================================================================== */

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cellAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) * canvas.width / rect.width - view.ox) / view.s;
  const y = ((clientY - rect.top) * canvas.height / rect.height - view.oy) / view.s;
  const gx = Math.floor((x - bx0) / bucketSize), gy = Math.floor((y - by0) / bucketSize);
  if (gx < 0 || gx >= bw || gy < 0 || gy >= bh) return -1;
  for (const i of buckets[gy * bw + gx]) if (pointInPoly(poly[i], x, y)) return i;
  return -1;
}

/* =====================================================================
   9. CONTROLS
   ===================================================================== */

const el = id => document.getElementById(id);

function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

function paintStatus() {
  el('statMines').textContent = mines - flags;
  {
    let waiting = 0;
    for (let i = 0; i < n; i++) if (state[i] === COVERED) waiting++;
    el('statCells').textContent = n ? waiting : '\u2014';
  }
  const ms = !startTime ? 0 : (over ? endTime : performance.now()) - startTime;
  el('statTime').textContent = fmtTime(ms);
  const key = bestKey();
  el('statBest').textContent = key && bests[key] ? fmtTime(bests[key]) : '—';
  /* What the run has cost so far, in plain sight, so the player knows before
     the end whether the clock is still worth anything. */
  const tallyWords = () => {
    const bits = [];
    if (mistakes) bits.push(mistakes + (mistakes === 1 ? ' mine touched' : ' mines touched'));
    if (hintsUsed) bits.push(hintsUsed + (hintsUsed === 1 ? ' hint' : ' hints'));
    return bits.join(' · ');
  };
  /* The clear button appears exactly when it means something: every mine
     accounted for by the counter, covered ground still waiting. It opens
     that ground as if each cell were clicked — a wrong flag's mine flashes
     and counts, exactly as it would under the finger. */
  const btnC = el('btnClear');
  if (btnC) {
    let waiting = 0;
    for (let i = 0; i < n; i++) if (state[i] === COVERED) waiting++;
    btnC.style.display = n > 0 && !over && mines - flags === 0 && waiting > 0 ? '' : 'none';
  }

  // and the ghost-sweeper, whenever there are ghosts to sweep
  const btnG = el('btnGhosts');
  if (btnG) {
    let haunting = 0;
    for (let i = 0; i < n; i++) if (ghost[i]) haunting++;
    btnG.style.display = n > 0 && !over && haunting > 0 ? '' : 'none';
  }

  const run = el('noteRun');
  if (run) run.textContent = !n ? ''
    : (mistakes || hintsUsed) ? tallyWords() + ' — this board sets no best time.'
    : historyLost ? 'Picked up from an earlier save, so no best time from it.'
    : 'Clean so far — the clock counts.';

  const v = el('verdict');
  v.className = 'verdict' + (over ? (won ? ' won' : ' lost') : '');
  // a deal still going on has the floor: there is no game yet to report on
  if (dealNote) { v.textContent = dealNote; return; }
  // with no clock there is no time to report: subtracting a startTime of nought
  // would quote how long the page had been open
  v.textContent = over
    ? (won ? 'Swept' + (startTime ? ' — ' + fmtTime(endTime - startTime) : '') +
             (newBest ? ' · a new best!'
              : (mistakes || hintsUsed) ? ' · ' + tallyWords() + ', not recorded'
              : historyLost ? ' · resumed, not recorded' : '')
           : 'Given up — the board as it stood.')
    : '';
}

// The clock is the only thing that moves on its own, so the loop only redraws
// the panel; the board is redrawn when something is actually done to it.
(function tick() {
  requestAnimationFrame(tick);
  if (startTime && !over) paintStatus();
  // a flash has to be painted while it lasts, and painted out once it is over
  if (flashCell >= 0) {
    if (performance.now() >= flashUntil) flashCell = -1;
    draw();
  }
})();

/* A running clock is only saved correctly if it is saved on the way out, so
   the game is written down again whenever the page is hidden or closed. */
addEventListener('pagehide', saveBoard);
addEventListener('visibilitychange', () => { if (document.hidden) saveBoard(); });

canvas.addEventListener('contextmenu', e => e.preventDefault());

// A cell is uncovered by clicking it, or by clicking an open number that has
// its flags in place; the right button plants a flag instead.
function dig(i, chording) {
  if (i < 0) return;
  clearHint();
  startClock();
  if (chording || state[i] === OPEN) chord(i); else reveal(i);
  paintStatus();
  saveBoard();
  draw();
}

// Touch is handled below, on its own terms, so it is passed over here.
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  if (e.shiftKey && (e.button === 0 || e.button === 2)) {
    clearHint(); startClock();
    ghostMark(i, e.button === 2 ? 1 : 2);
    paintStatus(); saveBoard(); draw();
  }
  else if (e.button === 2) { clearHint(); startClock(); flag(i); paintStatus(); saveBoard(); draw(); }
  else dig(i, e.button === 1);
});

canvas.addEventListener('pointermove', e => {
  const i = cellAt(e.clientX, e.clientY);
  if (i === hover) return;
  hover = i;
  draw();
});
canvas.addEventListener('pointerleave', () => { if (hover >= 0) { hover = -1; draw(); } });

/* A touchscreen has no right button, so a long press plants the flag instead.
   That means a tap cannot be acted on when it lands — it might yet become a
   press — so the digging waits for the finger to lift, and a finger that
   wanders is taken to be the page being scrolled and does nothing at all. */
let holdTimer = 0, holdCell = -1;
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  holdCell = cellAt(t.clientX, t.clientY);
  if (holdCell < 0) return;
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    clearHint();
    startClock();
    flag(holdCell);
    holdCell = -1;
    paintStatus();
    saveBoard();
    draw();
  }, 450);
}, { passive: true });
canvas.addEventListener('touchend', () => {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; dig(holdCell, false); }
  holdCell = -1;
});
canvas.addEventListener('touchmove', () => {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = 0; holdCell = -1;
}, { passive: true });

// --- the size controls ---
const rngAcross = el('rngAcross'), rngDown = el('rngDown'), rngMines = el('rngMines');

// Before a board is built the cell count can only be guessed at, and after one
// is built it is simply known.
// Once a board is built the label reports the mines actually laid, which
// difficulty and board size may both have moved from the slider's ask.
function paintSizeLabels(actual, placed) {
  const total = actual || Math.round(+rngAcross.value * +rngDown.value);
  rngMines.max = Math.max(1, total - 9);
  if (+rngMines.value > +rngMines.max) rngMines.value = rngMines.max;
  const shown = placed || +rngMines.value;
  el('valAcross').textContent = rngAcross.value;
  el('valDown').textContent = rngDown.value;
  el('valMines').textContent = shown + ' of ' + total +
    ' (' + Math.round(shown / total * 100) + '%)';
}

/* What the law in force asks of the player. The boxed laws cannot say until
   there is a board, since how many mines a box may hold follows how many
   cells are in one. */
function paintRuleNote() {
  let text = RULENOTES[ruleset] || '';
  const law = boxLaw();
  if (law && boxes.length) {
    const { per, lo, hi } = boxBounds();
    if (law === 'irregular')
      return void (el('noteRule').textContent =
        'The boxes drawn are of no fixed shape or size, and each says how many ' +
        'mines it holds \u2014 exactly, or at least, or at most. Boards are built ' +
        'so the rule is needed to solve them.');
    text = 'The tiling repeats in the boxes drawn, ' + per + ' cells to a box, and ' +
      (law === 'exact'
        ? 'each carries the number of mines it holds.'
        : 'every box holds ' +
          (law === 'floor' ? 'at least ' + lo + (lo === 1 ? ' mine.' : ' mines.')
           : law === 'ceiling' ? 'at most ' + hi + ' mines.'
           : 'between ' + lo + ' and ' + hi + ' mines.'));
    if (has('connected')) text += ' The mines also form a single group, touching by edge or corner.';
    if (has('snake')) text += ' They also form one edge-joined path that never runs alongside itself.';
  }
  el('noteRule').textContent = text &&
    text + ' Boards are built so the rule is needed to solve them.';
}

/* The deal is announced before it is begun, and the announcement given a
   breath to reach the screen — otherwise the whole thing, notice and all,
   lands in one go after the wait rather than before it.

   Two deals must never run at once, since the second would build its geometry
   out from under the first. But a setting changed mid-deal should not simply
   be dropped either, so a call arriving during a deal is remembered and the
   deal is done again after, off whatever the controls say by then. */
let dealBusy = false, dealAgain = false;

/* Boards made ahead of time.

   A board hides as many of its numbers as it can afford to, and finding out
   what it can afford means asking the solver, over and over, whether the
   board still comes out. Those questions cost between four and a hundred and
   thirty milliseconds each depending on the law, so in the couple of seconds
   a player will wait the pass got through a handful of them and stopped —
   and how much a board kept back came down to how fast the machine was.

   So the next board is made in a worker while this one is still being played,
   where there is no one waiting and the hiding pass can spend its whole
   budget. By the time New game is pressed it is usually already there.
   Everything degrades quietly: no worker, a board whose settings no longer
   match, or one that fails to come back, and the deal simply happens the old
   way in front of the player. */
const BUILD = (() => {
  const s = [...document.querySelectorAll('script[src]')]
    .find(x => /ui.js/.test(x.getAttribute('src') || ''));
  const m = s && ((s.getAttribute('src') || '').split('?v=')[1] || '');
  return m || '';
})();

let boardWorker = null, readyBoard = null, wantKey = '', waiting = 0, reqNo = 0;

/* Everything that decides which board arrives. Strict, the neighbour wash and
   the flag colours are not in it: they change how a board is played, not which
   one is dealt, so a board made before one was toggled is still the right
   board and the toggles are put back over the top of it. */
const boardKeyNow = () =>
  [tiling.id, ruleset, difficulty, sizeName, rngAcross.value, rngDown.value,
   rngMines.value, weakenOn ? 'w' : ''].join('|');

function startPrefetch() {
  if (typeof Worker === 'undefined') return;
  const key = boardKeyNow();
  if (readyBoard && readyBoard.key === key) return;   // one is already standing by
  if (waiting && wantKey === key) return;             // one is already on its way
  if (!boardWorker) {
    try { boardWorker = new Worker('prefetch.js' + (BUILD ? '?v=' + BUILD : '')); }
    catch (e) { boardWorker = null; return; }         // no worker here, deal live
    boardWorker.onmessage = e => {
      const m = e.data || {};
      waiting = 0;
      if (m.ok && m.key === wantKey && m.save) readyBoard = { key: m.key, save: m.save };
    };
    boardWorker.onerror = () => { boardWorker = null; waiting = 0; readyBoard = null; };
  }
  wantKey = key;
  waiting = ++reqNo;
  boardWorker.postMessage({
    id: waiting, key, version: BUILD, tiling: tiling.id, ruleset, difficulty,
    sizeName, weakenOn, strict, adjOn, hueOn,
    across: +rngAcross.value, down: +rngDown.value, ask: +rngMines.value
  });
}

/* A board that was waiting, put on the table. The player's own toggles are
   held over the restore, since the saved board carries the values they had
   when it was made rather than the ones in force now. */
function useReadyBoard(key) {
  if (!readyBoard || readyBoard.key !== key) return false;
  const board = readyBoard;
  readyBoard = null;
  const keptStrict = strict, keptAdj = adjOn, keptHue = hueOn;
  if (!restoreBoard(board.save)) return false;
  strict = keptStrict; adjOn = keptAdj; hueOn = keptHue;
  historyLost = false;            // freshly dealt, whatever the save said
  return true;
}

async function startFromControls() {
  if (dealBusy) { dealAgain = true; return; }
  dealBusy = true;
  try {
    do {
      dealAgain = false;
      clearHint();
      if (useReadyBoard(boardKeyNow())) continue;
      if (DIFF[difficulty].slow) {
        dealNote = 'Dealing…';
        paintStatus();
        draw();
        await breath();
      }
      await newGame(+rngAcross.value, +rngDown.value, +rngMines.value);
    } while (dealAgain);
    paintToggles();
    paintSizeLabels(n, mines);
    paintRuleNote();
    saveBoard();
    draw();
    startPrefetch();               // and the one after this, while it is played
  } finally { dealBusy = false; dealNote = ''; paintStatus(); }
}

for (const r of [rngAcross, rngDown, rngMines]) r.oninput = () => paintSizeLabels();
// a board built off the sliders is nobody's standard, so it keeps no record
rngAcross.onchange = rngDown.onchange = rngMines.onchange =
  () => { sizeName = ''; startFromControls(); };

for (const b of document.querySelectorAll('[data-preset]'))
  b.onclick = () => {
    const [a, d, m] = b.dataset.preset.split('|');
    rngAcross.value = a; rngDown.value = d;
    paintSizeLabels();
    rngMines.value = m;
    paintSizeLabels();
    sizeName = b.textContent;
    startFromControls();
  };

el('selDiff').onchange = () => {
  difficulty = el('selDiff').value;
  startFromControls();
};

for (const b of document.querySelectorAll('[data-strict]'))
  b.onclick = () => {
    strict = !!b.dataset.strict;
    for (const x of document.querySelectorAll('[data-strict]')) x.classList.toggle('on', x === b);
    paintStatus();
    saveBoard();
  };

for (const b of document.querySelectorAll('[data-quota]'))
  b.onclick = () => {
    quotaOn = !!b.dataset.quota;
    for (const x of document.querySelectorAll('[data-quota]')) x.classList.toggle('on', x === b);
    saveBoard();
    draw();
  };

for (const b of document.querySelectorAll('[data-hue]'))
  b.onclick = () => {
    hueOn = !!b.dataset.hue;
    for (const x of document.querySelectorAll('[data-hue]')) x.classList.toggle('on', x === b);
    saveBoard();
    draw();
  };

for (const b of document.querySelectorAll('[data-adj]'))
  b.onclick = () => {
    adjOn = !!b.dataset.adj;
    for (const x of document.querySelectorAll('[data-adj]')) x.classList.toggle('on', x === b);
    saveBoard();
    draw();
  };

/* Bounds change how a board is dealt, so a new one is dealt when it changes */
for (const b of document.querySelectorAll('[data-weaken]'))
  b.onclick = () => {
    weakenOn = !!b.dataset.weaken;
    for (const x of document.querySelectorAll('[data-weaken]')) x.classList.toggle('on', x === b);
    startFromControls();
  };

el('selRule').onchange = () => {
  ruleset = el('selRule').value;
  startFromControls();            // which paints the note, once there are boxes to count
};

const selTiling = el('selTiling');
selTiling.innerHTML = TILINGS.map((t, i) => '<option value="' + i + '">' + t.name + '</option>').join('');
selTiling.onchange = () => { tiling = TILINGS[+selTiling.value]; startFromControls(); };

/* The dice. Random never lands on what is already chosen — a pick that
   changes nothing reads as a broken button — and each roll deals afresh
   through the same road the selects take. */
el('btnRandTil').onclick = () => {
  let at = Math.floor(Math.random() * (TILINGS.length - 1));
  if (at >= +selTiling.value) at++;
  selTiling.value = at;
  selTiling.onchange();
};
el('btnRandRule').onclick = () => {
  const sel = el('selRule');
  const opts = [...sel.options].map(o => o.value).filter(v => v !== sel.value);
  sel.value = opts[Math.floor(Math.random() * opts.length)];
  sel.onchange();
};

el('btnNew').onclick = startFromControls;
el('btnHint').onclick = askHint;
el('btnCheck').onclick = checkFlags;
el('btnGhosts').onclick = () => {
  for (let i = 0; i < n; i++) ghost[i] = 0;
  paintStatus();
  saveBoard();
  draw();
};
el('btnClear').onclick = () => {
  if (over || !n || mines - flags !== 0) return;
  clearHint();
  startClock();
  for (let i = 0; i < n; i++) if (state[i] === COVERED) reveal(i);
  paintStatus();
  saveBoard();
  draw();
};

/* Giving up asks twice, as the hint does. One press is easy to make by
   accident and there is no taking it back — the board is spent. */
let revealArmed = 0;
const disarmReveal = () => {
  revealArmed = 0;
  el('btnReveal').textContent = 'Reveal board';
  el('btnReveal').classList.remove('warn');
};
el('btnReveal').onclick = () => {
  if (over || !n) return;
  if (performance.now() > revealArmed) {
    revealArmed = performance.now() + 4000;
    el('btnReveal').textContent = 'Really? Press again';
    el('btnReveal').classList.add('warn');
    setTimeout(() => { if (performance.now() > revealArmed - 50) disarmReveal(); }, 4100);
    return;
  }
  disarmReveal();
  giveUp();
  saveBoard();
  paintStatus();
  draw();
};

/* The canvas follows its panel rather than the window, since the panel also
   changes width when the sidebar drops below it. Only a width change is acted
   on: laying out sets the canvas height, which would otherwise call us back. */
let lastPanelWidth = 0;
new ResizeObserver(() => {
  const w = canvas.parentElement.clientWidth;
  if (w === lastPanelWidth) return;
  lastPanelWidth = w;
  layout();
}).observe(canvas.parentElement);

/* =====================================================================
   10. SELF-CHECK

   Each tiling is built from its parent rather than typed in, so what
   wants checking is that the result really is a tiling of pentagons: no
   tile with any number of sides but five, every corner well inside the
   patch closing to a full turn — which is exactly the statement that
   there is no gap and no overlap — and neighbourliness that both cells
   agree on. Reported to the console, and only there.
   ===================================================================== */

function verify() {
  const keep = tiling;
  for (const t of TILINGS) {
    buildBoard(t, 12, 12);

    const sides = [...new Set(poly.map(p => p.length))];

    /* Every corner of a fully surrounded cell must close to a full turn. That
       is what says the pentagons meet with no gap and no overlap, and it is
       checked here against the geometry rather than taken from the parent. */
    const topo = topology(poly);
    let corners = 0, gaps = 0;
    for (const [vid, fl] of topo.vertFaces) {
      const around = [...new Set(fl)];
      if (!around.some(fi => interior[fi])) continue;
      let sum = 0;
      for (const fi of around) sum += angleAt(topo.faces[fi], vid);
      if (Math.abs(sum - TAU) > 1e-6) gaps++; else corners++;
    }

    // if I call you a neighbour you must call me one, by edge and by corner
    let oneWay = 0;
    for (const which of [true, false]) {
      useCorners(which);
      for (let i = 0; i < n; i++)
        for (const j of nbOf(i)) if (!nbOf(j).includes(i)) oneWay++;
    }
    useCorners(true);

    // every edge is shared by two cells, or is on the rim and shared by one
    let oddEdges = 0;
    for (const fl of topo.edgeMap.values()) if (fl.length > 2) oddEdges++;

    // and the pentagons present must be the ones the tiling is named after
    const kinds = new Map();
    const degs = [];
    for (let i = 0; i < n; i++) if (interior[i]) {
      const k = pentagonKind(poly[i]);
      kinds.set(k, (kinds.get(k) || 0) + 1);
      degs.push(nbOf(i).length);
    }
    /* The ratio is only roughly the tiling's on a patch this small — a board
       centred on one feature of it samples the two pentagons unevenly, and it
       settles onto the advertised ratio as the board grows. */
    const mix = [...kinds.entries()].sort((a, b) => b[1] - a[1]);
    const ratio = mix.length === 2 ? ` (~${(mix[0][1] / mix[1][1]).toFixed(2)}:1)` : '';
    console.log(`${t.name}: ${n} cells, sides {${sides}}, ${shapeCount} shape(s), ` +
      `${corners} corners closed / ${gaps} not, ${oneWay} one-way, ${oddEdges} bad edges, ` +
      `interior degrees ${Math.min(...degs)}-${Math.max(...degs)}, ` +
      `pentagons ${mix.map(([k, c]) => k + ' x' + c).join(' + ')}${ratio}`);
  }
  tiling = keep;
}

/* =====================================================================
   11. GO
   ===================================================================== */

// The check runs first, since it builds scratch boards of its own; starting the
// game afterwards is what puts a real one back.
paintSizeLabels();
verify();

/* Whatever was last being played, if it can still be rebuilt. Failing that —
   nothing saved, or a tiling that has changed shape since — a new board. */
if (restoreBoard()) {
  paintToggles();
  paintSizeLabels(n, mines);
  paintRuleNote();
  paintStatus();
  layout();
  draw();
  startPrefetch();
} else {
  startFromControls();
}
