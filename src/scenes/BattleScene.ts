import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { AiPlayer, type Difficulty } from '../core/ai';
import { AI_DECKS, getCard } from '../core/cards';
import { TICK_RATE } from '../core/constants';
import { elixirMultiplier } from '../core/elixir';
import { canDeploy, createGame, playCard, step, timeLeft } from '../core/sim';
import type { GameEvent, GameState } from '../core/types';
import { world } from '../render3d/instance';
import type { OverlayItem } from '../render3d/world';
import { FONT, GAME_W, UI_Y } from '../render/layout';
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
  private hand!: HandUI;
  private accumulator = 0;
  private finished = false;

  private selected: number | null = null;
  private dragging = false;
  private pending: GameEvent[] = [];

  private bars!: Phaser.GameObjects.Graphics;
  private towerLabels = new Map<number, Phaser.GameObjects.Text>();
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
    this.pending = [];
    this.towerLabels = new Map();
  }

  create(): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    const aiDeck = AI_DECKS[Math.abs(seed) % AI_DECKS.length];
    this.state = createGame({ seed, decks: [loadDeck(), aiDeck] });
    this.ai = new AiPlayer(1, this.difficulty, seed ^ 0x5bd1e995);
    // Dev-only handle for poking at the live game from the browser console.
    if (import.meta.env.DEV) (window as unknown as { battle: GameState }).battle = this.state;

    const w = world();
    w.reset();
    w.setVisible(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      w.setVisible(false);
      w.reset();
    });

    this.bars = this.add.graphics();
    this.hand = new HandUI(this, (i) => this.onCardDown(i));
    this.createHud();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.selected !== null && !this.dragging && this.arenaPoint(p)) this.tryPlay(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.dragging = false;
      // Dropped on the battlefield plays the card; released anywhere else keeps it selected (tap-to-place).
      if (this.arenaPoint(p)) this.tryPlay(p);
    });
  }

  private createHud(): void {
    const style = { fontFamily: FONT, fontStyle: 'bold', stroke: '#000', strokeThickness: 5 };
    const top = this.add.graphics();
    top.fillStyle(0x000000, 0.35);
    top.fillRoundedRect(GAME_W - 150, 8, 140, 64, 14);
    this.add.text(GAME_W - 80, 20, '남은 시간', { fontFamily: FONT, fontSize: '13px', color: '#e5e7eb' }).setOrigin(0.5);
    this.timerText = this.add.text(GAME_W - 80, 44, '', { ...style, fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.phaseText = this.add.text(GAME_W - 80, 86, '', { ...style, fontSize: '15px', color: '#f0abfc', strokeThickness: 4 }).setOrigin(0.5);
    this.crownText = [
      this.add.text(20, UI_Y - 40, '', { ...style, fontSize: '26px', color: '#8ec0ff' }).setOrigin(0, 0.5),
      this.add.text(20, 30, '', { ...style, fontSize: '26px', color: '#ff9a9a' }).setOrigin(0, 0.5),
    ];
    this.toast = this.add
      .text(GAME_W / 2, 560, '', { ...style, fontSize: '28px', color: '#fde047', strokeThickness: 6 })
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
    this.pending.push(...this.state.events);
    this.state.events.length = 0;

    const w = world();
    w.alignTo(this.game.canvas);
    w.handleEvents(this.pending);
    this.playSounds(this.pending);
    this.pending = [];
    this.drawOverlay(w.update(this.state, Math.min(delta, 100) / 1000));

    this.hand.update(this.state.players[PLAYER], this.selected);
    this.updateHud();
    if (this.state.phase === 'ended' && !this.finished) this.finish();
  }

  private playSounds(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'attack') (ev.ranged ? sfx.shoot : sfx.swing)();
      else if (ev.type === 'explosion') sfx.explosion();
      else if (ev.type === 'deploy') sfx.deploy();
      else if (ev.type === 'towerDestroyed') sfx.towerDown();
      else if (ev.type === 'death' && ev.kind !== 'tower') sfx.death();
    }
  }

  /** Health bars and tower HP numbers, drawn in 2D over the 3D models. */
  private drawOverlay(items: OverlayItem[]): void {
    const g = this.bars;
    g.clear();
    const seenTowers = new Set<number>();
    for (const it of items) {
      const tower = it.kind === 'tower';
      if (!tower && it.kind !== 'building' && it.frac >= 0.999) continue;
      const w = tower ? 74 : 36;
      const h = tower ? 10 : 6;
      const x = it.x - w / 2;
      const y = it.y - h / 2;
      g.fillStyle(0x000000, 0.65);
      g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 3);
      g.fillStyle(it.side === 0 ? 0x4f9dff : 0xff4d4d);
      g.fillRoundedRect(x, y, Math.max(2, w * it.frac), h, 2);
      if (tower) {
        seenTowers.add(it.id);
        let label = this.towerLabels.get(it.id);
        if (!label) {
          label = this.add
            .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 })
            .setOrigin(0.5, 1);
          this.towerLabels.set(it.id, label);
        }
        label.setText(it.sleeping ? `💤 ${Math.ceil(it.hp)}` : String(Math.ceil(it.hp))).setPosition(it.x, y - 3);
      }
    }
    for (const [id, label] of this.towerLabels) {
      if (!seenTowers.has(id)) {
        label.destroy();
        this.towerLabels.delete(id);
      }
    }
  }

  private updateHud(): void {
    if (this.state.phase === 'ended') return;
    const t = Math.ceil(timeLeft(this.state));
    this.timerText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    const labels: string[] = [];
    if (this.state.phase === 'overtime') labels.push('연장전');
    if (elixirMultiplier(this.state) > 1) labels.push('엘릭서 x2');
    this.phaseText.setText(labels.join(' · '));
    this.crownText[0].setText(`👑 ${this.state.players[0].crowns}`);
    this.crownText[1].setText(`👑 ${this.state.players[1].crowns}`);
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
    const cardId = this.selectedCardId()!;
    world().setDeployOverlay(
      getCard(cardId).type === 'spell' ? null : (x, y) => !canDeploy(this.state, PLAYER, cardId, x, y),
    );
  }

  private clearSelection(): void {
    this.selected = null;
    this.dragging = false;
    world().setDeployOverlay(null);
    world().setGhost(null);
  }

  private selectedCardId(): string | null {
    return this.selected === null ? null : this.state.players[PLAYER].deck.hand[this.selected];
  }

  /** Tile-snapped arena point under the pointer, or null if it isn't over the battlefield. */
  private arenaPoint(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    if (p.y >= UI_Y - 8) return null;
    const a = world().screenToArena(p.x, p.y);
    return a && { x: Math.floor(a.x) + 0.5, y: Math.floor(a.y) + 0.5 };
  }

  private updateGhost(p: Phaser.Input.Pointer): void {
    const cardId = this.selectedCardId();
    const a = cardId ? this.arenaPoint(p) : null;
    if (!cardId || !a) {
      world().setGhost(null);
      return;
    }
    const card = getCard(cardId);
    const radius = card.spell?.radius ?? Math.max(card.unit!.radius, 0.5) * 1.4;
    world().setGhost({ ...a, radius, ok: canDeploy(this.state, PLAYER, cardId, a.x, a.y) });
  }

  private tryPlay(p: Phaser.Input.Pointer): void {
    if (this.selected === null) return;
    const a = this.arenaPoint(p);
    if (!a) return;
    const card = getCard(this.selectedCardId()!);
    if (this.state.players[PLAYER].elixir < card.cost) {
      this.showToast('엘릭서가 부족해요');
      return;
    }
    if (!playCard(this.state, { side: PLAYER, handIndex: this.selected, x: a.x, y: a.y })) {
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
    this.time.delayedCall(1800, () => this.scene.start('result', data));
  }
}
