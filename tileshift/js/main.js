// Initialise on load — load first saved layout if one exists, otherwise default
(function () {
  const saved = loadSavedLayouts();
  const userKeys = loadLayoutOrder(Object.keys(saved));
  if (userKeys.length) {
    // Existing user — start on their first saved layout
    currentLayoutKey = userKeys[0];
    const p = saved[userKeys[0]];
    initEditor({ ...p, barriers: new Set(p.barriers) });
  } else {
    // New user — start on the first built-in layout
    currentLayoutKey = BUILTIN_ORDER[0];
    const p = BUILTIN_LAYOUTS[BUILTIN_ORDER[0]];
    initEditor({ ...p, barriers: new Set(p.barriers) });
  }
})();
buildSavedLayoutButtons();
renderMarkPicker();
syncOptionCheckboxes();
startGameSolved();

// Spacebar to play again after solving
document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    const overlay = document.getElementById('winOverlay');
    if (overlay && overlay.classList.contains('show')) {
      e.preventDefault();
      reshuffleGame();
      overlay.classList.remove('show');
    }
  }
});

// Stats hover: highlight wrong / show goal ghosts
(function () {
  const mount = document.getElementById('puzzleMount');

  const wrongStat = document.getElementById('misplacedStat');
  wrongStat.addEventListener('mouseenter', () => mount.classList.add('hl-wrong'));
  wrongStat.addEventListener('mouseleave', () => mount.classList.remove('hl-wrong'));

  const goalStat = document.getElementById('goalStat');
  goalStat.addEventListener('mouseenter', () => mount.classList.add('hl-solved'));
  goalStat.addEventListener('mouseleave', () => mount.classList.remove('hl-solved'));
})();
