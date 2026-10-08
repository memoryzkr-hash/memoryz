/** How fast each way of travelling is and what it costs. docs/TRAVEL_PLAN.md §3.2–3.3. */
import { haversineKm, type LatLng } from './geo';
import { roundFare, roundMoney, type Region } from './regions';
import type { Mode, ModeChoice } from './types';

export interface ModeInfo {
  label: string;
  icon: string;
  /** Route length ÷ straight-line length. */
  detour: number;
  /** Walking to the station, waiting, check-in… before moving. */
  overheadMin: number;
  /** Bow of the drawn line (share of leg length). */
  bend: number;
  /** Charged per vehicle (4 seats) instead of per person. */
  perVehicle: boolean;
  /** Road traffic: slowed in rush hour. */
  road: boolean;
}

export const MODES: Record<Mode, ModeInfo> = {
  walk: { label: '도보', icon: '🚶', detour: 1.25, overheadMin: 0, bend: 0.04, perVehicle: false, road: false },
  subway: { label: '지하철', icon: '🚇', detour: 1.3, overheadMin: 10, bend: 0.06, perVehicle: false, road: false },
  bus: { label: '버스', icon: '🚌', detour: 1.3, overheadMin: 8, bend: 0.07, perVehicle: false, road: true },
  taxi: { label: '택시', icon: '🚕', detour: 1.3, overheadMin: 5, bend: 0.08, perVehicle: true, road: true },
  car: { label: '렌터카', icon: '🚗', detour: 1.3, overheadMin: 3, bend: 0.08, perVehicle: true, road: true },
  train: { label: '기차', icon: '🚄', detour: 1.15, overheadMin: 25, bend: 0.05, perVehicle: false, road: false },
  flight: { label: '비행기', icon: '✈️', detour: 1.05, overheadMin: 120, bend: 0.18, perVehicle: false, road: false },
  ferry: { label: '배', icon: '⛴️', detour: 1.1, overheadMin: 30, bend: 0.1, perVehicle: false, road: false },
};

export const MODE_IDS = Object.keys(MODES) as Mode[];
export const MODE_CHOICES: ModeChoice[] = ['auto', ...MODE_IDS];

export function isModeChoice(v: unknown): v is ModeChoice {
  return v === 'auto' || (typeof v === 'string' && v in MODES);
}

export const RUSH_FACTOR = 1.35;
const RUSH: [number, number][] = [
  [7 * 60 + 30, 9 * 60 + 30],
  [17 * 60 + 30, 19 * 60 + 30],
];

export function isRush(min: number): boolean {
  const m = ((min % 1440) + 1440) % 1440;
  return RUSH.some(([a, b]) => m >= a && m < b);
}

export function isNight(min: number): boolean {
  const m = ((min % 1440) + 1440) % 1440;
  return m >= 22 * 60 || m < 4 * 60;
}

/** km/h while actually moving. Road speed grows with distance (city streets → highway). */
export function speedKmh(mode: Mode, routeKm: number): number {
  const ramp = (lo: number, hi: number, km: number) => lo + (hi - lo) * Math.min(1, routeKm / km);
  switch (mode) {
    case 'walk': return 4.5;
    case 'subway': return 33;
    case 'bus': return ramp(19, 50, 60);
    case 'taxi': return ramp(22, 65, 40);
    case 'car': return ramp(25, 80, 60);
    case 'train': return 160;
    case 'flight': return 700;
    case 'ferry': return 32;
  }
}

/** Distance-based choice for `auto`. */
export function autoMode(straightKm: number, region: Region): Mode {
  if (straightKm < 1.2) return 'walk';
  if (straightKm < 15) return region.hasMetro ? 'subway' : 'taxi';
  if (straightKm < 300) return 'train';
  return 'flight';
}

export interface LegEstimate {
  mode: Mode;
  /** Chosen by `auto`. */
  auto: boolean;
  straightKm: number;
  routeKm: number;
  /** Waiting part, then moving part. */
  overheadMin: number;
  moveMin: number;
  minutes: number;
  /** Whole group, region currency. */
  cost: number;
  vehicles: number;
  rush: boolean;
  night: boolean;
}

function fare(f: { base: number; baseKm: number; perKm: number }, km: number): number {
  return f.base + Math.max(0, km - f.baseKm) * f.perKm;
}

/** Fare for the whole group. */
export function legCost(mode: Mode, routeKm: number, departMin: number, region: Region, travelers: number): { cost: number; vehicles: number } {
  const people = Math.max(1, travelers);
  const vehicles = Math.ceil(people / 4);
  let each: number;
  switch (mode) {
    case 'walk':
      return { cost: 0, vehicles: 0 };
    case 'subway': {
      const m = region.metro;
      const steps = Math.ceil(Math.max(0, routeKm - m.baseKm) / m.stepKm);
      each = Math.min(m.max, m.base + steps * m.step);
      break;
    }
    case 'bus':
      each = region.bus;
      break;
    case 'taxi': {
      const t = region.taxi;
      const one = Math.max(t.min, fare(t, routeKm)) * (isNight(departMin) ? t.night : 1);
      return { cost: roundMoney(region, roundFare(region, one) * vehicles), vehicles };
    }
    case 'car':
      return { cost: roundMoney(region, roundFare(region, routeKm * region.carPerKm) * vehicles), vehicles };
    case 'train':
      each = fare(region.train, routeKm);
      break;
    case 'flight':
      each = fare(region.flight, routeKm);
      break;
    case 'ferry':
      each = fare(region.ferry, routeKm);
      break;
  }
  return { cost: roundMoney(region, roundFare(region, each) * people), vehicles: 0 };
}

export function estimateLeg(from: LatLng, to: LatLng, choice: ModeChoice, departMin: number, region: Region, travelers: number): LegEstimate {
  const straightKm = haversineKm(from, to);
  const mode = choice === 'auto' ? autoMode(straightKm, region) : choice;
  const info = MODES[mode];
  const routeKm = straightKm * info.detour;
  const rush = info.road && isRush(departMin);
  const moveMin = straightKm < 0.02 ? 0 : (routeKm / speedKmh(mode, routeKm)) * 60 * (rush ? RUSH_FACTOR : 1);
  const overheadMin = straightKm < 0.02 ? 0 : info.overheadMin;
  const { cost, vehicles } = straightKm < 0.02 ? { cost: 0, vehicles: 0 } : legCost(mode, routeKm, departMin, region, travelers);
  return {
    mode,
    auto: choice === 'auto',
    straightKm,
    routeKm,
    overheadMin,
    moveMin,
    minutes: Math.round(overheadMin + moveMin),
    cost,
    vehicles,
    rush,
    night: mode === 'taxi' && isNight(departMin) && region.taxi.night !== 1,
  };
}

/** Modes worth showing for a leg of this length (no 3-hour walks, no 2 km flights). */
export function sensibleModes(straightKm: number): Mode[] {
  return MODE_IDS.filter((m) => {
    if (m === 'walk') return straightKm <= 8;
    if (m === 'subway' || m === 'bus') return straightKm <= 60;
    if (m === 'taxi') return straightKm <= 150;
    if (m === 'train') return straightKm >= 30;
    if (m === 'flight') return straightKm >= 150;
    if (m === 'ferry') return false;
    return true;
  });
}

/** Sensible modes for one leg, for the comparison table, fastest first. */
export function compareModes(from: LatLng, to: LatLng, departMin: number, region: Region, travelers: number): LegEstimate[] {
  return sensibleModes(haversineKm(from, to))
    .map((m) => estimateLeg(from, to, m, departMin, region, travelers))
    .sort((a, b) => a.minutes - b.minutes);
}
