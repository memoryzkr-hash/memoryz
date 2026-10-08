/**
 * Fare tables per region (approximate 2026 published fares). Every number the app predicts comes
 * from here and modes.ts, so a plan always gives the same estimate. See docs/TRAVEL_PLAN.md §3.3.
 */
import type { RegionId } from './types';

export interface Fare {
  base: number;
  /** Distance the base fare covers. */
  baseKm: number;
  perKm: number;
}

export interface Region {
  id: RegionId;
  name: string;
  currency: string;
  symbol: string;
  /** Digits shown after the decimal point. */
  decimals: number;
  /** KRW for one unit of the currency (fixed reference rate, shown on screen). */
  krw: number;
  /** Taxi meters and fuel bills move in steps of this much. */
  fareStep: number;
  hasMetro: boolean;
  /** Per vehicle. `night` multiplies the fare 22:00–04:00. */
  taxi: Fare & { min: number; night: number };
  /** Per person: base fare up to baseKm, then `step` more every `stepKm`, capped at `max`. */
  metro: { base: number; baseKm: number; stepKm: number; step: number; max: number };
  /** Per person, flat. */
  bus: number;
  /** Per vehicle: fuel, tolls and rental share. */
  carPerKm: number;
  /** Per person. */
  train: Fare;
  flight: Fare;
  ferry: Fare;
}

export const REGIONS: Record<RegionId, Region> = {
  KR: {
    id: 'KR', name: '한국', currency: 'KRW', symbol: '₩', decimals: 0, krw: 1, fareStep: 100, hasMetro: true,
    taxi: { base: 4800, baseKm: 1.6, perKm: 770, min: 4800, night: 1.2 },
    metro: { base: 1400, baseKm: 10, stepKm: 5, step: 100, max: 3200 },
    bus: 1500,
    carPerKm: 280,
    train: { base: 8400, baseKm: 0, perKm: 130 },
    flight: { base: 40000, baseKm: 0, perKm: 110 },
    ferry: { base: 8000, baseKm: 0, perKm: 160 },
  },
  JP: {
    id: 'JP', name: '일본', currency: 'JPY', symbol: '¥', decimals: 0, krw: 9.3, fareStep: 10, hasMetro: true,
    taxi: { base: 500, baseKm: 1.096, perKm: 400, min: 500, night: 1.2 },
    metro: { base: 180, baseKm: 6, stepKm: 5, step: 30, max: 330 },
    bus: 210,
    carPerKm: 28,
    train: { base: 1200, baseKm: 0, perKm: 27 },
    flight: { base: 9000, baseKm: 0, perKm: 14 },
    ferry: { base: 800, baseKm: 0, perKm: 22 },
  },
  FR: {
    id: 'FR', name: '프랑스', currency: 'EUR', symbol: '€', decimals: 2, krw: 1520, fareStep: 0.1, hasMetro: true,
    taxi: { base: 4.4, baseKm: 0, perKm: 1.3, min: 8, night: 1.25 },
    metro: { base: 2.5, baseKm: 100, stepKm: 1, step: 0, max: 2.5 },
    bus: 2.5,
    carPerKm: 0.24,
    train: { base: 15, baseKm: 0, perKm: 0.13 },
    flight: { base: 55, baseKm: 0, perKm: 0.09 },
    ferry: { base: 12, baseKm: 0, perKm: 0.2 },
  },
  US: {
    id: 'US', name: '미국', currency: 'USD', symbol: '$', decimals: 2, krw: 1390, fareStep: 0.05, hasMetro: true,
    taxi: { base: 3.5, baseKm: 0, perKm: 2.2, min: 8, night: 1.1 },
    metro: { base: 2.9, baseKm: 100, stepKm: 1, step: 0, max: 2.9 },
    bus: 2.9,
    carPerKm: 0.2,
    train: { base: 20, baseKm: 0, perKm: 0.15 },
    flight: { base: 80, baseKm: 0, perKm: 0.09 },
    ferry: { base: 10, baseKm: 0, perKm: 0.25 },
  },
  TH: {
    id: 'TH', name: '태국', currency: 'THB', symbol: '฿', decimals: 0, krw: 41, fareStep: 1, hasMetro: true,
    taxi: { base: 35, baseKm: 1, perKm: 7, min: 35, night: 1 },
    metro: { base: 17, baseKm: 2, stepKm: 2, step: 4, max: 47 },
    bus: 15,
    carPerKm: 4,
    train: { base: 100, baseKm: 0, perKm: 1.2 },
    flight: { base: 1100, baseKm: 0, perKm: 2.2 },
    ferry: { base: 60, baseKm: 0, perKm: 3 },
  },
  OTHER: {
    id: 'OTHER', name: '기타', currency: 'USD', symbol: '$', decimals: 2, krw: 1390, fareStep: 0.05, hasMetro: false,
    taxi: { base: 3, baseKm: 0, perKm: 1.2, min: 5, night: 1.15 },
    metro: { base: 1.5, baseKm: 100, stepKm: 1, step: 0, max: 1.5 },
    bus: 1,
    carPerKm: 0.18,
    train: { base: 10, baseKm: 0, perKm: 0.1 },
    flight: { base: 70, baseKm: 0, perKm: 0.09 },
    ferry: { base: 8, baseKm: 0, perKm: 0.2 },
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export function isRegionId(v: unknown): v is RegionId {
  return typeof v === 'string' && v in REGIONS;
}

/** Rounds to what a fare machine would charge (whole units, or cents). */
export function roundMoney(region: Region, n: number): number {
  const f = 10 ** region.decimals;
  return Math.round(n * f) / f;
}

/** Rounds a metered fare to the meter's step (₩100, ¥10…). */
export function roundFare(region: Region, n: number): number {
  return roundMoney(region, Math.round(n / region.fareStep) * region.fareStep);
}

export function formatMoney(region: Region, n: number): string {
  const s = n.toLocaleString('ko-KR', { minimumFractionDigits: region.decimals, maximumFractionDigits: region.decimals });
  return region.id === 'KR' ? `${s}원` : `${region.symbol}${s}`;
}

export function formatKrw(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function toKrw(region: Region, n: number): number {
  return n * region.krw;
}
