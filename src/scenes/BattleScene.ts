import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { AiPlayer, type Difficulty } from '../core/ai';
import { AI_DECKS, getCard } from '../core/cards';
import { ARENA_H, ARENA_W, TICK_RATE } from '../core/constants';
import { elixirMultiplier } from '../core/elixir';
import { canDeploy, createGame, playCard, step, timeLeft } from '../core/sim';
import type { GameState } from '../core/types';
import { drawArena } from '../render/arena';
import { EntityRenderer } from '../render/entities';
import { ARENA_X, ARENA_Y, FONT, GAME_W, TILE, inArena, toScreen, toWorld } from '../render/layout';
import { loadDeck } from '../ui/deckStore';
import { HandUI } from '../ui/hand';
import type { ResultData } from './ResultScene';

const PLAYER = 0;
const TICK_MS = 1000 / TICK_RATE;
/** Avoid a spiral of death after the tab was in the background. */
const MAX_TICKS_PER_FRAME = 5;

export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private ai!: AiPlayer;
  private difficulty: Difficulty = 'normal';
  private entityView!: EntityRenderer;
  private hand!: HandUI;
  private accumulator = 0;
  private finished = false;

  private selected: number | null = null;
  private dragging = false;
  private overlay!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostIcon!: Phaser.GameObjects.Text;

  private timerText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private crownText!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  init(data: { difficulty?: Difficulty }): void {
    this.difficulty = data.difficulty ?? 'normal';
    this.accumulator = 0;
    this.finished = false;
    this.selected = null;
    this.dragging = false;
  }

  create(): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    const aiDeck = AI_DECKS[Math.abs(seed) % AI_DECKS.length];
    this.state = createGame({ seed, decks: [loadDeck(), aiDeck] });
    this.ai = new AiPlayer(1, this.difficulty, seed ^ 0x5bd1e995);
    // Dev-only handle for poking at the live game from the browser console.
    if (import.meta.env.DEV) (window as unknown as { battle: GameState }).battle = this.state;

    drawArena(this);
    this.overlay = this.add.graphics().setVisible(false);
    this.entityView = new EntityRenderer(this);
    this.ghost = this.add.graphics().setVisible(false);
    this.ghostIcon = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px' }).setOrigin(0.5).setVisible(false);
    this.hand = new HandUI(this, (i) => this.onCardDown(i));
    this.createHud();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.selected !== null && !this.dragging && inArena(p.x, p.y)) this.tryPlay(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      // Dropped on the battlefield plays the card; released anywhere else keeps it selected (tap-to-place).
      if (inArena(p.x, p.y)) this.tryPlay(p);
    });
  }

  private createHud(): void {
    const style = { fontFamily: FONT, fontStyle: 'bold', stroke: '#000', strokeThickness: 4 };
    this.timerText = this.add.text(GAME_W / 2, 18, '', { ...style, fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.phaseText = this.add.text(GAME_W / 2, 44, '', { ...style, fontSize: '15px', color: '#f0abfc' }).setOrigin(0.5);
    this.crownText = [
      this.add.text(ARENA_X, 28, '', { ...style, fontSize: '24px', color: '#60a5fa' }).setOrigin(0, 0.5),
      this.add.text(ARENA_X + ARENA_W * TILE, 28, '', { ...style, fontSize: '24px', color: '#f87171' }).setOrigin(1, 0.5),
    ];
    this.toast = this.add
      .text(GAME_W / 2, ARENA_Y + (ARENA_H / 2) * TILE, '', { ...style, fontSize: '26px', color: '#fde047', strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  update(_time: number, delta: number): void {
    if (!this.finished) {
      this.accumulator += delta;
      let ticks = 0;
      while (this.accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
        const cmd = this.ai.update(this.state);
        if (cmd) playCard(this.state, cmd);
        step(this.state);
        this.accumulator -= TICK_MS;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) this.accumulator = 0;
    }

    this.entityView.sync(this.state);
    this.entityView.playEvents(this.state.events);
    this.state.events.length = 0;
    this.hand.update(this.state.players[PLAYER], this.selected);
    this.updateHud();

    if (this.state.phase === 'ended' && !this.finished) this.finish();
  }

  private updateHud(): void {
    if (this.state.phase === 'ended') return;
    const t = Math.ceil(timeLeft(this.state));
    this.timerText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    const labels: string[] = [];
    if (this.state.phase === 'overtime') labels.push('연장전 · 먼저 크라운을 따면 승리');
    if (elixirMultiplier(this.state) > 1) labels.push('엘릭서 x2');
    this.phaseText.setText(labels.join('  ·  '));
    this.crownText[0].setText(`👑 ${this.state.players[0].crowns}  나`);
    this.crownText[1].setText(`상대  ${this.state.players[1].crowns} 👑`);
  }

  private onCardDown(index: number): void {
    if (this.finished) return;
    if (this.selected === index && !this.dragging) {
      this.clearSelection();
      return;
    }
    this.selected = index;
    this.dragging = true;
    sfx.click();
    this.drawOverlay();
  }

  private clearSelection(): void {
    this.selected = null;
    this.dragging = false;
    this.overlay.setVisible(false);
    this.ghost.setVisible(false);
    this.ghostIcon.setVisible(false);
  }

  private selectedCardId(): string | null {
    return this.selected === null ? null : this.state.players[PLAYER].deck.hand[this.selected];
  }

  /** Tints every tile where the selected card can't be placed. */
  private drawOverlay(): void {
    const cardId = this.selectedCardId();
    const g = this.overlay;
    g.clear();
    if (!cardId || getCard(cardId).type === 'spell') {
      g.setVisible(false);
      return;
    }
    g.fillStyle(0xdc2626, 0.28);
    for (let ty = 0; ty < ARENA_H; ty++) {
      for (let tx = 0; tx < ARENA_W; tx++) {
        if (!canDeploy(this.state, PLAYER, cardId, tx + 0.5, ty + 0.5)) {
          g.fillRect(ARENA_X + tx * TILE, ARENA_Y + ty * TILE, TILE, TILE);
        }
      }
    }
    g.setVisible(true);
  }

  private snapped(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = toWorld(p.x, p.y);
    return { x: Math.floor(w.x) + 0.5, y: Math.floor(w.y) + 0.5 };
  }

  private updateGhost(p: Phaser.Input.Pointer): void {
    const cardId = this.selectedCardId();
    if (!cardId || !inArena(p.x, p.y)) {
      this.ghost.setVisible(false);
      this.ghostIcon.setVisible(false);
      return;
    }
    const card = getCard(cardId);
    const w = this.snapped(p);
    const s = toScreen(w.x, w.y);
    const ok = canDeploy(this.state, PLAYER, cardId, w.x, w.y);
    const radius = (card.spell?.radius ?? Math.max(card.unit!.radius, 0.5) * 1.4) * TILE;
    const g = this.ghost;
    g.clear();
    g.fillStyle(ok ? 0xffffff : 0xdc2626, 0.25);
    g.fillCircle(s.x, s.y, radius);
    g.lineStyle(2, ok ? 0xffffff : 0xdc2626, 0.9);
    g.strokeCircle(s.x, s.y, radius);
    g.setVisible(true);
    this.ghostIcon.setText(card.icon).setPosition(s.x, s.y).setAlpha(0.8).setVisible(true);
  }

  private tryPlay(p: Phaser.Input.Pointer): void {
    if (this.selected === null) return;
    const cardId = this.selectedCardId()!;
    const card = getCard(cardId);
    const w = this.snapped(p);
    if (this.state.players[PLAYER].elixir < card.cost) {
      this.showToast('엘릭서가 부족해요');
      return;
    }
    if (!playCard(this.state, { side: PLAYER, handIndex: this.selected, x: w.x, y: w.y })) {
      this.showToast('여기에는 놓을 수 없어요');
      return;
    }
    this.clearSelection();
  }

  private showToast(message: string): void {
    sfx.error();
    this.toast.setText(message).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 700, duration: 400 });
  }

  private finish(): void {
    this.finished = true;
    this.clearSelection();
    const data: ResultData = {
      winner: this.state.winner,
      crowns: [this.state.players[0].crowns, this.state.players[1].crowns],
      difficulty: this.difficulty,
    };
    this.time.delayedCall(1500, () => this.scene.start('result', data));
  }
}
