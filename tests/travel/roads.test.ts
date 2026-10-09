import { describe, expect, it } from 'vitest';
import { haversineKm } from '../../src/travel/core/geo';
import { estimateLeg } from '../../src/travel/core/modes';
import { REGIONS } from '../../src/travel/core/regions';
import { roadKey, type RoadLookup } from '../../src/travel/core/roads';
import { scheduleTrip } from '../../src/travel/core/schedule';
import { buildTimeline } from '../../src/travel/core/sim';
import { parseRoute, RoadBook } from '../../src/travel/ui/roadbook';
import { SAMPLES } from '../../src/travel/samples';

const A: [number, number] = [37.5651, 126.981];
const B: [number, number] = [37.5796, 126.977];

function osrm(km: number, coords: [number, number][] = [[126.9811, 37.5652], [126.979, 37.572], [126.9771, 37.5795]]) {
  return { code: 'Ok', routes: [{ distance: km * 1000, duration: 600, geometry: { type: 'LineString', coordinates: coords } }] };
}

function memory(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as Storage;
}

describe('road routes', () => {
  it('parses an OSRM answer and pins the ends to the stops', () => {
    const r = parseRoute(osrm(2.3), A, B)!;
    expect(r.km).toBeCloseTo(2.3);
    expect(r.path[0]).toEqual(A);
    expect(r.path[r.path.length - 1]).toEqual(B);
    expect(r.path[1]).toEqual([37.5652, 126.9811]); // [lat, lng] from [lng, lat]
  });

  it('rejects no-route answers and absurd detours', () => {
    expect(parseRoute({ code: 'NoRoute', routes: [] }, A, B)).toBeNull();
    expect(parseRoute(osrm(haversineKm(A, B) * 5 + 2), A, B)).toBeNull();
    expect(parseRoute(null, A, B)).toBeNull();
  });

  it('a known road replaces straight-line × detour for road modes only', () => {
    const lookup: RoadLookup = (f, t, p) => (p === 'car' ? { km: 4, path: [f, t] } : undefined);
    const taxi = estimateLeg(A, B, 'taxi', 600, REGIONS.KR, 1, lookup);
    expect(taxi.routeKm).toBe(4);
    expect(taxi.path).toEqual([A, B]);
    const subway = estimateLeg(A, B, 'subway', 600, REGIONS.KR, 1, lookup);
    expect(subway.path).toBeUndefined();
    expect(subway.routeKm).toBeCloseTo(haversineKm(A, B) * 1.3);
  });

  it('the simulation drives along the road path', () => {
    const plan = SAMPLES[0];
    const path: [number, number][] = [];
    const lookup: RoadLookup = (f, t) => {
      path.splice(0, path.length, f, [(f[0] + t[0]) / 2 + 0.01, (f[1] + t[1]) / 2], t);
      return { km: haversineKm(f, t) * 1.4, path: [...path] };
    };
    const day = scheduleTrip(plan, lookup).days[0];
    const tl = buildTimeline(day);
    const taxiSeg = tl.segments.find((s) => s.kind === 'move' && s.mode === 'taxi');
    expect(taxiSeg && taxiSeg.kind === 'move' ? taxiSeg.path.length : 0).toBe(3);
  });

  it('fetches each missing leg once, caches it, and survives a reload', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(osrm(1.5)), { status: 200 });
    }) as unknown as typeof fetch;
    const storage = memory();
    const book = new RoadBook(storage, fake);
    const plan = structuredClone(SAMPLES[0]);
    plan.days[0].stops = plan.days[0].stops.slice(0, 3); // hotel → 경복궁 (subway) → 북촌 (walk)
    let changes = 0;
    await book.load(plan, () => changes++);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('routed-foot');
    expect(changes).toBe(1);
    const s = plan.days[0].stops;
    expect(book.lookup([s[1].lat, s[1].lng], [s[2].lat, s[2].lng], 'foot')).toBeTruthy();

    const again = new RoadBook(storage, fake);
    expect(again.missing(plan)).toHaveLength(0);
    expect(again.lookup([s[1].lat, s[1].lng], [s[2].lat, s[2].lng], 'foot')!.km).toBe(1.5);
  });

  it('stops asking when the routers are unreachable, and caches a real "no route"', async () => {
    let n = 0;
    const offline = (async () => {
      n++;
      throw new TypeError('blocked');
    }) as unknown as typeof fetch;
    const book = new RoadBook(null, offline);
    await book.load(SAMPLES[0], () => {});
    expect(book.enabled).toBe(false);
    expect(n).toBeLessThanOrEqual(2); // one leg, both car routers
    await book.load(SAMPLES[0], () => {});
    expect(n).toBeLessThanOrEqual(2);

    const noRoute = (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch;
    const b2 = new RoadBook(null, noRoute);
    const plan = structuredClone(SAMPLES[0]);
    plan.days[0].stops = plan.days[0].stops.slice(1, 3);
    await b2.load(plan, () => {});
    expect(b2.enabled).toBe(true);
    expect(b2.missing(plan)).toHaveLength(0);
  });

  it('keys are stable to 5 decimals', () => {
    expect(roadKey([37.123456, 127.1], [37.2, 127.2], 'car')).toBe(roadKey([37.1234561, 127.1000001], [37.2, 127.2], 'car'));
  });
});
