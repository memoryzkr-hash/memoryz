/**
 * Drafts live as editable markdown in promo-data/drafts/<id>.md (docs/promo/PLAN.md §4).
 * YAML front matter holds the metadata; each text field follows a `##### 📝 <field>` line,
 * so a person can fix wording on GitHub and flip `status: approved` to publish it.
 */
import { parse, stringify } from 'yaml';
import type { ContentSet, Draft, DraftStatus } from './types';

const FIELD = /^##### 📝 ([a-z]+(?:\.[a-z]+)+)(?: .*)?$/;
const CARD_SPLIT = '---';
const STATUSES: DraftStatus[] = ['draft', 'approved', 'skip', 'published', 'partial', 'failed'];

const LABELS: Record<string, string> = {
  'blog.title': '블로그 제목',
  'blog.tags': '블로그 태그 (쉼표로 구분)',
  'blog.body': '블로그 본문 (마크다운, {{image:N}} 줄은 카드 N번 이미지)',
  'instagram.caption': '인스타그램 캡션',
  'instagram.hashtags': '인스타그램 해시태그 (띄어쓰기로 구분)',
  'instagram.card': '카드 — --- 위는 제목, 아래는 본문',
  'threads.post': '쓰레드 글 (첫 글 다음은 이어지는 답글)',
};

const field = (key: string) => `##### 📝 ${key} · ${LABELS[key]}`;

export function serializeDraft(d: Draft): string {
  const meta = {
    id: d.id,
    status: d.status,
    platforms: d.platforms,
    slotKey: d.slotKey,
    createdAt: d.createdAt,
    plan: d.plan,
    issues: d.issues,
    images: d.images,
    imagesFor: d.imagesFor,
    results: d.results,
    references: d.references,
  };
  const out: string[] = [
    '---',
    '# status를 approved로 바꾸면 다음 실행 때 발행합니다. skip이면 버립니다. 아래 글은 고친 대로 올라갑니다.',
    stringify(meta, { lineWidth: 0 }).trim(),
    '---',
    '',
    `# ${d.plan.topic}`,
    '',
  ];
  const c = d.content;
  if (c.blog) {
    out.push('## 블로그', '', field('blog.title'), c.blog.title, '', field('blog.tags'), c.blog.tags.join(', '), '', field('blog.body'), c.blog.body, '');
  }
  if (c.instagram) {
    out.push('## 인스타그램', '', field('instagram.caption'), c.instagram.caption, '', field('instagram.hashtags'), c.instagram.hashtags.join(' '), '');
    for (const card of c.instagram.cards) out.push(field('instagram.card'), card.title, CARD_SPLIT, card.body, '');
  }
  if (c.threads) {
    out.push('## 쓰레드', '');
    for (const p of c.threads.posts) out.push(field('threads.post'), p, '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export class DraftParseError extends Error {}

export function parseDraft(text: string): Draft {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new DraftParseError('맨 위 --- 사이의 정보 부분을 찾지 못했어요');
  let meta: Record<string, unknown>;
  try {
    meta = parse(m[1]) as Record<string, unknown>;
  } catch (e) {
    throw new DraftParseError(`맨 위 정보 부분을 읽지 못했어요: ${(e as Error).message.split('\n')[0]}`);
  }
  if (!meta || typeof meta.id !== 'string') throw new DraftParseError('id가 없어요');
  const status = String(meta.status ?? '').trim() as DraftStatus;
  if (!STATUSES.includes(status)) throw new DraftParseError(`status "${String(meta.status)}"을(를) 모르겠어요 (${STATUSES.join(', ')})`);

  const fields: { key: string; lines: string[] }[] = [];
  const body = text.replace(/\r\n/g, '\n').slice(m[0].length).split('\n');
  for (const line of body) {
    const f = FIELD.exec(line);
    if (f) fields.push({ key: f[1], lines: [] });
    else if (fields.length) fields[fields.length - 1].lines.push(line);
  }
  // A section heading (## 인스타그램) ends up at the tail of the field before it; drop it.
  const value = (lines: string[]) => {
    const l = [...lines];
    while (l.length && (l[l.length - 1].trim() === '' || /^## (블로그|인스타그램|쓰레드)$/.test(l[l.length - 1]))) l.pop();
    return l.join('\n').trim();
  };
  const one = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f ? value(f.lines) : null;
  };
  const all = (key: string) => fields.filter((x) => x.key === key).map((x) => value(x.lines));

  const content: ContentSet = { blog: null, instagram: null, threads: null };
  const title = one('blog.title');
  if (title !== null) {
    content.blog = {
      title,
      tags: (one('blog.tags') ?? '').split(/[,\n]/).map((t) => t.trim()).filter(Boolean),
      body: one('blog.body') ?? '',
    };
  }
  const caption = one('instagram.caption');
  if (caption !== null) {
    content.instagram = {
      caption,
      hashtags: (one('instagram.hashtags') ?? '').split(/\s+/).filter(Boolean),
      cards: all('instagram.card')
        .filter(Boolean)
        .map((t) => {
          const lines = t.split('\n');
          // Titles may span lines, so a --- line separates them; without one the first line is the title.
          const cut = lines.findIndex((l) => l.trim() === CARD_SPLIT);
          const at = cut === -1 ? 1 : cut;
          return { title: lines.slice(0, at).join('\n').trim(), body: lines.slice(cut === -1 ? 1 : cut + 1).join('\n').trim() };
        }),
    };
  }
  const posts = all('threads.post').filter(Boolean);
  if (posts.length) content.threads = { posts };

  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const known = ['threads', 'instagram', 'wordpress', 'naver'];
  return {
    id: meta.id,
    platforms: arr<string>(meta.platforms).filter((p) => known.includes(p)) as Draft['platforms'],
    status,
    slotKey: typeof meta.slotKey === 'string' ? meta.slotKey : null,
    createdAt: String(meta.createdAt ?? ''),
    plan: (meta.plan as Draft['plan']) ?? { topic: '', angle: '', pillar: '', keywords: [] },
    issues: arr(meta.issues),
    images: arr<string>(meta.images),
    imagesFor: typeof meta.imagesFor === 'string' ? meta.imagesFor : '',
    results: (meta.results as Draft['results']) ?? {},
    references: arr(meta.references),
    content,
  };
}
