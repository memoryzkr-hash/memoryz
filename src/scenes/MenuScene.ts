import Phaser from 'phaser';
import { getCard } from '../core/cards';
import { isMuted, setMuted } from '../audio/sfx';
import type { Difficulty } from '../core/ai';
import { FONT, GAME_W } from '../render/layout';
import { makeButton } from '../ui/button';
import { loadDeck } from '../ui/deckStore';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    const cx = GAME_W / 2;
    const sound = this.add
      .text(GAME_W - 24, 24, isMuted() ? '🔇' : '🔊', { fontFamily: FONT, fontSize: '36px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    sound.on('pointerup', () => {
      setMuted(!isMuted());
      sound.setText(isMuted() ? '🔇' : '🔊');
    });
    this.add.text(cx, 170, '⚔️', { fontFamily: FONT, fontSize: '96px' }).setOrigin(0.5);
    this.add
      .text(cx, 290, 'Memoryz Royale', { fontFamily: FONT, fontSize: '56px', color: '#fde047', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5);
    this.add.text(cx, 350, '실시간 카드 배틀', { fontFamily: FONT, fontSize: '26px', color: '#e5e7eb' }).setOrigin(0.5);

    const levels: [Difficulty, string, number][] = [
      ['easy', '쉬움', 0x16a34a],
      ['normal', '보통', 0x2563eb],
      ['hard', '어려움', 0xdc2626],
    ];
    levels.forEach(([difficulty, label, color], i) => {
      makeButton(this, cx, 480 + i * 100, label, color, () => this.scene.start('battle', { difficulty }));
    });

    this.add.text(cx, 790, '내 덱', { fontFamily: FONT, fontSize: '24px', color: '#9ca3af' }).setOrigin(0.5);
    loadDeck().forEach((id, i) => {
      const card = getCard(id);
      const x = cx + ((i % 4) - 1.5) * 150;
      const y = 850 + Math.floor(i / 4) * 105;
      this.add.text(x, y, card.icon, { fontFamily: FONT, fontSize: '44px' }).setOrigin(0.5);
      this.add.text(x, y + 42, `${card.name} (${card.cost})`, { fontFamily: FONT, fontSize: '16px', color: '#e5e7eb' }).setOrigin(0.5);
    });

    makeButton(this, cx, 1100, '덱 편집', 0x7c3aed, () => this.scene.start('deck'), 260);

    this.add
      .text(cx, 1210, '카드를 끌어서 내 진영에 놓으세요.\n상대 킹타워를 부수면 즉시 승리!', {
        fontFamily: FONT, fontSize: '20px', color: '#9ca3af', align: 'center',
      })
      .setOrigin(0.5);
  }
}
