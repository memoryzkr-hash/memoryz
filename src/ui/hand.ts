import Phaser from 'phaser';
import { getCard } from '../core/cards';
import { ELIXIR_MAX } from '../core/constants';
import { nextCard } from '../core/deck';
import type { PlayerState } from '../core/types';
import { COLORS, FONT, GAME_W, UI_Y, cardArtKey } from '../render/layout';

const CARD_W = 148;
const CARD_H = 132;
const CARD_GAP = 8;
const CARDS_X = 92;
const BAR_Y = UI_Y + CARD_H + 18;

interface CardSlot {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  cardId: string | null;
  selected: boolean;
  affordable: boolean;
}

/** Bottom panel: 4 cards in hand, the next card and the elixir bar. */
export class HandUI {
  private slots: CardSlot[] = [];
  private nextIcon: Phaser.GameObjects.Image;
  private barFill: Phaser.GameObjects.Graphics;
  private barText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    onCardDown: (index: number) => void,
  ) {
    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.panel);
    panel.fillRect(0, UI_Y - 8, GAME_W, 1280 - UI_Y + 8);

    scene.add.text(46, UI_Y + 12, '다음', { fontFamily: FONT, fontSize: '14px', color: '#9ca3af' }).setOrigin(0.5);
    const nextBg = scene.add.graphics();
    nextBg.fillStyle(0x374151);
    nextBg.fillRoundedRect(14, UI_Y + 26, 64, 76, 8);
    this.nextIcon = scene.add.image(46, UI_Y + 64, '__DEFAULT').setDisplaySize(58, 58);

    for (let i = 0; i < 4; i++) {
      const x = CARDS_X + i * (CARD_W + CARD_GAP);
      const root = scene.add.container(x, UI_Y);
      const bg = scene.add.graphics();
      const icon = scene.add.image(CARD_W / 2, 52, '__DEFAULT').setDisplaySize(CARD_W - 12, CARD_H - 36);
      const name = scene.add
        .text(CARD_W / 2, CARD_H - 18, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' })
        .setOrigin(0.5);
      const costBg = scene.add.graphics();
      costBg.fillStyle(COLORS.elixir);
      costBg.fillCircle(18, 18, 15);
      costBg.lineStyle(2, 0xffffff);
      costBg.strokeCircle(18, 18, 15);
      const cost = scene.add
        .text(18, 18, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
      const hit = scene.add.rectangle(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, 0x000000, 0).setInteractive();
      hit.on('pointerdown', () => onCardDown(i));
      root.add([bg, icon, name, costBg, cost, hit]);
      this.slots.push({ root, bg, icon, name, cost, cardId: null, selected: false, affordable: true });
    }

    const barBg = scene.add.graphics();
    barBg.fillStyle(0x111827);
    barBg.fillRoundedRect(CARDS_X, BAR_Y, GAME_W - CARDS_X - 12, 28, 8);
    this.barFill = scene.add.graphics();
    scene.add.text(46, BAR_Y + 14, '💧', { fontFamily: FONT, fontSize: '26px' }).setOrigin(0.5);
    this.barText = scene.add
      .text(CARDS_X + 16, BAR_Y + 14, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0, 0.5);
  }

  update(player: PlayerState, selected: number | null): void {
    player.deck.hand.forEach((id, i) => {
      const slot = this.slots[i];
      const card = getCard(id);
      const affordable = player.elixir >= card.cost;
      const isSelected = selected === i;
      if (slot.cardId !== id) {
        slot.cardId = id;
        slot.icon.setTexture(cardArtKey(id)).setDisplaySize(CARD_W - 12, CARD_H - 36);
        slot.name.setText(card.name);
        slot.cost.setText(String(card.cost));
        slot.selected = !isSelected; // force a redraw below
      }
      if (slot.selected !== isSelected || slot.affordable !== affordable) {
        slot.selected = isSelected;
        slot.affordable = affordable;
        this.drawCardBg(slot);
      }
    });
    const next = cardArtKey(nextCard(player.deck));
    if (this.nextIcon.texture.key !== next) this.nextIcon.setTexture(next).setDisplaySize(58, 58);

    const w = GAME_W - CARDS_X - 12;
    const g = this.barFill;
    g.clear();
    g.fillStyle(COLORS.elixir);
    g.fillRoundedRect(CARDS_X + 2, BAR_Y + 2, Math.max(0, (w - 4) * (player.elixir / ELIXIR_MAX)), 24, 6);
    g.lineStyle(2, 0x111827, 0.8);
    for (let i = 1; i < ELIXIR_MAX; i++) {
      const x = CARDS_X + (w * i) / ELIXIR_MAX;
      g.lineBetween(x, BAR_Y + 2, x, BAR_Y + 26);
    }
    this.barText.setText(String(Math.floor(player.elixir)));
  }

  private drawCardBg(slot: CardSlot): void {
    const g = slot.bg;
    g.clear();
    g.fillStyle(slot.affordable ? 0x4c1d95 : 0x374151);
    g.fillRoundedRect(0, 0, CARD_W, CARD_H, 10);
    g.lineStyle(slot.selected ? 4 : 2, slot.selected ? 0xfde047 : 0x1f2937);
    g.strokeRoundedRect(0, 0, CARD_W, CARD_H, 10);
    slot.root.y = slot.selected ? UI_Y - 10 : UI_Y;
    slot.icon.setAlpha(slot.affordable ? 1 : 0.4);
    if (slot.affordable) slot.icon.clearTint();
    else slot.icon.setTint(0x777777);
  }
}
