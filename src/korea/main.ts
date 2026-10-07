import './korea.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createCity } from './city';
import { BIRTH_CHANGE, EXPORT_CHANGE, createClimax } from './climax';
import { createDust } from './dust';
import { createEmblem } from './emblem';
import { CinemaShader } from './fx';
import { createPopulation } from './population';
import {
  DURATION,
  TL,
  clamp01,
  easeIn,
  easeInOut,
  easeOut,
  easeOutExpo,
  heartbeat,
  impactEnvelope,
  inScene,
  lerp,
  noise1,
  seg,
  smooth,
} from './util';

/**
 * "대한민국, 지금" — a 46-second trailer-style 3D piece. Every visual and every number on screen is a
 * pure function of time `t`, so it plays live in the browser and renders frame-exact video (?capture).
 * Audio cues come from the same timeline.json (scripts/korea-audio.py).
 */

const SC = TL.scenes;
const CUE = TL.cues;

/** Live-action AI footage slot at `t` (composited underneath in scripts/compose-korea.py), if any. */
const aiAt = (t: number) => TL.ai.find((s) => t >= s.t0 && t < s.t1);

// ---------- renderer & post ----------
const capture = new URLSearchParams(location.search).has('capture');
if (capture) document.body.classList.add('capture');

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: capture, powerPreference: 'high-performance' });
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('stage')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 600);
scene.add(new THREE.AmbientLight('#8090c0', 0.4));
const key = new THREE.DirectionalLight('#ffffff', 1.4);
key.position.set(6, 10, 12);
scene.add(key);

const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.6, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const cinema = new ShaderPass(CinemaShader);
composer.addPass(cinema);
type Num = { value: number };
const U = cinema.uniforms as unknown as Record<Exclude<keyof typeof CinemaShader.uniforms, 'uResolution' | 'tDiffuse'>, Num> & {
  uResolution: { value: THREE.Vector2 };
};

// ---------- scene content ----------
const dust = createDust();
scene.add(dust.points);

const heart = (() => {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.3) }));
  group.add(core);
  const rings = TL.heartbeats.slice(0, 5).map(() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.98, 1, 128),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.2, 0.25), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    group.add(m);
    return m;
  });
  scene.add(group);
  return { group, core, rings };
})();

const city = createCity();
scene.add(city.group);

const pop = createPopulation();
scene.add(pop.group);

const climax = createClimax();
scene.add(climax.group);

const emblem = createEmblem();
emblem.root.scale.setScalar(0.62);
scene.add(emblem.root);

// ---------- overlay ----------
const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
const fxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-fx]'));
for (const el of fxEls) if (el.dataset.fx === 'type') el.dataset.full = el.textContent ?? '';
const counters = {
  exports: document.querySelector<HTMLElement>('[data-count="exports"]')!,
  pop: document.querySelector<HTMLElement>('[data-count="pop"]')!,
  popYear: document.querySelector<HTMLElement>('[data-count="popYear"]')!,
};
const overlay = document.getElementById('overlay')!;
const scrim = document.getElementById('scrim')!;
const fade = document.getElementById('fade')!;
const labelLayer = document.getElementById('labels')!;

function makeLabel(html: string, color: string, align: 'left' | 'center' = 'left') {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = html;
  el.style.color = color;
  el.style.transform = align === 'left' ? 'translate(18px, -50%)' : 'translate(-50%, -120%)';
  labelLayer.appendChild(el);
  return el;
}
const goldLabel = makeLabel(`수출 +${EXPORT_CHANGE}%<span class="y">2015 → 2025 · 7,097억 달러</span>`, '#ffc94d');
const redLabel = makeLabel(`출생아 ${BIRTH_CHANGE}%<span class="y">2015 → 2025 · 25만 4천 명</span>`, '#ff3b4a');
const baseLabel = makeLabel('2015 = 100<span class="y">지수</span>', '#9aa6c4', 'center');
baseLabel.style.fontSize = 'clamp(13px, 1.3vw, 26px)';

const proj = new THREE.Vector3();
function placeLabel(el: HTMLElement, world: THREE.Vector3, opacity: number) {
  proj.copy(world).project(camera);
  el.style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight}px`;
  el.style.opacity = proj.z < 1 ? String(opacity) : '0';
}

function animateText(t: number, shake: THREE.Vector2) {
  let leftVis = 0;
  for (const card of cards) {
    const tin = Number(card.dataset.in);
    const tout = Number(card.dataset.out);
    const a = seg(t, tin - 0.01, tin) * (1 - seg(t, tout - 0.22, tout));
    const vis = a > 0.001;
    card.style.visibility = vis ? 'visible' : 'hidden';
    card.style.opacity = String(a);
    card.style.filter = a < 1 && t > tin + 0.05 ? `blur(${(1 - a) * 10}px)` : 'none';
    if (vis && card.classList.contains('left')) leftVis = Math.max(leftVis, a);
  }
  scrim.style.opacity = String(leftVis);

  for (const el of fxEls) {
    const at = Number(el.dataset.at);
    const k = seg(t, at, at + 0.4);
    const fx = el.dataset.fx;
    if (fx === 'slam' || fx === 'glitch') {
      const e = easeOutExpo(seg(t, at, at + 0.35));
      const scale = 1.45 - 0.45 * e;
      const blur = (1 - e) * 18;
      const split = (1 - seg(t, at, at + 0.5)) * 8 + (fx === 'glitch' ? Math.abs(glitchJitter(t, at)) * 8 : 0);
      const jx = fx === 'glitch' ? glitchJitter(t, at + 0.1) * 10 : 0;
      el.style.opacity = String(clamp01((t - at) / 0.06));
      el.style.transform = `translateX(${jx}px) scale(${scale})`;
      el.style.filter = blur > 0.2 ? `blur(${blur}px)` : 'none';
      el.style.textShadow = split > 0.3 ? `${split}px 0 rgba(255,30,60,0.75), ${-split}px 0 rgba(40,190,255,0.75), 0 0 30px rgba(0,0,0,0.6)` : '';
    } else if (fx === 'rise') {
      const e = easeOut(k);
      el.style.opacity = String(e);
      el.style.transform = `translateY(${(1 - e) * 18}px)`;
    } else if (fx === 'type') {
      const full = el.dataset.full ?? '';
      const n = Math.floor(seg(t, at, at + full.length * 0.045) * full.length + 0.0001);
      el.textContent = t < at ? ' ' : full.slice(0, n) || ' ';
      el.style.opacity = t < at ? '0' : '1';
    }
  }
  overlay.style.transform = `translate(${shake.x * 9}px, ${shake.y * 9}px)`;

  // Counters (same easing as the visuals they describe).
  counters.exports.textContent = Math.round(easeOutExpo(seg(t, CUE.exportCount[0], CUE.exportCount[1])) * 7097).toLocaleString('ko-KR');
  const pk = popProgress(t);
  counters.pop.textContent = Math.round(5167 - 1545 * pk).toLocaleString('ko-KR');
  counters.popYear.textContent = String(Math.round(2022 + 50 * pk));
}

function glitchJitter(t: number, at: number) {
  const dt = t - at;
  if (dt < 0 || dt > 0.7) return 0;
  const step = Math.floor(t * 30);
  const h = Math.sin(step * 91.7 + at * 13.1) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 2 * (1 - dt / 0.7);
}

const popProgress = (t: number) => easeInOut(seg(t, CUE.popCount[0], CUE.popCount[1]));

// ---------- camera ----------
const look = new THREE.Vector3();
function placeCamera(t: number) {
  let fov = 40;
  let roll = 0;
  if (t < SC.cold[1]) {
    const k = seg(t, 0, SC.cold[1]);
    camera.position.set(Math.sin(t * 0.3) * 0.6, Math.cos(t * 0.23) * 0.3, lerp(15, 10.5, easeInOut(k)));
    look.set(0, 0, 0);
  } else if (t < SC.city[1]) {
    const k = seg(t, SC.city[0], SC.city[1]);
    const p = 0.28 * k + 0.72 * Math.pow(k, 2.3);
    const z = 18 - 165 * p;
    const y = 2.1 + 0.4 * Math.sin(t * 0.9) + 9 * smooth(seg(t, CUE.cityRise[0], CUE.cityRise[1]));
    const x = Math.sin(t * 0.75) * 1.3;
    camera.position.set(x, y, z);
    look.set(x * 0.2, y * 0.7 + 0.9, z - 34);
    fov = lerp(52, 66, easeIn(k));
    roll = Math.sin(t * 0.85) * 0.05;
  } else if (t < SC.turn[1]) {
    camera.position.set(0, 0, 10);
    look.set(0, 0, 0);
  } else if (t < SC.pop[1]) {
    const k = easeInOut(seg(t, SC.pop[0], SC.pop[1]));
    const a = lerp(0.2, 1.45, k);
    const rad = lerp(22, 20, k);
    camera.position.set(Math.sin(a) * rad, lerp(28, 9, k), Math.cos(a) * rad);
    look.set(lerp(-2, -3, k), 0, lerp(-2, -4, k));
    fov = 44;
    roll = Math.sin(t * 0.4) * 0.02;
  } else if (t < SC.climax[1]) {
    if (t < CUE.climaxFront[0]) {
      const k = easeInOut(seg(t, SC.climax[0], CUE.climaxFront[0]));
      camera.position.set(lerp(-13.5, -5, k), lerp(1.0, 1.4, k), lerp(5.5, 15, k));
      look.set(lerp(-6, 3, k), lerp(0.2, -0.4, k), 0);
      fov = lerp(55, 44, k);
      roll = lerp(-0.12, 0, k);
    } else if (t < CUE.climaxDolly[0]) {
      const k = easeOut(seg(t, CUE.climaxFront[0], CUE.climaxFront[1]));
      camera.position.set(lerp(-5, 2.5, k), lerp(1.4, 0.2, k), lerp(15, 28, k));
      look.set(lerp(3, 2.2, k), -0.6, 0);
      fov = 40;
    } else {
      // Dolly zoom: the camera rushes in while the lens widens — the floor drops away.
      const k = easeIn(seg(t, CUE.climaxDolly[0], CUE.climaxDolly[1]));
      const d = lerp(28, 9, k);
      fov = (2 * Math.atan((28 * Math.tan(THREE.MathUtils.degToRad(20))) / d) * 180) / Math.PI;
      camera.position.set(2.5 - k * 1.5, 0.2 - k * 0.6, d);
      look.set(2.2 - k * 1.5, -0.6, 0);
      roll = k * k * 0.35;
    }
  } else {
    const k = seg(t, SC.finale[0], DURATION);
    camera.position.set(Math.sin(t * 0.25) * 0.6, -2.1, lerp(20.5, 19, easeOut(k)));
    look.set(0, -2.2, 0);
  }
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.lookAt(look);
  camera.rotateZ(roll);

  // Shake: impacts plus a rising tremor through the climax.
  const tremor = impactEnvelope(t, 5) * 0.6 + (inScene(t, SC.climax) ? Math.pow(seg(t, CUE.climaxDolly[0] - 0.4, CUE.climaxDolly[1]), 2) * 1.2 : 0);
  const sx = noise1(t * 31, 1.3) * tremor;
  const sy = noise1(t * 29, 4.1) * tremor;
  camera.rotateX(sy * 0.018);
  camera.rotateY(sx * 0.018);
  camera.updateMatrixWorld();
  return new THREE.Vector2(sx, sy);
}

// ---------- per-frame ----------
function renderAt(t: number) {
  t = Math.min(Math.max(t, 0), DURATION);
  const shake = placeCamera(t);
  const hb = heartbeat(t);
  const ai = aiAt(t);
  dust.points.visible = !ai || inScene(t, SC.cold);

  dust.mat.uniforms.uCam.value.copy(camera.position);
  dust.mat.uniforms.uTime.value = t;
  dust.mat.uniforms.uScale.value = innerHeight / 1080;

  // Cold open: a red heart pulse with ripples.
  heart.group.visible = inScene(t, SC.cold);
  if (heart.group.visible) {
    heart.core.scale.setScalar(0.6 + hb * 0.9 + seg(t, 0.4, 1.2) * 0.4);
    heart.rings.forEach((ring, i) => {
      const dt = t - TL.heartbeats[i];
      const k = clamp01(dt / 1.4);
      ring.scale.setScalar(0.3 + easeOut(k) * 6);
      (ring.material as THREE.MeshBasicMaterial).opacity = dt > 0 ? (1 - k) * 0.45 : 0;
    });
  }

  // City.
  city.group.visible = inScene(t, SC.city) && !ai;
  if (city.group.visible) {
    const u = city.uniforms;
    u.uTime.value = t;
    u.uCam.value.copy(camera.position);
    u.uPower.value = 1 - seg(t, CUE.powerCut[0], CUE.powerCut[1]);
    let last = -10;
    for (const h of TL.impacts) if (h.t <= t && h.t > SC.city[0] && h.t < SC.city[1]) last = h.t;
    u.uScan.value = Math.exp(-(t - last) * 1.4);
    u.uScanZ.value = camera.position.z - (t - last) * 90;
    u.uSurge.value = impactEnvelope(t, 3.5, (a) => a) * 0.7;
    // Billboard around the vertical axis so the beam never goes edge-on.
    city.beam.rotation.y = Math.atan2(camera.position.x - city.beam.position.x, camera.position.z - city.beam.position.z);
    city.beamMat.uniforms.uBeam.value = easeOutExpo(seg(t, CUE.beamOn, CUE.beamOn + 0.5)) * (1 - seg(t, CUE.powerCut[0], CUE.powerCut[1] - 0.05)) * (0.85 + 0.15 * Math.sin(t * 9));
  }

  // Population.
  pop.group.visible = inScene(t, SC.pop) && !ai;
  if (pop.group.visible) {
    const m = pop.mat.uniforms;
    m.uTime.value = t;
    m.uAppear.value = seg(t, CUE.popAppear[0], CUE.popAppear[1]);
    m.uDie.value = 0.299 * popProgress(t); // 5,167만 → 3,622만 = −29.9%
    m.uOld.value = 0.477 * easeOut(seg(t, CUE.popOld[0], CUE.popOld[1]));
    m.uPulse.value = hb;
    m.uPixel.value = innerHeight / 1080;
  }

  // Climax.
  climax.group.visible = inScene(t, SC.climax) && !ai;
  const pr = easeOut(seg(t, CUE.climaxDraw[0], CUE.climaxDraw[1]));
  if (climax.group.visible) {
    climax.gold.set(pr, t);
    climax.red.set(pr, t);
  }
  const [la, lb] = CUE.climaxLabels;
  const labelA = climax.group.visible ? seg(t, la, la + 0.3) * (1 - seg(t, lb, lb + 0.2)) : 0;
  placeLabel(goldLabel, climax.endGold(), labelA);
  placeLabel(redLabel, climax.endRed(), labelA);
  placeLabel(baseLabel, climax.start().add(new THREE.Vector3(0, 0.6, 0)), climax.group.visible ? seg(t, CUE.climaxBase[0], CUE.climaxBase[0] + 0.4) * (1 - seg(t, CUE.climaxBase[1], CUE.climaxBase[1] + 0.3)) : 0);

  // Finale.
  emblem.root.visible = inScene(t, SC.finale) && !ai;
  if (emblem.root.visible) emblem.update(t - CUE.seed, t - CUE.burst, t, hb * 0.5 + Math.max(0, Math.sin((t - CUE.seed) * 5)) * 0.2 * (t < CUE.burst ? 1 : 0));

  // Grade & effects.
  const hit = impactEnvelope(t, 1);
  U.uSeed.value = ((Math.floor(t * 30) * 0.6180339) % 1) + 0.001;
  U.uFlash.value = Math.min(0.85, impactEnvelope(t, 13) * 0.55 + (Math.abs(t - SC.city[0]) < 0.02 ? 0.4 : 0));
  U.uCA.value = 0.0018 + impactEnvelope(t, 6) * 0.012 + (inScene(t, SC.climax) ? Math.pow(seg(t, CUE.climaxDolly[0] - 0.4, CUE.climaxDolly[1]), 2) * 0.02 : 0);
  let glitch = impactEnvelope(t, 10, (a, braam) => (braam ? a * 0.6 : 0));
  if (t >= CUE.turnGlitch[0] && t < CUE.turnGlitch[1]) glitch += 0.35 * (1 - seg(t, CUE.turnGlitch[0], CUE.turnGlitch[1]));
  if (inScene(t, SC.climax)) glitch += Math.pow(seg(t, CUE.climaxDolly[0] - 0.2, CUE.climaxDolly[1]), 2.5) * 0.75;
  U.uGlitch.value = Math.min(1, glitch);
  let red = 0;
  // Ease the red off while survivors turn amber, so the ageing reads as its own colour.
  if (inScene(t, SC.pop)) red = 0.6 * smooth(seg(t, CUE.popRed[0], CUE.popRed[1])) * (1 - 0.65 * seg(t, CUE.popOld[0] - 0.4, CUE.popOld[0] + 0.6));
  if (inScene(t, SC.climax)) red = 0.22 + 0.3 * seg(t, CUE.climaxLabels[0], SC.climax[1]);
  if (inScene(t, SC.cold)) red = 0.15;
  U.uRed.value = red;
  U.uGrain.value = 0.055 + hit * 0.02;
  U.uVignette.value = inScene(t, SC.city) ? 0.6 : 0.85;

  // 3D fades: open from black and the dead-air cuts. Footage slots stay black here; the compositor fills them.
  let f = 1 - seg(t, 0.1, 0.5);
  for (const [c0, c1] of TL.cuts) if (t >= c0 && t < c1) f = 1;
  U.uFade.value = f;
  fade.style.opacity = String(seg(t, DURATION - 0.8, DURATION));

  bloom.strength = inScene(t, SC.city) ? 0.7 : inScene(t, SC.pop) ? 0.75 : inScene(t, SC.climax) ? 0.6 : 0.55;
  bloom.threshold = inScene(t, SC.city) ? 0.62 : inScene(t, SC.finale) ? 0.85 : 0.5;

  animateText(t, shake);
  composer.render();
}

// ---------- drive ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  U.uResolution.value.set(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
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
    renderAt(((now - origin) / 1000) % (DURATION + 1));
    requestAnimationFrame(loop);
  };
  void document.fonts.ready.then(() => requestAnimationFrame(loop));
}
