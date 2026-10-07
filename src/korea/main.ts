import './korea.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * "대한민국, 지금" — a 42-second 3D motion piece. Everything is a pure function of time `t`,
 * so the same code plays live in the browser and renders frame-exact video (?capture).
 */

export const DURATION = 42;

const RED = new THREE.Color('#cd2e3a');
const BLUE = new THREE.Color('#0047a0');
const GOLD = new THREE.Color('#ffcf5a');
const CYAN = new THREE.Color('#5fd4ff');

// Sources: 국가데이터처 2025 출생·사망통계(잠정), 연간 수출입동향, 행안부 주민등록 인구통계, 장래인구추계.
const EXPORTS = [
  { year: 2021, value: 6444 },
  { year: 2022, value: 6836 },
  { year: 2023, value: 6322 },
  { year: 2024, value: 6838 },
  { year: 2025, value: 7097 },
];
const SEMI_SHARE_2025 = 1734 / 7097;
const TFR = [
  [2015, 1.24],
  [2016, 1.17],
  [2017, 1.05],
  [2018, 0.98],
  [2019, 0.92],
  [2020, 0.84],
  [2021, 0.81],
  [2022, 0.78],
  [2023, 0.72],
  [2024, 0.75],
  [2025, 0.8],
] as const;
const ELDER_NOW = 21;
const ELDER_2050 = 40;

// Scene windows (seconds).
const S = {
  intro: [0, 7],
  exports: [7, 16],
  tfr: [16, 26],
  elder: [26, 35],
  outro: [35, DURATION],
} as const;

// ---------- math helpers ----------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const backOut = (x: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const inWindow = (t: number, [a, b]: readonly [number, number], pad = 0.6) => t >= a - pad && t <= b + pad;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- renderer ----------
const capture = new URLSearchParams(location.search).has('capture');
if (capture) document.body.classList.add('capture');

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070f');
scene.fog = new THREE.FogExp2('#05070f', 0.018);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.AmbientLight('#8090c0', 0.55));
const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(6, 12, 8);
scene.add(key);
const rim = new THREE.PointLight('#4f7dff', 60, 60);
rim.position.set(-10, 6, -8);
scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- starfield ----------
const stars = (() => {
  const r = rng(7);
  const n = 2600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const rad = 60 + r() * 120;
    const s = Math.sqrt(1 - u * u);
    pos.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: '#9fb4ff', size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.7, fog: false });
  const p = new THREE.Points(g, m);
  scene.add(p);
  return p;
})();

// ---------- taegeuk ----------
const R = 3;
const emblem = new THREE.Group();
emblem.scale.setScalar(0.72);
scene.add(emblem);

function taegeukShapes(r: number) {
  const red = new THREE.Shape();
  red.moveTo(r, 0);
  red.absarc(0, 0, r, 0, Math.PI, false);
  red.absarc(-r / 2, 0, r / 2, Math.PI, Math.PI * 2, false);
  red.absarc(r / 2, 0, r / 2, Math.PI, 0, true);
  const blue = new THREE.Shape();
  blue.moveTo(-r, 0);
  blue.absarc(0, 0, r, Math.PI, Math.PI * 2, false);
  blue.absarc(r / 2, 0, r / 2, 0, Math.PI, false);
  blue.absarc(-r / 2, 0, r / 2, 0, -Math.PI, true);
  return { red, blue };
}

function isRed(x: number, y: number) {
  const inLeft = Math.hypot(x + R / 2, y) < R / 2;
  const inRight = Math.hypot(x - R / 2, y) < R / 2;
  return inLeft || (y > 0 && !inRight);
}

const taegeuk = (() => {
  const group = new THREE.Group();
  const { red, blue } = taegeukShapes(R);
  const extrude = { depth: 0.5, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 4, curveSegments: 64 };
  const mats: THREE.MeshStandardMaterial[] = [];
  for (const [shape, color] of [
    [red, RED],
    [blue, BLUE],
  ] as const) {
    const geo = new THREE.ExtrudeGeometry(shape, extrude);
    geo.translate(0, 0, -0.25);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.35, roughness: 0.3, transparent: true });
    mats.push(mat);
    group.add(new THREE.Mesh(geo, mat));
  }
  // Glow ring
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, 0.025, 8, 160), ringMat);
  group.add(ring);

  // Trigrams 건 ☰, 곤 ☷, 감 ☵, 리 ☲ — solid=1, broken=0, listed outer→inner.
  const trigramMat = new THREE.MeshStandardMaterial({ color: '#dfe5f7', emissive: '#c8d4ff', emissiveIntensity: 0.12, metalness: 0.2, roughness: 0.4, transparent: true });
  const trigrams: THREE.Group[] = [];
  const defs: [number, number[]][] = [
    [(3 * Math.PI) / 4, [1, 1, 1]], // 건, upper-left
    [-Math.PI / 4, [0, 0, 0]], // 곤, lower-right
    [Math.PI / 4, [0, 1, 0]], // 감, upper-right
    [(-3 * Math.PI) / 4, [1, 0, 1]], // 리, lower-left
  ];
  const L = 2.1;
  const H = 0.26;
  for (const [angle, bars] of defs) {
    const tg = new THREE.Group();
    bars.forEach((solid, i) => {
      const y = (1 - i) * (H * 1.9);
      if (solid) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.22), trigramMat);
        m.position.y = y;
        tg.add(m);
      } else {
        for (const sx of [-1, 1]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(L * 0.44, H, 0.22), trigramMat);
          m.position.set((sx * L * 0.56) / 2, y, 0);
          tg.add(m);
        }
      }
    });
    tg.userData.angle = angle;
    tg.rotation.z = angle - Math.PI / 2;
    trigrams.push(tg);
    group.add(tg);
  }
  emblem.add(group);
  return { group, mats, ring, ringMat, trigrams, trigramMat };
})();

// Particles that assemble into the taegeuk.
const swarm = (() => {
  const r = rng(11);
  const n = 5000;
  const start = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const rad = 14 + r() * 26;
    const s = Math.sqrt(1 - u * u);
    start.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3);
    const rr = R * Math.sqrt(r());
    const a = r() * Math.PI * 2;
    const x = rr * Math.cos(a);
    const y = rr * Math.sin(a);
    target.set([x, y, (r() - 0.5) * 0.5], i * 3);
    const c = isRed(x, y) ? RED : BLUE;
    const glow = 1.4 + r() * 0.8;
    colors.set([c.r * glow, c.g * glow, c.b * glow], i * 3);
    phase[i] = r();
  }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(g, m);
  emblem.add(points);
  return { points, start, target, phase, n, pos, mat: m };
})();

function updateSwarm(k: number, swirl: number, t: number) {
  const { start, target, phase, n, pos } = swarm;
  for (let i = 0; i < n; i++) {
    const e = easeInOut(clamp01(k * 1.25 - phase[i] * 0.25));
    const i3 = i * 3;
    const sx = start[i3];
    const sy = start[i3 + 1];
    const sz = start[i3 + 2];
    // Swirl the cloud while it travels in.
    const ang = (1 - e) * swirl + t * 0.15 * (1 - e);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rx = sx * ca - sz * sa;
    const rz = sx * sa + sz * ca;
    pos[i3] = lerp(rx, target[i3], e);
    pos[i3 + 1] = lerp(sy, target[i3 + 1], e);
    pos[i3 + 2] = lerp(rz, target[i3 + 2], e);
  }
  swarm.points.geometry.attributes.position.needsUpdate = true;
}

// ---------- exports: wafer + towers ----------
const exportsScene = (() => {
  const group = new THREE.Group();

  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(512, 512, 40, 512, 512, 512);
    grad.addColorStop(0, '#2a3460');
    grad.addColorStop(0.6, '#141a36');
    grad.addColorStop(1, '#0a0d1e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(120,170,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 1024);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(1024, i);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const waferR = 7;
  const waferTop = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.85, roughness: 0.28, emissive: '#1b2a66', emissiveIntensity: 0.35 });
  const waferSide = new THREE.MeshStandardMaterial({ color: '#8090b8', metalness: 0.9, roughness: 0.25 });
  const wafer = new THREE.Mesh(new THREE.CylinderGeometry(waferR, waferR, 0.3, 128), [waferSide, waferTop, waferSide]);
  wafer.position.y = -0.15;
  group.add(wafer);

  // Die blocks that twinkle like a busy fab.
  const r = rng(23);
  const dies: THREE.Vector3[] = [];
  for (let x = -6.4; x <= 6.4; x += 0.8) {
    for (let z = -6.4; z <= 6.4; z += 0.8) {
      if (Math.hypot(x, z) < waferR - 0.6 && Math.abs(z) > 1.1) dies.push(new THREE.Vector3(x, 0.05, z));
    }
  }
  const dieMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.6, 0.1, 0.6),
    new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.6, roughness: 0.35 }),
    dies.length,
  );
  const diePhase = dies.map(() => r());
  const m4 = new THREE.Matrix4();
  dies.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    dieMesh.setMatrixAt(i, m4);
    dieMesh.setColorAt(i, new THREE.Color('#203060'));
  });
  group.add(dieMesh);

  // Towers.
  const scale = 0.0011; // 7,097억 달러 → 7.8 units, baseline at zero.
  const towers = EXPORTS.map((d, i) => {
    const last = i === EXPORTS.length - 1;
    const h = d.value * scale;
    const geo = new THREE.BoxGeometry(0.9, 1, 0.9);
    geo.translate(0, 0.5, 0);
    const color = last ? GOLD : CYAN;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: last ? 0.95 : 0.35,
      metalness: 0.3,
      roughness: 0.25,
      transparent: true,
      opacity: last ? 1 : 0.78,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((i - 2) * 1.55, 0, 0);
    mesh.scale.y = 0.001;
    group.add(mesh);
    // Edge highlight.
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    mesh.add(edges);
    return { mesh, h, ...d };
  });

  // Semiconductor share of 2025 exports, stacked inside the 2025 tower.
  const semiGeo = new THREE.BoxGeometry(0.98, 1, 0.98);
  semiGeo.translate(0, 0.5, 0);
  const semi = new THREE.Mesh(
    semiGeo,
    new THREE.MeshStandardMaterial({ color: '#ff4fc8', emissive: '#ff4fc8', emissiveIntensity: 1.1, metalness: 0.3, roughness: 0.3 }),
  );
  semi.position.copy(towers[4].mesh.position);
  semi.scale.y = 0.001;
  group.add(semi);
  const semiH = towers[4].h * SEMI_SHARE_2025;

  scene.add(group);
  return { group, towers, dieMesh, diePhase, dies, semi, semiH };
})();

// ---------- fertility: 3D line ----------
const tfrScene = (() => {
  const group = new THREE.Group();
  const yScale = 7; // Honest: y = TFR × 7, zero at the floor.
  const pts = TFR.map(([year, v]) => new THREE.Vector3((year - 2020) * 1.35, v * yScale, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tubular = 480;
  const radial = 10;
  const tubeGeo = new THREE.TubeGeometry(curve, tubular, 0.09, radial, false);
  // Colour the decline cool and the rebound warm.
  const col = new Float32Array(tubeGeo.attributes.position.count * 3);
  const posAttr = tubeGeo.attributes.position;
  const minX = (2023 - 2020) * 1.35;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const k = smooth(clamp01((x - minX) / 1.2));
    const c = new THREE.Color().copy(CYAN).lerp(GOLD, k);
    col.set([c.r, c.g, c.b], i * 3);
  }
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.0, metalness: 0.2, roughness: 0.3 });
  tubeMat.onBeforeCompile = (shader) => {
    // Let vertex colour drive the glow so bloom picks it up.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 1.3;',
    );
  };
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.geometry.setDrawRange(0, 0);
  group.add(tube);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  group.add(head);
  const headLight = new THREE.PointLight('#ffffff', 18, 8);
  head.add(headLight);

  // Floor grid + data columns.
  const grid = new THREE.GridHelper(20, 20, '#2a3a70', '#18214a');
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.6;
  group.add(grid);

  const columns = pts.map((p) => {
    const geo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#7f9cff', transparent: true, opacity: 0 }));
    m.position.set(p.x, 0, 0);
    m.scale.y = p.y;
    group.add(m);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
    dot.position.copy(p);
    group.add(dot);
    return { col: m, dot };
  });

  // Arc-length position of each data point along the curve, so things reveal as the head passes.
  const lengths = curve.getLengths(2000);
  const total = lengths[lengths.length - 1];
  // Point i sits at curve parameter i/(n-1); 2000 divisions land exactly on it.
  const tAt = pts.map((_, i) => lengths[(i * 2000) / (pts.length - 1)] / total);

  scene.add(group);
  return { group, curve, tube, head, columns, pts, tubular, radial, yScale, tAt, grid };
})();

// ---------- ageing: 100 people ----------
const elderScene = (() => {
  const group = new THREE.Group();
  const n = 100;
  const body = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.2, 0.42, 6, 14),
    new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.2, roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.12 }),
    n,
  );
  const head = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.17, 18, 12),
    new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.2, roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.12 }),
    n,
  );
  group.add(body, head);

  // Order in which people "turn" 65+: deterministic shuffle so they appear scattered.
  const r = rng(99);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Array<number>(n);
  order.forEach((idx, k) => (rank[idx] = k));
  const spots = Array.from({ length: n }, (_, i) => new THREE.Vector3(((i % 10) - 4.5) * 1.05, 0, (Math.floor(i / 10) - 4.5) * 1.05));
  const jitter = spots.map(() => r());

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 96),
    new THREE.MeshStandardMaterial({ color: '#0c1230', metalness: 0.7, roughness: 0.35, emissive: '#0a1440', emissiveIntensity: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  scene.add(group);
  return { group, body, head, rank, spots, jitter, n };
})();

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const BASE_PERSON = new THREE.Color('#4d5f9a');
const DIM_GOLD = new THREE.Color('#a77c2c');

// ---------- HTML overlay ----------
const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
const counters = {
  exports: document.querySelector<HTMLElement>('[data-count="exports"]')!,
  tfr: document.querySelector<HTMLElement>('[data-count="tfr"]')!,
  year: document.querySelector<HTMLElement>('[data-count="year"]')!,
  elder: document.querySelector<HTMLElement>('[data-count="elder"]')!,
};
const fade = document.getElementById('fade')!;
const labelLayer = document.getElementById('labels')!;

function makeLabel(html: string, cls = '') {
  const el = document.createElement('div');
  el.className = `label ${cls}`;
  el.innerHTML = html;
  labelLayer.appendChild(el);
  return el;
}

const towerLabels = exportsScene.towers.map((tw, i) =>
  makeLabel(`${tw.value.toLocaleString('ko-KR')}<span class="y">${tw.year}</span>`, i === 4 ? 'gold' : ''),
);
const semiLabel = makeLabel('반도체 1,734<span class="y">2025 수출의 24%</span>', '');
semiLabel.style.color = '#ff8ae0';
semiLabel.style.transform = 'translate(0, -50%)';
const tfrLabelIdx = [0, 6, 8, 10];
const tfrLabels = tfrLabelIdx.map((i) => {
  const [year, v] = TFR[i];
  const tag = i === 8 ? ' 최저' : i === 10 ? ' 반등' : '';
  return makeLabel(`${v.toFixed(2)}<span class="y">${year}${tag}</span>`, i >= 9 ? 'gold' : '');
});

const proj = new THREE.Vector3();
function placeLabel(el: HTMLElement, world: THREE.Vector3, opacity: number, lift = 14) {
  proj.copy(world).project(camera);
  const x = (proj.x * 0.5 + 0.5) * innerWidth;
  const y = (-proj.y * 0.5 + 0.5) * innerHeight - lift;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.opacity = proj.z < 1 ? String(opacity) : '0';
}

function cardAlpha(t: number, tin: number, tout: number) {
  return easeOut(seg(t, tin, tin + 0.8)) * (1 - seg(t, tout - 0.6, tout));
}

function updateOverlay(t: number) {
  for (const card of cards) {
    const tin = Number(card.dataset.in);
    const tout = Number(card.dataset.out);
    const a = cardAlpha(t, tin, tout);
    card.style.opacity = String(a);
    card.style.transform = `translateY(${(1 - easeOut(seg(t, tin, tin + 1))) * 24}px)`;
    card.style.visibility = a > 0.001 ? 'visible' : 'hidden';
    for (const child of Array.from(card.querySelectorAll<HTMLElement>('[data-in]'))) {
      const cin = Number(child.dataset.in);
      const ca = easeOut(seg(t, cin, cin + 0.7));
      child.style.opacity = String(ca);
      child.style.transform = `translateY(${(1 - ca) * 10}px)`;
    }
  }

  // Counters.
  const ex = easeOut(seg(t, 8.0, 11.5)) * 7097;
  counters.exports.textContent = Math.round(ex).toLocaleString('ko-KR');
  const el = easeOut(seg(t, 27.6, 30.2)) * ELDER_NOW;
  counters.elder.textContent = String(Math.round(el));

  // Scene fades at cuts.
  const cuts = [S.exports[0], S.tfr[0], S.elder[0], S.outro[0]];
  let f = 1 - seg(t, 0, 1.2); // fade in from black
  for (const c of cuts) f = Math.max(f, 1 - Math.min(1, Math.abs(t - c) / 0.5));
  f = Math.max(f, seg(t, DURATION - 1.2, DURATION));
  fade.style.opacity = String(smooth(f));
}

// ---------- camera ----------
let shift = 0;
function applyShift(s: number) {
  if (Math.abs(s - shift) < 1e-4 && camera.view) return;
  shift = s;
  const w = innerWidth;
  const h = innerHeight;
  camera.setViewOffset(w * (1 + 2 * s), h, 0, 0, w, h);
}

function setCamera(t: number) {
  const target = new THREE.Vector3();
  let s = 0;
  if (t < S.intro[1]) {
    // Fly in to the emblem; it settles above the centred title.
    const k = seg(t, 0, 7);
    const a = lerp(-0.9, 0.2, easeInOut(k));
    const d = lerp(34, 20, easeOut(k));
    camera.position.set(Math.sin(a) * d, lerp(6, 0.4, easeOut(k)) - 2.4, Math.cos(a) * d);
    target.set(0, -2.4, 0);
  } else if (t < S.exports[1]) {
    const k = seg(t, S.exports[0], S.exports[1]);
    s = 0.17;
    const a = lerp(0.9, 0.3, easeInOut(k));
    const d = lerp(21, 18.5, easeInOut(k));
    camera.position.set(Math.sin(a) * d, lerp(10, 6.5, easeInOut(k)), Math.cos(a) * d);
    target.set(0, lerp(3.0, 3.9, easeInOut(k)), 0);
  } else if (t < S.tfr[1]) {
    const k = easeInOut(seg(t, S.tfr[0], S.tfr[1]));
    s = 0.17;
    camera.position.set(lerp(-3.5, 2.5, k), lerp(7.5, 5.8, k), lerp(19, 20.5, k));
    target.set(lerp(-0.8, 0.6, k), 4.4, 0);
  } else if (t < S.elder[1]) {
    const k = seg(t, S.elder[0], S.elder[1]);
    s = 0.17;
    const a = lerp(-0.6, 0.55, easeInOut(k));
    const d = lerp(15.5, 13.5, k);
    camera.position.set(Math.sin(a) * d, lerp(12, 7.5, easeInOut(k)), Math.cos(a) * d);
    target.set(0, 0.2, 0);
  } else {
    const k = seg(t, S.outro[0], DURATION);
    const a = lerp(-0.5, 0.3, easeInOut(k));
    const d = lerp(17, 21, easeOut(k));
    camera.position.set(Math.sin(a) * d, lerp(-3.5, -1.6, k), Math.cos(a) * d);
    target.set(0, -2.4, 0);
  }
  applyShift(s);
  camera.lookAt(target);
}

function tfrProgress(t: number) {
  return easeInOut(seg(t, 17.0, 23.0));
}

// ---------- per-frame ----------
function renderAt(t: number) {
  t = Math.min(Math.max(t, 0), DURATION);
  setCamera(t);
  camera.updateMatrixWorld();
  stars.rotation.y = t * 0.012;

  // Taegeuk: intro and outro.
  const tgVisible = inWindow(t, S.intro) || inWindow(t, S.outro);
  taegeuk.group.visible = tgVisible;
  swarm.points.visible = tgVisible;
  if (tgVisible) {
    const intro = t < S.intro[1] + 1;
    let form: number;
    let solid: number;
    let tri: number;
    let spin: number;
    if (intro) {
      form = seg(t, 0.2, 4.6);
      solid = smooth(seg(t, 3.6, 5.0));
      tri = backOut(seg(t, 4.4, 5.8));
      spin = lerp(-1.4, 0, easeOut(seg(t, 0, 5.4)));
      updateSwarm(form, 3.2, t);
    } else {
      // Outro: the swarm bursts back in from wider, the emblem reforms.
      const k = seg(t, S.outro[0], S.outro[0] + 3.4);
      form = k;
      solid = smooth(seg(t, S.outro[0] + 2.2, S.outro[0] + 3.6));
      tri = backOut(seg(t, S.outro[0] + 3.0, S.outro[0] + 4.2));
      spin = lerp(1.2, 0, easeOut(k));
      updateSwarm(form, -2.6, t);
    }
    swarm.mat.opacity = 1 - solid * 0.88;
    for (const m of taegeuk.mats) {
      m.opacity = solid;
      m.emissiveIntensity = 0.55 + 0.25 * Math.sin(t * 2.2);
    }
    taegeuk.ringMat.opacity = solid * 0.7;
    taegeuk.ring.scale.setScalar(1 + 0.03 * Math.sin(t * 3));
    taegeuk.group.rotation.set(Math.sin(t * 0.6) * 0.08, spin + Math.sin(t * 0.4) * 0.1, spin * 0.6);
    taegeuk.trigramMat.opacity = clamp01(tri);
    for (const tg of taegeuk.trigrams) {
      const a = tg.userData.angle as number;
      const dist = lerp(9, 5.0, Math.min(tri, 1.1));
      tg.position.set(Math.cos(a) * dist, Math.sin(a) * dist, Math.sin(t * 1.3 + a) * 0.3);
      tg.scale.setScalar(Math.max(0.001, tri));
    }
  }

  // Exports.
  const exVisible = inWindow(t, S.exports);
  exportsScene.group.visible = exVisible;
  exportsScene.towers.forEach((tw, i) => {
    const k = backOut(seg(t, 8.0 + i * 0.45, 9.6 + i * 0.45));
    tw.mesh.scale.y = Math.max(0.001, tw.h * k);
    const top = tw.mesh.position.clone().setY(tw.h * k + 0.25);
    placeLabel(towerLabels[i], top, exVisible ? clamp01(seg(t, 9.0 + i * 0.45, 9.6 + i * 0.45)) * (1 - seg(t, S.exports[1] - 0.6, S.exports[1])) : 0);
  });
  const semiK = easeOut(seg(t, 10.8, 12.0));
  exportsScene.semi.scale.y = Math.max(0.001, exportsScene.semiH * semiK);
  placeLabel(
    semiLabel,
    exportsScene.towers[4].mesh.position.clone().add(new THREE.Vector3(0.75, exportsScene.semiH * 0.5, 0.5)),
    exVisible ? seg(t, 11.4, 12.1) * (1 - seg(t, S.exports[1] - 0.6, S.exports[1])) : 0,
    0,
  );
  if (exVisible) {
    const { dieMesh, diePhase } = exportsScene;
    for (let i = 0; i < diePhase.length; i++) {
      const p = Math.sin(t * 3.0 + diePhase[i] * 40) * 0.5 + 0.5;
      const wave = clamp01(1 - Math.abs(exportsScene.dies[i].length() - (t - 7.5) * 2.2) / 1.5);
      tmpC.set('#141d40').lerp(CYAN, Math.pow(p, 6) * 0.7 + wave * 0.8);
      dieMesh.setColorAt(i, tmpC);
    }
    dieMesh.instanceColor!.needsUpdate = true;
  }

  // Fertility.
  const tfrVisible = inWindow(t, S.tfr);
  tfrScene.group.visible = tfrVisible;
  const prog = tfrProgress(t);
  if (tfrVisible) {
    const count = Math.floor(prog * tfrScene.tubular) * tfrScene.radial * 6;
    tfrScene.tube.geometry.setDrawRange(0, count);
    const p = tfrScene.curve.getPointAt(Math.max(prog, 0.0001));
    tfrScene.head.position.copy(p);
    tfrScene.head.scale.setScalar(1 + 0.15 * Math.sin(t * 8));
    tfrScene.columns.forEach((c, i) => {
      const a = smooth(clamp01((prog - tfrScene.tAt[i]) * 12 + 0.6));
      (c.col.material as THREE.MeshBasicMaterial).opacity = a * 0.45;
      (c.dot.material as THREE.MeshBasicMaterial).opacity = a;
    });
  }
  // The counter follows the line's height; the year follows its x.
  const hp = tfrScene.curve.getPointAt(Math.max(prog, 0.0001));
  const fy = clamp01((hp.x / 1.35 + 2020 - TFR[0][0]) / (TFR.length - 1)) * (TFR.length - 1);
  const i0 = Math.min(Math.floor(fy), TFR.length - 2);
  counters.tfr.textContent = lerp(TFR[i0][1], TFR[i0 + 1][1], fy - i0).toFixed(2);
  counters.year.textContent = String(TFR[Math.round(fy)][0]);
  tfrLabelIdx.forEach((idx, j) => {
    const a = tfrVisible ? smooth(clamp01((prog - tfrScene.tAt[idx]) * 14 + 0.3)) * (1 - seg(t, S.tfr[1] - 0.6, S.tfr[1])) : 0;
    placeLabel(tfrLabels[j], tfrScene.pts[idx].clone().setY(tfrScene.pts[idx].y + 0.35), a);
  });

  // Ageing.
  const elVisible = inWindow(t, S.elder);
  elderScene.group.visible = elVisible;
  if (elVisible) {
    const { body, head, rank, spots, jitter, n } = elderScene;
    const nowCount = easeOut(seg(t, 27.6, 30.2)) * ELDER_NOW;
    const futureCount = ELDER_NOW + easeOut(seg(t, 31.0, 33.2)) * (ELDER_2050 - ELDER_NOW);
    for (let i = 0; i < n; i++) {
      const appear = backOut(seg(t, 26.2 + jitter[i] * 1.2, 26.9 + jitter[i] * 1.2));
      const rk = rank[i];
      const isNow = rk < nowCount;
      const isFuture = !isNow && rk < futureCount;
      const lit = isNow ? clamp01(nowCount - rk) : 0;
      const fut = isFuture ? clamp01(futureCount - rk) : 0;
      const bob = Math.sin(t * 2 + jitter[i] * 6) * 0.03;
      const lift = lit * 0.25;
      const sc = Math.max(0.001, appear) * (1 + lit * 0.12);
      tmpQ.identity();
      tmpS.setScalar(sc);
      tmpP.copy(spots[i]).setY(0.41 * sc + lift + bob);
      tmpM.compose(tmpP, tmpQ, tmpS);
      body.setMatrixAt(i, tmpM);
      tmpP.setY(0.41 * sc * 2 + 0.2 * sc + lift + bob);
      tmpM.compose(tmpP, tmpQ, tmpS);
      head.setMatrixAt(i, tmpM);
      tmpC.copy(BASE_PERSON);
      if (fut > 0) tmpC.lerp(DIM_GOLD, fut);
      if (lit > 0) tmpC.lerp(GOLD, lit).multiplyScalar(1 + lit * 0.6);
      body.setColorAt(i, tmpC);
      head.setColorAt(i, tmpC);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    body.instanceColor!.needsUpdate = true;
    head.instanceColor!.needsUpdate = true;
  }

  updateOverlay(t);
  composer.render();
}

// ---------- drive ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  shift = -1;
  applyShift(0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

declare global {
  interface Window {
    __renderFrame?: (t: number) => void;
    __ready?: Promise<void>;
    __duration?: number;
  }
}

if (capture) {
  window.__duration = DURATION;
  window.__renderFrame = renderAt;
  window.__ready = document.fonts.ready.then(() => renderAt(0));
} else {
  let origin = performance.now();
  addEventListener('click', () => (origin = performance.now()));
  const loop = (now: number) => {
    const t = ((now - origin) / 1000) % (DURATION + 1.5);
    renderAt(t);
    requestAnimationFrame(loop);
  };
  void document.fonts.ready.then(() => requestAnimationFrame(loop));
}
