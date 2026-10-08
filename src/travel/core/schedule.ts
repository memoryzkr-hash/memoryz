/** Turns a plan into a timetable with costs and warnings. docs/TRAVEL_PLAN.md §3.4. */
import { estimateLeg, MODES, type LegEstimate } from './modes';
import { REGIONS, formatMoney, roundMoney, toKrw, type Region } from './regions';
import { formatClock, formatDuration, parseClock } from './time';
import type { DayPlan, Stop, TripPlan } from './types';

export const DEFAULT_START = 9 * 60;
const LATE = 23 * 60;
const LONG_WALK_MIN = 30;
const MAX_TRAVEL_PER_DAY = 4 * 60;

export interface Leg extends LegEstimate {
  /** Index of the stop this leg arrives at. */
  to: number;
  depart: number;
  arrive: number;
}

export interface Visit {
  stop: Stop;
  arrive: number;
  /** Starts after waiting for opening time. */
  begin: number;
  leave: number;
  wait: number;
  /** Group total, region currency. */
  cost: number;
}

export type WarningKind = 'closed' | 'late' | 'long-walk' | 'much-travel' | 'budget';

export interface Warning {
  day: number;
  kind: WarningKind;
  message: string;
  stopId?: string;
}

export interface DaySchedule {
  day: number;
  plan: DayPlan;
  visits: Visit[];
  /** legs[i] arrives at visits[i + 1]. */
  legs: Leg[];
  start: number;
  end: number;
  travelMin: number;
  km: number;
  transport: number;
  places: number;
  warnings: Warning[];
}

export interface TripSchedule {
  region: Region;
  days: DaySchedule[];
  nights: number;
  rooms: number;
  transport: number;
  places: number;
  lodging: number;
  total: number;
  perPerson: number;
  totalKrw: number;
  travelMin: number;
  km: number;
  overBudget: boolean;
  warnings: Warning[];
}

/** `close` before `open` means open past midnight (e.g. a bar 18:00–02:00). */
function isClosed(at: number, open: number | null, close: number): boolean {
  if (close > (open ?? 0)) return at >= close;
  return at >= 1440 + close;
}

export function scheduleDay(plan: DayPlan, dayIndex: number, region: Region, travelers: number): DaySchedule {
  const people = Math.max(1, travelers);
  const start = parseClock(plan.start) ?? DEFAULT_START;
  const visits: Visit[] = [];
  const legs: Leg[] = [];
  const warnings: Warning[] = [];
  let t = start;

  plan.stops.forEach((stop, i) => {
    if (i > 0) {
      const prev = plan.stops[i - 1];
      const est = estimateLeg([prev.lat, prev.lng], [stop.lat, stop.lng], stop.modeIn, t, region, people);
      legs.push({ ...est, to: i, depart: t, arrive: t + est.minutes });
      if (est.mode === 'walk' && est.minutes > LONG_WALK_MIN) {
        warnings.push({ day: dayIndex, kind: 'long-walk', stopId: stop.id, message: `${stop.name}까지 ${formatDuration(est.minutes)} 걸어야 해요` });
      }
      t += est.minutes;
    }
    const arrive = i === 0 ? start : t;
    const open = parseClock(stop.open);
    const close = parseClock(stop.close);
    // Past midnight we don't wait for tomorrow's opening; the place just counts as closed.
    const wait = open !== null && i > 0 && arrive < open ? open - arrive : 0;
    const begin = arrive + wait;
    // The first stop is where the day starts, so its stay is already behind us at `start`.
    const leave = i === 0 ? start : begin + stop.stayMin;
    if (i > 0 && close !== null && isClosed(begin, open, close)) {
      warnings.push({ day: dayIndex, kind: 'closed', stopId: stop.id, message: `${stop.name}: ${formatClock(begin)} 도착인데 ${stop.close}에 닫아요` });
    }
    visits.push({ stop, arrive, begin, leave, wait, cost: roundMoney(region, stop.cost * people) });
    t = leave;
  });

  const end = t;
  const travelMin = legs.reduce((s, l) => s + l.minutes, 0);
  if (end > LATE && plan.stops.length > 1) {
    warnings.push({ day: dayIndex, kind: 'late', message: `${formatClock(end)}에 끝나요. 일정을 줄여 보세요` });
  }
  if (travelMin > MAX_TRAVEL_PER_DAY) {
    warnings.push({ day: dayIndex, kind: 'much-travel', message: `이동만 ${formatDuration(travelMin)}이에요` });
  }
  return {
    day: dayIndex,
    plan,
    visits,
    legs,
    start,
    end,
    travelMin,
    km: legs.reduce((s, l) => s + l.routeKm, 0),
    transport: legs.reduce((s, l) => s + l.cost, 0),
    // The first stop's cost counts too (e.g. breakfast at the hotel).
    places: visits.reduce((s, v) => s + v.cost, 0),
    warnings,
  };
}

export function scheduleTrip(plan: TripPlan): TripSchedule {
  const region = REGIONS[plan.region] ?? REGIONS.OTHER;
  const people = Math.max(1, plan.travelers);
  const days = plan.days.map((d, i) => scheduleDay(d, i, region, people));
  const nights = Math.max(0, plan.days.length - 1);
  const rooms = Math.ceil(people / 2);
  const transport = days.reduce((s, d) => s + d.transport, 0);
  const places = days.reduce((s, d) => s + d.places, 0);
  const lodging = roundMoney(region, plan.lodgingPerNight * rooms * nights);
  const total = roundMoney(region, transport + places + lodging);
  const totalKrw = toKrw(region, total);
  const overBudget = plan.budgetKrw !== null && totalKrw > plan.budgetKrw;
  const warnings = days.flatMap((d) => d.warnings);
  if (overBudget && plan.budgetKrw !== null) {
    const over = Math.round(totalKrw - plan.budgetKrw);
    warnings.push({ day: -1, kind: 'budget', message: `예산보다 ${over.toLocaleString('ko-KR')}원 더 들어요 (${formatMoney(region, total)})` });
  }
  return {
    region,
    days,
    nights,
    rooms,
    transport,
    places,
    lodging,
    total,
    perPerson: roundMoney(region, total / people),
    totalKrw,
    travelMin: days.reduce((s, d) => s + d.travelMin, 0),
    km: days.reduce((s, d) => s + d.km, 0),
    overBudget,
    warnings,
  };
}

/** Short line for a leg in the timetable: "🚇 지하철 · 18분 · 2.8km · 2,800원". */
export function legLine(leg: Leg, region: Region): string {
  const m = MODES[leg.mode];
  const km = leg.routeKm < 1 ? `${Math.round(leg.routeKm * 1000)}m` : `${leg.routeKm.toFixed(1)}km`;
  return [`${m.icon} ${m.label}${leg.auto ? '(자동)' : ''}`, formatDuration(leg.minutes), km, leg.cost ? formatMoney(region, leg.cost) : '무료'].join(' · ');
}
