"use strict";

/* Pentagonal Minesweeper — boards made ahead of time, off the main thread.

   A board that hides as many of its numbers as it can afford to takes far
   longer to make than a player will sit and wait for: the hiding pass asks
   the solver whether the board still comes out for every group of clues it
   tries, and one of those questions costs anywhere from four to a hundred
   and thirty milliseconds depending on the law. Given a couple of seconds it
   gets through a handful of them and stops, so how much a board kept back
   came down to how fast the machine happened to be.

   So the next board is made here instead, while the last one is still being
   played, with the clock off and the whole budget to spend. The game's own
   scripts are loaded whole into a scope of their own with the browser bits
   stubbed out — the same trick the test harness uses to run the game outside
   a page — so this is the very same generator and solver the player's hints
   will use, not a second implementation that might disagree with it.

   What comes back is the board written in the game's own save format, which
   already carries everything that cannot be worked out again from the
   settings: where the mines are, which numbers are hidden, what the opening
   uncovered, and the irregular box cut where there is one. */

let game = null;                 // the loaded game, once it is loaded
let loading = null;

const FILES = ['tiling.js', 'play.js', 'solver.js', 'builder.js', 'ui.js'];

async function load(version) {
  const parts = [];
  for (const f of FILES) {
    const r = await fetch(f + (version ? '?v=' + version : ''));
    if (!r.ok) throw new Error('could not fetch ' + f);
    let text = await r.text();
    /* The page's own bootstrap is left behind. The last thing ui.js does when
       it loads is check its geometry and deal a board, and that deal would run
       against the same arrays as the one asked for here — two deals in one
       scope, each overwriting the other's board. Cutting the tail off leaves
       every function defined and nothing running. */
    if (f === 'ui.js') {
      const cut = text.indexOf('// The check runs first');
      if (cut > 0) text = text.slice(0, cut);
    }
    parts.push(text);
  }

  /* Just enough of a page for the scripts to load. Nothing here draws or
     stores anything: the canvas answers every call with a shrug, and the
     storage is a map that lives and dies with this worker. */
  const shrug = new Proxy({}, {
    get: (t, k) => (k === 'canvas' ? stub() : (t[k] !== undefined ? t[k] : () => {})),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  function stub() {
    const e = {
      textContent: '', innerHTML: '', value: '10', max: '100',
      width: 800, height: 600, clientWidth: 800,
      style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      onclick: null, oninput: null, onchange: null,
      addEventListener() {}, getContext: () => shrug,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    e.parentElement = e;
    return e;
  }
  const els = new Map();
  const cell = new Map();
  const sandbox = {
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, stub()); return els.get(id); },
      querySelectorAll: () => []
    },
    window: { devicePixelRatio: 1 },
    localStorage: {
      getItem: k => (cell.has(k) ? cell.get(k) : null),
      setItem: (k, v) => cell.set(k, v),
      removeItem: k => cell.delete(k)
    },
    requestAnimationFrame: () => 0,
    addEventListener() {},
    ResizeObserver: class { observe() {} },
    Path2D: class { moveTo() {} lineTo() {} closePath() {} },
    console,
    /* Absent on purpose. The ui.js loaded below asks for a worker of its own
       to make the board after next, and a worker that makes workers makes
       them without end. */
    Worker: undefined
  };

  /* The handful of things this worker needs to reach. Taken by getter so the
     values are the game's own and not a copy made at load time. */
  const expose = `
  ;self.__G = {
    get TILINGS() { return TILINGS; },
    set tiling(v) { tiling = v; },
    set ruleset(v) { ruleset = v; },
    set difficulty(v) { difficulty = v; },
    set sizeName(v) { sizeName = v; },
    set weakenOn(v) { weakenOn = v; },
    set strict(v) { strict = v; },
    set adjOn(v) { adjOn = v; },
    set hueOn(v) { hueOn = v; },
    set dealPatient(v) { dealPatient = v; },
    setSliders(a, d, m) {
      document.getElementById('rngAcross').value = a;
      document.getElementById('rngDown').value = d;
      document.getElementById('rngMines').value = m;
    },
    newGame, saveBoard,
    get dealt() { return dealt; },
    get n() { return n; },
    get mines() { return mines; },
    get saved() { return localStorage.getItem('pentagonal-minesweeper-board'); }
  };`;

  const keys = Object.keys(sandbox);
  new Function(...keys, parts.join('\n') + expose)(...keys.map(k => sandbox[k]));
  return self.__G;
}

async function make(req) {
  if (!game) {
    if (!loading) loading = load(req.version);
    game = await loading;
  }
  const t = game.TILINGS.find(x => x.id === req.tiling);
  if (!t) throw new Error('unknown tiling ' + req.tiling);
  game.tiling = t;
  game.ruleset = req.ruleset;
  game.difficulty = req.difficulty;
  game.sizeName = req.sizeName;
  game.weakenOn = !!req.weakenOn;
  game.strict = !!req.strict;
  game.adjOn = !!req.adjOn;
  game.hueOn = req.hueOn === undefined ? true : !!req.hueOn;
  game.setSliders(req.across, req.down, req.ask);
  game.dealPatient = true;              // nobody is waiting on this one
  await game.newGame(req.across, req.down, req.ask);
  game.saveBoard();
  return { save: game.saved, dealt: game.dealt.slice() };
}

/* Requests are answered one at a time, and only the newest is answered at all.

   Every deal runs against the one set of board arrays in the scope loaded
   above, so two of them at once would overwrite each other halfway through —
   which is exactly what the page's own bootstrap did before its tail was cut
   off, and it handed back a board of ninety mines carrying thirty. Changing
   the ruleset twice quickly would have done the same, so the deals are
   chained. A request overtaken while it waited is dropped rather than dealt:
   nobody wants that board any more, and it would only hold up the one they
   do want. */
let chain = Promise.resolve();
let newest = 0;

self.onmessage = e => {
  const req = e.data;
  newest = req.id;
  chain = chain.then(async () => {
    if (req.id !== newest) return;          // overtaken while it queued
    try {
      const board = await make(req);
      self.postMessage({ id: req.id, ok: true, key: req.key, ...board });
    } catch (err) {
      self.postMessage({ id: req.id, ok: false, key: req.key,
                         why: String(err && err.message || err) });
    }
  });
};
