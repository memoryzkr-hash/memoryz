/** What we ask Claude for. Claude picks places; the app computes every time and fare itself. */
import { MODE_CHOICES } from './core/modes';
import { REGION_IDS } from './core/regions';
import type { PlanRequest } from './core/store';
import { KINDS } from './core/validate';

export const PACE_LABELS: Record<PlanRequest['pace'], string> = {
  relaxed: '여유롭게 (하루 3~4곳)',
  normal: '보통 (하루 5~6곳)',
  packed: '알차게 (하루 7곳 이상)',
};

export const PLAN_SYSTEM = `당신은 여행 일정을 짜는 전문 플래너입니다. 요청에 맞는 날짜별 방문 순서를 JSON으로 만듭니다.
이동 시간과 교통비는 앱이 좌표로 직접 계산하니, 당신은 "어디를, 어떤 순서로, 얼마나 머물고, 무엇을 타고 갈지"만 정합니다.
- 장소는 실제로 있는 곳만. lat/lng는 그 장소의 실제 좌표(소수점 4자리)입니다. 모르는 곳은 넣지 마세요.
- 하루의 첫 장소는 그날 출발하는 곳(보통 숙소, 첫날은 공항·역도 가능), 마지막 장소는 그날 묵는 숙소(마지막 날은 공항·역)입니다.
  첫 장소의 stayMin은 0, 숙소로 돌아오는 마지막 장소의 stayMin도 0입니다.
- 동선이 꼬이지 않게 가까운 곳끼리 묶습니다. 점심·저녁 식사 장소를 끼워 넣습니다.
- modeIn은 "앞 장소에서 여기까지 무엇을 타고 오는지"입니다. 1km 안팎은 walk, 도시 안은 subway·bus·taxi,
  섬·시골 렌터카 여행은 car, 도시 사이는 train·flight·ferry. 애매하면 auto.
- cost는 1인 기준 입장료·식사비 등(교통비 제외)이며 region 통화 단위입니다(KR=원, JP=엔, FR=유로, US=달러, TH=바트, OTHER=달러).
- open/close는 확실히 아는 경우만 "HH:mm", 아니면 null. note는 짧은 팁 한 줄 또는 null.
- region은 여행 국가(KR, JP, FR, US, TH). 그 밖의 나라는 OTHER.
- lodgingPerNight는 방 하나(2인) 1박 요금의 현실적인 추정치(region 통화).
- tips는 그 여행지에서 알아 두면 좋은 짧은 팁 2~4개(한국어).
- title·label·name·note·tips는 한국어로 씁니다(장소 이름은 한국에서 흔히 부르는 이름).`;

export function planPrompt(r: PlanRequest): string {
  const lines = [
    `여행지: ${r.destination.trim()}`,
    `기간: ${r.days}일 (${r.days > 1 ? `${r.days - 1}박 ${r.days}일` : '당일'})`,
    `인원: ${r.travelers}명`,
    `일정 밀도: ${PACE_LABELS[r.pace]}`,
  ];
  if (r.budgetKrw) lines.push(`총예산: 약 ${r.budgetKrw.toLocaleString('ko-KR')}원 (숙박·교통·입장료·식사 포함). 넘지 않게 짜 주세요.`);
  if (r.interests.trim()) lines.push(`관심사·요청: ${r.interests.trim()}`);
  return lines.join('\n');
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    region: { type: 'string', enum: REGION_IDS },
    lodgingPerNight: { type: 'number' },
    tips: { type: 'array', items: { type: 'string' } },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          start: { type: 'string' },
          stops: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                kind: { type: 'string', enum: KINDS },
                stayMin: { type: 'integer' },
                cost: { type: 'number' },
                modeIn: { type: 'string', enum: MODE_CHOICES },
                open: nullableString,
                close: nullableString,
                note: nullableString,
              },
              required: ['name', 'lat', 'lng', 'kind', 'stayMin', 'cost', 'modeIn', 'open', 'close', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['label', 'start', 'stops'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'region', 'lodgingPerNight', 'tips', 'days'],
  additionalProperties: false,
};
