import * as THREE from 'three';
import { ARENA_H, ARENA_W, BRIDGE_HALF_WIDTH, BRIDGE_XS, RIVER_BOTTOM, RIVER_TOP, TOWER_LAYOUT, relY } from '../core/constants';
import { G, PAL, group, part, toon } from './kit';

/** Core (x, y) → world (X, Z). The arena is centered on the origin; the player sits at +Z. */
export const toX = (x: number) => x - ARENA_W / 2;
export const toZ = (y: number) => y - ARENA_H / 2;

const PX = 16;

function grassTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ARENA_W * PX;
  c.height = ARENA_H * PX;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < ARENA_H; ty++) {
    for (let tx = 0; tx < ARENA_W; tx++) {
      g.fillStyle = (tx + ty) % 2 ? '#7ccf55' : '#72c64c';
      g.fillRect(tx * PX, ty * PX, PX, PX);
    }
  }
  // Dirt lanes and the paths in front of each king tower.
  g.fillStyle = '#d8c08a';
  const path = (x0: number, y0: number, x1: number, y1: number) => g.fillRect(x0 * PX, y0 * PX, (x1 - x0) * PX, (y1 - y0) * PX);
  for (const bx of BRIDGE_XS) path(bx - 0.7, 5, bx + 0.7, 27);
  path(3.5, 4.3, 14.5, 5.7);
  path(3.5, 26.3, 14.5, 27.7);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 400; i++) g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#39a7e8';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 14; i++) g.fillRect((i * 37) % 128, (i * 11) % 28, 14, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

export interface Arena {
  root: THREE.Group;
  /** Call every frame to animate the river. */
  update(dt: number): void;
}

export function buildArena(): Arena {
  const root = group();
  const halfW = ARENA_W / 2;

  // Surroundings.
  const outside = part(new THREE.PlaneGeometry(120, 120), toon(0x4f9a3c), { r: [-Math.PI / 2, 0, 0], shadow: false });
  outside.position.y = -0.3;
  outside.receiveShadow = true;
  root.add(outside);

  // Grass halves (the river runs between them).
  const grass = new THREE.MeshToonMaterial({ map: grassTexture() });
  const riverTopZ = toZ(RIVER_TOP);
  const riverBottomZ = toZ(RIVER_BOTTOM);
  for (const [z0, z1] of [[toZ(0), riverTopZ], [riverBottomZ, toZ(ARENA_H)]]) {
    const geo = new THREE.BoxGeometry(ARENA_W, 0.3, z1 - z0);
    // Map the shared arena texture onto just this half.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const v0 = 1 - (z0 - toZ(0)) / ARENA_H;
    const v1 = 1 - (z1 - toZ(0)) / ARENA_H;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + (v1 - v0) * (1 - uv.getY(i)));
    const m = part(geo, grass, { p: [0, -0.15, (z0 + z1) / 2], shadow: false });
    m.receiveShadow = true;
    root.add(m);
  }

  const water = waterTexture();
  const river = part(new THREE.PlaneGeometry(ARENA_W + 8, riverBottomZ - riverTopZ), new THREE.MeshToonMaterial({ map: water }), {
    r: [-Math.PI / 2, 0, 0],
    p: [0, -0.45, 0],
    shadow: false,
  });
  river.receiveShadow = true;
  root.add(river);
  for (const z of [riverTopZ, riverBottomZ]) {
    root.add(part(G.box(), toon(0xa5835a), { p: [0, -0.3, z], s: [ARENA_W, 0.35, 0.18], shadow: false }));
  }

  for (const bx of BRIDGE_XS) {
    const x = toX(bx);
    const len = riverBottomZ - riverTopZ + 0.8;
    const bridge = group(part(G.box(), toon(PAL.wood), { s: [BRIDGE_HALF_WIDTH * 2, 0.2, len] }));
    for (let i = 0; i < 6; i++) {
      bridge.add(part(G.box(), toon(PAL.woodDark), { p: [0, 0.105, -len / 2 + (i + 0.5) * (len / 6)], s: [BRIDGE_HALF_WIDTH * 2, 0.02, 0.06], shadow: false }));
    }
    for (const sx of [-1, 1]) {
      bridge.add(part(G.box(), toon(PAL.woodDark), { p: [sx * BRIDGE_HALF_WIDTH, 0.35, 0], s: [0.1, 0.1, len] }));
      for (const sz of [-1, 0, 1]) bridge.add(part(G.box(), toon(PAL.woodDark), { p: [sx * BRIDGE_HALF_WIDTH, 0.2, sz * (len / 2 - 0.1)], s: [0.14, 0.4, 0.14] }));
    }
    bridge.position.set(x, -0.05, 0);
    bridge.traverse((o) => (o.receiveShadow = true));
    root.add(bridge);
  }

  // Low stone walls around the field.
  const wall = toon(PAL.stoneDark);
  const cap = toon(PAL.stone);
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [[toZ(0), riverTopZ], [riverBottomZ, toZ(ARENA_H)]]) {
      root.add(part(G.box(), wall, { p: [sx * (halfW + 0.3), 0.1, (z0 + z1) / 2], s: [0.6, 0.6, z1 - z0] }));
      root.add(part(G.box(), cap, { p: [sx * (halfW + 0.3), 0.43, (z0 + z1) / 2], s: [0.7, 0.08, z1 - z0] }));
    }
  }
  for (const z of [toZ(0) - 0.3, toZ(ARENA_H) + 0.3]) {
    root.add(part(G.box(), wall, { p: [0, 0.1, z], s: [ARENA_W + 1.2, 0.6, 0.6] }));
    root.add(part(G.box(), cap, { p: [0, 0.43, z], s: [ARENA_W + 1.3, 0.08, 0.7] }));
  }

  // Stone pads under each tower.
  for (const side of [0, 1] as const) {
    for (const t of TOWER_LAYOUT) {
      const r = t.tower === 'king' ? 2.3 : 1.7;
      const pad = part(G.cyl(), toon(0xc9b58a), { p: [toX(t.x), 0.01, toZ(relY(side, t.y))], s: [r, 0.04, r], shadow: false });
      pad.receiveShadow = true;
      root.add(pad);
    }
  }

  // Scenery outside the walls.
  const rand = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const sx = rand() < 0.5 ? -1 : 1;
    const x = sx * (halfW + 1.5 + rand() * 7);
    const z = -22 + rand() * 44;
    if (rand() < 0.65) root.add(tree(x, z, 0.8 + rand() * 0.6));
    else root.add(part(G.sphere(), toon(0x9aa3ad), { p: [x, 0, z], s: [0.5 + rand() * 0.5, 0.35 + rand() * 0.3, 0.5 + rand() * 0.4] }));
  }

  return {
    root,
    update(dt: number) {
      water.offset.x = (water.offset.x + dt * 0.08) % 1;
    },
  };
}

function tree(x: number, z: number, s: number): THREE.Group {
  const t = group(
    part(G.cyl(), toon(PAL.woodDark), { p: [0, 0.5, 0], s: [0.15, 1, 0.15] }),
    part(G.cone(), toon(0x3f8f3a), { p: [0, 1.4, 0], s: [0.9, 1.4, 0.9] }),
    part(G.cone(), toon(0x4ea846), { p: [0, 2.1, 0], s: [0.65, 1.1, 0.65] }),
  );
  t.position.set(x, 0, z);
  t.scale.setScalar(s);
  return t;
}

function mulberry(seed: number): () => number {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
