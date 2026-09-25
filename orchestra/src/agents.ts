import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { toTurns } from './prompts.js';
import type { Agent, MemberConfig, Provider, RespondArgs } from './types.js';

/** 처음 방을 만들 때의 멤버: 메인·서브1은 클로드, 서브2는 지피티. 이후엔 점수에 따라 자리가 바뀐다. */
export const DEFAULT_MEMBERS: MemberConfig[] = [
  {
    id: 'claude-a',
    name: '클로드A',
    emoji: '🧠',
    color: '#f6c9a8',
    provider: 'claude',
    model: 'claude-opus-5',
    effort: 'medium',
    specialty: '설계와 구현',
    score: 35,
    present: true,
  },
  {
    id: 'claude-b',
    name: '클로드B',
    emoji: '🔍',
    color: '#b9d3f5',
    provider: 'claude',
    model: 'claude-opus-5',
    effort: 'medium',
    specialty: '코드 리뷰와 검증',
    score: 20,
    present: true,
  },
  {
    id: 'gpt',
    name: '지피티',
    emoji: '⚡',
    color: '#bfe8cc',
    provider: 'gpt',
    model: 'gpt-5',
    effort: 'medium',
    specialty: '다른 관점의 아이디어',
    score: 10,
    present: true,
  },
];

/** 화면의 모델 입력칸 추천 목록 (직접 입력도 가능) */
export const MODEL_OPTIONS: Record<Provider, string[]> = {
  claude: ['claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'],
  gpt: ['gpt-5', 'gpt-5-mini'],
};

export const DEMO = process.env.ORCHESTRA_DEMO === '1';

export function providerReady(provider: Provider): boolean {
  if (DEMO) return true;
  if (provider === 'claude')
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
  return Boolean(process.env.OPENAI_API_KEY);
}

let anthropic: Anthropic | undefined;
let openai: OpenAI | undefined;

/** 화면에서 API 키를 바꾸면 다음 호출부터 새 키를 쓴다 */
export function resetClients() {
  anthropic = undefined;
  openai = undefined;
}

// 서버 측 거절 폴백(fallbacks: "default")을 받는 모델
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);

class ClaudeAgent implements Agent {
  constructor(private readonly m: MemberConfig) {}

  async respond({ system, transcript, instruction, label, signal, onDelta }: RespondArgs): Promise<string> {
    if (!providerReady('claude')) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다');
    anthropic ??= new Anthropic();
    const stream = anthropic.beta.messages.stream(
      {
        model: this.m.model,
        max_tokens: 16000,
        system,
        messages: toTurns(this.m.id, transcript, label, instruction),
        // Haiku 4.5 는 effort 를 받지 않는다
        ...(this.m.model.startsWith('claude-haiku') ? {} : { output_config: { effort: this.m.effort } }),
        // 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도한다.
        ...(FALLBACK_MODELS.has(this.m.model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal },
    );
    stream.on('text', (delta) => onDelta(delta));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error(`응답이 거절되었습니다 (${message.stop_details?.category ?? '사유 없음'})`);
    }
    return message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

class GptAgent implements Agent {
  constructor(private readonly m: MemberConfig) {}

  async respond({ system, transcript, instruction, label, signal, onDelta }: RespondArgs): Promise<string> {
    if (!providerReady('gpt')) throw new Error('OPENAI_API_KEY 가 설정되지 않았습니다');
    openai ??= new OpenAI();
    const stream = await openai.chat.completions.create(
      {
        model: this.m.model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...toTurns(this.m.id, transcript, label, instruction)],
      },
      { signal },
    );
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
    }
    return text;
  }
}

/** API 키 없이 화면과 진행 흐름을 확인하는 데모용 멤버 (ORCHESTRA_DEMO=1) */
class DemoAgent implements Agent {
  constructor(private readonly m: MemberConfig) {}

  async respond({ transcript, instruction, peers, signal, onDelta }: RespondArgs): Promise<string> {
    const lastUser = [...transcript].reverse().find((x) => x.author === 'user');
    const since = transcript.slice(transcript.lastIndexOf(lastUser!) + 1);
    const spoke = since.some((x) => x.author === this.m.id);
    const topic = lastUser?.text.replace(/@\S+\s*/g, '') ?? '';
    let text: string;
    if (instruction.includes('최종 결론'))
      text = `"${topic}" 최종안입니다.\n- 초안 구조 유지\n- 빈 입력 예외 처리 추가 (검증 의견)\n- 프로토타입부터 작게 시작 (대안 의견)\n[평가] 채택: ${peers.join(', ') || '없음'} / 오류: 없음`;
    else if (instruction.includes('직접 호출')) text = `${this.m.name}입니다. "${topic}" 에 대한 제 답은 이렇습니다. (데모)`;
    else if (spoke && !instruction.includes('호출')) text = '[PASS]';
    else if (instruction.includes('먼저 답해'))
      text = `"${topic}" 초안이에요.\n1. 요구사항 정리\n2. 구조 설계\n3. 구현\n${peers[0] ? `@${peers[0]} 빠진 거 있나 봐줘요.` : ''}`;
    else if (!since.some((x) => x.author !== this.m.id && /예외/.test(x.text)))
      text = '2번에서 예외 처리가 빠졌어요. 입력이 비었을 때를 추가해야 합니다.';
    else text = '다른 관점: 3단계를 더 작게 쪼개서 먼저 프로토타입을 만들면 빠릅니다.';
    for (const ch of text.match(/.{1,4}/gsu) ?? []) {
      if (signal.aborted) throw new Error('aborted');
      await new Promise((r) => setTimeout(r, 25));
      onDelta(ch);
    }
    return text;
  }
}

export function makeAgent(m: MemberConfig): Agent {
  if (DEMO) return new DemoAgent(m);
  return m.provider === 'claude' ? new ClaudeAgent(m) : new GptAgent(m);
}
