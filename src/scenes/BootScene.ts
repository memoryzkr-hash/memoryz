import Phaser from 'phaser';
import { renderCardArt } from '../render3d/cardArt';
import { FONT, GAME_H, GAME_W, cardArtKey } from '../render/layout';

/** Bakes 3D card portraits into Phaser textures before the menu opens. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#10131c');
    this.add.text(GAME_W / 2, GAME_H / 2, '불러오는 중...', { fontFamily: FONT, fontSize: '28px', color: '#9ca3af' }).setOrigin(0.5);
    // Give the loading text a frame to show before the (synchronous) bake.
    this.time.delayedCall(30, () => {
      for (const [id, canvas] of renderCardArt()) this.textures.addCanvas(cardArtKey(id), canvas);
      this.scene.start('menu');
    });
  }
}
