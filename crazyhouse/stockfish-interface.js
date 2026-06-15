class StockfishInterface {
  constructor() {
    this.sf = null;
    this.ready = false;
    this._onLine = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      if (typeof Stockfish === 'undefined') {
        reject(new Error('Stockfish not loaded'));
        return;
      }
      Stockfish().then(sf => {
        this.sf = sf;
        sf.addMessageListener(line => {
          if (this._onLine) this._onLine(line);
          if (!this.ready && line.trim() === 'readyok') {
            this.ready = true;
            resolve();
          }
        });
        try {
          sf.FS.writeFile('/variants.ini',
            '[crazyhouse-wall:crazyhouse]\ncustomPiece1 = w:\nimmobile = w\n');
          sf.postCustomMessage('load /variants.ini');
        } catch(e) {}
        sf.postCustomMessage('uci');
        sf.postCustomMessage('setoption name UCI_Variant value crazyhouse');
        sf.postCustomMessage('setoption name UCI_Chess960 value true');
        sf.postCustomMessage('isready');
      }).catch(reject);
    });
  }

  _cmd(command) {
    if (this.sf) this.sf.postCustomMessage(command);
  }

  setSkillLevel(level) {
    this._cmd(`setoption name Skill Level value ${level}`);
  }

  stop() {
    this._cmd('stop');
    // Drain the bestmove response then clear the handler
    const prev = this._onLine;
    this._onLine = line => {
      if (line.startsWith('bestmove')) this._onLine = null;
    };
  }

  getBestMove(fen, movetime, variant = 'crazyhouse') {
    return new Promise(resolve => {
      let lastScore = 0;

      this._onLine = line => {
        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        if (cpMatch) lastScore = parseInt(cpMatch[1]);
        const mateMatch = line.match(/\bscore mate (-?\d+)/);
        if (mateMatch) lastScore = parseInt(mateMatch[1]) > 0 ? 99000 : -99000;

        if (line.startsWith('bestmove')) {
          this._onLine = null;
          const move = line.split(' ')[1];
          resolve({ move: move === '(none)' ? null : move, score: lastScore });
        }
      };

      this._cmd(`setoption name UCI_Variant value ${variant}`);
      this._cmd(`position fen ${fen}`);
      this._cmd(`go movetime ${movetime}`);
    });
  }

  quickEval(fen, variant = 'crazyhouse') {
    return new Promise(resolve => {
      let score = 0;

      this._onLine = line => {
        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        if (cpMatch) score = parseInt(cpMatch[1]);

        if (line.startsWith('bestmove')) {
          this._onLine = null;
          resolve(score);
        }
      };

      this._cmd(`setoption name UCI_Variant value ${variant}`);
      this._cmd(`position fen ${fen}`);
      this._cmd('go depth 1');
    });
  }

  // Evaluates a position and resolves with score from white's perspective (centipawns).
  // Returns null immediately if the engine is busy.
  evalPosition(fen, toMove, variant = 'crazyhouse') {
    if (this._onLine) return Promise.resolve(null);

    return new Promise(resolve => {
      let score = 0;
      let isMate = false;
      let mateIn = 0;

      this._onLine = line => {
        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        if (cpMatch) { score = parseInt(cpMatch[1]); isMate = false; }
        const mateMatch = line.match(/\bscore mate (-?\d+)/);
        if (mateMatch) { isMate = true; mateIn = parseInt(mateMatch[1]); }

        if (line.startsWith('bestmove')) {
          this._onLine = null;
          let whiteScore;
          if (isMate) {
            const whiteWins = toMove === 'w' ? mateIn > 0 : mateIn < 0;
            whiteScore = whiteWins ? 99000 : -99000;
          } else {
            whiteScore = toMove === 'w' ? score : -score;
          }
          resolve(whiteScore);
        }
      };

      this._cmd(`setoption name UCI_Variant value ${variant}`);
      this._cmd(`position fen ${fen}`);
      this._cmd('go movetime 200');
    });
  }
}

const stockfish = new StockfishInterface();
