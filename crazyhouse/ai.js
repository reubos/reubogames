const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  N: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50
  ],
  B: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  Q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20
  ],
  K: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20
  ]
};

function pst(piece, sq){
  const pt=pieceType(piece), c=pieceColor(piece);
  const tbl=PST[pt]; if(!tbl)return 0;
  return tbl[c==='w'?sq:(63-sq)];
}

function see(brd, sq, byColor){
  const victim=brd[sq]; if(!victim)return 0;
  const victimVal=PIECE_VALS[pieceType(victim)];
  let lva=null, lvaVal=Infinity, lvaSq=-1;
  const r=rowOf(sq),f=colOf(sq);
  for(const [dr,df] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
    const nr=r+dr,nf=f+df; if(nr<0||nr>7||nf<0||nf>7)continue;
    const p=brd[idx(nr,nf)]; if(p&&pieceColor(p)===byColor&&pieceType(p)==='N'){
      if(PIECE_VALS.N<lvaVal){lvaVal=PIECE_VALS.N;lvaSq=idx(nr,nf);}
    }
  }
  const pd=byColor==='w'?1:-1;
  for(const df of [-1,1]){const nr=r+pd,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8){const p=brd[idx(nr,nf)];if(p&&pieceColor(p)===byColor&&pieceType(p)==='P'&&PIECE_VALS.P<lvaVal){lvaVal=PIECE_VALS.P;lvaSq=idx(nr,nf);}}}
  for(const [dr,df] of [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]){
    let nr=r+dr,nf=f+df;
    while(nr>=0&&nr<8&&nf>=0&&nf<8){
      const p=brd[idx(nr,nf)];
      if(p){
        if(pieceColor(p)===byColor){
          const pt2=pieceType(p),val=PIECE_VALS[pt2];
          const diag=Math.abs(dr)===Math.abs(df);
          const slides=(pt2==='Q')||(diag&&pt2==='B')||(!diag&&pt2==='R');
          if(slides&&val<lvaVal){lvaVal=val;lvaSq=idx(nr,nf);}
        }
        break;
      }
      nr+=dr;nf+=df;
    }
  }
  for(const [dr,df] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nr=r+dr,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8){const p=brd[idx(nr,nf)];if(p&&pieceColor(p)===byColor&&pieceType(p)==='K'&&PIECE_VALS.K<lvaVal){lvaVal=PIECE_VALS.K;lvaSq=idx(nr,nf);}}
  }
  if(lvaSq<0)return 0;
  const nb=[...brd]; nb[sq]=nb[lvaSq]; nb[lvaSq]=null;
  return Math.max(0, victimVal - see(nb, sq, oppColor(byColor)));
}

function countAttackers(brd, sq, color){
  let n=0;
  const r=rowOf(sq),f=colOf(sq);
  for(const [dr,df] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
    const nr=r+dr,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8&&brd[idx(nr,nf)]===color+'N')n++;
  }
  const pd=color==='w'?1:-1;
  for(const df of [-1,1]){const nr=r+pd,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8&&brd[idx(nr,nf)]===color+'P')n++;}
  for(const [dr,df] of [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]){
    let nr=r+dr,nf=f+df;
    while(nr>=0&&nr<8&&nf>=0&&nf<8){
      const p=brd[idx(nr,nf)];
      if(p){
        if(pieceColor(p)===color){
          const pt2=pieceType(p),diag=Math.abs(dr)===Math.abs(df);
          if(pt2==='Q'||(diag&&pt2==='B')||(!diag&&pt2==='R'))n++;
          if(pt2==='K'&&Math.abs(nr-r)<=1&&Math.abs(nf-f)<=1)n++;
        }
        break;
      }
      nr+=dr;nf+=df;
    }
  }
  return n;
}

function evaluate(brd, pl, cr, simPromo=null){
  let score=0;
  let wKingSq=-1, bKingSq=-1;

  for(let i=0;i<64;i++){
    const p=brd[i]; if(!p) continue;
    const c=pieceColor(p), pt=pieceType(p), sign=c==='w'?1:-1;
    score += sign * (PIECE_VALS[pt] + pst(p,i));
    if(pt==='K'){if(c==='w')wKingSq=i;else bKingSq=i;}
  }

  const wMoves=pseudoMoves('w',brd,cr);
  const bMoves=pseudoMoves('b',brd,cr);
  score += (wMoves.length - bMoves.length) * 2;

  const kingSafety=(kSq, attColor, sign)=>{
    if(kSq<0)return;
    const kr=rowOf(kSq),kf=colOf(kSq);
    let danger=0;
    for(let dr=-1;dr<=1;dr++)for(let df=-1;df<=1;df++){
      if(!dr&&!df)continue;
      const nr=kr+dr,nf=kf+df;if(nr>=0&&nr<8&&nf>=0&&nf<8)
        danger+=countAttackers(brd,idx(nr,nf),attColor);
    }
    if(inCheck(attColor==='w'?'b':'w',brd))danger+=3;
    score+=sign*danger*10;
  };
  kingSafety(wKingSq,'b',-1);
  kingSafety(bKingSq,'w', 1);

  for(const p of pl.w) score += PIECE_VALS[pieceType(p)] * 0.8;
  for(const p of pl.b) score -= PIECE_VALS[pieceType(p)] * 0.8;

  const dropThreat=(pool, oppKSq, sign)=>{
    if(oppKSq<0)return;
    const kr=rowOf(oppKSq),kf=colOf(oppKSq);
    const edgeExposed=(kr===0||kr===7||kf===0||kf===7)?20:0;
    for(const p of pool){
      const pt2=pieceType(p);
      const bonus={Q:60,R:35,N:40,B:20,P:15}[pt2]||10;
      score+=sign*(bonus+edgeExposed);
    }
  };
  dropThreat(pl.w,bKingSq, 1);
  dropThreat(pl.b,wKingSq,-1);

  return score;
}

function moveScore(m, brd, killers, color){
  if(m.flags&&m.flags.castle) return 300;
  if(m.flags&&m.flags.selfCapture){
    const pt=pieceType(brd[m.from]);
    return -200 - PIECE_VALS[pt];
  }
  if(m.drop){
    const pt=pieceType(m.piece);
    const oppKSq=kingPos(oppColor(color),brd);
    const kr=oppKSq>=0?rowOf(oppKSq):3.5;
    const dist=Math.abs(rowOf(m.to)-kr)+Math.abs(colOf(m.to)-colOf(oppKSq>=0?oppKSq:28));
    const proximity=Math.max(0,10-dist)*5;
    return 100+PIECE_VALS[pt]/10+proximity;
  }
  if(m.flags&&m.flags.capture){
    const victim=brd[m.to], attacker=brd[m.from];
    if(!victim||!attacker)return 0;
    const gain=see(brd,m.to,color);
    return gain>0 ? 400+gain : 50+PIECE_VALS[pieceType(victim)]-PIECE_VALS[pieceType(attacker)]/10;
  }
  if(killers&&killers.some(k=>k.from===m.from&&k.to===m.to))return 90;
  const p=brd[m.from]; if(!p)return 0;
  return pst(p,m.to)-pst(p,m.from);
}

function orderMoves(moves, brd, killers, color){
  const scores=new Map();
  for(const m of moves) scores.set(m, moveScore(m,brd,killers,color));
  return moves.sort((a,b)=>scores.get(b)-scores.get(a));
}

function simMove(brd, pl, cr, m, color, simPromoSet){
  const nb=[...brd], np={w:[...pl.w],b:[...pl.b]}, nc={...cr};
  const nps=simPromoSet?new Set(simPromoSet):new Set();
  if(!m.drop){
    const cap=nb[m.to];
    if(cap){
      const addType=nps.has(m.to)?'P':pieceType(cap);
      const gainedBy=m.flags&&m.flags.selfCapture?(selfCaptureMode==='opponent'?oppColor(color):selfCaptureMode==='own'?color:null):color;
      if(gainedBy!==null)np[gainedBy].push(gainedBy+addType);
      nps.delete(m.to);
    }
    if(nps.has(m.from)){nps.delete(m.from);nps.add(m.to);}
  }
  applyMoveToBoard(nb,m,null,nc);
  if(!m.drop&&nb[m.to]&&pieceType(nb[m.to])!=='P'){
    const orig=brd[m.from];
    if(orig&&pieceType(orig)==='P'){
      const c2=pieceColor(nb[m.to]);
      if((c2==='w'&&rowOf(m.to)===0)||(c2==='b'&&rowOf(m.to)===7)) nps.add(m.to);
    }
  }
  if(m.drop){const i2=np[color].indexOf(m.piece);if(i2>-1)np[color].splice(i2,1);}
  return {nb,np,nc,nps};
}

function quiesce(brd, pl, cr, alpha, beta, maximizing, qdepth, nps){
  const stand=evaluate(brd,pl,cr,nps);
  if(qdepth<=0) return stand;
  if(maximizing){if(stand>=beta)return beta;if(stand>alpha)alpha=stand;}
  else{if(stand<=alpha)return alpha;if(stand<beta)beta=stand;}

  const c=maximizing?'w':'b';
  const allMoves=pseudoMoves(c,brd,cr);
  const loud=[];
  for(const m of allMoves){
    if(m.flags&&m.flags.capture&&!m.flags.selfCapture){
      if(see(brd,m.to,c)>=0) loud.push(m);
    } else if(m.drop){
      const {nb}=simMove(brd,pl,cr,m,c,nps);
      if(inCheck(oppColor(c),nb)) loud.push(m);
    }
  }
  if(loud.length===0) return stand;
  orderMoves(loud,brd,null,c);

  for(const m of loud){
    const {nb,np,nc,nps:nnps}=simMove(brd,pl,cr,m,c,nps);
    if(inCheck(c,nb))continue;
    const v=quiesce(nb,np,nc,alpha,beta,!maximizing,qdepth-1,nnps);
    if(maximizing){if(v>=beta)return beta;if(v>alpha)alpha=v;}
    else{if(v<=alpha)return alpha;if(v<beta)beta=v;}
  }
  return maximizing?alpha:beta;
}

const killerTable=[];
function minimax(brd, pl, cr, depth, alpha, beta, maximizing, ply, nps){
  const c=maximizing?'w':'b';
  if(depth<=0) return quiesce(brd,pl,cr,alpha,beta,maximizing,5,nps);

  let ml=legalMovesFor(c,brd,pl,cr);
  if(ml.length===0) return inCheck(c,brd)?(maximizing?-99000+ply:99000-ply):0;

  const killers=killerTable[ply]||[];
  orderMoves(ml,brd,killers,c);

  const cap=depth>=3?40:depth>=2?55:90;
  if(ml.length>cap) ml=ml.slice(0,cap);

  let best=maximizing?-Infinity:Infinity;
  let first=true;
  for(const m of ml){
    const {nb,np,nc,nps:nnps}=simMove(brd,pl,cr,m,c,nps);
    let v;
    if(first){
      v=minimax(nb,np,nc,depth-1,alpha,beta,!maximizing,ply+1,nnps);
      first=false;
    } else {
      const nullV=maximizing
        ?minimax(nb,np,nc,depth-1,alpha,alpha+1,!maximizing,ply+1,nnps)
        :minimax(nb,np,nc,depth-1,beta-1,beta,!maximizing,ply+1,nnps);
      if((maximizing&&nullV>alpha)||(!maximizing&&nullV<beta)){
        v=minimax(nb,np,nc,depth-1,alpha,beta,!maximizing,ply+1,nnps);
      } else v=nullV;
    }
    if(maximizing){if(v>best)best=v;if(v>alpha)alpha=v;}
    else{if(v<best)best=v;if(v<beta)beta=v;}
    if(beta<=alpha){
      if(!killerTable[ply])killerTable[ply]=[];
      if(!killerTable[ply].some(k=>k.from===m.from&&k.to===m.to)){
        killerTable[ply].unshift(m);
        if(killerTable[ply].length>2)killerTable[ply].pop();
      }
      break;
    }
  }
  return best;
}

function aiMoveBuiltin(ml) {
  const timeBudgets=[0,800,1800,3500];
  const budget=timeBudgets[aiDepth]||1800;
  const startTime=Date.now();
  const isMax=turn==='w';
  const initNps=new Set(promotedSquares);

  const root=[...ml];
  orderMoves(root,board,null,turn);

  let bestMove=root[0];
  let bestScore=isMax?-Infinity:Infinity;

  for(let depth=1;depth<=aiDepth+2;depth++){
    if(Date.now()-startTime>budget*0.75&&depth>1)break;
    killerTable.length=0;
    let iterBest=isMax?-Infinity:Infinity;
    let iterMove=bestMove;
    for(const m of root){
      if(Date.now()-startTime>budget)break;
      const {nb,np,nc,nps}=simMove(board,pools,castlingRights,m,turn,initNps);
      const v=minimax(nb,np,nc,depth-1,-Infinity,Infinity,!isMax,1,nps);
      if(isMax?(v>iterBest):(v<iterBest)){iterBest=v;iterMove=m;}
    }
    bestScore=iterBest;bestMove=iterMove;
    if(Math.abs(bestScore)>90000)break;
  }

  const chosen=bestMove||ml[0];
  if(applyMove(chosen)){aiThinking=false;updateUndoButton();endTurn();}
  else if(applyMove(chosen,'Q')){aiThinking=false;updateUndoButton();endTurn();}
}

function uciToMove(uciStr) {
  // Drop: P@e4
  if (uciStr.includes('@')) {
    const [ptStr, sqStr] = uciStr.split('@');
    const f = sqStr.charCodeAt(0) - 97;
    const r = 8 - parseInt(sqStr[1]);
    return { drop: true, piece: turn + ptStr.toUpperCase(), to: r * 8 + f };
  }

  // Normal: e2e4 or e7e8q
  const fromF = uciStr.charCodeAt(0) - 97;
  const fromR = 8 - parseInt(uciStr[1]);
  const toF   = uciStr.charCodeAt(2) - 97;
  const toR   = 8 - parseInt(uciStr[3]);
  const from  = fromR * 8 + fromF;
  const to    = toR   * 8 + toF;
  const promo = uciStr[4] ? uciStr[4].toUpperCase() : null;

  const ml = legalMovesFor(turn);
  // Chess960 castling: Stockfish sends king-to-rook (e.g. e1h1); match via rookFrom
  const match = ml.find(m => {
    if (m.drop) return false;
    if (m.from !== from) return false;
    if (m.flags && m.flags.castle) return m.flags.rookFrom === to || m.to === to;
    return m.to === to;
  });

  if (!match) return null;
  return promo ? { ...match, promo } : match;
}

async function aiMove() {
  if (gameOver || historyIndex !== -1) return;
  aiThinking = true;
  const myGameId = gameId;

  const ml = legalMovesFor(turn);
  if (ml.length === 0) { endTurn(); aiThinking = false; return; }

  const hasWalls = board.some(p => p && pieceType(p) === 'W')
    || pools.w.some(p => pieceType(p) === 'W')
    || pools.b.some(p => pieceType(p) === 'W');
  if (!stockfish.ready || hasWalls) {
    setEngineLabel(false);
    aiMoveBuiltin(ml);
    return;
  }
  setEngineLabel(true);

  const sfSkill   = [0, 3, 10, 20];
  const timeBudgets = [0, 500, 1200, 2500];
  const budget = timeBudgets[aiDepth] || 1200;

  stockfish.setSkillLevel(sfSkill[aiDepth] ?? 10);

  const fen = boardToFen();
  const sfResult = await stockfish.getBestMove(fen, budget);

  if (gameId !== myGameId || gameOver || historyIndex !== -1) { aiThinking = false; return; }

  let bestMove = (sfResult && sfResult.move) ? uciToMove(sfResult.move) : null;
  let bestScore = sfResult ? sfResult.score : -Infinity;

  if (!bestMove) {
    aiMoveBuiltin(ml);
    return;
  }

  // Evaluate each self-capture move at depth 1 and override if clearly better
  const selfCaptures = ml.filter(m => m.flags && m.flags.selfCapture);
  for (const m of selfCaptures) {
    const { nb, np, nc } = simMove(board, pools, castlingRights, m, turn, promotedSquares);
    const afterFen = boardToFen(nb, np, nc, oppColor(turn));
    const evalScore = await stockfish.quickEval(afterFen);

    if (gameId !== myGameId || gameOver || historyIndex !== -1) { aiThinking = false; return; }

    // evalScore is from the opponent's perspective after our move — negate for ours
    const ourScore = -evalScore;
    if (ourScore > bestScore) {
      bestScore = ourScore;
      bestMove = m;
    }
  }

  if (applyMove(bestMove)) { aiThinking = false; updateUndoButton(); endTurn(); }
  else if (applyMove(bestMove, 'Q')) { aiThinking = false; updateUndoButton(); endTurn(); }
  else { aiMoveBuiltin(ml); }
}
