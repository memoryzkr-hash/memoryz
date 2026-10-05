import { AccentWord } from '../components/AccentWord';
import { colors } from '../theme';

/** Vertical offset (px from frame centre) of the big number in scenes 8–10, so cuts line up. */
export const NUMBER_Y = -40;
export const NUMBER_SIZE = 300;
export const LABEL_SIZE = 46;

export const numberStyle: React.CSSProperties = {
  fontSize: NUMBER_SIZE,
  fontWeight: 800,
  letterSpacing: '-0.025em',
  color: colors.inkOnLight,
};

export const labelStyle: React.CSSProperties = {
  fontSize: LABEL_SIZE,
  fontWeight: 600,
  color: colors.mutedOnLight,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
};

export const KeptLabel: React.FC = () => (
  <>
    What you <AccentWord>actually</AccentWord> kept
  </>
);

/** The small grey ".00" after the big number; `progress` 0 → 1 slides it out from behind the digits. */
export const Cents: React.FC<{ progress?: number }> = ({ progress = 1 }) => (
  <div
    style={{
      ...numberStyle,
      fontSize: NUMBER_SIZE * 0.42,
      lineHeight: 1.15,
      marginTop: NUMBER_SIZE * 0.17,
      maxWidth: `${progress * 2}em`,
      overflow: 'hidden',
      opacity: progress,
      color: colors.mutedOnLight,
      letterSpacing: '-0.02em',
    }}
  >
    .00
  </div>
);
