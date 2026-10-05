import { Easing, interpolate, random, useCurrentFrame } from 'remotion';
import { CLAMP } from '../anim';

export type Point = { x: number; y: number };
export type ParticleSource = Point & { color: string };

export type Particle = {
  from: Point;
  control: Point;
  to: Point;
  color: string;
  size: number;
  launch: number;
  arrive: number;
};

/**
 * Deterministic particle set: each one leaves a source (with jitter) and curves into `target`.
 * Uses Remotion's seeded random() so every render is identical.
 */
export const buildParticles = ({
  sources,
  target,
  count,
  start,
  spread,
  travel: [minTravel, maxTravel],
  seed = 'particles',
}: {
  sources: ParticleSource[];
  target: Point;
  count: number;
  start: number;
  spread: number;
  travel: [number, number];
  seed?: string;
}): Particle[] =>
  Array.from({ length: count }, (_, i) => {
    const r = (k: string) => random(`${seed}-${i}-${k}`);
    const source = sources[i % sources.length];
    const from = { x: source.x + (r('jx') - 0.5) * 70, y: source.y + (r('jy') - 0.5) * 40 };
    const mid = { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 };
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (r('bend') - 0.5) * len * 0.5;
    const launch = start + r('launch') * spread;
    return {
      from,
      control: { x: mid.x + (-dy / len) * bend, y: mid.y + (dx / len) * bend },
      to: target,
      color: source.color,
      size: 10 + r('size') * 14,
      launch,
      arrive: launch + minTravel + r('travel') * (maxTravel - minTravel),
    };
  });

const bezier = (p: Particle, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * p.from.x + 2 * u * t * p.control.x + t * t * p.to.x,
    y: u * u * p.from.y + 2 * u * t * p.control.y + t * t * p.to.y,
  };
};

const ease = Easing.inOut(Easing.cubic);
const TRAIL = [0, 0.035, 0.07];

/** Renders particles in absolute pixel coordinates of the parent. */
export const Particles: React.FC<{ particles: Particle[] }> = ({ particles }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {particles.flatMap((p, i) => {
        const linear = interpolate(frame, [p.launch, p.arrive], [0, 1], CLAMP);
        if (linear <= 0 || linear >= 1) return [];
        return TRAIL.map((lag, k) => {
          const t = ease(Math.max(0, linear - lag));
          const { x, y } = bezier(p, t);
          const size = p.size * interpolate(t, [0, 0.8, 1], [1, 0.9, 0.35]) * (1 - k * 0.22);
          const opacity = interpolate(t, [0, 0.08, 0.85, 1], [0, 1, 1, 0]) * (1 - k * 0.38);
          return (
            <div
              key={`${i}-${k}`}
              style={{
                position: 'absolute',
                left: x - size / 2,
                top: y - size / 2,
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: p.color,
                opacity,
              }}
            />
          );
        });
      })}
    </>
  );
};
