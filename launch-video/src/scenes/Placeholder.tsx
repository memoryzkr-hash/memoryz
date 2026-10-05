import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../theme';

type Tone = 'dark' | 'light' | 'cream';

const backgrounds: Record<Tone, string> = {
  dark: colors.dark,
  light: colors.light,
  cream: colors.cream,
};

/**
 * Phase 1 stand-in for a scene: shows its number, title and local frame counter
 * so the <Series> timeline can be checked before real content exists.
 */
export const Placeholder: React.FC<{ index: number; title: string; tone: Tone }> = ({
  index,
  title,
  tone,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const ink = tone === 'dark' ? colors.inkOnDark : colors.inkOnLight;
  const muted = tone === 'dark' ? colors.mutedOnDark : colors.mutedOnLight;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: backgrounds[tone],
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.sans,
        color: ink,
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: colors.accent }}>
        {String(index).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.03em' }}>{title}</div>
      <div style={{ marginTop: 24, fontSize: 32, color: muted, fontVariantNumeric: 'tabular-nums' }}>
        frame {frame + 1} / {durationInFrames} · {(durationInFrames / fps).toFixed(1)}s
      </div>
    </AbsoluteFill>
  );
};
