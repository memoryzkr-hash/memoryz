import { describe, expect, it } from 'vitest';
import {
  applyImport,
  DAY,
  formatDuration,
  HOUR,
  newAccount,
  nextBilling,
  normalizeAccount,
  parseUsageJson,
  rankAccounts,
  rollForward,
  sessionStatus,
  weeklyStatus,
  WEEK,
  type Account,
} from '../../src/usage/core';

const now = new Date('2026-10-08T12:00:00');
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

function account(name: string, used: number | null, resetIn: number, readAgo = HOUR): Account {
  return {
    ...newAccount(name, now),
    name,
    weekly: { used, resetAt: at(resetIn), updatedAt: at(-readAgo) },
  };
}

describe('rollForward', () => {
  it('keeps a future reset', () => {
    const t = new Date(now.getTime() + HOUR);
    expect(rollForward(t, now, WEEK)).toEqual({ next: t, skipped: 0 });
  });
  it('moves a reset from yesterday six days ahead', () => {
    const { next, skipped } = rollForward(new Date(now.getTime() - DAY), now, WEEK);
    expect(skipped).toBe(1);
    expect(next.getTime() - now.getTime()).toBe(6 * DAY);
  });
  it('skips several weeks at once', () => {
    expect(rollForward(new Date(now.getTime() - 15 * DAY), now, WEEK).skipped).toBe(3);
  });
});

describe('weeklyStatus', () => {
  it('flags a reading from before the last reset', () => {
    const s = weeklyStatus({ used: 80, resetAt: at(-DAY), updatedAt: at(-2 * DAY) }, now);
    expect(s.level).toBe('stale-reset');
    expect(s.used).toBe(0);
    expect(s.remaining).toBe(100);
    expect(s.msLeft).toBe(6 * DAY);
  });

  it('calls 50% used with a quarter of the week gone "fast", projecting 200%', () => {
    const s = weeklyStatus(account('a', 50, 0.75 * WEEK).weekly, now);
    expect(s.elapsed).toBeCloseTo(0.25);
    expect(s.projected).toBe(200);
    expect(s.level).toBe('fast');
  });

  it('calls a light week "plenty"', () => {
    expect(weeklyStatus(account('a', 20, 3 * DAY).weekly, now).level).toBe('plenty');
  });

  it('marks a lot left within a day of the reset as "use-it"', () => {
    expect(weeklyStatus(account('a', 50, 10 * HOUR).weekly, now).level).toBe('use-it');
  });

  it('marks 100% as exhausted', () => {
    expect(weeklyStatus(account('a', 100, 2 * DAY).weekly, now).level).toBe('exhausted');
  });

  it('withholds a projection in the first hours of a week', () => {
    const s = weeklyStatus(account('a', 10, WEEK - 2 * HOUR).weekly, now);
    expect(s.projected).toBeNull();
    expect(s.level).toBe('ok');
  });

  it('is unknown without a reset time', () => {
    expect(weeklyStatus({ used: 30, resetAt: null, updatedAt: null }, now).level).toBe('unknown');
  });
});

describe('sessionStatus', () => {
  it('is idle once the 5-hour window ended', () => {
    expect(sessionStatus({ used: 100, resetAt: at(-HOUR), updatedAt: null }, now).level).toBe('idle');
  });
  it('is blocked at 100% inside the window', () => {
    const s = sessionStatus({ used: 100, resetAt: at(90 * 60_000), updatedAt: null }, now);
    expect(s.level).toBe('blocked');
    expect(s.msLeft).toBe(90 * 60_000);
  });
});

describe('rankAccounts', () => {
  it('puts the account that resets soon with a lot left first', () => {
    const soon = account('soon', 40, 12 * HOUR);
    const later = account('later', 10, 5 * DAY);
    const { picks } = rankAccounts([later, soon], now);
    expect(picks.map((p) => p.account.name)).toEqual(['soon', 'later']);
    expect(picks[0].perHour).toBeCloseTo(5);
  });

  it('leaves out accounts blocked by the session limit or exhausted', () => {
    const blockedSession: Account = { ...account('s', 20, 2 * DAY), session: { used: 100, resetAt: at(HOUR), updatedAt: null } };
    const exhausted = account('x', 100, 2 * DAY);
    const unknown = { ...newAccount('u', now), name: 'u' };
    const r = rankAccounts([blockedSession, exhausted, unknown], now);
    expect(r.picks).toHaveLength(0);
    expect(r.blocked.map((b) => b.account.name)).toEqual(['s', 'x', 'u']);
    expect(r.blocked[0].reason).toMatch(/^세션 한도 · \d\d:\d\d 이후$/);
  });
});

describe('nextBilling', () => {
  it('uses this month when the day is still ahead', () => {
    expect(nextBilling(15, now).getDate()).toBe(15);
    expect(nextBilling(15, now).getMonth()).toBe(9);
  });
  it('counts today', () => {
    expect(nextBilling(8, now).getDate()).toBe(8);
  });
  it('rolls to next month and clamps to its length', () => {
    const d = nextBilling(31, new Date('2026-10-31T10:00:00'));
    expect([d.getMonth(), d.getDate()]).toEqual([9, 31]);
    const n = nextBilling(31, new Date('2026-11-01T10:00:00'));
    expect([n.getMonth(), n.getDate()]).toEqual([10, 30]);
  });
});

describe('parseUsageJson', () => {
  const usage = {
    five_hour: { utilization: 42.5, resets_at: '2026-10-08T14:00:00Z' },
    seven_day: { utilization: 61, resets_at: '2026-10-11T00:00:00Z' },
    seven_day_opus: null,
  };

  it('reads the bookmarklet payload', () => {
    const r = parseUsageJson(JSON.stringify({ email: 'me@example.com', usage }));
    expect(r).toEqual({
      email: 'me@example.com',
      weekly: { used: 61, resetAt: '2026-10-11T00:00:00.000Z' },
      session: { used: 42.5, resetAt: '2026-10-08T14:00:00.000Z' },
    });
  });

  it('reads a bare usage object and a session with no running window', () => {
    const r = parseUsageJson(JSON.stringify({ ...usage, five_hour: { utilization: 0, resets_at: null } }));
    expect(r?.email).toBeNull();
    expect(r?.session).toEqual({ used: 0, resetAt: null });
  });

  it('rejects unrelated text', () => {
    expect(parseUsageJson('hello')).toBeNull();
    expect(parseUsageJson('{"a":1}')).toBeNull();
  });

  it('applies to an account and stamps the reading', () => {
    const a = applyImport(newAccount('a', now), parseUsageJson(JSON.stringify({ email: 'me@example.com', usage }))!, now);
    expect(a.email).toBe('me@example.com');
    expect(a.weekly).toEqual({ used: 61, resetAt: '2026-10-11T00:00:00.000Z', updatedAt: now.toISOString() });
  });
});

describe('normalizeAccount', () => {
  it('drops junk and keeps valid fields', () => {
    const a = normalizeAccount({ name: 'x', plan: 'nope', billingDay: 40, weekly: { used: 150, resetAt: 'bad' } }, 'id1', now);
    expect(a.id).toBe('id1');
    expect(a.plan).toBe('other');
    expect(a.billingDay).toBeNull();
    expect(a.weekly).toEqual({ used: 100, resetAt: null, updatedAt: null });
  });
});

describe('formatDuration', () => {
  it('formats days, hours and minutes', () => {
    expect(formatDuration(2 * DAY + 14 * HOUR + 5 * 60_000)).toBe('2일 14시간');
    expect(formatDuration(HOUR + 20 * 60_000)).toBe('1시간 20분');
    expect(formatDuration(12 * 60_000)).toBe('12분');
    expect(formatDuration(1000)).toBe('1분 미만');
  });
});

describe('schedule helpers', () => {
  it('finds the next weekday occurrence after now', async () => {
    const { nextWeekly } = await import('../../src/usage/core');
    // 2026-10-08 is a Thursday (4).
    expect(nextWeekly(6, 9, 0, now).toString()).toBe(new Date('2026-10-10T09:00:00').toString());
    expect(nextWeekly(4, 15, 0, now).toString()).toBe(new Date('2026-10-08T15:00:00').toString());
    expect(nextWeekly(4, 9, 0, now).toString()).toBe(new Date('2026-10-15T09:00:00').toString());
  });

  it('lists seven midnights and places dates on the week axis', async () => {
    const { midnightsAhead, weekPos } = await import('../../src/usage/core');
    expect(midnightsAhead(now)).toHaveLength(7);
    expect(weekPos(new Date(now.getTime() + 3.5 * DAY), now)).toBeCloseTo(0.5);
    expect(weekPos(new Date(now.getTime() - DAY), now)).toBe(0);
  });

  it('flags accounts that need a look', async () => {
    const { needsAttention } = await import('../../src/usage/core');
    const list = [account('fresh', 20, 3 * DAY), account('old', 20, 3 * DAY, 20 * HOUR), account('fast', 50, 0.75 * WEEK)];
    expect(needsAttention(list, now).map((a) => [a.account.name, a.why])).toEqual([
      ['old', '20시간 전 값'],
      ['fast', '과속 · 예상 200%'],
    ]);
  });
});
