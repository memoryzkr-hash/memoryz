import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOf,
  blankElder,
  daySummary,
  emptyDb,
  ensureRecord,
  guardianReport,
  monthStats,
  parseBackup,
  rosterFor,
  vitalFlags,
  vitalHistory,
} from '../src/care/logic';
import { sampleDb } from '../src/care/store';
import type { Elder } from '../src/care/types';

// 2026-09-21은 월요일
const MON = '2026-09-21';

function dbWith(...elders: Partial<Elder>[]) {
  const db = emptyDb();
  db.elders = elders.map((e) => ({ ...blankElder(), ...e }));
  return db;
}

describe('날짜', () => {
  it('만 나이를 생일 기준으로 계산한다', () => {
    expect(ageOf('1940-09-22', '2026-09-21')).toBe(85);
    expect(ageOf('1940-09-21', '2026-09-21')).toBe(86);
    expect(ageOf('', '2026-09-21')).toBeUndefined();
  });
  it('월말을 넘어 날짜를 더한다', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('명단', () => {
  it('이용 요일인 어르신과 그날 기록이 있는 어르신을 이름순으로 보여 준다', () => {
    const db = dbWith(
      { id: 'a', name: '하순이', days: [1] },
      { id: 'b', name: '가영감', days: [2] },
      { id: 'c', name: '나할매', days: [1], active: false },
    );
    expect(rosterFor(db, MON).map((e) => e.id)).toEqual(['a']);
    ensureRecord(db, 'b', MON).status = 'present'; // 요일이 아니어도 임시 이용
    expect(rosterFor(db, MON).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('건강 체크', () => {
  it('기준을 벗어난 수치만 표시한다', () => {
    expect(vitalFlags({ sys: 120, dia: 80, pulse: 70, temp: 36.5 })).toEqual([]);
    const flags = vitalFlags({ sys: 150, dia: 55, temp: 37.5, glucose: 65 });
    expect(flags.map((f) => [f.field, f.level])).toEqual([
      ['sys', 'high'],
      ['dia', 'low'],
      ['temp', 'high'],
      ['glucose', 'low'],
    ]);
  });
});

describe('하루 요약', () => {
  it('출결, 건강 이상, 미투약을 센다', () => {
    const db = dbWith(
      { id: 'a', name: '가', days: [1], meds: [{ id: 'm1', name: '혈압약', timing: '점심' }] },
      { id: 'b', name: '나', days: [1] },
      { id: 'c', name: '다', days: [1] },
    );
    const a = ensureRecord(db, 'a', MON);
    a.status = 'present';
    a.vitals = { sys: 160, dia: 95 };
    ensureRecord(db, 'b', MON).status = 'absent';
    const s = daySummary(db, MON);
    expect([s.scheduled, s.present, s.absent, s.unchecked]).toEqual([3, 1, 1, 1]);
    expect(s.vitalAlerts[0].flags).toHaveLength(2);
    expect(s.medsPending).toEqual([{ elder: db.elders[0], meds: ['혈압약'] }]);
    a.medsGiven.m1 = '12:30';
    expect(daySummary(db, MON).medsPending).toEqual([]);
  });
});

describe('통계', () => {
  it('오늘까지의 예정일 대비 출석률을 낸다', () => {
    const db = dbWith({ id: 'a', name: '가', days: [1, 3, 5] });
    ensureRecord(db, 'a', '2026-09-02').status = 'present'; // 수
    ensureRecord(db, 'a', '2026-09-04').status = 'absent'; // 금
    // 9/1~9/4 중 이용일: 9/2(수), 9/4(금)
    const [s] = monthStats(db, '2026-09', '2026-09-04');
    expect(s).toMatchObject({ scheduled: 2, present: 1, absent: 1, rate: 50 });
  });
  it('건강 기록을 날짜순으로 최근 것만 돌려준다', () => {
    const db = dbWith({ id: 'a', name: '가' });
    for (let i = 0; i < 20; i++) ensureRecord(db, 'a', addDays(MON, -i)).vitals = { sys: 100 + i };
    const h = vitalHistory(db, 'a', MON, 5);
    expect(h.map((x) => x.vitals.sys)).toEqual([104, 103, 102, 101, 100]);
  });
});

describe('알림장', () => {
  it('출석한 날의 기록을 요약하고 이상 수치를 알린다', () => {
    const db = dbWith({ id: 'a', name: '김순자', gender: '여', meds: [{ id: 'm1', name: '혈압약', timing: '' }] });
    const r = ensureRecord(db, 'a', MON);
    Object.assign(r, { status: 'present', arrival: '09:10', departure: '17:20', lunch: '전량', urine: 3, note: '노래교실에서 즐거워하셨어요.' });
    r.vitals = { sys: 145, dia: 85 };
    r.medsGiven.m1 = '12:40';
    const text = guardianReport(db, db.elders[0], MON);
    expect(text).toContain('김순자 할머님');
    expect(text).toContain('09:10 ~ 17:20');
    expect(text).toContain('혈압 145/85');
    expect(text).toContain('수축기 혈압 높음');
    expect(text).toContain('모두 드셨습니다');
    expect(text).toContain('노래교실에서 즐거워하셨어요.');
  });
  it('결석한 날은 사유만 전한다', () => {
    const db = dbWith({ id: 'a', name: '박영호', gender: '남' });
    Object.assign(ensureRecord(db, 'a', MON), { status: 'absent', absentReason: '병원 진료' });
    const text = guardianReport(db, db.elders[0], MON);
    expect(text).toContain('결석하셨습니다 (병원 진료)');
    expect(text).not.toContain('■');
  });
});

describe('백업', () => {
  it('내보낸 데이터를 그대로 다시 읽는다', () => {
    const db = sampleDb(MON);
    const back = parseBackup(JSON.stringify(db));
    expect(back).toEqual(db);
  });
  it('빠진 필드를 채우고 엉뚱한 파일은 거부한다', () => {
    const back = parseBackup(JSON.stringify({ elders: [{ id: 'x', name: '가' }], records: {} }));
    expect(back.elders[0]).toMatchObject({ id: 'x', name: '가', meds: [], active: true });
    expect(back.settings.programs.length).toBeGreaterThan(0);
    expect(() => parseBackup('{"cards":[]}')).toThrow('백업 파일이 아닙니다');
  });
});
