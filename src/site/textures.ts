import * as THREE from 'three';

/** Deterministic PRNG so every load builds the exact same burger. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in [0, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise in roughly [0, 1]. */
export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}

/** Periodic noise around a circle, so lathe/cylinder seams line up. */
export function ringNoise(angle: number, freq: number, seed: number): number {
  return fbm(Math.cos(angle) * freq + seed, Math.sin(angle) * freq + seed * 1.7, 3);
}

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number, h: number) => void,
  color = true,
  height = size,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = height;
  const ctx = c.getContext('2d')!;
  draw(ctx, size, height);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Grayscale fBm speckle, used as a bump map for crust, crumb and paper. */
export function noiseTexture(size: number, scale: number, contrast = 1, seed = 0): THREE.CanvasTexture {
  return canvasTexture(
    size,
    (ctx, s) => {
      const img = ctx.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          // Tileable: sample a torus-ish domain by blending wrapped coordinates.
          const n = fbm((x / s) * scale + seed, (y / s) * scale + seed * 2.1, 4);
          const v = Math.max(0, Math.min(255, 128 + (n - 0.5) * 255 * contrast));
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    false,
  );
}

/** Seared crust: dark brown with charred and lighter spots. */
export function pattyTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm((x / s) * 14, (y / s) * 14, 5);
        const m = fbm((x / s) * 40 + 9, (y / s) * 40, 2);
        const t = Math.min(1, Math.max(0, (n - 0.3) * 1.8));
        const r = 40 + t * 85 + m * 30;
        const g = 20 + t * 40 + m * 12;
        const b = 10 + t * 15;
        const i = (y * s + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Toasted crumb for the cut faces of the bun. */
export function crumbTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#d98e3f');
    g.addColorStop(0.75, '#c27428');
    g.addColorStop(1, '#8f4a17');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${90 + r() * 60},${40 + r() * 30},10,${0.15 + r() * 0.25})`;
      ctx.beginPath();
      ctx.arc(r() * s, r() * s, 0.5 + r() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function pickleTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#4f6b1c';
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.92);
    g.addColorStop(0, '#d7d98a');
    g.addColorStop(0.55, '#b3bd57');
    g.addColorStop(0.85, '#8a9a35');
    g.addColorStop(1, '#3d5513');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.95, 0, Math.PI * 2);
    ctx.fill();
    // Seeds in a ring.
    ctx.fillStyle = 'rgba(240,235,190,0.85)';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(c + Math.cos(a) * c * 0.38, c + Math.sin(a) * c * 0.38, 9, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function tomatoTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#b8160d';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e0301c';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.93, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      ctx.fillStyle = '#f5674a';
      ctx.beginPath();
      ctx.ellipse(c + Math.cos(a) * c * 0.48, c + Math.sin(a) * c * 0.48, c * 0.27, c * 0.17, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,150,0.8)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(c + Math.cos(a) * c * (0.4 + k * 0.05), c + Math.sin(a) * c * (0.4 + k * 0.05), 5, 3, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ff8a6a';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function baconTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    const stops: [number, string][] = [
      [0, '#5a1a0c'],
      [0.18, '#8c2a12'],
      [0.32, '#e6b98a'],
      [0.45, '#9e3214'],
      [0.62, '#6e200d'],
      [0.74, '#e8c095'],
      [0.86, '#8c2a12'],
      [1, '#4a150a'],
    ];
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const r = rng(3);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(30,8,2,${r() * 0.35})`;
      ctx.fillRect(r() * s, r() * s, 2 + r() * 10, 1 + r() * 3);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Plastic cup with shake inside and chocolate syrup running down the wall. */
export function shakeCupTexture(base: string, syrup: string): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const r = rng(11);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r() * 0.15})`;
      ctx.fillRect(r() * s, r() * s, 2, 2);
      ctx.fillStyle = `rgba(40,20,20,${r() * 0.25})`;
      ctx.fillRect(r() * s, r() * s, 3, 3);
    }
    ctx.fillStyle = syrup;
    for (let i = 0; i < 14; i++) {
      const x = (i / 14) * s + r() * 20;
      const w = 10 + r() * 18;
      const len = s * (0.25 + r() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w * 0.8, len - w);
      ctx.arc(x + w / 2, len - w / 2, w * 0.45, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(0, 0, s, 26);
  });
}

export function strawTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#f7f2ea';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8341c';
    for (let i = -s; i < s * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + 8 + s, s);
      ctx.lineTo(i + s, s);
      ctx.fill();
    }
  });
  t.repeat.set(1, 6);
  return t;
}

/** The circular KO badge, drawn on a 2D canvas. */
export function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.fillStyle = '#ff4a1c';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff4ea';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff4ea';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${r * 0.95}px Anton, Impact, sans-serif`;
  ctx.fillText('KO', cx, cy + r * 0.04);
  ctx.font = `${r * 0.16}px Anton, Impact, sans-serif`;
  ctx.fillText('★ EST. 2026 ★', cx, cy + r * 0.62);
  ctx.restore();
}

/** Front panel of the takeout box: badge + wordmark on matte black (aspect matches the wall). */
export function boxFrontTexture(aspect: number): THREE.CanvasTexture {
  const w = 2048;
  return canvasTexture(
    w,
    (ctx, s, h) => {
      ctx.fillStyle = '#121112';
      ctx.fillRect(0, 0, s, h);
      ctx.fillStyle = '#ff4a1c';
      ctx.fillRect(0, h * 0.9, s, h * 0.03);
      const r = h * 0.34;
      drawBadge(ctx, s * 0.3, h * 0.47, r);
      ctx.fillStyle = '#f4efe6';
      ctx.textBaseline = 'middle';
      ctx.font = `${h * 0.42}px Anton, Impact, sans-serif`;
      ctx.fillText('KNOCKOUT', s * 0.3 + r * 1.3, h * 0.4);
      ctx.fillStyle = '#ff4a1c';
      ctx.font = `${h * 0.14}px Anton, Impact, sans-serif`;
      ctx.fillText('— B U R G E R S —', s * 0.3 + r * 1.35, h * 0.72);
    },
    true,
    Math.round(w / aspect),
  );
}

/** Lid top: big wordmark, "SMASHED FRESH · HIT HARD" strap line. */
export function lidTexture(aspect: number): THREE.CanvasTexture {
  const w = 1536;
  return canvasTexture(
    w,
    (ctx, s, h) => {
    ctx.fillStyle = '#121112';
    ctx.fillRect(0, 0, s, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    for (let i = 0; i < s * 1.5; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - h, h);
      ctx.stroke();
    }
    drawBadge(ctx, s * 0.5, h * 0.36, h * 0.2);
    ctx.fillStyle = '#f4efe6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${h * 0.2}px Anton, Impact, sans-serif`;
    ctx.fillText('KNOCKOUT', s * 0.5, h * 0.7);
    ctx.fillStyle = '#ff4a1c';
    ctx.font = `${h * 0.06}px Anton, Impact, sans-serif`;
    ctx.fillText('SMASHED FRESH · HIT HARD', s * 0.5, h * 0.85);
    },
    true,
    Math.round(w / aspect),
  );
}

/** Paper fries carton printed with the badge. */
export function cartonTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#e8341c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c52611';
    for (let i = 0; i < s; i += 40) ctx.fillRect(i, 0, 14, s);
    drawBadge(ctx, s * 0.5, s * 0.55, s * 0.2);
  });
}

/** Parchment sheet the hero burger sits on. */
export function paperTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, s, s);
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(150,130,100,${0.03 + r() * 0.05})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(r() * s, r() * s);
      ctx.lineTo(r() * s, r() * s);
      ctx.stroke();
    }
    // A couple of grease spots for realism.
    for (let i = 0; i < 6; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 40);
      g.addColorStop(0, 'rgba(220,170,90,0.25)');
      g.addColorStop(1, 'rgba(220,170,90,0)');
      ctx.save();
      ctx.translate(s * 0.3 + r() * s * 0.4, s * 0.3 + r() * s * 0.4);
      ctx.fillStyle = g;
      ctx.fillRect(-80, -80, 160, 160);
      ctx.restore();
    }
  });
}
