import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { SLOGAN } from '../cues';
import { colors, fonts } from '../theme';

const FEWER = 'Fewer'.split('');
const TABS = 'tabs.'.split('');
const SIZE = 270;

/** "Fewer" rises letter by letter; each letter of "tabs." folds down like a browser tab and sheds its card. */
export const SloganScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = ramp(frame, [0, 90], [1, 1.04]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.light,
        fontFamily: fonts.sans,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          fontSize: SIZE,
          fontWeight: 800,
          letterSpacing: '-0.045em',
          lineHeight: 1,
          transform: `scale(${drift})`,
        }}
      >
        {FEWER.map((ch, i) => {
          const p = enter(frame, fps, SLOGAN.fewerStart + i * SLOGAN.fewerStagger, 'snappy');
          return (
            <span key={i} style={{ display: 'inline-block', color: colors.inkOnLight, opacity: p, transform: `translateY(${(1 - p) * 0.45 * SIZE}px)` }}>
              {ch}
            </span>
          );
        })}
        <span style={{ display: 'inline-block', width: '0.2em' }} />
        <span style={{ display: 'flex', perspective: 900 }}>
          {TABS.map((ch, i) => {
            const delay = SLOGAN.tabsStart + i * SLOGAN.tabsStagger;
            const fold = enter(frame, fps, delay, 'snappy');
            const shed = ramp(frame, [delay + 8, delay + 18], [1, 0]);
            return (
              <span
                key={i}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  color: colors.accent,
                  opacity: ramp(frame, [delay, delay + 3], [0, 1]),
                  transform: `rotateX(${(1 - fold) * -95}deg)`,
                  transformOrigin: 'top center',
                }}
              >
                {/* The tab card the letter arrives in. */}
                <span
                  style={{
                    position: 'absolute',
                    left: '-0.025em',
                    right: '-0.025em',
                    top: '0.06em',
                    bottom: '-0.05em',
                    borderRadius: '0.09em 0.09em 0.03em 0.03em',
                    backgroundColor: colors.cardOnLight,
                    border: `0.008em solid ${colors.cardBorderOnLight}`,
                    boxShadow: '0 0.06em 0.14em rgba(20,18,28,0.10)',
                    opacity: shed,
                    transform: `scale(${0.96 + 0.04 * shed})`,
                  }}
                />
                <span style={{ position: 'relative' }}>{ch}</span>
              </span>
            );
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
};
