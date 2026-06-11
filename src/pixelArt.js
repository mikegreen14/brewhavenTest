/*
 * Code-drawn pixel art.
 *
 * Each sprite is an array of strings (a little ASCII grid). Every character
 * maps to a color in a palette; spaces and '.' are transparent. We paint the
 * grid onto a Phaser canvas texture at 1px-per-cell, then let the game scale
 * the sprites up with nearest-neighbor filtering (config.pixelArt = true) so
 * everything stays crisp and pixelly.
 *
 * Rows do NOT need to be equal length — the builder uses the longest row as
 * the width and leaves the rest transparent on the right.
 *
 * v3 graphical pass: every sprite keeps its original footprint (so the game
 * layout is untouched) but gains shading, highlights, and detail. A few
 * gradient textures (glow / vignette / soft shadow / dust) are generated for
 * the lighting + atmosphere layers in GameScene.
 */

const PAL = {
  ' ': null, '.': null,
  K: '#241b2e', // outline / dark
  // steel
  S: '#d7dae2', s: '#9aa0ac', d: '#6b7079', I: '#565b66', H: '#f4f6fb',
  x: '#222b36', // screen glass
  G: '#4fc46a', R: '#e5564d',
  D: '#3a2c22', B: '#b8863f',
  // coffee
  C: '#4f3220', c: '#7a4f30', f: '#d8b88c',
  // ceramic cup
  W: '#f6f1e8', w: '#cabfad',
  // person
  F: '#f0c8a0', k: '#d6a276', e: '#2a2030', m: '#bb6a64',
  A: '#5a3b29', J: '#6f4a32',
  P: '#39435e',
  // gold / coins / hearts / leaves
  Y: '#ffe082', y: '#f5c542', o: '#a8761f',
  h: '#ff5d73',
  L: '#4aa84a', l: '#6fce5e',
  N: '#7a4a2c', n: '#9c6238', u: '#caa15a',
  // barista apron + drip tower + atmosphere
  V: '#2f9e8f', v: '#1f6e63', U: '#46c2b1',
  j: '#3a2a22',
  a: '#6fb7d6', i: '#ede3cf', g: '#bfe0e6',
  z: '#a9e2f2', r: '#c0584f', p: '#f0a6c0',
  q: '#b8b8c0',
};

const SPRITES = {
  // Espresso machine (16x16): chrome body, screen w/ reflection, group head, spouts.
  machine: [
    '  KKKKKKKKKKKK  ',
    '  KHHHHHHHHHHK  ',
    '  KdSSSSSSSSdK  ',
    'KKKKKKKKKKKKKKKK',
    'KHSSSSSSSSSSSSdK',
    'KHSxxxxxxxxxxSdK',
    'KHSxHHHHHHHHxSdK',
    'KHSxxxxxxxxxxSdK',
    'KHSssssssssssSdK',
    'KHSGGssssssRRSdK',
    'KHSssssssssssSdK',
    'KHIddddddddddIdK',
    ' KdDDDDDDDDDDdK ',
    '   KDDDDDDDDK   ',
    '    KBBBBBBK    ',
    '     KBccBK     ',
  ],

  // Drip / pour-over tower (16x16): water tank, paper cone, glass carafe, plate.
  dripper: [
    '    KKKKKKKK    ',
    '   KdSSSSSSdK   ',
    '   KaaaaaaaaK   ',
    '   KaHaaaaaaK   ',
    '   KaaaaaaaaK   ',
    '  KKKKKKKKKKKK  ',
    '  KiiiiiiiiiiK  ',
    '   KiiiiiiiiK   ',
    '    KiiiiiiK    ',
    '     KiiiiK     ',
    '      KccK      ',
    '  KKKKKKKKKKKK  ',
    '  KgCCCCCCCCgK  ',
    '  KgCcCCCCCCgK  ',
    '  KgCCCCCCCCgK  ',
    '  KddddddddddK  ',
  ],

  // Milk & cream station (16x16): steel frame, white milk tank, spout, tray.
  milker: [
    '   KKKKKKKKKK   ',
    '   KsSSSSSSsK   ',
    '   KSWWWWWWSK   ',
    '   KSWHWWWwSK   ',
    '   KSWWWWWwSK   ',
    '   KSWWWWWwSK   ',
    '   KswwwwwwsK   ',
    '   KKKKKKKKKK   ',
    '    KdSSSSdK    ',
    '     KssssK     ',
    '      KssK      ',
    '      KKKK      ',
    '   KKKKKKKKKK   ',
    '   KgWWWWWWgK   ',
    '   KgWfWWWWgK   ',
    '   KddddddddK   ',
  ],

  // Soda fountain (16x16): red cabinet, bubbly display, badge, twin nozzles.
  soda: [
    '  KKKKKKKKKKKK  ',
    ' KHRRRRRRRRRRrK ',
    ' KRRRRRRRRRRRrK ',
    ' KRxxxxxxxxxxrK ',
    ' KRxzzWzzzWzxrK ',
    ' KRxxxxxxxxxxrK ',
    ' KRRyYYYYYyRRrK ',
    ' KRRRRRRRRRRRrK ',
    ' KrrrrrrrrrrrrK ',
    '  KIddddddddIK  ',
    '   KdK    KdK   ',
    '   KKK    KKK   ',
    '                ',
    '  KKKKKKKKKKKK  ',
    '  KSssssssssSK  ',
    '  KddddddddddK  ',
  ],

  // Coffee cup w/ handle + gloss (10x9).
  cup: [
    ' KKKKKK   ',
    'KHWWWWwK  ',
    'KWWWWWWKKK',
    'KHWWWWwK K',
    'KWWWWWWKKK',
    'KHWWWWwK  ',
    'KwWWWWwK  ',
    ' KwwwwK   ',
    '  KKKK    ',
  ],

  // Coin (7x7).
  coin: [
    ' KKKKK ',
    'KyYYYyK',
    'KyYHYyK',
    'KyHoHyK',
    'KyYoYyK',
    'KyYYYyK',
    ' KKKKK ',
  ],

  // Heart (7x6).
  heart: [
    ' KK KK ',
    'KhhKhhK',
    'KhHhhhK',
    ' KhhhK ',
    '  KhK  ',
    '   K   ',
  ],

  // Coffee bean (6x7).
  bean: [
    '  KK  ',
    ' KCCK ',
    'KCfCCK',
    'KCCfCK',
    'KCfCCK',
    ' KCCK ',
    '  KK  ',
  ],

  // Potted plant decor (12x14).
  plant: [
    '    LlL     ',
    '   LllLL    ',
    '  LlLLlLL   ',
    ' LLlLLLlLL  ',
    'LlLLlLLLlLL ',
    ' LLlLLlLLL  ',
    '  LLlLLlL   ',
    '   LLlLL    ',
    '    KKK     ',
    '   KnnnK    ',
    '  KnNNNnK   ',
    '  KNNuNNK   ',
    '  KnNNNnK   ',
    '   KKKK     ',
  ],

  // Hanging menu / chalkboard sign (20x12).
  menu: [
    'NNNNNNNNNNNNNNNNNNNN',
    'NKKKKKKKKKKKKKKKKKKN',
    'NKxxxxxxxxxxxxxxxxKN',
    'NKxWWWxxWWxxxWWWxxKN',
    'NKxWxxxxWxWxxWxxxxKN',
    'NKxWWxxxWWxxxWWWxxKN',
    'NKxWxxxxWxWxxxxWxxKN',
    'NKxWWWxxWxxWxWWWxxKN',
    'NKxxxxxxxxxxxxxxxxKN',
    'NKxxWWxxWWWxWWxxxxKN',
    'NKxxxxxxxxxxxxxxxxKN',
    'NNNNNNNNNNNNNNNNNNNN',
  ],

  // Barista (back view) — hair shine, apron w/ pocket + highlight (14x18).
  barista: [
    '     KKKK     ',
    '    KjJJjK    ',
    '   KjJJJJjK   ',
    '   KjjjjjjK   ',
    '   KjjjjjjK   ',
    '    KFkkFK    ',
    '  KFUVVVVUFK  ',
    '  KFVvvvvVFK  ',
    '  KFVVVVVVFK  ',
    ' KFFVVVVVVFFK ',
    '  KFVVvvVVFK  ',
    '  KFVVVVVVFK  ',
    '  KFVvvvvVFK  ',
    '   KVVVVVVK   ',
    '   KPPPPPPK   ',
    '   KPPPPPPK   ',
    '   KPP  PPK   ',
    '   KKK  KKK   ',
  ],

  // Window with sky, sun, hills (16x11).
  window: [
    'KKKKKKKKKKKKKKKK',
    'KrrKzzzzzzzzKrrK',
    'KrrKzzzYYzzzKrrK',
    'KrrKzzzYYzzzKrrK',
    'KrrKzLzzzzLzKrrK',
    'KKKKKKKKKKKKKKKK',
    'KrrKzzzzzzzzKrrK',
    'KrrKzzLzzLzzKrrK',
    'KrrKzLLLLLLzKrrK',
    'KrrKzzzzzzzzKrrK',
    'KKKKKKKKKKKKKKKK',
  ],

  // Wall clock (12x12).
  clock: [
    '   KKKKKK   ',
    '  KqqqqqqK  ',
    ' KqWWWWWWqK ',
    ' KqWWKWWWqK ',
    ' KqWWKWWWqK ',
    ' KqWWKKKWqK ',
    ' KqWWWWWWqK ',
    ' KqWWWWWWqK ',
    ' KqqqqqqqqK ',
    '  KqqqqqqK  ',
    '   K    K   ',
    '   K    K   ',
  ],

  // Frosted donut (6x6).
  donut: [
    ' KKKK ',
    'KpHppK',
    'KpKKpK',
    'KpKKpK',
    'KppppK',
    ' KKKK ',
  ],

  // Croissant (8x6).
  croissant: [
    ' KKKKK ',
    'KnNNNnK',
    'KNNuNNK',
    'KnNNNnK',
    ' KNNNK ',
    '  KKK  ',
  ],

  // Tip jar with coins (10x9).
  tipjar: [
    '  KKKKKK  ',
    '  KqqqqK  ',
    ' KgggggggK',
    ' KgyYyggK ',
    ' KgYyYygK ',
    ' KggyYygK ',
    ' KgggggggK',
    '  KuuuuuK ',
    '  KKKKKK  ',
  ],

  // Hanging pendant lamp with a glowing shade (12x10).
  lamp: [
    '     KK     ',
    '     KK     ',
    '   KKKKKK   ',
    '  KqHHHHqK  ',
    ' KqHHHHHHqK ',
    'KqHHHHHHHHqK',
    'KYYYYYYYYYYK',
    ' KYYYYYYYYK ',
    '  KYYYYYYK  ',
    '   KYYYYK   ',
  ],

  // Sleeping shop cat (tabby loaf) (12x7).
  cat: [
    '  KK    KK  ',
    ' KnK    KnK ',
    ' KnnnnnnnnK ',
    'KnnKnnnnnnnK',
    'KnnnnnnnnnnK',
    ' KnnnnnnnnK ',
    '  KKKKKKKK  ',
  ],
};

// Preset apron colors for the player's barista, chosen at first-time setup.
// Each entry recolors the barista sprite's apron palette slots (V/v/U =
// main/shadow/highlight). 'teal' matches the original sprite colors.
const APRON_COLORS = [
  { id: 'teal',    name: 'Teal',    swatch: 0x2f9e8f, V: '#2f9e8f', v: '#1f6e63', U: '#46c2b1' },
  { id: 'red',     name: 'Red',     swatch: 0xc0584f, V: '#c0584f', v: '#8a3a33', U: '#e0837a' },
  { id: 'blue',    name: 'Blue',    swatch: 0x4f8de0, V: '#4f8de0', v: '#34619c', U: '#8ab4ed' },
  { id: 'mustard', name: 'Mustard', swatch: 0xd9a441, V: '#d9a441', v: '#a87a28', U: '#f0c97a' },
  { id: 'green',   name: 'Green',   swatch: 0x5a9e4a, V: '#5a9e4a', v: '#3e7332', U: '#8ec97f' },
  { id: 'purple',  name: 'Purple',  swatch: 0x8a6bd0, V: '#8a6bd0', v: '#5f4a96', U: '#b3a0e8' },
];

const CUSTOMER_SHIRTS = [
  '#e0683f', '#4f8de0', '#6abf5a', '#c45ec4',
  '#e0c14f', '#5ec4bf', '#e0567f', '#8a6bd0',
];

// Base customer grid (12x16). 'T' = shirt (recolored per variant).
const CUSTOMER_GRID = [
  '    KKKK    ',
  '   KAAAAK   ',
  '  KAJJJJAK  ',
  '  KAFFFFAK  ',
  '  KFFFFFFK  ',
  '  KFeFFeFK  ',
  '  KFkFFkFK  ',
  '  KFFmmFFK  ',
  '   KFkkFK   ',
  '  KTTTTTTK  ',
  ' KTTTTTTTTK ',
  ' KTTTTTTTTK ',
  '  KTTTTTTK  ',
  '  KPPPPPPK  ',
  '  KPP  PPK  ',
  '  KKK  KKK  ',
];

// ----- Texture builders ---------------------------------------------------

function makePixelTexture(scene, key, grid, palette) {
  const h = grid.length;
  const w = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return { width: w, height: h };
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
  return { width: w, height: h };
}

// A soft radial gradient texture (for lighting glows, vignette, shadows, dust).
function makeRadialTexture(scene, key, size, stops) {
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach((s) => grad.addColorStop(s[0], s[1]));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function buildAllTextures(scene) {
  for (const key in SPRITES) {
    makePixelTexture(scene, key, SPRITES[key], PAL);
  }

  // Gold "deluxe" finishes via palette overrides (no extra grids to maintain).
  const gold = Object.assign({}, PAL, {
    H: '#fff3c4', S: '#ffe082', s: '#f5c542', d: '#c8961f', I: '#9c6f1a', x: '#3a2c22',
  });
  makePixelTexture(scene, 'machine2', SPRITES.machine, gold);
  const goldDrip = Object.assign({}, PAL, {
    d: '#a8761f', s: '#f5c542', g: '#ffe9b0', H: '#fff3c4',
  });
  makePixelTexture(scene, 'dripper2', SPRITES.dripper, goldDrip);

  // Store-bought coffee-maker skins (recolor the steel parts).
  const skinOverrides = {
    black: { H: '#6a6a74', S: '#3a3a44', s: '#2a2a32', d: '#1e1e26', I: '#15151c' },
    mint: { H: '#e2f7ef', S: '#8fe0cf', s: '#5fc4b0', d: '#3a9e8c', I: '#2f7e70' },
    copper: { H: '#ffe0b0', S: '#d98a55', s: '#b96b3c', d: '#8a4e2a', I: '#6e3c20' },
  };
  for (const id in skinOverrides) {
    const pal = Object.assign({}, PAL, skinOverrides[id]);
    makePixelTexture(scene, 'machine_' + id, SPRITES.machine, pal);
    makePixelTexture(scene, 'dripper_' + id, SPRITES.dripper, pal);
  }

  CUSTOMER_SHIRTS.forEach((shirt, i) => {
    const pal = Object.assign({}, PAL, { T: shirt });
    makePixelTexture(scene, 'customer' + i, CUSTOMER_GRID, pal);
  });

  // Apron color variants of the barista, picked during first-time setup.
  APRON_COLORS.forEach((c) => {
    const pal = Object.assign({}, PAL, { V: c.V, v: c.v, U: c.U });
    makePixelTexture(scene, 'barista_' + c.id, SPRITES.barista, pal);
  });

  // Pour-stream droplet (white so we can tint per-drink at runtime).
  const drop = scene.add.graphics();
  drop.fillStyle(0xffffff, 1); drop.fillRect(0, 0, 2, 3);
  drop.generateTexture('drop', 2, 3); drop.destroy();

  // Steam puff.
  const steam = scene.add.graphics();
  steam.fillStyle(0xffffff, 0.5); steam.fillCircle(4, 4, 4);
  steam.fillStyle(0xffffff, 0.8); steam.fillCircle(4, 4, 2);
  steam.generateTexture('steam', 8, 8); steam.destroy();

  // Coin/heart sparkle.
  const spark = scene.add.graphics();
  spark.fillStyle(0xffffff, 1); spark.fillRect(1, 0, 1, 3); spark.fillRect(0, 1, 3, 1);
  spark.generateTexture('spark', 3, 3); spark.destroy();

  // Lighting + atmosphere gradients.
  makeRadialTexture(scene, 'glow', 256, [
    [0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)'],
  ]);
  makeRadialTexture(scene, 'vignette', 256, [
    [0, 'rgba(12,7,18,0)'], [0.68, 'rgba(12,7,18,0)'], [1, 'rgba(12,7,18,0.42)'],
  ]);
  makeRadialTexture(scene, 'softshadow', 64, [
    [0, 'rgba(0,0,0,0.5)'], [0.7, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)'],
  ]);
  makeRadialTexture(scene, 'dust', 8, [
    [0, 'rgba(255,250,235,0.9)'], [1, 'rgba(255,250,235,0)'],
  ]);
}
