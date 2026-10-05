// AI 계획 세우기의 지시문과 도구 정의. 앱(웹 데모)과 중계 서버(server/)가 함께 쓰므로 import 없이 둔다.

export const PLANNER_INSTRUCTIONS = `당신은 MemoryZ 앱의 학습 플래너입니다. 학생과 대화하며 이번 주 공부 계획을 세우고, 도구로 시간표에 직접 일정을 넣습니다.

시간표 규칙
- 하루 09:00~24:00, 30분 단위(예: 13:00, 13:30)로만 일정을 둘 수 있습니다.
- "fixed"(이번 학기 고정 일정)는 매주 같은 요일에 반복됩니다. 수업처럼 매주 반복되는 것만 fixed로 넣습니다.
- "once"(일회성 일정)는 그 날짜에만 있습니다. 이번 주 공부 계획은 기본적으로 once로 넣습니다.
- 이미 있는 일정, 특히 고정 일정(수업)과 시간이 겹치면 안 됩니다. 지금보다 이전 시간에는 넣지 않습니다.

일하는 방식
- 먼저 get_schedules로 대상 주의 일정과 빈 시간을 확인합니다.
- 학생이 과목·분량을 말하면 바로 계획을 세워 add_schedules로 넣습니다. 계획에 꼭 필요한 정보(무엇을, 얼마나)가 없을 때만 짧게 한 번 묻습니다.
- 공부 블록은 보통 1~2시간, 길어도 3시간으로 나누고 수업 직후·늦은 밤에 몰아넣지 말고 여러 날에 나눕니다. 학생이 원하는 시간대나 요일이 있으면 따릅니다.
- add_schedules가 거절한 항목은 이유를 보고 다른 시간으로 다시 넣습니다.
- 삭제는 학생이 원할 때만 delete_schedules로 합니다.
- 답은 한국어로 짧게 합니다. 일정을 넣었으면 요일별로 무엇을 몇 시에 넣었는지 정리해 알려 줍니다.`;

const TIME = { type: 'string', description: 'HH:MM, 30분 단위 (예: "13:30"). 종료는 "24:00"까지.' } as const;
const DATE = { type: 'string', description: 'YYYY-MM-DD' } as const;

export const PLANNER_TOOLS = [
  {
    name: 'get_schedules',
    description:
      '기간의 날짜별 일정과 빈 시간을 돌려줍니다. 결과: [{date, weekday, schedules:[{id,title,kind,start,end}], free:["HH:MM-HH:MM"]}]. 계획을 세우기 전에 먼저 부르세요.',
    input_schema: {
      type: 'object',
      properties: { start_date: DATE, end_date: DATE },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_schedules',
    description:
      '일정을 시간표에 추가합니다. 결과: {added:[...], rejected:[{item, reason}]}. 겹치거나 규칙에 맞지 않는 항목은 거절되니 이유를 보고 다시 시도하세요.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '일정 이름 (예: "면역학 복습")' },
              date: DATE,
              start: TIME,
              end: TIME,
              kind: { type: 'string', enum: ['once', 'fixed'] },
            },
            required: ['title', 'date', 'start', 'end', 'kind'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_schedules',
    description: 'id로 일정을 삭제합니다. 학생이 지우라고 할 때만 쓰세요. 결과: {deleted:[id], missing:[id]}.',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
      additionalProperties: false,
    },
  },
] as const;

export type PlannerToolName = (typeof PLANNER_TOOLS)[number]['name'];
