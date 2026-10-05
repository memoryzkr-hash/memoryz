import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildBox, buildBurger, buildFries, buildPaper, buildShake, HERO_SPEC, type StackLayer } from './food';

// ---------------------------------------------------------------------------
// Scroll choreography. Each track is a list of [progress, value] keys; values
// ease (smoothstep) between neighbouring keys and hold flat outside them.
// ---------------------------------------------------------------------------

type Val = number | number[];
type Track = [number, Val][];

const LIGHT = [0xec / 255, 0xe6 / 255, 0xdc / 255];
const DARK = [0x0f / 255, 0x0d / 255, 0x0c / 255];

const ease = (t: number) => t * t * (3 - 2 * t);

function sample(track: Track, p: number): Val {
  if (p <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [p1, v1] = track[i];
    if (p <= p1) {
      const [p0, v0] = track[i - 1];
      const t = ease((p - p0) / Math.max(1e-6, p1 - p0));
      if (typeof v0 === 'number') return v0 + ((v1 as number) - v0) * t;
      return v0.map((a, k) => a + ((v1 as number[])[k] - a) * t);
    }
  }
  return track[track.length - 1][1];
}

const num = (t: Track, p: number) => sample(t, p) as number;
const vec = (t: Track, p: number) => sample(t, p) as number[];

/** Burger slot inside the box, and the closed-lid "podium" on top of it. */
const SLOT = [-1.36, 0.06, 0.1];

const TRACKS = {
  bg: [
    [0.12, LIGHT],
    [0.22, DARK],
  ] as Track,
  explode: [
    [0.05, 1],
    [0.22, 0],
  ] as Track,
  paper: [
    [0.17, 0],
    [0.25, 1],
    [0.53, 1],
    [0.58, 0],
  ] as Track,
  idle: [
    [0.5, 1],
    [0.58, 0],
  ] as Track,
  spin: [
    [0, 0],
    [0.24, 2.4],
    [0.47, 3.6],
    [0.62, 5.2],
  ] as Track,
  burgerPos: [
    [0.53, [0, 0, 0]],
    [0.585, [-0.7, 1.9, 0.05]],
    [0.63, SLOT],
    [0.86, SLOT],
    [0.895, [-0.8, 2.9, 0.2]],
    [0.93, [0, 2.2, 0]],
    [0.955, [0, 1.12, 0]],
  ] as Track,
  burgerScale: [
    [0.53, 1],
    [0.63, 0.72],
    [0.86, 0.72],
    [0.95, 0.82],
  ] as Track,
  boxX: [
    [0.52, 16],
    [0.62, 0],
  ] as Track,
  lid: [
    [0.88, 1],
    [0.945, 0],
  ] as Track,
  fries: [
    [0.86, [0.45, 0.05, 0.25]],
    [0.9, [-1.8, 2.2, 0.9]],
    [0.95, [-3.4, 0, 0.7]],
  ] as Track,
  shake: [
    [0.86, [1.66, 0.05, 0.05]],
    [0.9, [2.8, 2.4, 0.7]],
    [0.95, [3.4, 0, 0.7]],
  ] as Track,
  camPos: [
    [0.0, [0.4, 3.5, 15]],
    [0.12, [2.2, 4.0, 14.6]],
    [0.24, [4.6, 2.5, 8.4]],
    [0.36, [5.2, 2.2, 7.6]],
    [0.47, [-3.6, 1.25, 6.2]],
    [0.55, [-3.9, 1.4, 5.9]],
    [0.64, [0.9, 8.8, 10.8]],
    [0.72, [0.2, 8.4, 11.2]],
    [0.8, [3.6, 2.2, 4.2]],
    [0.87, [3.4, 2.3, 4.5]],
    [0.96, [0, 3.8, 16.5]],
    [1, [0, 4.1, 17.2]],
  ] as Track,
  camTarget: [
    [0.0, [0, 3.2, 0]],
    [0.12, [0, 3.2, 0]],
    [0.24, [0, 1.0, 0]],
    [0.36, [0, 1.0, 0]],
    [0.47, [0, 0.8, 0]],
    [0.55, [0, 0.8, 0]],
    [0.64, [0.1, 0.35, 0]],
    [0.72, [0.1, 0.35, 0]],
    [0.8, [1.66, 1.4, 0.05]],
    [0.87, [1.66, 1.4, 0.05]],
    [0.96, [0, 1.35, 0]],
  ] as Track,
  /** Screen-space offset of the subject (fraction of viewport): +x right, +y up. */
  shift: [
    [0.0, [0.17, 0]],
    [0.12, [0.17, 0]],
    [0.24, [0.2, 0]],
    [0.36, [0.2, 0]],
    [0.47, [-0.2, 0]],
    [0.55, [-0.2, 0]],
    [0.64, [-0.19, 0.02]],
    [0.72, [-0.19, 0.02]],
    [0.8, [0.22, 0]],
    [0.87, [0.22, 0]],
    [0.96, [0, -0.23]],
  ] as Track,
  mshift: [
    [0.0, [-0.17, -0.09]],
    [0.12, [-0.17, -0.09]],
    [0.24, [0, 0.16]],
    [0.87, [0, 0.16]],
    [0.96, [0, -0.06]],
  ] as Track,
  /** Extra camera distance on narrow screens, per chapter. */
  mzoom: [
    [0.0, 1.12],
    [0.12, 1.12],
    [0.24, 1.05],
    [0.36, 1.05],
    [0.47, 1.6],
    [0.55, 1.6],
    [0.64, 1.15],
    [0.72, 1.15],
    [0.8, 1.55],
    [0.87, 1.55],
    [0.96, 1.2],
  ] as Track,
};

export interface FrameInfo {
  progress: number;
  /** 0 = light background, 1 = dark. */
  darkness: number;
}

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private burger = buildBurger(HERO_SPEC, 3);
  private box = buildBox();
  private fries = buildFries();
  private shake = buildShake();
  private paper = buildPaper();
  private floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private fog = new THREE.Fog(0xffffff, 16, 42);
  private bg = new THREE.Color();
  private target = 0;
  private progress = 0;
  private idleAngle = 0;
  private timer = new THREE.Timer();
  private running = false;
  private labels: { el: HTMLElement; layer: StackLayer; midY: number }[] = [];
  private tmp = new THREE.Vector3();
  private right = new THREE.Vector3();
  onFrame: (info: FrameInfo) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLElement,
  ) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.fog = this.fog;

    this.scene.add(new THREE.HemisphereLight(0xfff3e6, 0x3a2a20, 0.45));
    const key = new THREE.DirectionalLight(0xfff0dc, 3);
    key.position.set(-5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a4a, 2.4);
    rim.position.set(5, 4, -7);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffe2c4, 1.2);
    rim2.position.set(-6, 3, -5);
    this.scene.add(rim2);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, envMapIntensity: 0.1 }),
    );
    this.floor.receiveShadow = true;
    this.scene.add(this.floor, this.paper, this.burger.group, this.box.group);
    this.box.group.add(this.fries, this.shake);

    // Measure each labelled layer at rest so tags point at its middle.
    for (const layer of this.burger.layers) {
      if (!layer.label) continue;
      const b = new THREE.Box3().setFromObject(layer.object);
      const el = document.createElement('div');
      el.className = 'tag';
      el.innerHTML = `<span class="tag__line"></span><span class="tag__dot"></span><span class="tag__text">${layer.label}</span>`;
      labelLayer.appendChild(el);
      this.labels.push({ el, layer, midY: (b.min.y + b.max.y) / 2 - layer.object.position.y });
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.update(0, 0);
  }

  get domElement(): HTMLCanvasElement {
    return this.canvas;
  }

  setProgress(p: number): void {
    this.target = Math.min(1, Math.max(0, p));
  }

  /** Snap without easing (e.g. after a hash jump). */
  jump(p: number): void {
    this.setProgress(p);
    this.progress = this.target;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer.update();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.timer.update(now);
      const raw = this.timer.getDelta();
      // Easing uses the real frame time so slow devices still settle quickly;
      // idle motion uses a capped step so a hitch never causes a jump.
      this.progress += (this.target - this.progress) * (1 - Math.exp(-Math.min(raw, 0.5) * 6));
      this.update(this.progress, Math.min(0.05, raw));
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, w < 700 ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.update(this.progress, 0);
  }

  private update(p: number, dt: number): void {
    const t = this.timer.getElapsed();
    const narrow = this.camera.aspect < 0.95;

    // Background, floor and fog share one colour so the set has no horizon.
    const dark = num([[0.12, 0], [0.22, 1]], p);
    const c = vec(TRACKS.bg, p);
    this.bg.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    this.renderer.setClearColor(this.bg);
    this.fog.color.copy(this.bg);
    this.floor.material.color.copy(this.bg).multiplyScalar(dark > 0.5 ? 1.25 : 0.93);
    
    // Burger.
    const explode = num(TRACKS.explode, p);
    this.idleAngle += dt * 0.35 * num(TRACKS.idle, p);
    this.burger.setExplode(explode, t);
    const bp = vec(TRACKS.burgerPos, p);
    this.burger.group.position.set(bp[0], bp[1] + Math.sin(t * 1.4) * 0.04 * explode, bp[2]);
    this.burger.group.scale.setScalar(num(TRACKS.burgerScale, p));
    this.burger.group.rotation.y = num(TRACKS.spin, p) + this.idleAngle;

    const paper = num(TRACKS.paper, p);
    this.paper.visible = paper > 0.01;
    (this.paper.material as THREE.MeshStandardMaterial).opacity = paper;
    this.paper.scale.setScalar(0.85 + paper * 0.15);

    // Box, sides.
    this.box.group.position.x = num(TRACKS.boxX, p);
    this.box.group.visible = this.box.group.position.x < 15;
    this.box.setLid(num(TRACKS.lid, p));
    const fp = vec(TRACKS.fries, p);
    this.fries.position.set(fp[0], fp[1], fp[2]);
    const sp = vec(TRACKS.shake, p);
    this.shake.position.set(sp[0], sp[1], sp[2]);
    this.shake.rotation.y = t * 0.2;
    if (narrow && p > 0.9) {
      // No room for a wide line-up on a phone: tuck the sides in front of the box.
      const k = Math.min(1, (p - 0.9) / 0.05);
      this.fries.position.x *= 1 - 0.45 * k;
      this.fries.position.z += 1.4 * k;
      this.shake.position.x *= 1 - 0.45 * k;
      this.shake.position.z += 1.4 * k;
    }

    // Camera.
    const target = vec(TRACKS.camTarget, p);
    const pos = vec(TRACKS.camPos, p);
    let k = 1;
    if (narrow) k = Math.min(2.1, 0.78 / this.camera.aspect) * num(TRACKS.mzoom, p);
    else if (this.camera.aspect < 1.35) k = 1.18;
    // Pulling the camera back on phones must not push the set into the fog.
    this.fog.near = 16 * k;
    this.fog.far = 42 * k;
    this.camera.position.set(
      target[0] + (pos[0] - target[0]) * k,
      target[1] + (pos[1] - target[1]) * k,
      target[2] + (pos[2] - target[2]) * k,
    );
    // A slow drift keeps the frame alive when the reader stops scrolling.
    this.camera.position.x += Math.sin(t * 0.3) * 0.15;
    this.camera.position.y += Math.cos(t * 0.25) * 0.08;
    this.camera.lookAt(target[0], target[1], target[2]);

    const shift = vec(narrow ? TRACKS.mshift : TRACKS.shift, p);
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    this.camera.setViewOffset(w, h, -shift[0] * w, shift[1] * h, w, h);
    this.camera.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
    this.placeLabels(p, explode);
    this.onFrame({ progress: p, darkness: dark });
  }

  /** Callout tags for "THE STACK": dot on the layer's edge, leader line, text in a column. */
  private placeLabels(p: number, explode: number): void {
    const vis = Math.min(1, Math.max(0, (explode - 0.7) / 0.3)) * Math.min(1, Math.max(0, (0.1 - p) / 0.04));
    this.labelLayer.style.opacity = String(vis);
    if (vis <= 0) return;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const scale = this.burger.group.scale.x;
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const pts = this.labels.map((l) => {
      this.tmp.set(0, l.layer.object.position.y + l.midY, 0);
      this.burger.group.localToWorld(this.tmp);
      this.tmp.addScaledVector(this.right, 1.3 * scale);
      this.tmp.project(this.camera);
      return { x: (this.tmp.x * 0.5 + 0.5) * W, y: (-this.tmp.y * 0.5 + 0.5) * H };
    });
    const narrow = W < 700;
    const colX = Math.min(Math.max(...pts.map((q) => q.x)) + (narrow ? 22 : 70), W - (narrow ? 118 : 230));
    this.labels.forEach((l, i) => {
      const q = pts[i];
      const len = Math.max(8, colX - q.x);
      l.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
      l.el.style.setProperty('--len', `${len.toFixed(1)}px`);
    });
  }
}
