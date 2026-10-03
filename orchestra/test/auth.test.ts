import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { COOKIE, Gate } from '../src/auth.js';

const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as IncomingMessage;

describe('Gate', () => {
  it('비밀번호가 없으면 모두 통과', () => {
    expect(new Gate(undefined).allowed(req())).toBe(true);
  });

  it('맞는 비밀번호로 받은 쿠키만 통과', () => {
    const g = new Gate('secret');
    expect(g.allowed(req())).toBe(false);
    expect(g.login('1.1.1.1', 'wrong')).toBeNull();
    const token = g.login('1.1.1.1', 'secret');
    expect(typeof token).toBe('string');
    expect(g.allowed(req(`other=1; ${COOKIE}=${token}`))).toBe(true);
    expect(g.allowed(req(`${COOKIE}=${'0'.repeat(64)}`))).toBe(false);
  });

  it('한 IP에서 10번 틀리면 잠근다', () => {
    const g = new Gate('secret');
    for (let i = 0; i < 10; i++) g.login('2.2.2.2', 'x');
    expect(g.login('2.2.2.2', 'secret')).toBe('locked');
    expect(typeof g.login('3.3.3.3', 'secret')).toBe('string');
  });
});
