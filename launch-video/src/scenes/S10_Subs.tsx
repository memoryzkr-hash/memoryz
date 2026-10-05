import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { AccentWord } from '../components/AccentWord';
import { DirectionalBlur } from '../components/DirectionalBlur';
import { colors, fonts } from '../theme';
import { Cents, KeptLabel, labelStyle, NUMBER_Y, numberStyle } from './shared';
import { NumberMorph } from '../components/CountUp';

const BARS = [
  { name: 'Design suite', price: '$55/mo', height: 0.5 },
  { name: 'Cloud storage', price: '$119/mo', height: 1 },
  { name: 'Course you forgot', price: '$40/mo', height: 0.38 },
];
const EXIT = [0, 9] as const;
const exitAt = (f: number) => ramp(f, [EXIT[0], EXIT[1]], [0, 1], Easing.in(Easing.cubic));

/** $412.00 whips away; the reason it isn't more slides in. */
export const SubsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = exitAt(frame);
  const exitSpeed = (exit - exitAt(frame - 1)) * 900;
  const card = enter(frame, fps, 6, 'smooth');

  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, fontFamily: fonts.sans }}>
      {exit < 1 ? (
        <DirectionalBlur
          y={exitSpeed * 0.12}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateY(${-exit * 900}px)`, opacity: 1 - exit * 0.6 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${NUMBER_Y}px)` }}>
            <div style={{ ...labelStyle, color: colors.inkOnLight, height: (labelStyle.fontSize as number) * 1.25 }}>
              <KeptLabel />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', transform: 'scale(1.05)' }}>
              <NumberMorph from={412} to={412} prefix="$" style={numberStyle} />
              <Cents />
            </div>
          </div>
        </DirectionalBlur>
      ) : null}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 1200,
            padding: '56px 64px 52px',
            borderRadius: 44,
            backgroundColor: colors.cardOnLight,
            border: `2px solid ${colors.cardBorderOnLight}`,
            boxShadow: '0 50px 120px rgba(20,18,28,0.12)',
            opacity: card,
            transform: `translateY(${(1 - card) * 500}px) rotate(${(1 - card) * 4}deg)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 600, color: colors.mutedOnLight }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: colors.accent }} />
            Subscriptions · this month
          </div>
          <div style={{ marginTop: 14, fontSize: 76, fontWeight: 800, letterSpacing: '-0.035em', color: colors.inkOnLight, lineHeight: 1.1 }}>
            Your subs are <AccentWord>bleeding</AccentWord> money
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 80, height: 300, marginTop: 40 }}>
            {BARS.map((bar, i) => {
              const grow = enter(frame, fps, 16 + i * 5, 'snappy');
              return (
                <div key={bar.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 220 }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: colors.inkOnLight, opacity: grow, marginBottom: 12 }}>{bar.price}</div>
                  <div
                    style={{
                      width: 150,
                      height: 220 * bar.height,
                      borderRadius: '20px 20px 6px 6px',
                      background: `linear-gradient(180deg, #F68A45 0%, ${colors.accent} 100%)`,
                      transform: `scaleY(${grow})`,
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 80, marginTop: 16 }}>
            {BARS.map((bar) => (
              <div key={bar.name} style={{ width: 220, textAlign: 'center', fontSize: 24, fontWeight: 500, color: colors.mutedOnLight, opacity: card }}>
                {bar.name}
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
