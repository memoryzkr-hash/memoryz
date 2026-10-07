import * as THREE from 'three';

// 2015 = 100. Exports (억 달러, 산업부 연간 수출입동향) and births (명, 국가데이터처; 2025 잠정).
const EXPORTS = [5268, 4954, 5737, 6049, 5422, 5125, 6444, 6836, 6322, 6838, 7097];
const BIRTHS = [438420, 406243, 357771, 326822, 302676, 272337, 260562, 249186, 230028, 238343, 254300];
export const EXPORT_CHANGE = Math.round((EXPORTS[10] / EXPORTS[0] - 1) * 100); // +35
export const BIRTH_CHANGE = Math.round((BIRTHS[10] / BIRTHS[0] - 1) * 100); // −42

const X = (i: number) => (i - 5) * 1.8;
const Y = (v: number, base: number) => (v / base - 1) * 16;

function ribbon(values: number[], color: THREE.Color) {
  const pts = values.map((v, i) => new THREE.Vector3(X(i), Y(v, values[0]), 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tubular = 400;
  const radial = 12;
  const geo = new THREE.TubeGeometry(curve, tubular, 0.075, radial, false);
  const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5) });
  const mesh = new THREE.Mesh(geo, mat);
  geo.setDrawRange(0, 0);
  const glowGeo = new THREE.TubeGeometry(curve, tubular, 0.22, radial, false);
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glowGeo.setDrawRange(0, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3) }));
  // Streaming particles along the line.
  const n = 260;
  const sp = new Float32Array(n * 3);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stream = new THREE.Points(
    sgeo,
    new THREE.PointsMaterial({ color, size: 0.07, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  stream.frustumCulled = false;
  const offsets = Array.from({ length: n }, (_, i) => ({ u: i / n, r: new THREE.Vector3(Math.sin(i * 12.9) * 0.5, Math.cos(i * 7.7) * 0.5, Math.sin(i * 3.3) * 0.5) }));
  const group = new THREE.Group();
  group.add(mesh, glow, head, stream);
  return {
    group,
    curve,
    pts,
    set(progress: number, t: number) {
      const count = Math.floor(progress * tubular) * radial * 6;
      geo.setDrawRange(0, count);
      glowGeo.setDrawRange(0, count);
      head.position.copy(curve.getPointAt(Math.max(progress, 0.0001)));
      head.scale.setScalar(1 + 0.25 * Math.sin(t * 14));
      head.visible = progress > 0.001;
      offsets.forEach((o, i) => {
        const u = ((o.u + t * 0.18) % 1) * progress;
        const p = curve.getPointAt(Math.max(u, 0.0001));
        sp[i * 3] = p.x + o.r.x;
        sp[i * 3 + 1] = p.y + o.r.y;
        sp[i * 3 + 2] = p.z + o.r.z;
      });
      sgeo.attributes.position.needsUpdate = true;
    },
  };
}

export function createClimax() {
  const group = new THREE.Group();
  const gold = ribbon(EXPORTS, new THREE.Color('#ffc34d'));
  const red = ribbon(BIRTHS, new THREE.Color('#ff2a3a'));
  gold.group.position.z = 0.4;
  red.group.position.z = -0.4;
  group.add(gold.group, red.group);

  // Baseline (2015 = 100) and year ticks.
  const baseMat = new THREE.LineDashedMaterial({ color: '#8090c0', dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.5 });
  const baseGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0) - 1, 0, 0), new THREE.Vector3(X(10) + 2.5, 0, 0)]);
  const base = new THREE.Line(baseGeo, baseMat);
  base.computeLineDistances();
  group.add(base);

  const grid = new THREE.GridHelper(80, 40, '#1d2b5c', '#111a3a');
  grid.position.y = -9;
  const gm = grid.material as THREE.Material;
  gm.transparent = true;
  gm.opacity = 0.7;
  group.add(grid);

  return {
    group,
    gold,
    red,
    endGold: () => gold.pts[10].clone().add(gold.group.position),
    endRed: () => red.pts[10].clone().add(red.group.position),
    start: () => new THREE.Vector3(X(0), 0, 0),
  };
}
