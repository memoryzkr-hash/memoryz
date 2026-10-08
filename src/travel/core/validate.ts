/**
 * Checks a plan from Claude (or from storage) before anything uses it. Fixable values are clamped;
 * stops without a real position are dropped; a plan with no usable day is rejected.
 */
import { isLatLng } from './geo';
import { isModeChoice } from './modes';
import { isRegionId } from './regions';
import { parseClock } from './time';
import type { DayPlan, PlaceKind, Stop, TripPlan } from './types';

export const LIMITS = {
  days: 7,
  stopsPerDay: 12,
  travelers: 8,
  stayMin: 600,
  name: 60,
  note: 200,
  tips: 6,
};

export const KINDS: PlaceKind[] = ['hotel', 'sight', 'food', 'cafe', 'shop', 'activity', 'nature', 'station', 'airport'];

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const clock = (v: unknown): string | null => {
  const m = parseClock(typeof v === 'string' ? v : null);
  return m === null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function checkStop(raw: unknown): Stop | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name, LIMITS.name);
  if (!name || !isLatLng(raw.lat, raw.lng)) return null;
  const lat = raw.lat as number;
  const lng = raw.lng as number;
  if (lat === 0 && lng === 0) return null; // "null island": a missing position, not a place
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('s'),
    name,
    lat,
    lng,
    kind: KINDS.includes(raw.kind as PlaceKind) ? (raw.kind as PlaceKind) : 'sight',
    stayMin: Math.round(num(raw.stayMin, 0, LIMITS.stayMin, 60)),
    cost: num(raw.cost, 0, 1e9, 0),
    open: clock(raw.open),
    close: clock(raw.close),
    note: str(raw.note, LIMITS.note) || null,
    modeIn: isModeChoice(raw.modeIn) ? raw.modeIn : 'auto',
  };
}

export function checkDay(raw: unknown, index: number): DayPlan | null {
  if (!isObj(raw) || !Array.isArray(raw.stops)) return null;
  const stops = raw.stops.map(checkStop).filter((s): s is Stop => s !== null).slice(0, LIMITS.stopsPerDay);
  if (!stops.length) return null;
  return { label: str(raw.label, 40) || `${index + 1}일차`, start: clock(raw.start) ?? '09:00', stops };
}

export function checkPlan(raw: unknown): TripPlan | null {
  if (!isObj(raw) || !Array.isArray(raw.days)) return null;
  const days = raw.days
    .slice(0, LIMITS.days)
    .map((d, i) => checkDay(d, i))
    .filter((d): d is DayPlan => d !== null);
  if (!days.length) return null;
  const budget = typeof raw.budgetKrw === 'number' && Number.isFinite(raw.budgetKrw) && raw.budgetKrw > 0 ? Math.round(raw.budgetKrw) : null;
  const destination = str(raw.destination, 60);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('p'),
    title: str(raw.title, 60) || destination || '나의 여행',
    destination,
    region: isRegionId(raw.region) ? raw.region : 'OTHER',
    travelers: Math.round(num(raw.travelers, 1, LIMITS.travelers, 2)),
    budgetKrw: budget,
    lodgingPerNight: num(raw.lodgingPerNight, 0, 1e9, 0),
    days,
    tips: Array.isArray(raw.tips) ? raw.tips.map((t) => str(t, 200)).filter(Boolean).slice(0, LIMITS.tips) : [],
  };
}
