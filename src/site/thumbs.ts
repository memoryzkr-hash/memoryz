import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildBurger, buildFries, buildShake, HERO_SPEC, type LayerKind } from './food';

type Spec = { kind: LayerKind }[];

const k = (...kinds: LayerKind[]): Spec => kinds.map((kind) => ({ kind }));

/** What each menu card shows, keyed by the card's data-thumb attribute. */
const SUBJECTS: Record<string, { build: () => THREE.Object3D; backdrop: [string, string]; view?: number }> = {
  jab: {
    build: () => buildBurger(k('heel', 'sauce', 'pickles', 'patty', 'cheese', 'onions', 'crown'), 21).group,
    backdrop: ['#3a302a', '#110f0e'],
  },
  uppercut: { build: () => buildBurger(HERO_SPEC, 3).group, backdrop: ['#4a1a10', '#140807'] },
  haymaker: {
    build: () =>
      buildBurger(k('heel', 'sauce', 'patty', 'cheese', 'patty', 'cheese', 'patty', 'cheese', 'bacon', 'onions', 'crown'), 41)
        .group,
    backdrop: ['#2f2b28', '#0d0c0c'],
  },
  southpaw: {
    build: () => buildBurger(k('heel', 'sauce', 'lettuce', 'tomato', 'chicken', 'pickles', 'sauce', 'crown'), 55).group,
    backdrop: ['#3b2a14', '#120d07'],
  },
  fries: {
    build: () => {
      const g = new THREE.Group();
      const a = buildFries(4, true);
      a.position.x = -0.65;
      a.rotation.y = 0.3;
      const b = buildFries(9);
      b.position.set(0.85, 0, -0.6);
      b.rotation.y = -0.4;
      g.add(a, b);
      return g;
    },
    backdrop: ['#55180d', '#170606'],
  },
  shakes: {
    build: () => {
      const g = new THREE.Group();
      const a = buildShake(6, 'cookies');
      a.position.x = -0.8;
      const b = buildShake(8, 'strawberry');
      b.position.set(0.85, 0, -0.5);
      g.add(a, b);
      return g;
    },
    backdrop: ['#3d2a30', '#120c0e'],
  },
};

function backdrop(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 150, 20, 256, 200, 380);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 384);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Renders a studio "photo" of every menu item with an off-screen renderer and
 * returns them as image URLs, yielding between shots so the loader keeps animating.
 */
export async function renderThumbs(ids: string[], onProgress: (f: number) => void): Promise<Record<string, string>> {
  const W = 960;
  const H = 720;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i++) {
    const subject = SUBJECTS[ids[i]];
    if (!subject) continue;
    const scene = new THREE.Scene();
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    scene.background = backdrop(...subject.backdrop);

    const key = new THREE.SpotLight(0xfff0dc, 260, 40, 0.5, 0.7);
    key.position.set(-4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xff8a4a, 2.6);
    rim.position.set(5, 4, -6);
    scene.add(rim, new THREE.HemisphereLight(0xfff3e6, 0x2a1d17, 0.5));

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.55 }),
    );
    floor.receiveShadow = true;
    scene.add(floor);

    const obj = subject.build();
    obj.rotation.y += 0.5;
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    key.target.position.copy(center);

    const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
    const fit = Math.max(size.y * 1.25, (size.x * 1.15) / cam.aspect, 2.6);
    const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    cam.position.set(center.x + dist * 0.42, center.y + dist * 0.36, center.z + dist * 0.85);
    cam.lookAt(center.x, center.y - size.y * 0.04, center.z);
    renderer.render(scene, cam);
    out[ids[i]] = renderer.domElement.toDataURL('image/jpeg', 0.86);

    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    (scene.background as THREE.Texture).dispose();
    onProgress((i + 1) / ids.length);
    await new Promise((r) => requestAnimationFrame(r));
  }
  env.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
