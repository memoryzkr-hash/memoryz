import Phaser from 'phaser';
import { CARDS, DECK_SIZE, getCard } from '../core/cards';
import { FONT, GAME_W } from '../render/layout';
import { makeButton } from '../ui/button';
import { describeCard, drawCardFace } from '../ui/cardFace';
import { loadDeck, saveDeck } from '../ui/deckStore';

const DECK_W = 150;
const DECK_H = 140;
const DECK_GAP = 12;
const DECK_X = (GAME_W - 4 * DECK_W - 3 * DECK_GAP) / 2;
const DECK_Y = 110;

const COL = 5;
const LIB_W = 124;
const LIB_H = 124;
const LIB_GAP = 10;
const LIB_X = (GAME_W - COL * LIB_W - (COL - 1) * LIB_GAP) / 2;
const LIB_Y = 520;

/** Swap cards between the 8-card deck and the collection. */
export class DeckScene extends Phaser.Scene {
  private deck: string[] = [];
  private slot: number | null = null;
  private info: string | null = null;
  private dynamic: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('deck');
  }

  create(): void {
    this.deck = loadDeck();
    this.slot = null;
    this.info = null;
    const cx = GAME_W / 2;
    this.add.text(cx, 50, '덱 편집', { fontFamily: FONT, fontSize: '40px', color: '#fde047', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 480, '카드 목록', { fontFamily: FONT, fontSize: '24px', color: '#9ca3af' }).setOrigin(0.5);
    makeButton(this, cx, 1200, '저장하고 돌아가기', 0x16a34a, () => {
      saveDeck(this.deck);
      this.scene.start('menu');
    }, 400);
    this.redraw();
  }

  private redraw(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dynamic.push(o);
      return o;
    };

    this.deck.forEach((id, i) => {
      const x = DECK_X + (i % 4) * (DECK_W + DECK_GAP);
      const y = DECK_Y + Math.floor(i / 4) * (DECK_H + DECK_GAP);
      keep(drawCardFace(this, x, y, DECK_W, DECK_H, getCard(id), { highlight: this.slot === i }));
      keep(this.hitZone(x, y, DECK_W, DECK_H, () => this.pickSlot(i)));
    });

    const avg = this.deck.reduce((s, id) => s + getCard(id).cost, 0) / DECK_SIZE;
    keep(
      this.add
        .text(GAME_W / 2, 430, `평균 엘릭서 ${avg.toFixed(1)}`, { fontFamily: FONT, fontSize: '22px', color: '#f0abfc' })
        .setOrigin(0.5),
    );

    CARDS.forEach((card, i) => {
      const x = LIB_X + (i % COL) * (LIB_W + LIB_GAP);
      const y = LIB_Y + Math.floor(i / COL) * (LIB_H + LIB_GAP);
      const inDeck = this.deck.includes(card.id);
      keep(drawCardFace(this, x, y, LIB_W, LIB_H, card, { dimmed: inDeck, badge: inDeck ? '✓' : undefined, highlight: this.info === card.id }));
      keep(this.hitZone(x, y, LIB_W, LIB_H, () => this.pickLibrary(card.id)));
    });

    const infoY = LIB_Y + Math.ceil(CARDS.length / COL) * (LIB_H + LIB_GAP) + 20;
    let message: string;
    if (this.info) {
      const card = getCard(this.info);
      message = `${card.icon} ${card.name}\n${describeCard(card)}`;
    } else if (this.slot !== null) {
      message = '넣고 싶은 카드를 아래 목록에서 고르세요';
    } else {
      message = '바꿀 덱 카드를 먼저 누른 다음, 목록에서 새 카드를 고르세요';
    }
    keep(
      this.add
        .text(GAME_W / 2, infoY, message, {
          fontFamily: FONT, fontSize: '19px', color: '#e5e7eb', align: 'center', wordWrap: { width: GAME_W - 60 }, lineSpacing: 6,
        })
        .setOrigin(0.5, 0),
    );
  }

  private hitZone(x: number, y: number, w: number, h: number, onClick: () => void): Phaser.GameObjects.Zone {
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', onClick);
    return zone;
  }

  private pickSlot(i: number): void {
    this.slot = this.slot === i ? null : i;
    this.info = this.slot === null ? null : this.deck[i];
    this.redraw();
  }

  private pickLibrary(id: string): void {
    const inDeck = this.deck.indexOf(id);
    if (inDeck >= 0) {
      this.slot = inDeck;
    } else if (this.slot !== null) {
      this.deck[this.slot] = id;
      this.slot = null;
    }
    this.info = id;
    this.redraw();
  }
}
