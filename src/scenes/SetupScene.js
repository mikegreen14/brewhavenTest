/*
 * SetupScene — first-time wizard shown before a brand-new player's first run.
 * Lets them name their shop, name their barista, and pick an apron color.
 * Choices are saved via Save and never shown again (Save.data.setupDone).
 *
 * Reuses the same wall-gradient/glow/vignette look as MenuScene so the
 * visual language matches the rest of the game.
 */
const SETUP_NAME_FILTER = /[^a-zA-Z0-9 '&!.\-]/g;

class SetupScene extends Phaser.Scene {
  constructor() {
    super('SetupScene');
  }

  create() {
    this.scale.updateBounds();
    const W = window.GAME_WIDTH || 800, H = 600;
    this.W = W;
    this.H = H;

    this.shopName = '';
    this.baristaName = '';
    this.apronIndex = 0;
    this.step = 0;

    // ── Background: same plaster wall gradient as MenuScene ──
    const bg = this.add.graphics();
    const c1 = Phaser.Display.Color.IntegerToColor(0x52415f);
    const c2 = Phaser.Display.Color.IntegerToColor(0x7c6488);
    for (let i = 0; i < H; i += 2) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 100, (i / H) * 100);
      bg.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      bg.fillRect(0, i, W, 2);
    }
    bg.fillStyle(0xffffff, 0.05 * WALL_DIM);
    for (let x = 20; x < W; x += 40) bg.fillRect(x, 0, 16, H);

    this.add.image(W / 2, 200, 'glow')
      .setDisplaySize(560, 380).setTint(0xffd6a0).setAlpha(0.25)
      .setBlendMode(Phaser.BlendModes.ADD);

    // ── Title ──
    this.add.text(W / 2, 50, 'WELCOME TO BREWHAVEN', {
      fontFamily: 'monospace', fontSize: FS(26), color: '#f4efe6', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2);

    // ── Step dots ──
    this.stepDots = [];
    for (let i = 0; i < 3; i++) {
      this.stepDots.push(this.add.circle(W / 2 - 20 + i * 20, 88, 5, 0x6a5490).setDepth(2));
    }

    // ── Build the three step panels ──
    this.steps = [
      this.buildShopNameStep(),
      this.buildCharNameStep(),
      this.buildApronStep(),
    ];

    // ── Atmosphere ──
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setAlpha(VIGNETTE_ALPHA).setDepth(5);
    this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: W }, y: { min: 0, max: H },
      speedY: { min: -8, max: -2 }, speedX: { min: -4, max: 4 },
      scale: { min: 0.5, max: 1.6 }, alpha: { min: 0.04, max: 0.16 },
      lifespan: 7000, frequency: 280, quantity: 1,
    }).setDepth(6);

    this.cameras.main.fadeIn(500, 0, 0, 0);

    // ── DOM text input overlay ──
    this.inputEl = document.getElementById('setup-input');
    this._onResize = () => this.repositionInput();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.events.once('shutdown', () => this.cleanupInput());

    this.goToStep(0);
  }

  // ===========================================================================
  // Step 1: shop name
  // ===========================================================================
  buildShopNameStep() {
    const W = this.W;
    const items = [];

    items.push(this.add.text(W / 2, 170, 'Name your coffee shop', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#ffe082', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(3));

    items.push(this.add.text(W / 2, 200, 'This will appear on your shop\'s sign', {
      fontFamily: 'monospace', fontSize: FS(12), color: '#c9b8d8',
    }).setOrigin(0.5).setDepth(3));

    // Live banner preview (mirrors the in-game sign drawn by drawShopBanner).
    const bw = 280, bh = 56;
    const bannerBg = this.add.graphics().setDepth(3);
    bannerBg.fillStyle(0x4a3219, 1);
    bannerBg.fillRoundedRect(W / 2 - bw / 2, 250 - bh / 2, bw, bh, 8);
    bannerBg.fillStyle(0x6b461f, 1);
    bannerBg.fillRoundedRect(W / 2 - bw / 2 + 4, 250 - bh / 2 + 4, bw - 8, bh - 8, 6);
    bannerBg.lineStyle(2, 0xb07f4a, 1);
    bannerBg.strokeRoundedRect(W / 2 - bw / 2, 250 - bh / 2, bw, bh, 8);
    items.push(bannerBg);

    this.shopPreviewText = this.add.text(W / 2, 250, 'My Coffee Shop', {
      fontFamily: 'monospace', fontSize: FS(18), color: '#f4efe6', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(4);
    items.push(this.shopPreviewText);

    items.push(this.add.text(W / 2, 320, 'Up to 18 characters', {
      fontFamily: 'monospace', fontSize: FS(11), color: '#6a5878',
    }).setOrigin(0.5).setDepth(3));

    items.push(this.makeButton(W / 2, 460, 'NEXT  ▶', () => this.goToStep(1)));

    return items;
  }

  // ===========================================================================
  // Step 2: character name
  // ===========================================================================
  buildCharNameStep() {
    const W = this.W;
    const items = [];

    items.push(this.add.text(W / 2, 170, 'What\'s your name?', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#ffe082', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(3));

    items.push(this.add.text(W / 2, 200, 'Your customers will be glad to meet you', {
      fontFamily: 'monospace', fontSize: FS(12), color: '#c9b8d8',
    }).setOrigin(0.5).setDepth(3));

    // Barista sprite + speech bubble preview.
    items.push(this.add.image(W / 2 - 70, 290, 'barista_' + APRON_COLORS[0].id)
      .setOrigin(0.5, 1).setScale(5).setDepth(3));

    const bw = 200, bh = 50;
    const bx = W / 2 + 50, by = 250;
    const bubbleBg = this.add.graphics().setDepth(3);
    bubbleBg.fillStyle(0xffffff, 1);
    bubbleBg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 10);
    bubbleBg.fillTriangle(bx - bw / 2 + 18, by + bh / 2 - 1, bx - bw / 2 + 38, by + bh / 2 - 1, bx - bw / 2 + 14, by + bh / 2 + 14);
    items.push(bubbleBg);

    this.charPreviewText = this.add.text(bx, by, 'Hi, I\'m Barista!', {
      fontFamily: 'monospace', fontSize: FS(13), color: '#2a2030', fontStyle: 'bold',
      align: 'center', wordWrap: { width: bw - 20 },
    }).setOrigin(0.5).setDepth(4);
    items.push(this.charPreviewText);

    items.push(this.add.text(W / 2, 320, 'Up to 14 characters', {
      fontFamily: 'monospace', fontSize: FS(11), color: '#6a5878',
    }).setOrigin(0.5).setDepth(3));

    items.push(this.makeButton(W / 2 - 90, 460, '◀  BACK', () => this.goToStep(0), 0x5a4a6a, 0x8a7aa0));
    items.push(this.makeButton(W / 2 + 90, 460, 'NEXT  ▶', () => this.goToStep(2)));

    return items;
  }

  // ===========================================================================
  // Step 3: apron color
  // ===========================================================================
  buildApronStep() {
    const W = this.W;
    const items = [];

    items.push(this.add.text(W / 2, 170, 'Pick your apron color', {
      fontFamily: 'monospace', fontSize: FS(20), color: '#ffe082', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(3));

    items.push(this.add.text(W / 2, 200, 'Tap a color to try it on', {
      fontFamily: 'monospace', fontSize: FS(12), color: '#c9b8d8',
    }).setOrigin(0.5).setDepth(3));

    this.apronPreviewSprite = this.add.image(W / 2, 320, 'barista_' + APRON_COLORS[0].id)
      .setOrigin(0.5, 1).setScale(7).setDepth(3);
    items.push(this.apronPreviewSprite);
    items.push(this.add.image(W / 2, 322, 'softshadow').setScale(2, 0.5).setAlpha(0.4).setDepth(2));

    // Swatches
    const swatchSize = 36, gap = 12;
    const totalW = APRON_COLORS.length * swatchSize + (APRON_COLORS.length - 1) * gap;
    const startX = W / 2 - totalW / 2 + swatchSize / 2;
    const swatchY = 380;
    this.swatchHighlights = [];
    APRON_COLORS.forEach((c, i) => {
      const x = startX + i * (swatchSize + gap);
      const highlight = this.add.graphics().setDepth(2);
      this.swatchHighlights.push(highlight);

      const g = this.add.graphics().setDepth(3);
      g.fillStyle(c.swatch, 1);
      g.fillRoundedRect(x - swatchSize / 2, swatchY - swatchSize / 2, swatchSize, swatchSize, 6);
      g.lineStyle(2, 0x2a2030, 1);
      g.strokeRoundedRect(x - swatchSize / 2, swatchY - swatchSize / 2, swatchSize, swatchSize, 6);
      items.push(g);

      const hit = this.add.rectangle(x, swatchY, swatchSize, swatchSize)
        .setDepth(4).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.selectApron(i));
      items.push(hit);
      items.push(highlight);
    });

    this.drawApronHighlights();

    items.push(this.makeButton(W / 2 - 90, 460, '◀  BACK', () => this.goToStep(1), 0x5a4a6a, 0x8a7aa0));
    items.push(this.makeButton(W / 2 + 90, 460, '▶  START BREWING!', () => this.finish(), 0x3a5a3a, 0x6abf5a));

    return items;
  }

  selectApron(i) {
    this.apronIndex = i;
    this.apronPreviewSprite.setTexture('barista_' + APRON_COLORS[i].id);
    SFX.blip(720, 0.05);
    this.drawApronHighlights();
  }

  drawApronHighlights() {
    const swatchSize = 36, gap = 12;
    const totalW = APRON_COLORS.length * swatchSize + (APRON_COLORS.length - 1) * gap;
    const startX = this.W / 2 - totalW / 2 + swatchSize / 2;
    const swatchY = 380;
    this.swatchHighlights.forEach((g, i) => {
      g.clear();
      if (i === this.apronIndex) {
        const x = startX + i * (swatchSize + gap);
        g.lineStyle(3, 0xffe082, 1);
        g.strokeRoundedRect(x - swatchSize / 2 - 4, swatchY - swatchSize / 2 - 4, swatchSize + 8, swatchSize + 8, 8);
      }
    });
  }

  // ===========================================================================
  // Shared button helper (mirrors the MenuScene "START GAME" button style).
  // ===========================================================================
  makeButton(x, y, label, onClick, fillColor = 0x3a5a3a, borderColor = 0x6abf5a) {
    const bw = Math.max(140, label.length * 13 + 30), bh = 46;
    const btn = this.add.container(x, y).setDepth(4);
    const bbg = this.add.graphics();
    bbg.fillStyle(fillColor, 1);
    bbg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    bbg.lineStyle(3, borderColor, 1);
    bbg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    const blabel = this.add.text(0, 0, label, {
      fontFamily: 'monospace', fontSize: FS(16), color: '#ffffff', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5);
    btn.add([bbg, blabel]);
    btn.setSize(bw, bh);
    btn.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, bw, bh), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    btn.on('pointerover', () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1.06, duration: 90 }); });
    btn.on('pointerout', () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1, duration: 90 }); });
    btn.on('pointerdown', () => {
      SFX.unlock();
      SFX.blip(660, 0.06);
      onClick();
    });
    return btn;
  }

  // ===========================================================================
  // Step navigation
  // ===========================================================================
  goToStep(n) {
    this.step = n;
    this.steps.forEach((items, i) => items.forEach((obj) => obj.setVisible(i === n)));
    this.stepDots.forEach((dot, i) => dot.setFillStyle(i === n ? 0xffe082 : 0x6a5490));
    this.repositionInput();
    if (n === 0 || n === 1) this.showInput(n);
    else this.hideInput();
  }

  // ===========================================================================
  // DOM text input overlay
  // ===========================================================================
  showInput(step) {
    const el = this.inputEl;
    if (!el) return;
    const maxLen = step === 0 ? 18 : 14;
    el.value = step === 0 ? this.shopName : this.baristaName;
    el.maxLength = maxLen;
    el.placeholder = step === 0 ? 'My Coffee Shop' : 'Barista';
    el.style.display = 'block';

    el.oninput = () => {
      el.value = el.value.replace(SETUP_NAME_FILTER, '').slice(0, maxLen);
      if (step === 0) {
        this.shopName = el.value;
        this.updateShopPreview();
      } else {
        this.baristaName = el.value;
        this.updateCharPreview();
      }
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 0) this.goToStep(1);
        else this.goToStep(2);
      }
    };

    this.repositionInput();
    el.focus();
  }

  hideInput() {
    const el = this.inputEl;
    if (!el) return;
    el.style.display = 'none';
    el.blur();
  }

  // Maps a game-coordinate rectangle to screen pixels so the DOM <input>
  // overlays the spot reserved for it on the canvas (Scale.FIT scales the
  // canvas uniformly, so one ratio works for both axes).
  repositionInput() {
    const el = this.inputEl;
    if (!el || el.style.display === 'none') return;
    const canvas = this.sys.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / this.W;

    const bw = 280, bh = 40;
    const x = this.W / 2 - bw / 2;
    const y = this.step === 0 ? 280 : 280;

    el.style.left = Math.round(rect.left + x * scale) + 'px';
    el.style.top = Math.round(rect.top + y * scale) + 'px';
    el.style.width = Math.round(bw * scale) + 'px';
    el.style.height = Math.round(bh * scale) + 'px';
    el.style.fontSize = Math.round(16 * scale) + 'px';
  }

  cleanupInput() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    const el = this.inputEl;
    if (!el) return;
    el.style.display = 'none';
    el.oninput = null;
    el.onkeydown = null;
    el.value = '';
  }

  // ===========================================================================
  // Live previews
  // ===========================================================================
  updateShopPreview() {
    const name = this.shopName.trim() || 'My Coffee Shop';
    const maxWidth = 280 - 24;
    const sizes = [18, 16, 14, 12, 11];
    for (const sz of sizes) {
      this.shopPreviewText.setFontSize(parseInt(FS(sz), 10));
      this.shopPreviewText.setText(name);
      if (this.shopPreviewText.width <= maxWidth) break;
    }
  }

  updateCharPreview() {
    const name = this.baristaName.trim() || 'Barista';
    this.charPreviewText.setText('Hi, I\'m ' + name + '!');
  }

  // ===========================================================================
  // Finish — persist choices and head into the game.
  // ===========================================================================
  finish() {
    Save.data.shopName = (this.shopName.trim() || 'My Coffee Shop').slice(0, 18);
    Save.data.baristaName = (this.baristaName.trim() || 'Barista').slice(0, 14);
    Save.data.apronColor = APRON_COLORS[this.apronIndex].id;
    Save.data.setupDone = true;
    Save.write();

    this.cleanupInput();
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
  }
}
