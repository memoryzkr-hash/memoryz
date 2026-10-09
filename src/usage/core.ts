/** Pure usage math: no DOM, no storage. Every function takes `now` so tests can pin the clock. */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const SESSION = 5 * HOUR;
/** A reading older than this is shown as stale. */
export const STALE_AFTER = 12 * HOUR;

export type Plan = 'pro' | 'max5' | 'max20' | 'team' | 'other';

export const PLAN_LABELS: Record<Plan, string> = {
  pro: 'Pro',
  max5: 'Max 5x',
  max20: 'Max 20x',
  team: 'Team',
  other: '기타',
};

/** One limit as last read on claude.ai. Times are ISO strings so the record is plain JSON. */
export interface Meter {
  /** Percent used, 0–100. null = never entered. */
  used: number | null;
  resetAt: string | null;
  /** When `used` was read. */
  updatedAt: string | null;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  weekly: Meter;
  session: Meter;
  /** Day of month the subscription renews (1–31), or null. */
  billingDay: number | null;
  memo: string;
  createdAt: string;
}

export function emptyMeter(): Meter {
  return { used: null, resetAt: null, updatedAt: null };
}

export function newAccount(id: string, now: Date): Account {
  return {
    id,
    name: '',
    email: '',
    plan: 'pro',
    weekly: emptyMeter(),
    session: emptyMeter(),
    billingDay: null,
    memo: '',
    createdAt: now.toISOString(),
  };
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

/** Coerces stored or pasted data into a valid Account; unknown fields are dropped. */
export function normalizeAccount(raw: unknown, fallbackId: string, now: Date): Account {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const meter = (v: unknown): Meter => {
    const m = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return {
      used: typeof m.used === 'number' && Number.isFinite(m.used) ? clampPercent(m.used) : null,
      resetAt: iso(m.resetAt),
      updatedAt: iso(m.updatedAt),
    };
  };
  const plan = str(r.plan) in PLAN_LABELS ? (r.plan as Plan) : 'other';
  const day = typeof r.billingDay === 'number' && r.billingDay >= 1 && r.billingDay <= 31 ? Math.round(r.billingDay) : null;
  return {
    id: str(r.id) || fallbackId,
    name: str(r.name),
    email: str(r.email),
    plan,
    weekly: meter(r.weekly),
    session: meter(r.session),
    billingDay: day,
    memo: str(r.memo),
    createdAt: iso(r.createdAt) ?? now.toISOString(),
  };
}

// ---------- weekly limit ----------

export type WeeklyLevel =
  | 'unknown' // no reset time or no reading yet
  | 'stale-reset' // the week rolled over since the last reading
  | 'exhausted'
  | 'fast' // on pace to run out before the reset
  | 'use-it' // resets within a day with a lot left
  | 'ok'
  | 'plenty';

export interface WeeklyStatus {
  level: WeeklyLevel;
  /** Next reset, rolled forward past `now`. null when never set. */
  resetAt: Date | null;
  msLeft: number | null;
  /** Share of the 7-day window already gone, 0–1. */
  elapsed: number | null;
  /** Percent used in the current window. 0 after a rollover the user hasn't re-read yet. */
  used: number | null;
  remaining: number | null;
  /** Percent at the reset if usage keeps the same pace. null while the window is too young to tell. */
  projected: number | null;
  /** How many weekly resets happened since the reading. */
  resetsSinceReading: number;
}

/** Moves a past reset time forward in whole periods until it is in the future. */
export function rollForward(resetAt: Date, now: Date, period: number): { next: Date; skipped: number } {
  const t = resetAt.getTime();
  if (t > now.getTime()) return { next: resetAt, skipped: 0 };
  const skipped = Math.floor((now.getTime() - t) / period) + 1;
  return { next: new Date(t + skipped * period), skipped };
}

export function weeklyStatus(m: Meter, now: Date): WeeklyStatus {
  const none: WeeklyStatus = {
    level: 'unknown',
    resetAt: null,
    msLeft: null,
    elapsed: null,
    used: m.used,
    remaining: m.used === null ? null : 100 - m.used,
    projected: null,
    resetsSinceReading: 0,
  };
  if (!m.resetAt) return none;

  const { next } = rollForward(new Date(m.resetAt), now, WEEK);
  const msLeft = next.getTime() - now.getTime();
  const elapsed = Math.min(1, Math.max(0, 1 - msLeft / WEEK));

  // A reading taken before the window that ends at `next` began belongs to an earlier week.
  const windowStart = next.getTime() - WEEK;
  const readAt = m.updatedAt ? new Date(m.updatedAt).getTime() : null;
  const resetsSinceReading = readAt === null || readAt >= windowStart ? 0 : Math.floor((windowStart - readAt) / WEEK) + 1;

  const base = { resetAt: next, msLeft, elapsed, resetsSinceReading };
  if (m.used === null) return { ...base, level: 'unknown', used: null, remaining: null, projected: null };
  if (resetsSinceReading > 0) return { ...base, level: 'stale-reset', used: 0, remaining: 100, projected: null };

  const used = m.used;
  const remaining = clampPercent(100 - used);
  // Under ~8 hours into the week a projection mostly amplifies noise.
  const projected = elapsed >= 0.05 ? Math.round(used / elapsed) : null;

  let level: WeeklyLevel;
  if (used >= 100) level = 'exhausted';
  else if (projected !== null && projected > 100) level = 'fast';
  else if (msLeft <= DAY && remaining >= 30) level = 'use-it';
  else if (projected !== null && projected <= 60) level = 'plenty';
  else level = 'ok';
  return { ...base, level, used, remaining, projected };
}

// ---------- 5-hour session ----------

export interface SessionStatus {
  /** idle = no running window, a new session can start. */
  level: 'unknown' | 'idle' | 'active' | 'blocked';
  used: number | null;
  resetAt: Date | null;
  msLeft: number | null;
}

export function sessionStatus(m: Meter, now: Date): SessionStatus {
  if (!m.resetAt) {
    return m.used === null ? { level: 'unknown', used: null, resetAt: null, msLeft: null } : { level: 'active', used: m.used, resetAt: null, msLeft: null };
  }
  const resetAt = new Date(m.resetAt);
  const msLeft = resetAt.getTime() - now.getTime();
  // The 5-hour window starts with the first message, so a finished one does not repeat on a schedule.
  if (msLeft <= 0) return { level: 'idle', used: 0, resetAt: null, msLeft: null };
  const used = m.used ?? 0;
  return { level: used >= 100 ? 'blocked' : 'active', used, resetAt, msLeft };
}

// ---------- billing ----------

/** Next renewal on `day` of the month (clamped to short months), at local midnight, today included. */
export function nextBilling(day: number, now: Date): Date {
  const at = (y: number, mo: number) => {
    const last = new Date(y, mo + 1, 0).getDate();
    return new Date(y, mo, Math.min(day, last));
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = at(now.getFullYear(), now.getMonth());
  return thisMonth.getTime() >= today.getTime() ? thisMonth : at(now.getFullYear(), now.getMonth() + 1);
}

/** Whole days from today to `date` by calendar date (0 = today). */
export function daysUntil(date: Date, now: Date): number {
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / DAY);
}

// ---------- recommendation ----------

export interface Pick {
  account: Account;
  /** Percent of the weekly limit that can be spent per hour until the reset. */
  perHour: number;
  reason: string;
}

export interface Ranking {
  picks: Pick[];
  /** Accounts that can't be used right now, with why. */
  blocked: { account: Account; reason: string }[];
}

/**
 * Ranks usable accounts by weekly headroom per hour left: an account that resets soon with a lot left
 * goes first, since whatever it doesn't spend before the reset is lost.
 */
export function rankAccounts(accounts: Account[], now: Date): Ranking {
  const picks: Pick[] = [];
  const blocked: Ranking['blocked'] = [];
  for (const account of accounts) {
    const w = weeklyStatus(account.weekly, now);
    const s = sessionStatus(account.session, now);
    if (w.level === 'exhausted') {
      blocked.push({ account, reason: `주간 한도 소진 · ${formatWhen(w.resetAt!, now)} 초기화` });
      continue;
    }
    if (s.level === 'blocked') {
      blocked.push({ account, reason: `세션 한도 · ${formatClock(s.resetAt!)} 이후` });
      continue;
    }
    if (w.msLeft === null || w.remaining === null) {
      blocked.push({ account, reason: '주간 사용량·초기화 시각을 입력하세요' });
      continue;
    }
    const hours = Math.max(w.msLeft / HOUR, 0.25);
    const perHour = w.remaining / hours;
    const reason =
      w.level === 'stale-reset'
        ? `초기화됐어요 · 100% 남음, ${formatDuration(w.msLeft)} 뒤 다음 초기화`
        : `${round1(w.remaining)}% 남음 · ${formatDuration(w.msLeft)} 뒤 초기화`;
    picks.push({ account, perHour, reason });
  }
  picks.sort((a, b) => b.perHour - a.perHour);
  return { picks, blocked };
}

// ---------- paste import ----------

export interface ImportedUsage {
  /** Account name as the Mac script labels it. */
  name: string | null;
  email: string | null;
  weekly: { used: number; resetAt: string | null } | null;
  session: { used: number; resetAt: string | null } | null;
}

/**
 * Reads the JSON the claude.ai bookmarklet copies: `{email, usage: {five_hour, seven_day, ...}}`,
 * where each limit is `{utilization: percent, resets_at: ISO}`. Also accepts the bare usage object.
 * Returns null when the text holds neither limit.
 */
export function parseUsageJson(text: string): ImportedUsage | null {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const usage = (root.usage && typeof root.usage === 'object' ? root.usage : root) as Record<string, unknown>;

  const limit = (v: unknown) => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const u = typeof o.utilization === 'number' ? o.utilization : typeof o.utilization === 'string' ? Number(o.utilization) : NaN;
    if (!Number.isFinite(u)) return null;
    const r = typeof o.resets_at === 'string' && !Number.isNaN(Date.parse(o.resets_at)) ? new Date(o.resets_at).toISOString() : null;
    return { used: clampPercent(u), resetAt: r };
  };
  const weekly = limit(usage.seven_day);
  const session = limit(usage.five_hour);
  if (!weekly && !session) return null;
  const email = typeof root.email === 'string' && root.email.includes('@') ? root.email : null;
  const name = typeof root.name === 'string' && root.name.trim() ? root.name.trim() : null;
  return { name, email, weekly, session };
}

export interface ImportBatch {
  items: ImportedUsage[];
  /** Accounts the script could not read, with its message. */
  failed: { name: string; error: string }[];
}

/**
 * Reads either one account (bookmarklet) or the Mac script's batch:
 * `{source: "claude-usage", accounts: [{name, usage} | {name, error}]}`.
 */
export function parseUsageBatch(text: string): ImportBatch | null {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).accounts)) {
    const batch: ImportBatch = { items: [], failed: [] };
    for (const entry of (data as { accounts: unknown[] }).accounts) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const name = typeof e.name === 'string' ? e.name : '';
      const item = parseUsageJson(JSON.stringify(e));
      if (item) batch.items.push(item);
      else if (name) batch.failed.push({ name, error: typeof e.error === 'string' ? e.error : '사용량을 읽지 못했어요' });
    }
    return batch.items.length || batch.failed.length ? batch : null;
  }
  const one = parseUsageJson(text);
  return one ? { items: [one], failed: [] } : null;
}

/** The registered account an import belongs to: same name, same email, or a name equal to the email's local part. */
export function matchAccount(accounts: Account[], imp: ImportedUsage): Account | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  if (imp.name) {
    const n = norm(imp.name);
    const hit = accounts.find((a) => norm(a.name) === n || (a.email && norm(a.email.split('@')[0]) === n));
    if (hit) return hit;
  }
  if (imp.email) {
    const e = norm(imp.email);
    return accounts.find((a) => norm(a.email) === e || norm(a.name) === e.split('@')[0]);
  }
  return undefined;
}

/** Applies an import to an account, stamping the readings with `now`. */
export function applyImport(a: Account, imp: ImportedUsage, now: Date): Account {
  const stamp = now.toISOString();
  return {
    ...a,
    email: a.email || imp.email || '',
    weekly: imp.weekly ? { used: imp.weekly.used, resetAt: imp.weekly.resetAt ?? a.weekly.resetAt, updatedAt: stamp } : a.weekly,
    // A session with no reset time has no running window.
    session: imp.session ? { used: imp.session.resetAt ? imp.session.used : 0, resetAt: imp.session.resetAt, updatedAt: stamp } : a.session,
  };
}

// ---------- formatting ----------

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "3일 4시간", "5시간 12분", "12분", "1분 미만". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return '1분 미만';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}

export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "10/11(토) 09:00". */
export function formatDateTime(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${formatClock(d)}`;
}

/** "오늘 21:00", "내일 09:00", else the full date. */
export function formatWhen(d: Date, now: Date): string {
  const days = daysUntil(d, now);
  if (days === 0) return `오늘 ${formatClock(d)}`;
  if (days === 1) return `내일 ${formatClock(d)}`;
  return formatDateTime(d);
}

/** "방금", "15분 전", "3시간 전", "2일 전". */
export function formatAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return '방금';
  return `${formatDuration(ms).split(' ')[0]} 전`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${formatClock(d)}`;
}

// ---------- schedule helpers ----------

/** Next `dow` (0 = 일요일) at hh:mm local time, strictly after `now`. Weekly resets repeat on a fixed weekday. */
export function nextWeekly(dow: number, hh: number, mm: number, now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/** Position of `at` on a 7-day axis starting at `now`, 0–1. */
export function weekPos(at: Date, now: Date): number {
  return Math.min(1, Math.max(0, (at.getTime() - now.getTime()) / WEEK));
}

/** Local midnights strictly inside the next 7 days, for axis ticks. */
export function midnightsAhead(now: Date): Date[] {
  const out: Date[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getTime() - now.getTime() < WEEK) out.push(d);
  }
  return out;
}

export interface Attention {
  account: Account;
  why: string;
}

/** Accounts whose numbers need a look: no data, rolled over, stale, out, or on pace to run out. */
export function needsAttention(accounts: Account[], now: Date): Attention[] {
  const out: Attention[] = [];
  for (const account of accounts) {
    const w = weeklyStatus(account.weekly, now);
    const stale = !!account.weekly.updatedAt && now.getTime() - new Date(account.weekly.updatedAt).getTime() > STALE_AFTER;
    if (w.level === 'unknown') out.push({ account, why: '입력 필요' });
    else if (w.level === 'stale-reset') out.push({ account, why: '초기화됨 · 새 값 필요' });
    else if (w.level === 'exhausted') out.push({ account, why: '소진' });
    else if (w.level === 'fast') out.push({ account, why: `과속 · 예상 ${w.projected}%` });
    else if (stale) out.push({ account, why: `${formatAgo(account.weekly.updatedAt!, now)} 값` });
  }
  return out;
}
