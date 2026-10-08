/**
 * Movement simulation: a day's timetable as a list of segments, and where the traveller is at any
 * minute. Pure functions so playback, scrubbing and tests all agree. docs/TRAVEL_PLAN.md §3.5.
 */
import { curvedPath, pointAlong, type LatLng } from './geo';
import { MODES } from './modes';
import type { DaySchedule } from './schedule';
import type { Mode } from './types';

export interface StaySegment {
  kind: 'stay';
  from: number;
  to: number;
  visit: number;
  at: LatLng;
}

export interface MoveSegment {
  kind: 'move';
  from: number;
  /** Until here the traveller waits at the origin (station, check-in…). */
  boardAt: number;
  to: number;
  leg: number;
  mode: Mode;
  path: LatLng[];
  km: number;
  cost: number;
}

export type Segment = StaySegment | MoveSegment;

export interface Timeline {
  start: number;
  end: number;
  segments: Segment[];
}

export function buildTimeline(day: DaySchedule): Timeline {
  const segments: Segment[] = [];
  day.visits.forEach((v, i) => {
    if (i > 0) {
      const leg = day.legs[i - 1];
      const prev = day.visits[i - 1].stop;
      const a: LatLng = [prev.lat, prev.lng];
      const b: LatLng = [v.stop.lat, v.stop.lng];
      segments.push({
        kind: 'move',
        from: leg.depart,
        boardAt: leg.depart + Math.min(leg.overheadMin, leg.minutes / 2),
        to: leg.arrive,
        leg: i - 1,
        mode: leg.mode,
        path: curvedPath(a, b, MODES[leg.mode].bend),
        km: leg.routeKm,
        cost: leg.cost,
      });
    }
    if (i === 0 || v.leave > v.arrive) {
      segments.push({ kind: 'stay', from: v.arrive, to: Math.max(v.arrive, v.leave), visit: i, at: [v.stop.lat, v.stop.lng] });
    }
  });
  return { start: day.start, end: day.end, segments };
}

export interface SimState {
  t: number;
  at: LatLng;
  kind: 'stay' | 'wait' | 'move' | 'done';
  /** Index into segments. */
  segment: number;
  /** Visit the traveller is at (stay/wait) or heading to (move). */
  visit: number;
  mode: Mode | null;
  /** 0..1 through the current segment. */
  progress: number;
  /** Group money spent so far, region currency. Tickets are paid on boarding, places on arrival. */
  spent: number;
  km: number;
}

export function stateAt(day: DaySchedule, tl: Timeline, tRaw: number): SimState {
  const t = Math.min(Math.max(tRaw, tl.start), tl.end);
  let spent = day.visits[0]?.cost ?? 0;
  let km = 0;
  const first = day.visits[0];
  let state: SimState = {
    t,
    at: first ? [first.stop.lat, first.stop.lng] : [0, 0],
    kind: 'stay',
    segment: 0,
    visit: 0,
    mode: null,
    progress: 0,
    spent,
    km,
  };
  for (let i = 0; i < tl.segments.length; i++) {
    const s = tl.segments[i];
    if (t < s.from) break;
    const span = s.to - s.from;
    if (s.kind === 'stay') {
      if (s.visit > 0 && day.visits[s.visit]) spent += day.visits[s.visit].cost;
      state = { t, at: s.at, kind: 'stay', segment: i, visit: s.visit, mode: null, progress: span > 0 ? Math.min(1, (t - s.from) / span) : 1, spent, km };
      continue;
    }
    const destination = s.leg + 1;
    if (t < s.boardAt) {
      state = { t, at: s.path[0], kind: 'wait', segment: i, visit: destination, mode: s.mode, progress: 0, spent, km };
      continue;
    }
    spent += s.cost;
    if (t >= s.to) {
      km += s.km;
      const v = day.visits[destination].stop;
      // Arrived; a following stay segment (if any) takes over and adds the place cost.
      state = { t, at: [v.lat, v.lng], kind: 'move', segment: i, visit: destination, mode: s.mode, progress: 1, spent, km };
      if (!tl.segments[i + 1] || tl.segments[i + 1].kind !== 'stay') {
        spent += day.visits[destination].cost;
        state.spent = spent;
      }
      continue;
    }
    const ride = s.to - s.boardAt;
    const f = ride > 0 ? (t - s.boardAt) / ride : 1;
    state = { t, at: pointAlong(s.path, f), kind: 'move', segment: i, visit: destination, mode: s.mode, progress: f, spent, km: km + s.km * f };
  }
  if (t >= tl.end && tl.segments.length) state = { ...state, kind: 'done', progress: 1 };
  return state;
}
