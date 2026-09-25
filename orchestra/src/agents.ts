import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { toTurns } from './prompts.js';
import type { Agent, Persona, RespondArgs } from './types.js';

export const PERSONAS: Persona[] = [
  {
    id: 'claude-a',
    name: '클로드 설계자',
    emoji: '🧠',
    role: '리드. 사용자의 요청에 가장 먼저 답하고, 전체 방향·설계·구현 초안을 잡습니다. 토론이 끝나면 최종 정리를 맡습니다.',
    aliases: ['설계자', '클로드A', 'claudeA', 'claude-a'],
    color: '#f3d9c4',
  },
  {
    id: 'claude-b',
    name: '클로드 검증자',
    emoji: '🔍',
    role: '검토자. 다른 멤버의 답을 꼼꼼히 검증해 버그, 빠진 요구사항, 엣지 케이스, 보안·성능 문제를 찾아 구체적인 수정안을 냅니다.',
    aliases: ['검증자', '클로드B', 'claudeB', 'claude-b'],
    color: '#d9e4f7',
  },
  {
    id: 'gpt',
    name: '지피티',
    emoji: '⚡',
    role: '외부 시각. 클로드들과 다른 관점에서 대안적 접근, 반론, 실무 팁, 더 단순한 방법을 제시합니다. 동의만 할 거면 PASS 합니다.',
    aliases: ['지피티', 'gpt', 'GPT', 'chatgpt'],
    color: '#d6f0de',
  },
];

const byId = (id: string) => PERSONAS.find((p) => p.id === id)!;

export interface AgentOptions {
  nameOf: (author: string) => string;
}

class ClaudeAgent implements Agent {
  private client?: Anthropic;
  readonly ready: boolean;
  constructor(
    readonly persona: Persona,
    readonly model: string,
    private readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    private readonly opts: AgentOptions,
  ) {
    // SDK는 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` 프로필을 순서대로 찾는다.
    this.ready = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
    if (this.ready) this.client = new Anthropic();
  }

  async respond({ system, transcript, instruction, signal, onDelta }: RespondArgs): Promise<string> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다');
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 16000,
        system,
        messages: toTurns(this.persona, transcript, this.opts.nameOf, instruction),
        output_config: { effort: this.effort },
        // 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도한다.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
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
  private client?: OpenAI;
  readonly ready: boolean;
  constructor(
    readonly persona: Persona,
    readonly model: string,
    private readonly opts: AgentOptions,
  ) {
    this.ready = Boolean(process.env.OPENAI_API_KEY);
    if (this.ready) this.client = new OpenAI();
  }

  async respond({ system, transcript, instruction, signal, onDelta }: RespondArgs): Promise<string> {
    if (!this.client) throw new Error('OPENAI_API_KEY 가 설정되지 않았습니다');
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        messages: [
          { role: 'system', content: system },
          ...toTurns(this.persona, transcript, this.opts.nameOf, instruction),
        ],
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
  readonly ready = true;
  readonly model = 'demo';
  constructor(readonly persona: Persona) {}

  async respond({ transcript, instruction, signal, onDelta }: RespondArgs): Promise<string> {
    const lastUser = [...transcript].reverse().find((m) => m.author === 'user');
    const since = transcript.slice(transcript.lastIndexOf(lastUser!) + 1);
    const spoke = since.some((m) => m.author === this.persona.id);
    let text: string;
    if (instruction.includes('최종 결론')) text = `정리하면: "${lastUser?.text}" 에 대해 설계안 + 검증 의견 + 대안을 모두 반영했습니다. (데모)`;
    else if (spoke && !instruction.includes('호출')) text = '[PASS]';
    else if (this.persona.id === 'claude-a') text = `초안입니다: "${lastUser?.text}" 를 이렇게 풀어보죠.\n1. 요구사항 정리\n2. 구조 설계\n3. 구현\n@검증자 빠진 거 있나 봐줘요.`;
    else if (this.persona.id === 'claude-b') text = '설계자님 2번에서 예외 처리가 빠졌어요. 입력이 비었을 때를 추가해야 합니다.';
    else text = '다른 관점: 3단계를 더 작게 쪼개서 먼저 프로토타입을 만들면 빠릅니다.';
    for (const ch of text.match(/.{1,4}/gsu) ?? []) {
      if (signal.aborted) throw new Error('aborted');
      await new Promise((r) => setTimeout(r, 25));
      onDelta(ch);
    }
    return text;
  }
}

export function createAgents(opts: AgentOptions): Agent[] {
  if (process.env.ORCHESTRA_DEMO === '1') return PERSONAS.map((p) => new DemoAgent(p));
  const effort = (process.env.CLAUDE_EFFORT ?? 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  return [
    new ClaudeAgent(byId('claude-a'), process.env.CLAUDE_A_MODEL ?? 'claude-opus-5', effort, opts),
    new ClaudeAgent(byId('claude-b'), process.env.CLAUDE_B_MODEL ?? 'claude-opus-5', effort, opts),
    new GptAgent(byId('gpt'), process.env.OPENAI_MODEL ?? 'gpt-5', opts),
  ];
}
