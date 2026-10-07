import * as THREE from 'three';

/** Final grade: glitch slices, chromatic aberration, red grade, vignette, grain, flash. Runs in display space. */
export const CinemaShader = {
  name: 'CinemaShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uSeed: { value: 0 },
    uCA: { value: 0.002 },
    uGlitch: { value: 0 },
    uRed: { value: 0 },
    uVignette: { value: 0.75 },
    uGrain: { value: 0.06 },
    uFlash: { value: 0 },
    uContrast: { value: 1.08 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uSeed, uCA, uGlitch, uRed, uVignette, uGrain, uFlash, uContrast, uFade;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 28.0 + floor(uSeed * 13.0));
        float r = hash(vec2(band, floor(uSeed * 60.0)));
        if (r < uGlitch * 0.55) uv.x += (hash(vec2(band, uSeed + 3.1)) - 0.5) * 0.16 * uGlitch;
        float thin = floor(uv.y * 160.0);
        if (hash(vec2(thin, floor(uSeed * 60.0) + 9.0)) < uGlitch * 0.12) uv.x += 0.02 * uGlitch;
      }
      vec2 d = uv - 0.5;
      vec2 off = d * (uCA + uGlitch * 0.02);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // Contrast around mid grey, then pull toward a blood-red grade.
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 red = vec3(lum * 1.35 + 0.02, lum * 0.42, lum * 0.38);
      col = mix(col, red, uRed);

      float v = smoothstep(0.95, 0.25, length(d * vec2(1.0, 0.82)));
      col *= mix(1.0, v, uVignette);

      float g = hash(vUv * uResolution + fract(uSeed * 7.13) * 100.0) - 0.5;
      col += g * uGrain;

      col *= 1.0 - uFade;
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
