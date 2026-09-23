import * as THREE from 'three';
import type { Side } from '../core/types';

/** 3-step ramp for a cel-shaded, cartoony look. */
const GRADIENT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export const PAL = {
  skin: 0xffcc9e,
  skinShade: 0xe9a97d,
  hairBrown: 0x6b3f1f,
  hairBlond: 0xf5c542,
  hairOrange: 0xff8a1f,
  hairPink: 0xff7fb6,
  hairBlack: 0x2a1d17,
  steel: 0xcfd8e3,
  steelDark: 0x66727f,
  wood: 0x9a5f2d,
  woodDark: 0x6b3e1c,
  gold: 0xffc933,
  bone: 0xf4efdf,
  black: 0x1d1d22,
  white: 0xffffff,
  goblin: 0x7bd14b,
  dragon: 0x58c24a,
  dragonBelly: 0xffe07a,
  minion: 0x5aa8ff,
  hog: 0xc98a64,
  hogSnout: 0xf2a3a0,
  stone: 0xb6bec8,
  stoneDark: 0x8a939e,
  brownCloth: 0x8a5a3c,
};

export const TEAM: Record<Side, { main: number; dark: number; light: number }> = {
  0: { main: 0x2f7bff, dark: 0x1b4fc2, light: 0x8ec0ff },
  1: { main: 0xff3b3b, dark: 0xb51f2c, light: 0xff9a9a },
};

const materials = new Map<string, THREE.Material>();

/** Shared cel-shaded material (cached by color). */
export function toon(color: number, emissive = 0): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}`;
  let m = materials.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, emissive });
    materials.set(key, m);
  }
  return m;
}

const geometries = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key) as T | undefined;
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

export const G = {
  sphere: () => geo('sphere', () => new THREE.SphereGeometry(1, 20, 14)),
  hemi: () => geo('hemi', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 18)),
  cone: () => geo('cone', () => new THREE.ConeGeometry(1, 1, 16)),
  capsule: () => geo('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 6, 14)),
  torus: () => geo('torus', () => new THREE.TorusGeometry(1, 0.25, 8, 20)),
  halfTorus: () => geo('halfTorus', () => new THREE.TorusGeometry(1, 0.08, 6, 16, Math.PI)),
  ring: () => geo('ring', () => new THREE.RingGeometry(0.82, 1, 32)),
  disc: () => geo('disc', () => new THREE.CircleGeometry(1, 32)),
  wing: () =>
    geo('wing', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.5, 0.55, 1, 0.45);
      s.lineTo(0.8, 0.15);
      s.lineTo(0.55, 0.05);
      s.lineTo(0.3, -0.12);
      s.lineTo(0, 0);
      return new THREE.ShapeGeometry(s);
    }),
};

export interface PartOpts {
  p?: [number, number, number];
  s?: [number, number, number] | number;
  r?: [number, number, number];
  shadow?: boolean;
}

/** A mesh with position / scale / rotation in one call. */
export function part(geometry: THREE.BufferGeometry, material: THREE.Material, o: PartOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  if (o.p) m.position.set(...o.p);
  if (o.s !== undefined) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(...o.s);
  if (o.r) m.rotation.set(...o.r);
  m.castShadow = o.shadow ?? true;
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** A pivot group placed at `p` whose children hang from it (for limbs). */
export function pivot(p: [number, number, number], ...children: THREE.Object3D[]): THREE.Group {
  const g = group(...children);
  g.position.set(...p);
  return g;
}
