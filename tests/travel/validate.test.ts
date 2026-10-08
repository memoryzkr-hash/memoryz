import { describe, expect, it } from 'vitest';
import { checkPlan, checkStop, LIMITS } from '../../src/travel/core/validate';
import { TravelStore, KEYS } from '../../src/travel/core/store';
import { samplePlan, SAMPLES } from '../../src/travel/samples';

const good = { name: '경복궁', lat: 37.5796, lng: 126.977, kind: 'sight', stayMin: 90, cost: 3000, modeIn: 'subway', open: '09:00', close: '18:00', note: null };

describe('checkStop', () => {
  it('keeps a good stop', () => {
    const s = checkStop(good)!;
    expect(s.name).toBe('경복궁');
    expect(s.modeIn).toBe('subway');
    expect(s.open).toBe('09:00');
  });

  it('drops stops without a real position', () => {
    expect(checkStop({ ...good, lat: 120 })).toBeNull();
    expect(checkStop({ ...good, lng: '126' })).toBeNull();
    expect(checkStop({ ...good, lat: 0, lng: 0 })).toBeNull();
    expect(checkStop({ ...good, name: '  ' })).toBeNull();
    expect(checkStop(null)).toBeNull();
  });

  it('clamps and repairs the rest', () => {
    const s = checkStop({ ...good, stayMin: 5000, cost: -3, kind: 'castle', modeIn: 'rocket', open: '25:00', name: 'x'.repeat(100) })!;
    expect(s.stayMin).toBe(LIMITS.stayMin);
    expect(s.cost).toBe(0);
    expect(s.kind).toBe('sight');
    expect(s.modeIn).toBe('auto');
    expect(s.open).toBeNull();
    expect(s.name.length).toBe(LIMITS.name);
  });
});

describe('checkPlan', () => {
  it('rejects plans with no usable day', () => {
    expect(checkPlan(null)).toBeNull();
    expect(checkPlan({ days: [] })).toBeNull();
    expect(checkPlan({ days: [{ stops: [{ ...good, lat: 999 }] }] })).toBeNull();
  });

  it('fills defaults and limits days and stops', () => {
    const days = Array.from({ length: 10 }, () => ({ stops: Array.from({ length: 20 }, () => good) }));
    const p = checkPlan({ days, region: 'XX', travelers: 99, budgetKrw: -5 })!;
    expect(p.days).toHaveLength(LIMITS.days);
    expect(p.days[0].stops).toHaveLength(LIMITS.stopsPerDay);
    expect(p.days[0].start).toBe('09:00');
    expect(p.days[1].label).toBe('2일차');
    expect(p.region).toBe('OTHER');
    expect(p.travelers).toBe(LIMITS.travelers);
    expect(p.budgetKrw).toBeNull();
  });
});

describe('store', () => {
  function memory(): Storage {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as Storage;
  }

  it('round-trips a plan and survives broken JSON', () => {
    const storage = memory();
    const s = new TravelStore(storage);
    expect(s.plan()).toBeNull();
    const p = samplePlan(SAMPLES[1].id)!;
    expect(s.savePlan(p)).toBe(true);
    expect(s.plan()).toEqual(p);
    storage.setItem(KEYS.plan, '{oops');
    expect(s.plan()).toBeNull();
  });

  it('reports a full or blocked storage instead of throwing', () => {
    const s = new TravelStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} } as unknown as Storage);
    expect(s.plan()).toBeNull();
    expect(s.savePlan(SAMPLES[0])).toBe(false);
    expect(s.request().days).toBe(2);
  });

  it('samplePlan returns an independent copy', () => {
    const a = samplePlan('sample-seoul')!;
    a.days[0].stops[0].name = 'changed';
    expect(SAMPLES[0].days[0].stops[0].name).not.toBe('changed');
    expect(samplePlan('nope')).toBeNull();
  });
});
