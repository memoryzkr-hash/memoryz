import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export { springs, VIDEO } from './config';

export const colors = {
  accent: '#F26B1D',
  dark: '#14121C',
  light: '#F7F5F0',
  cream: '#F3EDE2',
  inkOnDark: '#F7F5F0',
  inkOnLight: '#14121C',
  mutedOnDark: '#8A8696',
  mutedOnLight: '#9A968E',
  cardOnDark: '#1F1C29',
  cardBorderOnDark: '#2E2A3A',
  cardOnLight: '#FFFFFF',
  cardBorderOnLight: '#E7E3DA',
} as const;

// Fonts are self-hosted from public/fonts (Google Fonts, OFL) so renders work offline
// and are identical on every machine.
void loadFont({
  family: 'Inter Tight',
  url: staticFile('fonts/InterTight-Variable-latin.woff2'),
  weight: '100 900',
  format: 'woff2',
});
void loadFont({
  family: 'Instrument Serif',
  url: staticFile('fonts/InstrumentSerif-Italic-latin.woff2'),
  style: 'italic',
  weight: '400',
  format: 'woff2',
});

export const fonts = {
  /** Heavy grotesk for headlines and numbers. */
  sans: '"Inter Tight", sans-serif',
  /** Italic serif for accent words ("here", "actually"...). */
  serif: '"Instrument Serif", serif',
} as const;
