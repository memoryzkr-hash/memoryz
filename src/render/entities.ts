import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { getCard } from '../core/cards';
import type { Entity, GameEvent, GameState } from '../core/types';
import { COLORS, FONT, TILE, toScreen } from './layout';

interface View {
  root: Phaser.GameObjects.Container;
  /** Body + icon, moved as one for lunges. */
  sprite: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  lift: number;
  lastX: number;
  lastY: number;
  phase: number;
  icon: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  hpText?: Phaser.GameObjects.Text;
  sleep?: Phaser.GameObjects.Text;
}

/** Air units are drawn raised above their shadow. */
const FLY_OFFSET = 14;

/** Mirrors core entities into Phaser game objects every frame. */
export class EntityRenderer {
  private views = new Map<number, View>();
  private projectiles: Phaser.GameObjects.Graphics;
  private groundLayer: Phaser.GameObjects.Container;
  private airLayer: Phaser.GameObjects.Container;
  private rubble: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.rubble = scene.add.graphics();
    this.groundLayer = scene.add.container(0, 0);
    this.projectiles = scene.add.graphics();
    this.airLayer = scene.add.container(0, 0);
  }

  sync(state: GameState): void {
    const seen = new Set<number>();
    for (const e of state.entities) {
      seen.add(e.id);
      let view = this.views.get(e.id);
      if (!view) {
        view = this.create(e);
        this.views.set(e.id, view);
      }
      this.update(view, e);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.scene.tweens.killTweensOf(view.sprite);
        view.root.destroy();
        this.views.delete(id);
      }
    }
    this.drawProjectiles(state);
    // Painter's order: things further down the screen are drawn on top.
    this.groundLayer.sort('y');
    this.airLayer.sort('y');
  }

  private create(e: Entity): View {
    const root = this.scene.add.container(0, 0);
    const body = this.scene.add.graphics();
    const r = e.stats.radius * TILE;
    const color = COLORS.side[e.side];
    const dark = COLORS.sideDark[e.side];
    const lift = e.stats.flying ? FLY_OFFSET : 0;

    if (e.stats.flying) {
      body.fillStyle(0x000000, 0.25);
      body.fillEllipse(0, r * 0.6, r * 1.6, r * 0.7);
    }
    let icon: string;
    let fontSize: number;
    if (e.kind === 'tower') {
      body.fillStyle(0x6b7280);
      body.fillRoundedRect(-r, -r, r * 2, r * 2, 8);
      body.fillStyle(color);
      body.fillRoundedRect(-r + 5, -r + 5, r * 2 - 10, r * 2 - 10, 6);
      body.lineStyle(3, dark);
      body.strokeRoundedRect(-r, -r, r * 2, r * 2, 8);
      icon = e.type === 'king' ? '👑' : '🏹';
      fontSize = e.type === 'king' ? 40 : 28;
    } else {
      const card = getCard(e.type);
      if (e.kind === 'building') {
        body.fillStyle(dark);
        body.fillRoundedRect(-r, -r, r * 2, r * 2, 6);
        body.fillStyle(color);
        body.fillRoundedRect(-r + 3, -r + 3, r * 2 - 6, r * 2 - 6, 5);
      } else {
        body.fillStyle(color);
        body.fillCircle(0, -lift, r);
        body.lineStyle(2, dark);
        body.strokeCircle(0, -lift, r);
      }
      icon = card.icon;
      fontSize = Math.max(12, Math.round(r * 1.3));
    }
    const iconText = this.scene.add
      .text(0, -lift, icon, { fontFamily: FONT, fontSize: `${fontSize}px` })
      .setOrigin(0.5);
    const hpBar = this.scene.add.graphics();
    const sprite = this.scene.add.container(0, 0, [body, iconText]);
    root.add([sprite, hpBar]);
    if (e.kind !== 'tower') {
      sprite.setScale(1.5);
      this.scene.tweens.add({ targets: sprite, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }

    const view: View = { root, sprite, body, lift, lastX: e.x, lastY: e.y, phase: e.id * 1.7, icon: iconText, hpBar };
    if (e.kind === 'tower') {
      view.hpText = this.scene.add
        .text(0, -r - 16, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5);
      root.add(view.hpText);
      if (e.type === 'king') {
        view.sleep = this.scene.add.text(r - 6, -r + 2, 'z', { fontFamily: FONT, fontSize: '18px', color: '#e5e7eb', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        root.add(view.sleep);
      }
    }
    (e.stats.flying ? this.airLayer : this.groundLayer).add(root);
    return view;
  }

  private update(view: View, e: Entity): void {
    const p = toScreen(e.x, e.y);
    view.root.setPosition(p.x, p.y);
    view.root.setAlpha(e.deployTimer > 0 ? 0.45 : 1);
    if (view.sleep) view.sleep.setVisible(!e.active);
    // Little hop while walking.
    const moved = Math.hypot(e.x - view.lastX, e.y - view.lastY) > 0.001;
    view.lastX = e.x;
    view.lastY = e.y;
    if (moved) view.phase += 0.35;
    view.icon.y = -view.lift - (moved ? Math.abs(Math.sin(view.phase)) * 4 : 0);

    const r = e.stats.radius * TILE;
    const lift = e.stats.flying ? FLY_OFFSET : 0;
    const frac = Math.max(0, e.hp / e.maxHp);
    const g = view.hpBar;
    g.clear();
    const showBar = e.kind === 'tower' || frac < 0.999 || e.kind === 'building';
    if (showBar) {
      const w = Math.max(20, r * 2);
      const y = -r - lift - 8;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(-w / 2 - 1, y - 1, w + 2, 6);
      g.fillStyle(e.side === 0 ? 0x60a5fa : 0xf87171);
      g.fillRect(-w / 2, y, w * frac, 4);
    }
    if (view.hpText) view.hpText.setText(String(Math.ceil(e.hp)));
  }

  private drawProjectiles(state: GameState): void {
    const g = this.projectiles;
    g.clear();
    for (const p of state.projectiles) {
      const s = toScreen(p.x, p.y);
      if (p.isSpell) {
        g.fillStyle(0xf97316);
        g.fillCircle(s.x, s.y, 14);
        g.fillStyle(0xfde047);
        g.fillCircle(s.x, s.y, 7);
      } else {
        g.fillStyle(p.splash > 0 ? 0xfb923c : 0xfef3c7);
        g.fillCircle(s.x, s.y, p.splash > 0 ? 6 : 3);
      }
    }
  }

  /** One-shot visual effects for simulation events. */
  playEvents(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'explosion') {
        const s = toScreen(ev.x, ev.y);
        sfx.explosion();
        const c = this.scene.add.circle(s.x, s.y, ev.radius * TILE, 0xf97316, 0.55).setScale(0.3);
        this.scene.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 380, onComplete: () => c.destroy() });
      } else if (ev.type === 'attack') {
        const view = this.views.get(ev.id);
        if (ev.ranged) sfx.shoot();
        else sfx.swing();
        if (view && !ev.ranged && view.sprite.x === 0 && view.sprite.y === 0) {
          const from = toScreen(view.lastX, view.lastY);
          const to = toScreen(ev.tx, ev.ty);
          const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
          this.scene.tweens.add({
            targets: view.sprite,
            x: ((to.x - from.x) / d) * 6,
            y: ((to.y - from.y) / d) * 6,
            duration: 70,
            yoyo: true,
            onComplete: () => view.sprite.setPosition(0, 0),
          });
        }
      } else if (ev.type === 'death') {
        const s = toScreen(ev.x, ev.y);
        if (ev.kind === 'tower') this.drawRubble(s.x, s.y);
        else sfx.death();
        const size = ev.kind === 'tower' ? 60 : 16;
        const c = this.scene.add.circle(s.x, s.y, size, 0xffffff, 0.6);
        this.scene.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 300, onComplete: () => c.destroy() });
      } else if (ev.type === 'deploy') {
        const s = toScreen(ev.x, ev.y);
        sfx.deploy();
        const c = this.scene.add.circle(s.x, s.y, 20).setStrokeStyle(3, COLORS.side[ev.side]);
        this.scene.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 450, onComplete: () => c.destroy() });
      } else if (ev.type === 'hit') {
        const view = this.views.get(ev.targetId);
        if (view) {
          view.body.setAlpha(0.55);
          this.scene.time.delayedCall(60, () => view.body.active && view.body.setAlpha(1));
        }
      } else if (ev.type === 'towerDestroyed') {
        sfx.towerDown();
        this.scene.cameras.main.shake(250, 0.008);
      }
    }
  }

  private drawRubble(x: number, y: number): void {
    const g = this.rubble;
    g.fillStyle(0x4b5563, 0.9);
    g.fillEllipse(x, y + 6, 70, 40);
    g.fillStyle(0x6b7280);
    for (const [dx, dy, r] of [[-18, 0, 9], [10, -6, 11], [20, 10, 7], [-6, 12, 8], [0, -2, 6]]) g.fillCircle(x + dx, y + dy, r);
  }
}
