import { CameraMotionBlur } from '@remotion/motion-blur';
import { AbsoluteFill, Easing, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { AccentWord } from '../components/AccentWord';
import { AmountCard } from '../components/TabCard';
import { SERVICES, type ServiceKey } from '../data';
import { colors, fonts } from '../theme';

const KEYS = Object.keys(SERVICES) as ServiceKey[];
const LABELS = ['Payout', 'Balance', 'Pending', 'Sales', 'Tips', 'Earnings', 'Refunds', 'Fees'];
const COUNT = 44;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const CARDS = Array.from({ length: COUNT }, (_, i) => {
  const r = (k: string) => random(`vortex-${i}-${k}`);
  return {
    service: SERVICES[KEYS[i % KEYS.length]],
    label: LABELS[Math.floor(r('label') * LABELS.length)],
    amount: `$${(20 + r('amt') * 1900).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    angle: i * GOLDEN,
    radius: 260 + Math.sqrt(i / COUNT) * 900,
    z: (r('z') - 0.6) * 900,
    delay: i * 0.7,
  };
});

const Vortex: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / 75;
  const spread = ramp(frame, [0, 60], [0.35, 1.05], Easing.out(Easing.cubic)) + ramp(frame, [58, 75], [0, 0.9], Easing.in(Easing.cubic));
  const tilt = ramp(frame, [0, 75], [16, 34]);
  const roll = ramp(frame, [0, 75], [-6, 10]);

  return (
    <AbsoluteFill style={{ perspective: 1300, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tilt}deg) rotateZ(${roll}deg) scale(1.1)` }}>
        {CARDS.map((card, i) => {
          const appear = enter(frame, fps, card.delay, 'snappy');
          // Inner cards spin faster; the whole thing accelerates.
          const swirl = card.angle + (t ** 1.5) * 2.6 * (1400 / (card.radius + 400));
          const radius = card.radius * spread;
          const x = Math.cos(swirl) * radius;
          const y = Math.sin(swirl) * radius * 0.62;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 960,
                top: 540,
                opacity: appear,
                transform: `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${card.z}px) rotateZ(${(swirl * 180) / Math.PI + 90}deg) scale(${0.5 + 0.5 * appear})`,
              }}
            >
              <AmountCard service={card.service} label={card.label} amount={card.amount} size="sm" />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EverywhereScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = enter(frame, fps, 8, 'bouncy');

  return (
    <AbsoluteFill style={{ backgroundColor: colors.dark, fontFamily: fonts.sans }}>
      <CameraMotionBlur shutterAngle={180} samples={6}>
        <Vortex />
      </CameraMotionBlur>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 36% 26% at 50% 50%, rgba(20,18,28,0.95) 0%, rgba(20,18,28,0.7) 60%, rgba(20,18,28,0) 100%)',
          opacity: word,
        }}
      />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 250, lineHeight: 1, opacity: word, transform: `scale(${0.7 + 0.3 * word})` }}>
          <AccentWord style={{ fontSize: '1em' }}>everywhere.</AccentWord>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
