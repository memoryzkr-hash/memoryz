import { random } from 'remotion';
import { SCENES, type SceneId } from './timeline';

/**
 * Timing of every on-screen event, in frames relative to its scene's start.
 * Scenes animate from these and scripts/soundtrack.ts places sound effects on them, so picture and
 * sound can't drift apart. Keep this file free of DOM/font imports: it also runs in Node.
 */

export const sceneStart = (id: SceneId): number => {
  let t = 0;
  for (const scene of SCENES) {
    if (scene.id === id) return t;
    t += scene.duration;
  }
  throw new Error(`Unknown scene ${id}`);
};

/** Frame (relative to the sequence) at which each character appears; 2–3 frames apart, seeded. */
export const typingSchedule = (text: string, start: number, seed: string) => {
  const times: number[] = [];
  let t = start;
  for (let i = 0; i < text.length; i++) {
    times.push(t);
    t += random(`${seed}-${i}`) < 0.5 ? 2 : 3;
  }
  return { times, end: t };
};

export const CLOCK = { minuteTick: 34 };

export const TABS_CUES = {
  // First ten land in a quick barrage; the last four arrive one by one and bump the counter.
  delays: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 27, 35, 43, 51],
  landLag: 6,
  counterAt: 22,
  bumpLag: 5,
};

export const SEARCH = { text: 'did i make money today', start: 8, seed: 'search' };

export const HERE_THERE = { cardA: 0, textA: 7, pan: [33, 41] as [number, number], cardB: 37, textB: 41 };

export const EVERYWHERE = { word: 8, burst: 58 };

export const FLASH = { fade: [0, 7] as [number, number], logoDelay: 3, stagger: 3, drawFrames: 9 };

export const GATHER = { labelStagger: 1.5, count: 120, start: 12, spread: 30, travel: [20, 30] as [number, number], seed: 'gather' };

export const COUNT = { label: 0, number: 3, from: 1280, to: 1284, start: 6, duration: 34 };

export const KEPT = {
  deductions: [
    { at: 10, amount: '$96.30', what: 'payment fees' },
    { at: 20, amount: '$561.70', what: 'tax set aside' },
    { at: 58, amount: '$214.00', what: 'subscriptions' },
  ],
  firstMorph: 32,
  secondMorph: 68,
  centsLag: 14,
  labelSwap: 86,
  listOut: [92, 102] as [number, number],
};

export const SUBS = { exit: [0, 9] as [number, number], card: 6, barStart: 16, barStagger: 5 };

export const MORNING = { phone: 0, left: 16, notification: 34, right: 52 };

export const SLOGAN = { fewerStart: 2, fewerStagger: 2.5, tabsStart: 18, tabsStagger: 4 };

export const OUTRO = { logoDelay: 4, stagger: 5, drawFrames: 12, fade: [64, 86] as [number, number] };

/**
 * Korean narration (Higgsfield · Seed Audio, preset voice "Sloane"), one clip per line in
 * assets/vo/sloane-ko/NN.wav. `at` is where the first syllable lands, relative to `scene`;
 * a negative frame starts the line just before the cut (a J-cut).
 */
export const VOICEOVER = {
  dir: 'assets/vo/sloane-ko',
  lines: [
    { file: '01', text: '자정이 다 됐어요.', scene: 'S01_Clock', at: 15 },
    { file: '02', text: '열네 개의 탭.', scene: 'S02_Tabs', at: 24 },
    { file: '03', text: '오늘, 돈을 벌긴 한 걸까?', scene: 'S03_Search', at: 7 },
    { file: '04', text: '여기에도 있고,', scene: 'S04_HereThere', at: -2 },
    { file: '05', text: '저기에도 있고,', scene: 'S04_HereThere', at: 56 },
    { file: '06', text: '어디에나 흩어져 있죠.', scene: 'S05_Everywhere', at: 14 },
    { file: '07', text: '탤리를 소개합니다.', scene: 'S06_Flash', at: 9 },
    { file: '08', text: '모든 수입을, 한 곳에.', scene: 'S07_Particles', at: 8 },
    { file: '09', text: '오늘 번 돈.', scene: 'S08_CountUp', at: 8 },
    { file: '10', text: '그리고 실제로 남은 돈.', scene: 'S09_Kept', at: 48 },
    { file: '11', text: '잊고 있던 구독료까지.', scene: 'S10_Subs', at: 2 },
    { file: '12', text: '매일 아침,', scene: 'S11_Morning', at: 22 },
    { file: '13', text: '커피보다 먼저.', scene: 'S11_Morning', at: 54 },
    { file: '14', text: '탭은, 더 적게.', scene: 'S12_Slogan', at: 18 },
    { file: '15', text: '탤리.', scene: 'S13_Outro', at: 30 },
  ] satisfies { file: string; text: string; scene: SceneId; at: number }[],
};
