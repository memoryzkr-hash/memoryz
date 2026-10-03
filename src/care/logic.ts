// 화면과 무관한 순수 계산 함수들 (단위 테스트 대상).
import type { DailyRecord, Db, Elder, Settings, Vitals } from './types';

export const DEFAULT_SETTINGS: Settings = {
  centerName: '우리 주간보호센터',
  routes: ['1호차', '2호차'],
  programs: ['체조', '인지활동', '노래교실', '미술', '원예', '산책'],
};

export function emptyDb(): Db {
  return { version: 1, elders: [], records: {}, settings: { ...DEFAULT_SETTINGS } };
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 날짜 ----------

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function nowTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ageOf(birth: string, today: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return undefined;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** "2026-09-25" → "9월 25일 (금)" */
export function formatDateKo(date: string): string {
  const d = parseDate(date);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
}

// ---------- 기록 ----------

export const recordKey = (date: string, elderId: string) => `${date}|${elderId}`;

export function blankRecord(elderId: string, date: string): DailyRecord {
  return { elderId, date, vitals: {}, medsGiven: {}, urine: 0, stool: 0, activities: [], note: '' };
}

export function getRecord(db: Db, elderId: string, date: string): DailyRecord | undefined {
  return db.records[recordKey(date, elderId)];
}

/** 기록을 가져오거나 새로 만들어 db에 넣는다. */
export function ensureRecord(db: Db, elderId: string, date: string): DailyRecord {
  const key = recordKey(date, elderId);
  return (db.records[key] ??= blankRecord(elderId, date));
}

export function isScheduled(elder: Elder, date: string): boolean {
  return elder.active && elder.days.includes(parseDate(date).getDay());
}

/** 그날 명단: 이용 요일인 어르신 + 요일이 아니어도 그날 기록이 있는 어르신. 이름순. */
export function rosterFor(db: Db, date: string): Elder[] {
  return db.elders
    .filter((e) => isScheduled(e, date) || getRecord(db, e.id, date)?.status)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ---------- 건강 ----------

export interface VitalFlag {
  field: keyof Vitals;
  level: 'high' | 'low';
  message: string;
}

/** 일반적인 노인 건강 체크 기준. 기관 지침에 맞게 숫자만 바꾸면 된다. */
export const VITAL_RANGES: Record<keyof Vitals, { label: string; unit: string; low: number; high: number }> = {
  sys: { label: '수축기 혈압', unit: 'mmHg', low: 90, high: 140 },
  dia: { label: '이완기 혈압', unit: 'mmHg', low: 60, high: 90 },
  pulse: { label: '맥박', unit: '회/분', low: 50, high: 100 },
  temp: { label: '체온', unit: '℃', low: 35.5, high: 37.5 },
  glucose: { label: '혈당', unit: 'mg/dL', low: 70, high: 200 },
};

export function vitalFlags(v: Vitals): VitalFlag[] {
  const flags: VitalFlag[] = [];
  for (const field of Object.keys(VITAL_RANGES) as (keyof Vitals)[]) {
    const value = v[field];
    if (value === undefined || Number.isNaN(value)) continue;
    const r = VITAL_RANGES[field];
    if (value >= r.high) flags.push({ field, level: 'high', message: `${r.label} 높음 (${value}${r.unit})` });
    else if (value < r.low) flags.push({ field, level: 'low', message: `${r.label} 낮음 (${value}${r.unit})` });
  }
  return flags;
}

export function hasVitals(v: Vitals): boolean {
  return Object.values(v).some((x) => x !== undefined);
}

// ---------- 하루 요약 ----------

export interface DaySummary {
  scheduled: number;
  present: number;
  absent: number;
  unchecked: number;
  departed: number;
  vitalAlerts: { elder: Elder; flags: VitalFlag[] }[];
  vitalsMissing: Elder[];
  medsPending: { elder: Elder; meds: string[] }[];
}

export function daySummary(db: Db, date: string): DaySummary {
  const roster = rosterFor(db, date);
  const s: DaySummary = {
    scheduled: roster.length,
    present: 0,
    absent: 0,
    unchecked: 0,
    departed: 0,
    vitalAlerts: [],
    vitalsMissing: [],
    medsPending: [],
  };
  for (const elder of roster) {
    const rec = getRecord(db, elder.id, date);
    if (rec?.status === 'absent') {
      s.absent++;
      continue;
    }
    if (rec?.status !== 'present') {
      s.unchecked++;
      continue;
    }
    s.present++;
    if (rec.departure) s.departed++;
    const flags = vitalFlags(rec.vitals);
    if (flags.length) s.vitalAlerts.push({ elder, flags });
    if (!hasVitals(rec.vitals)) s.vitalsMissing.push(elder);
    const pending = elder.meds.filter((m) => !rec.medsGiven[m.id]).map((m) => m.name);
    if (pending.length) s.medsPending.push({ elder, meds: pending });
  }
  return s;
}

// ---------- 통계 ----------

export interface MonthStat {
  elder: Elder;
  scheduled: number;
  present: number;
  absent: number;
  /** 0~100, 예정일이 없으면 undefined */
  rate?: number;
}

/** month: "YYYY-MM". until(포함)을 넘는 날짜는 아직 오지 않았으므로 세지 않는다. */
export function monthStats(db: Db, month: string, until: string): MonthStat[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return db.elders
    .filter((e) => e.active || Object.values(db.records).some((r) => r.elderId === e.id && r.date.startsWith(month)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((elder) => {
      let scheduled = 0;
      let present = 0;
      let absent = 0;
      for (let d = 1; d <= days; d++) {
        const date = `${month}-${pad(d)}`;
        if (date > until) break;
        const rec = getRecord(db, elder.id, date);
        if (isScheduled(elder, date) || rec?.status) scheduled++;
        if (rec?.status === 'present') present++;
        if (rec?.status === 'absent') absent++;
      }
      return { elder, scheduled, present, absent, rate: scheduled ? Math.round((present / scheduled) * 100) : undefined };
    });
}

/** 최근 건강 기록 (오래된 것부터), 최대 limit개. */
export function vitalHistory(db: Db, elderId: string, until: string, limit = 14): { date: string; vitals: Vitals }[] {
  return Object.values(db.records)
    .filter((r) => r.elderId === elderId && r.date <= until && hasVitals(r.vitals))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map((r) => ({ date: r.date, vitals: r.vitals }));
}

// ---------- 보호자 알림장 ----------

export function guardianReport(db: Db, elder: Elder, date: string): string {
  const rec = getRecord(db, elder.id, date) ?? blankRecord(elder.id, date);
  const lines: string[] = [];
  const title = elder.gender === '남' ? '할아버님' : '할머님';
  lines.push(`[${db.settings.centerName}] ${formatDateKo(date)} 알림장`);
  lines.push(`${elder.name} ${title}의 오늘 하루를 전해 드립니다.`);
  lines.push('');

  if (rec.status === 'absent') {
    lines.push(`오늘은 결석하셨습니다${rec.absentReason ? ` (${rec.absentReason})` : ''}.`);
    lines.push('다음 이용일에 건강한 모습으로 뵙겠습니다.');
    return lines.join('\n');
  }

  if (rec.arrival || rec.departure) {
    lines.push(`■ 이용시간: ${rec.arrival ?? '-'} ~ ${rec.departure ?? '-'}`);
  }
  const v = rec.vitals;
  if (hasVitals(v)) {
    const parts: string[] = [];
    if (v.sys !== undefined || v.dia !== undefined) parts.push(`혈압 ${v.sys ?? '-'}/${v.dia ?? '-'}`);
    if (v.pulse !== undefined) parts.push(`맥박 ${v.pulse}`);
    if (v.temp !== undefined) parts.push(`체온 ${v.temp}℃`);
    if (v.glucose !== undefined) parts.push(`혈당 ${v.glucose}`);
    lines.push(`■ 건강: ${parts.join(', ')}`);
    for (const f of vitalFlags(v)) lines.push(`  ※ ${f.message} — 가정에서도 살펴봐 주세요.`);
  }
  const meals: string[] = [];
  if (rec.lunch) meals.push(`점심 ${rec.lunch}`);
  if (rec.snack) meals.push(`간식 ${rec.snack}`);
  if (meals.length) lines.push(`■ 식사: ${meals.join(', ')}`);
  const given = elder.meds.filter((m) => rec.medsGiven[m.id]);
  if (elder.meds.length) {
    lines.push(
      given.length === elder.meds.length
        ? `■ 투약: 모두 드셨습니다 (${given.map((m) => m.name).join(', ')})`
        : `■ 투약: ${given.length}/${elder.meds.length} 복용${given.length ? ` (${given.map((m) => m.name).join(', ')})` : ''}`,
    );
  }
  if (rec.urine || rec.stool) lines.push(`■ 배설: 소변 ${rec.urine}회, 대변 ${rec.stool}회`);
  if (rec.activities.length) lines.push(`■ 프로그램: ${rec.activities.join(', ')}`);
  if (rec.mood) lines.push(`■ 기분: ${rec.mood}`);
  if (rec.note.trim()) {
    lines.push('');
    lines.push(rec.note.trim());
  }
  lines.push('');
  lines.push('궁금하신 점은 언제든 연락 주세요. 감사합니다.');
  return lines.join('\n');
}

// ---------- 백업 ----------

/** 가져온 JSON을 검사하고 빠진 필드를 채운다. 형식이 틀리면 예외. */
export function parseBackup(text: string): Db {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.elders) || typeof raw.records !== 'object') {
    throw new Error('주간보호 앱 백업 파일이 아닙니다.');
  }
  const db = emptyDb();
  db.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
  db.elders = raw.elders.map((e: Partial<Elder>) => normalizeElder(e));
  for (const [key, r] of Object.entries(raw.records as Record<string, Partial<DailyRecord>>)) {
    if (!r || typeof r.elderId !== 'string' || typeof r.date !== 'string') continue;
    db.records[key] = { ...blankRecord(r.elderId, r.date), ...r } as DailyRecord;
  }
  return db;
}

export function blankElder(): Elder {
  return {
    id: newId(),
    name: '',
    gender: '여',
    birth: '',
    careLevel: '3등급',
    days: [1, 2, 3, 4, 5],
    guardianName: '',
    guardianRelation: '',
    guardianPhone: '',
    conditions: '',
    allergies: '',
    diet: '일반식',
    mobility: '자립',
    meds: [],
    usesPickup: true,
    usesDropoff: true,
    route: '',
    address: '',
    notes: '',
    active: true,
  };
}

export function normalizeElder(e: Partial<Elder>): Elder {
  const base = blankElder();
  return { ...base, ...e, id: typeof e.id === 'string' ? e.id : base.id, meds: Array.isArray(e.meds) ? e.meds : [] };
}
