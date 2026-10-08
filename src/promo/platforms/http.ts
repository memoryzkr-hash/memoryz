/** Small fetch wrapper for the platform APIs: JSON in/out, readable errors, tokens kept out of messages. */

export type Fetch = typeof fetch;

export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Graph API error code, when there is one (190 = token expired or revoked). */
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent as application/x-www-form-urlencoded (what the Graph APIs expect). */
  form?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: Uint8Array;
  headers?: Record<string, string>;
  /** Retries on network errors and 5xx. */
  retries?: number;
}

const SECRET_PARAMS = /(access_token|client_secret|key)=[^&\s]+/gi;
export const redact = (s: string) => s.replace(SECRET_PARAMS, '$1=***');

function params(obj: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.set(k, String(v));
  return p;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const sleep = { ms: wait };

export async function request<T = any>(fetchImpl: Fetch, url: string, opts: RequestOptions = {}): Promise<T> {
  const u = new URL(url);
  if (opts.query) for (const [k, v] of params(opts.query)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = params(opts.form);
    headers['content-type'] = 'application/x-www-form-urlencoded';
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] = 'application/json';
  } else if (opts.body) {
    body = opts.body as unknown as BodyInit;
  }
  const method = opts.method ?? (body ? 'POST' : 'GET');
  const retries = opts.retries ?? (method === 'GET' ? 2 : 0);

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(u.toString(), { method, headers, body });
    } catch (e) {
      if (attempt < retries) {
        await sleep.ms(1000 * (attempt + 1));
        continue;
      }
      throw new PlatformError(`${u.host}에 연결하지 못했어요 (${redact((e as Error).message)})`, null);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (res.ok) return data as T;
    if (res.status >= 500 && attempt < retries) {
      await sleep.ms(1000 * (attempt + 1));
      continue;
    }
    const err = data?.error;
    const message =
      (typeof err === 'object' && err && (err.error_user_msg || err.message)) || // Graph API
      (typeof data?.message === 'string' && data.message) || // WordPress, GitHub
      (typeof err === 'string' && err) ||
      `HTTP ${res.status}`;
    throw new PlatformError(redact(String(message)), res.status, typeof err?.code === 'number' ? err.code : null);
  }
}

/** Polls `check` until it returns a value, up to `tries` times. */
export async function poll<T>(check: () => Promise<T | null>, tries: number, everyMs: number, what: string): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = await check();
    if (v !== null) return v;
    await sleep.ms(everyMs);
  }
  throw new PlatformError(`${what}이(가) 준비되지 않았어요 (시간 초과)`, null);
}
