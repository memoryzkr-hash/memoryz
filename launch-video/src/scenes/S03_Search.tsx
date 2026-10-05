import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { TabCard } from '../components/TabCard';
import { TypeWriter } from '../components/TypeWriter';
import { SERVICES, TABS } from '../data';
import { SEARCH } from '../cues';
import { colors, fonts } from '../theme';

const GHOSTS: [number, number, number][] = [
  [-620, -300, -6], [520, -330, 5], [-700, 260, 4], [640, 280, -5], [0, -420, 2],
];

export const SearchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bar = enter(frame, fps, 0, 'snappy');
  const push = ramp(frame, [0, 75], [1, 1.06]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.dark, fontFamily: fonts.sans, overflow: 'hidden' }}>
      {/* The tabs are still there, out of focus. */}
      <AbsoluteFill style={{ filter: 'blur(14px)', opacity: 0.32, transform: `scale(${1.1 - 0.04 * bar})` }}>
        {GHOSTS.map(([x, y, r], i) => (
          <div key={i} style={{ position: 'absolute', left: 960 + x - 180, top: 540 + y - 110, transform: `rotate(${r}deg)` }}>
            <TabCard service={SERVICES[TABS[i].service]} title={TABS[i].title} />
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${push})` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 34,
            width: 1240,
            height: 136,
            padding: '0 60px',
            borderRadius: 68,
            backgroundColor: colors.cardOnDark,
            border: `2px solid ${colors.cardBorderOnDark}`,
            boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
            opacity: bar,
            transform: `scale(${0.9 + 0.1 * bar}) translateY(${(1 - bar) * 30}px)`,
          }}
        >
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.mutedOnDark} strokeWidth={2.6} strokeLinecap="round">
            <circle cx={10.5} cy={10.5} r={7} />
            <path d="M16 16l5.5 5.5" />
          </svg>
          <TypeWriter text={SEARCH.text} start={SEARCH.start} seed={SEARCH.seed} style={{ fontSize: 62, fontWeight: 500, color: colors.inkOnDark, letterSpacing: '-0.01em' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
