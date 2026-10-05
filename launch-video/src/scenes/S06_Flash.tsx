import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ramp } from '../anim';
import { Logo } from '../components/Logo';
import { colors } from '../theme';

/** Hard cut to white, then the mark draws itself. */
export const FlashScene: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = ramp(frame, [0, 7], [1, 0]);
  const settle = ramp(frame, [0, 45], [1.06, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.light }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${settle})` }}>
        <Logo height={170} delay={3} stagger={3} drawFrames={9} />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', opacity: flash }} />
    </AbsoluteFill>
  );
};
