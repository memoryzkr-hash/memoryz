/**
 * The planning conversation as data. Each step asks one thing, offers tap-to-answer choices,
 * and may be skipped depending on earlier answers. Pure, so the whole interview is testable.
 *
 * Order: where → (not sure? home or abroad → mood → pick) → how long → with whom → how many
 *        → budget → pace → what to do → how to get around → first-day start → review.
 */
import type { PlanRequest, Transport } from '../core/store';

export type StepId =
  | 'destination'
  | 'abroad'
  | 'mood'
  | 'pick'
  | 'days'
  | 'companions'
  | 'travelers'
  | 'budget'
  | 'pace'
  | 'wishes'
  | 'transport'
  | 'start';

export interface Answers {
  destination?: string;
  /** Set when the traveller hasn't chosen a place yet; cleared once they pick one. */
  undecided?: boolean;
  abroad?: boolean;
  mood?: string;
  days?: number;
  companions?: string;
  travelers?: number;
  /** Per person, KRW; null = no budget. */
  budgetPerPerson?: number | null;
  pace?: PlanRequest['pace'];
  wishes?: string[];
  transport?: Transport;
  start?: string;
}

export interface Choice {
  label: string;
  value: string;
  /** Small grey line under the label. */
  hint?: string;
}

export interface Step {
  id: StepId;
  ask(a: Answers): string;
  /** Optional second line explaining why we ask. */
  why?(a: Answers): string;
  choices(a: Answers): Choice[];
  multi?: boolean;
  /** Free typing allowed, with this placeholder. */
  input?: string;
  skip?(a: Answers): boolean;
  /** Folds an answer in. Returns null with a message when the answer can't be used. */
  apply(a: Answers, value: string): Answers | { error: string };
  /** How the answer reads in the traveller's own bubble. */
  echo?(value: string, a: Answers): string;
}

export const POPULAR: Choice[] = [
  { label: '제주', value: '제주' },
  { label: '부산', value: '부산' },
  { label: '강릉', value: '강릉' },
  { label: '도쿄', value: '도쿄' },
  { label: '오사카', value: '오사카' },
  { label: '파리', value: '파리' },
];

export const MOODS = ['바다', '도시·쇼핑', '자연·힐링', '맛집', '역사·문화'] as const;

/** Where to suggest by mood, at home and abroad. */
export const SUGGESTIONS: Record<(typeof MOODS)[number], { home: Choice[]; abroad: Choice[] }> = {
  바다: {
    home: [
      { label: '제주', value: '제주', hint: '해안 도로 드라이브' },
      { label: '부산', value: '부산', hint: '해운대·광안리·감천마을' },
      { label: '강릉', value: '강릉', hint: '안목 커피거리·경포대' },
      { label: '여수', value: '여수', hint: '밤바다·케이블카' },
    ],
    abroad: [
      { label: '다낭', value: '다낭', hint: '비행 4시간 반, 리조트' },
      { label: '오키나와', value: '오키나와', hint: '비행 2시간 반, 렌터카' },
      { label: '세부', value: '세부', hint: '스노클링·호핑 투어' },
    ],
  },
  '도시·쇼핑': {
    home: [
      { label: '서울', value: '서울', hint: '성수·한남·명동' },
      { label: '부산', value: '부산', hint: '서면·센텀·해운대' },
    ],
    abroad: [
      { label: '도쿄', value: '도쿄', hint: '시부야·긴자·하라주쿠' },
      { label: '오사카', value: '오사카', hint: '난바·우메다, 먹거리' },
      { label: '홍콩', value: '홍콩', hint: '야경·딤섬' },
      { label: '방콕', value: '방콕', hint: '쇼핑몰·야시장' },
    ],
  },
  '자연·힐링': {
    home: [
      { label: '제주', value: '제주', hint: '오름·숲길·올레길' },
      { label: '강원 평창', value: '평창', hint: '양떼목장·오대산' },
      { label: '남해', value: '남해', hint: '독일마을·다랭이마을' },
    ],
    abroad: [
      { label: '삿포로', value: '삿포로', hint: '비에이·후라노' },
      { label: '발리', value: '발리', hint: '우붓 논길·요가' },
      { label: '스위스', value: '스위스', hint: '알프스 기차 여행' },
    ],
  },
  맛집: {
    home: [
      { label: '전주', value: '전주', hint: '한옥마을·비빔밥' },
      { label: '부산', value: '부산', hint: '돼지국밥·회' },
      { label: '대구', value: '대구', hint: '막창·서문시장' },
    ],
    abroad: [
      { label: '오사카', value: '오사카', hint: '타코야키·오코노미야키' },
      { label: '타이베이', value: '타이베이', hint: '야시장·우육면' },
      { label: '방콕', value: '방콕', hint: '길거리 음식' },
    ],
  },
  '역사·문화': {
    home: [
      { label: '경주', value: '경주', hint: '불국사·대릉원' },
      { label: '서울', value: '서울', hint: '궁궐·북촌' },
      { label: '전주', value: '전주', hint: '한옥마을' },
    ],
    abroad: [
      { label: '교토', value: '교토', hint: '사찰·료칸' },
      { label: '파리', value: '파리', hint: '루브르·오르세' },
      { label: '로마', value: '로마', hint: '콜로세움·바티칸' },
    ],
  },
};

export const WISHES = ['맛집', '카페', '바다·자연', '사진 명소', '쇼핑', '박물관·미술관', '체험·액티비티', '야경'];
export const NO_WISH = '특별히 없어요';

/** "40만", "40만원", "400,000", "1.5백만" → won. */
export function parseKrw(text: string): number | null {
  const t = text.replace(/[\s,원]/g, '');
  const m = /^(\d+(?:\.\d+)?)(백만|십만|만|천)?$/.exec(t);
  if (!m) return null;
  const unit = m[2] === '백만' ? 1_000_000 : m[2] === '십만' ? 100_000 : m[2] === '만' ? 10_000 : m[2] === '천' ? 1_000 : 1;
  const n = Math.round(Number(m[1]) * unit);
  return n > 0 ? n : null;
}

/** "3", "3일", "2박 3일", "당일" → days. */
export function parseDays(text: string): number | null {
  const t = text.replace(/\s/g, '');
  if (t === '당일' || t === '당일치기') return 1;
  const m = /^(?:(\d+)박)?(\d+)일?$/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] && Number(m[1]) + 1 !== n) return null;
  return n;
}

const nights = (d: number) => (d > 1 ? `${d - 1}박 ${d}일` : '당일치기');
const won = (n: number) => (n >= 10_000 ? `${(n / 10_000).toLocaleString('ko-KR')}만 원` : `${n.toLocaleString('ko-KR')}원`);

export const STEPS: Step[] = [
  {
    id: 'destination',
    ask: () => '어디로 떠나고 싶어요?',
    why: () => '도시 이름이나 지역을 적어도 돼요.',
    choices: () => [...POPULAR, { label: '아직 못 정했어요', value: '?' }],
    input: '예: 여수, 다낭, 교토',
    skip: (a) => a.undecided === true || !!a.destination,
    apply: (a, v) => {
      if (v === '?') return { ...a, undecided: true, destination: undefined };
      const d = v.trim();
      if (!d) return { error: '여행지를 적어 주세요' };
      if (d.length > 40) return { error: '여행지는 40자까지 적을 수 있어요' };
      return { ...a, destination: d, undecided: false };
    },
    echo: (v) => (v === '?' ? '아직 못 정했어요' : v),
  },
  {
    id: 'abroad',
    ask: () => '괜찮아요, 같이 골라 봐요. 국내와 해외 중 어디가 좋아요?',
    choices: () => [
      { label: '국내', value: 'home' },
      { label: '해외', value: 'abroad' },
    ],
    skip: (a) => !a.undecided || a.abroad !== undefined,
    apply: (a, v) => (v === 'home' || v === 'abroad' ? { ...a, abroad: v === 'abroad' } : { error: '국내나 해외 중에 골라 주세요' }),
    echo: (v) => (v === 'abroad' ? '해외' : '국내'),
  },
  {
    id: 'mood',
    ask: () => '어떤 여행이 끌려요?',
    choices: () => MOODS.map((m) => ({ label: m, value: m })),
    skip: (a) => !a.undecided || !!a.mood,
    apply: (a, v) => ((MOODS as readonly string[]).includes(v) ? { ...a, mood: v } : { error: '보기 중에서 골라 주세요' }),
  },
  {
    id: 'pick',
    ask: (a) => `${a.mood} 여행이라면 이런 곳을 추천해요. 마음에 드는 곳이 있어요?`,
    choices: (a) => SUGGESTIONS[a.mood as (typeof MOODS)[number]]?.[a.abroad ? 'abroad' : 'home'] ?? [],
    input: '다른 곳을 적어도 돼요',
    skip: (a) => !a.undecided,
    apply: (a, v) => {
      const d = v.trim();
      if (!d) return { error: '여행지를 적어 주세요' };
      return { ...a, destination: d.slice(0, 40), undecided: false };
    },
  },
  {
    id: 'days',
    ask: (a) => `${a.destination}, 좋아요! 며칠 다녀올 생각이에요?`,
    choices: () => [1, 2, 3, 4, 5].map((d) => ({ label: nights(d), value: String(d) })),
    input: '예: 5박 6일',
    skip: (a) => a.days !== undefined,
    apply: (a, v) => {
      const d = parseDays(v);
      if (!d) return { error: '"2박 3일"이나 "3일"처럼 적어 주세요' };
      if (d > 7) return { error: '일정은 7일까지 짤 수 있어요' };
      return { ...a, days: d };
    },
    echo: (v) => nights(parseDays(v) ?? 1),
  },
  {
    id: 'companions',
    ask: () => '누구랑 가요?',
    why: () => '함께 가는 사람에 따라 장소와 속도를 맞출게요.',
    choices: () => ['혼자', '연인·배우자', '친구', '가족', '아이와 함께', '부모님과'].map((c) => ({ label: c, value: c })),
    skip: (a) => !!a.companions,
    apply: (a, v) => {
      const c = v.trim().slice(0, 20);
      if (!c) return { error: '누구랑 가는지 알려 주세요' };
      const travelers = c === '혼자' ? 1 : c === '연인·배우자' ? 2 : a.travelers;
      return { ...a, companions: c, travelers };
    },
  },
  {
    id: 'travelers',
    ask: (a) => `${a.companions === '친구' ? '친구들까지' : '모두'} 몇 명이에요?`,
    why: () => '택시는 4명당 한 대, 숙소는 2명당 한 방으로 계산해요.',
    choices: () => [2, 3, 4, 5, 6].map((n) => ({ label: `${n}명`, value: String(n) })),
    input: '인원 (최대 8명)',
    skip: (a) => a.travelers !== undefined,
    apply: (a, v) => {
      const n = Number(v.replace(/[^\d]/g, ''));
      if (!Number.isInteger(n) || n < 1 || n > 8) return { error: '1명에서 8명까지 정할 수 있어요' };
      return { ...a, travelers: n };
    },
    echo: (v) => `${v.replace(/[^\d]/g, '')}명`,
  },
  {
    id: 'budget',
    ask: () => `한 사람당 예산은 어느 정도예요?`,
    why: (a) => `${nights(a.days ?? 1)} 동안 숙박·교통·입장료·식사를 모두 합친 금액이에요.`,
    choices: (a) => {
      const scale = a.abroad || isAbroad(a.destination) ? 3 : 1;
      const steps = [10, 30, 50, 100].map((x) => x * scale * Math.max(1, Math.ceil((a.days ?? 1) / 2)));
      return [
        ...steps.map((x) => ({ label: `${won(x * 10_000)}`, value: String(x * 10_000) })),
        { label: '정하지 않았어요', value: 'none' },
      ];
    },
    input: '예: 40만 원',
    skip: (a) => a.budgetPerPerson !== undefined,
    apply: (a, v) => {
      if (v === 'none') return { ...a, budgetPerPerson: null };
      const n = parseKrw(v);
      if (!n) return { error: '"40만 원"처럼 금액을 적어 주세요' };
      return { ...a, budgetPerPerson: n };
    },
    echo: (v) => (v === 'none' ? '정하지 않았어요' : `1인 ${won(parseKrw(v) ?? 0)}`),
  },
  {
    id: 'pace',
    ask: () => '하루에 얼마나 돌아다닐까요?',
    choices: () => [
      { label: '여유롭게', value: 'relaxed', hint: '하루 3~4곳, 쉬는 시간 넉넉히' },
      { label: '적당히', value: 'normal', hint: '하루 5~6곳' },
      { label: '알차게', value: 'packed', hint: '하루 7곳 이상' },
    ],
    skip: (a) => !!a.pace,
    apply: (a, v) => (v === 'relaxed' || v === 'normal' || v === 'packed' ? { ...a, pace: v } : { error: '보기 중에서 골라 주세요' }),
    echo: (v) => ({ relaxed: '여유롭게', normal: '적당히', packed: '알차게' })[v] ?? v,
  },
  {
    id: 'wishes',
    ask: () => '꼭 하고 싶은 게 있어요?',
    why: () => '여러 개 골라도 돼요. 다 고르면 "다 골랐어요"를 눌러 주세요.',
    choices: () => [...WISHES.map((w) => ({ label: w, value: w })), { label: NO_WISH, value: NO_WISH }],
    multi: true,
    input: '직접 적기 (예: 스노클링, 온천)',
    skip: (a) => a.wishes !== undefined,
    apply: (a, v) => {
      const list = v
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 10);
      return { ...a, wishes: list.includes(NO_WISH) ? [] : list };
    },
    echo: (v) => v.split(',').map((x) => x.trim()).filter(Boolean).join(', '),
  },
  {
    id: 'transport',
    ask: () => '현지에서는 주로 어떻게 다닐 거예요?',
    choices: (a) => [
      { label: '대중교통', value: 'transit', hint: '지하철·버스·도보' },
      { label: '렌터카', value: 'car', hint: a.destination?.includes('제주') ? '제주는 렌터카가 편해요' : '운전할 사람이 있다면' },
      { label: '택시 위주', value: 'taxi', hint: '편하지만 비용이 늘어요' },
      { label: '상관없어요', value: 'any', hint: '거리에 맞게 알아서' },
    ],
    skip: (a) => !!a.transport,
    apply: (a, v) => (['transit', 'car', 'taxi', 'any'].includes(v) ? { ...a, transport: v as Transport } : { error: '보기 중에서 골라 주세요' }),
    echo: (v) => ({ transit: '대중교통', car: '렌터카', taxi: '택시 위주', any: '상관없어요' })[v] ?? v,
  },
  {
    id: 'start',
    ask: () => '마지막이에요. 첫날 몇 시쯤 움직이기 시작해요?',
    choices: () => [
      { label: '아침 8시', value: '08:00' },
      { label: '9시', value: '09:00' },
      { label: '10시', value: '10:00' },
      { label: '11시', value: '11:00' },
      { label: '오후 1시', value: '13:00' },
    ],
    skip: (a) => !!a.start,
    apply: (a, v) => (/^\d\d:\d\d$/.test(v) ? { ...a, start: v } : { error: '보기 중에서 골라 주세요' }),
    echo: (v) => `${Number(v.slice(0, 2)) >= 12 ? '오후 ' : ''}${Number(v.slice(0, 2)) > 12 ? Number(v.slice(0, 2)) - 12 : Number(v.slice(0, 2))}시`,
  },
];

const ABROAD = ['도쿄', '오사카', '교토', '삿포로', '오키나와', '후쿠오카', '파리', '런던', '로마', '뉴욕', '다낭', '세부', '발리', '방콕', '홍콩', '타이베이', '싱가포르', '스위스', '하와이'];

export function isAbroad(destination: string | undefined): boolean {
  return !!destination && ABROAD.some((c) => destination.includes(c));
}

export function step(id: StepId): Step {
  return STEPS.find((s) => s.id === id)!;
}

/** The next question to ask, or null when everything needed is known. */
export function nextStep(a: Answers): Step | null {
  return STEPS.find((s) => !(s.skip?.(a) ?? false)) ?? null;
}

/** How far along the interview is, 0..1, for the progress bar. */
export function progress(a: Answers): number {
  const main: StepId[] = ['destination', 'days', 'companions', 'budget', 'pace', 'wishes', 'transport', 'start'];
  const done = main.filter((id) => step(id).skip?.(a)).length;
  return done / main.length;
}

/** Forget one answer (and what depends on it) so its question is asked again. */
export function forget(a: Answers, id: StepId): Answers {
  const next = { ...a };
  switch (id) {
    case 'destination':
      delete next.destination;
      delete next.undecided;
      delete next.abroad;
      delete next.mood;
      break;
    case 'companions':
      delete next.companions;
      delete next.travelers;
      break;
    case 'budget':
      delete next.budgetPerPerson;
      break;
    default:
      delete (next as Record<string, unknown>)[id];
  }
  return next;
}

export interface SummaryRow {
  id: StepId;
  label: string;
  value: string;
}

export function summary(a: Answers): SummaryRow[] {
  const rows: SummaryRow[] = [
    { id: 'destination', label: '여행지', value: a.destination ?? '' },
    { id: 'days', label: '기간', value: nights(a.days ?? 1) },
    { id: 'companions', label: '함께', value: `${a.companions ?? ''} · ${a.travelers ?? 1}명` },
    { id: 'budget', label: '예산', value: a.budgetPerPerson ? `1인 ${won(a.budgetPerPerson)} · 총 ${won(a.budgetPerPerson * (a.travelers ?? 1))}` : '정하지 않음' },
    { id: 'pace', label: '일정', value: step('pace').echo!(a.pace ?? 'normal', a) },
    { id: 'wishes', label: '하고 싶은 것', value: a.wishes?.length ? a.wishes.join(', ') : '특별히 없음' },
    { id: 'transport', label: '이동', value: step('transport').echo!(a.transport ?? 'any', a) },
    { id: 'start', label: '첫날 출발', value: step('start').echo!(a.start ?? '09:00', a) },
  ];
  return rows;
}

export function toRequest(a: Answers): PlanRequest {
  const travelers = a.travelers ?? 1;
  return {
    destination: a.destination ?? '',
    days: a.days ?? 1,
    travelers,
    budgetKrw: a.budgetPerPerson ? a.budgetPerPerson * travelers : null,
    pace: a.pace ?? 'normal',
    interests: (a.wishes ?? []).join(', '),
    companions: a.companions ?? '',
    transport: a.transport ?? 'any',
    start: a.start ?? '09:00',
  };
}
