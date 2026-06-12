let gameId = 0;

// Init Fairy Stockfish — falls back to built-in AI if it fails
stockfish.init().then(() => {
  const el = document.getElementById('engineLabel');
  if (el) { el.textContent = 'Engine: Stockfish'; el.style.color = 'var(--accent2)'; }
}).catch(() => {});

function newGame(rand960=true) {
  gameId++;
  stockfish.stop();
  turn = 'w';
  gameOver = false;
  selectedSq = null;
  selectedPoolPiece = null;
  legalMoves = [];
  lastMove = null;
  moveHistory = [];
  snapshots = [];
  historyIndex = -1;
  liveState = null;
  aiThinking = false;
  pools = {w:[],b:[]};
  promotedSquares = new Set();
  chess960Rooks = {w:{a:-1,h:-1},b:{a:-1,h:-1}};
  castlingRights = {wK:true,wQ:true,bK:true,bQ:true};

  board = Array(64).fill(null);
  if(rand960) setup960(); else setupClassic();
  initialBoard = [...board];
  initialCR = {...castlingRights};
  mode = document.getElementById('modeSelect').value;
  aiDepth = parseInt(document.getElementById('aiDepth').value);

  renderAll(true);
  updateStatus();
  updateNavButtons();
  updateUndoButton();
  renderMoveLog();

  if(mode==='eve') setTimeout(aiMove,400);
  else if(mode==='pve' && turn==='b') setTimeout(aiMove,400);
}

function tryCastle(side){
  if(gameOver||aiThinking||historyIndex!==-1)return;
  if(mode==='pve'&&turn==='b')return;
  const cm=castleMoves(turn);
  const m=cm.find(m=>m.flags.castle===side);
  if(m&&applyMove(m))endTurn();
}

function applyMove(m, promoType=null){
  const moving=board[m.from];
  const captured=m.drop?null:board[m.to];
  const prevPools={w:[...pools.w],b:[...pools.b]};
  const prevCR={...castlingRights};
  const preMoveBoard=[...board];

  let actualPromo=promoType;
  if(!m.drop&&moving&&pieceType(moving)==='P'){
    const c=pieceColor(moving);
    if((c==='w'&&rowOf(m.to)===0)||(c==='b'&&rowOf(m.to)===7)){
      if(!actualPromo){
        const isHuman=(mode==='pvp')||(mode==='pve'&&turn==='w');
        if(isHuman){showPromo(m);return false;}
        else actualPromo='Q';
      }
    }
  }

  if(captured && !(m.flags&&m.flags.castle)){
    const c=pieceColor(moving);
    const isPromoted = promotedSquares.has(m.to);
    const addType = isPromoted ? 'P' : pieceType(captured);
    const gainedBy=m.flags&&m.flags.selfCapture?oppColor(c):c;
    pools[gainedBy].push(gainedBy+addType);
    promotedSquares.delete(m.to);
  }

  if(!m.drop && promotedSquares.has(m.from)){
    promotedSquares.delete(m.from);
    promotedSquares.add(m.to);
  }

  applyMoveToBoard(board,{...m,promo:actualPromo},null,castlingRights);
  if(!m.drop && moving && pieceType(moving)==='P'){
    const c=pieceColor(moving);
    if((c==='w'&&rowOf(m.to)===0)||(c==='b'&&rowOf(m.to)===7)){
      if(actualPromo) board[m.to]=c+actualPromo;
      promotedSquares.add(m.to);
    }
  }

  if(m.drop){
    const idx2=pools[turn].indexOf(m.piece);
    if(idx2>-1)pools[turn].splice(idx2,1);
  }

  lastMove={from:m.from,to:m.to};
  saveSnapshot();
  logMoveNotation(m, moving, captured, actualPromo, preMoveBoard);
  return true;
}

function logMoveNotation(m, moving, captured, promo, preMoveBoard){
  let note='';

  if(m.flags&&m.flags.castle){
    note = m.flags.castle==='K' ? 'O-O' : 'O-O-O';
  } else if(m.drop){
    note = pieceType(m.piece)+'@'+fileStr(colOf(m.to))+(8-rowOf(m.to));
  } else {
    const pt = pieceType(moving);
    const toSq = fileStr(colOf(m.to))+(8-rowOf(m.to));
    const capX = captured ? 'x' : '';

    if(pt==='P'){
      if(captured){
        note = fileStr(colOf(m.from))+'x'+toSq;
      } else {
        note = toSq;
      }
      if(promo) note += '='+promo;
    } else {
      const fromFile = fileStr(colOf(m.from));
      const fromRank = String(8-rowOf(m.from));

      const ambiguous = [];
      for(let i=0;i<64;i++){
        if(i===m.from) continue;
        const p=preMoveBoard[i];
        if(!p||pieceColor(p)!==pieceColor(moving)||pieceType(p)!==pt) continue;
        const pMoves = legalMovesFor(pieceColor(moving), preMoveBoard, pools, castlingRights);
        if(pMoves.some(pm=>!pm.drop&&pm.from===i&&pm.to===m.to)) ambiguous.push(i);
      }

      let disambig = '';
      if(ambiguous.length > 0){
        const sameFile = ambiguous.some(i=>colOf(i)===colOf(m.from));
        const sameRank = ambiguous.some(i=>rowOf(i)===rowOf(m.from));
        if(!sameFile) disambig = fromFile;
        else if(!sameRank) disambig = fromRank;
        else disambig = fromFile+fromRank;
      }

      note = pt + disambig + capX + toSq;
    }
  }

  const oppColor2 = oppColor(turn);
  const oppInCheck = inCheck(oppColor2);
  if(oppInCheck){
    const oppMoves = legalMovesFor(oppColor2);
    note += oppMoves.length===0 ? '#' : '+';
  }

  moveHistory.push({color:turn, notation:note, snapIdx:snapshots.length-1});
  renderMoveLog();
}

function renderMoveLog(){
  const el=document.getElementById('moveLog');
  let html='';
  for(let i=0;i<moveHistory.length;i+=2){
    const turnNum=Math.floor(i/2)+1;
    const w=moveHistory[i];
    const b=moveHistory[i+1];
    const wActive=historyIndex===w.snapIdx;
    const bActive=b&&historyIndex===b.snapIdx;
    html+=`<div class="log-row">`;
    html+=`<span class="log-num">${turnNum}.</span>`;
    html+=`<span class="log-move${wActive?' log-active':''}" onclick="jumpTo(${w.snapIdx})">${w.notation}</span>`;
    html+=`<span class="log-move${b?' log-move-b':''} ${bActive?'log-active':''}" ${b?`onclick="jumpTo(${b.snapIdx})"`:''}>${b?b.notation:''}</span>`;
    html+=`</div>`;
  }
  el.innerHTML=html||'<span style="color:var(--text3);font-size:0.65rem">No moves yet</span>';
  if(historyIndex===-1) el.scrollTop=el.scrollHeight;
}

function renderEvalBar(raw) {
  const fill=document.getElementById('evalBarFill');
  const label=document.getElementById('evalLabel');
  if(!fill||!label)return;

  const mateW = raw > 90000, mateB = raw < -90000;
  if(mateW||mateB){
    fill.style.height = mateW?'100%':'0%';
    label.textContent = mateW?'+M':'-M';
    label.style.color = mateW?'#e8e6e0':'var(--text3)';
    return;
  }

  const cp = raw / 100;
  const pct = 50 + 50 * (2/(1+Math.exp(-0.4*cp))-1);
  fill.style.height = Math.max(2, Math.min(98, pct)) + '%';

  const display = Math.abs(cp) < 0.05 ? '0.0'
    : (cp > 0 ? '+' : '') + cp.toFixed(1);
  label.textContent = display;
  label.style.color = cp > 0.2 ? '#e8e6e0' : cp < -0.2 ? 'var(--text3)' : 'var(--text2)';
}

function updateEvalBar(){
  const fill=document.getElementById('evalBarFill');
  const label=document.getElementById('evalLabel');
  if(!fill||!label)return;

  if(gameOver){
    const whiteWon = document.getElementById('statusMsg').textContent.startsWith('w')||
                     document.getElementById('statusMsg').textContent.includes('White');
    fill.style.height = whiteWon?'100%':'0%';
    label.textContent = whiteWon?'M':'M';
    label.style.color = whiteWon?'#e8e6e0':'var(--text3)';
    return;
  }

  // Show static eval immediately; Stockfish result will overwrite asynchronously
  renderEvalBar(evaluate(board, pools, castlingRights, promotedSquares));
}

let evalSeq = 0;
function updateEvalBarAsync() {
  if (!stockfish.ready || gameOver) return;
  // Only run on human turns — AI turns use the engine for move search instead
  if (aiThinking) return;
  if (mode === 'eve') return;
  if (mode === 'pve' && turn === 'b') return;

  const mySeq = ++evalSeq;
  const fen = boardToFen();
  const toMove = turn;

  stockfish.evalPosition(fen, toMove).then(score => {
    if (score === null || mySeq !== evalSeq || gameOver) return;
    renderEvalBar(score);
  });
}

function renderAll(withEval=false){
  renderBoard();renderPools();updateCastleButtons();
  if(withEval) updateEvalBar();
}

function updateCastleButtons(){
  const btnK=document.getElementById('btnCastleK');
  const btnQ=document.getElementById('btnCastleQ');
  if(!btnK||!btnQ)return;
  const humanTurn = !gameOver && !aiThinking && historyIndex===-1
    && mode!=='eve' && !(mode==='pve'&&turn==='b');
  if(!humanTurn){btnK.disabled=true;btnQ.disabled=true;return;}
  const cm=castleMoves(turn);
  btnK.disabled=!cm.some(m=>m.flags.castle==='K');
  btnQ.disabled=!cm.some(m=>m.flags.castle==='Q');
}

function renderBoard(){
  const el=document.getElementById('board');
  el.innerHTML='';
  const lmSet=new Set(legalMoves.filter(m=>!m.drop).map(m=>m.to));
  for(let r=0;r<8;r++){
    for(let f=0;f<8;f++){
      const i=idx(r,f);
      const div=document.createElement('div');
      div.className='sq '+((r+f)%2===0?'light':'dark');
      div.dataset.idx=i;

      if(selectedSq===i)div.classList.add('highlight');
      if(lastMove&&(lastMove.from===i||lastMove.to===i))div.classList.add('last-move');
      if(inCheck(turn)&&board[i]===turn+'K')div.classList.add('in-check');
      if(lmSet.has(i)){
        div.classList.add('can-move');
        if(board[i])div.classList.add('occupied');
      }
      if(selectedPoolPiece&&!board[i])div.classList.add('drop-target');

      if(f===0){const c=document.createElement('span');c.className='coords coord-rank';c.textContent=8-r;div.appendChild(c);}
      if(r===7){const c=document.createElement('span');c.className='coords coord-file';c.textContent=fileStr(f);div.appendChild(c);}

      if(board[i]){
        const p=document.createElement('span');
        p.className='piece '+(board[i][0]==='w'?'wp':'bp');p.textContent=PIECES[board[i]];
        div.appendChild(p);
        if(promotedSquares.has(i)){
          const dot=document.createElement('span');
          dot.className='promo-dot';
          div.appendChild(dot);
        }
      }

      div.addEventListener('click',()=>handleSquareClick(i));
      el.appendChild(div);
    }
  }
}

function renderPools(){
  for(const c of ['w','b']){
    const el=document.getElementById('pool'+( c==='w'?'White':'Black'));
    el.innerHTML='';
    if(pools[c].length===0){el.innerHTML='<span class="pool-empty">empty</span>';continue;}
    const counts={};
    for(const p of pools[c])counts[p]=(counts[p]||0)+1;
    for(const [p,n] of Object.entries(counts)){
      const sp=document.createElement('span');
      sp.className='pool-piece '+(p[0]==='w'?'wp':'bp')+(selectedPoolPiece===p?' selected':'');
      sp.textContent=PIECES[p]+(n>1?'×'+n:'');
      sp.title='Drop '+p+(n>1?' ('+n+')':'');
      sp.addEventListener('click',()=>handlePoolClick(p,c));
      el.appendChild(sp);
    }
  }
}

function updateStatus(){
  if(gameOver)return;
  const tl=document.getElementById('turnLabel');
  const sm=document.getElementById('statusMsg');
  tl.textContent=(turn==='w'?'White':'Black')+"'s Turn";
  sm.className='status-msg'+(inCheck(turn)?' check':'');
  sm.textContent=inCheck(turn)?'Check!':'';
  if(mode==='pve'&&turn==='b')sm.textContent='AI thinking...';
}

function setGameOver(msg){
  gameOver=true;
  const el=document.getElementById('statusMsg');
  el.textContent=msg;el.className='status-msg win';
  document.getElementById('turnLabel').textContent='Game Over';
  updateEvalBar();updateUndoButton();
}

function endTurn(){
  turn=oppColor(turn);
  selectedSq=null;selectedPoolPiece=null;legalMoves=[];
  renderAll(true);updateStatus();updateNavButtons();updateUndoButton();

  if(!gameOver){
    const ml=legalMovesFor(turn);
    if(ml.length===0){
      if(inCheck(turn)){setGameOver(oppColor(turn)+' wins by checkmate!');}
      else{setGameOver('Draw by stalemate');}
      return;
    }
    if(mode==='eve'||(mode==='pve'&&turn==='b')){
      document.getElementById('statusMsg').innerHTML='<span class="thinking">AI thinking...</span>';
      setTimeout(aiMove,50);
    } else {
      updateEvalBarAsync();
    }
  }
}

function updateNavButtons(){
  const latest=snapshots.length-1;
  const cur=historyIndex===-1?latest:historyIndex;
  document.getElementById('btnNavFirst').disabled=snapshots.length===0||cur<=0;
  document.getElementById('btnNavPrev').disabled=snapshots.length===0||cur<=0;
  document.getElementById('btnNavNext').disabled=historyIndex===-1||cur>=latest;
  document.getElementById('btnNavLast').disabled=historyIndex===-1;
  const browsing=historyIndex!==-1;
  document.getElementById('browsingBadge').style.display=browsing?'inline-block':'none';
}

function updateUndoButton(){
  const btn=document.getElementById('btnUndo');
  if(!btn)return;
  const canUndo = !gameOver && !aiThinking && historyIndex===-1 && mode!=='eve' && snapshots.length>0
    && !(mode==='pve' && snapshots.length===1);
  btn.disabled = !canUndo;
}

function jumpTo(snapIdx){
  if(snapIdx<0||snapIdx>=snapshots.length)return;
  if(historyIndex===-1) saveLiveState();
  historyIndex=snapIdx;
  const s=snapshots[snapIdx];
  board=[...s.board];
  pools={w:[...s.pools.w],b:[...s.pools.b]};
  promotedSquares=new Set(s.promotedSquares);
  lastMove=s.lastMove?{...s.lastMove}:null;
  selectedSq=null;selectedPoolPiece=null;legalMoves=[];
  renderAll(true);
  updateNavButtons();
  renderMoveLog();
  updateEvalBarAsync();
}

function navHistory(delta){
  const latest=snapshots.length-1;
  const cur=historyIndex===-1?latest:historyIndex;
  const next=cur+delta;
  if(next>latest){returnToLive();return;}
  if(next<0) return;
  jumpTo(next);
}

function returnToLive(){
  if(!liveState&&snapshots.length===0){historyIndex=-1;updateNavButtons();return;}
  const s=liveState||snapshots[snapshots.length-1];
  board=[...s.board];
  pools={w:[...s.pools.w],b:[...s.pools.b]};
  promotedSquares=new Set(s.promotedSquares);
  castlingRights={...s.castlingRights};
  lastMove=s.lastMove?{...s.lastMove}:null;
  turn = liveState ? s.turn : oppColor(s.turn);
  historyIndex=-1;
  liveState=null;
  selectedSq=null;selectedPoolPiece=null;legalMoves=[];
  renderAll(true);updateNavButtons();renderMoveLog();
  updateEvalBarAsync();
}

function undoMove(){
  if(aiThinking||historyIndex!==-1||mode==='eve')return;
  let plies = mode==='pvp' ? 1 : (snapshots.length>=2 ? 2 : 1);
  plies = Math.min(plies, snapshots.length);
  if(plies===0)return;

  const targetSnap = plies===snapshots.length ? null : snapshots[snapshots.length-1-plies];

  if(targetSnap){
    board=[...targetSnap.board];
    pools={w:[...targetSnap.pools.w],b:[...targetSnap.pools.b]};
    promotedSquares=new Set(targetSnap.promotedSquares);
    castlingRights={...targetSnap.castlingRights};
    lastMove=targetSnap.lastMove?{...targetSnap.lastMove}:null;
    turn=oppColor(targetSnap.turn);
  } else {
    board=[...initialBoard];
    pools={w:[],b:[]};
    promotedSquares=new Set();
    castlingRights={...initialCR};
    lastMove=null;
    turn='w';
  }

  snapshots.splice(snapshots.length-plies, plies);
  moveHistory.splice(moveHistory.length-plies, plies);

  liveState=null;
  historyIndex=-1;
  gameOver=false;
  selectedSq=null;selectedPoolPiece=null;legalMoves=[];
  renderAll(true);updateStatus();updateNavButtons();updateUndoButton();renderMoveLog();
  updateEvalBarAsync();
}

function handlePoolClick(piece, poolColor){
  if(gameOver||poolColor!==turn)return;
  if(mode==='pve'&&turn==='b')return;
  if(selectedPoolPiece===piece){selectedPoolPiece=null;legalMoves=[];}
  else{
    selectedPoolPiece=piece;selectedSq=null;
    legalMoves=legalMovesFor(turn).filter(m=>m.drop&&m.piece===piece);
  }
  renderAll();
}

function handleSquareClick(i){
  if(gameOver||aiThinking)return;
  if(historyIndex!==-1)return;
  if(mode==='pve'&&turn==='b')return;
  if(mode==='eve')return;

  if(selectedPoolPiece){
    const m=legalMoves.find(m=>m.drop&&m.to===i);
    if(m){if(applyMove(m)){endTurn();return;}}
    else{selectedPoolPiece=null;legalMoves=[];}
    renderAll();return;
  }

  if(selectedSq!==null){
    if(i===selectedSq){
      selectedSq=null;legalMoves=[];renderAll();return;
    }

    const candidates=legalMoves.filter(m=>!m.drop&&m.to===i&&!(m.flags&&m.flags.castle));

    if(candidates.length===1){
      if(applyMove(candidates[0]))endTurn();
      return;
    }
    if(candidates.length>1){
      showDisambig(candidates,i);
      return;
    }
    if(board[i]&&pieceColor(board[i])===turn){
      selectedSq=i;
      legalMoves=legalMovesFor(turn).filter(m=>!m.drop&&m.from===i&&!(m.flags&&m.flags.castle));
      renderAll();return;
    }
    selectedSq=null;legalMoves=[];renderAll();return;
  }

  if(board[i]&&pieceColor(board[i])===turn){
    selectedSq=i;
    legalMoves=legalMovesFor(turn).filter(m=>!m.drop&&m.from===i&&!(m.flags&&m.flags.castle));
    renderAll();
  }
}

let pendingPromoMove=null;
function showPromo(m){
  pendingPromoMove=m;
  const c=pieceColor(board[m.from]);
  const types=['Q','R','B','N'];
  const container=document.getElementById('promoPieces');
  container.innerHTML='';
  for(const t of types){
    const sp=document.createElement('span');
    sp.className='promo-opt '+(c==='w'?'wp':'bp');sp.textContent=PIECES[c+t];
    sp.onclick=()=>{document.getElementById('promoOverlay').style.display='none';if(applyMove(pendingPromoMove,t))endTurn();};
    container.appendChild(sp);
  }
  document.getElementById('promoOverlay').style.display='flex';
}

function moveLabel(m){
  if(m.flags&&m.flags.castle) return m.flags.castle==='K' ? 'Castle kingside (O-O)' : 'Castle queenside (O-O-O)';
  if(m.flags&&m.flags.selfCapture) return 'Self-capture (send to opponent pool)';
  if(m.flags&&m.flags.capture) return 'Capture piece';
  return 'Move here';
}

function showDisambig(candidates, toSq){
  const overlay=document.getElementById('disambigOverlay');
  const box=document.getElementById('disambigBox');
  const opts=document.getElementById('disambigOptions');
  opts.innerHTML='';

  for(const m of candidates){
    const btn=document.createElement('button');
    btn.textContent=moveLabel(m);
    btn.style.cssText='text-align:left;padding:8px 12px;width:100%;font-size:0.7rem;';
    btn.onclick=()=>{
      closeDisambig();
      if(applyMove(m))endTurn();
    };
    opts.appendChild(btn);
  }

  const boardEl=document.getElementById('board');
  const boardRect=boardEl.getBoundingClientRect();
  const sqSize=boardRect.width/8;
  const f=colOf(toSq), r=rowOf(toSq);
  let x=boardRect.left+f*sqSize+sqSize;
  let y=boardRect.top+r*sqSize;
  const vw=window.innerWidth, vh=window.innerHeight;
  if(x+180>vw) x=boardRect.left+f*sqSize-180;
  if(y+140>vh) y=vh-140;
  box.style.left=x+'px';
  box.style.top=y+'px';
  overlay.style.display='block';
}

function closeDisambig(){
  document.getElementById('disambigOverlay').style.display='none';
}

newGame(true);
