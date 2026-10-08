/** Ready-made trips so the simulator can be shown without an API key. Fees are approximate. */
import { checkPlan } from './core/validate';
import type { ModeChoice, PlaceKind, TripPlan } from './core/types';

type S = [name: string, lat: number, lng: number, kind: PlaceKind, stayMin: number, cost: number, modeIn: ModeChoice, open?: string, close?: string, note?: string];

const stops = (list: S[]) =>
  list.map(([name, lat, lng, kind, stayMin, cost, modeIn, open, close, note]) => ({ name, lat, lng, kind, stayMin, cost, modeIn, open, close, note }));

const RAW = [
  {
    id: 'sample-seoul',
    title: '서울 하루 핵심 코스',
    destination: '서울',
    region: 'KR',
    travelers: 2,
    budgetKrw: 250000,
    lodgingPerNight: 180000,
    tips: ['궁궐은 한복을 입으면 무료로 들어갈 수 있어요', '교통카드 하나로 지하철·버스 환승 할인이 돼요'],
    days: [
      {
        label: '1일차 · 궁궐과 야경',
        start: '09:00',
        stops: stops([
          ['명동 호텔', 37.5651, 126.981, 'hotel', 0, 0, 'auto'],
          ['경복궁', 37.5796, 126.977, 'sight', 90, 3000, 'subway', '09:00', '18:00', '10시·14시 수문장 교대식'],
          ['북촌한옥마을', 37.5826, 126.9831, 'sight', 60, 0, 'walk'],
          ['광장시장 (점심)', 37.57, 126.9996, 'food', 60, 15000, 'taxi', '09:00', '22:00', '빈대떡·육회'],
          ['동대문디자인플라자', 37.5665, 127.0092, 'sight', 45, 0, 'walk'],
          ['N서울타워', 37.5512, 126.9882, 'sight', 75, 21000, 'taxi', '10:00', '23:00', '전망대 입장료'],
          ['홍대 (저녁)', 37.5563, 126.9236, 'food', 120, 25000, 'subway'],
          ['명동 호텔', 37.5651, 126.981, 'hotel', 0, 0, 'subway'],
        ]),
      },
    ],
  },
  {
    id: 'sample-jeju',
    title: '제주 1박 2일 렌터카 일주',
    destination: '제주',
    region: 'KR',
    travelers: 2,
    budgetKrw: 700000,
    lodgingPerNight: 250000,
    tips: ['렌터카는 공항 근처 차고지에서 받아요', '성산일출봉은 아침 일찍 가면 덜 붐벼요'],
    days: [
      {
        label: '1일차 · 서쪽',
        start: '07:30',
        stops: stops([
          ['김포공항', 37.5587, 126.7945, 'airport', 0, 0, 'auto'],
          ['제주국제공항', 33.5104, 126.4914, 'airport', 40, 0, 'flight', undefined, undefined, '렌터카 인수'],
          ['용두암', 33.5163, 126.512, 'nature', 30, 0, 'car'],
          ['협재해수욕장', 33.394, 126.2397, 'nature', 90, 0, 'car'],
          ['한림 (점심)', 33.4115, 126.2654, 'food', 60, 15000, 'car', undefined, undefined, '고기국수'],
          ['오설록 티뮤지엄', 33.3059, 126.2895, 'cafe', 60, 8000, 'car', '09:00', '18:00'],
          ['중문 호텔', 33.2477, 126.408, 'hotel', 0, 0, 'car'],
        ]),
      },
      {
        label: '2일차 · 동쪽',
        start: '08:00',
        stops: stops([
          ['중문 호텔', 33.2477, 126.408, 'hotel', 0, 0, 'auto'],
          ['성산일출봉', 33.4581, 126.9425, 'nature', 90, 5000, 'car', '07:00', '19:00'],
          ['섭지코지', 33.424, 126.931, 'nature', 60, 0, 'car'],
          ['만장굴', 33.5283, 126.771, 'nature', 60, 4000, 'car', '09:00', '18:00'],
          ['동문시장 (저녁)', 33.5122, 126.5274, 'food', 90, 20000, 'car', '08:00', '21:00'],
          ['제주국제공항', 33.5104, 126.4914, 'airport', 0, 0, 'car'],
        ]),
      },
    ],
  },
  {
    id: 'sample-tokyo',
    title: '도쿄 2박 3일 중 이틀',
    destination: '도쿄',
    region: 'JP',
    travelers: 2,
    budgetKrw: 900000,
    lodgingPerNight: 22000,
    tips: ['Suica 카드 하나로 지하철·JR을 탈 수 있어요', '스카이트리·시부야 스카이는 미리 예약하면 싸요'],
    days: [
      {
        label: '1일차 · 신주쿠~아사쿠사',
        start: '09:00',
        stops: stops([
          ['신주쿠 호텔', 35.6948, 139.702, 'hotel', 0, 0, 'auto'],
          ['메이지 신궁', 35.6764, 139.6993, 'sight', 60, 0, 'subway', '06:00', '17:00'],
          ['하라주쿠 다케시타 거리', 35.6716, 139.7031, 'shop', 60, 1500, 'walk'],
          ['시부야 스크램블 (점심)', 35.6595, 139.7005, 'food', 60, 1500, 'walk'],
          ['시부야 스카이', 35.6584, 139.7022, 'sight', 60, 2500, 'walk', '10:00', '22:30'],
          ['아사쿠사 센소지', 35.7148, 139.7967, 'sight', 75, 0, 'subway'],
          ['도쿄 스카이트리', 35.7101, 139.8107, 'sight', 90, 3100, 'walk', '10:00', '21:00'],
          ['신주쿠 호텔', 35.6948, 139.702, 'hotel', 0, 0, 'subway'],
        ]),
      },
      {
        label: '2일차 · 긴자~아키하바라',
        start: '08:30',
        stops: stops([
          ['신주쿠 호텔', 35.6948, 139.702, 'hotel', 0, 0, 'auto'],
          ['츠키지 장외시장 (아침)', 35.6654, 139.7707, 'food', 75, 3000, 'subway', '07:00', '14:00'],
          ['긴자', 35.6717, 139.765, 'shop', 90, 2000, 'walk'],
          ['도쿄역 마루노우치', 35.6812, 139.7671, 'sight', 30, 0, 'walk'],
          ['아키하바라', 35.6984, 139.7731, 'shop', 90, 2000, 'subway'],
          ['오모이데요코초 (저녁)', 35.6938, 139.6995, 'food', 90, 3500, 'subway', '17:00', '23:59'],
          ['신주쿠 호텔', 35.6948, 139.702, 'hotel', 0, 0, 'walk'],
        ]),
      },
    ],
  },
  {
    id: 'sample-paris',
    title: '파리 이틀 미술관과 몽마르트르',
    destination: '파리',
    region: 'FR',
    travelers: 2,
    budgetKrw: 1200000,
    lodgingPerNight: 220,
    tips: ['루브르는 화요일 휴관이에요', '나비고 이지 카드로 지하철 표를 충전해 쓰면 편해요'],
    days: [
      {
        label: '1일차 · 센강 서쪽',
        start: '08:45',
        stops: stops([
          ['루브르 근처 호텔', 48.8634, 2.3355, 'hotel', 0, 0, 'auto'],
          ['루브르 박물관', 48.8606, 2.3376, 'sight', 150, 22, 'walk', '09:00', '18:00'],
          ['튈르리 정원', 48.8635, 2.3275, 'nature', 30, 0, 'walk'],
          ['카페 드 플로르 (점심)', 48.8541, 2.3326, 'cafe', 60, 25, 'walk'],
          ['오르세 미술관', 48.86, 2.3266, 'sight', 120, 16, 'walk', '09:30', '18:00'],
          ['에펠탑', 48.8584, 2.2945, 'sight', 90, 29, 'taxi', '09:30', '23:00'],
          ['바토 무슈 유람선', 48.8638, 2.3057, 'activity', 70, 17, 'walk', '10:00', '22:30'],
          ['루브르 근처 호텔', 48.8634, 2.3355, 'hotel', 0, 0, 'taxi'],
        ]),
      },
      {
        label: '2일차 · 몽마르트르~마레',
        start: '09:00',
        stops: stops([
          ['루브르 근처 호텔', 48.8634, 2.3355, 'hotel', 0, 0, 'auto'],
          ['사크레쾨르 대성당', 48.8867, 2.3431, 'sight', 60, 0, 'subway'],
          ['테르트르 광장 (점심)', 48.8865, 2.3408, 'food', 60, 25, 'walk'],
          ['개선문', 48.8738, 2.295, 'sight', 60, 16, 'subway', '10:00', '23:00'],
          ['샹젤리제 거리', 48.8698, 2.3076, 'shop', 90, 30, 'walk'],
          ['노트르담 대성당', 48.853, 2.3499, 'sight', 45, 0, 'subway', '07:45', '19:00'],
          ['마레 지구 (저녁)', 48.859, 2.3622, 'food', 90, 40, 'walk'],
          ['루브르 근처 호텔', 48.8634, 2.3355, 'hotel', 0, 0, 'subway'],
        ]),
      },
    ],
  },
];

export const SAMPLES: TripPlan[] = RAW.map((r) => checkPlan(r)).filter((p): p is TripPlan => p !== null);

/** A fresh copy, so edits never touch the originals. */
export function samplePlan(id: string): TripPlan | null {
  const p = SAMPLES.find((s) => s.id === id);
  return p ? (JSON.parse(JSON.stringify(p)) as TripPlan) : null;
}
