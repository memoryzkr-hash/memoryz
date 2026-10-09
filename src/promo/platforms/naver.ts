/**
 * Naver Blog closed its write API in May 2020 and Tistory's Open API is gone too, so this "platform"
 * prepares a paste-ready page in promo-data/exports/ and leaves the final click to a person.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeHtml, renderBlogHtml } from './blog';
import { PlatformError } from './http';
import type { Platform, PublishInput, Published } from './types';

export function exportPage(input: PublishInput): string {
  const blog = input.draft.content.blog!;
  const cards = input.draft.content.instagram?.cards ?? [];
  const body = renderBlogHtml(blog, input.images, cards);
  const tags = blog.tags.map((t) => `#${t}`).join(' ');
  const images = input.images.map((src, i) => `<li><a href="${escapeHtml(src)}">카드 ${i + 1}</a></li>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(blog.title)}</title>
<style>
body{max-width:760px;margin:24px auto;padding:0 16px;font:17px/1.8 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#222}
.how{background:#f3f6ff;border:1px solid #c9d6ff;border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.6}
.copy{border:2px dashed #999;border-radius:10px;padding:16px;margin:12px 0}
h1{font-size:26px}figure{margin:16px 0}img{max-width:100%;border-radius:8px}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer}
</style></head><body>
<div class="how"><b>올리는 방법</b> — ① 제목 복사 → 블로그 글쓰기 제목 칸에 붙여넣기 ② 본문 복사 → 본문에 붙여넣기
③ 이미지가 안 보이면 아래 카드 링크에서 내려받아 넣기 ④ 태그 붙여넣기 → 발행</div>
<p><button onclick="navigator.clipboard.writeText(document.getElementById('t').innerText)">제목 복사</button></p>
<h1 id="t">${escapeHtml(blog.title)}</h1>
<p><button onclick="copyBody()">본문 복사</button></p>
<div class="copy" id="b">${body}</div>
<p><button onclick="navigator.clipboard.writeText(document.getElementById('g').innerText)">태그 복사</button></p>
<p id="g">${escapeHtml(tags)}</p>
<ul>${images}</ul>
<script>
function copyBody(){const el=document.getElementById('b');const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');}
</script>
</body></html>
`;
}

/** GitHub renders this nicely, so a person can open it on their phone, copy and paste. */
export function exportMarkdown(input: PublishInput): string {
  const blog = input.draft.content.blog!;
  const cards = input.draft.content.instagram?.cards ?? [];
  const body = blog.body.replace(/^\{\{image:(\d+)\}\}$/gm, (_, n) => {
    const src = input.images[Number(n) - 1];
    return src ? `![${cards[Number(n) - 1]?.title ?? ''}](${src})` : '';
  });
  return [
    '> **올리는 방법** — 아래 제목과 본문을 복사해 네이버 블로그·티스토리 글쓰기에 붙여넣고, 맨 아래 태그를 태그 칸에 넣은 뒤 발행하세요.',
    '> 이미지가 안 따라오면 이미지를 길게 눌러 저장한 뒤 넣어 주세요. 같은 내용의 HTML 파일도 옆에 있어요.',
    '',
    `# ${blog.title}`,
    '',
    body,
    '',
    '---',
    '',
    `태그: ${blog.tags.map((t) => `#${t}`).join(' ')}`,
    '',
  ].join('\n');
}

export function createNaverExport(dataDir: string, linkBase: string | null): Platform {
  return {
    id: 'naver',
    check: async () => '발행본 만들기 (네이버·티스토리는 붙여넣기)',
    async publish(input: PublishInput): Promise<Published> {
      if (!input.draft.content.blog) throw new PlatformError('블로그 글이 없어요', null);
      const dir = join(dataDir, 'exports');
      await mkdir(dir, { recursive: true });
      const name = `${input.draft.id}-blog`;
      await writeFile(join(dir, `${name}.html`), exportPage(input));
      await writeFile(join(dir, `${name}.md`), exportMarkdown(input));
      return {
        id: name,
        url: linkBase ? `${linkBase}/exports/${name}.md` : `exports/${name}.md`,
        manual: true,
        note: '네이버·티스토리에 붙여넣을 발행본을 만들었어요',
      };
    },
  };
}
