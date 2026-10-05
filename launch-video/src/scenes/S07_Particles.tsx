import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { Logo } from '../components/Logo';
import { buildParticles, Particles } from '../components/Particles';
import { ServiceLabel } from '../components/TabCard';
import { SERVICES, type ServiceKey } from '../data';
import { colors, fonts } from '../theme';

const RING: { key: ServiceKey; x: number; y: number }[] = [
  { key: 'stripe', x: -560, y: -300 },
  { key: 'paypal', x: 0, y: -390 },
  { key: 'shopify', x: 560, y: -300 },
  { key: 'gumroad', x: 720, y: 20 },
  { key: 'patreon', x: 540, y: 330 },
  { key: 'etsy', x: 0, y: 400 },
  { key: 'upwork', x: -540, y: 330 },
  { key: 'youtube', x: -720, y: 20 },
];
const CENTER = { x: 960, y: 540 };

const PARTICLES = buildParticles({
  sources: RING.map(({ key, x, y }) => ({ x: CENTER.x + x, y: CENTER.y + y, color: SERVICES[key].color })),
  target: CENTER,
  count: 120,
  start: 12,
  spread: 30,
  travel: [20, 30],
  seed: 'gather',
});

/** Every source drains into one place. */
export const ParticlesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Each arrival kicks the mark a little; kicks decay over ~5 frames.
  const kick = PARTICLES.reduce((sum, p) => (frame >= p.arrive ? sum + Math.exp(-(frame - p.arrive) / 5) : sum), 0);
  const grow = ramp(frame, [10, 75], [1, 1.25]);
  const scale = grow * (1 + Math.min(0.18, kick * 0.025));

  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, fontFamily: fonts.sans }}>
      {RING.map(({ key, x, y }, i) => {
        const appear = enter(frame, fps, i * 1.5, 'snappy');
        const drained = ramp(frame, [30, 70], [1, 0.35]);
        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: CENTER.x + x,
              top: CENTER.y + y,
              transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * appear})`,
              opacity: appear * drained,
            }}
          >
            <ServiceLabel service={SERVICES[key]} size={32} />
          </div>
        );
      })}
      <Particles particles={PARTICLES} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${scale})` }}>
          <Logo height={96} wordmark={false} delay={-30} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
