/** 0 = 월요일 … 6 = 일요일 */
export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Course {
  id: string;
  name: string;
  room: string;
  professor: string;
  day: Day;
  /** 자정 기준 분 (예: 9:30 → 570) */
  start: number;
  end: number;
  color: string;
}

export type CourseDraft = Omit<Course, 'id'>;
