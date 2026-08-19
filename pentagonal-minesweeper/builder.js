"use strict";

/* Pentagonal Minesweeper — motifs planted on purpose, the building of a puzzle, and the hiding of numbers.
   One of five scripts sharing a single scope; the order they are
   loaded in is the order the one file used to run in. */

/* =====================================================================
   MOTIFS — reasoning planted on purpose.

   Each hunt looks over the bare board for ground where a chosen kind of
   reasoning could live, and answers with the mines to plant, the cells to
   keep clear, and — for the path laws — the stretch of walk to carry.
   A hunt promises geometry, not outcome: whether the reasoning ends up
   truly needed is judged afterwards, the honest way, by switching rules
   off; a motif that dissolves into the rest of the board has still seeded
   a livelier layout than chance. Hunts start from a random cell, so the
   same board is never planted twice alike.
   ===================================================================== */

// cells of i's ring forming an edge-joined path of length L, in order
function ringRun(i, L) {
  const ring = [...nbOf(i)];
  if (ring.length < L) return null;
  const eadj = (a, b) => [...edgOf(a)].includes(b);
  const found = [];
  const grow = path => {
    if (found.length) return;
    if (path.length === L) {
      // induced: no touching except along the run
      for (let x = 0; x < L; x++) for (let y = x + 2; y < L; y++)
        if (eadj(path[x], path[y])) return;
      found.push(path.slice());
      return;
    }
    for (const c of ring)
      if (!path.includes(c) && eadj(path[path.length - 1], c)) {
        path.push(c); grow(path); path.pop();
      }
  };
  const off = Math.floor(Math.random() * ring.length);
  for (let s = 0; s < ring.length && !found.length; s++)
    grow([ring[(off + s) % ring.length]]);
  return found[0] || null;
}

/* A run beside one cell: mines spaced so the law leaves a single reading,
   the gaps kept clear, the watcher kept clear to carry the number. */
function huntRun() {
  const s = groupSize(), cap = groupCap();
  let L, mineAt;
  if (s === 1) { L = 5; mineAt = [0, 2, 4]; }
  else if (cap === 2) { L = 4; mineAt = [0, 1, 3]; }
  else if (cap === 3) { L = 5; mineAt = [0, 1, 2, 4]; }
  else return null;
  const start = Math.floor(Math.random() * n);
  for (let o = 0; o < n; o++) {
    const i = (start + o) % n;
    if (!interior[i]) continue;
    const run = ringRun(i, L);
    if (!run) continue;
    const banned = new Set([i]);
    for (let p = 0; p < L; p++) if (!mineAt.includes(p)) banned.add(run[p]);
    return { mines: mineAt.map(p => run[p]), banned, segment: null };
  }
  return null;
}

/* The wedge, for the pairs: a mine whose only growth is two forked cells,
   and a third cell touching both — safe whichever way the pair completes. */
function huntWedge() {
  const start = Math.floor(Math.random() * n);
  const eadj = (a, b) => [...edgOf(a)].includes(b);
  for (let o = 0; o < n; o++) {
    const m = (start + o) % n;
    if (!interior[m]) continue;
    const nb = [...edgOf(m)];
    for (let i1 = 0; i1 < nb.length; i1++) for (let i2 = i1 + 1; i2 < nb.length; i2++) {
      const a = nb[i1], b = nb[i2];
      if (eadj(a, b)) continue;
      const c = [...edgOf(a)].find(x =>
        x !== m && x !== b && !eadj(x, m) && eadj(x, b));
      if (c === undefined) continue;
      return { mines: [m, a], banned: new Set([b, c]), segment: null };
    }
  }
  return null;
}

/* The stem: a four-cell run beside a cell, its outer half kept clear, its
   inner half mined and anchored — to the group, or as a stretch of path. */
function huntStem() {
  const path = has('snake') || has('loop');
  const start = Math.floor(Math.random() * n);
  for (let o = 0; o < n; o++) {
    const i = (start + o) % n;
    if (!interior[i]) continue;
    const run = ringRun(i, 4);
    if (!run) continue;
    const [c1, c2, c3, c4] = run;
    const banned = new Set([i, c3, c4]);
    if (path) {
      const m = [...edgOf(c1)].find(x =>
        !run.includes(x) && x !== i &&
        ![c2, c3, c4].some(z => [...edgOf(x)].includes(z)));
      if (m === undefined) continue;
      return { mines: [m, c1, c2], banned, segment: [m, c1, c2] };
    }
    if (has('outside')) return { mines: [c1, c2], banned, segment: null };
    const m = [...joinAdj()(c1)].find(x =>
      !run.includes(x) && x !== i && ![...nbOf(i)].includes(x));
    if (m === undefined) continue;
    return { mines: [m, c1, c2], banned, segment: null };
  }
  return null;
}

/* The corridor: two ends with two ways between them, one way watched by a
   cell that can only pay for half of it. */
function huntCorridor() {
  const path = has('snake') || has('loop');
  const adj = path ? edgOf : joinAdj();
  const eadj = (a, b) => [...adj(a)].includes(b);
  const start = Math.floor(Math.random() * n);
  for (let o = 0; o < n; o++) {
    const mA = (start + o) % n;
    if (!interior[mA]) continue;
    for (const x1 of adj(mA)) {
      for (const x2 of adj(x1)) {
        if (x2 === mA || eadj(mA, x2)) continue;
        for (const mB of adj(x2)) {
          if (mB === mA || mB === x1 || eadj(mA, mB) || eadj(x1, mB)) continue;
          if (!path) {
            const y = [...adj(mA)].find(c =>
              c !== x1 && c !== x2 && c !== mB && eadj(c, mB));
            if (y === undefined) continue;
            const w = [...nbOf(x1)].find(c =>
              ![mA, mB, x2, y].includes(c) &&
              [...nbOf(c)].includes(x2) && [...nbOf(c)].includes(y) &&
              ![...nbOf(c)].includes(mA) && ![...nbOf(c)].includes(mB));
            if (w === undefined) continue;
            return { mines: [mA, y, mB], banned: new Set([x1, x2]), segment: null };
          }
          let y1 = -1, y2 = -1;
          outer:
          for (const a of adj(mA)) {
            if (a === x1 || a === x2 || a === mB || eadj(a, mB)) continue;
            for (const b of adj(a)) {
              if ([mA, mB, x1, x2, a].includes(b)) continue;
              if (eadj(b, mA) || !eadj(b, mB)) continue;
              y1 = a; y2 = b; break outer;
            }
          }
          if (y1 < 0) continue;
          const mE = [...adj(mA)].find(c =>
            ![mA, mB, x1, x2, y1, y2].includes(c));
          if (mE === undefined) continue;
          return { mines: [mE, mA, y1, y2, mB], banned: new Set([x1, x2]),
                   segment: [mE, mA, y1, y2, mB] };
        }
      }
    }
  }
  return null;
}

// whichever motif suits the law in force, chosen at random among them
function huntMotif() {
  const kinds = [];
  if (groupSize() === 1 || groupCap()) kinds.push(huntRun);
  if (groupSize() === 2) kinds.push(huntWedge);
  if (has('connected')) kinds.push(huntStem, huntCorridor);
  if (has('outside')) kinds.push(huntStem);
  if (has('snake') || has('loop')) kinds.push(huntStem, huntCorridor);
  if (!kinds.length) return null;
  return kinds[Math.floor(Math.random() * kinds.length)]();
}

async function buildPuzzle() {
  const d = DIFF[difficulty];
  const structured = ruleset !== 'none';
  const gSize = groupSize();
  const gStep = layStep();
  const theBoxLaw = boxLaw();
  /* Whatever count is asked for is bent to what the law can hold at all:
     groups come in whole groups and Exactly 3 in whole fours, a ring needs
     four cells at the very least, and a box law binds the count between its
     floors and ceilings. Run again after every change of count, since the
     nudging below changes it. */
  const fitCount = () => {
    if (gStep > 1)
      mines = Math.max(gStep, gStep * Math.floor(Math.min(n - 9, mines) / gStep));
    if (has('loop')) mines = Math.max(4, mines);
    if (theBoxLaw && theBoxLaw !== 'exact') {
      const { lo, hi } = boxBounds();
      mines = Math.max(boxes.length * lo, Math.min(mines, boxes.length * hi));
    }
    mines = Math.max(1, Math.min(mines, n - 9));
  };
  fitCount();
  let target = (n - mines) * d.open;
  // the deep tiers get longer to search, and so do the laws: what they ask for is rarer
  const clock =
    (n > 300 ? 300 : 120) * ((d.tier >= 3 ? 2 : 1) + (structured ? 1 : 0)) *
    (d.chain ? 2 : 1);           // chain boards are rarer, and each try dearer
  let best = null, spare = null;
  const shortlist = [];          // harder's finalists, for the variety judging
  dealSeeds = { hunted: 0, laid: 0, kept: 0, qualified: 0 };
  keptGround = null;
  /* At rest for every deal. The retry below may turn it on, and it must stay
     on for the rest of this deal — the kept board's opening was chosen with
     it — but the next board starts from the ordinary one. */
  openTight = 0;
  const my = dealToken;          // entered before the deal's first breath
  let drew = performance.now();
  const breathe = async say => {
    if (performance.now() - drew < 100) return;
    drew = performance.now();
    dealNote = say;
    paintStatus();
    await breath();
    dealCheck(my);
  };

  /* A law the mines cannot obey at the count asked for is answered by asking
     for fewer, not by giving up — a board of 106 mines that must all chain to
     the border may simply not exist, while one of 70 does. Each law has a
     floor of its own: a pair needs two cells to be a pair, a ring four to be
     a ring. */
  const floor = has('loop') ? 4 : gStep;
  const step = gStep;
  /* Coming down one mine at a time costs a whole failed laying apiece, and on
     a big board asked for a long path that is most of the time there is. So
     the count falls by a share of itself, and only creeps at the very end. */
  const easeOff = () => {
    for (const drop of [step * Math.round(mines * 0.04 / step), step])
      if (drop >= step && mines - drop >= floor) { mines -= drop; return true; }
    return false;
  };

  /* Cells handed over one at a time until the mines laid can all be
     reasoned out — reasoned out at this level's tier, since the promise is
     owed to a player wielding this level's rules and no more. What fired
     along the way is tallied, for the levels that judge boards by it. */
  const handOut = () => {
    const known = new Uint8Array(n);
    const list = [];
    tierCap = d.tier >= 3 ? 0 : d.tier;
    ruleTally = {};
    /* The promise owed is one-shot: a player starts from the opening alone,
       not from the trajectory the dealing happened to walk. Some rules read
       the lie of the covered ground, and what they derive with few cells
       open they cannot always re-derive with more — so a closure built up
       given by given can outrun the closure the opening actually yields.
       Deal on the working closure, then put the honest question: does the
       opening alone still finish? Where it falls short, adopt what it
       really knows and keep dealing from there. */
    for (let round = 0; round < 50; round++) {
      /* Give before asking: under the box laws the clues stand on the boxes
         and can finish a thin board from nothing at all, and a board with
         nothing showing is not a board. */
      while (true) {
        const g = pickGiven(known, list.length === 0);
        if (g < 0) break;
        list.push(g);
        markOpen(known, g);
        if (deduce(known) === n - mines) break;
      }
      const k1 = new Uint8Array(n);
      for (const g of list) markOpen(k1, g);
      if (deduce(k1) === n - mines) break;
      known.set(k1);
    }
    const tally = ruleTally;
    ruleTally = null;
    tierCap = 0;
    return { list, tally };
  };

  const search = async until => {
  target = (n - mines) * d.open;
  for (let attempt = 0; attempt < 500; attempt++) {
    await breathe('Dealing…');
    /* Harder plants a motif on most attempts — reasoning set waiting in the
       ground rather than hoped for. A motif that will not lay costs the one
       attempt and never eases the count: the failure was the planting's,
       not the board's. */
    seedMotif = d.variety && attempt % 3 !== 2 ? huntMotif() : null;
    if (seedMotif && seedMotif.mines.length > mines - 4) seedMotif = null;
    const wasSeeded = !!seedMotif;
    const seedGround = wasSeeded
      ? seedMotif.mines.concat([...seedMotif.banned]) : null;
    if (wasSeeded) dealSeeds.hunted++;
    if (!structured) layMines(new Set());
    else if (!layByRule()) {
      seedMotif = null;
      if (!wasSeeded) easeOff();
      continue;
    }
    seedMotif = null;
    if (wasSeeded) dealSeeds.laid++;
    const { list, tally } = handOut();

    /* What the board really hands over: the opening and its cascades, plus
       whatever the boxes settle for nothing. A level that asks for a small
       start should be judged on the start a player actually gets. */
    const shown = new Uint8Array(n);
    for (const g of list) markOpen(shown, g);
    let cells = 0;
    for (let i2 = 0; i2 < n; i2++) if (shown[i2] === SAFE) cells++;
    cells += freeByBoxes(shown);
    /* Judged in strict order: fewest hints first; then, where the level asks
       it, how much of the solving leant on the deep rules — marks from the
       second and third tiers as a share of all marks, the third counted
       double, so a board that falls to counting scores low however it
       finishes; and last, an opening near the size this level grants.
       Harder also credits every distinct rule that fired, ahead of both. */
    let score = (list.length - 1) * 1e6 + Math.abs(cells - target);
    let marks = 0, deep = 0, kinds = 0;
    for (const r of Object.keys(tally)) {
      const t = TIER[r] || 1;
      marks += tally[r]; kinds++;
      if (t === 2) deep += tally[r];
      else if (t === 3) deep += 2 * tally[r];
    }
    if (d.skew && marks) score += (1 - deep / (2 * marks)) * 2e4;
    if (d.variety) score -= kinds * 5e4;

    /* Under a law, a board only counts if the law is load-bearing: a solver
       kept ignorant of it must stall short of finishing. Boards that fall to
       the ordinary rules alone are kept only as a spare, for the rare day
       the search finds nothing better. */
    let qualifies = true;
    if (structured) {
      const kb = new Uint8Array(n);
      for (const g of list) markOpen(kb, g);
      qualifies = deduce(kb, 'base') < n - mines;

      /* Where two laws are in force, each has to earn its place: hold one
         back and the board must still resist. Without this a pair is only
         the stronger of the two wearing both names, which is what they
         turned out to be — nearly half of them on the easier settings. */
      if (qualifies && LAWS[ruleset].length > 1) {
        for (const law of LAWS[ruleset]) {
          const k2 = new Uint8Array(n);
          for (const g of list) markOpen(k2, g);
          lawOff = law;
          const resists = deduce(k2) < n - mines;
          lawOff = '';
          if (!resists) { qualifies = false; break; }
        }
      }
    }

    /* And past the first rung, the tier is load-bearing too: a solver capped
       one rung below must stall. A medium board that falls to easy's rules
       is an easy board wearing the wrong name. */
    if (qualifies && d.tier >= 2) {
      const kt = new Uint8Array(n);
      for (const g of list) markOpen(kt, g);
      tierCap = d.tier - 1;
      const resists = deduce(kt) < n - mines;
      tierCap = 0;
      if (!resists) qualifies = false;
    }

    /* And above every other rung, the chain: a board sold as needing
       suppositions must stop the flat rules outright. The deal has been
       reasoning with suppositions throughout, so the handing out stopped
       the moment chains sufficed — this asks the other half, that nothing
       short of a chain gets there. */
    if (qualifies && d.chain) {
      const kc = new Uint8Array(n);
      for (const g of list) markOpen(kc, g);
      const keep = supposeOn;
      supposeOn = false;
      const stalls = deduce(kc) < n - mines;
      supposeOn = keep;
      if (!stalls) qualifies = false;
    }

    if (qualifies && wasSeeded) dealSeeds.qualified++;
    if (qualifies && (!best || score < best.score))
      best = { mine: mine.slice(), count: count.slice(), list, score, mines, tally,
               wasSeeded, seedGround };
    if (qualifies && d.variety) {
      shortlist.push({ mine: mine.slice(), count: count.slice(), list, score, mines,
                       tally, wasSeeded, seedGround });
      shortlist.sort((a, b) => a.score - b.score);
      if (shortlist.length > 4) shortlist.pop();
    }
    if (!spare || score < spare.score)
      spare = { mine: mine.slice(), count: count.slice(), list, score, mines, tally };
    if (performance.now() > until &&
        (best || performance.now() > until + 500)) break;
  }
  };
  await search(performance.now() + clock);

  /* A floor the search cannot meet may be the density's doing rather than
     the clock's: the deep rules live around a third-full board, and for
     some law and tiling the count a level asks lands where no layout needs
     them — longer clocks were measured to buy nothing there. So where the
     level owns the density and no board qualified, the count is nudged a
     step either way and the search sent out again, before any spare is
     settled for. A nudged board wears its own count honestly; the level's
     figure was an aim, not a promise. */
  if (!best && d.tier >= 3 && sizeName) {
    const asked = mines;
    for (const share of [0.04, -0.04, 0.08, -0.08]) {
      mines = asked + Math.round(share * n);
      fitCount();
      if (mines === asked) continue;
      await breathe('Dealing…');
      await search(performance.now() + clock / 2);
      if (best) break;
    }
    if (!best) mines = asked;
  }

  /* Medium's floor has a trouble of its own, and a different remedy. The
     crowding laws speak almost entirely in one glance — a mine short of its
     companions, a mine already at its fill, a cell with too little room
     round it ever to find three — so a board under them tends to fall to
     easy's rules however the mines are laid, and nudging the count does not
     help: the information is in the law, not in the density.

     What does help is the opening. The first cell handed out is normally a
     nought, and a nought cascades: it opens its whole neighbourhood at a
     stroke and hands the one-glance rules everything they need. Open on the
     tightest number instead and the player must reach further before those
     rules run out. Tried before any spare is settled for, and only where the
     search came home empty — an ordinary board keeps its ordinary start. */
  if (!best && d.tier === 2 && sizeName) {
    openTight = 1;
    await breathe('Dealing…');
    await search(performance.now() + clock / 2);
    if (!best) {
      const asked = mines;
      for (const share of [0.04, -0.04]) {
        mines = asked + Math.round(share * n);
        fitCount();
        if (mines === asked) continue;
        await breathe('Dealing…');
        await search(performance.now() + clock / 2);
        if (best) break;
      }
      if (!best) mines = asked;
    }
  }

  /* Harder judges its shortlist the honest way: a rule counts only when the
     board stops solving without it, so every rule that fired is switched off
     in turn and the board asked again. The board needing the most distinct
     rules wins. Counting alone is not asked after — no board does without
     it, and asking would cost two solves for a foregone answer. */
  if (d.variety && shortlist.length) {
    /* The rules that only ever speak through chains and casework count
       double: a board needing them is a board where the reasoning links,
       which is what this level is for. */
    const CHAINY = { 'reach-need': 1, 'reach-toll': 1, 'reach-way': 1,
                     'group-fit': 1, 'cap-ways': 1, 'group-ways': 1 };
    let bestReq = -1, bestChained = false;
    for (const cand of shortlist) {
      await breathe('Judging the shortlist');
      mine.set(cand.mine); count.set(cand.count); mines = cand.mines;
      noteBoxCounts();
      let req = 0, chained = false;
      for (const r of Object.keys(cand.tally)) {
        if (r === 'counting-clear' || r === 'counting-full') { req++; continue; }
        const kv = new Uint8Array(n);
        for (const g of cand.list) markOpen(kv, g);
        ruleOff = r;
        const still = deduce(kv) === n - mines;
        ruleOff = '';
        if (!still) {
          req += CHAINY[r] ? 2 : 1;
          if (CHAINY[r]) chained = true;
        }
      }
      /* A board that genuinely needs a chain outranks any board that does
         not, whatever their counts: chains are what this level is for. */
      if ((chained && !bestChained) ||
          (chained === bestChained && req > bestReq)) {
        bestReq = req; bestChained = chained; best = cand;
      }
    }
    if (best && best.wasSeeded) dealSeeds.kept = 1;
  }

  /* Nothing came back at all: the law would not lay at any count the search
     had time to try. A board with no opening is not a board — it is a board
     that can only be guessed at — so the count comes down here without a
     clock on it until a laying takes. The floors are low enough that one
     always does; the ordinary laying below is the belt to that pair of
     braces, and never yet reached. */
  if (!best && !spare) {
    let laid = structured && layByRule();
    while (!laid && easeOff()) laid = layByRule();
    /* A law can also want a shape the board has nowhere to put at the small
       end — a floret tiling holds no ring of four pentagons anywhere in it —
       so when coming down has not helped, go back up and take the first
       count that will lay. */
    while (!laid && mines + step <= n - 9) { mines += step; laid = layByRule(); }
    if (!laid) layMines(new Set());
    return handOut().list;
  }

  /* The shrink can lower `mines` on attempts after the kept one was laid,
     so the kept board carries its own count and puts it back. */
  const kept = best || spare;
  mine.set(kept.mine);
  count.set(kept.count);
  mines = kept.mines;
  keptGround = kept.seedGround || null;   // where the motif lies, for the muting
  noteBoxCounts();               // the numbers on the boxes follow the board kept
  return kept.list;
}

/* Muting happens once the board is already known to be solvable, and every
   mute is kept only if the board still solves without it — solves at the
   level's own tier, since the promise is owed to a player wielding that
   level's rules and no more. `share` is the most of the numbers a level may
   keep back: medium and hard hide a little under half; harder asks for all
   of them and keeps whatever the board can actually spare.

   Cells the board opens with are left alone: the opening is what the player
   is given to work from, and a mute there would only make the start opaque.

   Candidates go in batches against a clock. Checking one cell at a time
   costs a whole solve apiece, which the big boards cannot afford; a batch
   that fails is put back and halved, so the cost falls on the few refusals
   rather than on every cell. Asked for everything, the clock is longer and
   the deal steps out now and then so the page can say how far it has got. */
async function muteNumbers(share) {
  const my = dealToken;          // entered before the deal's first breath
  const start = [], cand = [];
  for (let i = 0; i < n; i++) {
    if (state[i] === OPEN) {
      start.push(i);
      /* The opening's own numbers are offered up too. They were held back
         for a long time, and holding them back was what let a board read
         easy however little of it was shown: the clues that give everything
         away for nothing sit in the opening, being the ones with open ground
         on every side, and none of them could ever be hidden.

         Only numbered ground is offered. A blank muted would read '?' where
         it now reads plainly empty, which takes away a true thing the player
         could see; and a muted blank does not cascade, so any reckoning that
         rebuilds the board from the cells it handed out would come back with
         less than the board actually shows. */
      if (count[i]) cand.push(i);
    }
    else if (!mine[i]) cand.push(i);
  }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
  }
  /* Two kinds of clue are offered before the rest, and a clue answering to
     both goes first of all.

     A number whose covered neighbours come to exactly its own count settles
     every one of them at a glance and asks nothing for it. On the laws whose
     mines run in thin lines across the board these are more than half of
     everything on show, and a board can spare most of them.

     And where a motif was planted, the numbers around it: a motif's
     reasoning is only needed once the cheap readings beside it are gone, and
     the cheap readings live in exactly those numbers — hiding them first is
     what turns a planted shape into a required one.

     The solvability check below is unchanged, so nothing is hidden that the
     board cannot spare. */
  const near = new Set();
  if (keptGround && keptGround.length)
    for (const c of keptGround) { near.add(c); for (const j of nbOf(c)) near.add(j); }
  const givesAll = i => {
    if (state[i] !== OPEN || !count[i]) return false;
    let cov = 0;
    for (const j of nbOf(i)) if (state[j] !== OPEN) cov++;
    return cov > 0 && cov === count[i];
  };
  const rank = i => (givesAll(i) ? 2 : 0) + (near.has(i) ? 1 : 0);
  cand.sort((a, b) => rank(b) - rank(a));

  const cap = DIFF[difficulty].tier >= 3 ? 0 : DIFF[difficulty].tier;
  const solves = () => {
    tierCap = cap;
    const known = new Uint8Array(n);
    for (const g of start) markOpen(known, g);
    const r = deduce(known) === n - mines;
    tierCap = 0;
    return r;
  };
  /* The other promise: past the first rung a board must still resist a solver
     capped one rung below it. Hiding a clue can never break that, so the
     hiding above never asks; giving one back can, so everything below does. */
  const holdsTier = () => {
    if (DIFF[difficulty].tier < 2) return true;
    tierCap = DIFF[difficulty].tier - 1;
    const known = new Uint8Array(n);
    for (const g of start) markOpen(known, g);
    const r = deduce(known) < n - mines;
    tierCap = 0;
    return r;
  };

  const target = Math.round(cand.length * share);
  const deadline = performance.now() +
    (share >= 1 ? (n > 300 ? 6000 : 2500) : (n > 300 ? 400 : 200));
  let batch = Math.max(1, target >> 3), at = 0, done = 0;
  let drew = performance.now();

  while (at < cand.length && done < target && performance.now() < deadline) {
    if (performance.now() - drew > 100) {
      drew = performance.now();
      dealNote = 'Hiding the numbers — ' + Math.round(100 * at / cand.length) + '%';
      paintStatus();
      await breath();
      dealCheck(my);
    }
    const slice = cand.slice(at, at + batch);
    for (const c of slice) muted[c] = 1;
    if (solves()) { done += slice.length; at += slice.length; }
    else {
      for (const c of slice) muted[c] = 0;
      if (batch > 1) batch >>= 1; else at++;
    }
  }

  /* Where the boxes carry numbers, those can be kept back too. There are few
     enough boxes to try one at a time, and each is kept only if the board
     still comes out without it — the same promise as before, made about a
     different kind of clue. */
  if ((boxLaw() === 'exact' || boxLaw() === 'irregular') && boxes.length) {
    const order = [...boxes.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    /* A box reading nought hands over every cell it holds before a click is
       made, and one wanting all its remaining cells does the same — so those
       are offered up first. A level that asks for a small opening was
       otherwise getting a large one through the back door: on Boxed 4 at the
       deep levels the free cells outnumbered the opening itself. Whether
       such a clue can actually go is settled as ever, by whether the board
       still comes out without it. */
    const givesAway = b => {
      let held = 0, left = 0;
      for (const c of boxes[b]) {
        if (mine[c]) held++;
        else if (state[c] !== OPEN) left++;
      }
      if (!left || !boxShown) return 0;
      const [lo, hi] = boxRange(b);
      return (held >= hi || lo - held >= left) ? left : 0;
    };
    order.sort((a2, b2) => givesAway(b2) - givesAway(a2));
    let hidden = 0;
    const most = Math.round(boxes.length * (share >= 1 ? 1 : 0.45));
    for (const b of order) {
      if (hidden >= most || performance.now() > deadline + 200) break;
      boxMuted[b] = 1;
      if (solves()) hidden++; else boxMuted[b] = 0;
    }

    /* And the same third voice offered to the boxes, where it does something
       the numbers' version cannot. A box already says its figure one of three
       ways — exactly, or at least, or at most — so nothing new is needed to
       make one speak from a single side; boxRange has always read all three.

       Two different gains here. A box that was kept back can be given its
       voice again weakly, as a hidden number is. But more to the point, a box
       reading nought hands over every cell it holds before a click is made,
       and so does one wanting all the cells it has left — and that giveaway
       is what makes a small opening on the boxed laws a fiction. Such a box
       shown as "at most one" is honest, still says something, and hands over
       nothing. So those are weakened whether or not they were hidden, and
       kept weak wherever the board still comes out. */
    if (weakenOn) {
      for (const b of order) {
        if (performance.now() > deadline + 600) break;
        /* Only the boxes still showing. A muted box gives nothing away —
           its clue is hidden — and restoring one as a bound is spare
           information in a costume, ignorable by construction. The shown
           generous ones are the quarry: the muting could not remove them,
           and weakened they stop handing their contents over. */
        const free = givesAway(b);
        if (boxMuted[b] || !free) continue;
        const wasMuted = boxMuted[b], rel = boxRel[b], val = boxShown[b];
        /* Counted from the mines, not read off the clue. Under the irregular
           law what a box shows is already one of three readings and need not
           be the figure it holds, so taking the shown value for the count
           would weaken against the wrong number. */
        let held = 0;
        for (const c of boxes[b]) if (mine[c]) held++;
        const size = boxes[b].length;
        /* Drawn from the whole of the true range, by the same hand that draws
           the irregular law's clues and the cells' — never a step off the
           count, which is the mistake that makes a bound the count in
           disguise. Two draws offered, salted apart, so a figure the board
           cannot afford is not the end of it. */
        const tries = [];
        let cov = 0;
        for (const c of boxes[b]) if (state[c] !== OPEN) cov++;
        // one draw only, for the reason given against the cells above
        const said = looseClue(b, held, cov, 0);
        if (said) tries.push(said);
        /* Both promises asked here, unlike the numbers' pass. A weakened box
           is not always less than what stood before it: under the irregular
           law the box may already have been speaking from one side, loosely,
           and a tighter bound in its place would be more information than the
           board was judged on — which could drop it to the tier below. So the
           floor is asked as well as the solving. */
        let took = false;
        for (const [r, v] of tries) {
          boxMuted[b] = 0; boxRel[b] = r; boxShown[b] = v;
          if (solves() && holdsTier()) { took = true; break; }
        }
        if (!took) { boxMuted[b] = wasMuted; boxRel[b] = rel; boxShown[b] = val; }
      }
    }
  }
}
