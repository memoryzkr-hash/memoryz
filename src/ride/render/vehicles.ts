import * as THREE from 'three';
import { CAR_KINDS, type CarKind } from '../core/constants';
import type { Car } from '../core/sim';

/** Body paints, picked by `Car.paint`. Blues and whites like the reference, plus neon accents. */
const PAINTS = [0x2c4cff, 0xe9edf7, 0x1fc8ea, 0xff3fa4, 0x7b3dff, 0x8d97ab];
const GLOWS = [0x2ef2ff, 0xff2bd6, 0x2ef2ff, 0xff2bd6, 0x9d6bff, 0x2ef2ff];

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m;
}
const paint = (c: number) => mat(`paint${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.35 }));
const glow = (c: number, i = 3) => mat(`glow${c}:${i}`, () => new THREE.MeshStandardMaterial({ color: 0, emissive: c, emissiveIntensity: i }));
const glass = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x0a0d1f, roughness: 0.1, metalness: 0.6, emissive: 0x10183a, emissiveIntensity: 0.6 }));
const rubber = () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.9 }));
const dark = () => mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x151724, roughness: 0.6, metalness: 0.3 }));

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2);

function box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

function wheels(g: THREE.Group, halfW: number, zs: number[], r = 0.36): void {
  for (const z of zs) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, rubber());
      w.scale.set(0.3, r, r);
      w.position.set(s * (halfW - 0.12), r, z);
      g.add(w);
    }
  }
}

/** Taillight bar at the back (+z faces the camera) and headlights at the front. */
function lights(g: THREE.Group, halfW: number, halfL: number, y: number): void {
  const red = glow(0xff2040, 4.5);
  for (const s of [-1, 1]) g.add(box(red, 0.5, 0.13, 0.06, s * (halfW - 0.32), y, halfL + 0.01));
  g.add(box(glow(0xff2040, 1.6), halfW * 2 - 0.4, 0.035, 0.05, 0, y + 0.1, halfL + 0.01));
  const white = glow(0xeaf4ff, 3);
  for (const s of [-1, 1]) g.add(box(white, 0.42, 0.12, 0.06, s * (halfW - 0.3), y, -halfL - 0.01));
}

function buildCar(kind: CarKind, paintIndex: number): THREE.Group {
  const g = new THREE.Group();
  const { halfWidth: hw, halfLength: hl } = CAR_KINDS[kind];
  const body = paint(PAINTS[paintIndex % PAINTS.length]);
  const accent = GLOWS[paintIndex % GLOWS.length];

  if (kind === 'sedan') {
    g.add(box(body, hw * 2, 0.62, hl * 2, 0, 0.55, 0));
    g.add(box(glass(), hw * 2 - 0.3, 0.52, hl * 2 - 2.0, 0, 1.12, 0.25));
    g.add(box(body, hw * 2 - 0.36, 0.06, hl * 2 - 2.1, 0, 1.41, 0.25));
    lights(g, hw, hl, 0.7);
    wheels(g, hw, [-hl + 0.85, hl - 0.8]);
  } else if (kind === 'van') {
    g.add(box(body, hw * 2, 1.65, hl * 2, 0, 1.08, 0.1));
    g.add(box(glass(), hw * 2 - 0.2, 0.62, 0.9, 0, 1.45, -hl + 0.5));
    g.add(box(glass(), 0.06, 0.5, hl * 1.2, hw + 0.005, 1.5, 0.1));
    g.add(box(glass(), 0.06, 0.5, hl * 1.2, -hw - 0.005, 1.5, 0.1));
    lights(g, hw, hl + 0.1, 0.75);
    wheels(g, hw, [-hl + 0.9, hl - 0.9], 0.4);
  } else {
    // Cab up front, tall trailer with neon outline behind.
    g.add(box(body, hw * 2 - 0.1, 2.3, 2.2, 0, 1.45, -hl + 1.1));
    g.add(box(glass(), hw * 2 - 0.3, 0.8, 0.08, 0, 1.95, -hl - 0.01));
    const trailerLen = hl * 2 - 2.6;
    const tz = hl - trailerLen / 2;
    g.add(box(dark(), hw * 2, 2.6, trailerLen, 0, 1.9, tz));
    const edge = glow(accent, 2.6);
    for (const s of [-1, 1]) {
      g.add(box(edge, 0.06, 0.06, trailerLen, s * hw, 3.2, tz));
      g.add(box(edge, 0.06, 0.06, trailerLen, s * hw, 0.62, tz));
      g.add(box(edge, 0.06, 2.6, 0.06, s * hw, 1.9, hl));
    }
    g.add(box(edge, hw * 2, 0.06, 0.06, 0, 3.2, hl));
    lights(g, hw, hl, 0.85);
    wheels(g, hw, [-hl + 1.0, hl - 2.2, hl - 1.1], 0.48);
  }

  // Underglow so cars read against the dark road and light up with bloom.
  g.add(box(glow(accent, 1.8), hw * 2 - 0.4, 0.04, hl * 2 - 0.8, 0, 0.12, 0));
  return g;
}

/** Keeps one 3D model per live car, reusing models from a pool keyed by kind and paint. */
export class TrafficView {
  readonly group = new THREE.Group();
  private live = new Map<number, { key: string; obj: THREE.Group }>();
  private pool = new Map<string, THREE.Group[]>();

  update(cars: readonly Car[], ref: number, time: number): void {
    const seen = new Set<number>();
    for (const car of cars) {
      seen.add(car.id);
      let entry = this.live.get(car.id);
      if (!entry) {
        const key = `${car.kind}:${car.paint}`;
        const obj = this.pool.get(key)?.pop() ?? buildCar(car.kind, car.paint);
        this.group.add(obj);
        entry = { key, obj };
        this.live.set(car.id, entry);
      }
      const o = entry.obj;
      o.position.set(car.x, 0, -(car.z - ref));
      // Lean the body a touch into lane changes and bob slightly.
      o.rotation.y = (car.targetX - car.x) * -0.04;
      o.position.y = Math.sin(time * 9 + car.id) * 0.012;
    }
    for (const [id, entry] of this.live) {
      if (seen.has(id)) continue;
      this.group.remove(entry.obj);
      let list = this.pool.get(entry.key);
      if (!list) this.pool.set(entry.key, (list = []));
      list.push(entry.obj);
      this.live.delete(id);
    }
  }
}
