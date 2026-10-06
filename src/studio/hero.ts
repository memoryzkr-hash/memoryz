import * as THREE from 'three';

// Ashima Arts 3D simplex noise (MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const BLOB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec3 uPointer;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vNoise;
${NOISE}

float field(vec3 p){
  float n = snoise(p * 0.9 + vec3(0.0, uTime * 0.22, 0.0));
  n += snoise(p * 2.3 - vec3(uTime * 0.35)) * 0.32;
  return n;
}

vec3 displace(vec3 p){
  vec3 dir = normalize(p);
  float d = field(p) * uAmp;
  // The surface swells towards the pointer.
  d += pow(max(dot(dir, uPointer), 0.0), 5.0) * 0.32;
  return p + dir * d;
}

void main(){
  vec3 p = displace(position);
  vec3 up = abs(normal.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(normal, up));
  vec3 b = normalize(cross(normal, t));
  float e = 0.012;
  vec3 n = normalize(cross(displace(position + t * e) - p, displace(position + b * e) - p));
  if (dot(n, normal) < 0.0) n = -n;
  vNormal = normalize(normalMatrix * n);
  vNoise = field(position);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const BLOB_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uHot;
uniform vec3 uBone;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vNoise;

void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vViewPos);
  vec3 l = normalize(vec3(-0.5, 0.9, 0.7));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 70.0);
  // Thin bands that drift across the surface, like heat on metal.
  float band = 0.5 + 0.5 * sin(dot(n, vec3(2.6, 1.7, 0.9)) * 3.2 + uTime * 0.5 + vNoise * 3.5);

  vec3 col = mix(uDeep, uMid, diff * 0.85);
  col = mix(col, uHot, smoothstep(0.45, 1.0, band) * (0.25 + fres));
  col += uBone * spec * 0.8;
  col = mix(col, uBone, pow(fres, 3.0) * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const DUST_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSeed;
varying float vAlpha;
void main(){
  vec3 p = position;
  p.y += mod(uTime * (0.05 + aSeed * 0.12) + aSeed * 10.0, 8.0) - 4.0;
  p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.15;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.0 + aSeed * 2.5) * uPixelRatio * (6.0 / -mv.z);
  vAlpha = 0.25 + aSeed * 0.55;
}
`;

const DUST_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(1.0, 0.93, 0.85, smoothstep(0.5, 0.0, d) * vAlpha);
}
`;

/** The molten blob behind the hero headline, plus drifting dust. */
export class HeroScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private readonly blob: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pointer = new THREE.Vector2();
  private readonly pointerSmooth = new THREE.Vector2();
  private readonly timer = new THREE.Timer();
  private progress = 0;
  private visible = true;
  private frame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly animate: boolean,
  ) {
    const mobile = matchMedia('(max-width: 899px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.camera.position.set(0, 0, 6);

    this.blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, mobile ? 40 : 64),
      new THREE.ShaderMaterial({
        vertexShader: BLOB_VERTEX,
        fragmentShader: BLOB_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.22 },
          uPointer: { value: new THREE.Vector3(0, 0, 1) },
          uDeep: { value: new THREE.Color('#120a06') },
          uMid: { value: new THREE.Color('#5a1e08') },
          uHot: { value: new THREE.Color('#ff5a1f') },
          uBone: { value: new THREE.Color('#efe9df') },
        },
      }),
    );
    this.scene.add(this.blob);

    const count = mobile ? 500 : 1400;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
      seeds[i] = Math.random();
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.dust);

    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible && this.animate && !this.frame) this.loop();
    }).observe(canvas);

    this.resize();
    if (animate) this.loop();
    else this.render(0);
  }

  /** 0 at the top of the page, 1 once the hero has scrolled out. */
  setProgress(p: number): void {
    this.progress = p;
    if (!this.animate) this.render(0);
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (!this.visible) {
      this.frame = 0;
      return;
    }
    this.timer.update();
    this.render(this.timer.getDelta());
    this.frame = requestAnimationFrame(this.loop);
  };

  private render(dt: number): void {
    const t = this.timer.getElapsed();
    const wide = this.camera.aspect > 1;
    const u = this.blob.material.uniforms;
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 4));

    u.uTime.value = t;
    u.uAmp.value = 0.22 + this.progress * 0.35;
    (u.uPointer.value as THREE.Vector3).set(this.pointerSmooth.x, this.pointerSmooth.y, 0.9).normalize();
    this.dust.material.uniforms.uTime.value = t;

    // Sits to the right of the headline on wide screens, above it on phones.
    const baseX = wide ? Math.min(1.9, this.camera.aspect * 0.95) : 0;
    const baseY = wide ? 0.25 : 0.95;
    const scale = (wide ? 1 : 0.85) * (1 + this.progress * 0.6);
    this.blob.position.set(baseX, baseY + this.progress * 1.2, 0);
    this.blob.scale.setScalar(scale);
    this.blob.rotation.x = t * 0.08 + this.pointerSmooth.y * 0.35 + this.progress * 1.5;
    this.blob.rotation.y = t * 0.12 + this.pointerSmooth.x * 0.5;
    this.dust.rotation.y = this.pointerSmooth.x * 0.08;
    this.dust.position.y = this.progress * 1.5;

    this.renderer.render(this.scene, this.camera);
  }
}
