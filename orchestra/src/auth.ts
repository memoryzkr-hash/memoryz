import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const COOKIE = 'ai_room';
const MAX_FAILS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * ROOM_PASSWORD 로 방을 잠근다. 휴대폰 등 다른 기기에서 접속하게 열어 두면
 * 같은 네트워크의 누구나 API 키를 쓸 수 있으니 비밀번호가 필요하다.
 */
export class Gate {
  private readonly token: string | null;
  private fails = new Map<string, { count: number; since: number }>();

  constructor(password: string | undefined) {
    this.token = password ? createHash('sha256').update(`ai-room:${password}`).digest('hex') : null;
  }

  get enabled() {
    return this.token !== null;
  }

  private same(a: string, b: string) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  allowed(req: IncomingMessage): boolean {
    if (!this.token) return true;
    const cookie = req.headers.cookie ?? '';
    const value = cookie
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([k]) => k === COOKIE)?.[1];
    return Boolean(value && this.same(value, this.token));
  }

  /** 맞으면 쿠키 값, 틀리면 null. 한 IP에서 너무 많이 틀리면 'locked' */
  login(ip: string, password: string): string | null | 'locked' {
    if (!this.token) return '';
    const now = Date.now();
    const f = this.fails.get(ip);
    if (f && now - f.since > WINDOW_MS) this.fails.delete(ip);
    if ((this.fails.get(ip)?.count ?? 0) >= MAX_FAILS) return 'locked';
    const token = createHash('sha256').update(`ai-room:${password}`).digest('hex');
    if (this.same(token, this.token)) {
      this.fails.delete(ip);
      return token;
    }
    const cur = this.fails.get(ip) ?? { count: 0, since: now };
    cur.count++;
    this.fails.set(ip, cur);
    return null;
  }

  cookie(token: string, secure: boolean) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? '; Secure' : ''}`;
  }
}
