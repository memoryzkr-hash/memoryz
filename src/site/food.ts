import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  baconTexture,
  boxFrontTexture,
  cartonTexture,
  crumbTexture,
  fbm,
  lidTexture,
  noiseTexture,
  paperTexture,
  pattyTexture,
  pickleTexture,
  ringNoise,
  rng,
  shakeCupTexture,
  strawTexture,
  tomatoTexture,
} from './textures';

// ---------------------------------------------------------------------------
// Shared resources. Textures are built lazily once and reused by every model,
// including the off-screen renders for the menu cards.
// ---------------------------------------------------------------------------

let cache: ReturnType<typeof buildCache> | null = null;

function buildCache() {
  const crustBump = noiseTexture(256, 22, 1.4, 1);
  const fineBump = noiseTexture(256, 60, 1.2, 2);
  const softBump = noiseTexture(256, 8, 1, 3);
  return {
    crustBump,
    fineBump,
    softBump,
    patty: pattyTexture(),
    crumb: crumbTexture(),
    pickle: pickleTexture(),
    tomato: tomatoTexture(),
    bacon: baconTexture(),
    paper: paperTexture(),
    carton: cartonTexture(),
    straw: strawTexture(),
    cup: shakeCupTexture('#f2c6cf', '#4a1f17'),
  };
}

function tex() {
  return (cache ??= buildCache());
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Lathe a profile into a closed, seamless solid with planar (top-down) UVs, then
 * let `displace` push vertices around for an organic, hand-made silhouette.
 */
function organicLathe(
  profile: [number, number][],
  segments: number,
  displace: (v: THREE.Vector3, angle: number) => void,
): THREE.BufferGeometry {
  // Profiles are written top -> bottom; the lathe wants bottom -> top for outward-facing normals.
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y)).reverse();
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(pts, segments);
  const maxR = Math.max(...profile.map((p) => p[0]));
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / (2 * maxR) + 0.5, pos.getZ(i) / (2 * maxR) + 0.5);
  }
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    displace(v, Math.atan2(v.z, v.x));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function paint(g: THREE.BufferGeometry, color: (v: THREE.Vector3, out: THREE.Color) => void): void {
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    color(v, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function mix(out: THREE.Color, a: string, b: string, t: number): THREE.Color {
  tmpA.set(a);
  tmpB.set(b);
  return out.copy(tmpA).lerp(tmpB, Math.min(1, Math.max(0, t)));
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

// ---------------------------------------------------------------------------
// Burger layers. Every builder returns a mesh/group whose bottom sits at y = 0.
// ---------------------------------------------------------------------------

export type LayerKind =
  | 'heel'
  | 'crown'
  | 'patty'
  | 'cheese'
  | 'onions'
  | 'pickles'
  | 'sauce'
  | 'lettuce'
  | 'tomato'
  | 'bacon'
  | 'chicken';

/** How much each layer adds to the stack height. */
const THICKNESS: Record<LayerKind, number> = {
  heel: 0.46,
  crown: 0.92,
  patty: 0.3,
  cheese: 0.025,
  onions: 0.1,
  pickles: 0.05,
  sauce: 0.03,
  lettuce: 0.07,
  tomato: 0.12,
  bacon: 0.08,
  chicken: 0.4,
};

const BUN_R = 1.25;

function crown(seed: number): THREE.Mesh {
  const H = THICKNESS.crown;
  const prof: [number, number][] = [];
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * (Math.PI / 2);
    prof.push([BUN_R * Math.pow(Math.sin(th), 0.72), 0.07 + (H - 0.07) * Math.pow(Math.cos(th), 0.62)]);
  }
  prof.push([BUN_R * 0.995, 0.025], [BUN_R * 0.95, 0], [BUN_R * 0.6, 0], [0, 0]);
  const g = organicLathe(prof, 112, (v, a) => {
    const k = 1 + 0.035 * (ringNoise(a, 1.6, seed) - 0.5) + 0.018 * (ringNoise(a, 5, seed + 3) - 0.5);
    v.x *= k;
    v.z *= k;
    v.y += (fbm(v.x * 1.4 + seed, v.z * 1.4) - 0.5) * 0.08 * (v.y / H);
  });
  paint(g, (v, c) => {
    const r = Math.hypot(v.x, v.z);
    if (v.y < 0.012 && r < BUN_R * 0.97) {
      mix(c, '#e9b878', '#c88a45', r / BUN_R);
      return;
    }
    const h = v.y / H;
    const n = fbm(v.x * 3 + 10, v.z * 3, 3);
    // Glossy dark top -> amber shoulders -> pale band at the very rim.
    if (h > 0.5) mix(c, '#b4561a', '#7a3009', (h - 0.5) / 0.5 + (n - 0.5) * 0.5);
    else if (h > 0.14) mix(c, '#d98a3a', '#b4561a', (h - 0.14) / 0.36 + (n - 0.5) * 0.35);
    else mix(c, '#ecc58a', '#d98a3a', h / 0.14);
  });
  const t = tex();
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.5,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    bumpMap: t.softBump,
    bumpScale: 1.2,
    sheen: 0.15,
    sheenColor: new THREE.Color('#ffcf8a'),
  });
  return new THREE.Mesh(g, m);
}

function heel(seed: number): THREE.Mesh {
  const H = THICKNESS.heel;
  const R = BUN_R * 0.98;
  const prof: [number, number][] = [
    [0, H],
    [R * 0.5, H],
    [R * 0.9, H * 0.99],
    [R * 0.985, H * 0.9],
    [R, H * 0.65],
    [R * 0.99, H * 0.35],
    [R * 0.95, H * 0.08],
    [R * 0.88, 0],
    [0, 0],
  ];
  const g = organicLathe(prof, 96, (v, a) => {
    const k = 1 + 0.03 * (ringNoise(a, 1.8, seed) - 0.5);
    v.x *= k;
    v.z *= k;
  });
  paint(g, (v, c) => {
    const r = Math.hypot(v.x, v.z);
    const n = fbm(v.x * 4, v.z * 4 + 5, 3);
    if (v.y > H * 0.97 && r < R * 0.92) mix(c, '#b8692a', '#7a3a10', r / R + (n - 0.5) * 0.5);
    else mix(c, '#d99a52', '#b05a18', v.y / H + (n - 0.5) * 0.25);
  });
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.62,
    bumpMap: tex().crustBump,
    bumpScale: 0.8,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffd9a0'),
  });
  return new THREE.Mesh(g, m);
}

/** Smashed patty: lacy, irregular, deeply seared edge. */
function patty(seed: number, chicken = false): THREE.Mesh {
  const H = chicken ? THICKNESS.chicken : THICKNESS.patty;
  const R = chicken ? 1.32 : 1.3;
  const prof: [number, number][] = [
    [0, H],
    [R * 0.6, H * 0.98],
    [R * 0.88, H * 0.93],
    [R * 0.97, H * 0.78],
    [R, H * 0.5],
    [R * 0.97, H * 0.2],
    [R * 0.9, H * 0.03],
    [R * 0.6, 0],
    [0, 0],
  ];
  const g = organicLathe(prof, 160, (v, a) => {
    const lace = chicken ? 0.07 : 0.12;
    const k =
      1 +
      0.08 * (ringNoise(a, 2.2, seed) - 0.5) +
      lace * (ringNoise(a, 11, seed + 7) - 0.5) * Math.min(1, Math.hypot(v.x, v.z) / R);
    v.x *= k;
    v.z *= k;
    v.y += (fbm(v.x * 5 + seed, v.z * 5, 4) - 0.5) * (chicken ? 0.12 : 0.06) * (v.y / H + 0.2);
  });
  const t = tex();
  const m = chicken
    ? new THREE.MeshPhysicalMaterial({
        color: '#d2832c',
        roughness: 0.75,
        bumpMap: t.fineBump,
        bumpScale: 3.5,
        sheen: 0.6,
        sheenColor: new THREE.Color('#ffc46b'),
      })
    : new THREE.MeshPhysicalMaterial({
        map: t.patty,
        roughness: 0.58,
        bumpMap: t.crustBump,
        bumpScale: 3,
        clearcoat: 0.35,
        clearcoatRoughness: 0.5,
      });
  return new THREE.Mesh(g, m);
}

/** Square slice melted over whatever is beneath it, corners drooping. */
function cheese(seed: number): THREE.Mesh {
  const S = 2.3;
  const g = new THREE.PlaneGeometry(S, S, 64, 64);
  g.rotateX(-Math.PI / 2);
  g.rotateY(seed * 0.7);
  const p = g.attributes.position;
  const RP = 1.16;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const over = Math.max(0, r - RP);
    const nr = r > RP ? RP + over * 0.22 : r;
    const drop = over * 0.55 + over * over * 1.1 + over * 0.3 * (ringNoise(a, 4, seed) - 0.4);
    const k = r > 0 ? nr / r : 1;
    p.setXYZ(i, x * k, 0.012 - drop + (fbm(x * 3, z * 3) - 0.5) * 0.02, z * k);
  }
  g.computeVertexNormals();
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ff9a0a',
    roughness: 0.3,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffd27a'),
  });
  return new THREE.Mesh(g, m);
}

function onions(seed: number): THREE.Mesh {
  const r = rng(seed * 31 + 5);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 70; i++) {
    const g = new THREE.TorusGeometry(0.12 + r() * 0.2, 0.022 + r() * 0.018, 6, 18, Math.PI * (0.5 + r() * 0.9));
    g.rotateX(Math.PI / 2 + (r() - 0.5) * 0.6);
    g.rotateY(r() * Math.PI * 2);
    const rr = Math.sqrt(r()) * 1.02;
    const a = r() * Math.PI * 2;
    g.translate(Math.cos(a) * rr, 0.035 + r() * 0.07, Math.sin(a) * rr);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  paint(g, (v, c) => mix(c, '#7a2f08', '#c9761f', fbm(v.x * 6, v.z * 6 + seed)));
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  return new THREE.Mesh(g, m);
}

function pickles(seed: number): THREE.Group {
  const r = rng(seed * 13 + 1);
  const grp = new THREE.Group();
  const t = tex();
  const side = new THREE.MeshPhysicalMaterial({ color: '#3f5a12', roughness: 0.35, clearcoat: 0.6 });
  const cap = new THREE.MeshPhysicalMaterial({ map: t.pickle, roughness: 0.25, clearcoat: 0.8 });
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 28);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, [side, cap, cap]);
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const rr = 0.55 + r() * 0.25;
    m.position.set(Math.cos(a) * rr, 0.02 + r() * 0.015, Math.sin(a) * rr);
    m.rotation.set((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15);
    grp.add(m);
  }
  const center = new THREE.Mesh(geo, [side, cap, cap]);
  center.position.y = 0.03;
  grp.add(center);
  return grp;
}

function sauce(seed: number): THREE.Group {
  const R = 1.05;
  const g = organicLathe(
    [
      [0, 0.03],
      [R * 0.9, 0.028],
      [R, 0.012],
      [R * 0.95, 0],
      [0, 0],
    ],
    72,
    (v, a) => {
      const k = 1 + 0.18 * (ringNoise(a, 3, seed) - 0.5);
      v.x *= k;
      v.z *= k;
    },
  );
  const mat = new THREE.MeshPhysicalMaterial({ color: '#f07a3c', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g, mat));
  return grp;
}

function lettuce(seed: number): THREE.Mesh {
  const R = 1.48;
  const g = new THREE.RingGeometry(0.02, R, 160, 14);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const t = r / R;
    const k = 1 + 0.08 * (ringNoise(a, 4, seed) - 0.5);
    const y = Math.sin(a * 17 + ringNoise(a, 3, seed) * 6) * 0.07 * t * t - t * t * 0.12;
    p.setXYZ(i, x * k, y + 0.04, z * k);
  }
  g.computeVertexNormals();
  paint(g, (v, c) => mix(c, '#d9f08a', '#3f9a1f', Math.hypot(v.x, v.z) / R + 0.1));
  return new THREE.Mesh(
    g,
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }),
  );
}

function tomato(): THREE.Group {
  const t = tex();
  const side = new THREE.MeshPhysicalMaterial({ color: '#b5140b', roughness: 0.3, clearcoat: 0.8 });
  const cap = new THREE.MeshPhysicalMaterial({ map: t.tomato, roughness: 0.2, clearcoat: 1 });
  const geo = new THREE.CylinderGeometry(0.72, 0.72, 0.1, 40);
  const grp = new THREE.Group();
  for (const [x, z, ry] of [
    [-0.45, 0.1, 0.2],
    [0.5, -0.12, 1.4],
  ]) {
    const m = new THREE.Mesh(geo, [side, cap, cap]);
    m.position.set(x, 0.05, z);
    m.rotation.y = ry;
    grp.add(m);
  }
  return grp;
}

function bacon(seed: number): THREE.Group {
  const t = tex();
  const mat = new THREE.MeshPhysicalMaterial({
    map: t.bacon,
    roughness: 0.45,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
    bumpMap: t.fineBump,
    bumpScale: 2,
  });
  const grp = new THREE.Group();
  const r = rng(seed);
  for (let s = 0; s < 3; s++) {
    const g = new THREE.PlaneGeometry(2.7, 0.42, 80, 3);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const ph = r() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setY(i, Math.sin(x * 6 + ph) * 0.045 + Math.sin(x * 2.3 + ph) * 0.02 - Math.max(0, Math.abs(x) - 1.1) * 0.5);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.rotation.y = s * 1.05 + r() * 0.3;
    m.position.y = 0.04 + s * 0.012;
    grp.add(m);
  }
  return grp;
}

const BUILDERS: Record<LayerKind, (seed: number) => THREE.Object3D> = {
  heel,
  crown,
  patty: (s) => patty(s),
  chicken: (s) => patty(s, true),
  cheese,
  onions,
  pickles,
  sauce,
  lettuce,
  tomato: () => tomato(),
  bacon,
};

export interface StackLayer {
  object: THREE.Object3D;
  kind: LayerKind;
  label?: string;
  restY: number;
  /** Order among layers, 0 = bottom. */
  index: number;
}

export interface Burger {
  group: THREE.Group;
  layers: StackLayer[];
  height: number;
  /** 0 = assembled, 1 = fully exploded "THE STACK" view. */
  setExplode(t: number, time?: number): void;
}

export function buildBurger(spec: { kind: LayerKind; label?: string }[], seed = 1): Burger {
  const group = new THREE.Group();
  const layers: StackLayer[] = [];
  let y = 0;
  spec.forEach((s, i) => {
    const object = shadowed(BUILDERS[s.kind](seed + i * 17));
    // Cheese and sauce melt onto the layer below rather than stacking on top of it.
    const sink = s.kind === 'cheese' ? 0.02 : s.kind === 'sauce' ? 0.015 : s.kind === 'lettuce' ? 0.02 : 0;
    const restY = y - sink;
    object.position.y = restY;
    group.add(object);
    layers.push({ object, kind: s.kind, label: s.label, restY, index: i });
    y = restY + THICKNESS[s.kind];
  });
  const GAP = 0.5;
  return {
    group,
    layers,
    height: y,
    setExplode(t, time = 0) {
      const e = t * t * (3 - 2 * t);
      for (const l of layers) {
        l.object.position.y = l.restY + l.index * GAP * e + Math.sin(time * 1.3 + l.index) * 0.03 * e;
        l.object.rotation.y = (l.index % 2 ? 1 : -1) * 0.35 * e + Math.sin(time * 0.7 + l.index * 2) * 0.05 * e;
        l.object.rotation.z = Math.sin(time * 0.9 + l.index) * 0.03 * e;
      }
    },
  };
}

export const HERO_SPEC: { kind: LayerKind; label?: string }[] = [
  { kind: 'heel', label: 'Toasted Heel' },
  { kind: 'sauce' },
  { kind: 'pickles', label: 'Crinkle Pickles' },
  { kind: 'patty', label: 'Smashed Chuck ×2' },
  { kind: 'cheese' },
  { kind: 'patty' },
  { kind: 'cheese', label: 'American, Melted' },
  { kind: 'onions', label: 'Caramelized Onions' },
  { kind: 'sauce', label: 'KO Sauce' },
  { kind: 'crown', label: 'Butter-Toasted Brioche' },
];

// ---------------------------------------------------------------------------
// Sides
// ---------------------------------------------------------------------------

export function buildFries(seed = 4, loaded = false): THREE.Group {
  const t = tex();
  const grp = new THREE.Group();
  const H = 1.25;
  const cartonGeo = new THREE.CylinderGeometry(0.78, 0.56, H, 4, 1, true);
  cartonGeo.rotateY(Math.PI / 4);
  cartonGeo.scale(1, 1, 0.62);
  cartonGeo.translate(0, H / 2, 0);
  const cartonTex = t.carton.clone();
  cartonTex.repeat.set(4, 1);
  cartonTex.needsUpdate = true;
  const carton = new THREE.Mesh(
    cartonGeo,
    new THREE.MeshPhysicalMaterial({ map: cartonTex, roughness: 0.55, side: THREE.DoubleSide, clearcoat: 0.2 }),
  );
  const bottom = new THREE.Mesh(
    new THREE.PlaneGeometry(0.79, 0.49).rotateX(-Math.PI / 2).translate(0, 0.01, 0),
    new THREE.MeshStandardMaterial({ color: '#b5200d' }),
  );
  grp.add(carton, bottom);

  const r = rng(seed);
  const n = 46;
  const fry = new THREE.BoxGeometry(0.1, 1, 0.1);
  const inst = new THREE.InstancedMesh(
    fry,
    new THREE.MeshPhysicalMaterial({ roughness: 0.55, bumpMap: t.fineBump, bumpScale: 1.2, sheen: 0.5, sheenColor: new THREE.Color('#ffe08a') }),
    n,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const len = 1.3 + r() * 0.6;
    const x = (r() - 0.5) * 1.0;
    const z = (r() - 0.5) * 0.55;
    e.set((r() - 0.5) * 0.4 + z * 0.4, r() * 3, (r() - 0.5) * 0.5 - x * 0.35);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, 0.55 + len / 2 + r() * 0.15, z), q, new THREE.Vector3(1, len, 1));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, mix(c, '#f3c35a', '#d98a24', r()));
  }
  grp.add(inst);

  if (loaded) {
    const sauceMat = new THREE.MeshPhysicalMaterial({ color: '#ffb21c', roughness: 0.2, clearcoat: 1 });
    for (let i = 0; i < 9; i++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.16 + r() * 0.12, 20, 14), sauceMat);
      blob.scale.y = 0.45;
      blob.position.set((r() - 0.5) * 0.9, 1.75 + r() * 0.3, (r() - 0.5) * 0.4);
      grp.add(blob);
    }
    const o = onions(seed + 3);
    o.scale.setScalar(0.55);
    o.position.y = 1.95;
    grp.add(o);
  }
  return shadowed(grp);
}

export function buildShake(seed = 6, flavor: 'strawberry' | 'cookies' = 'cookies'): THREE.Group {
  const t = tex();
  const grp = new THREE.Group();
  const H = 1.75;
  const cupTex = flavor === 'cookies' ? t.cup : shakeCupTexture('#ff9fb2', '#b0122a');
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.46, H, 56, 1, true).translate(0, H / 2, 0),
    new THREE.MeshPhysicalMaterial({ map: cupTex, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }),
  );
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 40).rotateX(-Math.PI / 2).translate(0, 0.01, 0),
    new THREE.MeshStandardMaterial({ color: '#d8a4ae' }),
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.63, 0.03, 8, 64).rotateX(Math.PI / 2).translate(0, H, 0),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.7 }),
  );
  grp.add(cup, base, rim);

  // Soft-serve swirl: lumpy lathe twisted around the axis.
  const prof: [number, number][] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const env = 0.6 * Math.pow(1 - s, 0.8);
    prof.push([Math.max(0, env * (0.85 + 0.15 * Math.abs(Math.sin(s * Math.PI * 4)))), s * 0.95]);
  }
  prof.reverse();
  prof.push([0, 0]);
  const cream = organicLathe(prof, 64, (v, a) => {
    const lump = 1 + 0.12 * Math.sin(a * 3 + v.y * 9);
    v.x *= lump;
    v.z *= lump;
  });
  const creamMesh = new THREE.Mesh(
    cream,
    new THREE.MeshPhysicalMaterial({ color: '#fff7ee', roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#ffffff') }),
  );
  creamMesh.position.y = H - 0.05;
  grp.add(creamMesh);

  const r = rng(seed);
  // Syrup drizzle spiralling over the cream.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const s = i / 80;
    const a = s * Math.PI * 6;
    const rr = 0.58 * (1 - s * 0.85);
    pts.push(new THREE.Vector3(Math.cos(a) * rr, H + 0.08 + s * 0.85, Math.sin(a) * rr));
  }
  const syrup = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.028, 8),
    new THREE.MeshPhysicalMaterial({ color: flavor === 'cookies' ? '#3a160e' : '#a40f26', roughness: 0.1, clearcoat: 1 }),
  );
  grp.add(syrup);
  if (flavor === 'cookies') {
    const crumbMat = new THREE.MeshStandardMaterial({ color: '#1c1210', roughness: 0.9 });
    for (let i = 0; i < 22; i++) {
      const s = r();
      const a = r() * Math.PI * 2;
      const rr = 0.55 * (1 - s * 0.8);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.08), crumbMat);
      c.position.set(Math.cos(a) * rr, H + 0.05 + s * 0.8, Math.sin(a) * rr);
      c.rotation.set(r() * 3, r() * 3, r() * 3);
      grp.add(c);
    }
  } else {
    const berry = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 16),
      new THREE.MeshPhysicalMaterial({ color: '#d01b2c', roughness: 0.25, clearcoat: 1, bumpMap: t.fineBump, bumpScale: 2 }),
    );
    berry.scale.y = 1.25;
    berry.position.set(0.05, H + 1.0, 0);
    grp.add(berry);
  }

  // Clear dome lid and striped straw.
  const lid = new THREE.Mesh(
    new THREE.SphereGeometry(0.64, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.03,
      clearcoat: 1,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  lid.scale.y = 1.7;
  lid.position.y = H;
  lid.castShadow = false;
  const straw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 2.2, 16),
    new THREE.MeshPhysicalMaterial({ map: t.straw, roughness: 0.3, clearcoat: 0.6 }),
  );
  straw.position.set(0.22, H + 0.6, 0.05);
  straw.rotation.z = -0.22;
  grp.add(straw);
  shadowed(grp);
  grp.add(lid);
  return grp;
}

// ---------------------------------------------------------------------------
// Takeout box with a hinged lid
// ---------------------------------------------------------------------------

export interface TakeoutBox {
  group: THREE.Group;
  /** 0 = closed, 1 = fully open. */
  setLid(open: number): void;
  height: number;
}

export function buildBox(): TakeoutBox {
  const W = 4.8;
  const D = 3.1;
  const H = 1.05;
  const T = 0.05;
  const group = new THREE.Group();
  const outer = new THREE.MeshPhysicalMaterial({ color: '#131213', roughness: 0.62, sheen: 0.3, sheenColor: new THREE.Color('#444') });
  const inner = new THREE.MeshStandardMaterial({ color: '#1d1b1c', roughness: 0.8 });
  const front = new THREE.MeshPhysicalMaterial({ map: boxFrontTexture(W / H), roughness: 0.55 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), inner);
  floor.position.y = T / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [outer, outer, outer, outer, inner, outer]);
  back.position.set(0, H / 2, -D / 2 + T / 2);
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [outer, outer, outer, outer, front, inner]);
  frontWall.position.set(0, H / 2, D / 2 - T / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(T, H, D), [inner, outer, outer, outer, outer, outer]);
  left.position.set(-W / 2 + T / 2, H / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(T, H, D), [outer, inner, outer, outer, outer, outer]);
  right.position.set(W / 2 - T / 2, H / 2, 0);
  const divider = new THREE.Mesh(new THREE.BoxGeometry(T, H * 0.55, D - T * 2), inner);
  divider.position.set(-0.32, (H * 0.55) / 2, 0);
  // Orange stripe printed around the inside rim.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(W - T * 2.2, 0.035, 0.005),
    new THREE.MeshBasicMaterial({ color: '#ff4a1c' }),
  );
  stripe.position.set(0, H - 0.16, -D / 2 + T + 0.004);
  group.add(floor, back, frontWall, left, right, divider, stripe);

  const pivot = new THREE.Group();
  pivot.position.set(0, H, -D / 2);
  const lidTop = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, T, D + 0.04), [
    outer,
    outer,
    new THREE.MeshPhysicalMaterial({ map: lidTexture((W + 0.04) / (D + 0.04)), roughness: 0.5 }),
    new THREE.MeshPhysicalMaterial({ map: lidTexture((W + 0.04) / (D + 0.04)), roughness: 0.6 }),
    outer,
    outer,
  ]);
  lidTop.position.set(0, T / 2, D / 2);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.3, T), outer);
  flap.position.set(0, -0.15 + T, D + 0.02 + T / 2);
  pivot.add(lidTop, flap);
  group.add(pivot);
  shadowed(group);

  return {
    group,
    height: H + T,
    setLid(open) {
      pivot.rotation.x = -open * 1.78;
    },
  };
}

export function buildPaper(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(4.2, 4.2, 40, 40);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, 0.004 + (fbm(x * 1.2 + 4, z * 1.2, 3) - 0.5) * 0.06 + Math.max(0, Math.hypot(x, z) - 1.6) * 0.04);
  }
  g.computeVertexNormals();
  const t = tex();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ map: t.paper, roughness: 0.85, transparent: true, bumpMap: t.softBump, bumpScale: 0.4 }),
  );
  m.receiveShadow = true;
  m.rotation.y = 0.5;
  return m;
}
