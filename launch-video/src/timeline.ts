import { VIDEO } from './theme';

const s = (seconds: number) => Math.round(seconds * VIDEO.fps);

/** Scene lengths in frames, in playback order. Mirrors the table in PLAN section 2. */
export const SCENES = [
  { id: 'S01_Clock', label: 'Lock-screen clock 11:46 PM', tone: 'dark', duration: s(3) },
  { id: 'S02_Tabs', label: 'Tabs pile up, 10 → 14 TABS.', tone: 'dark', duration: s(2.5) },
  { id: 'S03_Search', label: 'Typing "did i make money today"', tone: 'dark', duration: s(2.5) },
  { id: 'S04_HereThere', label: 'over here. / over there.', tone: 'dark', duration: s(2.5) },
  { id: 'S05_Everywhere', label: 'Amount-card vortex, everywhere.', tone: 'dark', duration: s(2.5) },
  { id: 'S06_Flash', label: 'White flash, logo reveal', tone: 'light', duration: s(1.5) },
  { id: 'S07_Particles', label: 'Service labels pulled to centre', tone: 'light', duration: s(2.5) },
  { id: 'S08_CountUp', label: '$1,280 → $1,284', tone: 'light', duration: s(2) },
  { id: 'S09_Kept', label: '$1,284 → $626 → $412.00', tone: 'light', duration: s(4) },
  { id: 'S10_Subs', label: 'Your subs are bleeding money', tone: 'light', duration: s(2) },
  { id: 'S11_Morning', label: 'Phone 7:02, Every morning. / before coffee.', tone: 'cream', duration: s(4) },
  { id: 'S12_Slogan', label: 'Fewer tabs.', tone: 'light', duration: s(3) },
  { id: 'S13_Outro', label: 'Logo outro, fade out', tone: 'light', duration: s(3) },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

export const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + scene.duration, 0);
