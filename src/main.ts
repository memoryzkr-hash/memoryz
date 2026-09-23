import Phaser from 'phaser';
import { GAME_H, GAME_W } from './render/layout';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { DeckScene } from './scenes/DeckScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  // Transparent so the Three.js battlefield canvas underneath shows through.
  transparent: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, BattleScene, DeckScene, ResultScene],
});

// The Phaser (UI) canvas sits above the Three.js battlefield canvas.
game.events.once(Phaser.Core.Events.READY, () => {
  Object.assign(game.canvas.style, { position: 'relative', zIndex: '1' });
});
