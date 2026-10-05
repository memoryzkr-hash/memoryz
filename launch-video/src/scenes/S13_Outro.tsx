import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';
import { ramp } from '../anim';
import { Logo } from '../components/Logo';
import { OUTRO } from '../cues';
import { colors } from '../theme';

/** Logo draws stroke by stroke, holds, then fades out. */
export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fade = ramp(frame, OUTRO.fade, [1, 0], Easing.inOut(Easing.cubic));
  const settle = ramp(frame, [0, 90], [1, 0.97]);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.light, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: fade, transform: `scale(${settle})` }}>
        <Logo height={190} delay={OUTRO.logoDelay} stagger={OUTRO.stagger} drawFrames={OUTRO.drawFrames} />
      </div>
    </AbsoluteFill>
  );
};
