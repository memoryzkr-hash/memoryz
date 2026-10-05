import * as THREE from 'three';
import type { Body } from '../core/sim';

const PINK = 0xff2fa8;
const CYAN = 0x2ef2ff;

const std = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, ...opts });
const neon = (color: number, intensity = 3) => new THREE.MeshStandardMaterial({ color: 0, emissive: color, emissiveIntensity: intensity });

const M = {
  black: std(0x0c0d14, { roughness: 0.7 }),
  frame: std(0x1d2035, { metalness: 0.6, roughness: 0.3 }),
  pink: std(PINK, { emissive: 0x5a0838, emissiveIntensity: 0.6, roughness: 0.25 }),
  glove: std(0x15151f, { roughness: 0.8 }),
  suit: std(0x3a4166, { roughness: 0.45, emissive: 0x0b1030, emissiveIntensity: 1 }),
  visor: std(0x05060c, { metalness: 0.9, roughness: 0.08 }),
  cyan: neon(CYAN, 3),
  cyanSoft: neon(CYAN, 1.4),
  pinkGlow: neon(PINK, 2.5),
  red: neon(0xff2040, 4),
  white: neon(0xeaf4ff, 3),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  torus: new THREE.TorusGeometry(1, 0.2, 10, 32),
  ring: new THREE.TorusGeometry(1, 0.05, 6, 40),
};

function part(geo: THREE.BufferGeometry, mat: THREE.Material, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  m.rotation.set(...r);
  return m;
}

/** First-person cockpit, parented to the camera: bars with gloved hands, a dash screen and the pink tank. */
export class Cockpit {
  readonly group = new THREE.Group();
  private readonly bars = new THREE.Group();
  readonly headlight: THREE.SpotLight;
  private fitZ = 0;
  private fitY = 0;

  constructor(dashTexture: THREE.Texture) {
    const g = this.group;

    // Tank and front fairing (static). The pink tank fills the bottom of the view like in the reference.
    g.add(part(G.sphere, M.pink, [0.26, 0.15, 0.4], [0, -0.47, -0.34]));
    g.add(part(G.box, M.pinkGlow, [0.025, 0.012, 0.42], [0, -0.325, -0.36]));
    g.add(part(G.box, M.pink, [0.46, 0.13, 0.3], [0, -0.36, -0.86], [0.3, 0, 0]));
    g.add(part(G.box, M.cyanSoft, [0.42, 0.015, 0.015], [0, -0.29, -1.0], [0.3, 0, 0]));
    g.add(part(G.box, M.black, [0.3, 0.07, 0.2], [0, -0.3, -0.7], [0.3, 0, 0]));

    // Dash screen between the bars.
    const dash = new THREE.Group();
    dash.position.set(0, -0.215, -0.66);
    dash.rotation.x = -0.62;
    dash.add(part(G.box, M.black, [0.33, 0.18, 0.03], [0, 0, -0.018]));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: dashTexture, toneMapped: false }));
    dash.add(screen);
    dash.add(part(G.box, M.cyanSoft, [0.33, 0.005, 0.005], [0, 0.092, 0]));
    g.add(dash);

    // Low windscreen.
    const shield = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x6fdcff, transparent: true, opacity: 0.1, roughness: 0, metalness: 0.5, side: THREE.DoubleSide }),
    );
    shield.position.set(0, -0.1, -0.8);
    shield.rotation.x = -0.45;
    g.add(shield);

    // Handlebars with hands on the grips; they turn with the steering.
    const b = this.bars;
    b.position.set(0, -0.3, -0.5);
    b.add(part(G.cyl, M.frame, [0.016, 0.7, 0.016], [0, 0.03, 0.03], [0, 0, Math.PI / 2]));
    b.add(part(G.box, M.frame, [0.07, 0.06, 0.06], [0, 0, 0]));
    for (const s of [-1, 1]) {
      b.add(part(G.cyl, M.black, [0.026, 0.12, 0.026], [s * 0.31, 0.03, 0.03], [0, 0, Math.PI / 2]));
      // Gloved fist wrapped around the grip, with a forearm coming back toward the rider.
      b.add(part(G.sphere, M.glove, [0.06, 0.052, 0.07], [s * 0.31, 0.05, 0.04]));
      b.add(part(G.box, M.cyanSoft, [0.07, 0.006, 0.008], [s * 0.31, 0.09, 0.0]));
      b.add(part(G.capsule, M.suit, [0.045, 0.2, 0.045], [s * 0.34, 0.02, 0.22], [Math.PI / 2 - 0.25, 0, s * 0.2]));
      // Brake/clutch lever.
      b.add(part(G.box, M.frame, [0.13, 0.007, 0.011], [s * 0.25, 0.035, -0.035], [0, s * 0.15, 0]));
    }
    g.add(b);

    // Headlight lighting the road ahead.
    this.headlight = new THREE.SpotLight(0xcfe4ff, 260, 90, 0.45, 0.6, 1.3);
    this.headlight.position.set(0, -0.5, -0.9);
    this.headlight.target.position.set(0, -1.6, -40);
    g.add(this.headlight, this.headlight.target);
  }

  update(steer: number, time: number, speed: number): void {
    this.bars.rotation.y = -steer * 0.22;
    // Engine vibration grows with speed.
    const buzz = 0.0012 + speed * 0.00004;
    this.group.position.set(Math.sin(time * 47) * buzz * 0.5, this.fitY + Math.sin(time * 61) * buzz, this.fitZ);
  }

  /** Pushes the cockpit away on narrow (portrait) screens so it doesn't fill the view. */
  fit(aspect: number): void {
    const k = aspect < 1 ? Math.min(0.55, (1 / aspect - 1) * 0.4) : 0;
    this.fitZ = -k;
    this.fitY = -k * 0.55;
  }
}

/** Third-person bike (shown after a crash). Origin at the center of mass. */
export function buildBike(): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-0.72, 0.72]) {
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.17, z);
    wheel.add(part(G.torus, M.black, [0.3, 0.3, 0.3], [0, 0, 0], [0, Math.PI / 2, 0]));
    wheel.add(part(G.ring, M.cyan, [0.31, 0.31, 0.31], [0.07, 0, 0], [0, Math.PI / 2, 0]));
    wheel.add(part(G.ring, M.cyan, [0.31, 0.31, 0.31], [-0.07, 0, 0], [0, Math.PI / 2, 0]));
    wheel.add(part(G.cyl, M.frame, [0.05, 0.16, 0.05], [0, 0, 0], [0, 0, Math.PI / 2]));
    g.add(wheel);
  }
  g.add(part(G.box, M.frame, [0.14, 0.12, 1.2], [0, 0.0, 0], [0.12, 0, 0]));
  g.add(part(G.sphere, M.pink, [0.2, 0.15, 0.36], [0, 0.2, -0.12]));
  g.add(part(G.box, M.black, [0.2, 0.07, 0.42], [0, 0.22, 0.32]));
  g.add(part(G.box, M.pink, [0.3, 0.24, 0.32], [0, 0.18, -0.62], [0.4, 0, 0]));
  g.add(part(G.box, M.white, [0.14, 0.06, 0.03], [0, 0.17, -0.8], [0.4, 0, 0]));
  g.add(part(G.box, M.pink, [0.18, 0.08, 0.36], [0, 0.18, 0.62], [-0.3, 0, 0]));
  g.add(part(G.box, M.red, [0.14, 0.04, 0.03], [0, 0.22, 0.8]));
  g.add(part(G.cyl, M.frame, [0.015, 0.6, 0.015], [0, 0.4, -0.48], [0, 0, Math.PI / 2]));
  g.add(part(G.box, M.cyanSoft, [0.02, 0.02, 1.1], [0.1, 0.06, 0]));
  g.add(part(G.box, M.cyanSoft, [0.02, 0.02, 1.1], [-0.1, 0.06, 0]));
  return g;
}

interface Limb {
  pivot: THREE.Group;
  joint: THREE.Group;
}

/** Third-person rider in a dark suit with glowing lines, with joints that flail in a crash. */
export class RiderModel {
  readonly group = new THREE.Group();
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private head = new THREE.Group();

  constructor() {
    const g = this.group;
    g.add(part(G.box, M.suit, [0.3, 0.16, 0.2], [0, 0, 0]));
    g.add(part(G.capsule, M.suit, [0.16, 0.3, 0.12], [0, 0.32, 0]));
    g.add(part(G.box, M.cyan, [0.02, 0.5, 0.02], [0.1, 0.3, -0.125]));
    g.add(part(G.box, M.cyan, [0.02, 0.5, 0.02], [-0.1, 0.3, -0.125]));
    g.add(part(G.box, M.cyan, [0.3, 0.02, 0.02], [0, 0.55, -0.12]));

    this.head.position.set(0, 0.72, 0);
    this.head.add(part(G.sphere, M.suit, [0.15, 0.16, 0.16], [0, 0, 0]));
    this.head.add(part(G.sphere, M.visor, [0.12, 0.08, 0.1], [0, 0.01, -0.08]));
    this.head.add(part(G.box, M.cyan, [0.24, 0.015, 0.015], [0, 0.07, -0.13]));
    g.add(this.head);

    const limb = (x: number, y: number, upper: number, lower: number, thick: number): Limb => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(part(G.capsule, M.suit, [thick, upper * 0.7, thick], [0, -upper / 2, 0]));
      pivot.add(part(G.box, M.cyan, [0.012, upper * 0.8, 0.012], [0, -upper / 2, -thick]));
      const joint = new THREE.Group();
      joint.position.y = -upper;
      joint.add(part(G.capsule, M.suit, [thick * 0.9, lower * 0.7, thick * 0.9], [0, -lower / 2, 0]));
      joint.add(part(G.box, M.cyanSoft, [0.012, lower * 0.8, 0.012], [0, -lower / 2, -thick]));
      joint.add(part(G.sphere, M.glove, [thick * 1.2, thick * 1.2, thick * 1.2], [0, -lower, 0]));
      pivot.add(joint);
      g.add(pivot);
      return { pivot, joint };
    };
    for (const s of [-1, 1]) {
      this.arms.push(limb(s * 0.24, 0.55, 0.3, 0.28, 0.055));
      this.legs.push(limb(s * 0.1, -0.05, 0.42, 0.42, 0.07));
    }
  }

  /** Pose the rider from a sim body. Limbs flail while moving fast and go limp at rest. */
  update(body: Body, ref: number, time: number): void {
    const g = this.group;
    g.position.set(body.x, body.y, -(body.z - ref));
    g.rotation.set(body.rx, body.ry, body.rz);
    const speed = Math.hypot(body.vx, body.vy, body.vz);
    const flail = Math.min(1, speed / 7);
    this.arms.forEach((a, i) => {
      const s = i ? 1 : -1;
      a.pivot.rotation.x = -2.2 * flail + Math.sin(time * 13 + i * 2) * 1.1 * flail - 0.3;
      a.pivot.rotation.z = s * (1.0 + Math.sin(time * 11 + i) * 0.6 * flail);
      a.joint.rotation.x = -0.4 - Math.abs(Math.sin(time * 15 + i * 3)) * 1.2 * flail;
    });
    this.legs.forEach((l, i) => {
      const s = i ? 1 : -1;
      l.pivot.rotation.x = Math.sin(time * 10 + i * 2.5) * 0.9 * flail - 0.2;
      l.pivot.rotation.z = s * (0.25 + 0.3 * flail);
      l.joint.rotation.x = 0.3 + Math.abs(Math.sin(time * 12 + i)) * 1.1 * flail;
    });
    this.head.rotation.x = Math.sin(time * 9) * 0.4 * flail;
  }
}

/** Additive spark particles in sim coordinates. */
export class Sparks {
  readonly points: THREE.Points;
  private readonly max = 400;
  private pos: Float32Array;
  private simPos: Float64Array;
  private vel: Float32Array;
  private life: Float32Array;
  private colors: Float32Array;
  private next = 0;

  constructor() {
    this.pos = new Float32Array(this.max * 3);
    this.simPos = new Float64Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.colors = new Float32Array(this.max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vz: number, count: number, spread = 4): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.simPos.set([x, y, z], i * 3);
      this.vel[i * 3] = vx + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = Math.random() * spread * 0.8;
      this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[i] = 0.3 + Math.random() * 0.5;
    }
  }

  update(dt: number, ref: number): void {
    for (let i = 0; i < this.max; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.pos[o + 1] = -100;
        continue;
      }
      this.life[i] -= dt;
      this.vel[o + 1] -= 9.8 * dt;
      this.simPos[o] += this.vel[o] * dt;
      this.simPos[o + 1] = Math.max(0.02, this.simPos[o + 1] + this.vel[o + 1] * dt);
      this.simPos[o + 2] += this.vel[o + 2] * dt;
      this.pos[o] = this.simPos[o];
      this.pos[o + 1] = this.simPos[o + 1];
      this.pos[o + 2] = -(this.simPos[o + 2] - ref);
      const k = Math.max(0, Math.min(1, this.life[i] * 2));
      this.colors[o] = 3 * k;
      this.colors[o + 1] = 1.6 * k * k;
      this.colors[o + 2] = 0.4 * k * k * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
