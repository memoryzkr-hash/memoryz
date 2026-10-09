/**
 * Fetches real road routes from public OSRM routers and remembers them. Requests go one at a time
 * (the public servers ask for light use), results are cached in this browser, and anything odd
 * (no route, a detour three times the straight line) is ignored so the estimate falls back.
 */
import { haversineKm, type LatLng } from '../core/geo';
import { ROAD_PROFILE, roadKey, type Profile, type Road, type RoadLookup } from '../core/roads';
import type { TripPlan } from '../core/types';
import { estimateLeg } from '../core/modes';
import { REGIONS } from '../core/regions';

const STORE_KEY = 'travel.v1.roads';
const MAX_CACHED = 400;
const MAX_POINTS = 300;
const GAP_MS = 350;

/** Router URLs tried in order. FOSSGIS has walking routes; the OSRM demo is a car fallback. */
function urls(from: LatLng, to: LatLng, profile: Profile): string[] {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const q = '?overview=full&geometries=geojson&alternatives=false&steps=false';
  return profile === 'foot'
    ? [`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}${q}`]
    : [`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}${q}`, `https://router.project-osrm.org/route/v1/driving/${coords}${q}`];
}

/** Keeps the path light enough to animate every frame. */
function thin(path: LatLng[]): LatLng[] {
  if (path.length <= MAX_POINTS) return path;
  const step = Math.ceil(path.length / MAX_POINTS);
  const out = path.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
  return out;
}

export function parseRoute(json: unknown, from: LatLng, to: LatLng): Road | null {
  const r = (json as { code?: string; routes?: { distance?: number; geometry?: { coordinates?: unknown } }[] })?.routes?.[0];
  const coords = r?.geometry?.coordinates;
  if ((json as { code?: string })?.code !== 'Ok' || !r || typeof r.distance !== 'number' || !Array.isArray(coords) || coords.length < 2) return null;
  const pts: LatLng[] = [];
  for (const c of coords) {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') pts.push([c[1], c[0]]);
  }
  if (pts.length < 2) return null;
  const km = r.distance / 1000;
  const straight = haversineKm(from, to);
  if (km > Math.max(1, straight * 3)) return null; // ferry detours, wrong-side snaps
  // The router snaps to the nearest road; start and end exactly at the stops.
  return { km, path: thin([from, ...pts, to]) };
}

type Cached = Road | null;

export class RoadBook {
  private cache = new Map<string, Cached>();
  private pending = new Set<string>();
  private gen = 0;
  private dirty = false;
  enabled = true;

  constructor(private readonly storage: Storage | null, private readonly fetcher: typeof fetch = (...a) => fetch(...a)) {
    try {
      const raw = storage?.getItem(STORE_KEY);
      if (raw) for (const [k, v] of JSON.parse(raw) as [string, Cached][]) this.cache.set(k, v);
    } catch {
      // A broken cache only costs a refetch.
    }
  }

  readonly lookup: RoadLookup = (from, to, profile) => this.cache.get(roadKey(from, to, profile)) ?? undefined;

  /** Every road leg of the plan that has no answer yet. */
  missing(plan: TripPlan): { from: LatLng; to: LatLng; profile: Profile }[] {
    const region = REGIONS[plan.region];
    const out: { from: LatLng; to: LatLng; profile: Profile }[] = [];
    const seen = new Set<string>();
    for (const day of plan.days) {
      day.stops.forEach((s, i) => {
        if (i === 0) return;
        const p = day.stops[i - 1];
        const from: LatLng = [p.lat, p.lng];
        const to: LatLng = [s.lat, s.lng];
        const mode = estimateLeg(from, to, s.modeIn, 720, region, 1).mode;
        const profile = ROAD_PROFILE[mode];
        if (!profile || haversineKm(from, to) < 0.05) return;
        const key = roadKey(from, to, profile);
        if (this.cache.has(key) || this.pending.has(key) || seen.has(key)) return;
        seen.add(key);
        out.push({ from, to, profile });
      });
    }
    return out;
  }

  /**
   * Fetches what the plan still needs, calling `onChange` after each batch of new routes.
   * A newer call cancels an older one.
   */
  async load(plan: TripPlan, onChange: () => void): Promise<void> {
    if (!this.enabled) return;
    const gen = ++this.gen;
    const todo = this.missing(plan);
    let since = 0;
    for (const leg of todo) {
      if (gen !== this.gen) return;
      const key = roadKey(leg.from, leg.to, leg.profile);
      this.pending.add(key);
      let road: Cached | undefined;
      for (const url of urls(leg.from, leg.to, leg.profile)) {
        try {
          const res = await this.fetcher(url, { signal: AbortSignal.timeout(8000) });
          if (res.status === 400) {
            road = null; // the router answered: there is no road route
            break;
          }
          if (!res.ok) continue;
          road = parseRoute(await res.json(), leg.from, leg.to);
          break;
        } catch {
          // blocked, offline or slow: try the next router
        }
      }
      this.pending.delete(key);
      if (road === undefined) {
        // Every router unreachable (offline, or a page that blocks the network): stop asking.
        this.enabled = false;
        break;
      }
      this.cache.set(key, road);
      this.dirty = true;
      since++;
      if (since >= 3) {
        since = 0;
        this.save();
        if (gen === this.gen) onChange();
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    if (since > 0 || this.dirty) {
      this.save();
      if (gen === this.gen && since > 0) onChange();
    }
  }

  private save(): void {
    if (!this.dirty || !this.storage) return;
    this.dirty = false;
    const entries = [...this.cache.entries()].slice(-MAX_CACHED).map(([k, v]) => [k, v && { km: Math.round(v.km * 1000) / 1000, path: v.path.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]) }]);
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch {
      // Full storage: keep the routes for this visit only.
    }
  }
}
