/** Shared test data for the promo agent. */
import { DEFAULT_CONFIG } from '../../src/promo/core/config';
import type { ContentSet, Draft, PromoConfig, RemoteComment } from '../../src/promo/core/types';

export function testConfig(patch: (c: PromoConfig) => void = () => {}): PromoConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  c.brand.name = '단백한끼';
  c.brand.handle = '@danbaek.meal';
  c.brand.links = [{ label: '구독', url: 'https://danbaek.example.com/subscribe' }];
  c.content.bannedWords = ['최고', '완치'];
  c.content.hashtags = { fixed: ['#단백한끼'], max: 5 };
  c.platforms.threads.enabled = true;
  c.platforms.instagram.enabled = true;
  c.platforms.naver.enabled = true;
  patch(c);
  return c;
}

export function testContent(): ContentSet {
  return {
    blog: {
      title: '점심 단백질 30g, 도시락으로 채우는 법',
      tags: ['단백질', '#도시락', '직장인 점심'],
      body: `## 왜 점심 단백질일까\n${'점심에 단백질을 챙기면 오후가 덜 피곤합니다. '.repeat(20)}\n\n{{image:2}}\n\n## 구독 안내\nhttps://danbaek.example.com/subscribe`,
    },
    instagram: {
      caption: '점심 단백질, 이렇게 채워요 👇',
      hashtags: ['단백질', '#도시락', '#단백한끼'],
      cards: [
        { title: '점심 단백질 30g', body: '도시락 하나로 채우는 법' },
        { title: '1. 닭가슴살 말고도', body: '두부, 계란, 연어도 좋아요' },
        { title: '구독하고 받아보세요', body: '프로필 링크에서 신청' },
      ],
    },
    threads: { posts: ['점심 단백질 30g 채우는 현실적인 방법 정리해 봄', '1. 두부·계란을 같이\n2. 소스는 따로'] },
  };
}

export function testDraft(patch: Partial<Draft> = {}): Draft {
  return {
    id: '2026-10-09-0900',
    slotKey: '2026-10-09@09:00',
    status: 'draft',
    createdAt: '2026-10-09T00:00:00.000Z',
    plan: { topic: '점심 단백질 채우기', angle: '현실적인 방법', pillar: '식단 팁', keywords: ['단백질', '도시락'] },
    references: [{ title: '참고 글', url: 'https://ref.example.com/a', note: '숫자로 시작하는 후킹' }],
    issues: [],
    images: [],
    imagesFor: '',
    results: {},
    content: testContent(),
    ...patch,
  };
}

export function comment(patch: Partial<RemoteComment> = {}): RemoteComment {
  return {
    platform: 'instagram',
    id: 'c1',
    replyTo: 'c1',
    postId: 'p1',
    postUrl: 'https://www.instagram.com/p/abc/',
    postText: '점심 단백질',
    author: 'minji',
    text: '좋은 정보 감사해요!',
    at: '2026-10-09T01:00:00.000Z',
    repliedByMe: false,
    ...patch,
  };
}
