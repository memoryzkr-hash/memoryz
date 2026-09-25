// localStorage 저장과 예시 데이터.
import { addDays, blankElder, emptyDb, ensureRecord, isScheduled, newId, parseBackup } from './logic';
import type { Db, Elder } from './types';

const KEY = 'memoryz-care-db-v1';

export function loadDb(): Db {
  try {
    const text = localStorage.getItem(KEY);
    if (text) return parseBackup(text);
  } catch {
    // 손상된 데이터나 저장소 접근 불가: 빈 상태로 시작
  }
  return emptyDb();
}

/** 저장 성공 여부를 돌려준다 (용량 초과·사생활 보호 모드 등에서 실패할 수 있음). */
export function saveDb(db: Db): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

/** 처음 써 보는 사람을 위한 가상의 어르신 5명과 지난 한 달 기록. */
export function sampleDb(today: string): Db {
  const db = emptyDb();
  const e = (over: Partial<Elder>): Elder => ({ ...blankElder(), ...over });
  db.elders = [
    e({
      name: '김순자', gender: '여', birth: '1938-03-12', careLevel: '3등급', days: [1, 2, 3, 4, 5],
      guardianName: '이정민', guardianRelation: '딸', guardianPhone: '010-1234-5678',
      conditions: '고혈압, 경도 치매', allergies: '땅콩', diet: '다진식', mobility: '보행기',
      meds: [{ id: newId(), name: '혈압약(암로디핀)', timing: '점심 식후' }],
      route: '1호차', address: '행복동 12-3', notes: '오후에 불안해하시면 노래를 틀어드리면 안정됨',
    }),
    e({
      name: '박영호', gender: '남', birth: '1941-07-02', careLevel: '4등급', days: [1, 3, 5],
      guardianName: '박민수', guardianRelation: '아들', guardianPhone: '010-2345-6789',
      conditions: '당뇨, 관절염', diet: '일반식', mobility: '지팡이',
      meds: [{ id: newId(), name: '당뇨약(메트포르민)', timing: '점심 식후' }],
      route: '1호차', address: '행복동 45', notes: '저혈당 주의, 간식 챙기기',
    }),
    e({
      name: '최말순', gender: '여', birth: '1935-11-20', careLevel: '2등급', days: [1, 2, 3, 4, 5],
      guardianName: '최은영', guardianRelation: '며느리', guardianPhone: '010-3456-7890',
      conditions: '뇌졸중 후유증', allergies: '페니실린', diet: '죽식', mobility: '휠체어',
      meds: [
        { id: newId(), name: '항혈전제', timing: '점심 식후' },
        { id: newId(), name: '변비약', timing: '점심 식후' },
      ],
      route: '2호차', address: '소망로 7', notes: '휠체어 리프트 차량 필요',
    }),
    e({
      name: '정복례', gender: '여', birth: '1944-05-08', careLevel: '인지지원등급', days: [2, 4],
      guardianName: '정대호', guardianRelation: '아들', guardianPhone: '010-4567-8901',
      conditions: '경도 인지장애', diet: '일반식', mobility: '자립',
      usesDropoff: false, route: '2호차', address: '소망로 21', notes: '하원은 아들이 직접 모시러 옴',
    }),
    e({
      name: '윤갑수', gender: '남', birth: '1939-01-30', careLevel: '3등급', days: [1, 2, 3, 4, 5],
      guardianName: '윤지혜', guardianRelation: '손녀', guardianPhone: '010-5678-9012',
      conditions: '파킨슨병', diet: '다진식', mobility: '보행기',
      meds: [{ id: newId(), name: '파킨슨약', timing: '점심 전' }],
      route: '1호차', address: '행복동 88', notes: '낙상 고위험',
    }),
  ];

  // 지난 30일치 기록 (오늘은 비워 둔다). 결정적인 값으로 만들어 매번 같은 모습이 되게 한다.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 30; i >= 1; i--) {
    const date = addDays(today, -i);
    for (const elder of db.elders) {
      if (!isScheduled(elder, date)) continue;
      const rec = ensureRecord(db, elder.id, date);
      if (rand() < 0.08) {
        rec.status = 'absent';
        rec.absentReason = rand() < 0.5 ? '병원 진료' : '가족 행사';
        continue;
      }
      rec.status = 'present';
      rec.arrival = `09:${String(Math.floor(rand() * 40) + 10)}`;
      rec.departure = `17:${String(Math.floor(rand() * 30) + 10)}`;
      const hyper = elder.conditions.includes('고혈압');
      rec.vitals = {
        sys: Math.round((hyper ? 132 : 120) + rand() * 18),
        dia: Math.round((hyper ? 80 : 72) + rand() * 12),
        pulse: Math.round(64 + rand() * 20),
        temp: Math.round((36.2 + rand() * 0.8) * 10) / 10,
        ...(elder.conditions.includes('당뇨') ? { glucose: Math.round(110 + rand() * 80) } : {}),
      };
      for (const m of elder.meds) rec.medsGiven[m.id] = '12:40';
      rec.lunch = (['전량', '전량', '3/4', '1/2'] as const)[Math.floor(rand() * 4)];
      rec.snack = '전량';
      rec.urine = 2 + Math.floor(rand() * 3);
      rec.stool = rand() < 0.4 ? 1 : 0;
      rec.mood = rand() < 0.7 ? '좋음' : '보통';
      rec.activities = db.settings.programs.filter(() => rand() < 0.5);
    }
  }
  return db;
}
