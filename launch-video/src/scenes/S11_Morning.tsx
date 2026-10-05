import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { AccentWord } from '../components/AccentWord';
import { PhoneMockup } from '../components/PhoneMockup';
import { MORNING } from '../cues';
import { colors, fonts } from '../theme';

const PHONE_W = 400;
const PHONE_H = PHONE_W * 2.05;
const PHONE_Y = 20; // centre offset

const AppIcon: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: size * 0.24,
      backgroundColor: colors.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.62} height={size * 0.55} viewBox="0 0 112 100">
      {[14, 36, 58, 80].map((x) => (
        <line key={x} x1={x} y1={14} x2={x} y2={86} stroke="#fff" strokeWidth={13} strokeLinecap="round" />
      ))}
      <line x1={4} y1={80} x2={108} y2={22} stroke={colors.dark} strokeWidth={13} strokeLinecap="round" />
    </svg>
  </div>
);

const LockScreen: React.FC<{ notification: number }> = ({ notification }) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(180deg, #F9D9B8 0%, #F4A66E 45%, #E9763A 75%, #B9461F 100%)',
      fontFamily: fonts.sans,
      color: '#FFFFFF',
      alignItems: 'center',
    }}
  >
    <div style={{ marginTop: 92, fontSize: 19, fontWeight: 600, opacity: 0.92 }}>Wednesday, October 15</div>
    <div style={{ fontSize: 118, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 2 }}>7:02</div>
    <div
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 150,
        display: 'flex',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.78)',
        boxShadow: '0 10px 30px rgba(80,30,10,0.18)',
        color: colors.inkOnLight,
        opacity: notification,
        transform: `translateY(${(1 - notification) * 90}px) scale(${0.92 + 0.08 * notification})`,
      }}
    >
      <AppIcon size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
          <span>Tally</span>
          <span style={{ fontWeight: 500, color: '#7A766E' }}>now</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3, marginTop: 2 }}>
          You kept <b>$412.00</b> yesterday. 3 subscriptions renew this week.
        </div>
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 12, width: 130, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.85)' }} />
  </AbsoluteFill>
);

const Side: React.FC<{ progress: number; side: 'left' | 'right'; children: React.ReactNode }> = ({ progress, side, children }) => (
  <div
    style={{
      position: 'absolute',
      top: 540 + PHONE_Y - 60,
      [side]: 0,
      width: 960 - PHONE_W / 2 - 80,
      textAlign: side === 'left' ? 'right' : 'left',
      fontSize: 84,
      fontWeight: 800,
      letterSpacing: '-0.035em',
      color: colors.inkOnLight,
      whiteSpace: 'nowrap',
      opacity: progress,
      transform: `translateX(${(1 - progress) * (side === 'left' ? -80 : 80)}px)`,
    }}
  >
    {children}
  </div>
);

/** The payoff: the answer arrives on its own, every morning. */
export const MorningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phone = enter(frame, fps, MORNING.phone, 'smooth');
  const notification = enter(frame, fps, MORNING.notification, 'snappy');
  const left = enter(frame, fps, MORNING.left, 'smooth');
  const right = enter(frame, fps, MORNING.right, 'smooth');
  const float = Math.sin(frame / 22) * 6;
  const glow = ramp(frame, [10, 60], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.cream, fontFamily: fonts.sans }}>
      <div
        style={{
          position: 'absolute',
          left: 960 - 420,
          top: 540 + PHONE_Y + PHONE_H / 2 - 150,
          width: 840,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${colors.accent} 0%, rgba(242,107,29,0) 70%)`,
          filter: 'blur(40px)',
          opacity: 0.55 * glow,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 960 - PHONE_W / 2,
          top: 540 + PHONE_Y - PHONE_H / 2,
          transform: `translateY(${(1 - phone) * 900 + float}px) rotate(${(1 - phone) * 8}deg)`,
        }}
      >
        <PhoneMockup width={PHONE_W}>
          <LockScreen notification={notification} />
        </PhoneMockup>
      </div>
      <Side progress={left} side="left">
        Every morning.
      </Side>
      <Side progress={right} side="right">
        before <AccentWord>coffee.</AccentWord>
      </Side>
    </AbsoluteFill>
  );
};
