import Phaser from 'phaser';
import { FONT } from '../render/layout';

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  color: number,
  onClick: () => void,
  width = 320,
): Phaser.GameObjects.Container {
  const h = 72;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.35);
  bg.fillRoundedRect(-width / 2, -h / 2 + 5, width, h, 16);
  bg.fillStyle(color);
  bg.fillRoundedRect(-width / 2, -h / 2, width, h, 16);
  const text = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
    .setOrigin(0.5);
  const btn = scene.add.container(x, y, [bg, text]);
  btn.setSize(width, h);
  btn.setInteractive({ useHandCursor: true });
  btn.on('pointerdown', () => btn.setScale(0.96));
  btn.on('pointerout', () => btn.setScale(1));
  btn.on('pointerup', () => {
    btn.setScale(1);
    onClick();
  });
  return btn;
}
