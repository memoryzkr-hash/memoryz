import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter } from '../anim';
import { CountUp } from '../components/CountUp';
import { COUNT } from '../cues';
import { colors, fonts } from '../theme';
import { labelStyle, NUMBER_Y, numberStyle } from './shared';

/** One number, all sources: today's total ticks up into place. */
export const CountUpScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const label = enter(frame, fps, COUNT.label, 'smooth');
  const number = enter(frame, fps, COUNT.number, 'smooth');

  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, fontFamily: fonts.sans, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${NUMBER_Y}px)` }}>
        <div style={{ ...labelStyle, opacity: label, transform: `translateY(${(1 - label) * 20}px)` }}>Total earned today</div>
        <div style={{ opacity: number, transform: `translateY(${(1 - number) * 50}px)` }}>
          <CountUp from={COUNT.from} to={COUNT.to} start={COUNT.start} duration={COUNT.duration} prefix="$" style={numberStyle} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
