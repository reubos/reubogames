const PIECES = {
  wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',
  bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'
};
const TYPE_GLYPH = {K:'K',Q:'Q',R:'R',B:'B',N:'N',P:'P'};
const PIECE_VALS = {P:100,N:320,B:330,R:500,Q:900,K:20000};

let board, turn, pools, gameOver, selectedSq, selectedPoolPiece, legalMoves, lastMove, moveHistory, chess960Rooks, castlingRights, promotedSquares;
let snapshots=[], historyIndex=-1;
let liveState=null;
let initialBoard=[], initialCR={};
let mode = 'pve', aiDepth = 2, aiThinking = false, aiColor = 'b';
let selfCaptureMode = 'opponent'; // 'opponent' | 'own' | 'remove'

function setupClassic(){
  const bk = ['bR','bN','bB','bQ','bK','bB','bN','bR'];
  const wk = ['wR','wN','wB','wQ','wK','wB','wN','wR'];
  for(let i=0;i<8;i++){board[i]=bk[i];board[8+i]='bP';board[48+i]='wP';board[56+i]=wk[i];}
  chess960Rooks.w={a:56,h:63};chess960Rooks.b={a:0,h:7};
}

function setup960(){
  const back = Array(8).fill(null);
  const lb=[0,2,4,6],db=[1,3,5,7];
  back[lb[Math.floor(Math.random()*4)]]='B';
  back[db[Math.floor(Math.random()*4)]]='B';
  const empty=()=>back.map((v,i)=>[v,i]).filter(x=>!x[0]).map(x=>x[1]);
  const put=(p)=>{const e=empty();const i=e[Math.floor(Math.random()*e.length)];back[i]=p;};
  put('Q');put('N');put('N');
  const e=empty();
  back[e[0]]='R';back[e[1]]='K';back[e[2]]='R';

  const wRookFiles=[],bRookFiles=[];
  for(let i=0;i<8;i++){
    const p=back[i];
    board[i]='b'+p;board[56+i]='w'+p;
    board[8+i]='bP';board[48+i]='wP';
    if(p==='R'){wRookFiles.push(56+i);bRookFiles.push(i);}
  }
  chess960Rooks.w={a:wRookFiles[0],h:wRookFiles[1]};
  chess960Rooks.b={a:bRookFiles[0],h:bRookFiles[1]};
}

function pieceColor(p){return p?p[0]:null}
function pieceType(p){return p?p[1]:null}
function oppColor(c){return c==='w'?'b':'w'}
function idx(r,f){return r*8+f}
function rowOf(i){return Math.floor(i/8)}
function colOf(i){return i%8}
function fileStr(f){return String.fromCharCode(97+f)}

function kingPos(color, brd=board){for(let i=0;i<64;i++)if(brd[i]===color+'K')return i;return -1;}

function isAttacked(sq, byColor, brd=board){
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const r=rowOf(sq),f=colOf(sq);
  for(const [dr,df] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
    const nr=r+dr,nf=f+df;
    if(nr>=0&&nr<8&&nf>=0&&nf<8){const p=brd[idx(nr,nf)];if(p===byColor+'N')return true;}
  }
  const pd=byColor==='w'?1:-1;
  for(const df of [-1,1]){const nr=r+pd,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8){const p=brd[idx(nr,nf)];if(p===byColor+'P')return true;}}
  for(const [dr,df] of dirs){
    let nr=r+dr,nf=f+df;
    while(nr>=0&&nr<8&&nf>=0&&nf<8){
      const p=brd[idx(nr,nf)];
      if(p){
        const pt=pieceType(p);const pc=pieceColor(p);
        if(pc===byColor){
          const diag=Math.abs(dr)===Math.abs(df);
          if(pt==='Q'||(diag&&pt==='B')||(!diag&&pt==='R'))return true;
        }
        break;
      }
      nr+=dr;nf+=df;
    }
  }
  for(const [dr,df] of dirs){const nr=r+dr,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8){const p=brd[idx(nr,nf)];if(p===byColor+'K')return true;}}
  return false;
}

function inCheck(color, brd=board){return isAttacked(kingPos(color,brd), oppColor(color), brd);}

function pseudoMoves(color, brd=board, cr=castlingRights){
  const moves=[];
  const opp=oppColor(color);
  for(let i=0;i<64;i++){
    const p=brd[i];if(!p||pieceColor(p)!==color)continue;
    const pt=pieceType(p);const r=rowOf(i),f=colOf(i);
    const add=(to,flags={})=>{
      if(to===i)return;
      const target=brd[to];
      if(target&&pieceType(target)==='K')return;
      moves.push({from:i,to,flags:{...flags}});
    };

    if(pt==='P'){
      const dir=color==='w'?-1:1;const startR=color==='w'?6:1;
      const fwd=idx(r+dir,f);
      if(r+dir>=0&&r+dir<8&&!brd[fwd]){
        add(fwd,{pawn:true});
        if(r===startR&&!brd[idx(r+2*dir,f)])add(idx(r+2*dir,f),{pawn:true,double:true});
      }
      for(const df of [-1,1]){
        const nr=r+dir,nf=f+df;
        if(nr>=0&&nr<8&&nf>=0&&nf<8){
          const t=brd[idx(nr,nf)];
          if(t)add(idx(nr,nf),{pawn:true,capture:true,selfCapture:pieceColor(t)===color});
        }
      }
    }
    else if(pt==='N'){
      for(const [dr,df] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]){
        const nr=r+dr,nf=f+df;
        if(nr>=0&&nr<8&&nf>=0&&nf<8){
          const t=brd[idx(nr,nf)];
          add(idx(nr,nf),{capture:!!t,selfCapture:t&&pieceColor(t)===color});
        }
      }
    }
    else if(pt==='K'){
      for(const [dr,df] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nr=r+dr,nf=f+df;
        if(nr>=0&&nr<8&&nf>=0&&nf<8){
          const t=brd[idx(nr,nf)];
          add(idx(nr,nf),{capture:!!t,selfCapture:t&&pieceColor(t)===color});
        }
      }
    }
    else {
      const diag=[[1,1],[1,-1],[-1,1],[-1,-1]];
      const orth=[[1,0],[-1,0],[0,1],[0,-1]];
      const dirs2=pt==='B'?diag:pt==='R'?orth:[...diag,...orth];
      for(const [dr,df] of dirs2){
        let nr=r+dr,nf=f+df;
        while(nr>=0&&nr<8&&nf>=0&&nf<8){
          const t=brd[idx(nr,nf)];
          add(idx(nr,nf),{capture:!!t,selfCapture:t&&pieceColor(t)===color});
          if(t)break;
          nr+=dr;nf+=df;
        }
      }
    }
  }
  return moves;
}

function canCastle(brd, rank, kf, rf, color){
  const kingside=rf>kf;
  const kingDest=kingside?6:2;
  const rookDest=kingside?5:3;

  const mustBeEmpty=new Set();
  const addRange=(a,b)=>{const lo=Math.min(a,b),hi=Math.max(a,b);for(let f2=lo;f2<=hi;f2++)mustBeEmpty.add(f2);};
  addRange(kf,kingDest);
  addRange(rf,rookDest);
  mustBeEmpty.delete(kf);
  mustBeEmpty.delete(rf);

  for(const f2 of mustBeEmpty){
    if(brd[idx(rank,f2)])return false;
  }

  const dir=kingDest>kf?1:-1;
  const steps=Math.abs(kingDest-kf);
  for(let s=0;s<=steps;s++){
    const f2=kf+s*dir;
    const tb=[...brd];tb[idx(rank,kf)]=null;tb[idx(rank,rf)]=null;tb[idx(rank,f2)]=color+'K';
    if(isAttacked(idx(rank,f2),oppColor(color),tb))return false;
  }
  return true;
}

function castleMoves(color, brd=board, cr=castlingRights){
  const moves=[];
  if(inCheck(color,brd))return moves;
  const rank=color==='w'?7:0;
  const kSq=kingPos(color,brd);
  if(kSq<0||rowOf(kSq)!==rank)return moves;
  const kf=colOf(kSq);
  const ks=color==='w'?{K:cr.wK,Q:cr.wQ}:{K:cr.bK,Q:cr.bQ};
  const rooks=color==='w'?chess960Rooks.w:chess960Rooks.b;
  if(ks.K&&rooks.h>=0){
    const rf=colOf(rooks.h);
    if(canCastle(brd,rank,kf,rf,color))
      moves.push({from:kSq,to:idx(rank,6),flags:{castle:'K',rookFrom:rooks.h,rookTo:idx(rank,5)}});
  }
  if(ks.Q&&rooks.a>=0){
    const rf=colOf(rooks.a);
    if(canCastle(brd,rank,kf,rf,color))
      moves.push({from:kSq,to:idx(rank,2),flags:{castle:'Q',rookFrom:rooks.a,rookTo:idx(rank,3)}});
  }
  return moves;
}

function dropMoves(color, pool, brd){
  const moves=[];
  const types=[...new Set(pool)];
  for(const pt of types){
    for(let i=0;i<64;i++){
      if(brd[i])continue;
      const r=rowOf(i);
      if(pt==='P'&&(r===0||r===7))continue;
      moves.push({drop:true,piece:color+pt,to:i});
    }
  }
  return moves;
}

function legalMovesFor(color, brd=board, pl=pools, cr=castlingRights){
  const moves=[];
  const all=pseudoMoves(color,brd,cr);
  for(const m of all){
    const nb=[...brd];
    applyMoveToBoard(nb,m,null,{});
    if(!inCheck(color,nb))moves.push(m);
  }
  for(const m of castleMoves(color,brd,cr)) moves.push(m);
  const pool=pl[color].map(p=>pieceType(p));
  const drops=dropMoves(color,pool,brd);
  for(const m of drops){
    const nb=[...brd];nb[m.to]=m.piece;
    if(!inCheck(color,nb))moves.push(m);
  }
  return moves;
}

function applyMoveToBoard(brd, m, newPools, newCR){
  if(m.drop){brd[m.to]=m.piece;return;}
  const moving=brd[m.from];
  const captured=brd[m.to];
  if(m.flags.castle){
    const c=pieceColor(moving);
    brd[m.from]=null;
    brd[m.flags.rookFrom]=null;
    brd[m.to]=c+'K';
    brd[m.flags.rookTo]=c+'R';
  } else {
    if(captured&&newPools){
      const c=pieceColor(moving);
      const capType=pieceType(captured);
      const gainedBy=m.flags.selfCapture?(selfCaptureMode==='opponent'?oppColor(c):selfCaptureMode==='own'?c:null):c;
      if(gainedBy!==null)newPools[gainedBy]=[...newPools[gainedBy],gainedBy+'P'!==gainedBy+capType&&capType==='P'?'P':capType];
    }
    brd[m.to]=moving;brd[m.from]=null;
    if(m.flags.pawn&&m.promo){brd[m.to]=pieceColor(moving)+m.promo;}
    else if(m.flags.pawn&&((pieceColor(moving)==='w'&&rowOf(m.to)===0)||(pieceColor(moving)==='b'&&rowOf(m.to)===7))){
      brd[m.to]=pieceColor(moving)+'Q';
    }
  }
  if(newCR){updateCastlingRights(m,moving,newCR);}
}

function updateCastlingRights(m, moving, cr){
  if(!moving)return;
  const pt=pieceType(moving);const c=pieceColor(moving);
  if(pt==='K'){if(c==='w'){cr.wK=false;cr.wQ=false;}else{cr.bK=false;cr.bQ=false;}}
  if(pt==='R'){
    if(m.from===chess960Rooks.w.h)cr.wK=false;
    if(m.from===chess960Rooks.w.a)cr.wQ=false;
    if(m.from===chess960Rooks.b.h)cr.bK=false;
    if(m.from===chess960Rooks.b.a)cr.bQ=false;
  }
}

function boardToFen(brd=board, pl=pools, cr=castlingRights, toMove=turn) {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = brd[r*8+f];
      if (!p) { empty++; continue; }
      if (empty) { fen += empty; empty = 0; }
      const ch = pieceType(p);
      fen += pieceColor(p) === 'w' ? ch.toUpperCase() : ch.toLowerCase();
    }
    if (empty) fen += empty;
    if (r < 7) fen += '/';
  }

  // Crazyhouse pocket: uppercase = white holdings, lowercase = black holdings
  let pocket = '';
  for (const p of pl.w) pocket += pieceType(p).toUpperCase();
  for (const p of pl.b) pocket += pieceType(p).toLowerCase();
  if (pocket) fen += '[' + pocket + ']';

  fen += ' ' + toMove + ' ';

  // Chess960 castling: rook file letters (uppercase white, lowercase black)
  let castling = '';
  if (cr.wK && chess960Rooks.w.h >= 0) castling += fileStr(colOf(chess960Rooks.w.h)).toUpperCase();
  if (cr.wQ && chess960Rooks.w.a >= 0) castling += fileStr(colOf(chess960Rooks.w.a)).toUpperCase();
  if (cr.bK && chess960Rooks.b.h >= 0) castling += fileStr(colOf(chess960Rooks.b.h));
  if (cr.bQ && chess960Rooks.b.a >= 0) castling += fileStr(colOf(chess960Rooks.b.a));
  fen += (castling || '-') + ' - 0 1';

  return fen;
}

function saveSnapshot(){
  snapshots.push({
    board:[...board],
    pools:{w:[...pools.w],b:[...pools.b]},
    promotedSquares:new Set(promotedSquares),
    castlingRights:{...castlingRights},
    lastMove:lastMove?{...lastMove}:null,
    turn
  });
}

function saveLiveState(){
  liveState={
    board:[...board],
    pools:{w:[...pools.w],b:[...pools.b]},
    promotedSquares:new Set(promotedSquares),
    castlingRights:{...castlingRights},
    lastMove:lastMove?{...lastMove}:null,
    turn
  };
}
