import { addDays, DAY_LABELS, fromKey, toKey, weekDates, weekday } from '../date';
import { buildSchedule, DAY_END, DAY_START, formatHM, schedulesOn, scheduleColor, SLOT_MINUTES } from '../planner';
import type { DateKey, PlannerState, Schedule, ScheduleKind } from '../types';

export interface ToolRun {
  output: unknown;
  state: PlannerState;
  added: Schedule[];
  deleted: Schedule[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseTime(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseDate(v: unknown): DateKey | null {
  const s = String(v ?? '').trim();
  return DATE_RE.test(s) && toKey(fromKey(s)) === s ? s : null;
}

/** 하루의 빈 시간 구간 ("10:30-12:00") */
export function freeRanges(list: Schedule[], from = DAY_START): string[] {
  const out: string[] = [];
  let cursor = Math.max(DAY_START, from);
  for (const s of [...list].sort((a, b) => a.start - b.start)) {
    if (s.start > cursor) out.push(`${formatHM(cursor)}-${formatHM(s.start)}`);
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < DAY_END) out.push(`${formatHM(cursor)}-${formatHM(DAY_END)}`);
  return out;
}

const nowMinutes = (now: Date) => {
  const m = now.getHours() * 60 + now.getMinutes();
  return Math.ceil(m / SLOT_MINUTES) * SLOT_MINUTES;
};

function getSchedules(input: Record<string, unknown>, state: PlannerState, now: Date) {
  const start = parseDate(input.start_date);
  const end = parseDate(input.end_date);
  if (!start || !end) throw new Error('start_date와 end_date는 YYYY-MM-DD 형식이어야 합니다.');
  const days: unknown[] = [];
  const today = toKey(now);
  for (let d = start, i = 0; d <= end && i < 31; d = addDays(d, 1), i++) {
    const list = schedulesOn(state, d);
    const from = d < today ? DAY_END : d === today ? nowMinutes(now) : DAY_START;
    days.push({
      date: d,
      weekday: DAY_LABELS[weekday(d)],
      schedules: list.map((s) => ({ id: s.id, title: s.title, kind: s.kind, start: formatHM(s.start), end: formatHM(s.end) })),
      free: freeRanges(list, from),
    });
  }
  return days;
}

function addSchedules(input: Record<string, unknown>, state: PlannerState, now: Date) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw new Error('items가 비어 있습니다.');
  const today = toKey(now);
  const added: Schedule[] = [];
  const rejected: { item: unknown; reason: string }[] = [];
  let next = state;
  for (const raw of items.slice(0, 30)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const title = String(item.title ?? '').trim().slice(0, 40);
    const date = parseDate(item.date);
    const start = parseTime(item.start);
    const end = parseTime(item.end);
    const kind: ScheduleKind = item.kind === 'fixed' ? 'fixed' : 'once';
    const reject = (reason: string) => rejected.push({ item: raw, reason });
    if (!title) reject('제목이 없습니다.');
    else if (!date) reject('date는 YYYY-MM-DD 형식이어야 합니다.');
    else if (start === null || end === null) reject('start/end는 HH:MM 형식이어야 합니다.');
    else if (start % SLOT_MINUTES || end % SLOT_MINUTES) reject('시간은 30분 단위여야 합니다.');
    else if (start < DAY_START || end > DAY_END || start >= end) reject('09:00~24:00 안에서 시작이 종료보다 빨라야 합니다.');
    else if (date < today || (date === today && start < nowMinutes(now))) reject('이미 지난 시간입니다.');
    else {
      const clash = schedulesOn(next, date).find((s) => s.start < end && start < s.end);
      if (clash) reject(`'${clash.title}'(${formatHM(clash.start)}-${formatHM(clash.end)})와 겹칩니다.`);
      else {
        const s = buildSchedule(next.activeTimetableId, kind, title, { date, start, end }, scheduleColor(kind));
        next = { ...next, schedules: [...next.schedules, s] };
        added.push(s);
      }
    }
  }
  return { next, added, rejected };
}

/** AI가 부른 도구를 실행하고 새 상태를 돌려준다. 잘못된 입력은 throw → 모델에게 오류로 전달. */
export function runPlannerTool(name: string, input: unknown, state: PlannerState, now: Date): ToolRun {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  switch (name) {
    case 'get_schedules':
      return { output: getSchedules(args, state, now), state, added: [], deleted: [] };
    case 'add_schedules': {
      const { next, added, rejected } = addSchedules(args, state, now);
      const brief = added.map((s) => ({ id: s.id, title: s.title, kind: s.kind, date: s.date ?? weekDates(toKey(now))[s.day], start: formatHM(s.start), end: formatHM(s.end) }));
      return { output: { added: brief, rejected }, state: next, added, deleted: [] };
    }
    case 'delete_schedules': {
      const ids = (Array.isArray(args.ids) ? args.ids : []).map(String);
      const mine = state.schedules.filter((s) => s.timetableId === state.activeTimetableId);
      const deleted = mine.filter((s) => ids.includes(s.id));
      const gone = new Set(deleted.map((s) => s.id));
      const completions: PlannerState['completions'] = {};
      for (const [d, list] of Object.entries(state.completions)) completions[d] = list.filter((i) => !gone.has(i));
      return {
        output: { deleted: [...gone], missing: ids.filter((i) => !gone.has(i)) },
        state: { ...state, schedules: state.schedules.filter((s) => !gone.has(s.id)), completions },
        added: [],
        deleted,
      };
    }
    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

/** 매 요청에 붙이는 현재 상황: 오늘, 대상 주, 시간표 이름 */
export function plannerContext(state: PlannerState, weekOf: DateKey, now: Date): string {
  const days = weekDates(weekOf);
  const t = state.timetables.find((x) => x.id === state.activeTimetableId);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const week = days.map((d) => `${DAY_LABELS[weekday(d)]} ${d}`).join(', ');
  const fixed = state.schedules
    .filter((s) => s.timetableId === state.activeTimetableId && s.kind === 'fixed')
    .sort((a, b) => a.day - b.day || a.start - b.start)
    .map((s) => `${DAY_LABELS[s.day]} ${formatHM(s.start)}-${formatHM(s.end)} ${s.title}`);
  return [
    `지금: ${toKey(now)} (${DAY_LABELS[weekday(toKey(now))]}) ${hh}:${mm}`,
    `계획할 주: ${week}`,
    `시간표: ${t ? `${t.year} ${t.name}` : '시간표'}`,
    `이번 학기 고정 일정: ${fixed.length ? fixed.join(' / ') : '없음'}`,
  ].join('\n');
}
