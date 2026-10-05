/**
 * Scroll-scrubbed film: each scene is a folder of numbered WebP frames cut from a
 * Higgsfield-generated clip. Scroll progress picks a frame and paints it onto one
 * canvas (object-fit: cover), cross-fading where scenes overlap.
 */

export interface Scene {
  /** Folder under seq/ holding 001.webp … */
  name: string;
  frames: number;
  /** Global progress where the scene starts playing and where it reaches its last frame. */
  from: number;
  to: number;
  /** Progress span over which this scene fades in over the previous one. */
  fade: number;
  theme: 'light' | 'dark';
  /**
   * Horizontal point of the frame (0..1) kept centred when the screen is narrower
   * than the footage, at the scene's start and end. Lets phones follow the subject.
   */
  focus: [number, number];
  /**
   * Portrait screens only: shrink the frame to this share of the screen height and
   * sit it at the bottom, filling the rest with the footage's own backdrop colour.
   * For clips shot on a seamless background, so phones see the whole subject.
   */
  narrowScale?: number;
}

export interface Cover {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export class Story {
  private ctx: CanvasRenderingContext2D;
  private frames: (HTMLImageElement | null)[][];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastKey = '';
  private backdrop: (string | null)[];

  constructor(
    private canvas: HTMLCanvasElement,
    readonly scenes: Scene[],
    private base = 'seq/',
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.frames = scenes.map((s) => new Array(s.frames).fill(null));
    this.backdrop = scenes.map(() => null);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private src(scene: number, i: number): string {
    return `${this.base}${this.scenes[scene].name}/${String(i + 1).padStart(3, '0')}.webp`;
  }

  /** Loads every frame of a scene, a few at a time, reporting progress 0..1. */
  async load(scene: number, onProgress: (f: number) => void = () => {}): Promise<void> {
    const n = this.scenes[scene].frames;
    let done = 0;
    // Key frames first (every 8th) so scrubbing works while the rest stream in.
    const order = [...Array(n).keys()].sort((a, b) => (a % 8 === 0 ? 0 : 1) - (b % 8 === 0 ? 0 : 1) || a - b);
    const queue = order.slice();
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift()!;
        const img = new Image();
        img.decoding = 'async';
        img.src = this.src(scene, i);
        try {
          await img.decode();
          this.frames[scene][i] = img;
        } catch {
          // A missing frame just falls back to its nearest neighbour.
        }
        onProgress(++done / n);
        this.lastKey = '';
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth || window.innerWidth;
    this.height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.lastKey = '';
  }

  /** Where a scene's frame lands on screen (CSS px), for pinning labels to the footage. */
  cover(scene: number, p: number): Cover {
    const img = this.firstLoaded(scene);
    const iw = img?.naturalWidth || 1920;
    const ih = img?.naturalHeight || 1080;
    const s = this.scenes[scene];
    const t = this.local(scene, p);
    const focus = s.focus[0] + (s.focus[1] - s.focus[0]) * t;
    let k = Math.max(this.width / iw, this.height / ih);
    const shrink = s.narrowScale && this.height > this.width ? s.narrowScale : 0;
    if (shrink) k = (this.height * shrink) / ih;
    const dw = iw * k;
    const dh = ih * k;
    const dx = Math.min(0, Math.max(this.width - dw, this.width / 2 - focus * dw));
    const dy = shrink ? this.height - dh - this.height * 0.04 : (this.height - dh) / 2;
    return { dx, dy, dw, dh };
  }

  local(scene: number, p: number): number {
    const s = this.scenes[scene];
    return Math.min(1, Math.max(0, (p - s.from) / (s.to - s.from)));
  }

  /** Index of the scene that owns progress p (the latest one that has started). */
  sceneAt(p: number): number {
    let idx = 0;
    this.scenes.forEach((s, i) => {
      if (p >= s.from - s.fade) idx = i;
    });
    return idx;
  }

  render(p: number): void {
    // Draw the scene underneath, then the incoming one with its fade.
    const top = this.sceneAt(p);
    const s = this.scenes[top];
    const alpha = s.fade > 0 ? Math.min(1, Math.max(0, (p - (s.from - s.fade)) / s.fade)) : 1;
    const key = `${top}:${this.frameIndex(top, p)}:${alpha.toFixed(3)}:${this.width}x${this.height}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    // Scene changes dip through near-black instead of double-exposing two shots.
    if (alpha < 0.5 && top > 0) this.drawScene(top - 1, p);
    else this.drawScene(top, p);
    const dip = alpha < 1 ? 1 - Math.abs(alpha - 0.5) * 2 : 0;
    if (dip > 0) {
      ctx.fillStyle = `rgba(15, 13, 12, ${(dip * 0.96).toFixed(3)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private frameIndex(scene: number, p: number): number {
    return Math.round(this.local(scene, p) * (this.scenes[scene].frames - 1));
  }

  private nearest(scene: number, i: number): HTMLImageElement | null {
    const list = this.frames[scene];
    for (let d = 0; d < list.length; d++) {
      if (list[i - d]) return list[i - d];
      if (list[i + d]) return list[i + d];
    }
    return null;
  }

  private firstLoaded(scene: number): HTMLImageElement | null {
    return this.frames[scene].find(Boolean) ?? null;
  }

  private drawScene(scene: number, p: number): void {
    const img = this.nearest(scene, this.frameIndex(scene, p));
    if (!img) return;
    const c = this.cover(scene, p);
    const ctx = this.ctx;
    if (c.dh < this.height - 1) {
      // Shrunk frame: paint the backdrop, the frame, then feather its top edge into it.
      const bg = this.backdropOf(scene, img);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.drawImage(img, c.dx, c.dy, c.dw, c.dh);
      const g = ctx.createLinearGradient(0, c.dy, 0, c.dy + c.dh * 0.18);
      g.addColorStop(0, bg);
      // Fade to the same colour at zero alpha; fading to transparent black would grey the edge.
      g.addColorStop(1, bg.replace('rgb(', 'rgba(').replace(')', ', 0)'));
      ctx.fillStyle = g;
      ctx.fillRect(0, c.dy - 1, this.width, c.dh * 0.18 + 1);
      return;
    }
    ctx.drawImage(img, c.dx, c.dy, c.dw, c.dh);
  }

  /** Average colour of a frame's top strip: the seamless backdrop it was shot on. */
  private backdropOf(scene: number, img: HTMLImageElement): string {
    const cached = this.backdrop[scene];
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * 0.04, 0, 0, 16, 1);
    const d = x.getImageData(0, 0, 16, 1).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 16; i++) {
      r += d[i * 4];
      g += d[i * 4 + 1];
      b += d[i * 4 + 2];
    }
    return (this.backdrop[scene] = `rgb(${Math.round(r / 16)}, ${Math.round(g / 16)}, ${Math.round(b / 16)})`);
  }
}
