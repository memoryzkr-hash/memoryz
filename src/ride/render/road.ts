import * as THREE from 'three';
import { nextRandom } from '../../core/rng';
import { LANE_WIDTH, LANES, ROAD_HALF_WIDTH } from '../core/constants';

/**
 * Everything static along the highway. The world is drawn relative to the rider: an object at
 * sim distance `z` sits at three.js z = -(z - ref), so the camera stays near the origin forever.
 */

export const COLORS = {
  fog: new THREE.Color(0x150f3a),
  skyTop: new THREE.Color(0x03030f),
  skyHorizon: new THREE.Color(0x2c1666),
  neonPink: new THREE.Color(0xff2bd6),
  neonCyan: new THREE.Color(0x2ef2ff),
  building: new THREE.Color(0x0a0c2a),
};
export const FOG_DENSITY = 0.0048;

const SHOULDER = 1.2;
const ROAD_WIDTH = ROAD_HALF_WIDTH * 2 + SHOULDER * 2;
/** Length of one texture tile along the road. */
const TILE = 12;
const BEHIND = 40;
const AHEAD = 700;

const toWorldZ = (z: number, ref: number) => -(z - ref);

function roadTextures(anisotropy: number): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = 512;
  const H = 512;
  const pxPerM = W / ROAD_WIDTH;
  const xOf = (m: number) => (m + ROAD_WIDTH / 2) * pxPerM;

  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const g = base.getContext('2d')!;
  g.fillStyle = '#121034';
  g.fillRect(0, 0, W, H);
  // Asphalt grain.
  const rng = { rngState: 99 };
  for (let i = 0; i < 6000; i++) {
    const v = 22 + nextRandom(rng) * 26;
    g.fillStyle = `rgba(${v},${v - 4},${v + 30},0.55)`;
    g.fillRect(nextRandom(rng) * W, nextRandom(rng) * H, 2, 2);
  }
  // Darker shoulders.
  g.fillStyle = 'rgba(5,4,20,0.55)';
  g.fillRect(0, 0, xOf(-ROAD_HALF_WIDTH), H);
  g.fillRect(xOf(ROAD_HALF_WIDTH), 0, W, H);

  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;
  const l = glow.getContext('2d')!;
  l.fillStyle = '#000';
  l.fillRect(0, 0, W, H);

  const lines = (ctx: CanvasRenderingContext2D, color: string, edge: string) => {
    const lw = 0.16 * pxPerM;
    ctx.fillStyle = edge;
    ctx.fillRect(xOf(-ROAD_HALF_WIDTH) - lw, 0, lw, H);
    ctx.fillRect(xOf(ROAD_HALF_WIDTH), 0, lw, H);
    ctx.fillStyle = color;
    for (let i = 1; i < LANES; i++) {
      const x = xOf(-ROAD_HALF_WIDTH + i * LANE_WIDTH) - lw / 2;
      ctx.fillRect(x, 0, lw, H * 0.38);
    }
  };
  lines(g, '#d9dcff', '#ff6be6');
  lines(l, '#8f93c8', '#ff2bd6');

  const make = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, (AHEAD + BEHIND) / TILE);
    t.anisotropy = anisotropy;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(base), glow: make(glow) };
}

function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#07061a';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#5b2bb0';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Objects placed at fixed sim positions that wrap around ahead of the rider once passed. */
class Recycler {
  constructor(
    readonly z: Float64Array,
    readonly span: number,
    private readonly behind: number,
  ) {}

  /** Moves passed items forward by the span; returns true if any moved. */
  wrap(ref: number): boolean {
    let moved = false;
    for (let i = 0; i < this.z.length; i++) {
      while (this.z[i] < ref - this.behind) {
        this.z[i] += this.span;
        moved = true;
      }
    }
    return moved;
  }
}

const BUILDING_VERT = /* glsl */ `
  attribute float seed;
  varying vec3 vLocal;
  varying vec3 vNormal2;
  varying float vSeed;
  varying float vDist;
  varying float vHeight;
  void main() {
    vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vLocal = position * s;
    vHeight = s.y;
    vNormal2 = normal;
    vSeed = seed;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BUILDING_FRAG = /* glsl */ `
  uniform vec3 baseColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 neonA;
  uniform vec3 neonB;
  varying vec3 vLocal;
  varying vec3 vNormal2;
  varying float vSeed;
  varying float vDist;
  varying float vHeight;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 col = baseColor * (0.55 + 0.45 * vNormal2.y + 0.15 * abs(vNormal2.x));
    if (abs(vNormal2.y) < 0.5) {
      float u = abs(vNormal2.x) > 0.5 ? vLocal.z : vLocal.x;
      vec2 cell = vec2(u / 2.4, vLocal.y / 3.2);
      vec2 id = floor(cell);
      vec2 f = fract(cell);
      float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.78);
      float lit = step(0.74, hash(id + vSeed * 17.0));
      vec3 wc = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.3, 0.85), step(0.55, hash(id.yx + vSeed)));
      wc = mix(wc, vec3(1.0, 0.78, 0.5), step(0.82, hash(id * 1.37 + vSeed)));
      col += win * lit * wc * 0.95;
      col += win * (1.0 - lit) * vec3(0.03, 0.04, 0.1);
      // Some towers wear a neon crown.
      float crown = step(0.55, fract(vSeed * 7.31)) * step(vHeight - 0.8, vLocal.y);
      col += crown * mix(neonA, neonB, step(0.5, fract(vSeed * 3.7))) * 1.8;
    }
    float fogF = 1.0 - exp(-fogDensity * fogDensity * vDist * vDist);
    gl_FragColor = vec4(mix(col, fogColor, fogF), 1.0);
  }
`;

export class RoadWorld {
  readonly group = new THREE.Group();
  private roadTex: { map: THREE.CanvasTexture; glow: THREE.CanvasTexture };
  private grid: THREE.CanvasTexture;
  private posts: { mesh: THREE.InstancedMesh; tips: THREE.InstancedMesh; spacing: number; count: number };
  private lamps: { poles: THREE.InstancedMesh; heads: THREE.InstancedMesh; z: Recycler; side: Int8Array };
  private streaks: { mesh: THREE.InstancedMesh; z: Recycler; x: Float32Array; y: Float32Array; len: Float32Array };
  private buildings: { mesh: THREE.InstancedMesh; z: Recycler; x: Float32Array; w: Float32Array; d: Float32Array; h: Float32Array }[] = [];
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(anisotropy: number) {
    const rng = { rngState: 1234 };
    const r = (lo: number, hi: number) => lo + nextRandom(rng) * (hi - lo);

    // Road surface with glowing lane lines.
    this.roadTex = roadTextures(anisotropy);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, AHEAD + BEHIND),
      new THREE.MeshStandardMaterial({
        map: this.roadTex.map,
        emissiveMap: this.roadTex.glow,
        emissive: 0xffffff,
        emissiveIntensity: 1.0,
        roughness: 0.42,
        metalness: 0.25,
      }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -(AHEAD - BEHIND) / 2;
    road.receiveShadow = false;
    this.group.add(road);

    // Synthwave grid off-road.
    this.grid = gridTexture();
    this.grid.repeat.set(80, 90);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 900),
      new THREE.MeshBasicMaterial({ map: this.grid, color: 0x9a8cff }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -400);
    this.group.add(ground);

    // Barriers with a neon top strip on both sides.
    const barrierLen = AHEAD + BEHIND;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x14112e, roughness: 0.6, metalness: 0.3 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLORS.neonPink, emissiveIntensity: 2.6 });
    const cyanMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLORS.neonCyan, emissiveIntensity: 1.6 });
    for (const side of [-1, 1]) {
      const x = side * (ROAD_HALF_WIDTH + SHOULDER - 0.15);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, barrierLen), wallMat);
      wall.position.set(x, 0.425, -(AHEAD - BEHIND) / 2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, barrierLen), pinkMat);
      strip.position.set(x, 0.9, wall.position.z);
      const low = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, barrierLen), cyanMat);
      low.position.set(x - side * 0.01, 0.18, wall.position.z);
      this.group.add(wall, strip, low);
    }

    // Short posts on the barrier, every few meters: the main cue for speed close up.
    const postSpacing = 6;
    const postCount = Math.ceil((AHEAD + BEHIND) / postSpacing) * 2;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), wallMat, postCount);
    const tips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.07, 0.24), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 2.4 }), postCount);
    for (const im of [posts, tips]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.posts = { mesh: posts, tips, spacing: postSpacing, count: postCount / 2 };

    // Street lamps.
    const lampCount = 24;
    const lampSpacing = 36;
    const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 9, 0.25), wallMat, lampCount);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xc8b8ff, emissiveIntensity: 2 }), lampCount);
    const lampZ = new Float64Array(lampCount);
    const lampSide = new Int8Array(lampCount);
    for (let i = 0; i < lampCount; i++) {
      lampZ[i] = (i >> 1) * lampSpacing * 2 + (i & 1) * lampSpacing;
      lampSide[i] = i & 1 ? 1 : -1;
    }
    for (const im of [poles, heads]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.lamps = { poles, heads, z: new Recycler(lampZ, (lampCount / 2) * lampSpacing * 2, BEHIND), side: lampSide };

    // Floating light streaks in the sky, like in the reference video.
    const streakCount = 160;
    const streakSpan = 600;
    const sz = new Float64Array(streakCount);
    const sx = new Float32Array(streakCount);
    const sy = new Float32Array(streakCount);
    const sl = new Float32Array(streakCount);
    for (let i = 0; i < streakCount; i++) {
      sz[i] = r(-BEHIND, streakSpan - BEHIND);
      const side = nextRandom(rng) < 0.5 ? -1 : 1;
      sx[i] = side * r(ROAD_HALF_WIDTH + 4, 70);
      sy[i] = r(5, 45);
      sl[i] = r(3, 12);
    }
    const streaks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.12, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd9ccff).multiplyScalar(1.5), fog: false }),
      streakCount,
    );
    streaks.frustumCulled = false;
    this.group.add(streaks);
    this.streaks = { mesh: streaks, z: new Recycler(sz, streakSpan, BEHIND), x: sx, y: sy, len: sl };

    // City blocks: a near row of towers and a taller far skyline on each side.
    const buildingMat = new THREE.ShaderMaterial({
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
      uniforms: {
        baseColor: { value: COLORS.building },
        fogColor: { value: COLORS.fog },
        fogDensity: { value: FOG_DENSITY },
        neonA: { value: COLORS.neonPink },
        neonB: { value: COLORS.neonCyan },
      },
    });
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const rows = [
      { near: 22, far: 34, minH: 18, maxH: 70, minW: 10, maxW: 22, gap: [2, 10] as const },
      { near: 55, far: 110, minH: 50, maxH: 170, minW: 18, maxW: 40, gap: [6, 30] as const },
    ];
    for (const row of rows) {
      for (const side of [-1, 1]) {
        const n = 36;
        const z = new Float64Array(n);
        const x = new Float32Array(n);
        const w = new Float32Array(n);
        const d = new Float32Array(n);
        const h = new Float32Array(n);
        const seed = new Float32Array(n);
        let cursor = -BEHIND;
        for (let i = 0; i < n; i++) {
          d[i] = r(row.minW, row.maxW);
          w[i] = r(row.minW, row.maxW);
          h[i] = r(row.minH, row.maxH);
          x[i] = side * (r(row.near, row.far) + w[i] / 2);
          z[i] = cursor + d[i] / 2;
          cursor += d[i] + r(row.gap[0], row.gap[1]);
          seed[i] = nextRandom(rng) * 100;
        }
        const mesh = new THREE.InstancedMesh(box, buildingMat, n);
        mesh.geometry = box.clone();
        mesh.geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 1));
        mesh.frustumCulled = false;
        this.group.add(mesh);
        const b = { mesh, z: new Recycler(z, cursor + BEHIND, BEHIND + 60), x, w, d, h };
        this.buildings.push(b);
      }
    }

    // Gradient sky dome and stars (they follow the camera, so no fog).
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(950, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: COLORS.skyTop }, horizon: { value: COLORS.skyHorizon }, fogColor: { value: COLORS.fog } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 fogColor;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 c = mix(horizon, top, pow(h, 0.45));
            c = mix(fogColor, c, smoothstep(-0.02, 0.12, vDir.y));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    );
    this.sky.renderOrder = -1;
    this.group.add(this.sky);

    const starPos: number[] = [];
    for (let i = 0; i < 700; i++) {
      const th = r(0, Math.PI * 2);
      const ph = r(0.08, 1.2);
      starPos.push(Math.cos(th) * Math.cos(ph) * 900, Math.sin(ph) * 900, Math.sin(th) * Math.cos(ph) * 900);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfc8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    this.group.add(this.stars);
  }

  /** Repositions everything for the rider being at sim distance `ref`. */
  update(ref: number, camera: THREE.Camera): void {
    const frac = ref / TILE;
    this.roadTex.map.offset.y = frac % 1;
    this.roadTex.glow.offset.y = frac % 1;
    this.grid.offset.y = (ref / 10) % 1;

    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);

    const { m, q, v, s } = this;
    q.identity();

    // Posts: evenly spaced, so just slide by the remainder.
    const { spacing, count } = this.posts;
    const shift = ref % spacing;
    for (let i = 0; i < count; i++) {
      const z = -(i * spacing - BEHIND - shift);
      for (const side of [-1, 1]) {
        const idx = i * 2 + (side > 0 ? 1 : 0);
        const x = side * (ROAD_HALF_WIDTH + SHOULDER - 0.15);
        m.compose(v.set(x, 1.15, z), q, s.set(1, 1, 1));
        this.posts.mesh.setMatrixAt(idx, m);
        m.compose(v.set(x, 1.42, z), q, s.set(1, 1, 1));
        this.posts.tips.setMatrixAt(idx, m);
      }
    }
    this.posts.mesh.instanceMatrix.needsUpdate = true;
    this.posts.tips.instanceMatrix.needsUpdate = true;

    const lamps = this.lamps;
    lamps.z.wrap(ref);
    for (let i = 0; i < lamps.side.length; i++) {
      const side = lamps.side[i];
      const z = toWorldZ(lamps.z.z[i], ref);
      const x = side * (ROAD_HALF_WIDTH + SHOULDER + 0.5);
      m.compose(v.set(x, 4.5, z), q, s.set(1, 1, 1));
      lamps.poles.setMatrixAt(i, m);
      m.compose(v.set(x - side * 1.2, 9, z), q, s.set(1, 1, 1));
      lamps.heads.setMatrixAt(i, m);
    }
    lamps.poles.instanceMatrix.needsUpdate = true;
    lamps.heads.instanceMatrix.needsUpdate = true;

    const st = this.streaks;
    st.z.wrap(ref);
    for (let i = 0; i < st.x.length; i++) {
      m.compose(v.set(st.x[i], st.y[i], toWorldZ(st.z.z[i], ref)), q, s.set(1, 1, st.len[i]));
      st.mesh.setMatrixAt(i, m);
    }
    st.mesh.instanceMatrix.needsUpdate = true;

    for (const b of this.buildings) {
      b.z.wrap(ref);
      for (let i = 0; i < b.x.length; i++) {
        m.compose(v.set(b.x[i], 0, toWorldZ(b.z.z[i], ref)), q, s.set(b.w[i], b.h[i], b.d[i]));
        b.mesh.setMatrixAt(i, m);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
