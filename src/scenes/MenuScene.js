/*
 * MenuScene — landing page shown before the game starts.
 * Reuses all textures already built by BootScene (wall gradient, sprites,
 * lighting) so the visual language matches the game exactly.
 */
class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    // Ensure canvas bounds are correct after DOM layout settles.
    this.scale.updateBounds();

    const W = window.GAME_WIDTH || 800, H = 600;

    // ── Background: plaster wall gradient (same colours as GameScene default) ──
    const bg = this.add.graphics();
    const c1 = Phaser.Display.Color.IntegerToColor(0x52415f);
    const c2 = Phaser.Display.Color.IntegerToColor(0x7c6488);
    for (let i = 0; i < H; i += 2) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 100, (i / H) * 100);
      bg.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      bg.fillRect(0, i, W, 2);
    }
    // Subtle vertical stripe texture
    bg.fillStyle(0xffffff, 0.05 * WALL_DIM);
    for (let x = 20; x < W; x += 40) bg.fillRect(x, 0, 16, H);

    // ── Warm centre glow behind the title ──
    this.add.image(W / 2, 180, 'glow')
      .setDisplaySize(560, 360).setTint(0xffd6a0).setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);

    // ── Decorative machines flanking the layout ──
    this.add.image(96,  378, 'softshadow').setScale(1.7, 0.38).setAlpha(0.28);
    this.add.image(96,  378, 'machine').setOrigin(0.5, 1).setScale(6).setAlpha(0.42).setDepth(1);
    this.add.image(W - 96, 378, 'softshadow').setScale(1.7, 0.38).setAlpha(0.28);
    this.add.image(W - 96, 378, 'dripper').setOrigin(0.5, 1).setScale(6).setAlpha(0.42).setDepth(1);
    // Cool light from the window side, warm glow over the machines
    this.add.image(96,  280, 'glow').setDisplaySize(220, 220).setTint(0xffd6a0).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    this.add.image(W - 96, 280, 'glow').setDisplaySize(220, 220).setTint(0xbfe0ff).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);

    // ── Title ──
    // Render the word separately so setOrigin(0.5) centres on the letters only,
    // then measure its width to place the emoji flush to the left of it.
    const titleText = this.add.text(W / 2, 72, 'BREWHAVEN', {
      fontFamily: 'monospace', fontSize: FS(52), color: '#f4efe6', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(2);
    this.add.text(W / 2 - titleText.width / 2 - 32, 72, '☕', {
      fontSize: FS(40),
    }).setOrigin(0.5).setDepth(2);

    this.add.text(W / 2, 134, 'A pixel coffee shop', {
      fontFamily: 'monospace', fontSize: FS(18), color: '#c9b8d8',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);

    // ── Small decorative icon strip ──
    ['coin', 'heart', 'bean', 'heart', 'coin'].forEach((key, i) => {
      this.add.image(W / 2 - 48 + i * 24, 172, key).setScale(3).setAlpha(0.6).setDepth(2);
    });

    // ── Best level reached (only once there's a record to show) ──
    if (Save.data.bestLevel > 0) {
      this.add.text(W / 2, 198, 'Best: Level ' + Save.data.bestLevel, {
        fontFamily: 'monospace', fontSize: FS(14), color: '#ffe082', fontStyle: 'bold',
        stroke: '#2a2030', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2);
    }

    // ── Controls card ──
    const cw = 520, ch = 196, cx = W / 2, cy = 318;
    const card = this.add.graphics().setDepth(2);
    card.fillStyle(0x1a1228, 0.88);
    card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 14);
    card.lineStyle(2, 0x6a5490, 1);
    card.strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 14);

    this.add.text(cx, cy - ch / 2 + 20, 'HOW TO PLAY', {
      fontFamily: 'monospace', fontSize: FS(13), color: '#ffe082', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);

    const divider = this.add.graphics().setDepth(3);
    divider.lineStyle(1, 0x6a5490, 0.7);
    divider.beginPath();
    divider.moveTo(cx - cw / 2 + 20, cy - ch / 2 + 37);
    divider.lineTo(cx + cw / 2 - 20, cy - ch / 2 + 37);
    divider.strokePath();

    const rows = [
      [MOBILE_MODE ? 'Tap a station' : 'A / D  or  ← / →', 'Move between stations'],
      [MOBILE_MODE ? 'Tap & hold the station' : 'Hold SPACE or click station', 'Release in the bright green zone'],
      ['Two-step drinks (L5+)',        'Pour the base, then milk on top'],
      ['3 hearts',                     'Walkout, wrong drink, or spill'],
    ];
    const colKey  = cx - cw / 2 + 22;
    const colDesc = cx - cw / 2 + 246;
    rows.forEach(([key, desc], i) => {
      const ry = cy - ch / 2 + 56 + i * 36;
      this.add.text(colKey,  ry, key,  { fontFamily: 'monospace', fontSize: FS(12), color: '#ffe082', fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(3);
      this.add.text(colDesc, ry, desc, { fontFamily: 'monospace', fontSize: FS(12), color: '#c9b8d8' }).setOrigin(0, 0.5).setDepth(3);
    });

    // ── Start Game button ──
    const bw = 230, bh = 54;
    const btn = this.add.container(W / 2, 464).setDepth(4);
    const bbg = this.add.graphics();
    bbg.fillStyle(0x3a5a3a, 1);
    bbg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    bbg.lineStyle(3, 0x6abf5a, 1);
    bbg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    const blabel = this.add.text(0, 0, '▶  START GAME', {
      fontFamily: 'monospace', fontSize: FS(22), color: '#ffffff', fontStyle: 'bold',
      stroke: '#2a2030', strokeThickness: 4,
    }).setOrigin(0.5);
    btn.add([bbg, blabel]);
    btn.setSize(bw, bh);
    btn.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, bw, bh), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    btn.on('pointerover', () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1.06, duration: 90 }); });
    btn.on('pointerout',  () => { this.tweens.killTweensOf(btn); this.tweens.add({ targets: btn, scale: 1,    duration: 90 }); });
    btn.on('pointerdown', () => {
      SFX.unlock();
      SFX.cash();
      this.cameras.main.fadeOut(380, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start(Save.data.setupDone ? 'GameScene' : 'SetupScene'));
    });

    // ── Footer hint ──
    this.add.text(W / 2, 534, 'Hit the green zone. Keep the queue moving. Don\'t lose all 3 hearts.', {
      fontFamily: 'monospace', fontSize: FS(11), color: '#6a5878',
    }).setOrigin(0.5).setDepth(4);

    // ── Atmosphere ──
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setAlpha(VIGNETTE_ALPHA).setDepth(5);
    this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: W }, y: { min: 0, max: H },
      speedY: { min: -8, max: -2 }, speedX: { min: -4, max: 4 },
      scale: { min: 0.5, max: 1.6 }, alpha: { min: 0.04, max: 0.16 },
      lifespan: 7000, frequency: 280, quantity: 1,
    }).setDepth(6);

    // ── Fade in ──
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }
}
