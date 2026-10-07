import * as THREE from 'three';
import { backOut, clamp01, easeInOut, easeOut, lerp, rng, smooth } from './util';

const RED = new THREE.Color('#cd2e3a');
const BLUE = new THREE.Color('#0047a0');
const R = 3;

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

/** Single light → burst → particles settle into the taegeuk, then the solid emblem and trigrams resolve. */
export function createEmblem() {
  const root = new THREE.Group();
  const solid = new THREE.Group();
  const { red, blue } = taegeukShapes(R);
  const extrude = { depth: 0.6, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.09, bevelSegments: 6, curveSegments: 96 };
  const mats: THREE.MeshStandardMaterial[] = [];
  for (const [shape, color] of [
    [red, RED],
    [blue, BLUE],
  ] as const) {
    const geo = new THREE.ExtrudeGeometry(shape, extrude);
    geo.translate(0, 0, -0.3);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.25, transparent: true, envMapIntensity: 0.8 });
    mats.push(mat);
    solid.add(new THREE.Mesh(geo, mat));
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.25), transparent: true, opacity: 0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.4, 0.03, 8, 200), ringMat);
  solid.add(ring);

  const trigramMat = new THREE.MeshStandardMaterial({ color: '#8c95aa', emissive: '#c9d3f0', emissiveIntensity: 0.1, metalness: 0.5, roughness: 0.35, transparent: true, envMapIntensity: 0.55 });
  const trigrams: { g: THREE.Group; a: number }[] = [];
  const defs: [number, number[]][] = [
    [(3 * Math.PI) / 4, [1, 1, 1]], // 건
    [-Math.PI / 4, [0, 0, 0]], // 곤
    [Math.PI / 4, [0, 1, 0]], // 감
    [(-3 * Math.PI) / 4, [1, 0, 1]], // 리
  ];
  const L = 2.5;
  const H = 0.3;
  for (const [a, bars] of defs) {
    const g = new THREE.Group();
    bars.forEach((on, i) => {
      const y = (1 - i) * H * 1.9;
      const parts = on ? [[0, L]] : [[-L * 0.28, L * 0.44], [L * 0.28, L * 0.44]];
      for (const [x, w] of parts) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.24), trigramMat);
        m.position.set(x, y, 0);
        g.add(m);
      }
    });
    g.rotation.z = a - Math.PI / 2;
    trigrams.push({ g, a });
    solid.add(g);
  }
  root.add(solid);

  // Particles.
  const r = rng(11);
  const n = 7000;
  const burst = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const rad = 7 + r() * 16;
    const s = Math.sqrt(1 - u * u);
    burst.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3);
    const rr = R * Math.sqrt(r());
    const a = r() * Math.PI * 2;
    const x = rr * Math.cos(a);
    const y = rr * Math.sin(a);
    target.set([x, y, (r() - 0.5) * 0.6], i * 3);
    const c = isRed(x, y) ? RED : BLUE;
    const glow = 1.6 + r();
    col.set([c.r * glow + 0.15, c.g * glow + 0.1, c.b * glow + 0.1], i * 3);
    phase[i] = r();
  }
  const pos = new Float32Array(n * 3);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pmat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  root.add(points);

  // The single light before the burst.
  const seedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), transparent: true });
  const seedLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), seedMat);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 3.0); gl_FragColor = vec4(vec3(1.0, 0.7, 0.4) * a * 0.9, 1.0); }',
    }),
  );
  halo.scale.setScalar(5);
  seedLight.add(halo);
  root.add(seedLight);

  /**
   * @param tSeed  time since the seed light appeared
   * @param tBurst time since the burst (negative before)
   */
  function update(tSeed: number, tBurst: number, t: number, pulse: number) {
    seedLight.visible = tBurst < 0.25 && tSeed > 0;
    seedMat.opacity = clamp01(tSeed / 0.6) * (tBurst < 0 ? 1 : 1 - tBurst / 0.25);
    seedLight.scale.setScalar((0.6 + clamp01(tSeed / 1.5) * 0.8) * (1 + pulse * 0.8) * (tBurst > 0 ? 1 + tBurst * 30 : 1));

    points.visible = tBurst > 0;
    const out = easeOut(clamp01(tBurst / 0.7));
    const settle = clamp01((tBurst - 0.45) / 1.9);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const e = easeInOut(clamp01(settle * 1.3 - phase[i] * 0.3));
      const swirl = (1 - e) * 2.2;
      const bx = burst[i3] * out;
      const bz = burst[i3 + 2] * out;
      const rx = bx * Math.cos(swirl) - bz * Math.sin(swirl);
      const rz = bx * Math.sin(swirl) + bz * Math.cos(swirl);
      pos[i3] = lerp(rx, target[i3], e);
      pos[i3 + 1] = lerp(burst[i3 + 1] * out, target[i3 + 1], e);
      pos[i3 + 2] = lerp(rz, target[i3 + 2], e);
    }
    pgeo.attributes.position.needsUpdate = true;

    const s = smooth(clamp01((tBurst - 1.8) / 1.0));
    pmat.opacity = 1 - s * 0.85;
    solid.visible = s > 0;
    for (const m of mats) {
      m.opacity = s;
      m.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 2.2);
    }
    ringMat.opacity = s * 0.8;
    const tri = backOut(clamp01((tBurst - 2.3) / 1.0));
    trigramMat.opacity = clamp01(tri);
    for (const { g, a } of trigrams) {
      const d = lerp(10, 4.75, Math.min(tri, 1.1));
      g.position.set(Math.cos(a) * d, Math.sin(a) * d, Math.sin(t * 1.3 + a) * 0.25);
      g.scale.setScalar(Math.max(0.001, tri));
    }
    solid.rotation.set(Math.sin(t * 0.6) * 0.1, lerp(1.2, 0, easeOut(clamp01(tBurst / 3))) + Math.sin(t * 0.4) * 0.12, 0);
  }

  return { root, update };
}
