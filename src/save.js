/*
 * Persistent save data (roguelite meta-progression).
 *
 * One versioned localStorage key holds the only thing that survives between
 * runs: the best level reached. Everything else (coins, upgrades, cosmetics,
 * hearts) resets every run in GameScene.create().
 *
 * If localStorage is unavailable (private mode, blocked), Save degrades to a
 * session-only in-memory store: the game still works, it just forgets on close.
 */
const Save = (() => {
  const KEY = 'brewhaven_save_v1';
  const DEFAULTS = {
    v: 1,
    bestLevel: 0,
    setupDone: false,
    shopName: '',
    baristaName: '',
    apronColor: 'teal',
    seenTutorials: [],
  };

  let available = false;
  try {
    localStorage.setItem(KEY + '_probe', '1');
    localStorage.removeItem(KEY + '_probe');
    available = true;
  } catch (e) { /* private mode / blocked — run in-memory only */ }

  let data = { ...DEFAULTS };
  if (available) {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      if (parsed && parsed.v === 1) data = { ...DEFAULTS, ...parsed };
    } catch (e) { /* corrupt save — start from defaults */ }
  }

  return {
    data,
    write() {
      if (!available) return;
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    },
  };
})();
