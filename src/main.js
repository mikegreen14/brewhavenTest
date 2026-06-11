/*
 * Phaser bootstrap. pixelArt:true keeps our code-drawn textures crisp when
 * scaled up; Scale.FIT letterboxes the 800x600 game to fill the window.
 */
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.GAME_WIDTH || 800,
  height: 600,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1b1620',
  scene: [BootScene, MenuScene, SetupScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    // #game already centers the canvas via flexbox; Phaser's own
    // autoCenter would add a second margin-based offset on top of that
    // and push the canvas off-center.
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

window.game = new Phaser.Game(config);
