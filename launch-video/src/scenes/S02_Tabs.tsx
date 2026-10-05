import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { DigitColumn, Glyph, RollRow } from '../components/CountUp';
import { TabCard } from '../components/TabCard';
import { SERVICES, TABS } from '../data';
import { TABS_CUES } from '../cues';
import { colors, fonts } from '../theme';

// Resting centre of each card, relative to the frame centre. Hand-placed so the pile fills the frame.
const SLOTS: [number, number][] = [
  [-650, -330], [-200, -390], [260, -360], [690, -310], [-760, 20], [-360, -130], [330, -150],
  [740, 70], [-560, 330], [-110, 300], [400, 320], [740, 380], [-30, -430], [-820, 400], [790, -120],
];
const DELAYS = TABS_CUES.delays;
const COUNTER_AT = TABS_CUES.counterAt;

export const TabsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = ramp(frame, [0, 75], [1, 1.06]);
  const counterIn = enter(frame, fps, COUNTER_AT, 'bouncy');
  const bumps = DELAYS.slice(10).map((d) => d + TABS_CUES.bumpLag);
  const ones = bumps.reduce((sum, t) => sum + enter(frame, fps, t, 'snappy'), 0);
  const pop = bumps.reduce((sum, t) => sum + ramp(frame, [t, t + 3], [0, 1]) - ramp(frame, [t + 3, t + 12], [0, 1]), 0);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.dark, fontFamily: fonts.sans, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${camera})` }}>
        {TABS.map((tab, i) => {
          const [tx, ty] = SLOTS[i];
          const len = Math.hypot(tx, ty) || 1;
          const angle = random(`tab-dir-${i}`) * 0.8 - 0.4 + Math.atan2(ty, tx);
          const fromX = tx + Math.cos(angle) * 1500 * (len > 200 ? 1 : 1.2);
          const fromY = ty + Math.sin(angle) * 1100;
          const p = enter(frame, fps, DELAYS[i], 'snappy');
          const prev = enter(frame - 1, fps, DELAYS[i], 'snappy');
          const speed = Math.abs(p - prev);
          const rot = (random(`tab-rot-${i}`) - 0.5) * 14;
          const x = fromX + (tx - fromX) * p;
          const y = fromY + (ty - fromY) * p;
          return (
            <div
              key={tab.title}
              style={{
                position: 'absolute',
                left: 960 + x - 180,
                top: 540 + y - 110,
                transform: `rotate(${rot + (1 - p) * 40}deg)`,
                filter: speed > 0.01 ? `blur(${Math.min(14, speed * 60)}px)` : undefined,
                opacity: frame < DELAYS[i] ? 0 : 1,
              }}
            >
              <TabCard service={SERVICES[tab.service]} title={tab.title} />
            </div>
          );
        })}
      </AbsoluteFill>
      {/* Darken the middle so the counter reads over the pile. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 42% 34% at 50% 50%, rgba(20,18,28,0.92) 0%, rgba(20,18,28,0.75) 55%, rgba(20,18,28,0) 100%)`,
          opacity: counterIn,
        }}
      />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <RollRow
          style={{
            fontSize: 230,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: colors.inkOnDark,
            opacity: counterIn,
            transform: `scale(${(0.6 + 0.4 * counterIn) * (1 + 0.07 * pop)})`,
          }}
        >
          <span style={{ display: 'flex', color: colors.accent }}>
            <Glyph>1</Glyph>
            <DigitColumn position={ones} />
          </span>
          <Glyph> TABS.</Glyph>
        </RollRow>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
