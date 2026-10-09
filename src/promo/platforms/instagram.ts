/**
 * Instagram API for professional accounts. Works with Instagram Login (graph.instagram.com, the default)
 * or Facebook Login (graph.facebook.com + INSTAGRAM_USER_ID). Images must be public JPEG URLs.
 */
import type { RemoteComment } from '../core/types';
import { instagramCaption } from '../core/rules';
import { PlatformError, poll, request, type Fetch } from './http';
import type { CommentQuery, Platform, PublishInput, Published } from './types';

interface Options {
  fetch?: Fetch;
  /** graph.instagram.com (default) or graph.facebook.com */
  host?: string;
  /** Required with graph.facebook.com; looked up from /me otherwise. */
  userId?: string;
  pollMs?: number;
}

interface IgComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  hidden?: boolean;
  replies?: { data: IgComment[] };
}

export function createInstagram(token: string, opts: Options = {}): Platform {
  const f = opts.fetch ?? fetch;
  const host = opts.host ?? 'graph.instagram.com';
  const base = `https://${host}`;
  const pollMs = opts.pollMs ?? 3000;
  const get = <T>(path: string, query: Record<string, string | number> = {}) => request<T>(f, `${base}${path}`, { query: { ...query, access_token: token } });
  const post = <T>(path: string, form: Record<string, string | number | boolean | undefined>) =>
    request<T>(f, `${base}${path}`, { form: { ...form, access_token: token } });

  let account: { id: string; username: string } | null = null;
  async function me() {
    if (account) return account;
    if (opts.userId) {
      const r = await get<{ id: string; username: string }>(`/${opts.userId}`, { fields: 'id,username' });
      return (account = { id: opts.userId, username: r.username });
    }
    if (host.includes('facebook')) throw new PlatformError('graph.facebook.com을 쓰려면 INSTAGRAM_USER_ID가 필요해요', null);
    const r = await get<{ user_id?: string; id: string; username: string }>('/me', { fields: 'user_id,username' });
    return (account = { id: r.user_id ?? r.id, username: r.username });
  }

  async function waitReady(containerId: string) {
    await poll(
      async () => {
        const s = await get<{ status_code?: string; status?: string }>(`/${containerId}`, { fields: 'status_code,status' });
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new PlatformError(`인스타그램이 이미지를 처리하지 못했어요: ${s.status ?? s.status_code}`, null);
        return s.status_code === 'FINISHED' || s.status_code === undefined ? true : null;
      },
      30,
      pollMs,
      '인스타그램 게시물',
    );
  }

  return {
    id: 'instagram',

    check: async () => `@${(await me()).username}`,

    async publish({ draft, images }: PublishInput): Promise<Published> {
      const ig = draft.content.instagram;
      if (!ig) throw new PlatformError('인스타그램에 올릴 글이 없어요', null);
      const urls = images.slice(0, 10);
      if (!urls.length) throw new PlatformError('인스타그램은 이미지가 꼭 있어야 해요 (카드 이미지가 없어요)', null);
      const { id: userId } = await me();
      const caption = instagramCaption(ig.caption, ig.hashtags);

      let containerId: string;
      if (urls.length === 1) {
        containerId = (await post<{ id: string }>(`/${userId}/media`, { image_url: urls[0], caption })).id;
      } else {
        const children: string[] = [];
        for (const url of urls) children.push((await post<{ id: string }>(`/${userId}/media`, { image_url: url, is_carousel_item: true })).id);
        for (const child of children) await waitReady(child);
        containerId = (await post<{ id: string }>(`/${userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption })).id;
      }
      await waitReady(containerId);
      const { id } = await post<{ id: string }>(`/${userId}/media_publish`, { creation_id: containerId });
      let url: string | null = null;
      try {
        url = (await get<{ permalink?: string }>(`/${id}`, { fields: 'permalink' })).permalink ?? null;
      } catch {
        // The post is up; a missing link is not worth failing over.
      }
      return { id, url };
    },

    comments: {
      me: async () => (await me()).username,

      async list(q: CommentQuery): Promise<RemoteComment[]> {
        const { id: userId, username } = await me();
        const posts = new Map<string, { caption: string; url: string | null }>();
        if (q.scope === 'all') {
          const recent = await get<{ data: { id: string; caption?: string; timestamp: string; permalink?: string }[] }>(`/${userId}/media`, {
            fields: 'id,caption,timestamp,permalink',
            limit: 20,
          });
          for (const m of recent.data ?? []) if (new Date(m.timestamp) >= q.since) posts.set(m.id, { caption: m.caption ?? '', url: m.permalink ?? null });
        }
        for (const id of q.agentPostIds) {
          if (posts.has(id)) continue;
          try {
            const m = await get<{ caption?: string; permalink?: string }>(`/${id}`, { fields: 'caption,permalink' });
            posts.set(id, { caption: m.caption ?? '', url: m.permalink ?? null });
          } catch {
            // deleted post
          }
        }
        const out: RemoteComment[] = [];
        for (const [postId, info] of posts) {
          const res = await get<{ data: IgComment[] }>(`/${postId}/comments`, {
            fields: 'id,text,username,timestamp,hidden,replies{id,text,username,timestamp,hidden}',
            limit: 50,
          });
          for (const top of res.data ?? []) {
            const replies = top.replies?.data ?? [];
            const iAnswered = replies.some((r) => r.username === username);
            const lastMine = replies.filter((r) => r.username === username).map((r) => r.timestamp ?? '').sort().pop() ?? '';
            const push = (c: IgComment, replyTo: string, repliedByMe: boolean) => {
              if (c.hidden) return;
              out.push({
                platform: 'instagram',
                id: c.id,
                replyTo,
                postId,
                postUrl: info.url,
                postText: info.caption,
                author: c.username ?? '',
                text: c.text ?? '',
                at: c.timestamp ?? new Date(0).toISOString(),
                repliedByMe,
              });
            };
            push(top, top.id, iAnswered);
            // Follow-ups in the thread after my last answer still need one.
            for (const r of replies) if (r.username !== username) push(r, top.id, (r.timestamp ?? '') < lastMine);
          }
        }
        return out;
      },

      async reply(c: RemoteComment, text: string) {
        await post(`/${c.replyTo}/replies`, { message: text });
      },

      async hide(c: RemoteComment) {
        await post(`/${c.id}`, { hide: true });
      },
    },
  };
}

/** Instagram Login tokens last 60 days; refreshing (after 24 h) gives a fresh 60 days. */
export async function refreshInstagramToken(token: string, f: Fetch = fetch): Promise<{ token: string; expiresIn: number | null }> {
  const r = await request<{ access_token: string; expires_in?: number }>(f, 'https://graph.instagram.com/refresh_access_token', {
    query: { grant_type: 'ig_refresh_token', access_token: token },
  });
  return { token: r.access_token, expiresIn: r.expires_in ?? null };
}
