import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { DigitColumn, Glyph, RollRow } from '../components/CountUp';
import { colors, fonts } from '../theme';

const LockIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 20 24" fill="none">
    <path d="M5 10V7a5 5 0 0 1 10 0v3" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    <rect x={2} y={10} width={16} height={13} rx={3.5} fill={color} />
  </svg>
);

/** 11:45 → 11:46 PM on a lock screen. Late, and still no idea what today earned. */
export const ClockScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = enter(frame, fps, 0, 'smooth');
  const tick = enter(frame, fps, 34, 'bouncy');
  const zoom = ramp(frame, [0, 90], [1, 1.07]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 60% at 50% 45%, #231E31 0%, ${colors.dark} 70%)`,
        fontFamily: fonts.sans,
        color: colors.inkOnDark,
      }}
    >
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${zoom})`,
          opacity: appear,
          filter: `blur(${(1 - appear) * 12}px)`,
        }}
      >
        <LockIcon size={34} color={colors.mutedOnDark} />
        <div style={{ marginTop: 26, fontSize: 40, fontWeight: 600, color: colors.mutedOnDark, letterSpacing: '0.01em' }}>
          Tuesday, October 14
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4, transform: `translateY(${(1 - appear) * 40}px)` }}>
          <RollRow style={{ fontSize: 300, fontWeight: 800, letterSpacing: '-0.04em' }}>
            <Glyph>11:4</Glyph>
            <DigitColumn position={5 + tick} blur={0} />
          </RollRow>
          <div style={{ fontSize: 96, fontWeight: 700, marginLeft: 28, marginBottom: 62, color: colors.mutedOnDark }}>PM</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
