import { colors, fonts } from '../theme';

/** Orange italic serif accent ("here.", "actually"). Sized up slightly to sit with the heavy sans. */
export const AccentWord: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({
  children,
  color = colors.accent,
  style,
}) => (
  <span
    style={{
      fontFamily: fonts.serif,
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: '1.1em',
      letterSpacing: '-0.01em',
      color,
      // Italic glyphs overhang to the right; keep them from colliding with what follows.
      paddingRight: '0.04em',
      ...style,
    }}
  >
    {children}
  </span>
);
