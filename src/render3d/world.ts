import * as THREE from 'three';
import { ARENA_H, ARENA_W } from '../core/constants';
import { edgeDistance, findEntity } from '../core/combat';
import type { Entity, EntityKind, GameEvent, GameState, Projectile, Side } from '../core/types';
import { buildArena, toX, toZ, type Arena } from './arena';
import { G, PAL, TEAM, group, part, toon } from './kit';
import { arrowProp, buildModel, fireballProp, type Rig } from './models';

export const VIEW_W = 720;
export const VIEW_H = 1280;

/** Health bar anchor for the 2D overlay, in Phaser (720×1280) coordinates. */
export interface OverlayItem {
  id: number;
  x: number;
  y: number;
  frac: number;
  hp: number;
  side: Side;
  kind: EntityKind;
  sleeping: boolean;
}

interface View {
  rig: Rig;
  ring?: THREE.Mesh;
  x: number;
  z: number;
  lastMove: number;
  walk: number;
  phase: number;
  facing: number;
  attackT: number;
  attackDur: number;
  landed: boolean;
}

interface ProjView {
  obj: THREE.Object3D;
  x: number;
  z: number;
  sx: number;
  sz: number;
  h0: number;
  arc: number;
}

interface Effect {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  step(p: number): void;
}

const FLY_HEIGHT = 1.4;
/** Units read better a bit larger than their collision radius, as in the genre. */
const UNIT_SCALE = 1.25;
const RING_MATS = [0, 1].map((side) => new THREE.MeshBasicMaterial({ color: TEAM[side as Side].main, transparent: true, opacity: 0.85 }));
const SHOOTER_HEIGHT: Record<string, number> = { princess: 3.2, king: 3.6, babydragon: 2.0, minions: 1.9, cannon: 0.65 };

function angleLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Three.js battlefield rendered on its own canvas underneath the (transparent) Phaser UI canvas. */
export class World3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, VIEW_W / VIEW_H, 1, 300);
  private cameraBase = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3(0, 0, 3.75);
  private arena: Arena;
  private views = new Map<number, View>();
  private shots = new Map<number, ProjView>();
  private effects: Effect[] = [];
  private dynamic = group();
  private deployTiles: THREE.InstancedMesh;
  private ghost: THREE.Group;
  private ghostMat: THREE.MeshBasicMaterial;
  private time = 0;
  private shake = 0;
  private sparksThisFrame = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor() {
    // Phones get a lighter setup (fewer pixels, smaller shadow map) to hold the frame rate.
    const phone = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '0', pointerEvents: 'none', display: 'none' });
    document.body.appendChild(this.canvas);

    this.scene.background = new THREE.Color(0x4f9a3c);
    const pitch = (67.5 * Math.PI) / 180;
    this.cameraBase.set(0, Math.sin(pitch) * 56, this.lookAt.z + Math.cos(pitch) * 56);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.lookAt);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f5a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(-10, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(phone ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    this.arena = buildArena();
    this.scene.add(this.arena.root, this.dynamic);

    this.deployTiles = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.33, depthWrite: false }),
      ARENA_W * ARENA_H,
    );
    this.deployTiles.visible = false;
    this.deployTiles.renderOrder = 1;
    this.scene.add(this.deployTiles);

    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = group(
      part(G.disc(), this.ghostMat, { r: [-Math.PI / 2, 0, 0], shadow: false }),
      part(G.ring(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), {
        r: [-Math.PI / 2, 0, 0],
        shadow: false,
      }),
    );
    this.ghost.visible = false;
    this.ghost.renderOrder = 2;
    this.scene.add(this.ghost);
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  /** Keeps the 3D canvas exactly under the Phaser canvas (which Phaser scales to fit the window). */
  alignTo(el: HTMLCanvasElement): void {
    const r = el.getBoundingClientRect();
    const s = this.canvas.style;
    const want = [`${r.left}px`, `${r.top}px`, `${r.width}px`, `${r.height}px`];
    if (s.left !== want[0] || s.top !== want[1] || s.width !== want[2] || s.height !== want[3]) {
      [s.left, s.top, s.width, s.height] = want;
    }
  }

  /** Removes everything from a previous battle. */
  reset(): void {
    for (const v of this.views.values()) this.dynamic.remove(v.rig.root);
    for (const p of this.shots.values()) this.dynamic.remove(p.obj);
    for (const e of this.effects) this.disposeEffect(e);
    this.views.clear();
    this.shots.clear();
    this.effects = [];
    this.dynamic.clear();
    this.setDeployOverlay(null);
    this.setGhost(null);
    this.shake = 0;
  }

  // --- Frame update -----------------------------------------------------------

  update(state: GameState, dt: number): OverlayItem[] {
    this.time += dt;
    this.sparksThisFrame = 0;
    const overlay: OverlayItem[] = [];
    const seen = new Set<number>();
    for (const e of state.entities) {
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        v = this.createView(e);
        this.views.set(e.id, v);
      }
      this.animate(v, e, state, dt);
      const top = v.rig.height + (v.rig.flying ? FLY_HEIGHT * UNIT_SCALE : 0) + 0.35;
      const s = this.worldToScreen(v.x, top, v.z);
      overlay.push({
        id: e.id,
        x: s.x,
        y: s.y,
        frac: Math.max(0, e.hp / e.maxHp),
        hp: e.hp,
        side: e.side,
        kind: e.kind,
        sleeping: e.kind === 'tower' && !e.active,
      });
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.dynamic.remove(v.rig.root);
        this.views.delete(id);
      }
    }
    this.updateShots(state.projectiles, dt);
    this.updateEffects(dt);
    this.arena.update(dt);

    this.shake = Math.max(0, this.shake - dt);
    const k = this.shake * 1.2;
    this.camera.position.set(
      this.cameraBase.x + (Math.random() - 0.5) * k,
      this.cameraBase.y,
      this.cameraBase.z + (Math.random() - 0.5) * k,
    );
    this.renderer.render(this.scene, this.camera);
    return overlay;
  }

  private createView(e: Entity): View {
    const rig = buildModel(e.type, e.side);
    const x = toX(e.x);
    const z = toZ(e.y);
    const facing = e.side === 0 ? Math.PI : 0;
    let ring: THREE.Mesh | undefined;
    if (e.kind !== 'tower') {
      ring = part(G.ring(), RING_MATS[e.side], {
        r: [-Math.PI / 2, 0, 0],
        s: e.stats.radius * 1.05,
        p: [0, 0.03, 0],
        shadow: false,
      });
      rig.root.add(ring);
      rig.root.scale.setScalar(UNIT_SCALE);
      rig.height *= UNIT_SCALE;
    }
    if (rig.turret) rig.turret.rotation.y = facing;
    else rig.root.rotation.y = facing;
    rig.root.position.set(x, 0, z);
    this.dynamic.add(rig.root);
    return { rig, ring, x, z, lastMove: -1, walk: 0, phase: e.id, facing, attackT: 0, attackDur: 0.35, landed: e.deployTimer <= 0 };
  }

  private animate(v: View, e: Entity, state: GameState, dt: number): void {
    const rig = v.rig;
    const tx = toX(e.x);
    const tz = toZ(e.y);
    // The simulation runs at 20Hz; ease toward it so movement looks continuous at 60fps.
    const follow = Math.min(1, dt * 14);
    const dx = tx - v.x;
    const dz = tz - v.z;
    if (Math.hypot(dx, dz) > 0.003) v.lastMove = this.time;
    v.x += dx * follow;
    v.z += dz * follow;
    const walking = this.time - v.lastMove < 0.15 && e.kind === 'troop';
    v.walk = Math.min(1, Math.max(0, v.walk + (walking ? dt : -dt) * 6));
    if (walking) v.phase += dt * 11;

    // Deploy: drop in from above, with a dust ring on landing.
    let y = 0;
    if (e.deployTimer > 0) y = e.deployTimer * 4;
    else if (!v.landed) {
      v.landed = true;
      this.spawnRing(v.x, v.z, e.stats.radius * 2.2, 0xffffff, 0.35);
    }
    rig.root.position.set(v.x, y, v.z);

    const bob = Math.abs(Math.sin(v.phase)) * 0.07 * v.walk;
    rig.body.position.y = rig.flying ? FLY_HEIGHT + Math.sin(this.time * 3 + e.id) * 0.1 : bob;
    rig.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(v.phase + (i % 2) * Math.PI) * 0.75 * v.walk));
    rig.wings.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * (0.2 + Math.sin(this.time * 14 + e.id) * 0.55)));

    // Facing: along the path while walking, otherwise toward the target.
    const target = findEntity(state, e.targetId);
    let desired: number | null = null;
    if (walking && Math.hypot(dx, dz) > 0.001) desired = Math.atan2(dx, dz);
    else if (target) desired = Math.atan2(toX(target.x) - v.x, toZ(target.y) - v.z);
    if (desired !== null) v.facing = angleLerp(v.facing, desired, Math.min(1, dt * 10));
    if (rig.turret) rig.turret.rotation.y = v.facing;
    else rig.root.rotation.y = v.facing;

    // Arms: attack animation, aiming, or a light swing while walking.
    v.attackT = Math.max(0, v.attackT - dt);
    const p = v.attackT > 0 ? 1 - v.attackT / v.attackDur : 0;
    const pulse = v.attackT > 0 ? Math.sin(Math.PI * p) : 0;
    const aiming = !!target && edgeDistance(e, target) <= e.stats.range + 0.5 && e.active;
    const aim = rig.aimPose ?? 0;
    let r = 0;
    let l = 0;
    switch (rig.attack) {
      case 'swing':
      case 'spin':
        r = -2.3 * pulse;
        l = aiming ? -0.5 : 0;
        break;
      case 'shoot':
        r = l = aiming ? aim + 0.35 * pulse : 0;
        break;
      case 'throw':
        r = l = aim + 2.2 * pulse;
        break;
    }
    if (v.walk > 0 && !aiming && rig.attack !== 'throw') {
      r += -Math.sin(v.phase) * 0.6 * v.walk;
      l += Math.sin(v.phase) * 0.6 * v.walk;
    }
    if (rig.armR) rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, r, Math.min(1, dt * 18));
    if (rig.armL) rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, l, Math.min(1, dt * 18));
    rig.body.rotation.y = rig.attack === 'spin' && v.attackT > 0 ? p * Math.PI * 2 : 0;

    // Sleeping king leans back until it wakes up.
    if (e.kind === 'tower' && e.type === 'king' && rig.turret) rig.turret.rotation.x = e.active ? 0 : -0.25;
  }

  // --- Projectiles ------------------------------------------------------------

  private makeShot(p: Projectile): THREE.Object3D {
    switch (p.source) {
      case 'fireball': {
        const f = fireballProp();
        f.scale.setScalar(1.6);
        return f;
      }
      case 'arrows': {
        const volley = group();
        for (let i = 0; i < 9; i++) {
          const a = arrowProp();
          a.position.set(Math.cos(i * 2.4) * (0.4 + (i % 3) * 0.9), 0, Math.sin(i * 2.4) * (0.4 + (i % 3) * 0.9));
          a.rotation.x = Math.PI / 2;
          volley.add(a);
        }
        return volley;
      }
      case 'archers':
      case 'princess': {
        const a = group(arrowProp());
        a.children[0].rotation.x = Math.PI / 2;
        a.scale.setScalar(0.7);
        return a;
      }
      case 'babydragon':
        return part(G.sphere(), toon(0xff9a2a, 0xff6a00), { s: 0.22 });
      case 'bomber':
        return group(part(G.sphere(), toon(PAL.black), { s: 0.2 }), part(G.sphere(), toon(0xffb020, 0xff7a00), { p: [0, 0.22, 0], s: 0.06 }));
      case 'musketeer':
        return part(G.sphere(), toon(0x333333), { s: 0.08 });
      default:
        return part(G.sphere(), toon(PAL.black), { s: 0.18 });
    }
  }

  private updateShots(projectiles: Projectile[], dt: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let s = this.shots.get(p.id);
      if (!s) {
        const obj = this.makeShot(p);
        const x = toX(p.x);
        const z = toZ(p.y);
        s = { obj, x, z, sx: x, sz: z, h0: p.isSpell ? 6 : SHOOTER_HEIGHT[p.source] ?? 0.9, arc: p.isSpell ? 5 : p.source === 'bomber' ? 1.5 : 0 };
        this.shots.set(p.id, s);
        this.dynamic.add(obj);
      }
      const nx = toX(p.x);
      const nz = toZ(p.y);
      const px = s.x;
      const pz = s.z;
      const f = Math.min(1, dt * 20);
      s.x += (nx - s.x) * f;
      s.z += (nz - s.z) * f;
      const total = Math.hypot(toX(p.tx) - s.sx, toZ(p.ty) - s.sz) || 1;
      const left = Math.hypot(toX(p.tx) - s.x, toZ(p.ty) - s.z);
      const prog = THREE.MathUtils.clamp(1 - left / total, 0, 1);
      const endH = p.isSpell ? 0.3 : 0.7;
      const y = THREE.MathUtils.lerp(s.h0, endH, prog) + Math.sin(Math.PI * prog) * s.arc;
      const prevY = s.obj.position.y;
      s.obj.position.set(s.x, y, s.z);
      if (p.source === 'archers' || p.source === 'princess' || p.source === 'arrows') {
        s.obj.lookAt(s.x + (s.x - px), y + (y - prevY), s.z + (s.z - pz));
      } else if (p.isSpell) {
        s.obj.rotation.y += dt * 4;
      }
    }
    for (const [id, s] of this.shots) {
      if (!seen.has(id)) {
        this.dynamic.remove(s.obj);
        this.shots.delete(id);
      }
    }
  }

  // --- Events & effects -------------------------------------------------------

  handleEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'attack': {
          const v = this.views.get(ev.id);
          if (v) {
            v.attackDur = v.rig.attack === 'spin' ? 0.45 : 0.3;
            v.attackT = v.attackDur;
          }
          break;
        }
        case 'hit':
          if (this.sparksThisFrame++ < 6) this.spawnSpark(toX(ev.x), toZ(ev.y));
          break;
        case 'explosion':
          this.spawnExplosion(toX(ev.x), toZ(ev.y), ev.radius);
          break;
        case 'death':
          if (ev.kind === 'tower') {
            this.spawnRubble(toX(ev.x), toZ(ev.y));
            this.spawnPuff(toX(ev.x), toZ(ev.y), 2.5, 14);
            this.shake = 0.45;
          } else {
            this.spawnPuff(toX(ev.x), toZ(ev.y), 0.6, 5);
          }
          break;
        case 'deploy':
          this.spawnRing(toX(ev.x), toZ(ev.y), 1.6, TEAM[ev.side].main, 0.5);
          break;
      }
    }
  }

  private addEffect(obj: THREE.Object3D, dur: number, step: (p: number) => void): void {
    this.dynamic.add(obj);
    this.effects.push({ obj, t: 0, dur, step });
    step(0);
  }

  private updateEffects(dt: number): void {
    this.effects = this.effects.filter((e) => {
      e.t += dt;
      const p = Math.min(1, e.t / e.dur);
      e.step(p);
      if (p >= 1) {
        this.disposeEffect(e);
        return false;
      }
      return true;
    });
  }

  private disposeEffect(e: Effect): void {
    this.dynamic.remove(e.obj);
    e.obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as THREE.MeshBasicMaterial).transparent) m.dispose();
    });
  }

  private fading(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  }

  private spawnRing(x: number, z: number, radius: number, color: number, dur: number): void {
    const mat = this.fading(color, 0.8);
    const ring = part(G.ring(), mat, { r: [-Math.PI / 2, 0, 0], p: [x, 0.05, z], shadow: false });
    this.addEffect(ring, dur, (p) => {
      ring.scale.setScalar(radius * (0.3 + p * 0.9));
      mat.opacity = 0.8 * (1 - p);
    });
  }

  private spawnSpark(x: number, z: number): void {
    const mat = this.fading(0xfff3b0, 0.9);
    const s = part(G.sphere(), mat, { p: [x, 0.8, z], shadow: false });
    this.addEffect(s, 0.15, (p) => {
      s.scale.setScalar(0.15 + p * 0.3);
      mat.opacity = 0.9 * (1 - p);
    });
  }

  private spawnPuff(x: number, z: number, size: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const mat = this.fading(0xf1f1f1, 0.85);
      const a = (i / count) * Math.PI * 2;
      const s = part(G.sphere(), mat, { p: [x, 0.4, z], shadow: false });
      this.addEffect(s, 0.5 + Math.random() * 0.2, (p) => {
        const r = size * 0.9 * p;
        s.position.set(x + Math.cos(a) * r, 0.4 + p * size * 0.6, z + Math.sin(a) * r);
        s.scale.setScalar(size * 0.35 * (1 - p * 0.5));
        mat.opacity = 0.85 * (1 - p);
      });
    }
  }

  private spawnExplosion(x: number, z: number, radius: number): void {
    const core = this.fading(0xffb347, 0.95);
    const ball = part(G.sphere(), core, { p: [x, 0.5, z], shadow: false });
    this.addEffect(ball, 0.45, (p) => {
      ball.scale.setScalar(radius * (0.3 + p * 0.8));
      core.opacity = 0.95 * (1 - p);
      core.color.setHex(p < 0.4 ? 0xfff0a0 : 0xff7a1a);
    });
    this.spawnRing(x, z, radius * 1.1, 0xff8a2a, 0.45);
    this.spawnPuff(x, z, radius * 0.6, 8);
    if (radius >= 2) this.shake = Math.max(this.shake, 0.2);
  }

  private spawnRubble(x: number, z: number): void {
    const rubble = group();
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;
      const s = 0.3 + Math.random() * 0.45;
      rubble.add(part(G.box(), toon(i % 3 ? PAL.stone : PAL.stoneDark), { p: [Math.cos(a) * r, s / 3, Math.sin(a) * r], s, r: [Math.random(), Math.random(), Math.random()] }));
    }
    rubble.position.set(x, 0, z);
    this.dynamic.add(rubble);
  }

  // --- Placement helpers --------------------------------------------------------

  /** Tints the tiles where `blocked(x, y)` is true; pass null to hide. */
  setDeployOverlay(blocked: ((x: number, y: number) => boolean) | null): void {
    if (!blocked) {
      this.deployTiles.visible = false;
      return;
    }
    const m = new THREE.Matrix4();
    let n = 0;
    for (let ty = 0; ty < ARENA_H; ty++) {
      for (let tx = 0; tx < ARENA_W; tx++) {
        if (!blocked(tx + 0.5, ty + 0.5)) continue;
        m.makeTranslation(toX(tx + 0.5), 0.04, toZ(ty + 0.5));
        this.deployTiles.setMatrixAt(n++, m);
      }
    }
    this.deployTiles.count = n;
    this.deployTiles.instanceMatrix.needsUpdate = true;
    this.deployTiles.visible = true;
  }

  setGhost(g: { x: number; y: number; radius: number; ok: boolean } | null): void {
    if (!g) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    this.ghost.position.set(toX(g.x), 0.06, toZ(g.y));
    this.ghost.scale.setScalar(g.radius);
    this.ghostMat.color.setHex(g.ok ? 0xffffff : 0xe11d48);
  }

  // --- Coordinate conversion ----------------------------------------------------

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * VIEW_W, y: ((1 - v.y) / 2) * VIEW_H };
  }

  /** Phaser pointer → arena (core) coordinates on the ground, or null if it misses the arena. */
  screenToArena(px: number, py: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((px / VIEW_W) * 2 - 1, 1 - (py / VIEW_H) * 2);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    const x = hit.x + ARENA_W / 2;
    const y = hit.z + ARENA_H / 2;
    if (x < 0 || x >= ARENA_W || y < 0 || y >= ARENA_H) return null;
    return { x, y };
  }
}
