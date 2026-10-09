/**
 * The backend used before GitHub is connected (and on the shareable claude.ai link).
 * Settings live in this browser only and nothing is posted; 글 만들기 asks Claude for real
 * when the page runs inside a Claude viewer (`sample` capability), otherwise shows an example.
 */
import { DEFAULT_CONFIG } from '../core/config';
import { checkContent, normalizeContent, allowedUrls } from '../core/rules';
import { addDays, draftIdFor, localParts } from '../core/schedule';
import { emptyState } from '../core/state';
import type { ContentSet, Draft, PromoConfig, PromoState, PublishResult } from '../core/types';
import type { AccountKey, Backend, BrandForm } from './backend';
import { BackendError } from './backend';
import { blogKindOf, platformsOf, scopedFor, withAutomation, type Accounts, type Automation, type BlogKind, type DraftFile, type Model, type UiPlatform } from './model';

const HOUR = 3600000;
const KEY = 'promo.preview.v2';

export const DEMO_BRAND_DOC = `# 단백한끼

## 무엇을 파나요
- 30대 직장인을 위한 고단백 점심 도시락 정기 구독 (주 3회 / 주 5회)
- 한 끼 단백질 30g 이상, 500kcal 안팎, 전자레인지 2분
- 첫 주 50% 할인 (2026년 12월 31일까지)

## 누구에게
- 점심을 대충 때우다 오후에 지치는 직장인

## 말투
- 친한 회사 선배처럼 담백하게, 과장 없이. 이모지는 문단마다 0~1개

## 하지 말 것
- 살이 빠진다, 병이 낫는다 같은 효능 보장
- 다른 브랜드 깎아내리기
`;

interface Saved {
  config?: PromoConfig;
  brandDoc?: string;
  accounts?: Accounts;
  drafts?: Draft[];
}

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}
function save(v: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // storage blocked: settings last for this visit only
  }
}

export function demoConfig(): PromoConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  c.mode = 'review';
  c.brand = { ...c.brand, name: '단백한끼', handle: '@danbaek.meal', links: [{ label: '구독 신청', url: 'https://example.com/subscribe' }] };
  c.content.bannedWords = ['최고', '1위', '완벽', '무조건', '완치'];
  c.content.hashtags = { fixed: ['#단백한끼'], max: 8 };
  c.platforms.threads = { ...c.platforms.threads, enabled: true, schedule: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], time: '08:00' }] };
  c.platforms.instagram = { ...c.platforms.instagram, enabled: true, schedule: [{ days: ['mon', 'wed', 'fri'], time: '19:00' }] };
  c.platforms.naver = { ...c.platforms.naver, enabled: false, schedule: [{ days: ['tue', 'thu'], time: '10:00' }] };
  return c;
}

const ok = (at: string, url: string): PublishResult => ({ status: 'ok', id: 'x', url, error: null, at, attempts: 1 });

function demoDrafts(now: Date): Draft[] {
  const today = localParts(now, 'Asia/Seoul').date;
  const iso = (d: number) => new Date(now.getTime() - d * 24 * HOUR).toISOString();
  const base = (id: string, createdAt: string, p: Partial<Draft>): Draft => ({
    id,
    platforms: [],
    slotKey: null,
    status: 'published',
    createdAt,
    plan: { topic: '', angle: '', pillar: '', keywords: [] },
    references: [],
    issues: [],
    images: [],
    imagesFor: '',
    results: {},
    content: { blog: null, instagram: null, threads: null },
    ...p,
  });
  return [
    base(`${addDays(today, -1)}-0800-threads`, iso(1), {
      platforms: ['threads'],
      plan: { topic: '야근 날 편의점에서 단백질 채우기', angle: '', pillar: '', keywords: [] },
      results: { threads: ok(iso(1), 'https://www.threads.net/@danbaek.meal/post/demo1') },
      content: { blog: null, instagram: null, threads: { posts: ['야근 확정된 날 편의점 가면 맨날 삼각김밥 집었는데, 단백질 기준으로 다시 골라 봄', '1. 구운 계란 2개 + 두유 = 20g\n2. 닭가슴살 소시지 + 무가당 그릭요거트 = 25g 안팎', '계란·두유는 어디에나 있어서 실패가 없음. 매일 고르기 귀찮으면 우리 도시락도 있어요'] } },
    }),
    base(`${addDays(today, -2)}-1900-instagram`, iso(2), {
      platforms: ['instagram'],
      plan: { topic: '점심 도시락 단백질 30g 맞추는 법', angle: '', pillar: '', keywords: [] },
      results: { instagram: ok(iso(2), 'https://www.instagram.com/p/demo1/') },
      content: {
        blog: null,
        threads: null,
        instagram: {
          caption: '점심 먹고 졸린 이유, 단백질일 수도 있어요\n\n저장해 두고 내일 점심에 써 보세요.',
          hashtags: ['#단백한끼', '#직장인점심', '#고단백'],
          cards: [
            { title: '점심 단백질 30g,\n도시락 하나로', body: '직장인 현실 조합 정리' },
            { title: '1. 두부·계란 같이', body: '두부 반 모 + 계란 2개면 27g' },
            { title: '저장해 두고\n내일 써 보세요', body: '프로필 링크에서 첫 주 50%' },
          ],
        },
      },
    }),
    base(`${addDays(today, -3)}-0800-threads`, iso(3), {
      platforms: ['threads'],
      plan: { topic: '단백질 간식 고를 때 보는 숫자 3개', angle: '', pillar: '', keywords: [] },
      results: { threads: ok(iso(3), 'https://www.threads.net/@danbaek.meal/post/demo2') },
      content: { blog: null, instagram: null, threads: { posts: ['단백질 바 고를 때 성분표에서 숫자 3개만 봄. 단백질, 당류, 열량'] } },
    }),
  ];
}

function demoState(now: Date, drafts: Draft[]): PromoState {
  const s = emptyState();
  const iso = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();
  s.lastRun = iso(0.4);
  for (const d of drafts) for (const [p, r] of Object.entries(d.results)) if (r?.status === 'ok') s.posts.push({ draftId: d.id, platform: p as 'threads', id: d.id, url: r.url, at: r.at });
  (['reply', 'reply', 'hide', 'reply', 'ignore', 'reply', 'reply'] as const).forEach((a, i) => (s.comments[`instagram:d${i}`] = { action: a, category: 'praise', at: iso(5 + i * 9) }));
  (['reply', 'reply', 'reply'] as const).forEach((a, i) => (s.comments[`threads:d${i}`] = { action: a, category: 'praise', at: iso(4 + i * 7) }));
  s.inbox = [
    { key: 'instagram:in1', platform: 'instagram', postUrl: 'https://www.instagram.com/p/demo1/', author: 'jiyoon.k', text: '지난주 배송이 두 번이나 늦게 왔어요. 환불 가능한가요?', category: 'complaint', suggestedReply: '불편을 드려 죄송해요. 주문하신 아이디를 DM으로 보내 주시면 바로 확인해서 안내드릴게요.', reason: '환불 요청이라 직접 확인이 필요해요', at: iso(3) },
    { key: 'threads:in2', platform: 'threads', postUrl: 'https://www.threads.net/@danbaek.meal/post/demo1', author: 'runner_min', text: '신장 질환이 있는데 이 정도 단백질 먹어도 괜찮을까요?', category: 'sensitive', suggestedReply: '건강 상태에 따라 달라서 저희가 답드리기 어려워요. 담당 의사와 꼭 상의해 주세요.', reason: '건강 상담 질문이라 자동으로 답하지 않았어요', at: iso(9) },
  ];
  return s;
}

// ---------------- writing with Claude ----------------

type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
};

let samplePromise: Promise<Sample | null> | null = null;
/** Claude inside a claude.ai viewer; null anywhere else (GitHub Pages, local dev). */
export function getSample(): Promise<Sample | null> {
  const w = window as unknown as { claude?: { use(name: string): Promise<unknown> } };
  samplePromise ??= w.claude?.use ? (w.claude.use('sample') as Promise<Sample | null>).catch(() => null) : Promise.resolve(null);
  return samplePromise;
}

const FORMAT: Record<UiPlatform, string> = {
  threads: `{"topic": "주제 한 줄", "posts": ["첫 글", "이어지는 글", "..."]}
- posts는 2~4개. posts[0]은 대화하듯 한두 문장의 후킹, 나머지는 번호 매긴 팁이나 이야기, 마지막은 부담 없는 브랜드 언급.
- 글마다 400자 이하. 해시태그는 쓰지 않음.`,
  instagram: `{"topic": "주제 한 줄", "caption": "캡션", "hashtags": ["#태그", "..."], "cards": [{"title": "카드 제목", "body": "카드 본문"}]}
- cards는 5~7장. 1장은 표지(제목이 후킹, 본문은 부제 한 줄), 중간은 카드 한 장에 팁 하나, 마지막은 저장·팔로우·프로필 링크 유도.
- 카드 제목 30자 이하(줄바꿈 \\n 가능), 본문 120자 이하.
- caption: 첫 줄 후킹, 짧은 문단 2~3개, 마지막에 댓글을 부르는 질문. 링크는 쓰지 말고 "프로필 링크"로 안내.
- hashtags 5~8개.`,
  blog: `{"topic": "주제 한 줄", "title": "검색 키워드가 앞에 오는 제목", "tags": ["태그", "..."], "body": "마크다운 본문", "cards": [{"title": "이미지 제목", "body": "이미지 부제"}]}
- body: 공감 도입 → ## 소제목 3~4개 → ## 정리 → 브랜드 소개와 링크 1번. 1,500~2,500자.
- cards는 3장(본문 이미지). body 안에서 이미지를 넣을 자리에 그 줄에 {{image:1}}, {{image:2}}처럼 한 줄로만 씀.
- tags는 # 없이 5~8개.`,
};

export function writePrompt(ui: UiPlatform, brandName: string, brandDoc: string, links: string, topic: string, recent: string[]): string {
  return `당신은 한국 SNS에서 반응을 잘 끌어내는 브랜드 콘텐츠 작가입니다. 아래 브랜드를 위해 ${ui === 'blog' ? '블로그 글' : ui === 'instagram' ? '인스타그램 카드뉴스와 캡션' : '쓰레드 글(타래)'}을 한 편 씁니다.

<brand name="${brandName}">
${brandDoc.slice(0, 6000)}
</brand>
<links>
${links || '(없음)'}
</links>
${topic ? `주제: ${topic}` : `주제는 직접 정하세요. 타깃이 저장하고 싶어 할 구체적인 주제로, 최근 주제와 겹치지 않게.\n최근 주제: ${recent.join(' / ') || '(없음)'}`}

지킬 것
- 정보·공감 7, 홍보 3. 브랜드 설명의 말투를 따릅니다.
- 브랜드 설명에 없는 가격·혜택·후기·수치를 지어내지 않습니다. 근거 없는 최상급, 효능 보장 표현을 쓰지 않습니다.
- 링크는 <links>에 있는 주소만 씁니다.

아래 JSON 하나로만 답하세요.
${FORMAT[ui]}`;
}

interface Written {
  topic?: string;
  posts?: string[];
  caption?: string;
  hashtags?: string[];
  cards?: { title?: string; body?: string }[];
  title?: string;
  tags?: string[];
  body?: string;
}

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const cardsOf = (v: unknown) => (Array.isArray(v) ? v.filter((c) => c && typeof c === 'object').map((c: { title?: unknown; body?: unknown }) => ({ title: String(c.title ?? ''), body: String(c.body ?? '') })) : []);

export function contentFrom(ui: UiPlatform, w: Written): ContentSet {
  if (ui === 'threads') return { blog: null, instagram: null, threads: { posts: strs(w.posts) } };
  if (ui === 'instagram') return { blog: null, threads: null, instagram: { caption: String(w.caption ?? ''), hashtags: strs(w.hashtags), cards: cardsOf(w.cards) } };
  return {
    threads: null,
    blog: { title: String(w.title ?? ''), tags: strs(w.tags), body: String(w.body ?? '') },
    instagram: { caption: '', hashtags: [], cards: cardsOf(w.cards) },
  };
}

const EXAMPLE: Record<UiPlatform, Written> = {
  threads: { topic: '회의 많은 날 점심 단백질 지키는 법', posts: ['회의가 점심까지 밀리는 날, 결국 빵 하나로 버티게 되더라', '1. 서랍에 단백질 바 하나\n2. 편의점은 계란 2개 + 두유\n3. 오후 3시 전엔 꼭 뭐라도', '이것도 귀찮은 날을 위해 도시락을 만들고 있어요. 단백한끼'] },
  instagram: {
    topic: '회의 많은 날 점심 지키기',
    caption: '회의가 점심을 먹어 버린 날 🍱\n\n빵 하나로 버티지 말고 이 세 가지만 기억해요.\n\n여러분은 바쁜 날 점심 어떻게 해요?',
    hashtags: ['#단백한끼', '#직장인점심', '#바쁜날점심'],
    cards: [
      { title: '회의 많은 날\n점심 지키는 법', body: '빵 하나로 버티지 않기' },
      { title: '1. 서랍에 단백질 바', body: '회의가 길어질 때 꺼내 먹기' },
      { title: '2. 계란 2개 + 두유', body: '편의점에서 20g 채우기' },
      { title: '저장해 두고\n바쁜 날 꺼내 보세요', body: '프로필 링크에서 첫 주 50%' },
    ],
  },
  blog: {
    topic: '회의 많은 날 점심 단백질 지키는 법',
    title: '직장인 점심 단백질, 회의 많은 날에도 지키는 3가지 방법',
    tags: ['직장인점심', '단백질', '바쁜날식단'],
    body: '회의가 점심시간까지 밀리는 날이 있죠.\n\n## 왜 점심 단백질일까\n점심을 거르면 오후 집중이 쉽게 무너져요.\n\n{{image:1}}\n\n## 방법 1. 서랍에 단백질 바\n긴 회의에 대비해 하나쯤 넣어 두세요.\n\n## 방법 2. 편의점 조합\n계란 2개와 두유면 20g이에요.\n\n{{image:2}}\n\n## 정리\n- 미리 준비하기\n- 편의점 조합 외워 두기\n\n매일 고민하기 싫다면 [단백한끼 구독](https://example.com/subscribe)도 있어요.',
    cards: [
      { title: '회의 많은 날\n점심 지키기', body: '3가지만 기억하기' },
      { title: '계란 2개 + 두유', body: '편의점 20g 조합' },
      { title: '내일부터\n해 보세요', body: '단백한끼' },
    ],
  },
};

export function createPreviewBackend(now = new Date()): Backend {
  const saved = load();
  const config = saved.config ? { ...demoConfig(), ...saved.config } : demoConfig();
  const persist = (m: Model) => save({ config: m.config, brandDoc: m.brandDoc, accounts: m.accounts, drafts: m.drafts.filter((f) => f.draft?.id.endsWith('preview')).map((f) => f.draft!) });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    kind: 'preview',
    label: '미리보기',

    async load() {
      const demo = demoDrafts(now);
      const mine = (saved.drafts ?? []).map((d): DraftFile => ({ path: `drafts/${d.id}.md`, sha: null, draft: d, error: null }));
      return {
        config,
        configErrors: [],
        brandDoc: saved.brandDoc ?? DEMO_BRAND_DOC,
        blogKind: blogKindOf(config),
        drafts: [...mine, ...demo.map((d) => ({ path: `drafts/${d.id}.md`, sha: null, draft: d, error: null }))],
        state: demoState(now, demo),
        inboxDone: [],
        accounts: saved.accounts ?? { threads: true, instagram: true, wordpress: false, claude: true },
        hasData: true,
      };
    },

    async saveAutomation(m, ui, a: Automation) {
      m.config = withAutomation(m.config, ui, m.blogKind, a);
      persist(m);
    },

    async setBlogKind(m, kind: BlogKind) {
      m.config = structuredClone(m.config);
      if (kind === 'wordpress') m.config.platforms.wordpress.url ||= 'https://blog.example.com';
      else {
        m.config.platforms.wordpress.url = '';
        m.config.platforms.naver.kind = kind;
        if (m.config.platforms.wordpress.enabled) {
          m.config.platforms.wordpress.enabled = false;
          m.config.platforms.naver.enabled = true;
        }
      }
      m.blogKind = blogKindOf(m.config);
      persist(m);
    },

    async saveBrand(m, b: BrandForm) {
      m.config = structuredClone(m.config);
      m.config.brand.name = b.name;
      m.config.brand.handle = b.handle;
      m.config.mode = b.review ? 'review' : 'auto';
      m.brandDoc = b.doc;
      persist(m);
    },

    async registerAccount(m, key: AccountKey, fields) {
      // The value is never stored here: a preview has nowhere safe to keep it.
      await wait(500);
      if (key === 'wordpress') {
        m.config = structuredClone(m.config);
        m.config.platforms.wordpress.url = fields.url.replace(/\/+$/, '');
        m.blogKind = blogKindOf(m.config);
      }
      m.accounts = { ...m.accounts, [key]: true };
      persist(m);
    },

    async generate(m, ui, topic, progress, signal) {
      const sample = await getSample();
      let w: Written;
      if (sample) {
        progress('Claude가 쓰는 중… (30초~1분)');
        const links = m.config.brand.links.map((l) => `- ${l.label}: ${l.url}`).join('\n');
        const recent = m.drafts.slice(0, 8).map((f) => f.draft?.plan.topic ?? '').filter(Boolean);
        try {
          w = await sample.json<Written>(writePrompt(ui, m.config.brand.name, m.brandDoc, links, topic, recent), {
            signal,
            cache: false,
            onText: ({ text }: { text: string }) => progress(`Claude가 쓰는 중… ${text.length.toLocaleString()}자`),
          });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'cancelled') throw new BackendError('취소했어요');
          if (code === 'not_granted' || code === 'sampling_disabled') throw new BackendError('Claude 사용을 허락해야 글을 만들 수 있어요');
          if (code === 'rate_limited') throw new BackendError('Claude 사용량이 많아요. 잠시 뒤 다시 해 주세요');
          if (code === 'invalid_json') throw new BackendError('글 형식이 어긋났어요. 다시 만들어 주세요');
          throw new BackendError('Claude가 글을 쓰지 못했어요. 다시 해 주세요');
        }
      } else {
        progress('예시 글을 불러오는 중…');
        await wait(1200);
        w = EXAMPLE[ui];
      }
      const scoped = scopedFor(m, ui);
      const content = normalizeContent(contentFrom(ui, w), scoped);
      const at = new Date();
      const draft: Draft = {
        id: `${draftIdFor(at, m.config.timeZone, null)}-${at.getSeconds()}-preview`,
        platforms: platformsOf(ui, m.blogKind),
        slotKey: null,
        status: 'draft',
        createdAt: at.toISOString(),
        plan: { topic: String(w.topic ?? topic ?? '').trim() || '새 글', angle: '', pillar: '', keywords: [] },
        references: [],
        issues: [...checkContent(content, scoped, allowedUrls(scoped, [])), ...(sample ? [] : [{ severity: 'warn' as const, platform: 'all' as const, message: '예시 글이에요. Claude 안에서 열면 실제로 새 글을 써 드려요' }])],
        images: [],
        imagesFor: '',
        results: {},
        content,
      };
      const file: DraftFile = { path: `drafts/${draft.id}.md`, sha: null, draft, error: null };
      m.drafts = [file, ...m.drafts];
      persist(m);
      return file;
    },

    async saveDraft(file, draft) {
      return { ...file, draft };
    },

    async publish(m, file, progress) {
      progress('올리는 중…');
      await wait(1500);
      const at = new Date().toISOString();
      const d = file.draft!;
      const results = Object.fromEntries(d.platforms.map((p) => [p, { status: p === 'naver' ? 'manual' : 'ok', id: 'preview', url: null, error: null, at, attempts: 1 } satisfies PublishResult]));
      const next = { ...file, draft: { ...d, status: 'published' as const, results } };
      m.drafts = m.drafts.map((x) => (x.path === file.path ? next : x));
      persist(m);
      return next;
    },

    async markInboxDone() {
      await wait(300);
    },

    runLink: () => null,
  };
}
