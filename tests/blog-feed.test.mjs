import { describe, expect, it } from 'vitest';
import { BLOG_URL, ogImage, parseFeed, postUrl } from '../scripts/blog-feed.mjs';

// 네이버 블로그 RSS 형식을 흉내 낸 테스트용 피드입니다. 실제 글이 아닙니다.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title><![CDATA[테스트 블로그]]></title>
<item>
<category><![CDATA[센터 소식]]></category>
<title><![CDATA[테스트 글 &amp; 첫 번째]]></title>
<link><![CDATA[https://blog.naver.com/thehanbang0157/224000000001?fromRss=true&trackingCode=rss]]></link>
<description><![CDATA[<img src="https://blogthumb.pstatic.net/test/one.jpg?type=w2" /> 첫 번째   테스트 본문입니다. <b>굵게</b>]]></description>
<pubDate>Tue, 23 Sep 2025 14:30:00 +0900</pubDate>
</item>
<item>
<title>테스트 글 &lt;두 번째&gt;</title>
<link>https://blog.naver.com/thehanbang0157/224000000002?fromRss=true&amp;trackingCode=rss</link>
<description>두 번째 본문</description>
<pubDate>not a date</pubDate>
</item>
<item>
<title><![CDATA[다른 블로그 글]]></title>
<link><![CDATA[https://blog.naver.com/someoneelse/224000000003]]></link>
<pubDate>Mon, 22 Sep 2025 09:00:00 +0900</pubDate>
</item>
</channel></rss>`;

describe('blog feed', () => {
  it('turns RSS items into landing page posts', () => {
    const [first, second] = parseFeed(FEED);
    expect(first).toEqual({
      title: '테스트 글 & 첫 번째',
      url: `${BLOG_URL}/224000000001`,
      logNo: '224000000001',
      date: '2025-09-23T05:30:00.000Z',
      category: '센터 소식',
      excerpt: '첫 번째 테스트 본문입니다. 굵게',
      image: 'https://blogthumb.pstatic.net/test/one.jpg?type=w2',
    });
    expect(second).toMatchObject({ title: '테스트 글 <두 번째>', url: `${BLOG_URL}/224000000002`, date: null, category: '', image: '' });
  });

  it('skips posts from other blogs and respects the limit', () => {
    expect(parseFeed(FEED)).toHaveLength(2);
    expect(parseFeed(FEED, { limit: 1 })).toHaveLength(1);
    expect(postUrl('https://blog.naver.com/someoneelse/1')).toBeNull();
    expect(postUrl('https://m.blog.naver.com/thehanbang0157/42')).toEqual({ url: `${BLOG_URL}/42`, logNo: '42' });
  });

  it('shortens long excerpts', () => {
    const long = FEED.replace('두 번째 본문', '가'.repeat(200));
    expect(parseFeed(long)[1].excerpt).toHaveLength(90);
    expect(parseFeed(long)[1].excerpt.endsWith('…')).toBe(true);
  });

  it('reads the share image of a post page', () => {
    expect(ogImage('<meta property="og:image" content="https://blogthumb.pstatic.net/a.jpg?type=w2&amp;x=1">')).toBe('https://blogthumb.pstatic.net/a.jpg?type=w2&x=1');
    expect(ogImage('<meta content="https://x/y.png" property="og:image">')).toBe('https://x/y.png');
    expect(ogImage('<meta property="og:title" content="제목">')).toBe('');
  });
});
