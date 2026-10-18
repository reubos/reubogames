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

// Spacing is forgiving wherever the meaning is still clear: "3 x 3 x 3",
// "3x3x3+R+L", "3x3x3RL", "+ 2 U", "+F( 5x4 , 3x2 )" all read as expected.
function parseSpec(text){
  const s=text.replace(/×/g,'x');
  const m=/^\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i.exec(s);
  if(!m) throw new Error('Start with the core size, e.g. 3x3x3');
  const core=[+m[1],+m[2],+m[3]];
  if(core.some(n=>n<1)) throw new Error('Core sizes must be at least 1');
  const ext={}; for(const f of FACE_ORDER) ext[f]=[];
  // each extension: an optional "+", an optional count, a face, optional sizes
  const item=/^[\s+]*(\d*)\s*([UDRLFB])\s*(?:\(([^)]*)\))?/i;
  let rest=s.slice(m[0].length);
  while(rest.trim()){
    const e=item.exec(rest);
    if(!e){
      const at=rest.trim();
      throw new Error(`Can't read "${at.length>14 ? at.slice(0,14)+'…' : at}" (expected e.g. +U, +2U or +F(5x4))`);
    }
    rest=rest.slice(e[0].length);
    const t=e[0].replace(/\s+/g,'').replace(/^\+*/,'+');
    const face=e[2].toUpperCase(), [a,b]=FACE_AXES[face], count=e[1]===''?1:+e[1];
    const sizes = e[3]===undefined ? [[core[a],core[b]]] : e[3].split(',').map(s=>{
      const q=s.trim().match(/^(\d+)\s*x\s*(\d+)$/i);
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
const boxSize = b => b.map(([lo,hi])=>(hi-lo)/2+1);
const inBox = (p,b) => p.every((v,k)=>v>=b[k][0] && v<=b[k][1]);
const boxEq = (a,b) => a.every((r,k)=>r[0]===b[k][0] && r[1]===b[k][1]);
const boxKey = b => b.map(r=>r.join(':')).join('|');

// every exposed side of the solved shape is stickered in that direction's colour
function buildSolved(shape){
  const occ=new Set(shape.map(p=>p.join(',')));
  return shape.map(p=>{
    const st={};
    for(const [dir,n] of Object.entries(DIRS))
      if(!occ.has([p[0]+2*n[0],p[1]+2*n[1],p[2]+2*n[2]].join(','))) st[dir]=COLORS[dir];
    return {home:[...p],pos:[...p],ori:I3,stickers:st};
  });
}

// Name a set of positions in layout notation, choosing whichever core gives
// the shortest name that rebuilds exactly those positions (e.g. "3x3x3" rather
// than "3x1x3 +U +D"); null if no core can describe them.
const positionsKey = ps => ps.map(p=>p.join(',')).sort().join('|');
const nameSizes = name => (name.match(/\d+x\d+(?=[,)])/g)||[]).length;
const nameScore = name => (name.match(/\+/g)||[]).length + nameSizes(name);
function nameShape(S){
  if(!S.length) return null;
  const occ=new Set(S.map(p=>p.join(','))), key=positionsKey(S), bb=boundingBox(S);
  // core sizes per axis: centred, matching the lattice's parity, inside the shape
  const sizes=[0,1,2].map(k=>{
    const out=[], max=Math.min(-bb[k][0],bb[k][1]);
    for(let h=parity(S[0][k]); h<=max; h+=2) out.push(h+1);
    return out;
  });
  let best=null;
  for(const a of sizes[0]) for(const b of sizes[1]) for(const c of sizes[2]){
    const core=[a,b,c];
    if(!centred(a).every(x=>centred(b).every(y=>centred(c).every(z=>occ.has(x+','+y+','+z))))) continue;
    const spec=describeWithCore(S,key,core);
    if(!spec) continue;
    // shortest name; then bare faces over written sizes; then the larger core
    const name=formatSpec(spec), cand={name, score:nameScore(name), sizes:nameSizes(name), vol:a*b*c};
    if(!best || cand.score<best.score || (cand.score===best.score &&
       (cand.sizes<best.sizes || (cand.sizes===best.sizes && cand.vol>best.vol)))) best=cand;
  }
  return best && best.name;
}
// S written as `core` plus a centred rectangle per layer on each face, if that
// rebuilds exactly S
function describeWithCore(S, key, core){
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
  return positionsKey(shapePositions(named))===key ? named : null;
}

/* ---------- moves ---------- */
function parseMove(m){
  const x=m.match(/^(\d+)?([RLUDFB])(w?)(2|')?$/);
  if(!x) throw new Error('bad move: '+m);
  return {layer:x[1]?+x[1]:1,face:x[2],wide:x[3]==='w',mod:x[4]||''};
}
const moveStr = (face,layer,mod,wide) => (layer>1?String(layer):'')+face+(wide&&layer>1?'w':'')+mod;

// Typed sequences. Moves with or without spaces or commas (R U R' U', RUR'U'),
// any prime mark (' ’ ′), R2' read as R2, Rw as the usual two-layer 2Rw, and
// brackets with a repeat count, nestable: (R U)3, ((R U)2 F)3. A ' after a
// bracket inverts it: (R U)' is U' R'. Throws with where reading failed.
const MAX_SEQUENCE = 10000;
const invertMove = m => m.endsWith("'") ? m.slice(0,-1) : m.endsWith('2') ? m : m+"'";
function parseSequence(text){
  const s=text.replace(/[’′`´]/g,"'");
  let i=0;
  const fail=msg=>{ const at=s.slice(i).trim(); throw new Error(at ? `${msg} at "${at.slice(0,12)}"` : `${msg} at the end`); };
  const skip=()=>{ while(i<s.length && /[\s,]/.test(s[i])) i++; };
  function seq(depth){
    const out=[];
    for(;;){
      skip();
      if(i>=s.length){ if(depth) fail('Missing )'); return out; }
      if(s[i]===')'){ if(!depth) fail('Unmatched )'); i++; return out; }
      let part;
      if(s[i]==='('){
        i++;
        part=seq(depth+1);
        // after the bracket, spaces are fine before a ' or a count, as long as
        // the digits aren't the start of the next move: "(R U) 3" vs "(R U) 3R"
        const prime=/^\s*'/.exec(s.slice(i));
        if(prime){ i+=prime[0].length; part=part.slice().reverse().map(invertMove); }
        const n=/^\s*(\d+)(?![RLUDFBw])/i.exec(s.slice(i));
        if(n){ i+=n[0].length; if(+n[1]<1) fail('Repeat count must be at least 1'); }
        const times=n ? +n[1] : 1;
        if(out.length+part.length*times>MAX_SEQUENCE) fail(`More than ${MAX_SEQUENCE} moves`);
        for(let k=0;k<times;k++) out.push(...part);
        continue;
      }
      const m=/^(\d*)([RLUDFB])(w?)(2'|2|')?/.exec(s.slice(i));
      if(!m) fail("Can't read a move");
      if(m[1]!=='' && +m[1]<1) fail('Layer numbers start at 1');
      const wide=m[3]==='w', layer=m[1]!=='' ? +m[1] : wide ? 2 : 1;
      i+=m[0].length;
      let mod = m[4]===undefined ? '' : m[4]==="'" ? "'" : '2';
      // a prime after a space still belongs to the move: "R '" is R'
      const lone=mod==='' && /^\s+'/.exec(s.slice(i));
      if(lone){ i+=lone[0].length; mod="'"; }
      out.push(moveStr(m[2], layer, mod, wide));
      if(out.length>MAX_SEQUENCE) fail(`More than ${MAX_SEQUENCE} moves`);
    }
  }
  return seq(0);
}
const formatMove = mv => moveStr(mv.face,mv.layer,mv.mod,mv.wide);

function moveRotation(mv){
  const sign=baseSign(mv.face), exp=mv.mod==='2'?2:mv.mod==="'"?-sign:sign;
  return matPow(P[AXIS[mv.face]],exp);
}
// For animating: the axis index and the signed angle (radians) to sweep about
// it, right-handed. A half turn sweeps the face's clockwise way.
function moveSweep(mv){
  const sign=baseSign(mv.face), quarters=mv.mod==='2'?2*sign:mv.mod==="'"?-sign:sign;
  return {axK:IDX[AXIS[mv.face]], angle:quarters*Math.PI/2};
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

/* ---------- physical pieces ---------- */
// Turning is decided by the position alone, as on the real puzzle, which
// behaves like a bigger cube puzzle with some layers bandaged together (pCubes
// models its cuboids this way). Every axis is cut on one shared grid: the
// lattice midpoints of the puzzle's bounding cube, so wherever pieces end up
// after shapeshifting there is a cut between them. A cut is blocked when a
// piece's body crosses it, and the layers either side then turn as one.
//
// A piece's body is its own cell, except that a stickered core piece on a
// core face with nothing stacked on it reaches outward past the bounding cube
// through that face. On a 3x5x7 the pieces of the short faces stand in for the
// missing 7x7x7 layers; on an X-cube, the F/B core pieces that a 2U carries
// round to the R side stop the R extension turning on its own. Extension
// pieces are single cells. Unstickered pieces never block (pCubes and the
// physical puzzles have nothing there); they just move with their layer.
const FACE_OF_DIR = {'+x':'R','-x':'L','+y':'U','-y':'D','+z':'F','-z':'B'};
function pieceBody(c, spec, reach){
  if(!Object.keys(c.stickers).length) return null;
  const box=c.home.map(v=>[v-1,v+1]);
  if(!c.home.every((v,k)=>Math.abs(v)<=spec.core[k]-1)) return box;
  // a core piece's sticker is on the core's own face that way (both ways on
  // a one-layer core, like the Triangle Prism's 5x1x5 base)
  for(const d of Object.keys(c.stickers)){
    const n=DIRS[d], k=n.findIndex(x=>x!==0), s=n[k];
    if(spec.ext[FACE_OF_DIR[d]].length) continue;
    box[k] = s>0 ? [box[k][0], reach] : [-reach, box[k][1]];
  }
  return box;
}
// a body carried along by a turn (R is a signed permutation matrix)
function rotateBody(R, b){
  return [0,1,2].map(r=>{ const c=[0,1,2].find(j=>R[r][j]!==0);
    return R[r][c]>0 ? b[c] : [-b[c][1],-b[c][0]]; });
}

// The 24 rotations of the whole puzzle about its centre, identity first.
const ROTATIONS = (()=>{
  const out=[I3];
  const perms=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for(const pm of perms) for(const s of [[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]]){
    const M=[0,1,2].map(r=>[0,1,2].map(c=>c===pm[r]?s[r]:0));
    const det=M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])-M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])+M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]);
    if(det===1 && !matEq(M,I3)) out.push(M);
  }
  return out;
})();
const frameKey = M => M.flat().join(',');

// A layout turned by a whole-puzzle rotation: the core's sizes move to their
// new axes and each face's stack moves to the face it now points at, so
// "3x3x3 +U +R" turned upside down is "3x3x3 +D +R".
function rotateSpec(spec, M){
  const NAME={'0,1':'R','0,-1':'L','1,1':'U','1,-1':'D','2,1':'F','2,-1':'B'};
  const newAxis=k=>[0,1,2].find(r=>M[r][k]!==0);
  const core=[0,0,0];
  for(let k=0;k<3;k++) core[newAxis(k)]=spec.core[k];
  const ext={}; for(const f of FACE_ORDER) ext[f]=[];
  for(const f of FACE_ORDER){
    const k=IDX[AXIS[f]], r=newAxis(k), to=NAME[r+','+FACE_SIGN[f]*M[r][k]];
    const [a]=FACE_AXES[f], [A]=FACE_AXES[to];
    // sizes are written in W,H,D order without the face's axis: keep each
    // size with its axis as the axes move
    ext[to]=spec.ext[f].map(([p,q])=> newAxis(a)===A ? [p,q] : [q,p]);
  }
  return {core, ext};
}

class Puzzle {
  constructor(spec){
    this.spec = typeof spec==='string' ? parseSpec(spec) : spec;
    this.shape = shapePositions(this.spec);   // solved positions
    const M=Math.max(...this.shape.flatMap(p=>p.map(Math.abs)));
    this.reach = M+3;   // past the bounding cube
    // cuts on each axis: between lattice cells, which keep the core's parity
    this.cuts = this.spec.core.map(n=>{ const out=[]; for(let q=-M;q<=M;q++) if(parity(q)===n%2) out.push(q); return out; });
    this.shared = {frames:new Map(), names:new Map()};   // caches, same for clones
    this.reset();
    this.startTotal = this.totalLayers();
  }
  reset(){
    this.cubies = buildSolved(this.shape);
    for(const c of this.cubies) c.body=pieceBody(c,this.spec,this.reach);
    this.regroup();
  }
  // Cubie arrays and bodies are only ever replaced, never mutated in place,
  // so a shallow copy of each cubie is a full copy.
  clone(){
    const q=Object.create(Puzzle.prototype);
    q.spec=this.spec; q.shape=this.shape; q.reach=this.reach; q.cuts=this.cuts;
    q.shared=this.shared; q.startTotal=this.startTotal;
    q.cubies=this.cubies.map(c=>({home:c.home,stickers:c.stickers,pos:c.pos,ori:c.ori,fc:c.fc,body:c.body}));
    return q;
  }
  // fc[k]: which turnable layer a piece is in along axis k, counted upwards as
  // the number of open cuts below it, so pieces sharing a value turn together
  regroup(){
    const open=this.cuts.map((qs,k)=>qs.filter(q=>!this.cubies.some(c=>c.body && c.body[k][0]<q && q<c.body[k][1])));
    for(const c of this.cubies) c.fc=[0,1,2].map(k=>open[k].filter(q=>q<c.pos[k]).length);
  }
  layerCount(k){ return new Set(this.cubies.map(c=>c.fc[k])).size; }
  layerCounts(){ return [0,1,2].map(k=>this.layerCount(k)); }
  totalLayers(){ return this.layerCounts().reduce((a,b)=>a+b,0); }
  // the fc values a move would turn, or null if it names no layer or would
  // turn every piece (a whole-puzzle rotation)
  selection(mv){
    const k=IDX[AXIS[mv.face]], pos=POSITIVE.has(mv.face);
    const coords=[...new Set(this.cubies.map(c=>c.fc[k]))].sort((a,b)=>pos?b-a:a-b);
    if(mv.layer<1 || (!mv.wide && mv.layer>coords.length)) return null;
    const fcs=new Set(mv.wide?coords.slice(0,mv.layer):[coords[mv.layer-1]]);
    if(this.cubies.every(c=>fcs.has(c.fc[k]))) return null;
    return {axK:k, fcs};
  }
  // A half turn always fits. A quarter turn needs the two crossing axes to
  // share a parity (R on a 3x3x4 would take its layers off the lattice), and,
  // as in cuboid-scrambler, a layer at least 2x2 around the axis to turn on (a
  // 3x3x1's 1x3 side bar only half-turns), unless the turn leaves every piece
  // on a cell the layer already filled (a Pyramid's single top piece).
  canMove(mv){
    const s=this.selection(mv);
    if(!s) return false;
    if(mv.mod==='2') return true;
    const [a,b]=[0,1,2].filter(j=>j!==s.axK);
    if(this.spec.core[a]%2!==this.spec.core[b]%2) return false;
    const members=this.cubies.filter(c=>s.fcs.has(c.fc[s.axK]));
    const at=new Set(members.map(c=>c.pos[a]+','+c.pos[b]));
    const around=this.spec.core[a]%2 ? [-2,0,2] : [-1,1];
    if(around.every(u=>around.every(v=>at.has(u+','+v)))) return true;
    const R=moveRotation(mv), cells=new Set(members.map(c=>c.pos.join(',')));
    return members.every(c=>cells.has(matVec(R,c.pos).join(',')));
  }
  move(mv){
    if(typeof mv==='string') mv=parseMove(mv);
    if(!this.canMove(mv)) return false;
    const s=this.selection(mv), R=moveRotation(mv);
    this.cubies=this.cubies.map(c=>!s.fcs.has(c.fc[s.axK]) ? c :
      {home:c.home, stickers:c.stickers, pos:matVec(R,c.pos), ori:matMul(R,c.ori), fc:c.fc, body:c.body&&rotateBody(R,c.body)});
    this.regroup();
    return true;
  }
  isSolved(){ return this.cubies.every(c=>vecEq(c.pos,c.home)&&matEq(c.ori,I3)); }
  // Solved as a whole, possibly turned: every piece is where the solved puzzle
  // rotated by Q puts it, and turned by Q too (so every sticker matches).
  // Returns that rotation (identity when exactly solved), or null.
  solvedRotation(){
    const c0=this.cubies[0];
    for(const Q of ROTATIONS){
      if(!matEq(c0.ori,Q)) continue;   // the first piece's turn pins down Q
      if(this.cubies.every(c=>matEq(c.ori,Q) && vecEq(c.pos,matVec(Q,c.home)))) return Q;
    }
    return null;
  }
  // fewer turnable layers than the solved puzzle has: a reduced phase
  isReduced(){ return this.totalLayers()<this.startTotal; }
  // The phase's box, for naming it: on each axis, one cell per turnable layer,
  // the layer's cell nearest the centre. On a 3x5x7 after U R, the layers
  // reaching from y=2 up to y=6 and from y=-2 down to y=-6 count as y=2 and
  // y=-2, giving 3x3x3. null if those cells don't line up in a row.
  phaseBox(){
    const box=[];
    for(let k=0;k<3;k++){
      const by=new Map();
      for(const c of this.cubies){ const v=c.pos[k], b=by.get(c.fc[k]);
        if(b===undefined || Math.abs(v)<Math.abs(b) || (Math.abs(v)===Math.abs(b) && v>b)) by.set(c.fc[k],v); }
      const cs=[...by.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
      if(!cs.every((v,i)=>!i || v===cs[i-1]+2)) return null;
      box.push([cs[0], cs[cs.length-1]]);
    }
    return box;
  }
  // the occupied cells of the phase's box
  shapeCells(box=this.phaseBox()){
    return new Set(box ? this.cubies.filter(c=>inBox(c.pos,box)).map(c=>c.pos.join(',')) : []);
  }
  // the rotation that takes the solved shape to where the pieces are now, if any
  orientation(){
    const occ=positionsKey(this.cubies.map(c=>c.pos)), s=this.shared;
    for(const Q of ROTATIONS){
      const k=frameKey(Q);
      if(!s.frames.has(k)) s.frames.set(k, positionsKey(this.shape.map(p=>matVec(Q,p))));
      if(s.frames.get(k)===occ) return Q;
    }
    return null;
  }
  // The current phase: key identifies it, counts are its turnable layers per
  // axis, box is phaseBox(), reduced says whether it turns fewer layers than
  // the solved puzzle, and name is the layout (as it sits now) when
  // unreduced, else the shape its box holds ("3x3x3", "3x3x3 +D"), or null
  // when the pieces there form no nameable shape.
  phase(){
    const counts=this.layerCounts(), box=this.phaseBox(), reduced=this.isReduced();
    const key=box ? boxKey(box) : 'n:'+counts.join('x');
    let name=null;
    if(!reduced){
      const Q=this.orientation();
      name=formatSpec(!Q || matEq(Q,I3) ? this.spec : rotateSpec(this.spec,Q));
    } else if(box){
      const cells=[...this.shapeCells(box)].sort(), ck=cells.join('|'), s=this.shared;
      if(!s.names.has(ck)) s.names.set(ck, nameShape(cells.map(c=>c.split(',').map(Number))));
      name=s.names.get(ck);
    }
    return {key, counts, box, reduced, name};
  }
  // the phase's shape name, or its layer grid ("5x3x3") when it has none
  phaseName(){ const ph=this.phase(); return ph.name || ph.counts.join('x'); }
  // Layers a face can name: up to half the axis, as on an N×N×N, where a middle
  // slice is equivalent to the two outer layers plus a rotation. On an
  // off-centre axis (a Triangle Prism's base-to-apex) that equivalence fails,
  // so the middle layer is reachable too.
  maxLayers(face){
    const k=IDX[AXIS[face]], n=this.layerCount(k);
    return this.offCentre(k) ? Math.ceil(n/2) : Math.floor(n/2);
  }
  // the phase's box isn't centred on this axis (a Triangle Prism's tiers run
  // from the base upward); judged by the box, not by where extension pieces
  // happen to sit, so an I-cube's 3x3x3 phase is centred wherever its spare
  // pieces are
  offCentre(k){
    const box=this.phaseBox();
    if(box) return box[k][0]!==-box[k][1];
    const spans=new Map();
    for(const c of this.cubies){ const v=c.pos[k], s=spans.get(c.fc[k]);
      spans.set(c.fc[k], s ? [Math.min(s[0],v),Math.max(s[1],v)] : [v,v]); }
    const list=[...spans.values()].map(s=>s.join(':')).sort().join('|');
    const mirror=[...spans.values()].map(([a,b])=>[-b,-a].join(':')).sort().join('|');
    return list!==mirror;
  }
  // layers to offer from a face when listing moves: as maxLayers, but an
  // off-centre axis's middle layer only from its positive face (2U, not 2D)
  listedLayers(face){
    const k=IDX[AXIS[face]], n=this.layerCount(k);
    return this.offCentre(k) && n%2===1 && !POSITIVE.has(face) ? Math.floor(n/2) : this.maxLayers(face);
  }
}

/* ---------- scrambler ---------- */
// A phase is the set of layers the puzzle can turn; a reduction is a move
// after which it can turn fewer. Reductions are introduced deliberately, one
// per phase, along the order that gives the most phases. Every other move must
// keep the phase exactly as it is: no extra reduction and no accidental undo.

function candidateMoves(p, wide){
  const out=[];
  for(const face of FACES){
    const max=p.listedLayers(face);
    for(let l=1;l<=max;l++) for(const mod of ['',"'",'2']) out.push({face,layer:l,mod,wide:wide&&l>1});
  }
  return out;
}

// What `mv` does to the phase: 'reduces' (fewer layers can turn), 'restores'
// (more), 'keeps' (the same number on every axis), or null if it can't be
// made. The move buttons' tint and the scrambler both use this.
function moveEffect(p, mv){
  if(!p.canMove(mv)) return null;
  const q=p.clone(); q.move(mv);
  const a=p.layerCounts(), b=q.layerCounts();
  if(a.every((n,k)=>n===b[k])) return 'keeps';
  return q.totalLayers()>p.totalLayers() ? 'restores' : 'reduces';
}
const keepsPhase = (p, mv) => moveEffect(p,mv)==='keeps';

// moves that reduce the phase; one representative state per resulting phase
function reductionsFrom(p, wide, allMoves){
  const found=new Map(), total=p.totalLayers();
  for(const mv of allMoves){
    if(!p.canMove(mv)) continue;
    const q=p.clone(); q.move(mv);
    if(q.totalLayers()>=total) continue;
    const ph=q.phase();
    if(!found.has(ph.key)) found.set(ph.key,{phase:ph, state:q, moves:[]});
    found.get(ph.key).moves.push(mv);
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

// Phases to reduce through from p, each a phase() description: the most
// phases that get a full scramble (single-axis phases don't count), then the
// most phases overall, ties broken at random.
function planPhases(p, wide, rng=Math.random){
  return planFrom(p,wide,rng,new Map()).path;
}
function planFrom(p, wide, rng, memo){
  const key=p.phase().key;
  if(memo.has(key)) return memo.get(key);
  memo.set(key,{path:[],score:0});   // guards against cycles while searching
  let best={path:[],score:0}, ties=0;
  for(const r of reductionsFrom(p,wide,triggerMoves(p,wide))){
    const sub=planFrom(r.state,wide,rng,memo);
    const axes=phaseAxes(r.state,wide), isLast=!sub.path.length;
    const cand={path:[r.phase,...sub.path], score:sub.score+(!isSingleAxisPhase(axes,isLast) && axes.size>0 ? 1 : 0)};
    const better = cand.score>best.score || (cand.score===best.score && cand.path.length>best.path.length);
    const tie = cand.score===best.score && cand.path.length===best.path.length;
    if(better){ best=cand; ties=1; }
    else if(tie && rng()<1/(++ties)) best=cand;
  }
  memo.set(key,best);
  return best;
}

// can anything be turned in p's phase without leaving it?
function phaseHasMoves(p, wide){
  return candidateMoves(p,wide).some(mv=>keepsPhase(p,mv));
}
// the axes p's phase can turn about without leaving it
function phaseAxes(p, wide){
  return new Set(candidateMoves(p,wide).filter(mv=>keepsPhase(p,mv)).map(mv=>AXIS[mv.face]));
}
// A phase that can only turn about one axis (or none) can only change the
// relative angle of its layers, so instead of a full scramble it gets one
// random turn (or none) per layer -- unless it's the last phase, which still
// gets its full move count.
const isSingleAxisPhase = (axes, isLast) => !isLast && axes.size<=1;

// How each phase will be treated: {phase, name, axes, singleAxis} for the
// starting phase and each planned one, found by walking the plan's reductions
// from a solved puzzle.
function phaseSummary(spec, plan, wide){
  const p=new Puzzle(spec), out=[];
  for(let i=0;i<=plan.length;i++){
    const axes=phaseAxes(p,wide);
    out.push({phase:p.phase(), name:p.phaseName(), axes:axes.size, singleAxis:isSingleAxisPhase(axes,i===plan.length)});
    if(i===plan.length) break;
    const r=reductionsFrom(p,wide,triggerMoves(p,wide)).find(r=>r.phase.key===plan[i].key);
    if(!r) break;
    p.move(r.moves[0]);
  }
  return out;
}

// Efficient mode: on an axis the next phase narrows from n layers to m, only
// the outer layers about to lose their independence are worth scrambling now.
function efficientFilter(p, next){
  const now=p.layerCounts();
  const narrowing=[0,1,2].filter(k=>next.counts[k]<now[k]);
  if(!narrowing.length) return null;
  return mv=>{
    const k=IDX[AXIS[mv.face]];
    return !narrowing.includes(k) || mv.layer<=Math.ceil((now[k]-next.counts[k])/2);
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

// opts: movesPerPhase (array, last value repeats) or countFor(i, phase) giving
// phase i's move count, wide, efficient, rng, plan (from planPhases, so a UI
// can label phases before generating), start (a Puzzle to scramble from
// instead of solved) and keepShape (stay in the starting phase: only moves
// that don't change it).
function generateScramble(spec, opts={}){
  const rng=opts.rng||Math.random, wide=opts.wide!==false, perPhase=opts.movesPerPhase||[20];
  const p=opts.start ? opts.start.clone() : new Puzzle(spec);
  let plan = opts.keepShape ? [] : opts.plan ? [...opts.plan] : planPhases(p.clone(),wide,rng);
  const phases=[], blocker=makeBlocker();
  for(let i=0;;i++){
    // (before a later phase's reducing move, its phase is the next one planned)
    const n=opts.countFor ? opts.countFor(i, i===0 || !plan.length ? p.phase() : plan[0]) : perPhase[Math.min(i,perPhase.length-1)];
    const moves=[];
    let opening=null;   // face:layer of the move that reduced into this phase
    if(i>0){
      if(!plan.length) break;
      // reach the planned phase; re-plan if this state can't (state-dependent)
      let opts2=reductionsFrom(p,wide,triggerMoves(p,wide)).filter(r=>r.phase.key===plan[0].key);
      if(!opts2.length){
        plan=planPhases(p.clone(),wide,rng);
        if(!plan.length) break;
        opts2=reductionsFrom(p,wide,triggerMoves(p,wide)).filter(r=>r.phase.key===plan[0].key);
      }
      // Prefer a move within the outer half, as the rest of the scramble uses,
      // and one the no-repeat rule allows: the move before it may well have
      // turned the same layer (R2 then R is just R'). Relax those only if no
      // reducing move meets them.
      const all=opts2.flatMap(r=>r.moves), outer=m=>m.layer<=p.maxLayers(m.face);
      const tiers=[m=>outer(m)&&blocker.allows(m,false), m=>blocker.allows(m,false), m=>outer(m)&&blocker.allows(m,true), m=>blocker.allows(m,true), outer, ()=>true];
      const from=tiers.map(f=>all.filter(f)).find(l=>l.length), mv=from[Math.floor(rng()*from.length)];
      p.move(mv); blocker.record(mv); moves.push(formatMove(mv));
      opening=mv.face+':'+mv.layer;
      plan=plan.slice(1);
    }
    const pool=candidateMoves(p,wide);
    // count only the axes this phase can actually turn: a 3x3x3 +D phase of an
    // off-centre puzzle may allow U/D turns alone, and is then single-axis
    const axes=phaseAxes(p,wide), singleAxis=axes.size===1;
    const perLayer=isSingleAxisPhase(axes,!plan.length);
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
    if(perLayer){
      // each layer independently: a random turn that keeps the phase, or none,
      // equally likely (so every relative angle is equally likely); the layers
      // share one axis, so their order doesn't matter
      // stick to the axis found at the start: turning these layers can open up
      // other axes part-way through, which would make it more than one turn per layer
      // The layer that reduced into the phase has had its turn already; turning
      // it again could only add a second turn or undo the reduction.
      const byLayer=new Map();
      for(const mv of usable.filter(m=>axes.has(AXIS[m.face]))){
        const id=mv.face+':'+mv.layer;
        if(id===opening) continue;
        if(!byLayer.has(id)) byLayer.set(id,[]);
        byLayer.get(id).push(mv);
      }
      for(const options of byLayer.values()){
        const keeping=options.filter(mv=>keepsPhase(p,mv));
        if(!keeping.length) continue;
        const pick=Math.floor(rng()*(keeping.length+1));
        if(pick===keeping.length) continue;
        p.move(keeping[pick]); blocker.record(keeping[pick]); moves.push(formatMove(keeping[pick]));
      }
    }
    while(!perLayer && moves.length<n){
      // prefer unblocked moves; if none keeps the phase, allow a blocked one
      // rather than ending the phase early, but never the same layer twice running
      const allowed=usable.filter(m=>blocker.allows(m,singleAxis));
      const picked=firstKeeping(allowed) ||
        firstKeeping(usable.filter(m=>!blocker.allows(m,singleAxis) && blocker.allows(m,true)));
      if(!picked) break;
      p.move(picked); blocker.record(picked); moves.push(formatMove(picked));
    }
    // a first phase that can't turn at all (the Diorama's) contributes no moves
    if(moves.length){
      const ph=p.phase();
      phases.push({key:ph.key, counts:ph.counts, name:p.phaseName(), moves, opensWithReduction:i>0, singleAxis:perLayer});
    }
    if(!plan.length) break;
  }
  return {phases, moves:phases.flatMap(ph=>ph.moves), final:p};
}

const Engine = {
  COLORS, DIRS, I3, AXIS, IDX, POSITIVE, FACES, FACE_ORDER, ROTATIONS,
  matVec, transpose, matMul, vecEq,
  parseSpec, formatSpec, rotateSpec, shapePositions, buildSolved, nameShape,
  boundingBox, boxSize, inBox, boxEq, boxKey,
  parseMove, moveStr, formatMove, parseSequence, moveSweep, worldStickers,
  Puzzle, planPhases, generateScramble, keepsPhase, moveEffect, phaseHasMoves, phaseSummary,
};
if(typeof module!=='undefined' && module.exports) module.exports=Engine;
else root.Engine=Engine;
})(typeof window!=='undefined' ? window : globalThis);
