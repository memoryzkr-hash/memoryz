import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, ramp } from '../anim';
import { AccentWord } from '../components/AccentWord';
import { DirectionalBlur } from '../components/DirectionalBlur';
import { AmountCard } from '../components/TabCard';
import { SERVICES } from '../data';
import { colors, fonts } from '../theme';

const PAN = [33, 41] as const;
const panAt = (f: number) => ramp(f, [PAN[0], PAN[1]], [0, 1], Easing.inOut(Easing.cubic));

const Line: React.FC<{ word: string; progress: number; align: 'left' | 'right' }> = ({ word, progress, align }) => (
  <div
    style={{
      fontSize: 156,
      fontWeight: 800,
      letterSpacing: '-0.035em',
      color: colors.inkOnDark,
      whiteSpace: 'nowrap',
      textAlign: align,
      opacity: progress,
      transform: `translateY(${(1 - progress) * 60}px)`,
    }}
  >
    over <AccentWord>{word}</AccentWord>
  </div>
);

/** The money is over here… whip pan… and over there. */
export const HereThereScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pan = panAt(frame);
  const panSpeed = (pan - panAt(frame - 1)) * 1920;

  const cardA = enter(frame, fps, 0, 'snappy');
  const cardASpeed = (cardA - enter(frame - 1, fps, 0, 'snappy')) * 1100;
  const textA = enter(frame, fps, 7, 'snappy');
  const cardB = enter(frame, fps, PAN[0] + 4, 'snappy');
  const cardBSpeed = (cardB - enter(frame - 1, fps, PAN[0] + 4, 'snappy')) * 700;
  const textB = enter(frame, fps, PAN[1], 'snappy');

  return (
    <AbsoluteFill style={{ backgroundColor: colors.dark, fontFamily: fonts.sans, overflow: 'hidden' }}>
      <DirectionalBlur x={Math.abs(panSpeed) * 0.12} style={{ position: 'absolute', inset: 0, transform: `translateX(${-pan * 1920}px)` }}>
        {/* Panel A: card left, text right */}
        <DirectionalBlur
          x={Math.abs(cardASpeed) * 0.15}
          style={{ position: 'absolute', left: 190, top: 540 - 190, transform: `translateX(${(1 - cardA) * -1100}px) rotate(${(1 - cardA) * -6}deg)` }}
        >
          <AmountCard service={SERVICES.stripe} label="Gross volume" amount="$1,284.00" />
        </DirectionalBlur>
        <div style={{ position: 'absolute', left: 930, top: 540 - 128, width: 900 }}>
          <Line word="here." progress={textA} align="left" />
        </div>
        {/* Panel B: text left, card right */}
        <div style={{ position: 'absolute', left: 1920 + 100, top: 540 - 128, width: 880 }}>
          <Line word="there." progress={textB} align="right" />
        </div>
        <DirectionalBlur
          x={Math.abs(cardBSpeed) * 0.15}
          style={{ position: 'absolute', left: 1920 + 1150, top: 540 - 190, transform: `translateX(${(1 - cardB) * 700}px) rotate(${(1 - cardB) * 5}deg)` }}
        >
          <AmountCard service={SERVICES.paypal} label="Balance" amount="$847.12" />
        </DirectionalBlur>
      </DirectionalBlur>
    </AbsoluteFill>
  );
};
