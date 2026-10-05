import { interpolate, spring, type EasingFunction } from 'remotion';
import { springs } from './theme';

export type SpringPreset = keyof typeof springs;

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 spring that starts `delay` frames into the current sequence. */
export const enter = (
  frame: number,
  fps: number,
  delay = 0,
  preset: SpringPreset = 'snappy',
): number => spring({ frame: frame - delay, fps, config: springs[preset] });

/** Clamped interpolate over a single frame range. */
export const ramp = (
  frame: number,
  [start, end]: [number, number],
  [from, to]: [number, number] = [0, 1],
  easing?: EasingFunction,
): number => interpolate(frame, [start, end], [from, to], { ...CLAMP, easing });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
