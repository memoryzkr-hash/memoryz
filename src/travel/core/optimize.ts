/**
 * 🔀 동선 최적화: reorder a day's middle stops to cut travel time. The first stop (where the day
 * starts) and, when the day returns to a hotel/airport/station, the last stop stay put.
 * Each stop keeps its own "how to get here" mode. Exact for ≤ 8 movable stops, 2-opt beyond.
 */
import { estimateLeg } from './modes';
import type { Region } from './regions';
import type { DayPlan, Stop } from './types';

/** Fixed midday departure so rush hour doesn't make the order depend on the clock. */
const MIDDAY = 12 * 60;
const EXACT_LIMIT = 8;

function legMin(a: Stop, b: Stop, region: Region, travelers: number): number {
  return estimateLeg([a.lat, a.lng], [b.lat, b.lng], b.modeIn, MIDDAY, region, travelers).minutes;
}

export function routeMinutes(stops: Stop[], region: Region, travelers: number): number {
  let sum = 0;
  for (let i = 1; i < stops.length; i++) sum += legMin(stops[i - 1], stops[i], region, travelers);
  return sum;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

function twoOpt(head: Stop, middle: Stop[], tail: Stop | null, cost: (s: Stop[]) => number): Stop[] {
  let best = middle.slice();
  let bestCost = cost([head, ...best, ...(tail ? [tail] : [])]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = cost([head, ...next, ...(tail ? [tail] : [])]);
        if (c < bestCost - 1e-9) {
          best = next;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

const ANCHORS = new Set(['hotel', 'airport', 'station']);

export interface OptimizeResult {
  day: DayPlan;
  beforeMin: number;
  afterMin: number;
  changed: boolean;
}

export function optimizeDay(day: DayPlan, region: Region, travelers: number): OptimizeResult {
  const stops = day.stops;
  const cost = (s: Stop[]) => routeMinutes(s, region, travelers);
  const beforeMin = cost(stops);
  const keepLast = stops.length > 2 && ANCHORS.has(stops[stops.length - 1].kind);
  const head = stops[0];
  const tail = keepLast ? stops[stops.length - 1] : null;
  const middle = stops.slice(1, keepLast ? -1 : undefined);
  if (middle.length < 2) return { day, beforeMin, afterMin: beforeMin, changed: false };

  let best = middle;
  let bestCost = beforeMin;
  if (middle.length <= EXACT_LIMIT) {
    for (const p of permutations(middle)) {
      const c = cost([head, ...p, ...(tail ? [tail] : [])]);
      if (c < bestCost - 1e-9) {
        best = p;
        bestCost = c;
      }
    }
  } else {
    best = twoOpt(head, middle, tail, cost);
    bestCost = cost([head, ...best, ...(tail ? [tail] : [])]);
  }
  const changed = best.some((s, i) => s !== middle[i]);
  return {
    day: changed ? { ...day, stops: [head, ...best, ...(tail ? [tail] : [])] } : day,
    beforeMin,
    afterMin: changed ? bestCost : beforeMin,
    changed,
  };
}
