import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMBERS } from '../src/agents.js';
import { Room, type RoomEvent } from '../src/orchestrator.js';
import { isPass, mightBePass, parseReview, toTurns } from '../src/prompts.js';
import { rankOf, stepScore } from '../src/ranks.js';
import type { MemberConfig, RespondArgs } from '../src/types.js';

type Script = (args: RespondArgs, call: number) => string | Promise<string>;

/** 멤버 id -> 대본. 대본이 없는 멤버는 방에 없는 것으로 친다. */
function room(scripts: Record<string, Script>, opts: { noKey?: string[] } = {}) {
  const events: RoomEvent[] = [];
  const calls: Record<string, RespondArgs[]> = {};
  const members: MemberConfig[] = DEFAULT_MEMBERS.map((m) => ({ ...m, present: m.id in scripts }));
  const r = new Room(members, {
    makeAgent: (m) => ({
      async respond(args) {
        (calls[m.id] ??= []).push(args);
        const text = await scripts[m.id](args, calls[m.id].length);
        args.onDelta(text);
        return text;
      },
    }),
    ready: (p) => !opts.noKey?.includes(p),
    emit: (e) => events.push(e),
  });
  const idle = () =>
    new Promise<void>((resolve) => {
      const check = () => (r.busy ? setTimeout(check, 1) : resolve());
      check();
    });
  const count = (id: string) => calls[id]?.length ?? 0;
  return { r, events, calls, count, idle };
}

const said = (r: Room) => r.messages.filter((m) => m.author !== 'user' && m.author !== 'system');
const system = (r: Room) => r.messages.filter((m) => m.author === 'system').map((m) => m.text);
const score = (r: Room, id: string) => r.members.find((m) => m.id === id)!.score;

describe('Room 진행', () => {
  it('처음엔 메인·서브1이 클로드, 서브2가 지피티', () => {
    const { r } = room({ 'claude-a': () => '', 'claude-b': () => '', gpt: () => '' });
    expect(r.views().map((v) => [v.id, v.position, v.rank])).toEqual([
      ['claude-a', '메인', '차장'],
      ['claude-b', '서브1', '과장'],
      ['gpt', '서브2', '대리'],
    ]);
  });

  it('메인이 먼저 답하고 서브가 보완한 뒤 메인이 최종 정리한다', async () => {
    const { r, idle, count } = room({
      'claude-a': (args, n) => (args.instruction.includes('최종 결론') ? '최종안\n[평가] 채택: 클로드B / 오류: 없음' : n === 1 ? '초안' : '[PASS]'),
      'claude-b': (_, n) => (n === 1 ? '버그 있음' : '[PASS]'),
      gpt: () => '[PASS]',
    });
    r.post('로그인 기능 만들어줘');
    await idle();
    expect(said(r).map((m) => [m.author, m.text])).toEqual([
      ['claude-a', '초안'],
      ['claude-b', '버그 있음'],
      ['claude-a', '최종안'],
    ]);
    expect(said(r).at(-1)?.kind).toBe('summary');
    expect(count('claude-a')).toBe(3); // 초안, PASS, 정리
  });

  it('혼자만 말했으면 정리하지 않는다', async () => {
    const { r, idle } = room({ 'claude-a': () => '답', 'claude-b': () => '[PASS]' });
    r.post('안녕');
    await idle();
    expect(said(r).map((m) => m.text)).toEqual(['답']);
  });

  it('@이름이나 @포지션으로 부른 멤버가 먼저 답한다', async () => {
    const { r, idle, calls } = room({
      'claude-a': () => '[PASS]',
      'claude-b': () => '[PASS]',
      gpt: (_, n) => (n === 1 ? '지피티 의견' : '[PASS]'),
    });
    r.post('@서브2 너 생각은?');
    await idle();
    expect(said(r)[0].author).toBe('gpt');
    expect(calls.gpt[0].instruction).toContain('호출');
  });

  it('직접 호출하면 그 멤버 혼자 답하고 끝난다', async () => {
    const { r, idle, count, calls } = room({
      'claude-a': () => '안 불려야 함',
      'claude-b': () => '검증 답 @클로드A 봐줘',
      gpt: () => '안 불려야 함',
    });
    r.post('이 코드 봐줘', 'claude-b');
    await idle();
    expect(said(r).map((m) => m.text)).toEqual(['검증 답 @클로드A 봐줘']);
    expect(count('claude-a') + count('gpt')).toBe(0);
    expect(r.messages[0].to).toBe('claude-b');
    expect(calls['claude-b'][0].instruction).toContain('직접 호출');
  });

  it('발언 속 @멘션은 다음 차례를 넘긴다', async () => {
    const { r, idle } = room({
      'claude-a': (_, n) => (n === 1 ? '@지피티 대안 있어?' : '[PASS]'),
      'claude-b': () => '[PASS]',
      gpt: (_, n) => (n === 1 ? '있음' : '[PASS]'),
    });
    r.settings.summarize = false;
    r.post('질문');
    await idle();
    expect(said(r).map((m) => m.author)).toEqual(['claude-a', 'gpt']);
  });

  it('최대 발언 횟수에서 멈춘다', async () => {
    const { r, idle } = room({ 'claude-a': (_, n) => `a${n}`, 'claude-b': (_, n) => `b${n}` });
    r.settings = { maxTurns: 3, summarize: false, autoRank: true };
    r.post('끝없이 토론해');
    await idle();
    expect(said(r).map((m) => m.text)).toEqual(['a1', 'b1', 'a2']);
  });

  it('키가 없거나 나간 멤버는 건너뛴다', async () => {
    const { r, idle, count } = room(
      { 'claude-a': () => '답', 'claude-b': () => '추가', gpt: () => '안 불려야 함' },
      { noKey: ['gpt'] },
    );
    r.settings.summarize = false;
    r.configure('claude-b', { present: false });
    r.post('질문');
    await idle();
    expect(count('gpt') + count('claude-b')).toBe(0);
    expect(said(r).map((m) => m.text)).toEqual(['답']);
    expect(system(r)).toContain('클로드B님이 나갔습니다.');
  });

  it('오류는 시스템 메시지로 알리고 다음 멤버로 넘어간다', async () => {
    const { r, idle } = room({
      'claude-a': () => {
        throw new Error('rate limit');
      },
      'claude-b': (_, n) => (n === 1 ? '대신 답함' : '[PASS]'),
    });
    r.post('질문');
    await idle();
    expect(system(r).some((t) => t.includes('rate limit'))).toBe(true);
    expect(said(r).map((m) => m.text)).toContain('대신 답함');
  });

  it('중지하면 진행 중인 답을 끊고 끝낸다', async () => {
    const { r, idle, events } = room({
      'claude-a': (args) =>
        new Promise((_, reject) => args.signal.addEventListener('abort', () => reject(new Error('aborted')))),
      'claude-b': () => '안 불려야 함',
    });
    r.post('질문');
    await new Promise((res) => setTimeout(res, 5));
    r.stop();
    await idle();
    expect(said(r)).toEqual([]);
    expect(events.at(-1)?.type).toBe('idle');
  });

  it('[PASS] 와 인사고과 줄은 화면으로 흘려보내지 않는다', async () => {
    const { r, idle, events } = room({
      'claude-a': (a, n) => (a.instruction.includes('최종 결론') ? '정리\n[평가] 채택: 없음 / 오류: 없음' : n === 1 ? '답' : '[PASS]'),
      'claude-b': (_, n) => (n === 1 ? '보완' : '[PASS]'),
    });
    r.post('질문');
    await idle();
    const deltas = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text);
    expect(deltas).toEqual(['답', '보완', '정리\n']);
    expect(said(r).at(-1)?.text).toBe('정리');
  });
});

describe('직급', () => {
  it('인사고과로 점수가 오르고 승진·메인 교체를 공지한다', async () => {
    const { r, idle } = room({
      'claude-a': (a, n) =>
        a.instruction.includes('최종 결론') ? '최종\n[평가] 채택: 지피티 / 오류: 클로드A' : n === 1 ? '초안' : '[PASS]',
      'claude-b': () => '[PASS]',
      gpt: (_, n) => (n === 1 ? '더 나은 방법' : '[PASS]'),
    });
    r.configure('gpt', { score: 19 });
    r.post('질문');
    await idle();
    expect(score(r, 'gpt')).toBe(21);
    expect(score(r, 'claude-a')).toBe(33);
    expect(system(r)).toContain('🎉 지피티님이 과장(으)로 승진했습니다.');
    expect(system(r).some((t) => t.startsWith('📋 인사고과'))).toBe(true);
  });

  it('토론에 참여하지 않은 멤버나 자기 자신은 채택 점수를 못 받는다', async () => {
    const { r, idle } = room({
      'claude-a': (a, n) =>
        a.instruction.includes('최종 결론') ? '최종\n[평가] 채택: 클로드A, 지피티, 클로드B / 오류: 없음' : n === 1 ? '초안' : '[PASS]',
      'claude-b': (_, n) => (n === 1 ? '검증' : '[PASS]'),
      gpt: () => '[PASS]',
    });
    r.post('질문');
    await idle();
    expect([score(r, 'claude-a'), score(r, 'claude-b'), score(r, 'gpt')]).toEqual([35, 22, 10]);
  });

  it('공감 👍/👎 은 점수에 반영되고 취소하면 되돌린다', async () => {
    const { r, idle } = room({ 'claude-a': () => '답', 'claude-b': () => '[PASS]' });
    r.post('질문');
    await idle();
    const id = said(r)[0].id;
    r.react(id, 'up');
    expect(score(r, 'claude-a')).toBe(38);
    r.react(id, 'down');
    expect(score(r, 'claude-a')).toBe(32);
    r.react(id, null);
    expect(score(r, 'claude-a')).toBe(35);
  });

  it('점수가 역전되면 메인이 바뀌고 차례도 바뀐다', async () => {
    const { r, idle } = room({ 'claude-a': () => '[PASS]', 'claude-b': () => '[PASS]', gpt: () => '지피티 답' });
    r.configure('gpt', { score: 60 });
    expect(r.views()[0]).toMatchObject({ id: 'gpt', position: '메인', rank: '부장' });
    expect(system(r)).toContain('👑 지피티님이 새 메인이 되었습니다.');
    r.post('질문');
    await idle();
    expect(said(r)[0].author).toBe('gpt');
  });

  it('자동 평가를 끄면 점수가 변하지 않는다', async () => {
    const { r, idle } = room({ 'claude-a': () => '답', 'claude-b': () => '[PASS]' });
    r.settings.autoRank = false;
    r.post('질문');
    await idle();
    r.react(said(r)[0].id, 'up');
    expect(score(r, 'claude-a')).toBe(35);
  });

  it('직급 표', () => {
    expect([rankOf(-1), rankOf(0), rankOf(10), rankOf(20), rankOf(35), rankOf(50), rankOf(70)]).toEqual([
      '인턴', '사원', '대리', '과장', '차장', '부장', '이사',
    ]);
    expect(stepScore(25, 1)).toBe(35);
    expect(stepScore(25, -1)).toBe(10);
    expect(stepScore(80, 1)).toBe(70);
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

  it('인사고과 줄 파싱', () => {
    expect(parseReview('결론\n[평가] 채택: 지피티, 클로드B / 오류: 없음')).toEqual({
      text: '결론',
      adopted: '지피티, 클로드B',
      mistakes: '없음',
    });
    expect(parseReview('결론만')).toBeNull();
  });

  it('대화 기록을 내 기준 user/assistant 턴으로 바꾼다', () => {
    const turns = toTurns(
      'claude-b',
      [
        { id: '1', author: 'user', text: '질문', ts: 0 },
        { id: '2', author: 'claude-a', text: '초안', ts: 0 },
        { id: '3', author: 'claude-b', text: '검증', ts: 0 },
        { id: '4', author: 'user', text: '너만', ts: 0, to: 'claude-b' },
      ],
      (m) => (m.to ? '사용자 → 클로드B' : m.author === 'user' ? '사용자' : '클로드A'),
      '[진행자] 차례',
    );
    expect(turns).toEqual([
      { role: 'user', content: '[사용자]: 질문\n\n[클로드A]: 초안' },
      { role: 'assistant', content: '검증' },
      { role: 'user', content: '[사용자 → 클로드B]: 너만\n\n[진행자] 차례' },
    ]);
  });
});
