import * as THREE from 'three';

const W = 512;
const H = 256;
const MAX_KMH = 260;
/** Gear upshift points (km/h). */
const GEARS = [0, 35, 65, 100, 140, 185];

export function gearFor(kmh: number): number {
  let g = 1;
  for (let i = 1; i < GEARS.length; i++) if (kmh >= GEARS[i]) g = i + 1;
  return g;
}

/** 0..1 engine rpm inside the current gear (for the tacho and the engine sound). */
export function rpmFor(kmh: number): number {
  const g = gearFor(kmh) - 1;
  const lo = GEARS[g];
  const hi = GEARS[g + 1] ?? MAX_KMH;
  return 0.25 + 0.75 * Math.min(1, (kmh - lo) / (hi - lo));
}

/** The little screen on the handlebars: speed dial, digital km/h, gear and boost meter. */
export class Dashboard {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private lastKey = '';

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0, 0, false);
  }

  draw(kmh: number, boost: number, boosting: boolean): void {
    const key = `${Math.round(kmh)}:${Math.round(boost * 40)}:${boosting}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.ctx;

    g.fillStyle = '#060a1c';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = boosting ? '#ff2bd6' : '#2ef2ff';
    g.lineWidth = 6;
    g.strokeRect(6, 6, W - 12, H - 12);

    // Dial on the left.
    const cx = 150;
    const cy = 150;
    const r = 105;
    const a0 = Math.PI * 0.8;
    const a1 = Math.PI * 2.2;
    g.lineCap = 'round';
    g.lineWidth = 14;
    g.strokeStyle = '#18223f';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    const k = Math.min(1, kmh / MAX_KMH);
    const grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#2ef2ff');
    grad.addColorStop(0.7, '#7b6bff');
    grad.addColorStop(1, '#ff2bd6');
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, a0, a0 + (a1 - a0) * k);
    g.stroke();

    g.lineWidth = 3;
    g.strokeStyle = '#9fb3ff';
    g.fillStyle = '#9fb3ff';
    g.font = 'bold 18px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let v = 0; v <= MAX_KMH; v += 20) {
      const a = a0 + ((a1 - a0) * v) / MAX_KMH;
      const major = v % 40 === 0;
      const r0 = r - (major ? 30 : 22);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
      g.stroke();
      if (major && v > 0) g.fillText(String(v), cx + Math.cos(a) * (r - 46), cy + Math.sin(a) * (r - 46));
    }
    // Needle.
    const na = a0 + (a1 - a0) * k;
    g.strokeStyle = '#ff3d6e';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(na) * (r - 18), cy + Math.sin(na) * (r - 18));
    g.stroke();
    g.fillStyle = '#ff3d6e';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();

    // Digital speed, gear and boost on the right.
    g.textAlign = 'right';
    g.fillStyle = '#ffffff';
    g.font = 'bold 96px system-ui, sans-serif';
    g.fillText(String(Math.round(kmh)), W - 40, 100);
    g.fillStyle = '#7f8bc4';
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillText('km/h', W - 40, 160);
    g.textAlign = 'left';
    g.fillStyle = '#2ef2ff';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(`${gearFor(kmh)}단`, 290, 160);

    g.fillStyle = '#18223f';
    g.fillRect(290, 196, W - 330, 22);
    g.fillStyle = boosting ? '#ffffff' : '#ff2bd6';
    g.fillRect(290, 196, (W - 330) * boost, 22);
    g.fillStyle = '#7f8bc4';
    g.font = 'bold 18px system-ui, sans-serif';
    g.fillText('BOOST', 290, 236);

    this.texture.needsUpdate = true;
  }
}
