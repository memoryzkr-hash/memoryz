import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../src/agents.js';
import { Room, type RoomEvent } from '../src/orchestrator.js';
import { isPass, mightBePass, toTurns } from '../src/prompts.js';
import type { Agent, RespondArgs } from '../src/types.js';

type Script = (args: RespondArgs, call: number) => string | Promise<string>;

function fake(id: string, script: Script, ready = true): Agent & { calls: RespondArgs[] } {
  const calls: RespondArgs[] = [];
  return {
    persona: PERSONAS.find((p) => p.id === id)!,
    ready,
    model: 'fake',
    calls,
    async respond(args) {
      calls.push(args);
      const text = await script(args, calls.length);
      args.onDelta(text);
      return text;
    },
  };
}

function room(agents: Agent[]) {
  const events: RoomEvent[] = [];
  const r = new Room(agents, (e) => events.push(e));
  const idle = () =>
    new Promise<void>((resolve) => {
      const check = () => (r.busy ? setTimeout(check, 1) : resolve());
      check();
    });
  return { r, events, idle };
}

const said = (r: Room) => r.messages.filter((m) => m.author !== 'user' && m.author !== 'system');

describe('Room', () => {
  it('리드가 먼저 답하고 나머지가 보완한 뒤 리드가 최종 정리한다', async () => {
    const a = fake('claude-a', (args, n) => (args.instruction.includes('최종 결론') ? '최종안' : n === 1 ? '초안' : '[PASS]'));
    const b = fake('claude-b', (_, n) => (n === 1 ? '버그 있음' : '[PASS]'));
    const g = fake('gpt', () => '[PASS]');
    const { r, idle } = room([a, b, g]);
    r.post('로그인 기능 만들어줘');
    await idle();
    expect(said(r).map((m) => [m.author, m.text])).toEqual([
      ['claude-a', '초안'],
      ['claude-b', '버그 있음'],
      ['claude-a', '최종안'],
    ]);
    expect(said(r).at(-1)?.kind).toBe('summary');
    // 검증자가 말한 뒤 지피티와 설계자 모두 다시 기회를 받았다 (설계자: 초안, PASS, 정리)
    expect(g.calls.length).toBe(1);
    expect(a.calls.length).toBe(3);
  });

  it('혼자만 말했으면 정리하지 않는다', async () => {
    const a = fake('claude-a', () => '답');
    const b = fake('claude-b', () => '[PASS]');
    const { r, idle } = room([a, b]);
    r.post('안녕');
    await idle();
    expect(said(r).map((m) => m.text)).toEqual(['답']);
  });

  it('@멘션으로 부른 멤버가 먼저 답한다', async () => {
    const a = fake('claude-a', () => '[PASS]');
    const b = fake('claude-b', () => '[PASS]');
    const g = fake('gpt', (_, n) => (n === 1 ? '지피티 의견' : '[PASS]'));
    const { r, idle } = room([a, b, g]);
    r.post('@지피티 너 생각은?');
    await idle();
    expect(said(r)[0].author).toBe('gpt');
    expect(g.calls[0].instruction).toContain('호출');
  });

  it('발언 속 @멘션은 다음 차례를 넘긴다', async () => {
    const a = fake('claude-a', (_, n) => (n === 1 ? '@지피티 대안 있어?' : '[PASS]'));
    const b = fake('claude-b', () => '[PASS]');
    const g = fake('gpt', (_, n) => (n === 1 ? '있음' : '[PASS]'));
    const { r, idle } = room([a, b, g]);
    r.settings.summarize = false;
    r.post('질문');
    await idle();
    expect(said(r).map((m) => m.author)).toEqual(['claude-a', 'gpt']);
  });

  it('최대 발언 횟수에서 멈춘다', async () => {
    const a = fake('claude-a', (_, n) => `a${n}`);
    const b = fake('claude-b', (_, n) => `b${n}`);
    const { r, idle } = room([a, b]);
    r.settings = { maxTurns: 3, summarize: false };
    r.post('끝없이 토론해');
    await idle();
    expect(said(r).map((m) => m.text)).toEqual(['a1', 'b1', 'a2']);
  });

  it('키가 없거나 나간 멤버는 건너뛴다', async () => {
    const a = fake('claude-a', () => '답');
    const b = fake('claude-b', () => '추가');
    const g = fake('gpt', () => '안 불려야 함', false);
    const { r, idle } = room([a, b, g]);
    r.settings.summarize = false;
    r.setPresent('claude-b', false);
    r.post('질문');
    await idle();
    expect(g.calls.length).toBe(0);
    expect(b.calls.length).toBe(0);
    expect(said(r).map((m) => m.text)).toEqual(['답']);
  });

  it('오류는 시스템 메시지로 알리고 다음 멤버로 넘어간다', async () => {
    const a = fake('claude-a', () => {
      throw new Error('rate limit');
    });
    const b = fake('claude-b', (_, n) => (n === 1 ? '대신 답함' : '[PASS]'));
    const { r, idle } = room([a, b]);
    r.post('질문');
    await idle();
    expect(r.messages.some((m) => m.author === 'system' && m.text.includes('rate limit'))).toBe(true);
    expect(said(r).map((m) => m.text)).toContain('대신 답함');
  });

  it('중지하면 진행 중인 답을 끊고 끝낸다', async () => {
    const a = fake(
      'claude-a',
      (args) =>
        new Promise((_, reject) => args.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const { r, idle, events } = room([a, fake('claude-b', () => '안 불려야 함')]);
    r.post('질문');
    await new Promise((res) => setTimeout(res, 5));
    r.stop();
    await idle();
    expect(said(r)).toEqual([]);
    expect(events.at(-1)?.type).toBe('idle');
  });

  it('[PASS] 는 화면으로 흘려보내지 않는다', async () => {
    const { r, idle, events } = room([fake('claude-a', () => '답'), fake('claude-b', () => '[PASS]')]);
    r.post('질문');
    await idle();
    const deltas = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text);
    expect(deltas).toEqual(['답']);
  });
});

describe('prompts', () => {
  it('PASS 판정', () => {
    expect(isPass('[PASS]')).toBe(true);
    expect(isPass(' [pass] ')).toBe(true);
    expect(isPass('PASS할게요 말고 의견 있음')).toBe(false);
    expect(mightBePass('[PA')).toBe(true);
    expect(mightBePass('좋아요')).toBe(false);
  });

  it('대화 기록을 내 기준 user/assistant 턴으로 바꾼다', () => {
    const me = PERSONAS[1];
    const turns = toTurns(
      me,
      [
        { id: '1', author: 'user', text: '질문', ts: 0 },
        { id: '2', author: 'claude-a', text: '초안', ts: 0 },
        { id: '3', author: 'claude-b', text: '검증', ts: 0 },
      ],
      (a) => (a === 'user' ? '사용자' : '설계자'),
      '[진행자] 차례',
    );
    expect(turns).toEqual([
      { role: 'user', content: '[사용자]: 질문\n\n[설계자]: 초안' },
      { role: 'assistant', content: '검증' },
      { role: 'user', content: '[진행자] 차례' },
    ]);
  });
});
