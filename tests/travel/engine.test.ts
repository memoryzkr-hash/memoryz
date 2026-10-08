import { describe, expect, it } from 'vitest';
import { curvedPath, haversineKm, pointAlong } from '../../src/travel/core/geo';
import { autoMode, compareModes, estimateLeg, isRush, legCost, RUSH_FACTOR } from '../../src/travel/core/modes';
import { optimizeDay, routeMinutes } from '../../src/travel/core/optimize';
import { formatMoney, REGIONS } from '../../src/travel/core/regions';
import { scheduleDay, scheduleTrip } from '../../src/travel/core/schedule';
import { buildTimeline, stateAt } from '../../src/travel/core/sim';
import { formatClock, formatDuration, parseClock } from '../../src/travel/core/time';
import type { DayPlan, Stop, TripPlan } from '../../src/travel/core/types';
import { SAMPLES } from '../../src/travel/samples';

const KR = REGIONS.KR;
const SEOUL: [number, number] = [37.5665, 126.978];
const BUSAN: [number, number] = [35.1796, 129.0756];

let n = 0;
function stop(name: string, lat: number, lng: number, extra: Partial<Stop> = {}): Stop {
  n += 1;
  return { id: `t${n}`, name, lat, lng, kind: 'sight', stayMin: 60, cost: 0, open: null, close: null, note: null, modeIn: 'auto', ...extra };
}

describe('geo', () => {
  it('Seoul–Busan is about 325 km in a straight line', () => {
    expect(haversineKm(SEOUL, BUSAN)).toBeGreaterThan(315);
    expect(haversineKm(SEOUL, BUSAN)).toBeLessThan(335);
  });

  it('curved path starts and ends on the points and pointAlong walks it', () => {
    const p = curvedPath(SEOUL, BUSAN, 0.1);
    expect(p[0]).toEqual(SEOUL);
    expect(p[p.length - 1][0]).toBeCloseTo(BUSAN[0], 9);
    expect(pointAlong(p, 0)).toEqual(SEOUL);
    expect(pointAlong(p, 1)[1]).toBeCloseTo(BUSAN[1], 9);
    const mid = pointAlong(p, 0.5);
    expect(haversineKm(SEOUL, mid)).toBeGreaterThan(100);
    expect(haversineKm(BUSAN, mid)).toBeGreaterThan(100);
  });
});

describe('time', () => {
  it('parses and formats clocks', () => {
    expect(parseClock('09:05')).toBe(545);
    expect(parseClock('9:05')).toBe(545);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(formatClock(545)).toBe('09:05');
    expect(formatClock(1440 + 70)).toBe('다음날 01:10');
    expect(formatDuration(45)).toBe('45분');
    expect(formatDuration(120)).toBe('2시간');
    expect(formatDuration(135)).toBe('2시간 15분');
  });
});

describe('modes', () => {
  it('auto picks by distance', () => {
    expect(autoMode(0.8, KR)).toBe('walk');
    expect(autoMode(5, KR)).toBe('subway');
    expect(autoMode(5, REGIONS.OTHER)).toBe('taxi');
    expect(autoMode(120, KR)).toBe('train');
    expect(autoMode(900, KR)).toBe('flight');
  });

  it('walking is free and ~4.5 km/h', () => {
    const e = estimateLeg([37.5, 127], [37.5, 127.01], 'walk', 600, KR, 2);
    expect(e.cost).toBe(0);
    expect(e.minutes).toBe(Math.round((e.routeKm / 4.5) * 60));
  });

  it('KR subway fare: base up to 10 km, +100 every 5 km after', () => {
    expect(legCost('subway', 8, 600, KR, 1).cost).toBe(1400);
    expect(legCost('subway', 12, 600, KR, 1).cost).toBe(1500);
    expect(legCost('subway', 16, 600, KR, 1).cost).toBe(1600);
    expect(legCost('subway', 12, 600, KR, 3).cost).toBe(4500);
  });

  it('taxis are per car: 4 people one car, 5 people two', () => {
    const one = legCost('taxi', 10, 600, KR, 4);
    const two = legCost('taxi', 10, 600, KR, 5);
    expect(one.vehicles).toBe(1);
    expect(two.vehicles).toBe(2);
    expect(two.cost).toBe(one.cost * 2);
    expect(one.cost).toBe(Math.round((4800 + (10 - 1.6) * 770) / 100) * 100);
  });

  it('KR taxi night surcharge 22:00–04:00', () => {
    const day = legCost('taxi', 10, 20 * 60, KR, 1).cost;
    const night = legCost('taxi', 10, 23 * 60, KR, 1).cost;
    expect(night).toBe(Math.round(((4800 + (10 - 1.6) * 770) * 1.2) / 100) * 100);
    expect(night).toBeGreaterThan(day);
    expect(estimateLeg(SEOUL, [37.6, 127.05], 'taxi', 23 * 60, KR, 1).night).toBe(true);
  });

  it('rush hour slows road traffic, not the subway', () => {
    expect(isRush(8 * 60)).toBe(true);
    expect(isRush(12 * 60)).toBe(false);
    const a: [number, number] = [37.5, 127];
    const b: [number, number] = [37.55, 127.05];
    const noon = estimateLeg(a, b, 'taxi', 12 * 60, KR, 1);
    const rush = estimateLeg(a, b, 'taxi', 8 * 60, KR, 1);
    expect(rush.rush).toBe(true);
    expect(rush.moveMin).toBeCloseTo(noon.moveMin * RUSH_FACTOR, 6);
    expect(estimateLeg(a, b, 'subway', 8 * 60, KR, 1).minutes).toBe(estimateLeg(a, b, 'subway', 12 * 60, KR, 1).minutes);
  });

  it('KTX Seoul–Busan lands near real fare and time', () => {
    const e = estimateLeg(SEOUL, BUSAN, 'train', 600, KR, 1);
    expect(e.cost).toBeGreaterThan(45000);
    expect(e.cost).toBeLessThan(70000);
    expect(e.minutes).toBeGreaterThan(130);
    expect(e.minutes).toBeLessThan(200);
  });

  it('same place → zero leg', () => {
    const e = estimateLeg(SEOUL, SEOUL, 'taxi', 600, KR, 2);
    expect(e.minutes).toBe(0);
    expect(e.cost).toBe(0);
  });

  it('comparison hides silly options and sorts fastest first', () => {
    const near = compareModes([37.5, 127], [37.505, 127.005], 600, KR, 2).map((e) => e.mode);
    expect(near).toContain('walk');
    expect(near).not.toContain('flight');
    const far = compareModes(SEOUL, BUSAN, 600, KR, 2);
    expect(far.map((e) => e.mode)).not.toContain('walk');
    expect(far[0].mode).toBe('flight');
    for (let i = 1; i < far.length; i++) expect(far[i].minutes).toBeGreaterThanOrEqual(far[i - 1].minutes);
  });

  it('money formats per currency', () => {
    expect(formatMoney(KR, 12400)).toBe('12,400원');
    expect(formatMoney(REGIONS.JP, 1500)).toBe('¥1,500');
    expect(formatMoney(REGIONS.FR, 2.5)).toBe('€2.50');
  });
});

describe('schedule', () => {
  const hotel = stop('호텔', 37.5651, 126.981, { kind: 'hotel', stayMin: 0 });

  it('walks the clock: travel + stay, first stop leaves at start', () => {
    const a = stop('A', 37.5796, 126.977, { stayMin: 90, modeIn: 'subway', cost: 3000 });
    const day: DayPlan = { label: 'd', start: '10:00', stops: [hotel, a] };
    const s = scheduleDay(day, 0, KR, 2);
    expect(s.start).toBe(600);
    expect(s.legs).toHaveLength(1);
    expect(s.visits[1].arrive).toBe(600 + s.legs[0].minutes);
    expect(s.end).toBe(s.visits[1].arrive + 90);
    expect(s.places).toBe(6000);
    expect(s.transport).toBe(2800);
  });

  it('waits for opening time without a warning', () => {
    const a = stop('A', 37.566, 126.982, { modeIn: 'walk', open: '10:00', stayMin: 30 });
    const s = scheduleDay({ label: 'd', start: '08:00', stops: [hotel, a] }, 0, KR, 1);
    expect(s.visits[1].begin).toBe(600);
    expect(s.visits[1].wait).toBe(600 - s.visits[1].arrive);
    expect(s.end).toBe(630);
    expect(s.warnings).toHaveLength(0);
  });

  it('warns when arriving after closing, at night, and on long walks', () => {
    const far = stop('먼 곳', 37.62, 127.06, { modeIn: 'walk', close: '18:00' });
    const s = scheduleDay({ label: 'd', start: '22:00', stops: [hotel, far] }, 0, KR, 1);
    const kinds = s.warnings.map((w) => w.kind);
    expect(kinds).toContain('long-walk');
    expect(kinds).toContain('late');
    expect(kinds).toContain('closed');
  });

  it('places open past midnight are not closed late at night', () => {
    const bar = stop('바', 37.566, 126.982, { modeIn: 'walk', open: '18:00', close: '02:00' });
    const s = scheduleDay({ label: 'd', start: '23:30', stops: [hotel, bar] }, 0, KR, 1);
    expect(s.warnings.map((w) => w.kind)).not.toContain('closed');
  });

  it('trip totals: lodging = nights × rooms, budget check in KRW', () => {
    const d: DayPlan = { label: 'd', start: '09:00', stops: [hotel, stop('A', 37.57, 126.99, { cost: 10000 })] };
    const plan: TripPlan = { id: 'p', title: 't', destination: '서울', region: 'KR', travelers: 3, budgetKrw: 100000, lodgingPerNight: 100000, days: [d, d, d], tips: [] };
    const s = scheduleTrip(plan);
    expect(s.nights).toBe(2);
    expect(s.rooms).toBe(2);
    expect(s.lodging).toBe(400000);
    expect(s.total).toBe(s.transport + s.places + s.lodging);
    expect(s.overBudget).toBe(true);
    expect(s.warnings.some((w) => w.kind === 'budget')).toBe(true);
  });

  it('every sample schedules without a closed-place or budget warning', () => {
    expect(SAMPLES.length).toBe(4);
    for (const p of SAMPLES) {
      const s = scheduleTrip(p);
      const bad = s.warnings.filter((w) => w.kind === 'closed' || w.kind === 'budget');
      expect(bad, `${p.title}: ${bad.map((w) => w.message).join(', ')}`).toHaveLength(0);
      expect(s.total).toBeGreaterThan(0);
    }
  });
});

describe('simulation', () => {
  const plan = SAMPLES[0];
  const day = scheduleTrip(plan).days[0];
  const tl = buildTimeline(day);

  it('covers the day from start to end without gaps', () => {
    expect(tl.segments[0].from).toBe(day.start);
    expect(tl.segments[tl.segments.length - 1].to).toBe(day.end);
    for (let i = 1; i < tl.segments.length; i++) expect(tl.segments[i].from).toBe(tl.segments[i - 1].to);
  });

  it('starts at the first stop and ends at the last with everything paid', () => {
    const s0 = stateAt(day, tl, day.start);
    expect(s0.at).toEqual([day.visits[0].stop.lat, day.visits[0].stop.lng]);
    expect(s0.spent).toBe(0);
    const end = stateAt(day, tl, day.end + 100);
    const last = day.visits[day.visits.length - 1].stop;
    expect(end.kind).toBe('done');
    expect(end.at[0]).toBeCloseTo(last.lat, 9);
    expect(end.spent).toBe(day.transport + day.places);
    expect(end.km).toBeCloseTo(day.km, 6);
  });

  it('money and distance never go down as time passes', () => {
    let spent = -1;
    let km = -1;
    for (let t = day.start; t <= day.end; t += 3) {
      const s = stateAt(day, tl, t);
      expect(s.spent).toBeGreaterThanOrEqual(spent);
      expect(s.km).toBeGreaterThanOrEqual(km - 1e-9);
      spent = s.spent;
      km = s.km;
    }
  });

  it('mid-leg the traveller is between the two stops, waiting first', () => {
    const leg = day.legs.find((l) => l.overheadMin > 0 && l.moveMin > 5)!;
    const seg = tl.segments.find((s) => s.kind === 'move' && s.leg === day.legs.indexOf(leg))!;
    expect(stateAt(day, tl, seg.from + 1).kind).toBe('wait');
    const mid = stateAt(day, tl, (seg.kind === 'move' ? seg.boardAt : 0) + leg.moveMin / 2);
    expect(mid.kind).toBe('move');
    expect(mid.mode).toBe(leg.mode);
    expect(mid.progress).toBeGreaterThan(0.3);
    expect(mid.progress).toBeLessThan(0.7);
  });
});

describe('optimize', () => {
  it('fixes a zig-zag and never makes things worse; first and hotel end stay put', () => {
    const hotel = stop('호텔', 37.5, 127.0, { kind: 'hotel', stayMin: 0 });
    const a = stop('A', 37.5, 127.01, { modeIn: 'taxi' });
    const b = stop('B', 37.5, 127.03, { modeIn: 'taxi' });
    const c = stop('C', 37.5, 127.02, { modeIn: 'taxi' });
    const back = { ...hotel, id: 'back' };
    const day: DayPlan = { label: 'd', start: '09:00', stops: [hotel, b, a, c, back] };
    const r = optimizeDay(day, KR, 2);
    expect(r.changed).toBe(true);
    expect(r.afterMin).toBeLessThan(r.beforeMin);
    expect(r.day.stops[0]).toBe(hotel);
    expect(r.day.stops[r.day.stops.length - 1]).toBe(back);
    expect(r.afterMin).toBe(routeMinutes(r.day.stops, KR, 2));
  });

  it('leaves an already good order alone', () => {
    const s = [stop('h', 37.5, 127), stop('a', 37.5, 127.01, { modeIn: 'taxi' }), stop('b', 37.5, 127.02, { modeIn: 'taxi' })];
    const r = optimizeDay({ label: 'd', start: '09:00', stops: s }, KR, 1);
    expect(r.changed).toBe(false);
  });

  it('uses 2-opt for long days and still improves', () => {
    const s = [stop('h', 37.5, 127, { kind: 'hotel' })];
    const xs = [9, 1, 7, 3, 5, 2, 8, 4, 6, 10];
    for (const x of xs) s.push(stop(`p${x}`, 37.5, 127 + x * 0.01, { modeIn: 'taxi' }));
    const r = optimizeDay({ label: 'd', start: '09:00', stops: s }, KR, 1);
    expect(r.afterMin).toBeLessThan(r.beforeMin);
  });
});
