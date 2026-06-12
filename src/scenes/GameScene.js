/*
 * GameScene — the whole coffee shop, now with a LEVEL run.
 *
 * Core loop: customers queue up wanting a specific DRINK; each drink is a
 * sequence of pour STEPS made at specific STATIONS. Move the BARISTA between
 * stations, hold to pour, release inside the green "fill zone". Single-step
 * drinks serve on release; two-step drinks (Latte, Matcha, Dirty Cola) lock in
 * a base layer, then get milk/cream poured on top at the milk station.
 *
 * Run structure:
 *   - Each level has a quota of correct drinks to serve.
 *   - Levels get harder: faster spawns, less patience, tighter zones, bigger
 *     queues, more drink variety.
 *   - Stations unlock as you go: espresso from the start, drip joins at
 *     level 2, the milk & cream station at level 5, the soda fountain at
 *     level 10.
 *   - 3 hearts. Lose one on: customer walks out, wrong drink, or a spill.
 *     Zero hearts = Game Over.
 *   - Clear a level → pick 1 of 3 perk cards → next level.
 *
 * Juice: pour stream + splash, steam, squash/stretch hops, floating hearts,
 * flying coins, drink-colored liquid, combo multiplier, and screen shake.
 */

// ---- World layout ----------------------------------------------------------
const GW = window.GAME_WIDTH || 800, GH = 600;
const WALL_BOTTOM = 300;
const COUNTER_TOP = 300, COUNTER_BOTTOM = 348;

// ---- Dev mode (?dev=1, optional &level=N) for quick level playtesting -----
const DEV_MODE = /[?&]dev(=1)?(&|$)/.test(location.search);
const DEV_START_LEVEL = (() => {
  const m = location.search.match(/[?&]level=(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : null;
})();

// Stations unlock as the run progresses (`unlock` = first level they appear).
// `color` is the sign/bubble accent; `liquid` is what pours out when there is
// no matching order step to color the stream.
const STATIONS = [
  { id: 'espresso', type: 'espresso', x: 110, unlock: 1, tex: 'machine',
    pourSpeed: 0.52, color: 0x7a4f30, liquid: 0x4f3220, sign: 'ESPRESSO' },
  { id: 'drip', type: 'drip', x: 260, unlock: 2, tex: 'dripper',
    pourSpeed: 0.30, color: 0x4aa84a, liquid: 0x6b4226, sign: 'DRIP & TEA' },
  { id: 'milk', type: 'milk', x: 410, unlock: 5, tex: 'milker',
    pourSpeed: 0.45, color: 0xb88a3c, liquid: 0xf0e6d2, sign: 'MILK & CREAM' },
  { id: 'soda', type: 'soda', x: 545, unlock: 10, tex: 'soda',
    pourSpeed: 0.62, color: 0xc4453c, liquid: 0x2a1a12, sign: 'SODA' },
];

const CUP = { top: 302, bottom: 374, halfW: 28, wall: 4 };
CUP.innerTop = CUP.top + CUP.wall;
CUP.innerBottom = CUP.bottom - CUP.wall;
CUP.innerH = CUP.innerBottom - CUP.innerTop;
const SPOUT_Y = 300;

const SERVE_X = 600;
const QUEUE_SPACING = 80;
const FLOOR_Y = 512;
const BARISTA_Y = 482;

// Drinks are a sequence of pour `steps` made in one cup. Single-step drinks
// work exactly like before. Two-step drinks (Latte, Matcha, Dirty Cola) pour a
// base layer, then milk/cream on top: each step's `target` is the TOTAL fill
// after that step, and quality is judged on the final fill. `unlock` = first
// level the drink can be ordered. Multi-step drinks pay more (higher `mult`).
const DRINKS = [
  { name: 'Espresso', letter: 'E', unlock: 1, mult: 1.1,
    steps: [{ station: 'espresso', target: 0.40, tol: 0.06, color: 0x3a2418 }] },
  { name: 'Drip', letter: 'D', unlock: 2, mult: 1.3,
    steps: [{ station: 'drip', target: 0.85, tol: 0.07, color: 0x6b4226 }] },
  { name: 'Tea', letter: 'T', unlock: 3, mult: 1.2,
    steps: [{ station: 'drip', target: 0.58, tol: 0.07, color: 0xb5832f }] },
  { name: 'Latte', letter: 'L', unlock: 5, mult: 1.8,
    steps: [{ station: 'espresso', target: 0.38, tol: 0.06, color: 0x3a2418 },
            { station: 'milk', target: 0.80, tol: 0.06, color: 0xe8d9b8 }] },
  { name: 'Matcha', letter: 'M', unlock: 5, mult: 1.8,
    steps: [{ station: 'drip', target: 0.42, tol: 0.06, color: 0x6e9e3f },
            { station: 'milk', target: 0.82, tol: 0.06, color: 0xcfe3b0 }] },
  { name: 'Cola', letter: 'C', unlock: 10, mult: 1.5,
    steps: [{ station: 'soda', target: 0.78, tol: 0.06, color: 0x2a1a12 }] },
  { name: 'Dirty Cola', letter: 'DC', unlock: 10, mult: 2.1,
    steps: [{ station: 'soda', target: 0.55, tol: 0.06, color: 0x2a1a12 },
            { station: 'milk', target: 0.85, tol: 0.05, color: 0xc9b49a }] },
];

const COL = { dark: 0x2a2030, cream: 0xf4efe6, crema: 0xd9b98c, zone: 0x4fc46a };

// ---- Hireable employee (unlocks after clearing level 10) -------------------
const EMPLOYEE_HIRE_COST = 250;
const EMPLOYEE_WAGE_BASE = 6;
const EMPLOYEE_WAGE_PER_LEVEL = 0.6;
const EMPLOYEE_POUR_UPGRADE = { baseCost: 90, rate: 1.6, amt: 0.06 };

// ---- Per-machine Store upgrades (Pour Speed / Steady Hands) ----------------
const STATION_UPGRADES = {
  pour: { title: 'Faster Pour',  icon: '⚡', baseCost: 40, rate: 1.55, amt: 0.07 },
  tol:  { title: 'Steady Hands', icon: '🎯', baseCost: 70, rate: 1.65, amt: 0.015 },
};

// Repeatable abilities (Store upgrades, the Staff pour upgrade, and matching
// perk cards) cap out at this level for balance — bypassed in DEV_MODE.
const ABILITY_LEVEL_CAP = 10;

// ---- Rush Hour (activates every 10 levels) ----------------------------------
const RUSH_HARD_TIMER_PATIENCE = 4;    // seconds — fixed, ignores patienceBonus
const RUSH_ZONE_DRIFT_AMT      = 0.07; // ±fraction of cup height (Moving Target)
const RUSH_ZONE_DRIFT_SPEED    = 700;  // ms per half-cycle

const RUSH_MODIFIERS = [
  { id: 'critic',
    title: 'Critic Customers',  icon: '🧐',
    desc: 'Only PERFECT pours accepted.\nGood pours count as wrong orders!' },
  { id: 'hardTimer',
    title: 'Hard-Timer VIPs',   icon: '⏱',
    desc: 'VIP customers have a fixed 4-second\ntimer. Patience upgrades won\'t help them.' },
  { id: 'waveSpawn',
    title: 'Wave Spawn',         icon: '🌊',
    desc: 'The queue floods instantly and\nrefills the moment a slot opens.' },
  { id: 'comboKiller',
    title: 'Combo Killer',       icon: '💀',
    desc: 'Wrong drinks and spills cost an\nextra heart on top of breaking your combo.' },
  { id: 'speedMalfunction',
    title: 'Speed Malfunction',  icon: '⚡',
    desc: 'All machines pour at 2× speed.\nTiming is everything.' },
  { id: 'movingTarget',
    title: 'Moving Target',      icon: '🎯',
    desc: 'The green zone drifts while you pour.\nFollow it — don\'t pour from memory.' },
  { id: 'noSpill',
    title: 'No-Spill Inspector', icon: '🔍',
    desc: 'A health inspector is watching.\nAny spill costs 2 hearts instead of 1.' },
];

// ---- Customer quips ---------------------------------------------------------
// Shown above a customer's head when their patience bar runs low, and as a
// floating aside when they walk out, get the wrong drink, or get spilled on.
const IMPATIENT_QUIPS = [
  'Any day now…', 'I have places to be!', 'Tick tock, barista.',
  'Is this coffee grown to order?', "I'm aging here.",
  'Did the beans go on a trip?', 'Helloo? Anyone home?',
  'My coffee dream is fading...', 'I could brew this myself by now.',
  'Five more minutes and I\'m out.',
];
const ANGRY_QUIPS = [
  "This isn't what I ordered!", 'Yuck, what IS this?!',
  'One star. ONE star.', "I'm never coming back!",
  'My dog makes better coffee.', 'Unbelievable service.',
  "I'm switching to tea. Forever.", 'Did you even look at my order?',
  'This place has gone downhill.', "I'm telling EVERYONE about this.",
];

// ---- Store catalogs --------------------------------------------------------
// Cosmetics now also grant a one-time mechanical perk (better = pricier).
// `perk` is a {stat, amt} descriptor applied by GameScene.applyPerk().
//
// Wall themes: a gradient + a pattern. `swatch` is used for the store preview.
const WALL_THEMES = {
  plaster: { name: 'Plaster', price: 0, top: 0x52415f, bottom: 0x7c6488, pattern: 'stripes', swatch: 0x6a5476 },
  brick: { name: 'Red Brick', price: 70, top: 0x7e4038, bottom: 0x9e564c, pattern: 'brick', swatch: 0x8c4a40,
    perk: { stat: 'patience', amt: 1, text: '+1s patience' } },
  sky: { name: 'Sky Blue', price: 80, top: 0x6fa8d6, bottom: 0xb2dcf2, pattern: 'stripes', swatch: 0x8fc2e6,
    perk: { stat: 'combo', amt: 0.015, text: '+combo pay' } },
  forest: { name: 'Forest', price: 80, top: 0x336e42, bottom: 0x57935f, pattern: 'stripes', swatch: 0x44803f,
    perk: { stat: 'patience', amt: 1.5, text: '+1.5s patience' } },
  sunset: { name: 'Sunset', price: 100, top: 0xd9663f, bottom: 0xf2b06a, pattern: 'plain', swatch: 0xe68a52,
    perk: { stat: 'combo', amt: 0.02, text: '+combo pay' } },
  cafe: { name: 'Cozy Wood', price: 120, top: 0x5a3f2a, bottom: 0x82603c, pattern: 'panel', swatch: 0x6e4f33,
    perk: { stat: 'combo', amt: 0.025, text: '+combo pay' } },
};

// Machine "skin" tiers — auto-applied per station once BOTH its Pour Speed
// and Steady Hands upgrades reach the tier's level (tier = min of the two,
// capped at the highest tier). Tier 0 is each station's default texture
// (e.g. 'machine'); tiers 1-5 use '<tex>_<id>' textures generated in
// pixelArt.js (SKIN_TIER_PALETTES).
const STATION_SKIN_TIERS = ['black', 'mint', 'copper', 'silver', 'gold'];

// ---- Perk-card rarity tiers ("casino roll" between levels) ----------------
// Each level-up card independently rolls one of these tiers (weights sum to
// 100); higher tiers scale the perk's effect by `mult` (see scaleCardAmt).
const CARD_TIERS = [
  { id: 'bronze',   label: 'BRONZE',   weight: 50, mult: 1,   color: 0xcd7f32, glow: 0xe3a96a },
  { id: 'silver',   label: 'SILVER',   weight: 30, mult: 1.3, color: 0xc7d0da, glow: 0xeaf0f7 },
  { id: 'gold',     label: 'GOLD',     weight: 15, mult: 1.6, color: 0xffd700, glow: 0xfff3a0 },
  { id: 'platinum', label: 'PLATINUM', weight: 5,  mult: 2.2, color: 0x7df9ff, glow: 0xd0feff },
];
const CARD_TIER_TOTAL_WEIGHT = CARD_TIERS.reduce((sum, t) => sum + t.weight, 0);

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // Run upgrades (modified by perk cards) — reset every run.
    this.patienceBonus = 0;
    this.baristaMoveDur = 360;
    this.comboStep = 0.1;
    this.maxLives = 3;
    this.lives = 3;

    this.storeTab = 'walls';
    this.decorCatalog = [
      { id: 'art', name: 'Wall Art', price: 40, emoji: '🖼', place: () => this.placeArt(), perk: { stat: 'combo', amt: 0.01, text: '+combo pay' } },
      { id: 'plant2', name: 'Potted Plant', price: 50, emoji: '🪴', place: () => this.addPlant(), perk: { stat: 'patience', amt: 1.5, text: '+1.5s patience' } },
      { id: 'rug', name: 'Floor Rug', price: 60, emoji: '🟧', place: () => this.placeRug(), perk: { stat: 'combo', amt: 0.015, text: '+combo pay' } },
      { id: 'lights', name: 'String Lights', price: 80, emoji: '✨', place: () => this.placeStringLights(), perk: { stat: 'patience', amt: 1.5, text: '+1.5s patience' } },
      { id: 'cat', name: 'Shop Cat', price: 90, emoji: '🐱', place: () => this.placeCat(), perk: { stat: 'combo', amt: 0.02, text: 'lucky +combo pay' } },
      { id: 'neon', name: 'Neon Sign', price: 120, emoji: '🟪', place: () => this.placeNeon(), perk: { stat: 'combo', amt: 0.03, text: '+combo pay' } },
    ];

    // Everything above is run-only; the sole persistent stat is bestLevel.
    this.coins = DEV_MODE ? 999999 : 0;
    this.runStartBest = Save.data.bestLevel;
    this.equippedWall = 'plaster';
    this.ownedWalls = new Set(['plaster']);
    this.ownedDecor = new Set();

    // Repeatable mechanical upgrades (same effects as the level-end perks),
    // now buyable in the Store. Cost escalates with each level purchased.
    this.shopUpgrades = [
      { id: 'calm', title: 'Calm Crowd', icon: '😌', baseCost: 55, rate: 1.55, level: 0, perk: { stat: 'patience', amt: 0.5 } },
      { id: 'combo', title: 'Combo Pro', icon: '🔥', baseCost: 80, rate: 1.7, level: 0, perk: { stat: 'combo', amt: 0.04 } },
      { id: 'heart', title: 'Extra Heart', icon: '❤️', baseCost: 120, rate: 2.0, level: 0, perk: { stat: 'heart', amt: 1 } },
    ];

    // Combined level count per stat across Store upgrades + perk-card picks.
    // Cosmetic one-time perks (walls/makers/decor) are NOT tracked here.
    this.abilityLevels = { patience: 0, combo: 0, heart: 0, feet: 0 };

    this.rushModifiers = [];
    this.zoneOffset = 0;
    this.rushOverlayObjs = [];
    this._pendingRushModifiers = null;
    this._rushShakeTimer = null;

    // Per-machine selection for the Store's "Machines" tab.
    this.storeMachineIndex = 0;

    // Runtime state.
    this.fill = 0;          // total fill, including locked layers below
    this.lockedFill = 0;    // fill committed by completed steps
    this.lockedLayers = []; // [{from, to, color}] for drawing finished layers
    this.stepIndex = 0;     // current step of the FRONT customer's order
    this.pouring = false;
    this.serving = false;
    this.moving = false;
    this.current = 0;
    this.spilled = false;
    this.streak = 0;
    this.customers = [];
    this.employee = { hired: false, station: null, pourLevel: 0, busy: false, sprite: null, shadow: null };
    this.state = 'playing';
    this.level = 0;
    this.served = 0;
    this.plantSlots = [{ x: 480, y: 250 }, { x: 540, y: 250 }, { x: 760, y: 250 }, { x: 715, y: 150 }];

    this.buildWorld();
    this.buildPourStation();
    this.buildUI();
    this.bindInput();
    if (MOBILE_MODE) this.buildMobileControls();

    if (DEV_MODE && DEV_START_LEVEL) {
      this.startLevel(DEV_START_LEVEL, true);
    } else {
      this.startLevel(1);
    }
  }

  stationX() { return STATIONS[this.current].x; }
  activeStation() { return STATIONS[this.current]; }
  activeOrder() { return this.customers.length ? this.customers[0].order : null; }

  // The cup graphic/splash/steam render at the employee's station while
  // they're mid-pour, otherwise wherever the player is standing.
  cupX() { return (this.employee.busy && this.employee.station != null) ? STATIONS[this.employee.station].x : this.stationX(); }

  employeesUnlocked() { return DEV_MODE || Save.data.bestLevel >= 11; }
  employeePourCost() { return Math.floor(EMPLOYEE_POUR_UPGRADE.baseCost * Math.pow(EMPLOYEE_POUR_UPGRADE.rate, this.employee.pourLevel)); }
  employeePourMaxed() { return !DEV_MODE && this.employee.pourLevel >= ABILITY_LEVEL_CAP; }

  // ===========================================================================
  // Level flow
  // ===========================================================================
  levelConfig(n) {
    return {
      quota: 5 + n,
      spawnInterval: Math.max(1100, 3800 - (n - 1) * 350),
      patience: Math.max(6, 15 - (n - 1) * 1.2),
      tolScale: Math.max(0.45, 1 - (n - 1) * 0.10),   // green zone shrinks
      maxQueue: Math.min(5, 3 + Math.floor((n - 1) / 2)),
      // The menu grows with the run: Espresso (L1), Drip (L2), Tea (L3),
      // Latte + Matcha (L5, milk station), Cola + Dirty Cola (L10, fountain).
      drinkPool: DRINKS.filter((d) => d.unlock <= n),
    };
  }

  isRushLevel(n) { return n > 0 && n % 10 === 0; }

  selectRushModifiers(n) {
    const count = Math.min(Math.floor(n / 10), RUSH_MODIFIERS.length);
    return Phaser.Utils.Array.Shuffle(RUSH_MODIFIERS.slice()).slice(0, count).map((m) => m.id);
  }

  startLevel(n, skipBest) {
    this.level = n;
    if (!skipBest && n > Save.data.bestLevel) { Save.data.bestLevel = n; Save.write(); }
    this.cfg = this.levelConfig(n);
    this.rushModifiers = this.isRushLevel(n)
      ? (this._pendingRushModifiers || this.selectRushModifiers(n))
      : [];
    this._pendingRushModifiers = null;
    this.zoneOffset = 0;
    this.destroyRushOverlay();
    this.served = 0;
    this.state = 'playing';
    STATIONS.forEach((st) => { if (n >= st.unlock && !st.revealed) this.revealStation(st); });
    this.updateLevelUI();
    this.updateHearts();
    if (this.rushModifiers.length) this.buildRushOverlay();
    this.showBanner('LEVEL ' + n, this.rushModifiers.length ? '#e5564d' : '#ffe082', 'Serve ' + this.cfg.quota + ' drinks');
    if (n === 1) {
      this.time.delayedCall(1000, () => this.showTutorialOnce('l1Welcome',
        GW / 2, COUNTER_TOP - 150,
        'Welcome to ' + (Save.data.shopName || 'Brewhaven') + ', '
          + (Save.data.baristaName || 'Barista') + '!\n'
          + 'When customers walk in, their\norder appears in a bubble above\n'
          + 'their head — match the drink,\nthen pour it at the right station.',
        () => this.showTutorialOnce('l1Espresso',
          STATIONS[0].x, COUNTER_TOP - 150,
          'This is your espresso\nmachine — use it to fill\nespresso orders!'
        )
      ));
    } else if (n === 2) {
      this.time.delayedCall(1300, () => this.showTutorialOnce('l2Drip',
        STATIONS[1].x, COUNTER_TOP - 150,
        'New machine! Customers\ncan now order Drip Coffee\n— use this machine to fill\nthose orders!'
      ));
    } else if (n === 3) {
      this.time.delayedCall(1000, () => this.showTutorialOnce('l3Tea',
        STATIONS[1].x, COUNTER_TOP - 150,
        'The drip machine can now\nalso serve Tea — use it to\nfill tea orders too!',
        () => this.showTutorialOnce('l3Store',
          GW / 2, COUNTER_TOP - 150,
          'Tip: open the STORE\n(top right) anytime to\nspend coins on upgrades,\nmachine skins, walls, and\ndecorations!'
        )
      ));
    } else if (n === 5) {
      this.time.delayedCall(1300, () => this.showTutorialOnce('l5Milk',
        STATIONS[2].x, COUNTER_TOP - 150,
        'New machine! Customers\ncan now order Lattes &\nMatchas — pour the base,\nthen top up here with\nmilk/cream!'
      ));
    } else if (n === 10) {
      this.time.delayedCall(1300, () => this.showTutorialOnce('l10Soda',
        STATIONS[3].x, COUNTER_TOP - 150,
        'New machine! Customers\ncan now order Cola &\nDirty Cola — Dirty Cola\nneeds cream from the milk\nstation after!'
      ));
    } else if (n === 11) {
      this.time.delayedCall(1300, () => this.showTutorialOnce('l11Staff',
        GW / 2, COUNTER_TOP - 150,
        'You cleared Level 10!\nThe Store now has a\nStaff tab — hire a\nbarista to auto-pour one\nmachine for you!'
      ));
    }
    this.scheduleSpawn();
    if (this.rushModifiers.includes('waveSpawn')) {
      for (let i = 0; i < this.cfg.maxQueue; i++) this.spawnCustomer();
    } else {
      this.spawnCustomer();
    }
  }

  // Dev-mode only: cleanly tear down the in-progress level and jump to `n`,
  // re-running its reveal/tutorial without touching the persisted best level.
  devJumpToLevel(n) {
    n = Math.max(1, n);
    this.cancelPour();
    if (this.spawnTimer) this.spawnTimer.remove();
    this.customers.slice().forEach((c) => this.sendOff(c, false));
    this.customers = [];
    this.lives = this.maxLives;
    this.updateHearts();
    this.startLevel(n, true);
  }

  completeLevel() {
    this.state = 'levelComplete';
    this.destroyRushOverlay();
    this.cancelPour();
    if (this.spawnTimer) this.spawnTimer.remove();
    // Politely clear anyone still waiting (no penalty).
    this.customers.slice().forEach((c) => this.sendOff(c, false));
    this.customers = [];

    if (this.employee.hired) {
      const wage = Math.round(EMPLOYEE_WAGE_BASE + this.level * EMPLOYEE_WAGE_PER_LEVEL);
      this.coins = Math.max(0, this.coins - wage);
      this.updateCoinText();
      this.floatingText(GW / 2, COUNTER_TOP - 60, '-' + wage + ' wages', '#e5564d');
    }

    this.showBanner('LEVEL ' + this.level + ' CLEAR!', '#6abf5a', '');
    this.time.delayedCall(1100, () => this.showCardPick());
  }

  gameOver() {
    this.state = 'gameOver';
    this.destroyRushOverlay();
    this.cancelPour();
    if (this.spawnTimer) this.spawnTimer.remove();
    this.customers.slice().forEach((c) => this.sendOff(c, false));
    this.customers = [];
    this.showGameOver();
  }

  // ===========================================================================
  // World
  // ===========================================================================
  buildWorld() {
    // Wall lives on its own layer so the Store can re-theme it.
    this.wallGfx = this.add.graphics().setDepth(0);
    this.drawWall(this.equippedWall);

    const g = this.add.graphics().setDepth(0);

    // --- Floor: warm planks w/ alternating shade + ambient occlusion ---
    g.fillStyle(0x5b4633, 1); g.fillRect(0, COUNTER_BOTTOM, GW, GH - COUNTER_BOTTOM);
    let shade = false;
    for (let y = COUNTER_BOTTOM; y < GH; y += 24) {
      if (shade) { g.fillStyle(0x523f2d, 1); g.fillRect(0, y, GW, 24); }
      shade = !shade;
    }
    g.lineStyle(2, 0x3f3022, 0.5);
    for (let y = COUNTER_BOTTOM + 24; y < GH; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.strokePath(); }
    for (let i = 0; i < 26; i++) {                       // soft AO just under the counter
      g.fillStyle(0x000000, 0.025); g.fillRect(0, COUNTER_BOTTOM + i, GW, 1);
    }

    // --- Counter: butcher-block top + grain + front molding ---
    g.fillStyle(0x7a5230, 1); g.fillRect(0, COUNTER_TOP, GW, COUNTER_BOTTOM - COUNTER_TOP);
    g.lineStyle(1, 0x6b461f, 0.5);                       // wood grain
    for (let y = COUNTER_TOP + 10; y < COUNTER_BOTTOM; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.strokePath(); }
    g.fillStyle(0xb07f4a, 1); g.fillRect(0, COUNTER_TOP, GW, 4);         // polished top edge
    g.fillStyle(0xe7cda3, 0.5); g.fillRect(0, COUNTER_TOP, GW, 2);       // top sheen
    g.fillStyle(0x9c6c3e, 1); g.fillRect(0, COUNTER_TOP + 4, GW, 3);
    g.fillStyle(0x4a3219, 1); g.fillRect(0, COUNTER_BOTTOM - 6, GW, 6);  // bottom molding

    // --- Framed pictures on the wall ---
    this.drawFrame(70, 150, 60, 46, 0xb5832f);
    this.drawFrame(720, 150, 56, 44, 0x6abf5a);

    // --- Wall fixtures (unchanged positions) ---
    this.drawShopBanner();
    const rope = this.add.graphics().setDepth(0);
    rope.lineStyle(3, 0x241b2e, 1);
    rope.beginPath(); rope.moveTo(190, 0); rope.lineTo(190, 28); rope.strokePath();
    rope.beginPath(); rope.moveTo(430, 0); rope.lineTo(430, 28); rope.strokePath();
    this.add.image(620, 120, 'window').setScale(5).setDepth(1);
    this.add.image(150, 90, 'clock').setScale(4).setDepth(1);

    // Hanging pendant lamp + its warm light pool.
    this.add.image(520, 18, 'lamp').setOrigin(0.5, 0).setScale(5).setDepth(7);
    this.addGlow(520, 90, 360, 0xffd9a0, 0.45, 3);

    // Cool daylight from the window.
    this.addGlow(620, 150, 300, 0xbfe0ff, 0.30, 1);

    // --- Counter dressing (right of the stations, by the queue) ---
    this.add.image(630, COUNTER_TOP - 2, 'donut').setOrigin(0.5, 1).setScale(4).setDepth(6);
    this.add.image(668, COUNTER_TOP - 2, 'croissant').setOrigin(0.5, 1).setScale(4).setDepth(6);
    const plate = this.add.graphics().setDepth(5);
    plate.fillStyle(0xf4efe6, 1); plate.fillRoundedRect(604, COUNTER_TOP - 6, 96, 8, 4);
    this.add.image(745, COUNTER_TOP - 2, 'tipjar').setOrigin(0.5, 1).setScale(4).setDepth(6);

    // --- The stations (machines + shadows + signs). Locked ones stay hidden
    // until revealStation() pops them in at their unlock level. ---
    STATIONS.forEach((st) => {
      st.revealed = false;
      st.pourLevel = 0;
      st.tolLevel = 0;
      st.shadowObj = this.add.image(st.x, COUNTER_TOP, 'softshadow')
        .setScale(1.9, 0.45).setAlpha(0.4).setDepth(4).setVisible(false);
      st.machine = this.add.image(st.x, COUNTER_TOP, st.tex)
        .setOrigin(0.5, 1).setScale(6).setDepth(5).setVisible(false);
      st.signObj = this.makeSign(st.x, COUNTER_TOP - 102, st.sign, st.color).setVisible(false);
    });

    // --- Barista (+ shadow that follows in update) ---
    this.baristaShadow = this.add.image(STATIONS[0].x, BARISTA_Y, 'softshadow').setScale(1.2, 0.4).setAlpha(0.4).setDepth(8);
    this.baristaTexture = 'barista_' + (Save.data.apronColor || 'teal');
    this.barista = this.add.image(STATIONS[0].x, BARISTA_Y, this.baristaTexture).setOrigin(0.5, 1).setScale(4).setDepth(9);

    // --- Floating dust motes for atmosphere ---
    this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: GW }, y: { min: 40, max: GH - 120 },
      speedY: { min: -8, max: -2 }, speedX: { min: -4, max: 4 },
      scale: { min: 0.5, max: 1.6 }, alpha: { min: 0.04, max: 0.16 },
      lifespan: 7000, frequency: 280, quantity: 1,
    }).setDepth(80);

    // --- Vignette over the whole scene (under the UI), kept gentle ---
    this.add.image(GW / 2, GH / 2, 'vignette').setDisplaySize(GW, GH).setDepth(90).setAlpha(VIGNETTE_ALPHA);

    this.add.text(GW - 16, 14, 'BREWHAVEN', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#f4efe6', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(100).setAlpha(0.85);
  }

  // The shop's name on a wooden sign, hung between the two ceiling ropes
  // at x=190/430 — replaces the old generic "menu" chalkboard decor.
  drawShopBanner() {
    const cx = 310, cy = 70, bw = 240, bh = 50;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x4a3219, 1);
    g.fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
    g.fillStyle(0x6b461f, 1);
    g.fillRoundedRect(cx - bw / 2 + 4, cy - bh / 2 + 4, bw - 8, bh - 8, 6);
    g.lineStyle(2, 0xb07f4a, 1);
    g.strokeRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);

    const name = Save.data.shopName || 'Brewhaven';
    const text = this.add.text(cx, cy, name, {
      fontFamily: 'monospace', fontSize: FS(20), color: '#f4efe6', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    // Shrink the font until the name fits the sign's interior.
    const maxWidth = bw - 24;
    const sizes = [20, 18, 16, 14, 12, 11];
    for (const sz of sizes) {
      text.setFontSize(parseInt(FS(sz), 10));
      if (text.width <= maxWidth) break;
    }
  }

  // A small wall picture frame with a gradient "canvas" inside.
  drawFrame(cx, cy, w, h, accent) {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x241b2e, 1); g.fillRect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6);
    g.fillStyle(0x8a6a3a, 1); g.fillRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4);
    g.fillStyle(0x2b2336, 1); g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.fillStyle(accent, 0.8); g.fillCircle(cx, cy - 3, h / 5);
    g.fillStyle(0xf4efe6, 0.85); g.fillRect(cx - w / 4, cy + h / 5, w / 2, 3);
  }

  // Pop a newly unlocked station onto the counter (also runs for the starting
  // two on level 1, doubling as a little intro animation).
  revealStation(st) {
    st.revealed = true;
    st.shadowObj.setVisible(true);
    st.machine.setVisible(true).setScale(0);
    st.signObj.setVisible(true).setAlpha(0);
    this.addGlow(st.x, 250, 320, 0xffd6a0, 0.38, 3);
    this.tweens.add({ targets: st.machine, scale: 6, duration: 450, ease: 'Back.out', delay: 350 });
    this.tweens.add({ targets: st.signObj, alpha: 1, duration: 300, delay: 650 });
    if (st.unlock > 1) {
      this.time.delayedCall(500, () => this.floatingText(st.x, COUNTER_TOP - 130, 'NEW STATION!', '#ffd166'));
    }
  }

  // The hired employee's sprite — a tinted, flipped copy of the barista,
  // offset slightly so it doesn't fully overlap the player at their station.
  spawnEmployeeSprite() {
    if (this.employee.sprite) return;
    const x = (this.employee.station != null ? STATIONS[this.employee.station].x : STATIONS[0].x) + 22;
    this.employee.shadow = this.add.image(x, BARISTA_Y, 'softshadow').setScale(1.2, 0.4).setAlpha(0.4).setDepth(8);
    this.employee.sprite = this.add.image(x, BARISTA_Y, this.baristaTexture).setOrigin(0.5, 1).setScale(4).setDepth(9)
      .setTint(0xbfe0ff).setFlipX(true);
  }

  positionEmployeeSprite() {
    if (!this.employee.sprite || this.employee.station == null) return;
    const x = STATIONS[this.employee.station].x + 22;
    this.employee.sprite.x = x;
    this.employee.shadow.x = x;
  }

  // Additive radial light pool.
  addGlow(x, y, size, tint, alpha, depth) {
    this.add.image(x, y, 'glow').setDisplaySize(size, size).setTint(tint)
      .setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
  }

  makeSign(x, y, text, color) {
    const cont = this.add.container(x, y).setDepth(7);
    const t = this.add.text(0, 0, text, {
      fontFamily: 'monospace', fontSize: FS(13), color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const pad = 8;
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-t.width / 2 - pad, -t.height / 2 - 4, t.width + pad * 2, t.height + 8, 6);
    bg.lineStyle(2, 0x2a2030, 1);
    bg.strokeRoundedRect(-t.width / 2 - pad, -t.height / 2 - 4, t.width + pad * 2, t.height + 8, 6);
    cont.add([bg, t]);
    return cont;
  }

  // ===========================================================================
  // Pour station
  // ===========================================================================
  buildPourStation() {
    this.cupGfx = this.add.graphics().setDepth(20);
    this.drinkLabel = this.add.text(STATIONS[0].x, CUP.top - 22, '', {
      fontFamily: 'monospace', fontSize: FS(14), color: '#fff', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21);

    this.splash = this.add.particles(0, 0, 'drop', {
      speed: { min: 20, max: 70 }, angle: { min: 200, max: 340 },
      gravityY: 300, lifespan: 350, scale: { start: 1.2, end: 0.4 },
      quantity: 2, frequency: 30, emitting: false, tint: 0x5b3a22,
    }).setDepth(22);

    this.steam = this.add.particles(0, 0, 'steam', {
      speedY: { min: -26, max: -14 }, speedX: { min: -10, max: 10 },
      lifespan: 1100, scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.5, end: 0 }, frequency: 220, emitting: false,
    }).setDepth(23);

    this.drawCup();
  }

  // Color of the liquid currently coming out: the order's current step color
  // when we're at the right machine, otherwise whatever this station pours.
  brewColor() {
    const o = this.activeOrder();
    const st = this.activeStation();
    if (o) {
      const s = o.steps[Math.min(this.stepIndex, o.steps.length - 1)];
      if (s.station === st.type) return s.color;
    }
    return st.liquid;
  }

  drawCup() {
    const g = this.cupGfx;
    g.clear();
    const cx = this.cupX();

    // Soft contact shadow on the counter.
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(cx, CUP.bottom + 3, CUP.halfW * 2 + 14, 11);

    g.lineStyle(5, COL.dark, 1);
    g.strokeRect(cx + CUP.halfW - 2, CUP.top + 16, 16, 30);

    g.fillStyle(COL.dark, 1);
    g.fillRect(cx - CUP.halfW, CUP.top, CUP.halfW * 2, CUP.bottom - CUP.top);
    g.fillStyle(COL.cream, 1);
    const innerLeft = cx - CUP.halfW + CUP.wall;
    const innerW = (CUP.halfW - CUP.wall) * 2;
    g.fillRect(innerLeft, CUP.innerTop, innerW, CUP.innerH);
    // Inner shading: shadow on the right wall, soft ambient on the floor.
    g.fillStyle(0x000000, 0.10);
    g.fillRect(innerLeft + innerW - 5, CUP.innerTop, 5, CUP.innerH);

    // Finished layers first (base liquids of multi-step drinks), then the
    // layer currently being poured on top.
    this.lockedLayers.forEach((L) => {
      const h = (L.to - L.from) * CUP.innerH;
      g.fillStyle(L.color, 1);
      g.fillRect(innerLeft, CUP.innerBottom - L.to * CUP.innerH, innerW, h);
    });
    const liqTop = CUP.innerBottom - this.fill * CUP.innerH;
    if (this.fill > this.lockedFill) {
      g.fillStyle(this.brewColor(), 1);
      g.fillRect(innerLeft, liqTop, innerW, (this.fill - this.lockedFill) * CUP.innerH);
    }
    if (this.fill > 0) {
      g.fillStyle(0xffffff, 0.28); // surface sheen on whatever's on top
      g.fillRect(innerLeft, liqTop, innerW, Math.min(3, this.fill * CUP.innerH));
    }

    // Target zones: every step of the order, with the current step bright and
    // the others dimmed (done steps dimmest).
    const order = this.activeOrder();
    if (order) {
      const zo = this.zoneOffset || 0;
      order.steps.forEach((s, i) => {
        const yTop = CUP.innerBottom - (s.band[1] + zo) * CUP.innerH;
        const yBot = CUP.innerBottom - (s.band[0] + zo) * CUP.innerH;
        const cur = i === this.stepIndex;
        g.fillStyle(COL.zone, cur ? 0.30 : i < this.stepIndex ? 0.05 : 0.13);
        g.fillRect(innerLeft, yTop, innerW, yBot - yTop);
        g.lineStyle(2, COL.zone, cur ? 0.9 : 0.35);
        g.beginPath(); g.moveTo(innerLeft, yTop); g.lineTo(innerLeft + innerW, yTop); g.strokePath();
        g.beginPath(); g.moveTo(innerLeft, yBot); g.lineTo(innerLeft + innerW, yBot); g.strokePath();
      });
    }

    if (this.pouring) {
      g.fillStyle(this.brewColor(), 1);
      const streamBottom = this.fill > 0 ? liqTop : CUP.innerBottom;
      g.fillRect(cx - 2, SPOUT_Y, 4, streamBottom - SPOUT_Y);
    }

    // Glass/ceramic gloss highlight down the left inner wall (drawn last).
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(innerLeft + 2, CUP.innerTop + 2, 4, CUP.innerH - 4);
  }

  // ===========================================================================
  // Input
  // ===========================================================================
  bindInput() {
    STATIONS.forEach((st, i) => {
      const zone = this.add.zone(st.x, COUNTER_TOP - 48, 120, 150)
        .setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.state !== 'playing' || !st.revealed) return;
        if (this.current === i) this.startPour();
        else this.walkTo(i);
      });
    });
    this.input.on('pointerup', () => this.stopPour());
    this.input.on('pointerupoutside', () => this.stopPour());

    const kb = this.input.keyboard;
    this.keys = kb.addKeys({ space: 'SPACE' });
    kb.on('keydown-LEFT', () => this.stepStation(-1));
    kb.on('keydown-A', () => this.stepStation(-1));
    kb.on('keydown-RIGHT', () => this.stepStation(1));
    kb.on('keydown-D', () => this.stepStation(1));
    this.keys.space.on('down', () => { if (this.state === 'playing') this.startPour(); });
    this.keys.space.on('up', () => this.stopPour());

    this.input.once('pointerdown', () => SFX.unlock());
    this.keys.space.once('down', () => SFX.unlock());

    if (DEV_MODE) {
      const DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
      for (let d = 1; d <= 9; d++) kb.on('keydown-' + DIGIT_NAMES[d], () => this.devJumpToLevel(d));
      kb.on('keydown-' + DIGIT_NAMES[0], () => this.devJumpToLevel(10));
      kb.on('keydown-PLUS', () => this.devJumpToLevel(this.level + 1));
      kb.on('keydown-MINUS', () => this.devJumpToLevel(this.level - 1));
    }
  }

  // On-screen touch controls for mobile: a left-arrow + circular pour button
  // on the left edge, and a right-arrow on the right edge. Sit on top of the
  // playfield (depth 150) but below modal overlays (store/tutorial/banners
  // all sit at depth 158+), so they're auto-disabled while those are open.
  buildMobileControls() {
    const mkButton = (x, y, r, icon, fontSize) => {
      const cont = this.add.container(x, y).setDepth(150).setAlpha(0.55);
      const bg = this.add.graphics();
      bg.fillStyle(0x1b1620, 0.5);
      bg.fillCircle(0, 0, r);
      bg.lineStyle(2, 0xf4efe6, 0.6);
      bg.strokeCircle(0, 0, r);
      const label = this.add.text(0, 0, icon, {
        fontFamily: 'monospace', fontSize: fontSize, color: '#f4efe6', fontStyle: 'bold',
      }).setOrigin(0.5);
      cont.add([bg, label]);
      const hit = this.add.circle(x, y, r).setDepth(151).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { this.tweens.add({ targets: cont, alpha: 0.85, scale: 0.92, duration: 60 }); });
      hit.on('pointerup', () => { this.tweens.add({ targets: cont, alpha: 0.55, scale: 1, duration: 100 }); });
      hit.on('pointerout', () => { this.tweens.add({ targets: cont, alpha: 0.55, scale: 1, duration: 100 }); });
      return hit;
    };

    const arrowY = GH - 50, pourY = GH - 150;
    const leftX = 60, rightX = GW - 60;

    mkButton(leftX, arrowY, 32, '◀', '26px').on('pointerdown', () => this.stepStation(-1));
    mkButton(rightX, arrowY, 32, '▶', '26px').on('pointerdown', () => this.stepStation(1));
    mkButton(leftX, pourY, 44, '☕', '32px').on('pointerdown', () => this.startPour());
  }

  // Step one station left/right with the keys (skips nothing — unlocked
  // stations are always contiguous from index 0).
  stepStation(dir) {
    const i = this.current + dir;
    if (i < 0 || i >= STATIONS.length || !STATIONS[i].revealed) return;
    this.walkTo(i);
  }

  walkTo(i) {
    if (this.state !== 'playing' || this.moving || this.pouring || i === this.current) return;
    if (!STATIONS[i] || !STATIONS[i].revealed) return;
    this.moving = true;
    // Carry finished layers along; drop any dribble — but don't dump the cup
    // out from under the employee while they're mid-pour on it.
    if (!this.employee.busy) this.fill = this.lockedFill;
    this.steam.stop();
    this.tweens.add({ targets: this.barista, scaleY: 3.7, duration: 120, yoyo: true, repeat: 1 });
    this.tweens.add({
      targets: this.barista, x: STATIONS[i].x, duration: this.baristaMoveDur, ease: 'Sine.inOut',
      onComplete: () => { this.current = i; this.moving = false; this.drawCup(); },
    });
  }

  startPour() {
    if (this.state !== 'playing' || this.serving || this.moving || this.pouring) return;
    if (!this.customers.length) return;
    // The employee's turn: their assigned station handles the front
    // customer's current step, so the player is locked out of pouring here.
    if (this.employee.hired && this.employee.station != null) {
      const step = this.customers[0].order.steps[this.stepIndex];
      if (step.station === STATIONS[this.employee.station].type) return;
    }
    this.pouring = true;
    SFX.startPour();
    this.splash.start();
    this.tweens.add({ targets: this.activeStation().machine, scaleX: 6.25, duration: 90, yoyo: true });
  }

  stopPour() {
    if (!this.pouring) return;
    this.pouring = false;
    SFX.stopPour();
    this.splash.stop();
    if (this.fill > this.lockedFill + 0.02) this.handleRelease();
  }

  // A pour was released. Either lock in a finished layer and move to the next
  // step, or — on the last step, a wrong station, or a spill — serve the cup.
  // `station` defaults to the player's; the employee passes its own.
  handleRelease(station = this.activeStation()) {
    const c = this.customers[0];
    if (!c) { this.resetCup(); this.drawCup(); return; }
    const o = c.order;
    const step = o.steps[this.stepIndex];
    const wrongStation = station.type !== step.station;
    const lastStep = this.stepIndex >= o.steps.length - 1;
    if (wrongStation || this.spilled || lastStep) { this.serveAttempt(station); return; }

    // Lock the base layer wherever it landed (misses carry forward) and point
    // the player at the next station.
    this.lockedLayers.push({ from: this.lockedFill, to: this.fill, color: step.color });
    this.lockedFill = this.fill;
    this.stepIndex++;
    const next = o.steps[this.stepIndex];
    SFX.blip(880, 0.07);
    this.floatingText(station.x, CUP.top - 44, 'Now: ' + this.stationFor(next.station).sign + ' →', '#ffd166');
    c.drawBubbleBg(this.stationFor(next.station).color);
    this.drawCup();
  }

  stationFor(type) { return STATIONS.find((s) => s.type === type); }

  // Dump the cup back to empty (between customers / on cancel).
  resetCup() {
    this.fill = 0;
    this.lockedFill = 0;
    this.lockedLayers = [];
    this.stepIndex = 0;
    this.spilled = false;
  }

  // Forcefully stop pouring without serving (used on level end / game over).
  cancelPour() {
    this.pouring = false;
    this.employee.busy = false;
    this.resetCup();
    SFX.stopPour();
    this.splash.stop();
    this.steam.stop();
    this.drawCup();
  }

  // ===========================================================================
  // Update loop
  // ===========================================================================
  update(time, delta) {
    const dt = delta / 1000;

    // Sign pulse runs in any state so it's always informative.
    const front = this.customers[0];
    const frontStep = front ? front.order.steps[Math.min(this.stepIndex, front.order.steps.length - 1)] : null;
    STATIONS.forEach((st) => {
      const need = frontStep && frontStep.station === st.type;
      st.signObj.setScale(need ? 1 + Math.sin(time / 140) * 0.08 : 1);
    });
    this.baristaShadow.x = this.barista.x;

    if (this.state !== 'playing') return;

    this.zoneOffset = this.rushModifiers.includes('movingTarget')
      ? Math.sin(time / RUSH_ZONE_DRIFT_SPEED) * RUSH_ZONE_DRIFT_AMT
      : 0;

    if (this.pouring && !this.serving) {
      const activeSt = this.activeStation();
      const speedMult = this.rushModifiers.includes('speedMalfunction') ? 2 : 1;
      this.fill += (activeSt.pourSpeed + activeSt.pourLevel * STATION_UPGRADES.pour.amt) * speedMult * dt;
      const liqTop = CUP.innerBottom - this.fill * CUP.innerH;
      this.splash.setParticleTint(this.brewColor());
      this.splash.setPosition(this.cupX(), Math.max(CUP.innerTop, liqTop));
      if (this.fill >= 1) { this.fill = 1; this.spilled = true; this.stopPour(); }
    } else {
      this.updateEmployee(dt);
    }

    const cx = this.cupX();
    this.drawCup();
    this.drinkLabel.x = cx;
    this.drinkLabel.setText(front
      ? front.order.name + (front.order.steps.length > 1
        ? '  ' + (this.stepIndex + 1) + '/' + front.order.steps.length
        : '')
      : '');

    if (this.fill > 0.25 && !this.serving) {
      if (!this.steam.emitting) this.steam.start();
      this.steam.setPosition(cx, CUP.innerBottom - this.fill * CUP.innerH);
    } else if (this.steam.emitting) {
      this.steam.stop();
    }

    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      if (c.leaving) continue;
      c.patience -= dt;
      const frac = Phaser.Math.Clamp(c.patience / c.patienceMax, 0, 1);
      c.barFill.width = 56 * frac;
      c.barFill.fillColor = frac > 0.5 ? 0x6abf5a : frac > 0.25 ? 0xe0c14f : 0xe5564d;
      c.sprite.y = -Math.abs(Math.sin(time / 350 + c.bobPhase)) * 4;
      if (frac <= 0.25 && !c.impatientQuipShown) {
        c.impatientQuipShown = true;
        this.customerQuip(c, Phaser.Utils.Array.GetRandom(IMPATIENT_QUIPS));
      }
      if (c.patience <= 0) this.customerTimedOut(i);
    }
  }

  // The hired employee auto-pours the front customer's current step whenever
  // it's at their assigned station — a "perfect" pour every time, locking in
  // the layer or auto-serving just like a player release would.
  updateEmployee(dt) {
    const emp = this.employee;
    if (!emp.hired || emp.station == null) return;
    const st = STATIONS[emp.station];
    if (!st.revealed || this.serving) return;
    const front = this.customers[0];
    const step = front && front.order.steps[this.stepIndex];

    if (!step || step.station !== st.type) {
      if (emp.busy) { emp.busy = false; this.splash.stop(); }
      return;
    }

    if (!emp.busy) {
      emp.busy = true;
      SFX.startPour();
      this.splash.start();
      this.tweens.add({ targets: st.machine, scaleX: 6.25, duration: 90, yoyo: true });
    }

    const speedMult = this.rushModifiers.includes('speedMalfunction') ? 2 : 1;
    this.fill += (st.pourSpeed + st.pourLevel * STATION_UPGRADES.pour.amt + emp.pourLevel * EMPLOYEE_POUR_UPGRADE.amt) * speedMult * dt;
    const liqTop = CUP.innerBottom - this.fill * CUP.innerH;
    this.splash.setParticleTint(step.color);
    this.splash.setPosition(st.x, Math.max(CUP.innerTop, liqTop));

    if (this.fill >= step.target) {
      this.fill = step.target;
      emp.busy = false;
      SFX.stopPour();
      this.splash.stop();
      this.handleRelease(st);
    }
  }

  // ===========================================================================
  // Customers
  // ===========================================================================
  scheduleSpawn() {
    const interval = this.rushModifiers.includes('waveSpawn') ? 200 : this.cfg.spawnInterval;
    this.spawnTimer = this.time.delayedCall(interval, () => {
      if (this.state === 'playing' && this.customers.length < this.cfg.maxQueue) this.spawnCustomer();
      if (this.state === 'playing') this.scheduleSpawn();
    });
  }

  spawnCustomer() {
    const idx = this.customers.length;
    const variant = Phaser.Math.Between(0, 7);
    const drink = Phaser.Utils.Array.GetRandom(this.cfg.drinkPool);
    const steps = drink.steps.map((s) => {
      const tol = Math.max(0.025, s.tol * this.cfg.tolScale + this.stationFor(s.station).tolLevel * STATION_UPGRADES.tol.amt);
      return { ...s, tol, band: [s.target - tol, s.target + tol] };
    });
    const order = { name: drink.name, letter: drink.letter, mult: drink.mult, steps };
    // Two-step drinks mean an extra station trip — those customers wait longer.
    const isVIP = this.rushModifiers.includes('hardTimer') && Math.random() < 0.45;
    const patience = isVIP
      ? RUSH_HARD_TIMER_PATIENCE
      : this.cfg.patience + this.patienceBonus + (steps.length > 1 ? 5 : 0);

    const container = this.add.container(GW + 60, FLOOR_Y).setDepth(8);
    const shadow = this.add.image(0, -2, 'softshadow').setScale(1.0, 0.3).setAlpha(0.35);
    const sprite = this.add.image(0, 0, 'customer' + variant).setOrigin(0.5, 1).setScale(5);

    const bubble = this.add.container(0, -104);
    const bg = this.add.graphics();
    // Border color = which station to go to NEXT; redrawn as steps advance.
    const bw = 44 * UI_SCALE, bh = 26 * UI_SCALE;
    const drawBubbleBg = (col) => {
      bg.clear();
      bg.fillStyle(0xffffff, 1); bg.fillRoundedRect(-bw, -bh, bw * 2, bh * 2, 8);
      bg.lineStyle(3, col, 1); bg.strokeRoundedRect(-bw, -bh, bw * 2, bh * 2, 8);
      bg.fillStyle(0xffffff, 1); bg.fillTriangle(-6 * UI_SCALE, bh * 0.6, 6 * UI_SCALE, bh * 0.6, 0, bh + 10 * UI_SCALE);
    };
    drawBubbleBg(this.stationFor(steps[0].station).color);
    const miniCup = this.add.image(-26 * UI_SCALE, -4 * UI_SCALE, 'cup').setScale(2.2 * UI_SCALE).setTint(steps[steps.length - 1].color);
    const letter = this.add.text(6 * UI_SCALE, -4 * UI_SCALE, order.letter, {
      fontFamily: 'monospace', fontSize: FS(22), color: '#2a2030', fontStyle: 'bold',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 10 * UI_SCALE, order.name, {
      fontFamily: 'monospace', fontSize: FS(9), color: '#6a5570',
    }).setOrigin(0.5);
    bubble.add([bg, miniCup, letter, sub]);

    const barBg = this.add.rectangle(0, -150, 60, 8, 0x2a2030).setOrigin(0.5);
    const barFill = this.add.rectangle(-28, -150, 56, 5, 0x6abf5a).setOrigin(0, 0.5);
    container.add([shadow, sprite, bubble, barBg, barFill]);

    if (isVIP) {
      sprite.setTint(0xffe566);
      barFill.fillColor = 0xe5564d;
      const vipTag = this.add.text(0, -174, '⏱ VIP', {
        fontFamily: 'monospace', fontSize: FS(10), color: '#e5564d', fontStyle: 'bold',
        stroke: '#2a2030', strokeThickness: 2,
      }).setOrigin(0.5);
      container.add(vipTag);
    }

    const c = {
      container, sprite, bubble, barBg, barFill, order, variant, drawBubbleBg,
      patienceMax: patience, patience, bobPhase: Phaser.Math.FloatBetween(0, 6.28), leaving: false,
    };
    this.customers.push(c);

    this.tweens.add({ targets: container, x: SERVE_X + idx * QUEUE_SPACING, duration: 700, ease: 'Sine.out' });
    if (idx === 0) this.drawCup();
  }

  repositionQueue() {
    this.customers.forEach((c, i) => {
      if (c.leaving) return;
      this.tweens.add({ targets: c.container, x: SERVE_X + i * QUEUE_SPACING, duration: 400, ease: 'Sine.inOut' });
    });
    this.drawCup();
  }

  // Walk a customer off screen and dispose. `removeFromQueue` keeps the list tidy.
  sendOff(c, removeFromQueue = true) {
    if (c._gone) return;
    c._gone = true;
    c.leaving = true;
    c.bubble.setVisible(false);
    c.barBg.setVisible(false); c.barFill.setVisible(false);
    this.tweens.add({
      targets: c.container, x: GW + 90, duration: 650, ease: 'Sine.in',
      onComplete: () => c.container.destroy(),
    });
    if (removeFromQueue) {
      this.customers = this.customers.filter((x) => x !== c);
      this.repositionQueue();
    }
  }

  // ===========================================================================
  // Serving
  // ===========================================================================
  // `station` defaults to the player's; the employee passes its own.
  serveAttempt(station = this.activeStation()) {
    const c = this.customers[0];
    if (!c) { this.resetCup(); return; }
    this.serving = true;
    const o = c.order;
    // Judge against the current step: for a completed sequence that's the last
    // step (final fill); for a wrong-station or spilled release it's wherever
    // the order got abandoned.
    const step = o.steps[this.stepIndex];

    let quality;
    if (station.type !== step.station) quality = 'wrong';
    else if (this.spilled) quality = 'spill';
    else if (this.stepIndex < o.steps.length - 1) quality = 'poor'; // unfinished sequence
    else {
      const zo = this.zoneOffset || 0;
      const lo = step.band[0] + zo, hi = step.band[1] + zo;
      if (this.fill >= lo && this.fill <= hi) quality = 'perfect';
      else if (Math.abs(this.fill - (step.target + zo)) <= step.tol * 2.2) quality = 'good';
      else quality = 'poor';
    }
    if (this.rushModifiers.includes('critic') && quality === 'good') quality = 'poor';

    if (quality === 'perfect' || quality === 'good') this.streak++;
    else this.streak = 0;
    const comboMult = 1 + Math.min(this.streak, 10) * this.comboStep;
    const qMult = { perfect: 1.6, good: 1.0, poor: 0.4, wrong: 0.3, spill: 0.2 }[quality];
    const reward = Math.max(1, Math.round(8 * o.mult * qMult * comboMult));

    const flyCup = this.add.image(station.x, CUP.top + 30, 'cup').setScale(4).setDepth(30)
      .setTint(o.steps[o.steps.length - 1].color);
    this.tweens.add({
      targets: flyCup, x: c.container.x, y: FLOOR_Y - 70, duration: 360, ease: 'Quad.inOut',
      onComplete: () => { flyCup.destroy(); this.finishServe(c, quality, reward); },
    });

    this.resetCup();
    this.steam.stop();
    this.drawCup();
  }

  finishServe(c, quality, reward) {
    const labels = {
      perfect: ['PERFECT!', '#6abf5a'], good: ['Nice', '#e0c14f'],
      poor: ['Meh...', '#e09a4f'], wrong: ['Wrong drink!', '#e5564d'], spill: ['Spilled!', '#e5564d'],
    };
    const [text, color] = labels[quality];
    this.floatingText(c.container.x, FLOOR_Y - 150, text, color);
    if (this.streak >= 3 && (quality === 'perfect' || quality === 'good')) {
      this.floatingText(c.container.x, FLOOR_Y - 180, 'COMBO x' + this.streak, '#ffd166');
    }
    if (quality === 'wrong' || quality === 'spill') {
      this.quipText(c.container.x, FLOOR_Y - 180, Phaser.Utils.Array.GetRandom(ANGRY_QUIPS));
    }

    const good = quality === 'perfect' || quality === 'good';
    if (quality === 'perfect') {
      SFX.ding(); this.cameras.main.shake(120, 0.006);
      this.heartsBurst(c.container.x, FLOOR_Y - 90);
    } else if (quality === 'good') {
      SFX.ding();
    } else {
      SFX.buzz();
    }

    this.tweens.add({ targets: c.sprite, scaleY: 5.6, scaleX: 4.5, duration: 110, yoyo: true });
    this.coinBurst(c.container.x, FLOOR_Y - 60, reward);
    this.updateStreakText();

    this.serving = false;
    this.sendOff(c, true);

    // Progression: a correct drink advances the quota; a bad serve costs a life.
    if (good) {
      this.served++;
      this.updateLevelUI();
      if (this.served >= this.cfg.quota) { this.completeLevel(); return; }
    } else if (quality === 'wrong' || quality === 'spill') {
      let lives = 1;
      if (quality === 'spill' && this.rushModifiers.includes('noSpill')) lives++;
      if (this.rushModifiers.includes('comboKiller')) lives++;
      this.loseLife(c.container.x, lives);
    }
  }

  customerTimedOut(index) {
    const c = this.customers[index];
    if (c.leaving) return;
    // The front customer's half-made drink goes down the drain with them.
    if (index === 0) this.cancelPour();
    this.streak = 0;
    this.updateStreakText();
    this.floatingText(c.container.x, FLOOR_Y - 150, 'Walked out!', '#e5564d');
    this.quipText(c.container.x, FLOOR_Y - 180, Phaser.Utils.Array.GetRandom(ANGRY_QUIPS));
    this.sendOff(c, true);
    this.loseLife(c.container.x);
  }

  loseLife(x, amt = 1) {
    if (this.state !== 'playing') return;
    this.lives -= amt;
    this.updateHearts();
    SFX.buzz();
    this.cameras.main.shake(180, 0.008);
    this.cameras.main.flash(180, 120, 20, 20);
    if (this.lives <= 0) this.gameOver();
  }

  // ===========================================================================
  // Juice helpers
  // ===========================================================================
  // Like showTutorial, but only the first time `id` is shown across the
  // player's save — returning players (or replays of an already-cleared
  // level) skip straight past it (still chaining into `onClose`, if any).
  showTutorialOnce(id, x, y, text, onClose) {
    if (Save.data.seenTutorials.includes(id)) {
      if (onClose) onClose();
      return;
    }
    Save.data.seenTutorials.push(id);
    Save.write();
    this.showTutorial(x, y, text, onClose);
  }

  // A small speech-bubble popup pointing down at a station, for one-time tips.
  // Pauses the level (spawns + customer patience) until the player taps
  // "GOT IT", so they have time to read it. `onClose` fires once dismissed —
  // used to chain a second tutorial right after this one closes.
  showTutorial(x, y, text, onClose) {
    this.state = 'tutorial';
    if (this.spawnTimer) this.spawnTimer.paused = true;
    this.customers.forEach((c) => this.tweens.getTweensOf(c.container).forEach((tw) => tw.pause()));

    const overlay = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0a0710, 0.35).setDepth(158).setInteractive();

    const cont = this.add.container(x, y).setDepth(160).setAlpha(0).setScale(0.8);
    const t = this.add.text(0, 0, text, {
      fontFamily: 'monospace', fontSize: FS(13), color: '#2a2030', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 190 * UI_SCALE },
    }).setOrigin(0.5);

    const padX = 14, padTop = 10, btnGap = 10, btnW = 96 * UI_SCALE, btnH = 30 * UI_SCALE;
    const w = Math.max(t.width + padX * 2, btnW + 28);
    const h = t.height + padTop * 2 + btnGap + btnH + 14;
    t.setPosition(0, -h / 2 + padTop + t.height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(0xfff4d6, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);
    bg.lineStyle(3, 0xffd166, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.strokeTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);

    const btnY = h / 2 - 8 - btnH / 2;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x3a5a3a, 1);
    btnBg.fillRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    btnBg.lineStyle(2, 0x6abf5a, 1);
    btnBg.strokeRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    const btnLabel = this.add.text(0, btnY, 'GOT IT', {
      fontFamily: 'monospace', fontSize: FS(13), color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    cont.add([bg, t, btnBg, btnLabel]);

    const btnHit = this.add.rectangle(x, y + btnY, btnW, btnH).setDepth(161).setInteractive({ useHandCursor: true });
    btnHit.on('pointerover', () => { this.tweens.add({ targets: [btnBg, btnLabel], scale: 1.05, duration: 80 }); });
    btnHit.on('pointerout', () => { this.tweens.add({ targets: [btnBg, btnLabel], scale: 1, duration: 80 }); });
    btnHit.on('pointerdown', () => {
      btnHit.disableInteractive();
      SFX.blip(720, 0.05);
      this.tweens.add({
        targets: cont, alpha: 0, scale: 0.8, duration: 250,
        onComplete: () => {
          cont.destroy();
          overlay.destroy();
          btnHit.destroy();
          this.state = 'playing';
          if (this.spawnTimer) this.spawnTimer.paused = false;
          this.customers.forEach((c) => this.tweens.getTweensOf(c.container).forEach((tw) => tw.resume()));
          if (onClose) onClose();
        },
      });
    });

    this.tweens.add({ targets: cont, alpha: 1, scale: 1, duration: 300, ease: 'Back.out' });
  }

  floatingText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: FS(20), color, fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  // A small speech-bubble that pops up above a queued customer's head (e.g.
  // when their patience bar runs low), then fades on its own.
  customerQuip(c, text) {
    if (c.leaving) return;
    const cont = this.add.container(0, -184);
    const t = this.add.text(0, 0, text, {
      fontFamily: 'monospace', fontSize: FS(11), color: '#2a2030', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 110 },
    }).setOrigin(0.5);
    const padX = 8, padY = 6;
    const w = t.width + padX * 2, h = t.height + padY * 2;
    const bg = this.add.graphics();
    bg.fillStyle(0xfff4d6, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.fillTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 8);
    bg.lineStyle(2, 0xe0c14f, 1); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    cont.add([bg, t]);
    c.container.add(cont);
    cont.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: cont, alpha: 0, scale: 0.8, delay: 1800, duration: 300, onComplete: () => cont.destroy() });
  }

  // A small italic aside floating up from a customer who just left unhappy
  // (wrong drink, spill, or walkout).
  quipText(x, y, text) {
    const t = this.add.text(x, y, '"' + text + '"', {
      fontFamily: 'monospace', fontSize: FS(12), color: '#ffb3ab', fontStyle: 'italic',
      align: 'center', wordWrap: { width: 150 },
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 1200, ease: 'Quad.out', delay: 350, onComplete: () => t.destroy() });
  }

  heartsBurst(x, y) {
    for (let i = 0; i < 5; i++) {
      const h = this.add.image(x, y, 'heart').setScale(3).setDepth(55);
      this.tweens.add({
        targets: h, x: x + Phaser.Math.Between(-40, 40), y: y - Phaser.Math.Between(40, 90),
        alpha: 0, scale: 1.5, duration: 800, delay: i * 60, ease: 'Quad.out', onComplete: () => h.destroy(),
      });
    }
  }

  coinBurst(x, y, amount) {
    this.coins += amount;
    this.updateCoinText();
    const n = Math.min(8, Math.max(3, Math.round(amount / 2)));
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(x, y, 'coin').setScale(3).setDepth(55);
      this.tweens.add({
        targets: coin, x: 60, y: 44, duration: 600, delay: i * 45, ease: 'Quad.in',
        onComplete: () => {
          coin.destroy(); SFX.coin();
          this.tweens.add({ targets: this.coinIcon, scale: 4.4, duration: 80, yoyo: true });
        },
      });
    }
    this.floatingText(x, y - 24, '+' + amount, '#ffe082');
  }

  showBanner(text, color, subtitle) {
    const t = this.add.text(GW / 2, 200, text, {
      fontFamily: 'monospace', fontSize: FS(48), color, fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(150).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 280, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: 170, delay: 900, duration: 500, onComplete: () => t.destroy() });
    if (subtitle) {
      const s = this.add.text(GW / 2, 248, subtitle, {
        fontFamily: 'monospace', fontSize: FS(18), color: '#f4efe6', fontStyle: 'bold',
        stroke: '#2a2030', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(150).setAlpha(0);
      this.tweens.add({ targets: s, alpha: 1, duration: 280, delay: 120 });
      this.tweens.add({ targets: s, alpha: 0, delay: 900, duration: 500, onComplete: () => s.destroy() });
    }
  }

  // ===========================================================================
  // UI
  // ===========================================================================
  buildUI() {
    this.coinIcon = this.add.image(40, 44, 'coin').setScale(4 * UI_SCALE).setDepth(100);
    this.coinsText = this.add.text(62, 30, '', {
      fontFamily: 'monospace', fontSize: FS(28), color: '#ffe082', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setDepth(100);
    this.updateCoinText();

    this.streakText = this.add.text(40, 70, '', {
      fontFamily: 'monospace', fontSize: FS(16), color: '#ffd166', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setDepth(100);

    this.levelText = this.add.text(GW / 2, 16, '', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#f4efe6', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(100);
    this.progressText = this.add.text(GW / 2, 42, '', {
      fontFamily: 'monospace', fontSize: FS(14), color: '#c9c0d0',
    }).setOrigin(0.5, 0).setDepth(100);

    this.heartIcons = [];

    this.muteBtn = this.add.text(GW - 16, 44, '🔊', { fontSize: FS(22) })
      .setOrigin(1, 0).setDepth(100).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => this.muteBtn.setText(SFX.toggleMute() ? '🔇' : '🔊'));

    // Store button — opens the cosmetics shop (pauses the level while open).
    this.storeBtn = this.add.container(GW - 70, 86).setDepth(100);
    const sbg = this.add.graphics();
    sbg.fillStyle(0x4a3a6a, 1); sbg.fillRoundedRect(-54, -16, 108, 32, 8);
    sbg.lineStyle(2, 0xb9a6e0, 1); sbg.strokeRoundedRect(-54, -16, 108, 32, 8);
    const slabel = this.add.text(0, 0, '🛍 STORE/PAUSE', {
      fontFamily: 'monospace', fontSize: FS(14), color: '#f4efe6', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.storeBtn.add([sbg, slabel]);
    const storeBtnHit = this.add.rectangle(GW - 70, 86, 108, 32).setDepth(101).setInteractive({ useHandCursor: true });
    storeBtnHit.on('pointerover', () => { this.tweens.killTweensOf(this.storeBtn); this.tweens.add({ targets: this.storeBtn, scale: 1.06, duration: 90 }); });
    storeBtnHit.on('pointerout', () => { this.tweens.killTweensOf(this.storeBtn); this.tweens.add({ targets: this.storeBtn, scale: 1, duration: 90 }); });
    storeBtnHit.on('pointerdown', () => this.openStore());

    if (DEV_MODE) {
      this.add.text(GW - 16, GH - 16, 'DEV: 1-9/0=L1-10  +/-=lvl±1', {
        fontFamily: 'monospace', fontSize: FS(11), color: '#ffd166', fontStyle: 'bold',
        stroke: '#2a2030', strokeThickness: 3,
      }).setOrigin(1, 1).setDepth(100).setAlpha(0.8);
    }
  }

  updateCoinText() { this.coinsText.setText(String(this.coins)); }
  updateStreakText() { this.streakText.setText(this.streak >= 2 ? '🔥 Combo x' + this.streak : ''); }
  updateLevelUI() {
    this.levelText.setText('LEVEL ' + this.level);
    this.progressText.setText(this.served + ' / ' + this.cfg.quota + ' served');
  }

  updateHearts() {
    this.heartIcons.forEach((h) => h.destroy());
    this.heartIcons = [];
    const spacing = 26;
    const startX = GW / 2 - ((this.maxLives - 1) * spacing) / 2;
    for (let i = 0; i < this.maxLives; i++) {
      const filled = i < this.lives;
      const h = this.add.image(startX + i * spacing, 70, 'heart').setScale(3 * UI_SCALE).setDepth(100);
      if (!filled) h.setTint(0x44384a).setAlpha(0.6);
      this.heartIcons.push(h);
    }
  }

  // ===========================================================================
  // Perk cards (between levels)
  // ===========================================================================
  // Weighted random pick from CARD_TIERS (50/30/15/5 by default).
  rollCardTier() {
    let r = Math.random() * CARD_TIER_TOTAL_WEIGHT;
    for (const t of CARD_TIERS) {
      if (r < t.weight) return t;
      r -= t.weight;
    }
    return CARD_TIERS[0];
  }

  // Scales a perk card's base amount by its rolled tier multiplier, rounded
  // to a step that makes sense for that stat (whole hearts, tenths of a
  // second of patience, etc.) so the displayed numbers stay tidy.
  scaleCardAmt(stat, baseAmt, mult) {
    const raw = baseAmt * mult;
    switch (stat) {
      case 'patience': return Math.round(raw * 10) / 10;
      case 'combo': return Math.round(raw * 1000) / 1000;
      case 'heart': return Math.max(1, Math.round(raw));
      case 'feet': case 'coins': return Math.round(raw / 5) * 5;
      default: return raw;
    }
  }

  cardPool() {
    const base = [
      { title: 'Calm Crowd', stat: 'patience', baseAmt: 0.6,
        desc: (a) => `+${a.toFixed(1)}s customer patience` },
      { title: 'Quick Feet', stat: 'feet', baseAmt: 70,
        desc: () => 'Move between makers faster' },
      { title: 'Combo Pro', stat: 'combo', baseAmt: 0.05,
        desc: () => 'Combos pay even more' },
      { title: 'Extra Heart', stat: 'heart', baseAmt: 1,
        desc: (a) => `+${a} max heart${a > 1 ? 's' : ''} & heal ${a > 1 ? 'them' : 'one'}` },
    ].filter((c) => !this.abilityMaxed(c.stat));

    const all = base.map((c) => {
      const tier = this.rollCardTier();
      const amt = this.scaleCardAmt(c.stat, c.baseAmt, tier.mult);
      return { title: c.title, desc: c.desc(amt), tier, perk: { stat: c.stat, amt } };
    });

    const windfallTier = this.rollCardTier();
    const windfallAmt = this.scaleCardAmt('coins', 80, windfallTier.mult);
    all.push({
      title: 'Windfall', desc: `+${windfallAmt} coins to spend in the Store`, tier: windfallTier,
      apply: () => { this.coins += windfallAmt; this.updateCoinText(); },
    });
    if (this.lives < this.maxLives) {
      // Always Bronze — refilling hearts is binary, so a higher tier
      // wouldn't change the effect and would just be misleading.
      all.push({ title: 'Second Wind', desc: 'Refill all hearts', tier: CARD_TIERS[0],
        apply: () => { this.lives = this.maxLives; this.updateHearts(); } });
    }
    return Phaser.Utils.Array.Shuffle(all).slice(0, 3);
  }

  // Casino-style "slot reel" reveal: ticks the badge through random tiers
  // (slowing down) before landing on `finalTier`, then calls onDone.
  runCardRoll(drawBadge, finalTier, onDone) {
    const delays = [60, 60, 70, 80, 100, 130, 170, 220];
    let i = 0;
    const tick = () => {
      const last = i === delays.length;
      const tier = last ? finalTier : CARD_TIERS[Phaser.Math.Between(0, CARD_TIERS.length - 1)];
      drawBadge(tier);
      SFX.blip(420 + i * 35, 0.04, 'square', 0.08);
      if (last) { onDone(); return; }
      this.time.delayedCall(delays[i], tick);
      i++;
    };
    tick();
  }

  showCardPick() {
    const cards = this.cardPool();
    const overlay = [];
    overlay.push(this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x140f1a, 0.75).setDepth(200).setInteractive());
    overlay.push(this.add.text(GW / 2, 110, 'LEVEL ' + this.level + ' CLEAR', {
      fontFamily: 'monospace', fontSize: FS(34), color: '#6abf5a', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(201));
    overlay.push(this.add.text(GW / 2, 152, 'Choose a perk', {
      fontFamily: 'monospace', fontSize: FS(18), color: '#f4efe6',
    }).setOrigin(0.5).setDepth(201));

    const cw = 200, ch = 240, gap = 30;
    const totalW = cards.length * cw + (cards.length - 1) * gap;
    let x = (GW - totalW) / 2 + cw / 2;
    cards.forEach((card, idx) => {
      const cont = this.add.container(x, 340).setDepth(201);

      // ── Glow halo (only shown for Gold/Platinum once revealed) ──
      const glow = this.add.graphics().setVisible(false);

      // ── Back face: shown during the casino-roll tick ──
      const backBg = this.add.graphics();
      backBg.fillStyle(0x2e2438, 1); backBg.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
      backBg.lineStyle(3, 0x6a5490, 1); backBg.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
      const backMark = this.add.text(0, -10, '?', {
        fontFamily: 'monospace', fontSize: FS(48), color: '#6a5490', fontStyle: 'bold',
      }).setOrigin(0.5);

      // ── Tier badge (reused for both the rolling tick and the final reveal) ──
      const badgeBg = this.add.graphics();
      const badgeText = this.add.text(0, -100, '', {
        fontFamily: 'monospace', fontSize: FS(13), color: '#2a2030', fontStyle: 'bold',
      }).setOrigin(0.5);
      const drawBadge = (tier) => {
        badgeBg.clear();
        badgeBg.fillStyle(tier.color, 1);
        badgeBg.fillRoundedRect(-58, -111, 116, 22, 6);
        badgeText.setText(tier.label);
      };
      drawBadge(CARD_TIERS[0]);

      // ── Front face: the actual perk, hidden until the roll lands ──
      const frontBg = this.add.graphics().setVisible(false);
      const title = this.add.text(0, -70, card.title, {
        fontFamily: 'monospace', fontSize: FS(20), color: '#ffe082', fontStyle: 'bold',
        align: 'center', wordWrap: { width: cw - 24 },
      }).setOrigin(0.5).setVisible(false);
      const desc = this.add.text(0, 20, card.desc, {
        fontFamily: 'monospace', fontSize: FS(14), color: '#d8d0e0',
        align: 'center', wordWrap: { width: cw - 28 },
      }).setOrigin(0.5).setVisible(false);
      const hint = this.add.text(0, ch / 2 - 26, 'PICK', {
        fontFamily: 'monospace', fontSize: FS(14), color: '#6abf5a', fontStyle: 'bold',
      }).setOrigin(0.5).setVisible(false);

      cont.add([glow, backBg, backMark, frontBg, title, desc, hint, badgeBg, badgeText]);

      const perkHit = this.add.rectangle(x, 340, cw, ch).setDepth(202);
      perkHit.on('pointerover', () => { this.tweens.killTweensOf(cont); this.tweens.add({ targets: cont, scale: 1.05, duration: 100 }); });
      perkHit.on('pointerout', () => { this.tweens.killTweensOf(cont); this.tweens.add({ targets: cont, scale: 1, duration: 100 }); });
      perkHit.on('pointerdown', () => {
        SFX.cash();
        if (card.perk) { this.applyPerk(card.perk); this.abilityLevels[card.perk.stat]++; }
        else card.apply();
        overlay.forEach((o) => o.destroy());
        const nextLevel = this.level + 1;
        if (this.isRushLevel(nextLevel)) {
          this.showRushHourAnnouncement(nextLevel, () => this.startLevel(nextLevel));
        } else {
          this.startLevel(nextLevel);
        }
      });
      overlay.push(cont);
      overlay.push(perkHit);

      // Entrance pop, then the casino roll, then flip to reveal the card.
      cont.setScale(0.6); cont.setAlpha(0);
      this.tweens.add({
        targets: cont, scale: 1, alpha: 1, duration: 260, ease: 'Back.out', delay: 80 + idx * 150,
        onComplete: () => {
          this.runCardRoll(drawBadge, card.tier, () => {
            this.tweens.add({
              targets: cont, scaleX: 0, duration: 90, ease: 'Sine.in',
              onComplete: () => {
                backBg.setVisible(false);
                backMark.setVisible(false);
                frontBg.clear();
                frontBg.fillStyle(0x2e2438, 1); frontBg.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
                frontBg.lineStyle(4, card.tier.color, 1); frontBg.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 12);
                frontBg.setVisible(true);
                title.setVisible(true); desc.setVisible(true); hint.setVisible(true);
                if (card.tier.id === 'gold' || card.tier.id === 'platinum') {
                  glow.clear();
                  glow.lineStyle(6, card.tier.glow, 0.5);
                  glow.strokeRoundedRect(-cw / 2 - 5, -ch / 2 - 5, cw + 10, ch + 10, 16);
                  glow.setVisible(true).setAlpha(0.5);
                  this.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.7 }, yoyo: true, repeat: -1, duration: 450 });
                }
                this.tweens.add({ targets: cont, scaleX: 1, duration: 120, ease: 'Back.out' });
                SFX.ding();
                perkHit.setInteractive({ useHandCursor: true });
              },
            });
          });
        },
      });
      x += cw + gap;
    });
  }

  showRushHourAnnouncement(nextLevel, onStart) {
    const mods = this.selectRushModifiers(nextLevel);
    this._pendingRushModifiers = mods;

    this.cameras.main.shake(280, 0.012);
    this.cameras.main.flash(350, 140, 10, 10);

    const o = [];
    o.push(this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x1a0808, 0.92).setDepth(200).setInteractive());

    // Pulsing red border
    const bw = 5, bCol = 0xe5564d;
    [[GW / 2, bw / 2, GW, bw], [GW / 2, GH - bw / 2, GW, bw],
     [bw / 2, GH / 2, bw, GH], [GW - bw / 2, GH / 2, bw, GH]].forEach(([x, y, w, h]) => {
      const r = this.add.rectangle(x, y, w, h, bCol).setDepth(201).setAlpha(0.9);
      this.tweens.add({ targets: r, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
      o.push(r);
    });

    const title = this.add.text(GW / 2, 82, '⚠  RUSH HOUR  ⚠', {
      fontFamily: 'monospace', fontSize: FS(40), color: '#e5564d', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(202).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 360, ease: 'Back.out' });
    o.push(title);

    const subText = this.add.text(GW / 2, 136,
      'LEVEL ' + nextLevel + '  —  ' + mods.length + ' MODIFIER' + (mods.length > 1 ? 'S' : '') + ' ACTIVE', {
      fontFamily: 'monospace', fontSize: FS(17), color: '#e09a4f', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(202).setAlpha(0);
    this.tweens.add({ targets: subText, alpha: 1, duration: 300, delay: 120 });
    o.push(subText);

    const modDefs = mods.map((id) => RUSH_MODIFIERS.find((m) => m.id === id));
    const cols = Math.min(modDefs.length, 4);
    const cardW = Math.min(178, (GW - 60) / cols - 14);
    const cardH = 172;
    const gap = 14;
    const totalW = cols * cardW + (cols - 1) * gap;
    let mx = GW / 2 - totalW / 2 + cardW / 2;

    modDefs.forEach((mod, i) => {
      const rowY = modDefs.length > 4 ? (i < 4 ? 288 : 478) : 308;
      const cont = this.add.container(mx, rowY).setDepth(202).setAlpha(0).setScale(0.7);
      const bg2 = this.add.graphics();
      bg2.fillStyle(0x3a1010, 1);
      bg2.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
      bg2.lineStyle(2, 0xe5564d, 0.9);
      bg2.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
      const iconT = this.add.text(0, -cardH / 2 + 26, mod.icon, { fontSize: FS(28) }).setOrigin(0.5);
      const nameT = this.add.text(0, -cardH / 2 + 60, mod.title, {
        fontFamily: 'monospace', fontSize: FS(13), color: '#f4efe6', fontStyle: 'bold',
        align: 'center', wordWrap: { width: cardW - 12 },
      }).setOrigin(0.5);
      const descT = this.add.text(0, cardH / 2 - 40, mod.desc, {
        fontFamily: 'monospace', fontSize: FS(10), color: '#c9c0d0',
        align: 'center', wordWrap: { width: cardW - 12 },
      }).setOrigin(0.5);
      cont.add([bg2, iconT, nameT, descT]);
      this.tweens.add({ targets: cont, alpha: 1, scale: 1, duration: 300, ease: 'Back.out', delay: 180 + (i % 4) * 90 });
      o.push(cont);
      if ((i + 1) % 4 === 0) mx = GW / 2 - totalW / 2 + cardW / 2;
      else mx += cardW + gap;
    });

    const btnY = GH - 68;
    const btnCont = this.add.container(GW / 2, btnY).setDepth(202).setAlpha(0);
    const btnBg2 = this.add.graphics();
    btnBg2.fillStyle(0x6a1a1a, 1);
    btnBg2.fillRoundedRect(-130, -26, 260, 52, 10);
    btnBg2.lineStyle(3, 0xe5564d, 1);
    btnBg2.strokeRoundedRect(-130, -26, 260, 52, 10);
    const btnLabel2 = this.add.text(0, 0, 'BRACE YOURSELF', {
      fontFamily: 'monospace', fontSize: FS(21), color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    btnCont.add([btnBg2, btnLabel2]);
    this.tweens.add({ targets: btnCont, alpha: 1, duration: 320, delay: 450 });
    o.push(btnCont);

    const btnHit = this.add.rectangle(GW / 2, btnY, 260, 52).setDepth(203)
      .setInteractive({ useHandCursor: true });
    btnHit.on('pointerover', () => this.tweens.add({ targets: btnCont, scale: 1.06, duration: 80 }));
    btnHit.on('pointerout',  () => this.tweens.add({ targets: btnCont, scale: 1,    duration: 80 }));
    btnHit.on('pointerdown', () => {
      SFX.buzz();
      this.cameras.main.shake(180, 0.01);
      btnHit.destroy();
      o.forEach((obj) => obj.destroy());
      onStart();
    });
    o.push(btnHit);
  }

  buildRushOverlay() {
    this.destroyRushOverlay();
    this.rushOverlayObjs = [];

    const bw = 6, col = 0xe5564d;
    [[GW / 2, bw / 2, GW, bw], [GW / 2, GH - bw / 2, GW, bw],
     [bw / 2, GH / 2, bw, GH], [GW - bw / 2, GH / 2, bw, GH]].forEach(([x, y, w, h]) => {
      const r = this.add.rectangle(x, y, w, h, col).setDepth(95).setAlpha(0.6);
      this.tweens.add({ targets: r, alpha: 0.12, duration: 800, yoyo: true, repeat: -1 });
      this.rushOverlayObjs.push(r);
    });

    const label = this.add.text(12, 116, '⚠ RUSH HOUR', {
      fontFamily: 'monospace', fontSize: FS(13), color: '#e5564d', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setDepth(100);
    this.tweens.add({ targets: label, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    this.rushOverlayObjs.push(label);

    this.rushModifiers.forEach((id, i) => {
      const mod = RUSH_MODIFIERS.find((m) => m.id === id);
      if (!mod) return;
      const t = this.add.text(12, 134 + i * 16, mod.icon + ' ' + mod.title, {
        fontFamily: 'monospace', fontSize: FS(11), color: '#e09a4f',
        stroke: '#2a2030', strokeThickness: 2,
      }).setDepth(100).setAlpha(0.85);
      this.rushOverlayObjs.push(t);
    });

    this._rushShakeTimer = this.time.addEvent({
      delay: 5500,
      loop: true,
      callback: () => { if (this.state === 'playing') this.cameras.main.shake(80, 0.003); },
    });
  }

  destroyRushOverlay() {
    (this.rushOverlayObjs || []).forEach((obj) => { if (obj && obj.destroy) obj.destroy(); });
    this.rushOverlayObjs = [];
    if (this._rushShakeTimer) { this._rushShakeTimer.remove(); this._rushShakeTimer = null; }
  }

  showGameOver() {
    SFX.buzz();
    const o = [];
    o.push(this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x140f1a, 0.82).setDepth(200).setInteractive());
    o.push(this.add.text(GW / 2, 180, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: FS(52), color: '#e5564d', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(201));
    o.push(this.add.text(GW / 2, 250, 'You reached Level ' + this.level + '\nCoins earned: ' + this.coins, {
      fontFamily: 'monospace', fontSize: FS(20), color: '#f4efe6', align: 'center',
    }).setOrigin(0.5).setDepth(201));

    if (this.level > this.runStartBest) {
      const best = this.add.text(GW / 2, 300, '★ NEW BEST!  Level ' + this.level + ' ★', {
        fontFamily: 'monospace', fontSize: FS(22), color: '#ffe082', fontStyle: 'bold',
        stroke: '#2a2030', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(201).setScale(0.5).setAlpha(0);
      this.tweens.add({ targets: best, scale: 1, alpha: 1, duration: 280, ease: 'Back.out', delay: 200 });
      o.push(best);
    } else {
      o.push(this.add.text(GW / 2, 300, 'Best: Level ' + this.runStartBest, {
        fontFamily: 'monospace', fontSize: FS(16), color: '#c9b8d8',
      }).setOrigin(0.5).setDepth(201));
    }

    const makeButton = (x, fill, stroke, text, onClick) => {
      const btn = this.add.container(x, 360).setDepth(201);
      const bg = this.add.graphics();
      bg.fillStyle(fill, 1); bg.fillRoundedRect(-100, -28, 200, 56, 10);
      bg.lineStyle(3, stroke, 1); bg.strokeRoundedRect(-100, -28, 200, 56, 10);
      const label = this.add.text(0, 0, text, {
        fontFamily: 'monospace', fontSize: FS(24), color: '#fff', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.add([bg, label]);
      const hit = this.add.rectangle(x, 360, 200, 56).setDepth(202).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1.06, duration: 100 }); });
      hit.on('pointerout', () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1, duration: 100 }); });
      hit.on('pointerdown', onClick);
      o.push(btn);
      o.push(hit);
    };
    makeButton(GW / 2 - 120, 0x3a5a3a, 0x6abf5a, 'RETRY', () => { SFX.cash(); this.scene.restart(); });
    makeButton(GW / 2 + 120, 0x4a3a6a, 0xb9a6e0, 'MENU', () => { SFX.blip(720, 0.05); this.scene.start('MenuScene'); });
  }

  addPlant() {
    const slot = this.plantSlots.shift();
    if (!slot) return;
    const p = this.add.image(slot.x, slot.y, 'plant').setScale(4).setDepth(2).setAlpha(0);
    this.tweens.add({ targets: p, alpha: 1, y: slot.y - 6, duration: 400, ease: 'Back.out' });
  }

  // ===========================================================================
  // Cosmetics: wall themes, decorations
  // ===========================================================================
  drawWall(themeId) {
    const t = WALL_THEMES[themeId] || WALL_THEMES.plaster;
    const g = this.wallGfx;
    g.clear();
    const c1 = Phaser.Display.Color.IntegerToColor(t.top);
    const c2 = Phaser.Display.Color.IntegerToColor(t.bottom);
    for (let i = 0; i < WALL_BOTTOM; i += 2) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 100, (i / WALL_BOTTOM) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, i, GW, 2);
    }
    const top = WALL_BOTTOM - 30;
    if (t.pattern === 'stripes') {
      g.fillStyle(0xffffff, 0.05 * WALL_DIM);
      for (let x = 20; x < GW; x += 40) g.fillRect(x, 0, 16, top);
    } else if (t.pattern === 'brick') {
      g.lineStyle(2, 0x000000, 0.22 * WALL_DIM);
      for (let y = 0, row = 0; y < top; y += 16, row++) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(GW, y); g.strokePath();
        const off = (row % 2) ? 20 : 0;
        for (let x = off; x < GW; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.strokePath(); }
      }
      g.fillStyle(0xffffff, 0.04 * WALL_DIM);
      for (let y = 1, row = 0; y < top; y += 16, row++) {
        const off = (row % 2) ? 20 : 0;
        for (let x = off + 1; x < GW; x += 40) g.fillRect(x, y, 38, 6);
      }
    } else if (t.pattern === 'panel') {
      g.lineStyle(3, 0x000000, 0.20 * WALL_DIM);
      for (let x = 30; x < GW; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, top); g.strokePath(); }
      g.fillStyle(0xffffff, 0.05 * WALL_DIM);
      for (let x = 32; x < GW; x += 60) g.fillRect(x, 0, 3, top);
    }
    // Chair rail + baseboard (tinted, theme-agnostic).
    g.fillStyle(0x000000, 0.22); g.fillRect(0, top, GW, 30);
    g.fillStyle(0xffffff, 0.10); g.fillRect(0, top - 4, GW, 4);
    g.fillStyle(0x000000, 0.40); g.fillRect(0, WALL_BOTTOM - 6, GW, 6);
  }

  equipWall(id) {
    this.equippedWall = id;
    this.drawWall(id);
  }

  // Tier = how many skin levels a station has unlocked, based on the LOWER
  // of its Pour Speed / Steady Hands levels (capped at the top tier).
  stationSkinTier(st) {
    return Math.min(st.pourLevel, st.tolLevel, STATION_SKIN_TIERS.length);
  }

  stationTexture(st) {
    const tier = this.stationSkinTier(st);
    return tier === 0 ? st.tex : st.tex + '_' + STATION_SKIN_TIERS[tier - 1];
  }

  // Re-applies a station's skin texture to match its current tier; called
  // after a Pour Speed / Steady Hands purchase in case the tier changed.
  refreshStationSkin(st) {
    const tex = this.stationTexture(st);
    if (st.machine.texture.key === tex) return;
    st.machine.setTexture(tex);
    this.tweens.add({ targets: st.machine, scaleY: 6.3, duration: 140, yoyo: true });
  }

  // Apply a one-time/levelled mechanical perk (shared by cosmetics + upgrades).
  applyPerk(perk) {
    if (!perk) return;
    switch (perk.stat) {
      case 'patience': this.patienceBonus += perk.amt; break;
      case 'combo': this.comboStep += perk.amt; break;
      case 'feet': this.baristaMoveDur = Math.max(150, this.baristaMoveDur - perk.amt); break;
      case 'heart':
        this.maxLives += perk.amt;
        this.lives = Math.min(this.maxLives, this.lives + perk.amt);
        this.updateHearts();
        break;
      default: break;
    }
  }

  upgradeCost(u) { return Math.floor(u.baseCost * Math.pow(u.rate, u.level)); }

  abilityMaxed(stat) {
    return !DEV_MODE && (this.abilityLevels[stat] || 0) >= ABILITY_LEVEL_CAP;
  }

  stationUpgradeCost(st, key) {
    const u = STATION_UPGRADES[key];
    return Math.floor(u.baseCost * Math.pow(u.rate, st[key + 'Level']));
  }

  stationUpgradeMaxed(st, key) {
    return !DEV_MODE && st[key + 'Level'] >= ABILITY_LEVEL_CAP;
  }

  // Rebuild the store on the NEXT tick. Doing it synchronously inside a button's
  // own pointerdown would destroy that button mid-event and wedge Phaser's input
  // (the cause of the dead Walls/Decorations buttons).
  refreshStoreSoon() {
    this.time.delayedCall(0, () => { if (this.state === 'store') this.buildStoreUI(); });
  }

  // --- decoration placers ---
  placeRug() {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x8a3b4a, 1); g.fillRoundedRect(520, 452, 260, 96, 14);
    g.fillStyle(0xb55a68, 1); g.fillRoundedRect(532, 462, 236, 76, 10);
    g.lineStyle(3, 0xf0c14f, 0.85); g.strokeRoundedRect(540, 470, 220, 60, 8);
    g.fillStyle(0xf0c14f, 0.5);
    for (let x = 552; x < 760; x += 26) g.fillRect(x, 498, 12, 4);
  }

  placeCat() {
    const cat = this.add.image(485, COUNTER_TOP - 1, 'cat').setOrigin(0.5, 1).setScale(4).setDepth(6);
    this.tweens.add({ targets: cat, scaleY: 4.18, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  placeNeon() {
    const x = 470, y = 46;
    this.addGlow(x, y, 170, 0xff66cc, 0.5, 2);
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(3, 0xff8ad6, 1); g.strokeRoundedRect(x - 60, y - 21, 120, 42, 10);
    const t = this.add.text(x, y, 'OPEN', {
      fontFamily: 'monospace', fontSize: FS(22), color: '#ffd0f2', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(4);
    t.setShadow(0, 0, '#ff66cc', 10, true, true);
  }

  placeStringLights() {
    const n = 14;
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(2, 0x1a1422, 1);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([(GW / n) * i, 14 + Math.abs(Math.sin(i * 0.9)) * 10]);
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : (g.beginPath(), g.moveTo(p[0], p[1]))));
    g.strokePath();
    const colors = [0xff6b6b, 0xffd166, 0x6abf5a, 0x4f8de0, 0xc45ec4];
    pts.forEach((p, i) => {
      const c = colors[i % colors.length];
      this.addGlow(p[0], p[1] + 4, 34, c, 0.45, 2);
      this.add.circle(p[0], p[1] + 4, 3, c).setDepth(3);
    });
  }

  placeArt() {
    this.drawFrame(730, 236, 56, 44, Phaser.Utils.Array.GetRandom([0xe5564d, 0x4f8de0, 0xffd166]));
  }

  // ===========================================================================
  // Store overlay
  // ===========================================================================
  openStore() {
    // Also blocked while a serve is in flight — finishServe mutating lives /
    // completing the level under an open store would orphan the overlay.
    if (this.state !== 'playing' || this.pouring || this.serving) return;
    this.state = 'store';
    this.cancelPour();
    if (this.spawnTimer) this.spawnTimer.paused = true;
    // Freeze customers mid-walk. Not tweens.pauseAll(): that gates the whole
    // manager, including the store's own hover/equip tweens created later.
    this.customers.forEach((c) => this.tweens.getTweensOf(c.container).forEach((t) => t.pause()));
    this.buildStoreUI();
  }

  closeStore() {
    this.state = 'playing';
    if (this.spawnTimer) this.spawnTimer.paused = false;
    this.customers.forEach((c) => this.tweens.getTweensOf(c.container).forEach((t) => t.resume()));
    // Defer the teardown so we don't destroy the ✕ button during its own event.
    this.time.delayedCall(0, () => this.destroyStore());
  }

  destroyStore() {
    if (this.storeUI) this.storeUI.forEach((o) => o.destroy());
    this.storeUI = [];
  }

  buildStoreUI() {
    this.destroyStore();
    this.storeUI = [];
    const cx = GW / 2, cy = 300, pw = 700, ph = 470;

    this.storeUI.push(this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0a0710, 0.6).setDepth(200).setInteractive());
    const panel = this.add.graphics().setDepth(201);
    panel.fillStyle(0x241b30, 0.98); panel.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    panel.lineStyle(3, 0xb9a6e0, 1); panel.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    this.storeUI.push(panel);

    this.storeUI.push(this.add.text(cx - pw / 2 + 24, cy - ph / 2 + 18, '🛍  STORE', {
      fontFamily: 'monospace', fontSize: FS(26), color: '#f4efe6', fontStyle: 'bold',
    }).setDepth(202));
    this.storeUI.push(this.add.image(cx + pw / 2 - 168, cy - ph / 2 + 32, 'coin').setScale(3).setDepth(202));
    this.storeUI.push(this.add.text(cx + pw / 2 - 150, cy - ph / 2 + 20, this.coins + ' coins', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#ffe082', fontStyle: 'bold',
    }).setDepth(202));

    const close = this.add.text(cx + pw / 2 - 22, cy - ph / 2 + 14, '✕', {
      fontFamily: 'monospace', fontSize: FS(24), color: '#e5564d', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(202).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closeStore());
    this.storeUI.push(close);

    // Tabs.
    const tabs = [['upgrades', 'Upgrades'], ['machines', 'Machines'], ['walls', 'Walls'], ['decor', 'Decor'], ['staff', 'Staff']];
    let tx = cx - pw / 2 + 24;
    const ty = cy - ph / 2 + 78;
    tabs.forEach(([id, label]) => {
      const active = this.storeTab === id;
      const w = label.length * 10 + 28;
      const tb = this.add.container(tx + w / 2, ty).setDepth(202);
      const bg = this.add.graphics();
      bg.fillStyle(active ? 0x6a5490 : 0x352b48, 1); bg.fillRoundedRect(-w / 2, -16, w, 32, 8);
      const lt = this.add.text(0, 0, label, {
        fontFamily: 'monospace', fontSize: FS(14), color: active ? '#fff' : '#b9a6e0', fontStyle: 'bold',
      }).setOrigin(0.5);
      tb.add([bg, lt]);
      const tbHit = this.add.rectangle(tx + w / 2, ty, w, 32).setDepth(203).setInteractive({ useHandCursor: true });
      tbHit.on('pointerdown', () => { if (this.storeTab !== id) { this.storeTab = id; this.refreshStoreSoon(); } });
      this.storeUI.push(tb);
      this.storeUI.push(tbHit);
      tx += w + 10;
    });

    this.renderStoreItems(cx, cy, pw);
  }

  renderStoreItems(cx, cy) {
    let items = [];
    if (this.storeTab === 'upgrades') {
      items = this.shopUpgrades.map((u) => {
        const lvl = this.abilityLevels[u.perk.stat];
        const maxed = this.abilityMaxed(u.perk.stat);
        return {
          id: u.id, title: u.title, price: this.upgradeCost(u), owned: false, equipped: false, canEquip: false,
          repeatable: true, thumbType: 'emoji', thumbVal: u.icon,
          subline: 'Lv ' + lvl + (maxed ? ' (MAX)' : ''), sublineColor: maxed ? '#7fd98f' : '#ffd166',
          statusOverride: maxed ? { text: 'MAXED', color: '#6abf5a', clickable: false } : undefined,
          onActivate: () => this.storeAction('upgrade', u.id),
        };
      });
    } else if (this.storeTab === 'machines') {
      // Station selector row.
      const selY = cy - 70;
      const btnW = 80, btnH = 60, selGap = 14;
      const selStartX = cx - (STATIONS.length * btnW + (STATIONS.length - 1) * selGap) / 2 + btnW / 2;
      STATIONS.forEach((st, i) => {
        const active = this.storeMachineIndex === i;
        const locked = !st.revealed;
        const bx = selStartX + i * (btnW + selGap);
        const bg = this.add.graphics().setDepth(202);
        bg.fillStyle(active ? 0x6a5490 : 0x352b48, 1);
        bg.fillRoundedRect(bx - btnW / 2, selY - btnH / 2, btnW, btnH, 8);
        if (active) { bg.lineStyle(2, 0xb9a6e0, 1); bg.strokeRoundedRect(bx - btnW / 2, selY - btnH / 2, btnW, btnH, 8); }
        this.storeUI.push(bg);
        const img = this.add.image(bx, selY - 8, this.stationTexture(st)).setScale(1.4).setDepth(203).setAlpha(locked ? 0.35 : 1);
        this.storeUI.push(img);
        const lbl = this.add.text(bx, selY + 19, locked ? '🔒 Locked' : st.sign, {
          fontFamily: 'monospace', fontSize: FS(9), color: locked ? '#9a8fb0' : (active ? '#fff' : '#b9a6e0'), fontStyle: 'bold',
          align: 'center', wordWrap: { width: btnW - 6 },
        }).setOrigin(0.5).setDepth(203);
        this.storeUI.push(lbl);
        const hit = this.add.rectangle(bx, selY, btnW, btnH).setDepth(204).setInteractive({ useHandCursor: !locked });
        if (!locked) {
          hit.on('pointerdown', () => { if (this.storeMachineIndex !== i) { this.storeMachineIndex = i; this.refreshStoreSoon(); } });
        } else {
          hit.on('pointerdown', () => SFX.buzz());
        }
        this.storeUI.push(hit);
      });

      const selSt = STATIONS[this.storeMachineIndex];
      if (!selSt.revealed) {
        this.storeUI.push(this.add.text(cx, cy + 60, '🔒 ' + selSt.sign + ' unlocks at\nLevel ' + selSt.unlock, {
          fontFamily: 'monospace', fontSize: FS(16), color: '#9a8fb0', fontStyle: 'bold', align: 'center',
        }).setOrigin(0.5).setDepth(202));
        return;
      }
      const mCardW = 200, mCardH = 150, mGap = 18, mY = cy + 50;
      ['pour', 'tol'].forEach((key, i) => {
        const u = STATION_UPGRADES[key];
        const lvl = selSt[key + 'Level'];
        const maxed = this.stationUpgradeMaxed(selSt, key);
        const info = {
          id: key, title: u.title, price: this.stationUpgradeCost(selSt, key), owned: false, equipped: false, canEquip: false,
          repeatable: true, thumbType: 'emoji', thumbVal: u.icon,
          subline: 'Lv ' + lvl + (maxed ? ' (MAX)' : ''), sublineColor: maxed ? '#7fd98f' : '#ffd166',
          statusOverride: maxed ? { text: 'MAXED', color: '#6abf5a', clickable: false } : undefined,
          onActivate: () => this.storeAction('stationUpgrade', { station: this.storeMachineIndex, key }),
        };
        this.makeStoreCard(cx + (i === 0 ? -1 : 1) * (mCardW + mGap) / 2, mY, mCardW, mCardH, info);
      });
      return;
    } else if (this.storeTab === 'walls') {
      items = Object.keys(WALL_THEMES).map((id) => {
        const t = WALL_THEMES[id];
        return { id, title: t.name, price: t.price, owned: this.ownedWalls.has(id), equipped: this.equippedWall === id,
          canEquip: true, thumbType: 'color', thumbVal: t.swatch,
          subline: t.perk && t.perk.text, sublineColor: '#7fd98f', onActivate: () => this.storeAction('wall', id) };
      });
    } else if (this.storeTab === 'decor') {
      items = this.decorCatalog.map((d) => ({
        id: d.id, title: d.name, price: d.price, owned: this.ownedDecor.has(d.id), equipped: false, canEquip: false,
        thumbType: 'emoji', thumbVal: d.emoji,
        subline: d.perk && d.perk.text, sublineColor: '#7fd98f', onActivate: () => this.storeAction('decor', d.id) }));
    } else { // staff
      if (!this.employeesUnlocked()) {
        this.storeUI.push(this.add.text(cx, cy + 10, '🔒 Staff unlocks after\nclearing Level 10', {
          fontFamily: 'monospace', fontSize: FS(16), color: '#9a8fb0', fontStyle: 'bold', align: 'center',
        }).setOrigin(0.5).setDepth(202));
        return;
      }
      if (!this.employee.hired) {
        items = [{
          id: 'hire', title: 'Hire Barista', price: EMPLOYEE_HIRE_COST, owned: false, equipped: false, canEquip: false,
          thumbType: 'tex', thumbVal: 'barista',
          subline: 'Auto-pours one machine', sublineColor: '#7fd98f',
          onActivate: () => this.storeAction('hireEmployee'),
        }];
      } else {
        items = STATIONS.map((st, i) => ({
          id: 'station' + i, title: st.sign, price: 0, owned: true, equipped: this.employee.station === i, canEquip: false,
          thumbType: 'tex', thumbVal: st.tex,
          subline: st.revealed ? 'Assign employee here' : 'Locked',
          sublineColor: st.revealed ? '#7fd98f' : '#9a8fb0',
          statusOverride: this.employee.station === i ? { text: 'ASSIGNED', color: '#6abf5a', clickable: false }
            : !st.revealed ? { text: 'LOCKED', color: '#9a8fb0', clickable: false }
            : { text: 'ASSIGN', color: '#ffe082', clickable: true },
          onActivate: () => this.storeAction('assignEmployee', i),
        }));
        items.push({
          id: 'empPour', title: 'Faster Pouring (Staff)', price: this.employeePourCost(), owned: false, equipped: false, canEquip: false,
          repeatable: true, thumbType: 'emoji', thumbVal: '⚡',
          subline: 'Lv ' + this.employee.pourLevel + (this.employeePourMaxed() ? ' (MAX)' : ''), sublineColor: this.employeePourMaxed() ? '#7fd98f' : '#ffd166',
          statusOverride: this.employeePourMaxed() ? { text: 'MAXED', color: '#6abf5a', clickable: false } : undefined,
          onActivate: () => this.storeAction('upgradeEmployee'),
        });
      }
    }

    const cardW = 200, cardH = 150, gap = 18, step = cardW + gap;
    const startX = cx - step;        // 3 columns, centered
    const firstY = cy - 28;
    items.forEach((info, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      this.makeStoreCard(startX + col * step, firstY + row * (cardH + 16), cardW, cardH, info);
    });
  }

  makeStoreCard(x, y, w, h, info) {
    const cont = this.add.container(x, y).setDepth(202);
    const affordable = this.coins >= info.price;
    const bg = this.add.graphics();
    bg.fillStyle(0x2e2440, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, info.equipped ? 0x6abf5a : 0x564a72, 1); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    cont.add(bg);

    const thumbY = -h / 2 + 36;
    if (info.thumbType === 'color') {
      const tg = this.add.graphics();
      tg.fillStyle(info.thumbVal, 1); tg.fillRoundedRect(-32, thumbY - 22, 64, 44, 6);
      tg.lineStyle(2, 0x241b2e, 1); tg.strokeRoundedRect(-32, thumbY - 22, 64, 44, 6);
      cont.add(tg);
    } else if (info.thumbType === 'tex') {
      cont.add(this.add.image(0, thumbY, info.thumbVal).setScale(2.4));
    } else {
      cont.add(this.add.text(0, thumbY, info.thumbVal, { fontSize: FS(36) }).setOrigin(0.5));
    }

    cont.add(this.add.text(0, h / 2 - 56, info.title, {
      fontFamily: 'monospace', fontSize: FS(15), color: '#f4efe6', fontStyle: 'bold',
      align: 'center', wordWrap: { width: w - 16 },
    }).setOrigin(0.5));

    if (info.subline) {
      cont.add(this.add.text(0, h / 2 - 38, info.subline, {
        fontFamily: 'monospace', fontSize: FS(12), color: info.sublineColor || '#9a8fb0', fontStyle: 'bold',
      }).setOrigin(0.5));
    }

    let statusText, statusColor, clickable = true;
    if (info.statusOverride) {
      ({ text: statusText, color: statusColor, clickable } = info.statusOverride);
    } else if (info.equipped) { statusText = 'EQUIPPED'; statusColor = '#6abf5a'; clickable = false; }
    else if (info.owned && info.canEquip) { statusText = 'EQUIP'; statusColor = '#ffe082'; }
    else if (info.owned) { statusText = 'OWNED'; statusColor = '#9a8fb0'; clickable = false; }
    else { statusText = info.price + ' coins'; statusColor = affordable ? '#ffe082' : '#e5564d'; clickable = affordable; }
    cont.add(this.add.text(0, h / 2 - 20, statusText, {
      fontFamily: 'monospace', fontSize: FS(14), color: statusColor, fontStyle: 'bold',
    }).setOrigin(0.5));

    const cardHit = this.add.rectangle(x, y, w, h).setDepth(203).setInteractive({ useHandCursor: clickable });
    if (clickable) {
      cardHit.on('pointerover', () => { this.tweens.killTweensOf(cont); this.tweens.add({ targets: cont, scale: 1.04, duration: 90 }); });
      cardHit.on('pointerout', () => { this.tweens.killTweensOf(cont); this.tweens.add({ targets: cont, scale: 1, duration: 90 }); });
      cardHit.on('pointerdown', () => info.onActivate());
    } else if (!info.equipped && !info.owned) {
      cardHit.on('pointerdown', () => SFX.buzz());
    }
    this.storeUI.push(cont);
    this.storeUI.push(cardHit);
  }

  storeAction(type, id) {
    // Dev mode: keep the wallet topped up so every purchase is affordable.
    if (DEV_MODE && this.coins < 999999) { this.coins = 999999; this.updateCoinText(); }
    if (type === 'wall') {
      const t = WALL_THEMES[id];
      if (this.ownedWalls.has(id)) { this.equipWall(id); SFX.blip(720, 0.05); }
      else {
        if (this.coins < t.price) { SFX.buzz(); return; }
        this.coins -= t.price; this.ownedWalls.add(id); SFX.cash();
        this.equipWall(id); this.applyPerk(t.perk); this.updateCoinText();
      }
    } else if (type === 'decor') {
      const d = this.decorCatalog.find((x) => x.id === id);
      if (this.ownedDecor.has(id)) return;
      if (this.coins < d.price) { SFX.buzz(); return; }
      this.coins -= d.price; this.ownedDecor.add(id); SFX.cash();
      d.place(); this.applyPerk(d.perk); this.updateCoinText();
    } else if (type === 'hireEmployee') {
      if (this.employee.hired) return;
      if (this.coins < EMPLOYEE_HIRE_COST) { SFX.buzz(); return; }
      this.coins -= EMPLOYEE_HIRE_COST; this.employee.hired = true; SFX.cash(); this.updateCoinText();
    } else if (type === 'assignEmployee') {
      if (!this.employee.hired || !STATIONS[id].revealed) return;
      this.employee.station = id;
      this.employee.busy = false;
      if (!this.employee.sprite) this.spawnEmployeeSprite(); else this.positionEmployeeSprite();
      SFX.blip(720, 0.05);
    } else if (type === 'upgradeEmployee') {
      if (this.employeePourMaxed()) { SFX.buzz(); return; }
      const cost = this.employeePourCost();
      if (this.coins < cost) { SFX.buzz(); return; }
      this.coins -= cost; this.employee.pourLevel++; SFX.cash(); this.updateCoinText();
    } else if (type === 'stationUpgrade') {
      const st = STATIONS[id.station];
      if (this.stationUpgradeMaxed(st, id.key)) { SFX.buzz(); return; }
      const cost = this.stationUpgradeCost(st, id.key);
      if (this.coins < cost) { SFX.buzz(); return; }
      this.coins -= cost; st[id.key + 'Level']++; SFX.cash(); this.updateCoinText();
      this.refreshStationSkin(st);
    } else { // upgrade (repeatable)
      const u = this.shopUpgrades.find((x) => x.id === id);
      if (this.abilityMaxed(u.perk.stat)) { SFX.buzz(); return; }
      const cost = this.upgradeCost(u);
      if (this.coins < cost) { SFX.buzz(); return; }
      this.coins -= cost; u.level++; this.applyPerk(u.perk);
      this.abilityLevels[u.perk.stat]++; SFX.cash(); this.updateCoinText();
    }
    this.refreshStoreSoon();
  }
}
