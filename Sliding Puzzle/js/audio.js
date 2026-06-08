let _audioCtx = null;
function _ac() { return _audioCtx || (_audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }

function playMove() {
  if (!options.sounds) return;
  const ctx = _ac(), o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(220, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.07);
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.09);
}

function playInvalid() {
  if (!options.sounds) return;
  const ctx = _ac(), o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'square'; o.frequency.setValueAtTime(110, ctx.currentTime);
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.12);
}

function playVictory() {
  if (!options.sounds) return;
  const ctx = _ac();
  [261.63, 329.63, 392, 523.25].forEach((freq, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.13;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  });
}
