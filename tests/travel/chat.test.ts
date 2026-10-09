import { describe, expect, it } from 'vitest';
import { forget, nextStep, parseDays, parseKrw, progress, step, summary, toRequest, type Answers } from '../../src/travel/chat/flow';
import { cheaperTransport, optimizeTrip } from '../../src/travel/core/tweaks';
import { SAMPLES } from '../../src/travel/samples';

function answer(a: Answers, value: string): Answers {
  const s = nextStep(a);
  if (!s) throw new Error('no step');
  const r = s.apply(a, value);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('parsing what people type', () => {
  it('money', () => {
    expect(parseKrw('40만')).toBe(400000);
    expect(parseKrw('40만 원')).toBe(400000);
    expect(parseKrw('1.5백만')).toBe(1500000);
    expect(parseKrw('350,000원')).toBe(350000);
    expect(parseKrw('많이')).toBeNull();
    expect(parseKrw('0')).toBeNull();
  });

  it('days', () => {
    expect(parseDays('당일')).toBe(1);
    expect(parseDays('3')).toBe(3);
    expect(parseDays('3일')).toBe(3);
    expect(parseDays('2박 3일')).toBe(3);
    expect(parseDays('2박 5일')).toBeNull();
    expect(parseDays('주말')).toBeNull();
  });
});

describe('the interview', () => {
  it('a decided traveller answers 8 questions and gets a full request', () => {
    let a: Answers = {};
    const asked: string[] = [];
    for (const v of ['부산', '3', '친구', '4', '300000', 'packed', '맛집, 야경', 'transit', '10:00']) {
      asked.push(nextStep(a)!.id);
      a = answer(a, v);
    }
    expect(asked).toEqual(['destination', 'days', 'companions', 'travelers', 'budget', 'pace', 'wishes', 'transport', 'start']);
    expect(nextStep(a)).toBeNull();
    expect(progress(a)).toBe(1);
    expect(toRequest(a)).toEqual({
      destination: '부산', days: 3, travelers: 4, budgetKrw: 1200000, pace: 'packed', interests: '맛집, 야경',
      companions: '친구', transport: 'transit', start: '10:00',
    });
  });

  it('going alone or as a couple skips the head count', () => {
    let a = answer({}, '제주');
    a = answer(a, '2');
    a = answer(a, '혼자');
    expect(a.travelers).toBe(1);
    expect(nextStep(a)!.id).toBe('budget');
    a = answer(forget(a, 'companions'), '연인·배우자');
    expect(a.travelers).toBe(2);
  });

  it('an undecided traveller is helped to choose', () => {
    let a = answer({}, '?');
    expect(nextStep(a)!.id).toBe('abroad');
    a = answer(a, 'abroad');
    a = answer(a, '맛집');
    const pick = nextStep(a)!;
    expect(pick.id).toBe('pick');
    expect(pick.choices(a).map((c) => c.value)).toContain('오사카');
    a = answer(a, '오사카');
    expect(a.destination).toBe('오사카');
    expect(nextStep(a)!.id).toBe('days');
    expect(nextStep(a)!.ask(a)).toContain('오사카');
  });

  it('rejects answers it cannot use, with a hint', () => {
    expect(step('days').apply({ destination: 'x' }, '주말')).toHaveProperty('error');
    expect(step('days').apply({ destination: 'x' }, '9일')).toHaveProperty('error');
    expect(step('travelers').apply({}, '20')).toHaveProperty('error');
    expect(step('budget').apply({}, '많이')).toHaveProperty('error');
  });

  it('"nothing special" clears the wish list; overseas budgets scale up', () => {
    expect((step('wishes').apply({}, '맛집, 특별히 없어요') as Answers).wishes).toEqual([]);
    const home = step('budget').choices({ destination: '강릉', days: 2 })[0].value;
    const away = step('budget').choices({ destination: '도쿄', days: 2 })[0].value;
    expect(Number(away)).toBe(Number(home) * 3);
  });

  it('editing one answer asks only that question again', () => {
    let a: Answers = {};
    for (const v of ['강릉', '2', '가족', '4', 'none', 'relaxed', '카페', 'car', '09:00']) a = answer(a, v);
    const again = forget(a, 'budget');
    expect(nextStep(again)!.id).toBe('budget');
    const done = answer(again, '20만');
    expect(nextStep(done)).toBeNull();
    expect(summary(done).find((r) => r.id === 'budget')!.value).toContain('총 80만 원');
  });
});

describe('one-tap tweaks', () => {
  it('cheaper transport saves money on the Seoul sample and never adds cost', () => {
    const r = cheaperTransport(SAMPLES[0]);
    expect(r.changed).toBeGreaterThan(0);
    expect(r.saved).toBeGreaterThan(0);
    expect(r.plan.days[0].stops.some((s) => s.modeIn === 'taxi')).toBe(false);
  });

  it('optimizing never makes travel longer', () => {
    for (const p of SAMPLES) expect(optimizeTrip(p).savedMin).toBeGreaterThanOrEqual(0);
  });
});
