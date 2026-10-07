import * as THREE from 'three';
import { rng } from './util';

/** Floating dust that wraps around the camera, so every shot has close parallax and a sense of speed. */
export function createDust(count = 1800, box = 46) {
  const r = rng(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([r() * box, r() * box, r() * box], i * 3);
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: box },
      uOpacity: { value: 0.32 },
      uColor: { value: new THREE.Color('#b9c8e8') },
      uTime: { value: 0 },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uCam;
      uniform float uBox, uTime, uScale;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.3 + aSeed * 30.0), cos(uTime * 0.23 + aSeed * 20.0), 0.0) * 0.6;
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = length(p - uCam);
        vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, dist)) * smoothstep(0.5, 2.5, dist) * (0.4 + aSeed * 0.6);
        gl_PointSize = uScale * (1.0 + aSeed * 1.6) * 110.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * a * vA * uOpacity, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}
