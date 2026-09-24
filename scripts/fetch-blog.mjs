// 빌드할 때 네이버 블로그 최신 글을 받아 랜딩페이지 옆에 posts.json과 썸네일을 둡니다.
// 사용: node scripts/fetch-blog.mjs [출력 폴더]   (기본값 dist/daycare)
// 블로그를 읽지 못해도 빌드는 그대로 두고, 페이지는 블로그 바로가기만 보여 줍니다.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BLOG_ID, BLOG_URL, FEED_URL, ogImage, parseFeed } from './blog-feed.mjs';

const outDir = process.argv[2] ?? 'dist/daycare';
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; thehanbang-landing/1.0)' };
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

async function get(url, extra = {}) {
  const res = await fetch(url, { headers: { ...headers, ...extra }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

// 네이버 이미지는 다른 사이트에서 바로 불러오면 막힐 수 있어서 빌드 때 받아 같이 올립니다.
// 받지 못하면 원래 주소를 남기고, 페이지는 리퍼러 없이 불러옵니다.
async function saveThumb(imageUrl, logNo) {
  try {
    const res = await get(imageUrl, { referer: 'https://blog.naver.com/' });
    const ext = IMAGE_TYPES[(res.headers.get('content-type') || '').split(';')[0].trim()];
    if (!ext) return imageUrl;
    const name = `blog/${logNo}.${ext}`;
    await writeFile(join(outDir, name), Buffer.from(await res.arrayBuffer()));
    return name;
  } catch {
    return imageUrl;
  }
}

async function main() {
  const posts = parseFeed(await (await get(FEED_URL)).text());
  await mkdir(join(outDir, 'blog'), { recursive: true });
  let saved = 0;
  const list = [];
  for (const { image, logNo, ...post } of posts) {
    let source = image;
    if (!source) {
      try {
        source = ogImage(await (await get(`https://m.blog.naver.com/${BLOG_ID}/${logNo}`)).text());
      } catch {
        source = '';
      }
    }
    const thumb = source ? await saveThumb(source, logNo) : '';
    if (thumb.startsWith('blog/')) saved++;
    list.push({ ...post, thumb });
  }
  await writeFile(join(outDir, 'posts.json'), JSON.stringify({ blog: BLOG_URL, updated: new Date().toISOString(), posts: list }, null, 2));
  console.log(`블로그 글 ${list.length}개, 썸네일 ${saved}개를 ${outDir}에 저장했습니다.`);
}

main().catch((error) => {
  console.warn(`블로그 글을 가져오지 못했습니다 (${error.message}). 페이지는 블로그 바로가기만 보여 줍니다.`);
});
