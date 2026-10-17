// Run with: node engine.test.js
const E = require('./engine.js');

let failures = 0;
function check(cond, msg){
  if(!cond){ failures++; console.log('FAIL  '+msg); }
  else console.log('ok    '+msg);
}
function eq(a, b, msg){
  const A=JSON.stringify(a), B=JSON.stringify(b);
  check(A===B, A===B ? msg : `${msg}\n        got      ${A}\n        expected ${B}`);
}
function mulberry32(seed){
  return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
// phase name after each move; '✗' marks a refused move
function trace(spec, moves){
  const p=new E.Puzzle(spec);
  return moves.map(m=>p.move(m) ? p.boxName() : '✗');
}
const layerCounts=(p,k)=>{ const m={}; for(const c of p.cubies) m[c.pos[k]]=(m[c.pos[k]]||0)+1;
  return Object.keys(m).map(Number).sort((a,b)=>b-a).map(v=>m[v]); };
const state=p=>JSON.stringify([p.cubies.map(c=>[c.pos,c.ori,c.fc]),p.eff,p.phaseStack]);

const PRESETS = {
  'Cuboid':'3x3x3', 'I-cube':'3x3x3 +U', 'Double I-cube':'3x3x3 +2U', 'T-cube':'3x3x3 +R +L +D',
  'L-cube':'3x3x3 +R +U', 'X-cube':'3x3x3 +U +D +R +L', 'Cross Cube':'3x3x3 +U +D +R +L +F +B',
  'Corner Cube':'3x3x3 +U +R +F', 'Super Shapeshifter':'3x3x3 +2U +2D +R +L',
};

console.log('--- layouts');
eq(Object.fromEntries(Object.entries(PRESETS).map(([n,s])=>[n,new E.Puzzle(s).cubies.length])),
  {'Cuboid':27,'I-cube':36,'Double I-cube':45,'T-cube':54,'L-cube':45,'X-cube':63,'Cross Cube':81,'Corner Cube':54,'Super Shapeshifter':81},
  'preset cubie counts');
{
  const key=s=>E.shapePositions(E.parseSpec(s)).map(p=>p.join(',')).sort().join('|');
  check(key('3x3x3 +2U +2D +R +L')===key('3x7x3 +R(3x3) +L(3x3)'), 'Super Shapeshifter written both ways builds the same shape');
}
eq(['3x4x5 +F(3x4)','3x4x5 +F(5x4)','3x4x5 +F(5x2)','3x4x5 +F(5x6)','3x4x5 +F(1x2)'].map(s=>new E.Puzzle(s).cubies.length),
  [72,80,70,90,62], 'F-face layers of any matching parity on a 3x4x5');
for(const bad of ['3x4x5 +F(4x4)','3x3','3x3x3 +Q','3x3x3 +2F(3x3,1x1)']){
  let threw=false; try{ E.parseSpec(bad); }catch(e){ threw=true; }
  check(threw, `rejects "${bad}"`);
}
eq(E.formatSpec(E.parseSpec('3x3x3 +R +L +D')), '3x3x3 +D +R +L', 'formatSpec normalises face order');

console.log('--- plain cuboids');
eq(trace('3x3x5',['R',"R'"]), ['3x3x3','3x3x5'], '3x3x5: R reduces, R\' restores');
eq(trace('3x3x5',['U2','R2']), ['3x3x5','3x3x5'], '3x3x5: half turns keep all five F/B layers');
eq(trace('3x3x5',['R','U',"U'","R'"]), ['3x3x3','3x3x3','3x3x3','3x3x5'], '3x3x5: R U U\' R\' restores');
{
  const p=new E.Puzzle('3x3x5'); p.move('R');
  const s=p.selection(E.parseMove('U'));
  check(p.cubies.filter(c=>s.fcs.has(c.fc[s.axK])).length===16, '3x3x5: U after R turns 16 cubies');
}
{
  const p=new E.Puzzle('3x3x5');
  for(let i=0;i<6;i++) for(const m of ['R','U',"R'","U'"]) p.move(m);
  check(p.isSolved() && !p.isReduced(), '3x3x5: (R U R\' U\')x6 is solved and unreduced');
}
eq(trace('3x5x7',['U','U','R','U','F','F','F','F']),
  ['3x5x3','3x5x7','3x5x5','3x5x3','3x3x3','3x5x3','3x3x3','3x5x3'], '3x5x7 reduction and undo sequence');
eq(trace('3x5x7',['L',"R'",'F2','R',"F'"]).slice(-1), ['3x3x5'], '3x5x7: intact 3x3x5 sub-cuboid restores immediately');
eq(trace('2x2x3',['R','R2']), ['✗','2x2x3'], '2x2x3: R refused (parity), R2 allowed');

console.log('--- extended shapes');
{
  const p=new E.Puzzle('3x3x3 +U');
  check(p.layerCount(1)===4 && !p.isReduced(), 'I-cube starts with 4 U/D layers, unreduced');
  p.move('R2');
  eq([p.boxName(), layerCounts(p,1)], ['3x3x3',[6,9,9,9,3]], 'I-cube R2 reduces to 3x3x3 with layers 6,9,9,9,3');
  p.move('R2');
  check(p.isSolved() && !p.isReduced(), 'I-cube R2 R2 is solved and unreduced');
}
eq(trace('3x3x3 +U',['U','R',"R'"]), ['3x3x3 +U','3x3x3','3x3x3 +U'], 'I-cube: U free, R reduces, R\' restores');
eq(trace('3x3x3 +R +L +D',['R',"R'",'2D',"2D'"]),
  ['3x3x3 +D +R +L','3x3x3 +D +R +L','3x3x3 +D','3x3x3 +D +R +L'], 'T-cube: R free, 2D reduces to 3x3x3 +D, 2D\' restores');
eq(trace('3x3x3 +R +L +D',['2R']), ['3x3x3 +R +L'], 'T-cube: 2R reduces to 3x3x3 +R +L');

{
  // overlapping oversized layers: a 4x4x4 grid from x,y,z = -4 to +2, with the
  // layers' overhang at +4 attached to the layer it touches
  const p=new E.Puzzle('3x3x3 +D(5x5) +L(5x5) +B(5x5)');
  eq(E.boxSize(p.fullBox), [4,4,4], 'overlapping 5x5 layers on D, L, B: turnable grid is 4x4x4');
  eq([0,1,2].map(k=>p.layerCount(k)), [4,4,4], '...with 4 turnable layers on every axis');
  const fringe=p.cubies.filter(c=>c.pos[0]===4), s=p.selection(E.parseMove('R'));
  check(fringe.length>0 && fringe.every(c=>s.fcs.has(c.fc[0])), `...and R turns the overhanging x=+4 fringe (${fringe.length} cubies) with the x=+2 layer`);
  const q=p.clone(); q.move('R'); q.move("R'");
  check(q.isSolved() && !q.isReduced(), "...R R' is solved and unreduced");
}

{
  // Triangle Prism: core one layer tall, so the turning centre is in the base
  const p=new E.Puzzle('5x1x5 +U(3x5,1x5)');
  p.move('F2');
  eq([p.boxName(), p.layerCount(1), p.move('U')], ['5x1x5',1,false], 'Triangle Prism: F2 bandages every tier to the base, and U (a whole-puzzle rotation) is refused');
  eq(trace('3x3x1',['F','F2','U2']), ['✗','✗','3x3x1'], '3x3x1: F and F2 would turn every piece, so they are refused');
  const q=new E.Puzzle('5x1x5 +U(3x5,1x5)'); q.move('2Uw');
  const moves=new Set(E.generateScramble('5x1x5 +U(3x5,1x5)',{movesPerPhase:[60],rng:mulberry32(4)}).phases
    .find(ph=>ph.name==='3x1x3 +U(3x3,1x3)').moves.map(m=>m.replace(/['2]$/,'')));
  check(moves.has('2U') || moves.has('2Uw'), `Triangle Prism phase 3x1x3 +U(3x3,1x3) also turns the middle tier (${[...moves].join(', ')})`);
}

console.log('--- replay determinism');
{
  const rng=mulberry32(1), moves=['R','L','U','D','F','B'], mods=['',"'",'2'];
  let bad=0, total=0;
  for(const spec of Object.values(PRESETS).concat(['3x5x7','2x4x6','3x3x5'])){
    for(let t=0;t<5;t++){
      const p=new E.Puzzle(spec), hist=[];
      for(let i=0;i<40;i++){
        const m=E.moveStr(moves[Math.floor(rng()*6)],1+Math.floor(rng()*3),mods[Math.floor(rng()*3)]);
        if(p.move(m)) hist.push(m);
      }
      const q=new E.Puzzle(spec); hist.forEach(m=>q.move(m));
      total++; if(state(p)!==state(q)) bad++;
    }
  }
  check(bad===0, `replaying ${total} random sequences reproduces the same state`);
}

console.log('--- scrambler');
// cuboid-scrambler's own phase path, for comparison
function oldStageCount(w,h,d){
  const canInc=(w,h,d)=>{ const o=[];
    if(w>=2&&h>1&&d>1&&h!==d&&h%2===d%2) o.push({hi:Math.max(h,d),lo:Math.min(h,d),idx:[1,2]});
    if(h>=2&&w>1&&d>1&&w!==d&&w%2===d%2) o.push({hi:Math.max(w,d),lo:Math.min(w,d),idx:[0,2]});
    if(d>=2&&w>1&&h>1&&w!==h&&w%2===h%2) o.push({hi:Math.max(w,h),lo:Math.min(w,h),idx:[0,1]});
    return o; };
  let dims=[w,h,d], n=0;
  for(let it=0;it<20;it++){
    const inc=canInc(...dims); n++;
    if(!inc.length) break;
    const maxHi=Math.max(...inc.map(o=>o.hi)), top=inc.filter(o=>o.hi===maxHi);
    const best=top.filter(o=>o.lo===Math.max(...top.map(o=>o.lo)))[0];
    const nd=[...dims], [i,j]=best.idx; if(nd[i]>nd[j]) nd[i]=best.lo; else nd[j]=best.lo; dims=nd;
  }
  return n;
}
{
  const fewer=[], more=[];
  for(let w=1;w<=7;w++) for(let h=1;h<=7;h++) for(let d=1;d<=7;d++){
    const spec=`${w}x${h}x${d}`, nNew=1+E.planPhases(new E.Puzzle(spec),true,mulberry32(w*100+h*10+d)).length, nOld=oldStageCount(w,h,d);
    if(nNew<nOld) fewer.push(`${spec}: ${nNew} vs ${nOld}`);
    if(nNew>nOld) more.push(`${spec}: ${nNew} vs ${nOld}`);
  }
  check(!fewer.length, 'never fewer phases than cuboid-scrambler on cuboids up to 7x7x7'+(fewer.length?': '+fewer.join(', '):''));
  console.log(`      more phases than cuboid-scrambler: ${more.length ? more.join(', ') : 'none'}`);
}
console.log('      phases per preset: '+Object.entries(PRESETS).map(([n,s])=>{
  const p=new E.Puzzle(s), plan=E.planPhases(p,true,mulberry32(7));
  return `${n} ${1+plan.length} (${[p.boxName(), ...plan.map(b=>p.boxName(b))].join(' → ')})`;
}).join('; '));

// Every generated scramble must replay on a fresh puzzle with every move
// accepted, each phase must hold its box for all its moves after the opening
// reduction, and no move may undo a reduction.
{
  const specs=Object.values(PRESETS).concat(['3x5x7','2x4x6','3x3x5','2x3x4','4x4x6','5x5x5','3x3x3 +D(5x5) +L(5x5) +B(5x5)','3x4x5 +F(5x4,3x2)']);
  let problems=[], scrambles=0, deep=[];
  for(const spec of specs) for(const wide of [true,false]) for(const efficient of [false,true]){
    const rng=mulberry32(spec.length*31+(wide?1:0)+(efficient?2:0));
    const res=E.generateScramble(spec,{movesPerPhase:[25],wide,efficient,rng});
    scrambles++;
    const p=new E.Puzzle(spec);
    res.phases.forEach((ph,i)=>{
      ph.moves.forEach((m,j)=>{
        const depthBefore=p.phaseStack.length;
        if(!p.move(m)) problems.push(`${spec} ${m} refused`);
        const isOpening=ph.opensWithReduction && j===0;
        if(isOpening && p.phaseStack.length!==depthBefore+1) problems.push(`${spec} phase ${i+1}: ${m} didn't reduce`);
        if(!isOpening && p.phaseStack.length!==depthBefore) problems.push(`${spec} phase ${i+1}: ${m} changed the phase`);
      });
      if(!E.boxEq(p.eff,ph.box)) problems.push(`${spec} phase ${i+1} ended in the wrong box`);
    });
    const fresh=new E.Puzzle(spec);
    const planned=1+E.planPhases(fresh.clone(),wide,mulberry32(3)).length-(E.phaseHasMoves(fresh,wide)?0:1);
    if(res.phases.length!==planned) problems.push(`${spec} (${wide?'wide':'slice'}): ${res.phases.length} phases, planned ${planned}`);
    {
      const q=new E.Puzzle(spec);
      res.moves.forEach(m=>{ const mv=E.parseMove(m);
        if(mv.layer>q.maxLayers(mv.face)) deep.push(`${spec}: ${m}`);
        q.move(m); });
    }
    // efficient mode may leave a phase only one useful layer (an I-cube's U
    // slab), so only normal mode must fill every phase
    if(!efficient) res.phases.forEach((ph,i)=>{ if(ph.moves.length<25) problems.push(`${spec} (${wide?'wide':'slice'}${efficient?', efficient':''}) phase ${i+1} ${ph.name}: only ${ph.moves.length} of 25 moves`); });
    if(wide && res.moves.some(m=>/^\d+[RLUDFB](?!w)/.test(m))) problems.push(`${spec}: slice move in wide mode`);
    if(!wide && res.moves.some(m=>m.includes('w'))) problems.push(`${spec}: wide move in slice mode`);
  }
  check(!problems.length, `${scrambles} scrambles replay cleanly, reduce once per phase and never undo`+(problems.length?'\n        '+problems.slice(0,10).join('\n        '):''));
  console.log(`      moves deeper than half the puzzle (only when no shallower move reduces): ${deep.length ? deep.join(', ') : 'none'}`);
}
{
  const res=E.generateScramble('3x5x7',{movesPerPhase:[30],wide:true,efficient:true,rng:mulberry32(9)});
  // phase 1 -> 2 narrows z from 7 to 5: only the outer F/B layer is about to freeze
  const zMoves=res.phases[0].moves.filter(m=>/[FB]/.test(m));
  check(res.phases[0].name==='3x5x7' && zMoves.every(m=>/^[FB]/.test(m)), `efficient mode: phase 1 of 3x5x7 only turns the outer F/B layers (${zMoves.length} of them)`);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exitCode = failures ? 1 : 0;
