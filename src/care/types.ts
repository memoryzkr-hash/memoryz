// 주간보호센터 앱 데이터 모델. 모든 데이터는 기기(localStorage)에만 저장된다.

export type Diet = '일반식' | '다진식' | '죽식' | '유동식';
export type Mobility = '자립' | '지팡이' | '보행기' | '휠체어';
export type MealAmount = '전량' | '3/4' | '1/2' | '1/4' | '거부';
export type Mood = '좋음' | '보통' | '나쁨';
export type Attendance = 'present' | 'absent';

export const DIETS: Diet[] = ['일반식', '다진식', '죽식', '유동식'];
export const MOBILITIES: Mobility[] = ['자립', '지팡이', '보행기', '휠체어'];
export const MEAL_AMOUNTS: MealAmount[] = ['전량', '3/4', '1/2', '1/4', '거부'];
export const MOODS: Mood[] = ['좋음', '보통', '나쁨'];
export const CARE_LEVELS = ['1등급', '2등급', '3등급', '4등급', '5등급', '인지지원등급', '등급외'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface Med {
  id: string;
  name: string;
  /** 복용 시점 메모, 예: "점심 식후" */
  timing: string;
}

export interface Elder {
  id: string;
  name: string;
  gender: '남' | '여';
  birth: string; // YYYY-MM-DD
  careLevel: string;
  /** 이용 요일, 0=일 … 6=토 */
  days: number[];
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  conditions: string;
  allergies: string;
  diet: Diet;
  mobility: Mobility;
  meds: Med[];
  usesPickup: boolean;
  usesDropoff: boolean;
  route: string;
  address: string;
  notes: string;
  active: boolean;
}

export interface Vitals {
  sys?: number;
  dia?: number;
  pulse?: number;
  temp?: number;
  glucose?: number;
}

export interface DailyRecord {
  elderId: string;
  date: string; // YYYY-MM-DD
  status?: Attendance;
  arrival?: string; // HH:MM
  departure?: string;
  absentReason?: string;
  pickupAt?: string;
  dropoffAt?: string;
  vitals: Vitals;
  /** medId → 투약 시각 */
  medsGiven: Record<string, string>;
  lunch?: MealAmount;
  snack?: MealAmount;
  urine: number;
  stool: number;
  mood?: Mood;
  activities: string[];
  note: string;
}

export interface Settings {
  centerName: string;
  routes: string[];
  programs: string[];
}

export interface Db {
  version: 1;
  elders: Elder[];
  /** key: `${date}|${elderId}` */
  records: Record<string, DailyRecord>;
  settings: Settings;
}
