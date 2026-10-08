/**
 * Threads API (graph.threads.net). Publishing is two steps: create a container, then publish it.
 * Extra posts are chained as replies to the previous one so they read as one thread.
 */
import type { RemoteComment } from '../core/types';
import { PlatformError, poll, request, type Fetch } from './http';
import type { CommentQuery, Platform, PublishInput, Published } from './types';

export const THREADS_API = 'https://graph.threads.net/v1.0';

interface Conversation {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  hide_status?: string;
  replied_to?: { id: string };
}

export function createThreads(token: string, opts: { fetch?: Fetch; attachImage?: boolean; pollMs?: number } = {}): Platform {
  const f = opts.fetch ?? fetch;
  const pollMs = opts.pollMs ?? 3000;
  const get = <T>(path: string, query: Record<string, string | number> = {}) => request<T>(f, `${THREADS_API}${path}`, { query: { ...query, access_token: token } });
  const post = <T>(path: string, form: Record<string, string | number | boolean | undefined>) =>
    request<T>(f, `${THREADS_API}${path}`, { form: { ...form, access_token: token } });

  let meCache: { id: string; username: string } | null = null;
  const me = async () => (meCache ??= await get<{ id: string; username: string }>('/me', { fields: 'id,username' }));

  /** Creates, waits for and publishes one container; returns the media id. */
  async function publishOne(form: Record<string, string | undefined>): Promise<string> {
    const { id: creationId } = await post<{ id: string }>('/me/threads', form);
    await poll(
      async () => {
        const s = await get<{ status?: string; error_message?: string }>(`/${creationId}`, { fields: 'status,error_message' });
        if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new PlatformError(`쓰레드가 글을 거부했어요: ${s.error_message ?? s.status}`, null);
        return s.status === 'FINISHED' || s.status === undefined ? true : null;
      },
      20,
      pollMs,
      '쓰레드 글',
    );
    const { id } = await post<{ id: string }>('/me/threads_publish', { creation_id: creationId });
    return id;
  }

  async function permalink(id: string): Promise<string | null> {
    try {
      return (await get<{ permalink?: string }>(`/${id}`, { fields: 'permalink' })).permalink ?? null;
    } catch {
      return null;
    }
  }

  return {
    id: 'threads',

    check: async () => `@${(await me()).username}`,

    async publish({ draft, images }: PublishInput): Promise<Published> {
      const posts = draft.content.threads?.posts ?? [];
      if (!posts.length) throw new PlatformError('쓰레드에 올릴 글이 없어요', null);
      const image = opts.attachImage ? images[0] : undefined;
      const rootId = await publishOne(image ? { media_type: 'IMAGE', image_url: image, text: posts[0] } : { media_type: 'TEXT', text: posts[0] });
      let parent = rootId;
      for (const text of posts.slice(1)) parent = await publishOne({ media_type: 'TEXT', text, reply_to_id: parent });
      return { id: rootId, url: await permalink(rootId) };
    },

    comments: {
      me: async () => (await me()).username,

      async list(q: CommentQuery): Promise<RemoteComment[]> {
        const myName = (await me()).username;
        const posts = new Map<string, { text: string; url: string | null }>();
        for (const id of q.agentPostIds) posts.set(id, { text: '', url: null });
        if (q.scope === 'all') {
          const recent = await get<{ data: { id: string; text?: string; timestamp: string; permalink?: string }[] }>('/me/threads', {
            fields: 'id,text,timestamp,permalink',
            limit: 25,
          });
          for (const p of recent.data ?? []) {
            if (new Date(p.timestamp) >= q.since) posts.set(p.id, { text: p.text ?? '', url: p.permalink ?? null });
          }
        }
        const out: RemoteComment[] = [];
        for (const [postId, info] of posts) {
          let items: Conversation[] = [];
          try {
            const res = await get<{ data: Conversation[] }>(`/${postId}/conversation`, {
              fields: 'id,text,username,timestamp,hide_status,replied_to',
              reverse: 'false',
              limit: 100,
            });
            items = res.data ?? [];
          } catch (e) {
            if (e instanceof PlatformError && e.status === 400) continue; // deleted post
            throw e;
          }
          const answered = new Set(items.filter((c) => c.username === myName && c.replied_to).map((c) => c.replied_to!.id));
          const postText = info.text || (await get<{ text?: string }>(`/${postId}`, { fields: 'text' }).catch(() => ({ text: '' }))).text || '';
          for (const c of items) {
            if (c.hide_status === 'HIDDEN' || c.hide_status === 'COVERED') continue;
            out.push({
              platform: 'threads',
              id: c.id,
              replyTo: c.id,
              postId,
              postUrl: info.url,
              postText,
              author: c.username ?? '',
              text: c.text ?? '',
              at: c.timestamp ?? new Date(0).toISOString(),
              repliedByMe: answered.has(c.id),
            });
          }
        }
        return out;
      },

      async reply(c: RemoteComment, text: string) {
        await publishOne({ media_type: 'TEXT', text, reply_to_id: c.replyTo });
      },

      async hide(c: RemoteComment) {
        await post(`/${c.id}/manage_reply`, { hide: true });
      },
    },
  };
}

/** Long-lived Threads tokens last 60 days; refreshing (after 24 h) gives a fresh 60 days. */
export async function refreshThreadsToken(token: string, f: Fetch = fetch): Promise<{ token: string; expiresIn: number | null }> {
  const r = await request<{ access_token: string; expires_in?: number }>(f, 'https://graph.threads.net/refresh_access_token', {
    query: { grant_type: 'th_refresh_token', access_token: token },
  });
  return { token: r.access_token, expiresIn: r.expires_in ?? null };
}
