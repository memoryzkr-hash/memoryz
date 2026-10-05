import { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { typingSchedule } from '../cues';
import { colors } from '../theme';

export const TypeWriter: React.FC<{
  text: string;
  start?: number;
  seed?: string;
  cursorColor?: string;
  style?: React.CSSProperties;
}> = ({ text, start = 0, seed = 'type', cursorColor = colors.accent, style }) => {
  const frame = useCurrentFrame();
  const { times, end } = useMemo(() => typingSchedule(text, start, seed), [text, start, seed]);
  const shown = times.filter((t) => t <= frame).length;
  const typing = frame >= start && frame < end + 4;
  // Solid while typing, blinking (15 frames on / 15 off) while idle.
  const cursorOn = typing || Math.floor((frame - (frame < start ? 0 : end)) / 15) % 2 === 0;

  return (
    <span style={{ whiteSpace: 'pre', ...style }}>
      {text.slice(0, shown)}
      <span
        style={{
          display: 'inline-block',
          width: '0.07em',
          height: '1.05em',
          marginLeft: '0.06em',
          verticalAlign: '-0.17em',
          borderRadius: '0.03em',
          backgroundColor: cursorColor,
          opacity: cursorOn ? 1 : 0,
        }}
      />
    </span>
  );
};
