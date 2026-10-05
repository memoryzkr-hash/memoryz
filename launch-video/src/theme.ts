import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
import type { SpringConfig } from 'remotion';

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

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

/** Spring presets. Every entrance uses one of these; damping stays in 12–20. */
export const springs = {
  /** Default entrance: quick, a touch of overshoot. */
  snappy: { damping: 14, stiffness: 180, mass: 0.8 } satisfies Partial<SpringConfig>,
  /** Calm settle for the light half of the film. */
  smooth: { damping: 20, stiffness: 120, mass: 1 } satisfies Partial<SpringConfig>,
  /** Noticeable bounce for pops (counters, logo). */
  bouncy: { damping: 12, stiffness: 200, mass: 0.7 } satisfies Partial<SpringConfig>,
} as const;
