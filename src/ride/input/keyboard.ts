/** Keyboard and touch fallback controls. */
export class KeyControls {
  private keys = new Set<string>();
  private touches = new Map<number, number>();
  /** Fired on Enter / R / Space-tap style "go" presses. */
  onAction: (() => void) | null = null;
  onMute: (() => void) | null = null;

  constructor(touchTarget: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Enter' || e.code === 'KeyR') this.onAction?.();
      if (e.code === 'KeyM') this.onMute?.();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const update = (e: TouchEvent) => {
      this.touches.clear();
      for (const t of Array.from(e.touches)) this.touches.set(t.identifier, t.clientX / innerWidth);
    };
    touchTarget.addEventListener('touchstart', (e) => {
      update(e);
      if (e.touches.length === 1) this.onAction?.();
    }, { passive: true });
    touchTarget.addEventListener('touchmove', update, { passive: true });
    touchTarget.addEventListener('touchend', update, { passive: true });
    touchTarget.addEventListener('touchcancel', update, { passive: true });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** True while the player is pressing any steering/brake/boost control. */
  get active(): boolean {
    return this.steer !== 0 || this.brake || this.boost;
  }

  get steer(): number {
    let s = 0;
    if (this.has('ArrowLeft', 'KeyA')) s -= 1;
    if (this.has('ArrowRight', 'KeyD')) s += 1;
    if (this.touches.size === 1) {
      const x = [...this.touches.values()][0];
      s += x < 0.5 ? -1 : 1;
    }
    return Math.max(-1, Math.min(1, s));
  }

  get brake(): boolean {
    return this.has('ArrowDown', 'KeyS');
  }

  get boost(): boolean {
    return this.has('Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'KeyW') || this.touches.size >= 2;
  }
}
