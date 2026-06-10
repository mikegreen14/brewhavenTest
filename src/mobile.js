/*
 * Mobile mode detection. Loaded first so every later script (and the inline
 * orientation-watcher in index.html) can read MOBILE_MODE / isPortrait().
 */

// Mobile mode = small viewport (phones/small tablets), checked once at load.
// Using the smaller dimension means it stays stable across orientation changes.
const MOBILE_MODE = Math.min(window.innerWidth, window.innerHeight) <= 700;

function isPortrait() { return window.innerHeight > window.innerWidth; }

// Mobile browsers resize the viewport when their UI chrome (address bar,
// etc.) shows/hides, which makes 100vh jump around. Track the real
// viewport height in a CSS variable so #game can use it instead.
function setViewportHeight() {
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
setViewportHeight();
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);

// On mobile we play in forced landscape, so use the device's long/short side
// ratio (stable regardless of current orientation) to pick a wider logical
// canvas than the desktop 800x600 — this lets Phaser's FIT mode fill a wide
// phone screen edge-to-edge instead of leaving big side bars.
const longSide = Math.max(window.innerWidth, window.innerHeight);
const shortSide = Math.min(window.innerWidth, window.innerHeight);
const landscapeAspect = longSide / shortSide;
window.GAME_WIDTH = MOBILE_MODE
  ? Math.round(Math.min(1200, Math.max(800, 600 * landscapeAspect)))
  : 800;
