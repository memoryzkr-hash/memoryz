/** What we ask Claude when 정밀 분석 is on. */

export const ANALYSIS_SYSTEM = `당신은 시험 직전 학생을 돕는 학습 코치입니다. 학생은 공부를 거의 안 했고, 전부 공부할 시간이 없습니다.
학생이 올린 시험 자료를 읽고, 시험에 나올 가능성이 높은 핵심 개념을 골라 바로 풀 수 있는 학습 카드로 바꿔 주세요.

규칙
- 자료에 실제로 있는 내용만 쓰세요. 자료에 없는 사실을 지어내지 마세요.
- 개념은 최대 40개. 시험에 나올 가능성이 높은 것(정의, 공식, 대표 예시, 비교, 강조 표시된 내용)을 우선하세요.
- importance: 1~5 정수. 5 = 거의 확실히 출제, 1 = 시간 없으면 버려도 됨. 골고루 나눠 주세요.
- kind: 이해해야 하는 개념이면 "concept", 숫자·이름·목록처럼 외워야 하면 "memorize".
- explain: 20초 안에 읽을 수 있는 쉬운 설명. 1~3문장, 150자 이내, 친근한 말투(~예요).
- recall: 머릿속으로 답을 떠올리게 하는 짧은 질문.
- answer: recall의 정답. 80자 이내 핵심만.
- mcq: 그 개념을 확인하는 4지선다. similar: 같은 개념을 다른 각도(사례, 계산, 거꾸로 묻기)로 묻는 4지선다.
  options는 4개, answer는 정답의 0부터 시작하는 번호. 오답도 그럴듯하게. why는 한 줄 해설.
- 모든 글은 한국어로 쓰세요. 자료가 영어여도 용어는 "한국어 (English)"처럼 함께 적어 주세요.`;

export function analysisPrompt(subject: string, note: string | null): string {
  return `과목: ${subject}\n${note ? `참고: ${note}\n` : ''}위 자료로 학습 카드를 만들어 주세요.`;
}

const CHOICE = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer' },
    why: { type: 'string' },
  },
  required: ['question', 'options', 'answer', 'why'],
  additionalProperties: false,
};

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          importance: { type: 'integer' },
          kind: { type: 'string', enum: ['concept', 'memorize'] },
          explain: { type: 'string' },
          recall: { type: 'string' },
          answer: { type: 'string' },
          mcq: CHOICE,
          similar: CHOICE,
        },
        required: ['term', 'importance', 'kind', 'explain', 'recall', 'answer', 'mcq', 'similar'],
        additionalProperties: false,
      },
    },
  },
  required: ['concepts'],
  additionalProperties: false,
};
