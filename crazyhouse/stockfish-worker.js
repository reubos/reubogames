const CDN = 'https://cdn.jsdelivr.net/npm/fairy-stockfish-nnue.wasm/';
self.Module = { locateFile: file => CDN + file };
importScripts(CDN + 'stockfish.js');

Stockfish().then(sf => {
  sf.addMessageListener(line => {
    postMessage(line);
  });

  onmessage = e => {
    sf.postCustomMessage(e.data);
  };

  sf.postCustomMessage('uci');
  sf.postCustomMessage('setoption name UCI_Variant value crazyhouse');
  sf.postCustomMessage('setoption name UCI_Chess960 value true');
  sf.postCustomMessage('isready');
});
