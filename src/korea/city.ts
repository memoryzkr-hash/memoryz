import * as THREE from 'three';
import { rng } from './util';

/**
 * A night-time "chip city": instanced towers with procedural windows over a circuit-board ground
 * whose traces carry racing light pulses. Everything is shaded procedurally so it stays sharp and cheap.
 */

const FOG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  vec3 applyFog(vec3 col, float dist) {
    float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    return mix(col, uFogColor, f);
  }
`;

const HASH = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export function createCity() {
  const group = new THREE.Group();
  const r = rng(42);
  const CELL = 5;
  const AVENUE = 4.2;

  type B = { x: number; z: number; w: number; d: number; h: number; gold: number };
  const list: B[] = [];
  for (let gx = -12; gx <= 12; gx++) {
    for (let gz = -46; gz <= 4; gz++) {
      const cx = gx * CELL;
      const cz = gz * CELL;
      if (Math.abs(cx) < AVENUE + 1) continue;
      const near = 1 - Math.min(1, (Math.abs(cx) - AVENUE) / 40);
      const n = r() < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = 1.6 + r() * (n === 2 ? 1.4 : 2.6);
        const d = 1.6 + r() * (n === 2 ? 1.4 : 2.6);
        const ox = (r() - 0.5) * (CELL - w - 0.6);
        const oz = (r() - 0.5) * (CELL - d - 0.6);
        let h = 2 + Math.pow(r(), 2.6) * 26 * (0.45 + near);
        if (r() < 0.05 * near) h += 18 + r() * 16;
        list.push({ x: cx + ox, z: cz + oz, w, d, h, gold: 0 });
      }
    }
  }
  // The tallest towers near the far end glow gold — the "record" skyline.
  for (const b of list) if (b.z < -175 && b.h > 22 && Math.abs(b.x) < 26) b.gold = 1;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const seeds = new Float32Array(list.length);
  const golds = new Float32Array(list.length);
  list.forEach((b, i) => {
    seeds[i] = r();
    golds[i] = b.gold;
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aGold', new THREE.InstancedBufferAttribute(golds, 1));

  const shared = {
    uFogColor: { value: new THREE.Color('#04060d') },
    uFogDensity: { value: 0.0105 },
    uTime: { value: 0 },
    uPower: { value: 1 },
    uScanZ: { value: 0 },
    uScan: { value: 0 },
    uSurge: { value: 0 },
    uCam: { value: new THREE.Vector3() },
  };

  const buildingMat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aGold;
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying float vSeed;
      varying float vGold;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vLocal = position;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vN = normal;
        vSeed = aSeed;
        vGold = aGold;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uScanZ, uScan, uSurge;
      uniform vec3 uCam;
      varying vec3 vWorld;
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying float vSeed;
      varying float vGold;
      ${FOG}
      ${HASH}
      void main() {
        vec3 base = vec3(0.018, 0.024, 0.045);
        vec3 view = normalize(uCam - vWorld);
        float fres = pow(1.0 - abs(dot(view, normalize(vN))), 3.0);
        vec3 col = base + vec3(0.05, 0.09, 0.2) * fres;

        float height = vLocal.y * vScale.y;
        if (abs(vN.y) < 0.5) {
          float u = abs(vN.x) > 0.5 ? (vLocal.z + 0.5) * vScale.z : (vLocal.x + 0.5) * vScale.x;
          vec2 g = vec2(u / 0.62, height / 0.55);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78);
          float h1 = hash(cell + vSeed * 17.0 + vN.xz * 3.0);
          float lit = step(0.7, h1);
          // Far away, windows shrink below a pixel: blend to their average glow instead of shimmering.
          float aa = clamp(1.0 - max(fwidth(g.x), fwidth(g.y)) * 1.2, 0.0, 1.0);
          win = mix(0.3 * 0.31, win, aa);
          lit = mix(0.3, lit, aa);
          float flick = 0.85 + 0.15 * sin(uTime * (3.0 + h1 * 9.0) + h1 * 40.0);
          // Power cut: each window has its own switch-off moment.
          float on = step(1.0 - uPower, hash(cell * 1.7 + vSeed * 5.0));
          vec3 wc = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.78, 0.45), step(0.8, hash(cell + 2.3)));
          wc = mix(wc, vec3(1.0, 0.72, 0.25), vGold);
          float scan = exp(-pow((vWorld.z - uScanZ) / 7.0, 2.0)) * uScan;
          col += wc * win * lit * flick * on * (0.75 + vGold * 0.9 + uSurge * 1.6) + vec3(0.4, 0.8, 1.0) * win * scan * 2.5 * on;
          float edge = smoothstep(0.12, 0.0, vScale.y - height);
          col += mix(vec3(0.2, 0.6, 1.0), vec3(1.0, 0.75, 0.3), vGold) * edge * (0.9 + uSurge) * uPower;
        } else {
          col += vec3(0.02, 0.04, 0.08);
        }
        col = applyFog(col, length(vWorld - uCam));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, buildingMat, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
  });
  mesh.frustumCulled = false;
  group.add(mesh);

  const groundMat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uSurge;
      uniform vec3 uCam;
      varying vec3 vWorld;
      ${FOG}
      ${HASH}
      float line(float c, float w) { float d = abs(fract(c) - 0.5); return smoothstep(w, 0.0, 0.5 - d); }
      void main() {
        vec2 p = vWorld.xz;
        vec3 col = vec3(0.008, 0.011, 0.022);
        // Fine circuit traces running along the city (z) and across it (x).
        float lane = floor(p.x / 0.9);
        float tz = line(p.x / 0.9, 0.035) * step(4.4, abs(p.x));
        float speed = 6.0 + hash(vec2(lane, 1.0)) * 14.0;
        float pulse = pow(fract(p.y * 0.035 + uTime * speed * 0.035 + hash(vec2(lane, 7.0))), 24.0);
        float rowc = floor(p.y / 2.5);
        float tx = line(p.y / 2.5, 0.025) * step(4.4, abs(p.x));
        float pulseX = pow(fract(p.x * 0.05 * sign(hash(vec2(rowc, 3.0)) - 0.5) + uTime * 0.6 + hash(vec2(rowc, 5.0))), 30.0);
        vec3 cyan = vec3(0.2, 0.65, 1.0);
        col += cyan * tz * (0.05 + pulse * 2.4) * uPower;
        col += cyan * tx * (0.03 + pulseX * 1.6) * uPower;
        // Avenue edge rails and dashed centre line.
        float rail = smoothstep(0.09, 0.0, abs(abs(p.x) - 4.0));
        col += vec3(0.4, 0.8, 1.0) * rail * (0.7 + uSurge) * uPower;
        float dash = step(0.5, fract(p.y * 0.25)) * smoothstep(0.07, 0.0, abs(p.x));
        col += vec3(1.0, 0.8, 0.4) * dash * 0.9 * uPower;
        // Fake wet-asphalt sheen down the avenue.
        float sheen = smoothstep(4.0, 0.0, abs(p.x)) * 0.05;
        col += vec3(0.3, 0.5, 1.0) * sheen * uPower;
        col = applyFog(col, length(vWorld - uCam));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 280), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -105;
  group.add(ground);

  // Light beam at the end of the avenue.
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uBeam: { value: 0 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uBeam, uTime;
      varying vec2 vUv;
      void main() {
        float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 6.0);
        float fade = pow(1.0 - vUv.y, 0.6);
        float ripple = 0.85 + 0.15 * sin(vUv.y * 60.0 - uTime * 12.0);
        vec3 c = vec3(1.0, 0.75, 0.32) * core * fade * ripple * uBeam * 1.9;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 220), beamMat);
  beam.position.set(0, 110, -205);
  group.add(beam);

  return { group, uniforms: shared, beamMat, beam };
}
