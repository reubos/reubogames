"use strict";

/* Pentagonal Minesweeper — the game in play: state, the laws named, difficulty, saving, dealing in.
   One of five scripts sharing a single scope; the order they are
   loaded in is the order the one file used to run in. */

/* =====================================================================
   5. THE GAME
   ===================================================================== */

const COVERED = 0, OPEN = 1, FLAG = 2;

let mine, state, count;
/* A muted cell keeps its number to itself. Uncovering one still proves it safe,
   and still tells its neighbours it is no mine, but the count never shows — so
   it offers no constraint of its own, and a muted blank cannot cascade, since
   the cascade would give the blank away. */
let muted = new Uint8Array(0);
let muteOn = false;

/* Ghost marks: the player's own supposed world, sketched onto covered
   cells. A ghost flag imagines a mine, a ghost ring imagines safe ground,
   and neither is real — the counters ignore them, the solver never sees
   them, a chord does not count them, and opening a cell wipes its ghost.
   The right button cycles flag, ghost flag, ghost ring, bare. */
let ghost = new Uint8Array(0);      // 0 none, 1 imagined mine, 2 imagined safe

function cycleMark(i) {
  if (over || state[i] === OPEN) return;
  if (state[i] === FLAG) { state[i] = COVERED; flags--; ghost[i] = 1; }
  else if (ghost[i] === 1) ghost[i] = 2;
  else if (ghost[i] === 2) ghost[i] = 0;
  else { state[i] = FLAG; flags++; }
}

/* Whether the dealing may loosen a box's clue — "at least", "at most" — in
   place of the exact count. What it buys is the ground the boxes give away:
   a box reading nought hands over its every cell before a click is made, and
   weakened it hands over none of them. Off unless asked for. */
let weakenOn = false;
/* Under the strict law a cell may only be uncovered when nothing on the board
   allows it to hold a mine. Click one that merely happens to be empty and it
   turns out to hold one after all — so a lucky guess is no longer lucky. */
let strict = false;
// the opening is dealt, not clicked, so the strict law has nothing to say to it
let dealing = false;
let dealt = [];                // the opening as dealt, for the hint of very last resort

/* Which cells a number counts is plain on a square grid and anything but on
   these, so the pointer can be made to light them. It changes nothing about
   the board, only what is drawn. */
let adjOn = false;

/* A mine is forgiven: it shows itself for a moment and is then covered over
   again, leaving the board as it was and the game running. This was once a
   setting and is now simply how the game is played — a board that ends at
   the first slip punishes a misclick as hard as a misreading, and these
   tilings afford plenty of misclicks. What a slip costs instead is the
   record: the clock is only worth keeping for a board played clean. */
let flashCell = -1, flashUntil = 0;

/* Kept for that judgement, and shown so the player knows where they stand.
   Either one above nought and the time is not recorded — not a punishment,
   just an honest label on what the number would mean.

   And a third reason a board may not record, kept apart from the two counts
   because it is not the player's doing: a board restored from a save written
   before any of this was counted has a history nobody knows. It must not set
   a record, but neither should it be accused of a slip it may not have
   made. */
let mistakes = 0, hintsUsed = 0, historyLost = false;

/* An optional law the mines must obey, over and above the numbers. The
   boards built under one are made so that the law is needed: a solver
   kept ignorant of it must get stuck on them. */
let ruleset = 'none';

/* A ruleset is one law, or two of them together. Naming the laws apart from
   the rulesets means the laying, the checking and the deducing can each ask
   what is in force rather than match on the name of a combination. */
const LAWS = {
  none: [], connected: ['connected'], connected2: ['connected'], outside: ['outside'],
  twogroup1: ['twogroups'], safeconn: ['safeconn'],
  sparse: ['degree'],
  singles: ['group'], doubles: ['group'], triples: ['group'], quads: ['group'],
  notriples: ['group'], noquads: ['group'],
  snake: ['snake'], loop: ['loop'],
  boxed1: ['box'], boxed2: ['box'], boxed3: ['box'], boxed4: ['box'],
  boxedirr: ['box'],
  cbox4: ['connected', 'box'], sbox4: ['snake', 'box']
};
/* One law may be held back for a moment, to ask whether the board really
   needs it. Nothing lays or checks while it is held back — only the solver
   runs — so the laying is never let off obeying both. */
let lawOff = '';
const has = law => law !== lawOff && (LAWS[ruleset] || []).includes(law);

/* What counts as joined, where a law speaks of one group. Connected lets
   mines meet at a corner; Connected 2 asks for a shared edge, which is a far
   tighter thing to ask of a pentagon — a cell has three or four edge
   neighbours where it has seven or eight touching it in all — and makes the
   group a thicker, blunter shape. Everything else that chains, the paths and
   the border, has always gone edge to edge. */
const CORNERJOIN = { connected: 1, cbox4: 1 };
const joinAdj = () => (CORNERJOIN[ruleset] ? corOf : edgOf);

/* Two groups instead of one, and one law about the safe ground instead of
   the mines. Two Groups speaks of edge-joined groups that may meet at a
   corner but never along an edge. Safe connected turns the whole idea
   over: the mines may lie anyhow, but the uncovered ground must remain one
   edge-joined piece, so a mine is forbidden exactly where it would cut the
   safe world in two. An equal-size variant of the two groups was built and
   removed at the user's request; the dial for it is gone with it. */

/* How many cells to a group, where the law speaks of groups at all. A size
   says what every group must be; a cap says only what none may exceed, which
   leaves the smaller groups free and can therefore never force a mine — only
   ever clear the ground round one. */
/* How many mines a mine may have beside it — counting every cell it
   touches, edge or corner. Only the ceiling is in force now: Sparse forbids
   the dense heart of a clump while leaving its edges free, and a ceiling of
   three was measured to bite four times as hard as one of four while laying
   without complaint. The floor machinery stays, since the solver's crowding
   rules read both ends and a future law may want it, but no ruleset sets
   one. */
const DEGFLOOR = {};
const DEGCAP = { sparse: 3 };
const degFloor = () => (lawOff === 'degree' ? 0 : DEGFLOOR[ruleset] || 0);
const degCap = () => (lawOff === 'degree' ? 99 : (DEGCAP[ruleset] === undefined ? 99 : DEGCAP[ruleset]));

/* The count a laying can actually take: the group laws lay whole groups, so
   the count is snapped to the group before the search starts, and eased by
   the group thereafter. */
const layStep = () => groupSize() || 1;

const GROUPSIZE = { singles: 1, doubles: 2, triples: 3, quads: 4 };
const GROUPCAP = { notriples: 2, noquads: 3 };
const groupSize = () => (lawOff === 'group' ? 0 : GROUPSIZE[ruleset] || 0);
const groupCap = () => (lawOff === 'group' ? 0 : GROUPCAP[ruleset] || 0);

/* Which box law is in force. The first three bound how many mines a box may
   hold; the fourth writes the number on it instead, which binds the laying
   not at all and tells the player a great deal. */
const BOXLAW = { boxed1: 'floor', boxed2: 'ceiling', boxed3: 'both',
                 boxed4: 'exact', cbox4: 'exact', sbox4: 'exact',
                 boxedirr: 'irregular' };
const boxLaw = () => (lawOff === 'box' ? '' : BOXLAW[ruleset] || '');

/* Every rule the solver owns, ranked by what a player must hold in mind to
   use it. Tier one is one clue and one glance: a number satisfied, a group
   at full size, a box read like a number. Tier two is two facts held
   together: one number inside another, a bottleneck, a bound traded with a
   count. Tier three is whole-board budgets, endgame reckoning against the
   mine counter, and casework. Difficulty stands on this ladder: a level's
   boards fall to its tier and below, and genuinely need the tier they are
   sold as. */
const TIER = {
  'counting-clear': 1, 'counting-full': 1, 'total-none': 1, 'total-all': 1,
  'group-full': 1, 'group-grow': 1, 'group-big': 1, 'group-room': 1,
  'cap-over': 1, 'snake-body': 1, 'snake-end': 1, 'loop-degree': 1,
  'deg-full': 1, 'deg-grow': 1, 'deg-over': 1, 'deg-room': 1,
  'box-exact': 1, 'box-full': 1, 'box-short': 1,
  'two-pocket': 2, 'two-cut': 2, 'two-ways': 3,
  'safe-cut': 2, 'safe-pocket': 2,
  'subset': 2, 'snake-touch': 2, 'loop-short': 2, 'loop-close': 2,
  'reach-pocket': 2, 'outside-pocket': 2, 'reach-cut': 2, 'outside-cut': 2,
  'cap-count': 2, 'group-count': 2, 'box-count': 2, 'snake-count': 2,
  'loop-count': 2, 'deg-count': 2,
  'crossed': 3, 'total-elsewhere-clear': 3, 'total-elsewhere-mined': 3,
  'reach-budget': 3, 'piece-budget': 3, 'reach-room': 3, 'reach-toll': 3,
  'reach-way': 3, 'cap-ways': 3, 'group-ways': 3,
  'reach-need': 3, 'group-fit': 3, 'reach-owed': 3, 'conn-ways': 3, 'reach-fare': 3,
  'deg-ways': 3, 'suppose': 3, 'replay': 3
};

/* The generator's dials on the solver: a ceiling on the tier it may reason
   at (nought is no ceiling), one rule switched off to ask whether a board
   truly needs it, and a tally of what fired, kept only while someone is
   counting. Play always runs with the dials at rest. */
let tierCap = 0;
let ruleOff = '';
let ruleTally = null;
/* Whether deduce may reach for the supposition on its own. Off in ordinary
   dealing — the generator solves every board hundreds of times, and a
   supposition scan multiplies each solve by its candidates — and turned on
   by the measurements, and one day by the qualification of boards that must
   need chains. The hint path is not gated by this: a player who asks for a
   supposition's help is answered. */
let supposeOn = false;
/* And a dial on the opening. The first cell handed out is normally a nought,
   because a nought cascades and gives the player somewhere to stand. But a
   cascade is a great deal of one-glance information at once, and under a law
   that already speaks in one glance — the crowding laws especially — it can
   hand over the whole board's easy half before the player has done anything.
   Turned on, the opening takes the tightest number it can find instead. */
let openTight = 0;
const allowRule = rule =>
  (!tierCap || (TIER[rule] || 1) <= tierCap) && rule !== ruleOff;
/* While a supposition's story is being taken down, every mark is logged as
   it is made. The batch rules mark first and name their rule a breath
   later, so the log entry is pushed unnamed and stamped here — the calls
   come in matched pairs, one tally per mark. */
let chainLog = null;
const tallyRule = rule => {
  if (ruleTally) ruleTally[rule] = (ruleTally[rule] || 0) + 1;
  if (chainLog)
    for (let i = chainLog.length - 1; i >= 0 && !chainLog[i].rule; i--)
      chainLog[i].rule = rule;
};
const RULENOTES = {
  none: '',
  connected: 'All mines form a single group, touching by edge or corner.',
  connected2: 'All mines form a single group, joined edge to edge — a corner between two of them does not join them.',
  twogroup1: 'The mines form exactly two edge-joined groups. The groups may meet at a corner, but never along an edge.',
  safeconn: 'Every safe cell joins every other along edges: the ground you can stand on is one connected piece.',
  outside: 'Every mine chains edge to edge to the border.',
  sparse: 'No mine has more than three other mines touching it, by edge or corner.',
  singles: 'Every mine stands alone: no two share an edge, though they may meet ' +
           'at a corner.',
  doubles: 'Mines come in edge-joined pairs; pairs may meet at a corner, but never ' +
           'along an edge.',
  triples: 'Mines come in edge-joined threes; the threes may meet at a corner, but ' +
           'never along an edge.',
  quads: 'Mines come in edge-joined fours; the fours may meet at a corner, but ' +
         'never along an edge.',
  notriples: 'No three mines join up along their edges: they come singly or in ' +
             'pairs, and never more.',
  noquads: 'No four mines join up along their edges: they come in ones, twos or ' +
           'threes, and never more.',
  snake: 'Mines form one edge-joined path that never runs alongside itself.',
  loop: 'Mines form one edge-joined loop that never runs alongside itself — ' +
        'every mine has exactly two mines beside it.',
  boxed1: '', boxed2: '', boxed3: '', boxed4: '', boxedirr: '',
  cbox4: '', sbox4: ''      // all written out by paintRuleNote
};
let mines = 10, opened = 0, flags = 0, given = 0;
// the size the board in play was actually built from, which is what a saved
// game must be rebuilt with — the sliders are only where it came from
let builtAcross = 0, builtDown = 0;
let seeded = false, over = false, won = false, exploded = -1;
let startTime = 0, endTime = 0;

/* Difficulty turns three dials at once: how many mines land for a given
   setting of the slider, how much of the board the opening gives away, and
   which layouts the generator keeps — easy prefers the ones that fall to
   counting alone, hard the stubborn ones that make the player earn the
   subtler rules. None of it touches the guarantee: every board can still
   be finished without guessing. */
let difficulty = 'easy';
/* mines scales the slider's density; open is the share of safe cells the
   opening aims to give away; tier is the rung of the rule ladder the level
   stands on — its boards fall to rules of that tier and below, and past the
   first rung they genuinely need their own: a medium board does not fall to
   easy's rules alone, nor a hard board to medium's. mute is the share of its
   numbers a level may keep back, checked against the same tier its player
   reasons at. Hard and harder skew their search toward boards whose solving
   leans hardest on the deep rules; harder also hunts for boards that need as
   many different rules as it can find, and hides every number it can spare.
   None of it touches the guarantee: every board can still be finished
   without guessing. */
/* The ladder climbed a rung. What was harder is now hard — every sparable
   number hidden, variety hunted, the deep rules demanded — and harder stands
   above it on a new kind of requirement: chain, which admits only boards the
   flat rules cannot finish at all. Somewhere on such a board a supposition
   must be granted and followed to its contradiction, and the whole deal is
   reasoned with suppositions in the room so the promise of no guessing is
   made about the same solver the player's hints will use. */
const DIFF = {
  easy:   { mines: 1.0,  open: 0.25, tier: 1 },
  medium: { mines: 1.15, open: 0.14, tier: 2, mute: 0.45 },
  hard:   { mines: 1.3,  open: 0.07, tier: 3, mute: 1, skew: true, dens: 0.35,
            variety: true, slow: true },
  harder: { mines: 1.3,  open: 0.07, tier: 3, mute: 1, skew: true, dens: 0.35,
            variety: true, slow: true, chain: true }
};

/* Hard aims at a density of its own rather than scaling whatever the slider
   happens to say, because the reasoning is deepest around a third of the
   board and the sliders were never going to land there by accident. The
   path laws want a little more: a longer path passes through more of the
   board, and their logic is worth the most where it nearly fills it. */
const LAWDENS = { snake: 0.40, loop: 0.40, sbox4: 0.40,
                  sparse: 0.45, boxed4: 0.45 };
/* Boxed 4 asks for more than a third because a thin board leaves boxes
   empty, and a box reading nought hands over every cell it holds before a
   click is made — so a level asking for a small opening was giving a large
   one away through its boxes. At a third full, a four-cell box is empty
   about one time in five and those boxes freed more cells than the opening
   showed; nearer half full it is one in twenty, and the free start falls by
   a third. The irregular cut is left where it was: its boxes vary in size,
   and crowding them only grew the opening instead. */

/* Best times, one for each tiling at each standard size and difficulty,
   kept in the browser's storage. A board made on the sliders is its own
   thing and sets no records. */
let sizeName = 'Small';       // the standard size this board came from, if any
let newBest = false;
let bests = {};
try { bests = JSON.parse(localStorage.getItem('pentagonal-minesweeper-bests') || '{}'); } catch (e) {}
const bestKey = () => sizeName && (tiling.id + '|' + sizeName + '|' + difficulty +
  (ruleset === 'none' ? '' : '|' + ruleset));
/* The game in play, kept in the browser so that closing the page does not
   throw it away. What is written down is the settings, where the mines are,
   and what the player has done about them. The geometry is not: it follows
   from the tiling and the size and is rebuilt the same way every time. If it
   ever does not — the tiling having been changed under it — the cell count
   will not agree and the saved game is dropped rather than patched onto a
   board it was never played on. */
const BOARDKEY = 'pentagonal-minesweeper-board';

function saveBoard() {
  if (!n || !mine || mine.length !== n) return;
  // one character a cell; counts can reach eight, so they go in base thirty-six
  const pack = a => { let out = ''; for (let i = 0; i < n; i++) out += a[i].toString(36); return out; };
  try {
    /* The version stamps what a save means, not just how it is shaped. The
       one-sided cell clues were dealt into boards and then removed from the
       game; a board saved with them loses them on restore, and what remains
       may not be finishable without guessing — an open blank that never
       cascaded, a muting that leaned on a bound no longer there. Boards from
       that era are let go rather than half-restored. */
    localStorage.setItem(BOARDKEY, JSON.stringify({
      v: 2, tiling: tiling.id,
      across: builtAcross, down: builtDown, ask: +rngMines.value,
      size: sizeName, diff: difficulty, rule: ruleset,
      mute: muteOn, strict: strict, adj: adjOn, weaken: weakenOn,
      miss: mistakes, hints: hintsUsed, lost: historyLost,
      n: n, mines: mines, given: given, exploded: exploded, over: over, won: won,
      /* opened and flags are kept rather than counted back, and so are the
         numbers: losing opens the mines without counting them, and the strict
         law plants one where there was none, so neither follows from the board
         as it now stands. What was on the screen is what should come back. */
      opened: opened, flags: flags, count: pack(count),
      boxMuted: boxMuted ? [...boxMuted].join('') : '',
      // an irregular cut is drawn afresh each board, so it has to be kept
      boxOf: boxOf ? [...boxOf].map(v => (v + 1).toString(36)).join(',') : '',
      elapsed: startTime ? Math.round((over ? endTime : performance.now()) - startTime) : 0,
      // the opening as dealt, kept for the hint of very last resort
      dealt: dealt.join(','),
      mine: pack(mine), state: pack(state), muted: pack(muted),
      ghost: pack(ghost)
    }));
  } catch (e) {}
}

function restoreBoard() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(BOARDKEY) || 'null'); } catch (e) {}
  if (!s || s.v !== 2) return false;
  const t = TILINGS.find(x => x.id === s.tiling);
  if (!t || !LAWS[s.rule]) return false;      // a law since dropped or renamed

  // the settings go back first, since the board is built out of them
  tiling = t;
  difficulty = s.diff; ruleset = s.rule; muteOn = s.mute;
  strict = s.strict; adjOn = s.adj; sizeName = s.size; weakenOn = !!s.weaken;
  mistakes = s.miss || 0;
  hintsUsed = s.hints || 0;
  historyLost = s.miss === undefined || !!s.lost;
  rngAcross.value = s.across; rngDown.value = s.down; rngMines.value = s.ask;

  builtAcross = s.across; builtDown = s.down;
  buildBoard(t, s.across, s.down);
  useCorners(true);
  if (n !== s.n || s.mine.length !== n) return false;

  if (typeof s.count !== 'string' || s.count.length !== n) return false;
  mine = new Uint8Array(n); state = new Uint8Array(n);
  count = new Uint8Array(n); muted = new Uint8Array(n);
  ghost = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    mine[i] = +s.mine[i]; state[i] = +s.state[i]; muted[i] = +s.muted[i];
    if (typeof s.ghost === 'string' && s.ghost.length === n) ghost[i] = +s.ghost[i];
    count[i] = parseInt(s.count[i], 36);
  }
  /* An irregular cut is not worked out from the tiling, so it comes back off
     the save rather than being drawn anew — a fresh cut would not be the board
     that was played on. */
  if (boxLaw() === 'irregular' && typeof s.boxOf === 'string' && s.boxOf) {
    const own = s.boxOf.split(',').map(v => parseInt(v, 36) - 1);
    if (own.length !== n) return false;
    const groups = [];
    for (let i = 0; i < n; i++) {
      const b = own[i];
      if (b < 0) continue;
      (groups[b] = groups[b] || []).push(i);
    }
    boxes = groups.filter(g => g && g.length);
    finishBoxes(true);
  }
  noteBoxCounts();                       // the boxes' numbers follow from the mines
  boxMuted = new Uint8Array(boxes.length);
  if (typeof s.boxMuted === 'string' && s.boxMuted.length === boxes.length)
    for (let b = 0; b < boxes.length; b++) boxMuted[b] = +s.boxMuted[b];
  mines = s.mines; given = s.given; exploded = s.exploded;
  over = s.over; won = s.won; opened = s.opened; flags = s.flags;
  dealt = typeof s.dealt === 'string' && s.dealt ? s.dealt.split(',').map(Number) : [];
  newBest = false; flashCell = -1; hover = -1; seeded = true;
  // the clock is put back to where it stood rather than restarted
  startTime = s.elapsed ? performance.now() - s.elapsed : 0;
  endTime = over ? performance.now() : 0;
  buildPaths();
  return true;
}

// the panel has to agree with whatever was restored
function paintToggles() {
  const mark = (sel, is) => {
    for (const x of document.querySelectorAll(sel)) x.classList.toggle('on', is(x));
  };
  mark('[data-diff]', x => x.dataset.diff === difficulty);
  mark('[data-rule]', x => x.dataset.rule === ruleset);
  mark('[data-strict]', x => !!x.dataset.strict === strict);
  mark('[data-weaken]', x => !!x.dataset.weaken === weakenOn);
  mark('[data-adj]', x => !!x.dataset.adj === adjOn);
  selTiling.value = TILINGS.indexOf(tiling);
}

function saveBests() {
  try { localStorage.setItem('pentagonal-minesweeper-bests', JSON.stringify(bests)); } catch (e) {}
}

/* Paring solves a board once for every clue it tries, which on a large one is
   hundreds of solves and several seconds of them. Held in a single stretch
   that would lock the page up with nothing to show for itself, so the deal
   steps out now and then to let the page paint how far it has got. Every way
   of starting a board therefore hands back a promise.

   Only a pared deal ever actually steps out. On the other levels the body
   runs from end to end without once waiting, so the board is finished and on
   the screen by the time the promise is handed over, exactly as it was when
   nothing here was a promise at all. */
let dealNote = '';

const breath = () => new Promise(r => setTimeout(r, 0));

/* A deal that steps out to breathe can find the world moved on: another
   board started while it slept, and the arrays it was building now belong
   to the newer deal. So every deal takes a numbered token, checks it on
   waking, and a stale deal dies where it stands rather than write one more
   word over a board that is no longer its own. The buttons already queue
   their deals one behind another; this guards the ones nothing queues —
   scripts, tests, anything driving the game directly. */
let dealToken = 0;
const STALE_DEAL = {};
const dealCheck = t => { if (t !== dealToken) throw STALE_DEAL; };

async function newGame(across, down, m) {
  const my = ++dealToken;
  try {
    await newGameUnder(my, across, down, m);
  } catch (e) {
    if (e !== STALE_DEAL) throw e;       // superseded mid-breath: die quietly
  }
}

async function newGameUnder(my, across, down, m) {
  builtAcross = across; builtDown = down;
  buildBoard(tiling, across, down);
  useCorners(true);          // cells touching at a corner count as neighbours

  /* Some tilings can only come in the sizes their own repeat allows, so a board
     may hold rather more or fewer cells than were asked for. The mine count
     follows it, keeping the density the slider was set to — ten mines meant one
     cell in six, and it should stay one cell in six on whatever board arrives.
     Difficulty then scales that density: a crowded board leans harder on the
     subtler rules, and the generator hands out hints wherever the crowding
     would otherwise leave a genuine guess. */
  const asked = across * down;
  const d = DIFF[difficulty];
  /* A board at one of the standard sizes takes the level's own density where
     the level names one. A board whose mines the player set by hand keeps the
     number they chose, carried across to the board that actually arrived —
     their figure, not ours. */
  const aim = d.dens && sizeName && (LAWDENS[ruleset] || d.dens);
  mines = Math.max(1, Math.min(Math.round(aim ? n * aim : m * (n / asked) * d.mines), n - 9));

  mine = new Uint8Array(n);
  state = new Uint8Array(n);
  count = new Uint8Array(n);
  muted = new Uint8Array(n);
  ghost = new Uint8Array(n);

  opened = 0; flags = 0; given = 0; newBest = false;
  mistakes = 0; hintsUsed = 0; historyLost = false;
  seeded = false; over = false; won = false; exploded = -1; flashCell = -1;
  startTime = 0; endTime = 0; hover = -1;

  buildPaths();

  /* A board that needs no guessing has to be worked out before it is shown,
     since what it starts with showing is part of the answer. */
  seeded = true;
  dealing = true;
  /* A chain deal thinks with suppositions from the first card: the handing
     out stops as soon as chains can finish the board, the muting is judged
     against the same strength, and the qualification then asks the flat
     rules alone and requires them to fail. Restored to rest whatever
     happens, since play holds the dial off and the hints have their own. */
  if (d.chain) supposeOn = true;
  try {
    const opening = await buildPuzzle();
    dealCheck(my);
    dealt = opening.slice();
    for (const g of opening) reveal(g);
    dealing = false;
    /* Hidden numbers follow the level now, not a setting of their own: none
       on easy, a share on medium, and from hard up every number the board
       can spare. muteOn is kept abreast only for the saved game's sake. */
    muteOn = !!d.mute;
    if (d.mute) { await muteNumbers(d.mute); dealCheck(my); }
    given = opened;
  } finally { supposeOn = false; }

  dealNote = '';
  paintStatus();
}

// Mines scattered at random over whatever is allowed to hold them, and the
// numbers read off afterwards.
function layMines(banned) {
  mine.fill(0);
  let placed = 0;
  if (seedMotif) for (const c of seedMotif.mines)
    if (!mine[c]) { mine[c] = 1; placed++; }
  let pool = [];
  for (let j = 0; j < n; j++) if (!banned.has(j) && !mine[j] && seedOK(j)) pool.push(j);
  if (pool.length < mines - placed) {
    pool = [];
    for (let j = 0; j < n; j++) if (!mine[j]) pool.push(j);
  }
  for (let m = 0; m < mines - placed; m++) {
    const p = m + Math.floor(Math.random() * (pool.length - m));
    const tmp = pool[m]; pool[m] = pool[p]; pool[p] = tmp;
    mine[pool[m]] = 1;
  }
  countFromMines();
}

// The numbers, read off wherever the mines have ended up.
function countFromMines() {
  for (let j = 0; j < n; j++) {
    let c = 0;
    for (const i of nbOf(j)) if (mine[i]) c++;
    count[j] = c;
  }
  noteBoxCounts();
}

// And the same for the boxes, which one of the box laws puts on show.
function noteBoxCounts() {
  if (!boxes.length) { boxShown = null; boxRel = []; return; }
  boxShown = new Int32Array(boxes.length);
  boxRel = new Array(boxes.length).fill('');
  const loose = boxLaw() === 'irregular';
  for (let b = 0; b < boxes.length; b++) {
    let c = 0;
    for (const i of boxes[b]) c += mine[i];
    boxShown[b] = c;
    if (loose) {
      const [rel, val] = clueFor(b, c, boxes[b].length);
      boxRel[b] = rel; boxShown[b] = val;
    }
  }
}

/* Which way a box states its number. Settled by the box and the count alone,
   never by chance, so the same board always wears the same clue however many
   times it is read off — a generator that tries a hundred boards and keeps
   one must find that one saying what it said when it was judged. */
function clueFor(b, held, size) {
  const h = (((b + 1) * 2654435761) + held * 40503) >>> 0;
  const kind = h % 3, roll = h >>> 5;

  /* A bound is drawn from the whole of its legal range rather than sitting a
     step or two off the true count. Drawn from a narrow range it gives itself
     away: at a nudge of nought or one, two thirds of "at least four" meant
     exactly four and the rest meant five, so the bound announced its own
     slack. Spread across the range it says what it says and no more. */
  if (kind === 1 && held >= 1)
    return ['\u2265', 1 + roll % held];             // one, up to what it holds

  /* At most nought says no more than an exact nought does, so a ceiling
     starts at one; and at most the whole box says nothing at all, so it stops
     one short of the box. */
  if (kind === 2 && size >= 2) {
    const lo = Math.max(1, held), hi = size - 1;
    if (lo <= hi) return ['\u2264', lo + roll % (hi - lo + 1)];
  }
  return ['', held];
}

/* The figure a bound names, for a cell as much as a box. Two faults have to
   be avoided at once, and they pull in opposite directions.

   Sit the figure on the true count and the bound is the count in disguise:
   every "at most three" meaning exactly three teaches the player to read it
   as three within a board or two, and it has given away all it pretended to
   withhold. But spread the figure across the whole of its true range and the
   other fault arrives — "at most five" beside three covered cells forbids
   nothing that was not already forbidden, and a clue that forbids nothing is
   clutter wearing the clothes of information.

   So the figure is drawn near the truth but not on it: within two either
   way, and never past the point where it would stop binding. A ceiling must
   stay below the covered ground it watches or it says nothing; a floor must
   stay above nought for the same reason. Three figures to choose from on
   each side means the count itself comes up about a third of the time, which
   is a coincidence rather than a tell.

   `held` is what the cell really holds and `cov` the covered ground it
   watches. The roll is taken from the cell itself, so the same board always
   wears the same clue however often it is read off. */
function looseClue(id, held, cov, salt) {
  const h = (((id + 1) * 2654435761) + held * 40503 + (salt || 0) * 2246822519) >>> 0;
  /* How far the figure sits from the count: nought, one or two. Nought has to
     stay possible — a bound that never names its count is read with one
     subtracted, the same tell turned inside out — but it cannot be left to an
     even draw either, because the draw is not what decides what appears: a
     figure is only worn if the board can still be finished under it, and a
     tighter figure withholds less, so what survives skews tight however
     evenly it was drawn. Walking down through candidates skewed it all the
     way to four in five naming the truth. One draw, no second figure on the
     same side, and the count dealt in scarce is what keeps the outcome
     mixed — and it is measured, not assumed. */
  const r = h % 5;
  const slack = r === 0 ? 0 : r <= 2 ? 1 : 2;
  const wantFloor = ((h >>> 8) % 2) === 0;
  const fv = held - slack;             // "at least" — a true floor while one or more
  const cv = held + slack;             // "at most" — binding only under the covered ground
  const floorOK = fv >= 1;
  const ceilOK = cv <= cov - 1;
  if (wantFloor && floorOK) return ['≥', fv];
  if (ceilOK) return ['≤', cv];
  if (floorOK) return ['≥', fv];
  return null;                         // this cell keeps its plain number
}

// what a box's clue allows: the fewest mines it may hold, and the most
function boxRange(b) {
  const size = boxes[b].length, v = boxShown[b], r = boxRel[b];
  return r === '\u2265' ? [v, size] : r === '\u2264' ? [0, v] : [v, v];
}

/* In the plain game mines are laid only once the first cell is asked for, and
   never on that cell or anything touching it — so the first click always opens
   out into a region rather than onto a bare number. */
function seed(first) {
  const banned = new Set([first]);
  for (const j of nbOf(first)) banned.add(j);
  layMines(banned);
  seeded = true;
}

// The clock does not start until the player does something.
function startClock() { if (!startTime) startTime = performance.now(); }
