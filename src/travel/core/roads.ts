/**
 * Real road routes for walking and driving legs. The engine only sees this lookup; fetching and
 * caching live in ui/roadbook.ts, so estimates stay pure and testable.
 */
import type { LatLng } from './geo';
import type { Mode } from './types';

export type Profile = 'car' | 'foot';

/** Which router answers for each mode. Rail, air and sea keep the drawn curve. */
export const ROAD_PROFILE: Partial<Record<Mode, Profile>> = { walk: 'foot', bus: 'car', taxi: 'car', car: 'car' };

export interface Road {
  km: number;
  path: LatLng[];
}

export type RoadLookup = (from: LatLng, to: LatLng, profile: Profile) => Road | undefined;

export function roadKey(from: LatLng, to: LatLng, profile: Profile): string {
  const r = (n: number) => n.toFixed(5);
  return `${profile}:${r(from[0])},${r(from[1])};${r(to[0])},${r(to[1])}`;
}
