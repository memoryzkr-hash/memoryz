// 네이버 블로그 RSS를 랜딩페이지가 쓰는 글 목록으로 바꿉니다. 네트워크 없이 테스트할 수 있게 순수 함수만 둡니다.

export const BLOG_ID = 'thehanbang0157';
export const BLOG_URL = `https://blog.naver.com/${BLOG_ID}`;
export const FEED_URL = `https://rss.blog.naver.com/${BLOG_ID}.xml`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const squash = (text) => text.replace(/\s+/g, ' ').trim();
const stripTags = (html) => html.replace(/<[^>]*>/g, ' ');

// <tag>값</tag>의 내용을 꺼냅니다. CDATA 안은 글자 그대로이고, 밖은 XML 엔티티로 이스케이프되어 있습니다.
function rawField(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return { value: '', cdata: false };
  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? { value: cdata[1], cdata: true } : { value: raw, cdata: false };
}

// 제목·분류·주소처럼 글자만 담긴 값. 엔티티를 푼 뒤에는 태그를 지우지 않습니다(제목의 <, > 보존).
function textField(xml, tag) {
  const { value, cdata } = rawField(xml, tag);
  return squash(decodeEntities(cdata ? stripTags(value) : value));
}

// 본문처럼 HTML이 담긴 값을 HTML 그대로 돌려줍니다.
function htmlField(xml, tag) {
  const { value, cdata } = rawField(xml, tag);
  return cdata ? value : decodeEntities(value);
}

export function plainText(html) {
  return squash(decodeEntities(stripTags(html)));
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// 추적용 쿼리를 떼고, 이 블로그의 글 주소가 아니면 버립니다.
export function postUrl(link) {
  const match = link.trim().match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/);
  if (!match || match[1] !== BLOG_ID) return null;
  return { url: `${BLOG_URL}/${match[2]}`, logNo: match[2] };
}

function firstImage(html) {
  const match = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  const src = match ? decodeEntities(match[1]) : '';
  return /^https:\/\//.test(src) ? src : '';
}

export function parseFeed(xml, { limit = 6, excerptLength = 90 } = {}) {
  const posts = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const target = postUrl(textField(item, 'link') || textField(item, 'guid'));
    const title = textField(item, 'title');
    if (!target || !title) continue;
    const description = htmlField(item, 'description');
    const published = new Date(textField(item, 'pubDate'));
    posts.push({
      title,
      url: target.url,
      logNo: target.logNo,
      date: Number.isNaN(published.getTime()) ? null : published.toISOString(),
      category: textField(item, 'category'),
      excerpt: clip(plainText(description), excerptLength),
      image: firstImage(description),
    });
    if (posts.length === limit) break;
  }
  return posts;
}

// 글 페이지의 대표 이미지(og:image) 주소를 찾습니다.
export function ogImage(html) {
  const tag = html.match(/<meta[^>]+property\s*=\s*["']og:image["'][^>]*>/i);
  const content = tag && tag[0].match(/content\s*=\s*["']([^"']+)["']/i);
  const url = content ? decodeEntities(content[1]) : '';
  return /^https:\/\//.test(url) ? url : '';
}
