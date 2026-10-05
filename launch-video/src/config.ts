import type { SpringConfig } from 'remotion';

// Pure constants (no fonts, no DOM) so Node scripts such as the soundtrack generator can import them.

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

/** Spring presets. Every entrance uses one of these; damping stays in 12–20. */
export const springs = {
  /** Default entrance: quick, a touch of overshoot. */
  snappy: { damping: 14, stiffness: 180, mass: 0.8 } satisfies Partial<SpringConfig>,
  /** Calm settle for the light half of the film. */
  smooth: { damping: 20, stiffness: 120, mass: 1 } satisfies Partial<SpringConfig>,
  /** Noticeable bounce for pops (counters, logo). */
  bouncy: { damping: 12, stiffness: 200, mass: 0.7 } satisfies Partial<SpringConfig>,
} as const;
