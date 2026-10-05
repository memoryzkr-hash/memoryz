import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BIKE, CRASH } from '../core/constants';
import type { RideEvent, RideState } from '../core/sim';
import { buildBike, Cockpit, RiderModel, Sparks } from './bike';
import { Dashboard } from './dashboard';
import { COLORS, FOG_DENSITY, RoadWorld } from './road';
import { TrafficView } from './vehicles';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    vignette: { value: 0.35 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    darken: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float vignette;
    uniform float flash;
    uniform vec3 flashColor;
    uniform float darken;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(d, d) * 2.4;
      c.rgb *= 1.0 - darken;
      c.rgb += flashColor * flash;
      gl_FragColor = c;
    }
  `,
};

const EYE = new THREE.Vector3(0, 1.32, 0.12);
const BLOOM = 0.7;

export class RideRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly road: RoadWorld;
  private readonly traffic = new TrafficView();
  private readonly dashboard = new Dashboard();
  private readonly cockpit: Cockpit;
  private readonly bike = buildBike();
  private readonly rider = new RiderModel();
  private readonly sparks = new Sparks();
  /** Lean pivot at the tyre's contact patch. */
  private readonly rig = new THREE.Object3D();
  private time = 0;
  private shake = 0;
  private flash = 0;
  private crashFrom: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly lookM = new THREE.Matrix4();

  constructor(container: HTMLElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    container.appendChild(r.domElement);

    this.scene.background = COLORS.fog;
    this.scene.fog = new THREE.FogExp2(COLORS.fog, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.03, 1200);
    this.scene.add(this.camera, this.rig);

    this.scene.add(new THREE.HemisphereLight(0x7a6cff, 0x1a0a30, 0.75));
    const moon = new THREE.DirectionalLight(0xc0b0ff, 0.6);
    moon.position.set(-20, 40, -30);
    this.scene.add(moon);

    this.road = new RoadWorld(r.capabilities.getMaxAnisotropy());
    this.scene.add(this.road.group, this.traffic.group, this.sparks.points);

    this.cockpit = new Cockpit(this.dashboard.texture);
    this.camera.add(this.cockpit.group);

    this.bike.visible = false;
    this.rider.group.visible = false;
    this.scene.add(this.bike, this.rider.group);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, 0.45, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.cockpit.fit(this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  /** Reacts to sim events with sparks, shake and flashes. */
  handle(events: readonly RideEvent[], state: RideState): void {
    const b = state.bike;
    for (const e of events) {
      if (e.type === 'scrape') {
        this.shake = Math.max(this.shake, 0.08);
        this.sparks.emit(b.x + e.side * 0.5, 0.5, b.z + 1.5, -e.side * 2, b.speed * 0.9, 40, 5);
      } else if (e.type === 'crash') {
        this.shake = 0.6;
        this.flash = 0.9;
        this.sparks.emit(b.x, 0.8, b.z + 1.2, 0, 8, 160, 9);
      } else if (e.type === 'bounce' && state.crash) {
        const body = e.body === 'rider' ? state.crash.rider : state.crash.bike;
        this.shake = Math.max(this.shake, Math.min(0.3, e.speed * 0.03));
        if (e.body === 'bike') this.sparks.emit(body.x, 0.1, body.z, body.vx, body.vz, 30, 4);
      } else if (e.type === 'nearMiss') {
        this.flash = Math.max(this.flash, 0.12);
      }
    }
  }

  render(state: RideState, steer: number, dt: number): void {
    this.time += dt;
    const b = state.bike;
    const ref = b.z;
    const crash = state.crash;

    this.road.update(ref, this.camera);
    this.traffic.update(state.cars, ref, this.time);
    this.sparks.update(dt, ref);

    // While scraping the barrier, keep throwing sparks.
    if (state.phase === 'riding' && b.scrapeCooldown > BIKE.barrierCooldown * 0.4) {
      this.sparks.emit(b.x + Math.sign(b.x) * 0.45, 0.3, b.z + 1, -Math.sign(b.x), b.speed * 0.85, 4, 3);
    }

    const speedK = Math.min(1.3, b.speed / BIKE.maxSpeed);
    const kmh = b.speed * 3.6;
    this.dashboard.draw(kmh, state.boost, b.boosting);

    // First-person rig: lean around the tyre contact patch and yaw slightly into the turn.
    this.rig.position.set(b.x, 0, 0);
    this.rig.rotation.set(0, -Math.atan2(b.vx, Math.max(b.speed, 8)) * 0.6, -b.lean * 0.8, 'YXZ');
    this.rig.updateMatrixWorld();

    if (!crash) {
      this.crashFrom = null;
      this.camera.position.copy(EYE).applyMatrix4(this.rig.matrixWorld);
      this.camera.quaternion.copy(this.rig.quaternion);
      this.cockpit.group.visible = true;
      this.cockpit.update(steer, this.time, b.speed);
      this.bike.visible = false;
      this.rider.group.visible = false;
      const fov = 66 + speedK * 16 + (b.boosting ? 8 : 0);
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.bloom.strength = BLOOM + (b.boosting ? 0.3 : 0);
      this.grade.uniforms.saturation.value = 1;
      this.grade.uniforms.darken.value = 0;
      this.grade.uniforms.vignette.value = 0.35 + speedK * 0.25;
    } else {
      if (!this.crashFrom) this.crashFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
      this.cockpit.group.visible = false;
      this.bike.visible = true;
      this.rider.group.visible = true;
      this.bike.position.set(crash.bike.x, crash.bike.y, -(crash.bike.z - ref));
      this.bike.rotation.set(crash.bike.rx, crash.bike.ry, crash.bike.rz);
      this.rider.update(crash.rider, ref, this.time);

      // Pull out to a slowly orbiting chase camera on the rider.
      const target = this.rider.group.position;
      // Start behind the rider, then swing slowly round from the side nearer the middle of the road.
      const side = crash.rider.x > 0 ? -1 : 1;
      const orbit = side * (0.25 + crash.t * 0.18);
      const dist = 4.3;
      const chase = this.tmpV.set(target.x + Math.sin(orbit) * dist, Math.max(1.8, target.y + 1.6), target.z + Math.cos(orbit) * dist);
      const k = THREE.MathUtils.smoothstep(crash.t, 0, 0.45);
      this.camera.position.lerpVectors(this.crashFrom.pos, chase, k);
      this.lookM.lookAt(this.camera.position, target, THREE.Object3D.DEFAULT_UP);
      this.tmpQ.setFromRotationMatrix(this.lookM);
      this.camera.quaternion.slerpQuaternions(this.crashFrom.quat, this.tmpQ, k);
      this.camera.fov += (58 - this.camera.fov) * Math.min(1, dt * 2);

      // Drain the colour as WASTED comes in.
      const w = THREE.MathUtils.smoothstep(crash.t, CRASH.wastedAfter - 0.4, CRASH.wastedAfter + 0.3);
      this.grade.uniforms.saturation.value = 1 - w;
      this.grade.uniforms.darken.value = w * 0.25;
      this.grade.uniforms.vignette.value = 0.6 + w * 0.6;
      this.bloom.strength = BLOOM - w * 0.3;
    }

    if (this.shake > 0) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    } else if (!crash && speedK > 0.6) {
      // High-speed wobble.
      this.camera.position.y += Math.sin(this.time * 31) * 0.004 * speedK;
    }
    this.grade.uniforms.flash.value = this.flash;
    this.flash = Math.max(0, this.flash - dt * 3);

    this.camera.updateProjectionMatrix();
    this.composer.render(dt);
  }
}
