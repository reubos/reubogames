class StockfishInterface {
  constructor() {
    this.worker = null;
    this.ready = false;
    this._onLine = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      this.worker = new Worker('stockfish-worker.js');

      this.worker.onmessage = e => {
        const line = e.data;
        if (this._onLine) this._onLine(line);
        if (!this.ready && line === 'readyok') {
          this.ready = true;
          resolve();
        }
      };

      this.worker.onerror = err => reject(err);
    });
  }

  _cmd(command) {
    if (this.worker) this.worker.postMessage(command);
  }

  stop() {
    this._cmd('stop');
    // Drain the bestmove response then clear the handler
    const prev = this._onLine;
    this._onLine = line => {
      if (line.startsWith('bestmove')) this._onLine = null;
    };
  }

  getBestMove(fen, movetime) {
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

      this._cmd(`position fen ${fen}`);
      this._cmd(`go movetime ${movetime}`);
    });
  }

  quickEval(fen) {
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

      this._cmd(`position fen ${fen}`);
      this._cmd('go depth 1');
    });
  }
}

const stockfish = new StockfishInterface();
