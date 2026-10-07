/** What we tell Claude. Date rules mirror docs/assistant/03-data.md §1 so the confirm card matches the spec. */
import { formatLong, weekdayName } from './core/dates';
import type { BriefingLanguage, MessageRequest, Relation } from './core/types';

export const RELATION_LABELS: Record<Relation, string> = {
  boss: '상사',
  coworker: '동료',
  friend: '친구',
  family: '가족',
  client: '고객',
  custom: '직접',
};

export function todayLine(today: string, timeZone: string): string {
  return `오늘은 ${today} (${weekdayName(today)}요일)이고, 시간대는 ${timeZone}입니다.`;
}

export const BRIEFING_SYSTEM = `당신은 바쁜 사람을 위해 최신 소식을 골라 주는 비서입니다.
주어진 주제 하나에 대해 web_search로 최근 소식(가능하면 최근 일주일)을 찾고, 가장 중요한 것만 골라 요약합니다.
다 찾았으면 반드시 submit_briefing 도구를 한 번 호출해서 결과를 제출하세요. 다른 답변 글은 쓰지 않아도 됩니다.
- bullets: 한국어 요약 1~5개. 한 줄에 소식 하나, 200자 이내, 사실 위주로.
- sources: 요약의 근거가 된 기사 1~5개. url은 이번 검색 결과에 실제로 나온 주소만 그대로 쓰세요. 주소를 지어내지 마세요.
  lang은 기사 언어(ko, en, other).
- 최근 소식을 찾지 못했으면 status를 "empty"로, bullets와 sources는 빈 배열로 제출하세요.`;

export function briefingPrompt(topic: string, language: BriefingLanguage, today: string, timeZone: string): string {
  const lang =
    language === 'ko'
      ? '한국어 기사만 찾아 주세요.'
      : '한국어 기사와 영어 기사를 모두 찾아 주세요. 요약은 항상 한국어로 써 주세요.';
  return `${todayLine(today, timeZone)}\n주제: ${topic}\n${lang}`;
}

export const SUBMIT_BRIEFING_TOOL = {
  name: 'submit_briefing',
  description: '주제 하나에 대한 최신 소식 요약과 출처를 제출합니다. 검색을 마친 뒤 한 번만 호출합니다.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['ok', 'empty'] },
      bullets: { type: 'array', items: { type: 'string' } },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            lang: { type: 'string', enum: ['ko', 'en', 'other'] },
          },
          required: ['title', 'url', 'lang'],
          additionalProperties: false,
        },
      },
    },
    required: ['status', 'bullets', 'sources'],
    additionalProperties: false,
  },
};

export const EVENT_SYSTEM = `사용자가 말하듯 적은 문장을 일정 하나로 정리합니다.
날짜는 YYYY-MM-DD, 시간은 24시간 HH:mm로 씁니다. 문장에 없는 칸은 null로 둡니다.
상대 날짜는 아래 규칙으로 계산합니다. 한 주는 월요일부터 일요일까지입니다.
- 오늘 / 내일 / 모레: 오늘에서 0 / 1 / 2일 뒤
- "이번 주 X요일": 이번 주(월~일)의 X요일
- "다음 주 X요일": 다음 주(월~일)의 X요일
- 앞에 아무 말 없는 "X요일": 오늘 이후 가장 가까운 X요일. 오늘이 X요일이면 다음 주 X요일
- 오전/오후 없이 1~6시는 오후로, 7~11시는 오전으로 봅니다. "아침", "오전"은 오전, "저녁", "밤", "오후"는 오후입니다.
title은 짧게(예: "민수 미팅"), location은 장소만 씁니다.
확실하지 않은 칸은 uncertain 배열에 칸 이름을 넣습니다.
상대 날짜나 오전/오후를 추측했다면 interpretation에 어떻게 읽었는지 한국어 한 문장으로 씁니다(예: "'다음 주 화요일'을 10월 13일로 읽었어요"). 추측한 것이 없으면 null.`;

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    date: nullableString,
    start: nullableString,
    end: nullableString,
    location: nullableString,
    memo: nullableString,
    uncertain: { type: 'array', items: { type: 'string', enum: ['title', 'date', 'start', 'end', 'location'] } },
    interpretation: nullableString,
  },
  required: ['title', 'date', 'start', 'end', 'location', 'memo', 'uncertain', 'interpretation'],
  additionalProperties: false,
};

export const MESSAGE_SYSTEM = `사용자 대신 보낼 메시지 초안을 씁니다. 카카오톡이나 문자로 바로 보낼 수 있게 자연스러운 한국어로 씁니다.
서로 다른 느낌의 초안을 정확히 2개 씁니다(예: 하나는 짧게, 하나는 조금 더 자세히).
받는 사람과의 관계와 말투(정중하게 / 편하게)를 지킵니다. 사용자가 말하지 않은 사실은 지어내지 않습니다.
일정 정보가 주어지면 날짜, 시간, 장소를 정확히 넣습니다. 초안에는 메시지 본문만 쓰고 설명은 붙이지 않습니다.`;

export const MESSAGE_SCHEMA = {
  type: 'object',
  properties: { drafts: { type: 'array', items: { type: 'string' } } },
  required: ['drafts'],
  additionalProperties: false,
};

export function messagePrompt(req: MessageRequest): string {
  const relation = req.relation === 'custom' ? req.customRelation.trim() : RELATION_LABELS[req.relation];
  const lines = [
    `받는 사람: ${relation}${req.name.trim() ? ` (${req.name.trim()})` : ''}`,
    `말투: ${req.tone === 'polite' ? '정중하게' : '편하게'}`,
    `하고 싶은 말: ${req.intent.trim()}`,
  ];
  if (req.event) {
    const e = req.event;
    const time = e.start ? ` ${e.start}${e.end ? `~${e.end}` : ''}` : ' (종일)';
    lines.push(`일정: ${e.title} · ${formatLong(e.date)}${time}${e.location ? ` · ${e.location}` : ''}${e.memo ? `\n일정 메모: ${e.memo}` : ''}`);
  }
  return lines.join('\n');
}
