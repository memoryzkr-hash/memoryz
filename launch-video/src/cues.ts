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
