/** One-tap plan changes the chat offers after a plan is made. Deterministic: no AI involved. */
import { haversineKm } from './geo';
import { optimizeDay } from './optimize';
import { REGIONS } from './regions';
import { scheduleTrip } from './schedule';
import type { Mode, TripPlan } from './types';

export interface TweakResult {
  plan: TripPlan;
  /** Minutes of travel saved (negative = longer). */
  savedMin: number;
  /** Money saved in the region's currency (negative = dearer). */
  saved: number;
  changed: number;
}

function compare(before: TripPlan, after: TripPlan, changed: number): TweakResult {
  const a = scheduleTrip(before);
  const b = scheduleTrip(after);
  return { plan: after, savedMin: a.travelMin - b.travelMin, saved: a.total - b.total, changed };
}

/** Best order for every day. */
export function optimizeTrip(plan: TripPlan): TweakResult {
  const region = REGIONS[plan.region];
  let changed = 0;
  const next = structuredClone(plan);
  next.days = plan.days.map((d) => {
    const r = optimizeDay(d, region, plan.travelers);
    if (r.changed) changed++;
    return structuredClone(r.day);
  });
  return compare(plan, next, changed);
}

/** Swap taxis and rental cars for walking, metro or bus where those make sense. */
export function cheaperTransport(plan: TripPlan): TweakResult {
  const region = REGIONS[plan.region];
  const next = structuredClone(plan);
  let changed = 0;
  for (const day of next.days) {
    day.stops.forEach((s, i) => {
      if (i === 0 || (s.modeIn !== 'taxi' && s.modeIn !== 'car')) return;
      const p = day.stops[i - 1];
      const km = haversineKm([p.lat, p.lng], [s.lat, s.lng]);
      let mode: Mode | null = null;
      if (km < 1.2) mode = 'walk';
      else if (km < 15 && region.hasMetro) mode = 'subway';
      else if (km < 40) mode = 'bus';
      if (mode) {
        s.modeIn = mode;
        changed++;
      }
    });
  }
  return compare(plan, next, changed);
}
