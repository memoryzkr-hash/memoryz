import { instructionFor, isPass, mightBePass, systemPrompt } from './prompts.js';
import type { Agent, ChatMessage, Persona } from './types.js';

export type RoomEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'typing'; author: string; messageId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'done'; message: ChatMessage }
  | { type: 'pass'; author: string; messageId: string }
  | { type: 'idle' }
  | { type: 'members' };

export interface RoomSettings {
  /** 사용자 메시지 하나에 대해 AI들이 말할 수 있는 최대 횟수 */
  maxTurns: number;
  /** 두 명 이상이 의견을 내면 리드가 최종 정리 */
  summarize: boolean;
}

type Kind = 'first' | 'follow' | 'mentioned' | 'summary';

/**
 * 단톡방 진행자.
 *
 * 사용자가 말하면 리드(또는 @로 부른 멤버)가 먼저 답하고, 나머지 멤버가 차례로
 * 보완한다. 누군가 새로 말하면 모두 다시 발언 기회를 얻고, 전원이 [PASS] 하면
 * 토론이 끝난다. 발언 안의 @멘션은 다음 차례를 그 멤버에게 넘긴다.
 */
export class Room {
  messages: ChatMessage[] = [];
  settings: RoomSettings = { maxTurns: 8, summarize: true };
  /** 방에 들어와 있는 멤버 id */
  present = new Set<string>();

  private queue: { id: string; kind: Kind }[] = [];
  private passed = new Set<string>();
  private turnsLeft = 0;
  private lastSpeaker: string | null = null;
  private contributors = new Set<string>();
  private running = false;
  private abort: AbortController | null = null;
  private seq = 0;

  constructor(
    readonly agents: Agent[],
    private readonly emit: (e: RoomEvent) => void,
    private readonly onChange: () => void = () => {},
  ) {
    for (const a of agents) if (a.ready) this.present.add(a.persona.id);
  }

  get busy() {
    return this.running;
  }

  personas(): Persona[] {
    return this.agents.map((a) => a.persona);
  }

  nameOf = (author: string): string => {
    if (author === 'user') return '사용자';
    if (author === 'system') return '시스템';
    return this.agents.find((a) => a.persona.id === author)?.persona.name ?? author;
  };

  private active(): Agent[] {
    return this.agents.filter((a) => a.ready && this.present.has(a.persona.id));
  }

  private newId() {
    return `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
  }

  private add(author: string, text: string, kind?: ChatMessage['kind']): ChatMessage {
    const message: ChatMessage = { id: this.newId(), author, text, ts: Date.now(), ...(kind ? { kind } : {}) };
    this.messages.push(message);
    this.emit({ type: 'message', message });
    this.onChange();
    return message;
  }

  /** 글 안의 @멘션을 멤버 id 목록으로 */
  mentions(text: string, exclude?: string): string[] {
    const found: string[] = [];
    const lower = text.toLowerCase();
    const everyone = /@(모두|전원|all|everyone)\b/i.test(text);
    for (const a of this.active()) {
      const id = a.persona.id;
      if (id === exclude) continue;
      if (everyone || a.persona.aliases.some((al) => lower.includes(`@${al.toLowerCase()}`))) found.push(id);
    }
    return found;
  }

  setPresent(id: string, present: boolean) {
    const agent = this.agents.find((a) => a.persona.id === id);
    if (!agent || this.present.has(id) === present) return;
    if (present) this.present.add(id);
    else this.present.delete(id);
    this.add('system', `${agent.persona.emoji} ${agent.persona.name}님이 ${present ? '들어왔습니다' : '나갔습니다'}.`);
    this.emit({ type: 'members' });
  }

  post(text: string) {
    this.add('user', text);
    this.passed.clear();
    this.contributors.clear();
    this.turnsLeft = this.settings.maxTurns;
    const called = this.mentions(text);
    this.queue = called.length
      ? called.map((id) => ({ id, kind: 'mentioned' as const }))
      : this.active().slice(0, 1).map((a) => ({ id: a.persona.id, kind: 'first' as const }));
    if (!this.running) void this.loop();
  }

  stop() {
    this.queue = [];
    this.turnsLeft = 0;
    this.abort?.abort();
  }

  reset() {
    this.stop();
    this.messages = [];
    this.lastSpeaker = null;
    this.onChange();
  }

  /** 다음 발언자: 직전 발언자 다음 순서부터, 이번 라운드에 아직 PASS 안 한 멤버 */
  private pickNext(): { id: string; kind: Kind } | null {
    while (this.queue.length) {
      const next = this.queue.shift()!;
      if (this.active().some((a) => a.persona.id === next.id)) return next;
    }
    const order = this.active().map((a) => a.persona.id);
    if (!order.length) return null;
    const start = this.lastSpeaker ? order.indexOf(this.lastSpeaker) + 1 : 0;
    for (let i = 0; i < order.length; i++) {
      const id = order[(start + i) % order.length];
      if (id !== this.lastSpeaker && !this.passed.has(id)) return { id, kind: 'follow' };
    }
    return null;
  }

  private async loop() {
    this.running = true;
    try {
      let summarized = false;
      while (true) {
        const next = this.turnsLeft > 0 ? this.pickNext() : null;
        if (next) {
          this.turnsLeft--;
          await this.speak(next.id, next.kind);
          continue;
        }
        // 토론 종료: 여러 멤버가 의견을 냈으면 리드가 정리
        const lead = this.active()[0];
        const aborted = this.abort?.signal.aborted;
        if (!summarized && !aborted && lead && this.settings.summarize && this.contributors.size >= 2) {
          summarized = true;
          await this.speak(lead.persona.id, 'summary');
          continue;
        }
        break;
      }
    } finally {
      this.running = false;
      this.abort = null;
      this.emit({ type: 'idle' });
    }
  }

  private async speak(id: string, kind: Kind) {
    const agent = this.agents.find((a) => a.persona.id === id)!;
    const messageId = this.newId();
    this.abort = new AbortController();
    this.emit({ type: 'typing', author: id, messageId });

    let text = '';
    let shown = 0;
    const onDelta = (delta: string) => {
      text += delta;
      // [PASS] 일 수도 있는 동안은 화면에 내보내지 않는다
      if (kind !== 'summary' && mightBePass(text)) return;
      this.emit({ type: 'delta', messageId, text: text.slice(shown) });
      shown = text.length;
    };

    try {
      const reply = await agent.respond({
        system: systemPrompt(agent.persona, this.active().map((a) => a.persona)),
        transcript: this.messages,
        instruction: instructionFor(agent.persona, kind),
        signal: this.abort.signal,
        onDelta,
      });
      text = reply || text;
    } catch (err) {
      if (this.abort.signal.aborted) {
        if (text.trim() && !isPass(text)) this.finish(messageId, id, `${text}\n\n_(중단됨)_`);
        else this.emit({ type: 'pass', author: id, messageId });
        return;
      }
      this.emit({ type: 'pass', author: id, messageId });
      this.add('system', `⚠️ ${agent.persona.name} 오류: ${(err as Error).message}`);
      this.passed.add(id);
      return;
    }

    if (kind !== 'summary' && isPass(text)) {
      this.passed.add(id);
      this.emit({ type: 'pass', author: id, messageId });
      return;
    }

    this.finish(messageId, id, text.trim(), kind === 'summary' ? 'summary' : undefined);
    if (kind === 'summary') return;
    // 새 발언이 나왔으니 모두에게 다시 기회를 준다
    this.passed.clear();
    this.passed.add(id);
    this.lastSpeaker = id;
    this.contributors.add(id);
    for (const called of this.mentions(text, id)) {
      if (!this.queue.some((q) => q.id === called)) this.queue.push({ id: called, kind: 'mentioned' });
    }
  }

  private finish(messageId: string, author: string, text: string, kind?: ChatMessage['kind']) {
    const message: ChatMessage = { id: messageId, author, text, ts: Date.now(), ...(kind ? { kind } : {}) };
    this.messages.push(message);
    this.emit({ type: 'done', message });
    this.onChange();
  }
}
