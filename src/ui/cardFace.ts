import Phaser from 'phaser';
import type { CardDef } from '../core/types';
import { COLORS, FONT, cardArtKey } from '../render/layout';

export interface CardFaceOptions {
  highlight?: boolean;
  dimmed?: boolean;
  badge?: string;
}

/** A static card tile (icon, name, cost) with its top-left corner at (x, y). */
export function drawCardFace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  card: CardDef,
  opts: CardFaceOptions = {},
): Phaser.GameObjects.Container {
  const bg = scene.add.graphics();
  bg.fillStyle(card.type === 'spell' ? 0x9a3412 : card.type === 'building' ? 0x3f3f46 : 0x4c1d95);
  bg.fillRoundedRect(0, 0, w, h, 10);
  bg.lineStyle(opts.highlight ? 4 : 2, opts.highlight ? 0xfde047 : 0x111827);
  bg.strokeRoundedRect(0, 0, w, h, 10);
  const art = h - 32;
  const icon = scene.add.image(w / 2, 4 + art / 2, cardArtKey(card.id)).setDisplaySize(Math.min(w - 8, art), art);
  const name = scene.add
    .text(w / 2, h - 16, card.name, { fontFamily: FONT, fontSize: `${w < 130 ? 14 : 16}px`, color: '#ffffff' })
    .setOrigin(0.5);
  const cost = scene.add.graphics();
  cost.fillStyle(COLORS.elixir);
  cost.fillCircle(16, 16, 13);
  const costText = scene.add
    .text(16, 16, String(card.cost), { fontFamily: FONT, fontSize: '16px', color: '#fff', fontStyle: 'bold' })
    .setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [bg, icon, name, cost, costText];
  if (opts.badge) {
    parts.push(
      scene.add
        .text(w - 8, 8, opts.badge, { fontFamily: FONT, fontSize: '18px', color: '#86efac', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
        .setOrigin(1, 0),
    );
  }
  const root = scene.add.container(x, y, parts);
  root.setAlpha(opts.dimmed ? 0.45 : 1);
  return root;
}

const TARGET_LABEL = { ground: '지상', all: '공중+지상', buildings: '건물만' } as const;

export function describeCard(card: CardDef): string {
  if (card.spell) {
    return `주문 · 범위 ${card.spell.radius}칸 · 피해 ${card.spell.damage} (타워 ${Math.round(card.spell.towerScale * 100)}%)`;
  }
  const u = card.unit!;
  const parts = [
    card.type === 'building' ? `건물 · ${u.lifetime}초 유지` : u.flying ? '공중 유닛' : '지상 유닛',
    `체력 ${u.hp}`,
    `공격력 ${u.damage}${card.count && card.count > 1 ? ` ×${card.count}` : ''}`,
    `사거리 ${u.range >= 2 ? u.range + '칸' : '근접'}`,
    `공격 대상 ${TARGET_LABEL[u.targets]}`,
  ];
  if (u.splash) parts.push(u.selfSplash ? '주변 360° 공격' : '범위 공격');
  if (u.jumpsRiver) parts.push('강을 뛰어넘음');
  return parts.join(' · ');
}
