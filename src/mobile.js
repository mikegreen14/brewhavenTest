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

// On mobile the canvas is squeezed into a much shorter viewport height than
// the fixed 600 logical units, so everything renders smaller on screen than
// on desktop. Bump text/icon sizes up a bit to keep them legible.
const UI_SCALE = MOBILE_MODE ? 1.18 : 1;
function FS(px) { return Math.round(px * UI_SCALE) + 'px'; }

// Background patterns (wall stripes/bricks/panels, vignette) compete with
// the UI for attention on small screens — dim them down on mobile so text
// stands out more.
const WALL_DIM = MOBILE_MODE ? 0.5 : 1;
const VIGNETTE_ALPHA = MOBILE_MODE ? 0.93 : 0.85;
