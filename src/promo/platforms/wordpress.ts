/** WordPress REST API with an application password (Users → Profile → Application Passwords). */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { RemoteComment } from '../core/types';
import { renderBlogHtml, usedImages } from './blog';
import { PlatformError, request, type Fetch } from './http';
import type { CommentQuery, Platform, PublishInput, Published } from './types';

interface Options {
  fetch?: Fetch;
  status?: 'publish' | 'draft';
  readFile?: (path: string) => Promise<Uint8Array>;
}

interface WpComment {
  id: number;
  post: number;
  parent: number;
  author: number;
  author_name: string;
  content: { rendered: string };
  date_gmt: string;
  link?: string;
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8217;|&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export function createWordPress(siteUrl: string, user: string, appPassword: string, opts: Options = {}): Platform {
  const f = opts.fetch ?? fetch;
  const read = opts.readFile ?? ((p: string) => readFile(p));
  const api = `${siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2`;
  const auth = { authorization: `Basic ${Buffer.from(`${user}:${appPassword.replace(/\s+/g, '')}`).toString('base64')}` };
  const call = <T>(path: string, o: Parameters<typeof request>[2] = {}) => request<T>(f, `${api}${path}`, { ...o, headers: { ...auth, ...o.headers } });

  let meCache: { id: number; name: string; slug: string } | null = null;
  const me = async () => (meCache ??= await call<{ id: number; name: string; slug: string }>('/users/me', { query: { context: 'edit' } }));

  async function upload(path: string): Promise<{ id: number; url: string }> {
    const bytes = await read(path);
    const name = basename(path);
    const r = await call<{ id: number; source_url: string }>('/media', {
      method: 'POST',
      body: bytes,
      headers: { 'content-type': 'image/jpeg', 'content-disposition': `attachment; filename="${name}"` },
    });
    return { id: r.id, url: r.source_url };
  }

  async function tagIds(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      const found = await call<{ id: number; name: string }[]>('/tags', { query: { search: name, per_page: 20 } });
      const exact = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exact) ids.push(exact.id);
      else {
        try {
          ids.push((await call<{ id: number }>('/tags', { method: 'POST', json: { name } })).id);
        } catch (e) {
          // "term_exists" races are fine to skip; a missing tag never blocks the post.
          if (!(e instanceof PlatformError)) throw e;
        }
      }
    }
    return ids;
  }

  return {
    id: 'wordpress',

    check: async () => (await me()).name,

    async publish({ draft, imageFiles }: PublishInput): Promise<Published> {
      const blog = draft.content.blog;
      if (!blog) throw new PlatformError('블로그에 올릴 글이 없어요', null);
      const cards = draft.content.instagram?.cards ?? [];
      // Images go to the blog's own media library so the post does not depend on another host.
      const wanted = new Set([1, ...usedImages(blog.body)].filter((n) => imageFiles[n - 1]));
      const uploaded: string[] = [];
      let featured: number | undefined;
      for (const n of [...wanted].sort((a, b) => a - b)) {
        const m = await upload(imageFiles[n - 1]);
        uploaded[n - 1] = m.url;
        if (n === 1) featured = m.id;
      }
      const res = await call<{ id: number; link: string }>('/posts', {
        method: 'POST',
        json: {
          title: blog.title,
          content: renderBlogHtml(blog, uploaded, cards),
          status: opts.status ?? 'publish',
          tags: await tagIds(blog.tags),
          featured_media: featured,
        },
      });
      return { id: String(res.id), url: res.link };
    },

    comments: {
      me: async () => (await me()).slug,

      async list(q: CommentQuery): Promise<RemoteComment[]> {
        const myId = (await me()).id;
        const items = await call<WpComment[]>('/comments', {
          query: { after: q.since.toISOString(), per_page: 100, status: 'approve', context: 'edit', orderby: 'date', order: 'asc' },
        });
        const scoped = q.scope === 'agent' ? items.filter((c) => q.agentPostIds.includes(String(c.post))) : items;
        const postIds = [...new Set(scoped.map((c) => c.post))];
        const posts = new Map<number, { title: string; link: string }>();
        if (postIds.length) {
          const found = await call<{ id: number; title: { rendered: string }; link: string }[]>('/posts', {
            query: { include: postIds.join(','), per_page: 100, _fields: 'id,title,link' },
          });
          for (const p of found) posts.set(p.id, { title: stripTags(p.title.rendered), link: p.link });
        }
        const answered = new Set(items.filter((c) => c.author === myId && c.parent).map((c) => c.parent));
        return scoped.map((c) => ({
          platform: 'wordpress' as const,
          id: String(c.id),
          replyTo: String(c.id),
          postId: String(c.post),
          postUrl: c.link ?? posts.get(c.post)?.link ?? null,
          postText: posts.get(c.post)?.title ?? '',
          author: c.author === myId ? (meCache?.slug ?? '') : c.author_name,
          text: stripTags(c.content.rendered),
          at: c.date_gmt.endsWith('Z') ? c.date_gmt : `${c.date_gmt}Z`,
          repliedByMe: answered.has(c.id),
        }));
      },

      async reply(c: RemoteComment, text: string) {
        await call('/comments', { method: 'POST', json: { post: Number(c.postId), parent: Number(c.replyTo), content: text } });
      },

      async hide(c: RemoteComment) {
        await call(`/comments/${c.id}`, { method: 'POST', json: { status: 'spam' } });
      },
    },
  };
}
