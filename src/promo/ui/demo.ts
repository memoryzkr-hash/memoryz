/** Example data so the dashboard shows a realistic working state before GitHub is connected. */
import { DEFAULT_CONFIG } from '../core/config';
import { addDays, localParts } from '../core/schedule';
import { emptyState } from '../core/state';
import type { Draft, PromoConfig, PromoState, PublishResult } from '../core/types';
import type { DraftFile, Snapshot, Source } from './source';

const HOUR = 3600000;

function demoConfig(): PromoConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  c.mode = 'review';
  c.brand = {
    name: '단백한끼',
    handle: '@danbaek.meal',
    colors: { background: '#FFF8F0', text: '#1F1A17', accent: '#FF6B35' },
    disclosure: null,
    links: [{ label: '구독 신청', url: 'https://example.com/subscribe' }],
  };
  c.schedule.slots = [{ days: ['mon', 'wed', 'fri'], time: '09:00' }];
  c.content.pillars = ['직장인 점심 식단 팁', '단백질·영양 상식', '구독 고객 후기와 활용법', '신메뉴·이벤트 소식'];
  c.content.topics = ['편의점으로 단백질 30g 채우기'];
  c.content.bannedWords = ['최고', '1위', '완벽', '무조건', '완치'];
  c.content.hashtags = { fixed: ['#단백한끼'], max: 8 };
  c.platforms.threads.enabled = true;
  c.platforms.instagram.enabled = true;
  c.platforms.naver.enabled = true;
  return c;
}

const ok = (at: string, url: string, attempts = 1): PublishResult => ({ status: 'ok', id: 'x', url, error: null, at, attempts });

function draft(id: string, createdAt: string, patch: Partial<Draft>): Draft {
  return {
    id,
    slotKey: id.endsWith('now') ? null : `${id.slice(0, 10)}@${id.slice(11, 13)}:${id.slice(13, 15)}`,
    status: 'draft',
    createdAt,
    plan: { topic: '', angle: '', pillar: '', keywords: [] },
    references: [],
    issues: [],
    images: [],
    imagesFor: '',
    results: {},
    content: { blog: null, instagram: null, threads: null },
    ...patch,
  };
}

function demoDrafts(now: Date): Draft[] {
  const today = localParts(now, 'Asia/Seoul').date;
  const iso = (daysAgo: number, h = 0) => new Date(now.getTime() - daysAgo * 24 * HOUR - h * HOUR).toISOString();
  const id = (daysAgo: number) => `${addDays(today, -daysAgo)}-0900`;

  return [
    draft(id(0), iso(0, 1), {
      status: 'draft',
      plan: { topic: '편의점으로 단백질 30g 채우는 조합 4가지', angle: '야근 날 현실 대안', pillar: '직장인 점심 식단 팁', keywords: ['편의점 단백질', '직장인 점심', '고단백'] },
      references: [
        { title: '편의점 고단백 조합 총정리', url: 'https://blog.naver.com/example/1', note: '가격·단백질 g을 표로 비교, 마지막에 저장 유도' },
        { title: '야근러 식단 카드뉴스', url: 'https://www.instagram.com/p/example', note: '표지에 숫자, 카드 1장에 조합 1개' },
      ],
      issues: [
        { severity: 'warn', platform: 'instagram', message: '카드 3 제목이 길어요 (42자, 권장 40자 이하)' },
        { severity: 'error', platform: 'all', message: '"닭가슴살 소시지 단백질 15g"의 출처를 확인해 주세요' },
      ],
      content: {
        blog: {
          title: '편의점으로 단백질 30g 채우기, 야근 날 현실 조합 4가지',
          tags: ['편의점단백질', '직장인점심', '고단백간식', '야근식단'],
          body: '야근이 잡힌 날, 도시락을 못 챙겼다면 편의점이 답이 될 수 있어요.\n\n## 왜 30g일까\n한 끼에 단백질을 고르게 나눠 먹으면 오후 집중이 덜 무너져요.\n\n## 조합 1. 구운 계란 2개 + 두유\n가장 쉬운 조합이에요. 계란 2개(12g)에 두유 한 팩(8g)이면 20g.\n\n{{image:2}}\n\n## 조합 2. 닭가슴살 소시지 + 그릭요거트\n소시지 하나에 15g 안팎이에요.\n\n## 정리\n- 계란과 두유는 어디서나 있어요\n- 요거트는 무가당으로\n\n매일 고민하기 싫다면 [단백한끼 구독](https://example.com/subscribe)도 있어요.',
        },
        instagram: {
          caption: '야근 확정된 날 저녁, 편의점에서 30g 채우는 법 🥚\n\n도시락 못 챙긴 날을 위한 현실 조합만 골랐어요.\n저장해 두고 다음 야근 때 꺼내 보세요.\n\n여러분의 편의점 단골 조합은 뭐예요?',
          hashtags: ['#단백한끼', '#편의점단백질', '#직장인점심', '#고단백간식', '#야근식단'],
          cards: [
            { title: '편의점에서\n단백질 30g 채우기', body: '야근 날 현실 조합 4가지' },
            { title: '1. 구운 계란 + 두유', body: '계란 2개 12g + 두유 8g\n어느 편의점에나 있어요' },
            { title: '2. 닭가슴살 소시지 + 그릭요거트 무가당', body: '소시지 15g 안팎 + 요거트 10g\n가장 든든한 조합' },
            { title: '저장해 두고\n다음 야근 때 쓰세요', body: '매주 새 조합은 프로필 링크에서' },
          ],
        },
        threads: {
          posts: [
            '야근 확정된 날 편의점 가면 맨날 삼각김밥 집었는데, 단백질 기준으로 다시 골라 봄',
            '1. 구운 계란 2개 + 두유 = 20g\n2. 닭가슴살 소시지 + 무가당 그릭요거트 = 25g 안팎\n3. 두부바 + 우유 = 18g',
            '정리하면 계란·두유는 어디에나 있어서 실패가 없음. 매일 고르기 귀찮으면 우리 도시락도 있어요',
          ],
        },
      },
    }),
    draft(id(2), iso(2), {
      status: 'published',
      plan: { topic: '점심 도시락 단백질 30g 맞추는 법', angle: '현실 조합', pillar: '직장인 점심 식단 팁', keywords: ['도시락 단백질'] },
      results: {
        threads: ok(iso(2), 'https://www.threads.net/@danbaek.meal/post/demo1'),
        instagram: ok(iso(2), 'https://www.instagram.com/p/demo1/'),
        naver: { status: 'manual', id: 'x', url: null, error: null, at: iso(2), attempts: 1 },
      },
      content: {
        blog: { title: '직장인 점심 단백질 30g, 도시락 하나로 채우는 법', tags: ['직장인점심', '고단백도시락'], body: '점심 먹고 2시만 되면 졸리죠.\n\n## 방법\n두부 반 모와 계란 2개면 27g이에요.\n\n{{image:2}}' },
        instagram: {
          caption: '점심 먹고 졸린 이유, 단백질일 수도 있어요',
          hashtags: ['#단백한끼', '#직장인점심'],
          cards: [
            { title: '점심 단백질 30g,\n도시락 하나로', body: '직장인 현실 조합 정리' },
            { title: '1. 두부·계란 같이', body: '두부 반 모 + 계란 2개면 27g' },
            { title: '저장해 두고\n내일 써 보세요', body: '프로필 링크에서 첫 주 50%' },
          ],
        },
        threads: { posts: ['점심 먹고 2시에 졸린 거, 탄수화물만 먹어서일 수도 있음', '두부 반 모 + 계란 2개 = 27g. 생각보다 쉬움'] },
      },
    }),
    draft(id(5), iso(5), {
      status: 'partial',
      plan: { topic: '단백질 간식 고를 때 보는 숫자 3개', angle: '성분표 읽기', pillar: '단백질·영양 상식', keywords: ['단백질 간식'] },
      results: {
        threads: ok(iso(5), 'https://www.threads.net/@danbaek.meal/post/demo2'),
        instagram: { status: 'failed', id: null, url: null, error: '권한이 없어요 — 토큰·비밀번호와 권한(scope)을 확인해 주세요', at: iso(5), attempts: 2 },
        naver: { status: 'manual', id: 'x', url: null, error: null, at: iso(5), attempts: 1 },
      },
      content: {
        blog: { title: '단백질 간식 고를 때 보는 숫자 3개', tags: ['단백질간식'], body: '성분표에서 단백질, 당류, 열량만 보면 돼요.' },
        instagram: {
          caption: '단백질 간식, 이 숫자 3개만 보세요',
          hashtags: ['#단백한끼'],
          cards: [
            { title: '단백질 간식\n고르는 숫자 3개', body: '성분표 10초 읽기' },
            { title: '1. 단백질 10g 이상', body: '한 번에 먹는 양 기준' },
          ],
        },
        threads: { posts: ['단백질 바 고를 때 성분표에서 숫자 3개만 봄'] },
      },
    }),
    draft(id(7), iso(7), {
      status: 'published',
      plan: { topic: '구독 3개월 차 고객이 바꾼 점심 루틴', angle: '고객 후기', pillar: '구독 고객 후기와 활용법', keywords: ['도시락 구독 후기'] },
      results: {
        threads: ok(iso(7), 'https://www.threads.net/@danbaek.meal/post/demo3'),
        instagram: ok(iso(7), 'https://www.instagram.com/p/demo3/'),
        naver: { status: 'manual', id: 'x', url: null, error: null, at: iso(7), attempts: 1 },
      },
      content: {
        blog: { title: '구독 3개월 차, 점심 루틴이 이렇게 바뀌었어요', tags: ['구독후기'], body: '고객 인터뷰를 정리했어요.' },
        instagram: { caption: '3개월 차 고객의 점심 루틴', hashtags: ['#단백한끼'], cards: [{ title: '구독 3개월 차\n점심 루틴', body: '고객 인터뷰' }] },
        threads: { posts: ['구독 3개월 된 고객님이 점심 루틴 바뀐 얘기 해 주심'] },
      },
    }),
  ];
}

function demoState(now: Date, drafts: Draft[]): PromoState {
  const s = emptyState();
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();
  s.lastRun = iso(0.6);
  for (const d of drafts) {
    for (const [platform, r] of Object.entries(d.results)) {
      if (r?.status === 'ok') s.posts.push({ draftId: d.id, platform: platform as 'threads', id: `${platform}-${d.id}`, url: r.url, at: r.at });
    }
    s.topics.push({ date: d.id.slice(0, 10), topic: d.plan.topic, draftId: d.id });
  }
  const actions = ['reply', 'reply', 'reply', 'hide', 'ignore', 'reply', 'escalate', 'reply', 'hide', 'reply', 'reply', 'ignore', 'reply', 'reply'] as const;
  const cats = { reply: 'praise', hide: 'spam', ignore: 'other', escalate: 'complaint' } as const;
  actions.forEach((a, i) => {
    s.comments[`instagram:demo${i}`] = { action: a, category: cats[a], at: iso(6 + i * 11) };
  });
  s.inbox = [
    {
      key: 'instagram:in1',
      platform: 'instagram',
      postUrl: 'https://www.instagram.com/p/demo1/',
      author: 'jiyoon.k',
      text: '지난주 배송이 두 번이나 늦게 왔어요. 환불 가능한가요?',
      category: 'complaint',
      suggestedReply: '불편을 드려 죄송해요. 주문하신 아이디를 DM으로 보내 주시면 바로 확인해서 안내드릴게요.',
      reason: '배송 지연과 환불 요청이라 사람이 확인해야 해요',
      at: iso(3),
    },
    {
      key: 'threads:in2',
      platform: 'threads',
      postUrl: 'https://www.threads.net/@danbaek.meal/post/demo1',
      author: 'runner_min',
      text: '신장 질환이 있는데 이 정도 단백질 먹어도 괜찮을까요?',
      category: 'sensitive',
      suggestedReply: '건강 상태에 따라 달라서 저희가 답드리기 어려워요. 담당 의사와 꼭 상의해 주세요.',
      reason: '건강 상담 질문이라 자동으로 답하지 않았어요',
      at: iso(9),
    },
    {
      key: 'instagram:in3',
      platform: 'instagram',
      postUrl: 'https://www.instagram.com/p/demo3/',
      author: 'office.lunch.lab',
      text: '사내 복지로 30인분 단체 구독 문의드려요',
      category: 'purchase',
      suggestedReply: '감사해요! 단체 구독은 프로필 링크의 문의 폼으로 남겨 주시면 담당자가 연락드릴게요.',
      reason: 'FAQ에 단체 구독 정보가 없어요',
      at: iso(20),
    },
  ];
  s.tokens = { threads: { refreshedAt: iso(50), expiresAt: new Date(now.getTime() + 57 * 24 * HOUR).toISOString() } };
  return s;
}

const DEMO_REPORT = `# 홍보 에이전트 실행 기록

- 오늘 · \`run\` · 모드 review

## 글

- 👀 편의점으로 단백질 30g 채우는 조합 4가지 — 검토 모드 — 승인하면 올라가요

## 댓글

- 답글 2 · 숨김 1 · 사람 확인 1 · 무시 0
`;

export function createDemoSource(now = new Date()): Source {
  const config = demoConfig();
  const drafts = demoDrafts(now);
  const snapshot: Snapshot = {
    config,
    configErrors: [],
    state: demoState(now, drafts),
    drafts: drafts.map((d): DraftFile => ({ path: `drafts/${d.id}.md`, sha: 'demo', draft: d, error: null })),
    report: DEMO_REPORT,
    inboxDone: [],
    hasData: true,
    loadedAt: now,
  };
  const wait = () => new Promise((r) => setTimeout(r, 350));
  return {
    kind: 'demo',
    label: '예시 데이터',
    async load() {
      return { ...snapshot, loadedAt: new Date() };
    },
    async saveDraft(file, draft) {
      await wait();
      const next = { ...file, draft: structuredClone(draft) };
      snapshot.drafts = snapshot.drafts.map((x) => (x.path === file.path ? next : x));
      return next;
    },
    async markInboxDone(keys) {
      await wait();
      snapshot.inboxDone = [...new Set([...snapshot.inboxDone, ...keys])];
    },
    async runWorkflow() {
      await wait();
    },
    links: { draft: () => null, config: () => null, actions: () => null },
  };
}
