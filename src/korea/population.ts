import * as THREE from 'three';
import { rng } from './util';

/**
 * A night map of tens of thousands of lights — people. `uDie` switches them off (each flashes red and
 * falls), `uOld` turns a share of the survivors amber. Shares are exact: thresholds are uniform randoms.
 */
export function createPopulation(count = 42000) {
  const r = rng(77);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  // Abstract clusters: one dominant metro area plus a few cities and a thin countryside.
  const clusters = [
    { x: -5, z: -9, s: 4.6, w: 0.5 },
    { x: 9, z: 11, s: 3.0, w: 0.12 },
    { x: 1.5, z: 2, s: 2.8, w: 0.08 },
    { x: 8, z: -1, s: 2.8, w: 0.08 },
    { x: -8, z: 10, s: 2.6, w: 0.06 },
  ];
  const pos = new Float32Array(count * 3);
  const death = new Float32Array(count);
  const age = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x: number;
    let z: number;
    let u = r();
    const c = clusters.find((cl) => (u -= cl.w) < 0);
    if (c) {
      x = c.x + gauss() * c.s;
      z = c.z + gauss() * c.s;
    } else {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 22;
      x = Math.cos(a) * rad;
      z = Math.sin(a) * rad * 1.15;
    }
    pos.set([x, 0, z], i * 3);
    death[i] = r();
    age[i] = r();
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDeath', new THREE.BufferAttribute(death, 1));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uDie: { value: 0 },
      uOld: { value: 0 },
      uTime: { value: 0 },
      uAppear: { value: 0 },
      uPulse: { value: 0 },
      uPixel: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uDie, uOld, uTime, uAppear, uPulse, uPixel;
      attribute float aDeath, aAge, aSeed;
      varying vec3 vColor;
      varying float vA;
      void main() {
        vec3 p = position;
        float appear = smoothstep(aSeed * 0.7, aSeed * 0.7 + 0.3, uAppear);
        float since = uDie - aDeath;           // > 0 once this light has gone out
        float dying = since > 0.0 ? clamp(since / 0.035, 0.0, 1.0) : 0.0;
        float flash = since > 0.0 ? exp(-since * 90.0) : 0.0;
        p.y -= dying * dying * 2.5;
        p.y += sin(uTime * 1.3 + aSeed * 40.0) * 0.05;

        vec3 alive = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.95, 0.85), aSeed);
        float old = step(aAge, uOld);
        alive = mix(alive, vec3(1.0, 0.6, 0.18), old);
        vColor = mix(alive, vec3(1.0, 0.12, 0.1), min(1.0, dying * 3.0 + flash));
        vA = appear * (1.0 - dying) * (0.45 + 0.45 * aSeed) * (1.0 + uPulse * 0.6) + flash * 2.0;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(2.2, (1.0 + aSeed * 0.8 + flash * 3.0) * uPixel * 80.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * 1.6;
        gl_FragColor = vec4(vColor * a * vA, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Faint polar grid underneath for scale.
  const group = new THREE.Group();
  const polar = new THREE.PolarGridHelper(30, 24, 10, 128, '#1a2a55', '#101a38');
  const pm = polar.material as THREE.LineBasicMaterial;
  pm.transparent = true;
  pm.opacity = 0.55;
  polar.position.y = -0.05;
  group.add(polar, points);
  return { group, mat, polar };
}
