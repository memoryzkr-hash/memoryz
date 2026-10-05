import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CLAMP } from '../anim';
import { springs } from '../config';
import { colors, fonts } from '../theme';

// Tally mark "||||/": four bars and an orange stroke crossing them. viewBox 0 0 112 100.
const BARS = [14, 36, 58, 80];
const SLASH = { x1: 4, y1: 80, x2: 108, y2: 22 };

/**
 * Logo mark drawn one stroke at a time, then the wordmark slides in.
 * Timing is relative to the current sequence.
 */
export const Logo: React.FC<{
  height: number;
  delay?: number;
  stagger?: number;
  drawFrames?: number;
  wordmark?: boolean;
  color?: string;
}> = ({ height, delay = 0, stagger = 4, drawFrames = 10, wordmark = true, color = colors.inkOnLight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = (i: number) =>
    interpolate(frame - delay - i * stagger, [0, drawFrames], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const word = spring({ frame: frame - delay - BARS.length * stagger - 2, fps, config: springs.smooth });

  const stroke = (p: number): React.SVGProps<SVGLineElement> => ({
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - p,
    strokeWidth: 12,
    strokeLinecap: 'round',
    opacity: p > 0.001 ? 1 : 0,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg width={height * 1.12} height={height} viewBox="0 0 112 100" style={{ overflow: 'visible' }}>
        {BARS.map((x, i) => (
          <line key={x} x1={x} y1={12} x2={x} y2={88} stroke={color} {...stroke(draw(i))} />
        ))}
        <line {...SLASH} stroke={colors.accent} {...stroke(draw(BARS.length))} />
      </svg>
      {wordmark ? (
        <div
          style={{
            marginLeft: height * 0.3,
            fontFamily: fonts.sans,
            fontWeight: 800,
            fontSize: height * 0.92,
            letterSpacing: '-0.045em',
            lineHeight: 1,
            color,
            opacity: word,
            transform: `translateX(${(1 - word) * -height * 0.25}px)`,
            // Padding keeps the overhanging "y" inside the reveal clip once it's fully open.
            paddingRight: '0.08em',
            clipPath: `inset(-20% ${(1 - word) * 100}% -20% -5%)`,
          }}
        >
          Tally
        </div>
      ) : null}
    </div>
  );
};
