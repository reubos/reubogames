// Extended cuboid engine: puzzle layouts, turning rules and the scrambler.
// No DOM; runs in the browser (window.Engine) and in Node (module.exports).
//
// Coordinates: right-handed, x = right, y = up, z = front, on a doubled
// integer lattice so every 90° turn about the core's centre stays exact.
(function (root) {
'use strict';

const COLORS = { '+x':'Red','-x':'Orange','+y':'White','-y':'Yellow','+z':'Green','-z':'Blue' };
const DIRS = { '+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1] };
const I3 = [[1,0,0],[0,1,0],[0,0,1]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const matVec = (M,v) => [dot(M[0],v),dot(M[1],v),dot(M[2],v)];
const transpose = M => [0,1,2].map(i=>[M[0][i],M[1][i],M[2][i]]);
const matMul = (A,B) => { const Bt=transpose(B); return A.map(r=>Bt.map(c=>dot(r,c))); };
const vecEq = (a,b) => a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
const matEq = (A,B) => A.every((r,i)=>vecEq(r,B[i]));
const P = { x:[[1,0,0],[0,0,-1],[0,1,0]], y:[[0,0,1],[0,1,0],[-1,0,0]], z:[[0,-1,0],[1,0,0],[0,0,1]] };
const matPow = (M,e) => e===1?M:e===-1?transpose(M):matMul(M,M);
const AXIS = {R:'x',L:'x',U:'y',D:'y',F:'z',B:'z'};
const IDX = {x:0,y:1,z:2};
const POSITIVE = new Set(['R','U','F']);
const FACES = ['R','L','U','D','F','B'];
// a plain turn is clockwise seen from its face: -90° about + axes, +90° about - axes
const baseSign = f => POSITIVE.has(f)?-1:1;
const parity = v => ((v%2)+2)%2;

/* ---------- layouts ---------- */
// "3x3x3 +R +2U +F(5x4) +B(5x4,3x2)". The core W×H×D is centred on the turning
// centre; each +face adds layers outwards from the core's face. A bare face is
// a layer the size of the core's face. Sizes use W,H,D order without the
// face's own axis (U/D: W×D, R/L: H×D, F/B: W×H) and must share parity with
// the core there, which keeps every turn on the lattice.
const FACE_AXES = {U:[0,2],D:[0,2],R:[1,2],L:[1,2],F:[0,1],B:[0,1]};
const FACE_SIGN = {R:1,U:1,F:1,L:-1,D:-1,B:-1};
const FACE_ORDER = ['U','D','R','L','F','B'];
const centred = n => { const r=[]; for(let v=-(n-1);v<=n-1;v+=2) r.push(v); return r; };

function parseSpec(text){
  const toks=text.trim().replace(/×/g,'x').split(/\s+/).filter(Boolean);
  const m=(toks.shift()||'').match(/^(\d+)x(\d+)x(\d+)$/i);
  if(!m) throw new Error('Start with the core size, e.g. 3x3x3');
  const core=[+m[1],+m[2],+m[3]];
  if(core.some(n=>n<1)) throw new Error('Core sizes must be at least 1');
  const ext={}; for(const f of FACE_ORDER) ext[f]=[];
  for(const t of toks){
    const e=t.match(/^\+(\d*)([UDRLFB])(?:\(([^)]*)\))?$/i);
    if(!e) throw new Error(`Can't read "${t}" (expected e.g. +U, +2U or +F(5x4))`);
    const face=e[2].toUpperCase(), [a,b]=FACE_AXES[face], count=e[1]===''?1:+e[1];
    const sizes = e[3]===undefined ? [[core[a],core[b]]] : e[3].split(',').map(s=>{
      const q=s.trim().match(/^(\d+)x(\d+)$/i);
      if(!q) throw new Error(`Can't read the size "${s}" in "${t}"`);
      return [+q[1],+q[2]];
    });
    if(e[1]!=='' && sizes.length>1) throw new Error(`"${t}": give a count or a list of sizes, not both`);
    for(const [p,q] of sizes){
      if(p<1 || q<1) throw new Error(`"${t}": layer sizes must be at least 1`);
      if(p%2!==core[a]%2 || q%2!==core[b]%2)
        throw new Error(`"${t}": a ${p}x${q} layer doesn't match the parity of the core's ${core[a]}x${core[b]} ${face} face`);
    }
    for(let i=0;i<count;i++) ext[face].push(...sizes);
  }
  return {core, ext};
}

function formatSpec({core,ext}){
  let s=core.join('x');
  for(const f of FACE_ORDER){
    const L=ext[f]; if(!L.length) continue;
    const [a,b]=FACE_AXES[f];
    if(L.every(([p,q])=>p===core[a]&&q===core[b])) s+=` +${L.length>1?L.length:''}${f}`;
    else if(L.every(([p,q])=>p===L[0][0]&&q===L[0][1])) s+=` +${L.length>1?L.length:''}${f}(${L[0].join('x')})`;
    else s+=` +${f}(${L.map(l=>l.join('x')).join(',')})`;
  }
  return s;
}

function shapePositions({core,ext}){
  const map=new Map(), add=p=>map.set(p.join(','),p);
  for(const x of centred(core[0])) for(const y of centred(core[1])) for(const z of centred(core[2])) add([x,y,z]);
  for(const f of FACE_ORDER){
    const k=IDX[AXIS[f]], [a,b]=FACE_AXES[f];
    ext[f].forEach(([p,q],i)=>{
      const c=FACE_SIGN[f]*((core[k]-1)+2*(i+1));
      for(const u of centred(p)) for(const v of centred(q)){ const pos=[0,0,0]; pos[k]=c; pos[a]=u; pos[b]=v; add(pos); }
    });
  }
  return [...map.values()];
}

/* ---------- boxes: per-axis [lo,hi] bounds on the doubled lattice ---------- */
const boundingBox = ps => [0,1,2].map(k=>[Math.min(...ps.map(p=>p[k])), Math.max(...ps.map(p=>p[k]))]);
// The solved puzzle's layer grid: on each axis, the core's layers plus the
// layers stacked on its two faces. Oversized layers can overhang this grid
// (3x3x3 +D(5x5) +L(5x5) +B(5x5) is a 4x4x4 grid with an overhanging fringe);
// those pieces aren't a layer of their own and attach to the one they touch.
function layerGrid({core,ext}){
  const neg=['L','D','B'], pos=['R','U','F'];
  return core.map((n,k)=>[-(n-1)-2*ext[neg[k]].length, (n-1)+2*ext[pos[k]].length]);
}
const boxSize = b => b.map(([lo,hi])=>(hi-lo)/2+1);
const inBox = (p,b) => p.every((v,k)=>v>=b[k][0] && v<=b[k][1]);
const boxEq = (a,b) => a.every((r,k)=>r[0]===b[k][0] && r[1]===b[k][1]);
const boxKey = b => b.map(r=>r.join(':')).join('|');
const clampToBox = (p,b) => p.map((v,k)=>Math.max(b[k][0],Math.min(b[k][1],v)));

// every exposed side of the solved shape is stickered in that direction's colour
function buildSolved(shape){
  const occ=new Set(shape.map(p=>p.join(',')));
  return shape.map(p=>{
    const st={};
    for(const [dir,n] of Object.entries(DIRS))
      if(!occ.has([p[0]+2*n[0],p[1]+2*n[1],p[2]+2*n[2]].join(','))) st[dir]=COLORS[dir];
    return {home:[...p],pos:[...p],ori:I3,fc:[...p],stickers:st};
  });
}

// Name the solved shape's positions inside `box` in layout notation, checking
// the name rebuilds exactly those positions; null if it can't be written so.
function describeBox(spec, shape, box){
  const S=shape.filter(p=>inBox(p,box)), key=ps=>ps.map(p=>p.join(',')).sort().join('|');
  const core=spec.core.map((n,k)=>{
    const lo=Math.max(-(n-1),box[k][0]), hi=Math.min(n-1,box[k][1]);
    return lo===-hi ? hi+1 : null;
  });
  if(core.includes(null)) return null;
  const ext={};
  for(const f of FACE_ORDER){
    ext[f]=[];
    const k=IDX[AXIS[f]], [a,b]=FACE_AXES[f];
    for(let i=1;;i++){
      const c=FACE_SIGN[f]*((core[k]-1)+2*i), L=S.filter(p=>p[k]===c);
      if(!L.length) break;
      const [ra,rb]=[a,b].map(ax=>[Math.min(...L.map(p=>p[ax])), Math.max(...L.map(p=>p[ax]))]);
      if(ra[0]!==-ra[1] || rb[0]!==-rb[1]) return null;
      ext[f].push([ra[1]+1, rb[1]+1]);
    }
  }
  const named={core,ext};
  return key(shapePositions(named))===key(S) ? formatSpec(named) : null;
}

/* ---------- moves ---------- */
function parseMove(m){
  const x=m.match(/^(\d+)?([RLUDFB])(w?)(2|')?$/);
  if(!x) throw new Error('bad move: '+m);
  return {layer:x[1]?+x[1]:1,face:x[2],wide:x[3]==='w',mod:x[4]||''};
}
const moveStr = (face,layer,mod,wide) => (layer>1?String(layer):'')+face+(wide&&layer>1?'w':'')+mod;
const formatMove = mv => moveStr(mv.face,mv.layer,mv.mod,mv.wide);

// functional layers grabbed by a move: bandaged layers share an fc value
function selectCoords(cubies,mv){
  const {face,layer,wide}=mv;
  const k=IDX[AXIS[face]], pos=POSITIVE.has(face);
  const coords=[...new Set(cubies.map(c=>c.fc[k]))].sort((a,b)=>pos?b-a:a-b);
  return new Set(wide?coords.slice(0,layer):[coords[layer-1]]);
}
function applyMove(cubies,mv){
  const ax=AXIS[mv.face], k=IDX[ax];
  const sel=selectCoords(cubies,mv);
  const sign=baseSign(mv.face), exp=mv.mod==='2'?2:mv.mod==="'"?-sign:sign, R=matPow(P[ax],exp);
  for(const c of cubies){
    if(!sel.has(c.fc[k])) continue;
    c.pos=matVec(R,c.pos); c.ori=matMul(R,c.ori); c.fc=matVec(R,c.fc);
  }
}
function worldStickers(c){
  const out={}, oriT=transpose(c.ori);
  for(const [key,wv] of Object.entries(DIRS)){
    const lv=matVec(oriT,wv);
    const lk=Object.keys(DIRS).find(kk=>vecEq(DIRS[kk],lv));
    if(c.stickers[lk]) out[key]=c.stickers[lk];
  }
  return out;
}

/* ---------- reduction phases ---------- */
// As in cuboid-scrambler. `eff` is the current phase's box; pieces' functional
// coords are clamped into it. What matters for a turn is the cross-section of
// the layer actually being turned (in functional coords). A quarter turn keeps
// the phase if that cross-section is a square centred on the turning axis;
// otherwise, if both sides share parity, it starts a new phase: those two sides
// of the box shrink to the largest centred square inside the cross-section, so
// the outer layers bandage onto the outermost remaining one before the turn is
// applied. On a plain cuboid this is the scrambler's "larger side reduces to
// the smaller". A half turn only needs each side centred, so it never reduces a
// plain cuboid, but an I-cube's R2 trims each side to its largest centred range.
function crossSection(members,a){
  return [Math.min(...members.map(c=>c.fc[a])), Math.max(...members.map(c=>c.fc[a]))];
}
function effAfterQuarterTurn(eff,k,members){
  const [i,j]=[0,1,2].filter(a=>a!==k);
  const [li,hi]=crossSection(members,i), [lj,hj]=crossSection(members,j);
  if(li===-hi && lj===-hj && hi===hj) return eff;
  const r=Math.min(hi,-li,hj,-lj);
  if(boxSize(eff)[k]<2 || r<1 || parity(hi)!==parity(hj)) return null;
  const nb=eff.map(x=>[...x]);
  nb[i]=[-r,r]; nb[j]=[-r,r];
  return nb;
}
function effAfterHalfTurn(eff,k,members){
  const sides=[0,1,2].filter(a=>a!==k).map(a=>[a,crossSection(members,a)]);
  if(sides.every(([,[l,h]])=>l===-h)) return eff;
  const nb=eff.map(x=>[...x]);
  for(const [a,[l,h]] of sides) if(l!==-h){ const r=Math.min(h,-l); nb[a]=[-r,r]; }
  return nb;
}

class Puzzle {
  constructor(spec){
    this.spec = typeof spec==='string' ? parseSpec(spec) : spec;
    this.shape = shapePositions(this.spec);   // solved positions
    this.fullBox = layerGrid(this.spec);      // the unreduced phase's box
    this.reset();
  }
  reset(){
    this.cubies = buildSolved(this.shape);
    this.eff = this.fullBox;
    this.phaseStack = [];   // boxes of the phases left behind, oldest first
    for(const c of this.cubies) c.fc=clampToBox(c.pos,this.eff);
  }
  // Cubie arrays and boxes are only ever replaced, never mutated in place, so
  // a shallow copy of each cubie is a full copy.
  clone(){
    const q=Object.create(Puzzle.prototype);
    q.spec=this.spec; q.shape=this.shape; q.fullBox=this.fullBox;
    q.cubies=this.cubies.map(c=>({home:c.home,stickers:c.stickers,pos:c.pos,ori:c.ori,fc:c.fc}));
    q.eff=this.eff; q.phaseStack=[...this.phaseStack];
    return q;
  }
  layerCount(k){ return new Set(this.cubies.map(c=>c.fc[k])).size; }
  // the fc values a move would turn, or null if it names no layer or would
  // turn every piece (a whole-puzzle rotation, e.g. U once a 1-layer core has
  // bandaged all its tiers together)
  selection(mv){
    const k=IDX[AXIS[mv.face]];
    if(mv.layer<1 || (!mv.wide && mv.layer>this.layerCount(k))) return null;
    const fcs=selectCoords(this.cubies,mv);
    if(this.cubies.every(c=>fcs.has(c.fc[k]))) return null;
    return {axK:k, fcs};
  }
  // the phase box after `mv` (=== this.eff when it keeps the phase), or null if
  // the move can't be made
  effAfter(mv){
    const s=this.selection(mv);
    if(!s) return null;
    const members=this.cubies.filter(c=>s.fcs.has(c.fc[s.axK]));
    return mv.mod==='2' ? effAfterHalfTurn(this.eff,s.axK,members) : effAfterQuarterTurn(this.eff,s.axK,members);
  }
  move(mv){
    if(typeof mv==='string') mv=parseMove(mv);
    const ne=this.effAfter(mv);
    if(!ne) return false;
    // a reduction never changes the turning axis's range, so the same layer is
    // still selected after coarsening
    if(ne!==this.eff) this.phaseStack.push(this.eff);
    this.eff=ne;
    for(const c of this.cubies) c.fc=clampToBox(c.fc,this.eff);
    applyMove(this.cubies,mv);
    for(const c of this.cubies) c.fc=clampToBox(c.fc,this.eff);
    this.undoReductions();
    return true;
  }
  // An earlier phase is turnable again once every position the solved shape
  // has inside its box is filled (for a cuboid: the sub-cuboid is intact).
  // Pieces outside the box attach to the layer they touch. The earliest wins.
  undoReductions(){
    if(!this.phaseStack.length) return;
    const occ=new Set(this.cubies.map(c=>c.pos.join(',')));
    for(let i=0;i<this.phaseStack.length;i++){
      const e=this.phaseStack[i];
      if(!this.shape.every(p=>!inBox(p,e) || occ.has(p.join(',')))) continue;
      this.eff=e;
      this.phaseStack.length=i;
      for(const c of this.cubies) c.fc=clampToBox(c.pos,e);
      return;
    }
  }
  isSolved(){ return this.cubies.every(c=>vecEq(c.pos,c.home)&&matEq(c.ori,I3)); }
  isReduced(){ return !boxEq(this.eff,this.fullBox); }
  // Layers a face can name: up to half the axis, as on an N×N×N, where a middle
  // slice is equivalent to the two outer layers plus a rotation. On an
  // off-centre axis (a Triangle Prism's base-to-apex) that equivalence fails,
  // so the middle layer is reachable too.
  maxLayers(face){
    const k=IDX[AXIS[face]], n=boxSize(this.eff)[k];
    return this.offCentre(k) ? Math.ceil(n/2) : Math.floor(n/2);
  }
  offCentre(k){ return this.eff[k][0]!==-this.eff[k][1]; }
  boxName(box=this.eff){
    if(boxEq(box,this.fullBox)) return formatSpec(this.spec);
    return describeBox(this.spec,this.shape,box) || boxSize(box).join('x')+' box';
  }
}

/* ---------- scrambler ---------- */
// Reductions are introduced deliberately, one per phase, along the order that
// gives the most phases. Every other move must keep the phase exactly as it is:
// no extra reduction and no accidental undo of an earlier one.

function candidateMoves(p, wide){
  const out=[];
  for(const face of FACES){
    const k=IDX[AXIS[face]], n=boxSize(p.eff)[k];
    // an off-centre odd axis adds its middle layer, offered from one face only
    const max = p.offCentre(k) && n%2===1 && !POSITIVE.has(face) ? Math.floor(n/2) : p.maxLayers(face);
    for(let l=1;l<=max;l++) for(const mod of ['',"'",'2']) out.push({face,layer:l,mod,wide:wide&&l>1});
  }
  return out;
}

// moves that start exactly one new phase and aren't undone by themselves
// (e.g. on a 3x5x7, L R' F2 R F' reduces for the F' and is whole again after);
// one representative state per resulting box
function reductionsFrom(p, wide, allMoves){
  const found=new Map();
  for(const mv of allMoves){
    const ne=p.effAfter(mv);
    if(!ne || ne===p.eff) continue;
    const key=boxKey(ne);
    const q=p.clone(); q.move(mv);
    if(q.phaseStack.length!==p.phaseStack.length+1 || !boxEq(q.eff,ne)) continue;
    if(!found.has(key)) found.set(key,{box:ne, state:q, moves:[]});
    found.get(key).moves.push(mv);
  }
  return [...found.values()];
}

// all moves a reduction can be triggered with: every layer on every face, not
// just the outer half, since e.g. a T-cube's 2D reduces
function triggerMoves(p, wide){
  const out=[];
  for(const face of FACES){
    const n=p.layerCount(IDX[AXIS[face]]);
    for(let l=1;l<=n;l++) for(const mod of ['',"'",'2']) out.push({face,layer:l,mod,wide:wide&&l>1});
  }
  return out;
}

// Sequence of phase boxes to reduce through from p: the most phases that
// actually get scrambled (skipped single-axis phases don't count), then the
// most phases overall, ties broken at random.
function planPhases(p, wide, rng=Math.random){
  return planFrom(p,wide,rng,new Map()).path;
}
function planFrom(p, wide, rng, memo){
  const key=boxKey(p.eff);
  if(memo.has(key)) return memo.get(key);
  memo.set(key,{path:[],score:0});   // guards against cycles while searching
  let best={path:[],score:0}, ties=0;
  for(const r of reductionsFrom(p,wide,triggerMoves(p,wide))){
    const sub=planFrom(r.state,wide,rng,memo);
    const axes=phaseAxes(r.state,wide), isLast=!sub.path.length;
    const cand={path:[r.box,...sub.path], score:sub.score+(!skipsPhase(axes,isLast) && axes.size>0 ? 1 : 0)};
    const better = cand.score>best.score || (cand.score===best.score && cand.path.length>best.path.length);
    const tie = cand.score===best.score && cand.path.length===best.path.length;
    if(better){ best=cand; ties=1; }
    else if(tie && rng()<1/(++ties)) best=cand;
  }
  memo.set(key,best);
  return best;
}

// Does `mv` leave the phase exactly as it is? Only an undo can change it once
// effAfter says the box is kept, and that needs an earlier phase to exist.
function keepsPhase(p, mv){
  if(p.effAfter(mv)!==p.eff) return false;
  if(!p.phaseStack.length) return true;
  const q=p.clone(); q.move(mv);
  return q.phaseStack.length===p.phaseStack.length;
}

// can anything be turned in p's phase without leaving it?
function phaseHasMoves(p, wide){
  return candidateMoves(p,wide).some(mv=>keepsPhase(p,mv));
}
// the axes p's phase can turn about without leaving it
function phaseAxes(p, wide){
  return new Set(candidateMoves(p,wide).filter(mv=>keepsPhase(p,mv)).map(mv=>AXIS[mv.face]));
}
// A phase that can only turn about one axis (or none) adds little but the
// relative angle of its layers, so the scrambler goes straight on to the next
// reduction -- unless it's the last phase, which still gets its moves.
const skipsPhase = (axes, isLast) => !isLast && axes.size<=1;

// How each planned phase will be treated: {box, axes, skipped} per phase,
// found by walking the plan's reductions from a solved puzzle.
function phaseSummary(spec, plan, wide){
  const p=new Puzzle(spec), out=[];
  for(let i=0;i<=plan.length;i++){
    const axes=phaseAxes(p,wide);
    out.push({box:p.eff, axes:axes.size, skipped:skipsPhase(axes,i===plan.length)});
    if(i===plan.length) break;
    const r=reductionsFrom(p,wide,triggerMoves(p,wide)).find(r=>boxEq(r.box,plan[i]));
    if(!r) break;
    p.move(r.moves[0]);
  }
  return out;
}

// Efficient mode: on an axis the next phase narrows, only the layers about to
// lose their independence (outside the next box) are worth scrambling now.
function efficientFilter(p, nextBox){
  const narrowing=[0,1,2].filter(k=>nextBox[k][0]>p.eff[k][0] || nextBox[k][1]<p.eff[k][1]);
  if(!narrowing.length) return null;
  return mv=>{
    const k=IDX[AXIS[mv.face]];
    if(!narrowing.includes(k)) return true;
    const pos=POSITIVE.has(mv.face);
    const coords=[...new Set(p.cubies.map(c=>c.fc[k]))].sort((a,b)=>pos?b-a:a-b);
    const v=coords[mv.layer-1];
    return v<nextBox[k][0] || v>nextBox[k][1];
  };
}

// Same blocking as cuboid-scrambler: within a run of moves on one axis, don't
// repeat a face+layer; with only one axis available, just not twice in a row.
function makeBlocker(){
  const s={axis:null, blocked:new Set(), last:null};
  return {
    allows(mv, singleAxis){
      const id=mv.face+':'+mv.layer;
      return singleAxis ? s.last!==id : !(AXIS[mv.face]===s.axis && s.blocked.has(id));
    },
    record(mv){
      const id=mv.face+':'+mv.layer, ax=AXIS[mv.face];
      if(ax!==s.axis) s.blocked=new Set();
      s.blocked.add(id); s.axis=ax; s.last=id;
    },
  };
}

// opts: movesPerPhase (array, last value repeats), wide, efficient, rng, and
// plan (boxes from planPhases, so a UI can label phases before generating)
function generateScramble(spec, opts={}){
  const rng=opts.rng||Math.random, wide=opts.wide!==false, perPhase=opts.movesPerPhase||[20];
  const p=new Puzzle(spec);
  let plan=opts.plan ? [...opts.plan] : planPhases(p.clone(),wide,rng);
  const phases=[], blocker=makeBlocker();
  for(let i=0;;i++){
    const n=perPhase[Math.min(i,perPhase.length-1)];
    const moves=[];
    if(i>0){
      if(!plan.length) break;
      // reach the planned phase; re-plan if this state can't (state-dependent)
      let opts2=reductionsFrom(p,wide,triggerMoves(p,wide)).filter(r=>boxEq(r.box,plan[0]));
      if(!opts2.length){
        plan=planPhases(p.clone(),wide,rng);
        if(!plan.length) break;
        opts2=reductionsFrom(p,wide,triggerMoves(p,wide)).filter(r=>boxEq(r.box,plan[0]));
      }
      // prefer a move within the outer half, as the rest of the scramble uses
      const all=opts2.flatMap(r=>r.moves), usual=all.filter(m=>m.layer<=p.maxLayers(m.face));
      const from=usual.length?usual:all, mv=from[Math.floor(rng()*from.length)];
      p.move(mv); blocker.record(mv); moves.push(formatMove(mv));
      plan=plan.slice(1);
    }
    const pool=candidateMoves(p,wide);
    // count only the axes this phase can actually turn: a 3x3x3 +D phase of an
    // off-centre puzzle may allow U/D turns alone, and is then single-axis
    const axes=phaseAxes(p,wide), singleAxis=axes.size===1;
    const skipped=skipsPhase(axes,!plan.length);
    let usable=pool;
    if(opts.efficient && plan.length){
      const f=efficientFilter(p,plan[0]), restricted=f && pool.filter(f);
      if(restricted && restricted.length && restricted.length<pool.length) usable=restricted;
    }
    const firstKeeping=list=>{
      const order=list.slice();
      while(order.length){
        const mv=order.splice(Math.floor(rng()*order.length),1)[0];
        if(keepsPhase(p,mv)) return mv;
      }
      return null;
    };
    while(!skipped && moves.length<n){
      // prefer unblocked moves; if none keeps the phase, allow a blocked one
      // rather than ending the phase early, but never the same layer twice running
      const allowed=usable.filter(m=>blocker.allows(m,singleAxis));
      const picked=firstKeeping(allowed) ||
        firstKeeping(usable.filter(m=>!blocker.allows(m,singleAxis) && blocker.allows(m,true)));
      if(!picked) break;
      p.move(picked); blocker.record(picked); moves.push(formatMove(picked));
    }
    // a skipped first phase contributes no moves of its own; a skipped later
    // one is just the move that reduces into it
    if(moves.length) phases.push({box:p.eff, name:p.boxName(), moves, opensWithReduction:i>0, skipped});
    if(!plan.length) break;
  }
  return {phases, moves:phases.flatMap(ph=>ph.moves), final:p};
}

const Engine = {
  COLORS, DIRS, I3, AXIS, IDX, POSITIVE, FACES, FACE_ORDER,
  matVec, transpose, matMul, vecEq,
  parseSpec, formatSpec, shapePositions, buildSolved, describeBox,
  boundingBox, layerGrid, boxSize, inBox, boxEq, boxKey, clampToBox,
  parseMove, moveStr, formatMove, selectCoords, applyMove, worldStickers,
  Puzzle, planPhases, generateScramble, keepsPhase, phaseHasMoves, phaseSummary,
};
if(typeof module!=='undefined' && module.exports) module.exports=Engine;
else root.Engine=Engine;
})(typeof window!=='undefined' ? window : globalThis);
