import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import type { Difficulty } from '../core/ai';
import type { Side } from '../core/types';
import { FONT, GAME_W } from '../render/layout';
import { makeButton } from '../ui/button';

export interface ResultData {
  winner: Side | 'draw' | null;
  crowns: [number, number];
  difficulty: Difficulty;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('result');
  }

  create(data: ResultData): void {
    const cx = GAME_W / 2;
    if (data.winner === 0) sfx.win();
    else if (data.winner === 1) sfx.lose();
    const [title, color] =
      data.winner === 0 ? ['승리!', '#fde047'] : data.winner === 1 ? ['패배', '#f87171'] : ['무승부', '#e5e7eb'];
    this.add
      .text(cx, 300, title, { fontFamily: FONT, fontSize: '96px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 10 })
      .setOrigin(0.5);

    const rows: [string, number, string][] = [
      ['나', data.crowns[0], '#60a5fa'],
      ['상대', data.crowns[1], '#f87171'],
    ];
    rows.forEach(([label, crowns, c], i) => {
      const y = 480 + i * 100;
      this.add.text(cx - 200, y, label, { fontFamily: FONT, fontSize: '36px', color: c, fontStyle: 'bold' }).setOrigin(0, 0.5);
      for (let k = 0; k < 3; k++) {
        this.add
          .text(cx + 20 + k * 70, y, '👑', { fontFamily: FONT, fontSize: '48px' })
          .setOrigin(0.5)
          .setAlpha(k < crowns ? 1 : 0.2);
      }
    });

    makeButton(this, cx, 800, '다시 하기', 0x16a34a, () => this.scene.start('battle', { difficulty: data.difficulty }));
    makeButton(this, cx, 900, '메뉴로', 0x4b5563, () => this.scene.start('menu'));
  }
}
