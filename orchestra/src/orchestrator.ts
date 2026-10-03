import { instructionFor, isPass, mightBePass, parseReview, systemPrompt, type Kind } from './prompts.js';
import { POINTS, byPosition, positionTitle, rankIndex, rankOf } from './ranks.js';
import type { Agent, ChatMessage, MemberConfig, MemberView, Provider } from './types.js';

export type RoomEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'typing'; author: string; messageId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'done'; message: ChatMessage }
  | { type: 'pass'; author: string; messageId: string }
  | { type: 'update'; message: ChatMessage }
  | { type: 'idle' }
  | { type: 'members' };

export interface RoomSettings {
  /** 사용자 메시지 하나에 대해 AI들이 말할 수 있는 최대 횟수 */
  maxTurns: number;
  /** 두 명 이상이 의견을 내면 메인이 최종 정리 */
  summarize: boolean;
  /** 공감과 인사고과로 점수가 자동으로 오르내림 */
  autoRank: boolean;
}

export interface RoomDeps {
  makeAgent: (m: MemberConfig) => Agent;
  ready: (provider: Provider) => boolean;
  emit: (e: RoomEvent) => void;
  onChange?: () => void;
}

const EDITABLE = ['name', 'emoji', 'color', 'provider', 'model', 'effort', 'specialty', 'score', 'present'] as const;

/**
 * 단톡방 진행자.
 *
 * 사용자가 말하면 메인(또는 @로 부른 멤버)이 먼저 답하고, 서브들이 차례로
 * 보완한다. 누군가 새로 말하면 모두 다시 발언 기회를 얻고, 전원이 [PASS] 하면
 * 토론이 끝나고 메인이 최종 정리와 인사고과를 남긴다. 직접 호출한 메시지는
 * 그 멤버 혼자 답한다. 점수가 바뀌면 직급과 메인/서브 자리도 바뀐다.
 */
export class Room {
  messages: ChatMessage[] = [];
  settings: RoomSettings = { maxTurns: 8, summarize: true, autoRank: true };

  private queue: { id: string; kind: Kind }[] = [];
  private passed = new Set<string>();
  private turnsLeft = 0;
  private solo = false;
  private lastSpeaker: string | null = null;
  private contributors = new Set<string>();
  private running = false;
  private abort: AbortController | null = null;
  private seq = 0;

  constructor(
    public members: MemberConfig[],
    private readonly deps: RoomDeps,
  ) {}

  get busy() {
    return this.running;
  }

  /** 포지션 순서(점수 높은 순)로 정렬한 멤버와 계산된 직급 */
  views(): MemberView[] {
    return byPosition(this.members).map((m, i) => ({
      ...m,
      rank: rankOf(m.score),
      position: positionTitle(i),
      ready: this.deps.ready(m.provider),
    }));
  }

  private view(id: string): MemberView | undefined {
    return this.views().find((m) => m.id === id);
  }

  /** 지금 말할 수 있는 멤버 (포지션 순) */
  private active(): MemberView[] {
    return this.views().filter((m) => m.ready && m.present);
  }

  nameOf = (author: string): string => {
    if (author === 'user') return '사용자';
    if (author === 'system') return '시스템';
    return this.members.find((m) => m.id === author)?.name ?? author;
  };

  label = (m: ChatMessage): string => (m.to ? `사용자 → ${this.nameOf(m.to)}` : this.nameOf(m.author));

  private newId() {
    return `${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
  }

  private add(author: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    const message: ChatMessage = { id: this.newId(), author, text, ts: Date.now(), ...extra };
    this.messages.push(message);
    this.deps.emit({ type: 'message', message });
    this.deps.onChange?.();
    return message;
  }

  /** 글 안의 @멘션을 멤버 id 목록으로. 이름, 포지션(@메인, @서브1)으로 부를 수 있다. */
  mentions(text: string, exclude?: string): string[] {
    const lower = text.toLowerCase();
    const everyone = /@(모두|전원|all|everyone)(?![\p{L}\p{N}])/iu.test(text);
    return this.active()
      .filter((m) => m.id !== exclude)
      .filter((m) => everyone || [m.name, m.position, m.id].some((al) => lower.includes(`@${al.toLowerCase()}`)))
      .map((m) => m.id);
  }

  /** 멤버 설정 변경. 초대/내보내기, 모델, 점수(직급) 등 */
  configure(id: string, patch: Partial<MemberConfig>) {
    const m = this.members.find((x) => x.id === id);
    if (!m) throw new Error('없는 멤버');
    const before = this.snapshot();
    const wasPresent = m.present;
    for (const key of EDITABLE) {
      const value = patch[key];
      if (value === undefined) continue;
      if (key === 'score') m.score = Math.round(Number(value));
      else (m as unknown as Record<string, unknown>)[key] = value;
    }
    m.name = m.name.trim() || m.id;
    if (wasPresent !== m.present) this.add('system', `${m.name}님이 ${m.present ? '들어왔습니다' : '나갔습니다'}.`);
    this.announce(before);
    this.deps.emit({ type: 'members' });
    this.deps.onChange?.();
  }

  post(text: string, to?: string) {
    const direct = to && this.active().some((m) => m.id === to) ? to : undefined;
    this.add('user', text, direct ? { to: direct } : {});
    this.passed.clear();
    this.contributors.clear();
    this.solo = Boolean(direct);
    if (direct) {
      this.turnsLeft = 1;
      this.queue = [{ id: direct, kind: 'direct' }];
    } else {
      this.turnsLeft = this.settings.maxTurns;
      const called = this.mentions(text);
      this.queue = called.length
        ? called.map((id) => ({ id, kind: 'mentioned' as const }))
        : this.active().slice(0, 1).map((m) => ({ id: m.id, kind: 'first' as const }));
    }
    if (!this.running) void this.loop();
  }

  /** 사용자 공감 👍/👎. 같은 걸 다시 누르면 취소 */
  react(messageId: string, value: 'up' | 'down' | null) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg || msg.author === 'user' || msg.author === 'system') return;
    const before = this.snapshot();
    const points = (v?: 'up' | 'down' | null) => (v ? POINTS[v] : 0);
    if (this.settings.autoRank) this.award(msg.author, points(value) - points(msg.reaction));
    if (value) msg.reaction = value;
    else delete msg.reaction;
    this.deps.emit({ type: 'update', message: msg });
    this.announce(before);
    this.deps.emit({ type: 'members' });
    this.deps.onChange?.();
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
    this.deps.onChange?.();
  }

  private award(id: string, delta: number) {
    const m = this.members.find((x) => x.id === id);
    if (m && delta) m.score += delta;
  }

  private snapshot() {
    return new Map(this.views().map((v) => [v.id, v]));
  }

  /** 직급·메인이 바뀌었으면 공지 */
  private announce(before: Map<string, MemberView>) {
    const after = this.views();
    for (const v of after) {
      const old = before.get(v.id);
      if (!old || old.rank === v.rank) continue;
      const up = rankIndex(v.score) > rankIndex(old.score);
      this.add('system', `${up ? '🎉' : '📉'} ${v.name}님이 ${v.rank}(으)로 ${up ? '승진' : '강등'}했습니다.`);
    }
    const main = after[0];
    const oldMain = [...before.values()].find((v) => v.position === '메인');
    if (main && oldMain && main.id !== oldMain.id) this.add('system', `👑 ${main.name}님이 새 메인이 되었습니다.`);
  }

  /** 다음 발언자: 직전 발언자 다음 포지션부터, 이번 라운드에 아직 PASS 안 한 멤버 */
  private pickNext(): { id: string; kind: Kind } | null {
    const order = this.active().map((m) => m.id);
    while (this.queue.length) {
      const next = this.queue.shift()!;
      if (order.includes(next.id)) return next;
    }
    if (this.solo || !order.length) return null;
    const start = this.lastSpeaker && order.includes(this.lastSpeaker) ? order.indexOf(this.lastSpeaker) + 1 : 0;
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
        // 토론 종료: 여러 멤버가 의견을 냈으면 메인이 정리
        const main = this.active()[0];
        const aborted = this.abort?.signal.aborted;
        if (!summarized && !aborted && !this.solo && main && this.settings.summarize && this.contributors.size >= 2) {
          summarized = true;
          await this.speak(main.id, 'summary');
          continue;
        }
        break;
      }
    } finally {
      this.running = false;
      this.abort = null;
      this.deps.emit({ type: 'idle' });
    }
  }

  private async speak(id: string, kind: Kind) {
    const me = this.view(id)!;
    const agent = this.deps.makeAgent(this.members.find((m) => m.id === id)!);
    const messageId = this.newId();
    this.abort = new AbortController();
    this.deps.emit({ type: 'typing', author: id, messageId });

    const canPass = kind === 'follow' || kind === 'mentioned' || kind === 'first';
    let text = '';
    let shown = 0;
    const onDelta = (delta: string) => {
      text += delta;
      // [PASS] 일 수도 있는 동안은 화면에 내보내지 않는다
      if (canPass && mightBePass(text)) return;
      // 최종 정리의 인사고과 줄은 화면에 내보내지 않는다
      const visible = kind === 'summary' ? text.split('[평')[0] : text;
      if (visible.length > shown) {
        this.deps.emit({ type: 'delta', messageId, text: visible.slice(shown) });
        shown = visible.length;
      }
    };

    const active = this.active();
    try {
      const reply = await agent.respond({
        system: systemPrompt(me, active),
        transcript: this.messages,
        instruction: instructionFor(me, kind),
        label: this.label,
        peers: active.filter((m) => m.id !== id).map((m) => m.name),
        signal: this.abort.signal,
        onDelta,
      });
      text = reply || text;
    } catch (err) {
      if (this.abort.signal.aborted) {
        if (text.trim() && !isPass(text)) this.finish(messageId, id, `${text}\n\n_(중단됨)_`);
        else this.deps.emit({ type: 'pass', author: id, messageId });
        return;
      }
      this.deps.emit({ type: 'pass', author: id, messageId });
      this.add('system', `⚠️ ${me.name} 오류: ${(err as Error).message}`);
      this.passed.add(id);
      return;
    }

    if (canPass && isPass(text)) {
      this.passed.add(id);
      this.deps.emit({ type: 'pass', author: id, messageId });
      return;
    }

    if (kind === 'summary') {
      const review = parseReview(text);
      this.finish(messageId, id, (review?.text ?? text).trim(), 'summary');
      if (review && this.settings.autoRank) this.applyReview(id, review.adopted, review.mistakes);
      return;
    }

    this.finish(messageId, id, text.trim());
    if (this.solo) return;
    // 새 발언이 나왔으니 모두에게 다시 기회를 준다
    this.passed.clear();
    this.passed.add(id);
    this.lastSpeaker = id;
    this.contributors.add(id);
    for (const called of this.mentions(text, id)) {
      if (!this.queue.some((q) => q.id === called)) this.queue.push({ id: called, kind: 'mentioned' });
    }
  }

  /** 메인의 인사고과를 점수에 반영. 채택은 토론에 실제로 참여한 다른 멤버만 인정 */
  private applyReview(reviewer: string, adopted: string, mistakes: string) {
    const before = this.snapshot();
    const find = (s: string) =>
      this.members.filter((m) => s.split(/[,，、\s]+/).some((w) => w && (w === m.name || w === `@${m.name}`)));
    const notes: string[] = [];
    for (const m of find(adopted)) {
      if (m.id === reviewer || !this.contributors.has(m.id)) continue;
      this.award(m.id, POINTS.adopted);
      notes.push(`${m.name} +${POINTS.adopted}`);
    }
    for (const m of find(mistakes)) {
      this.award(m.id, POINTS.mistake);
      notes.push(`${m.name} ${POINTS.mistake}`);
    }
    if (notes.length) this.add('system', `📋 인사고과: ${notes.join(', ')}`);
    this.announce(before);
    this.deps.emit({ type: 'members' });
    this.deps.onChange?.();
  }

  private finish(messageId: string, author: string, text: string, kind?: ChatMessage['kind']) {
    const message: ChatMessage = { id: messageId, author, text, ts: Date.now(), ...(kind ? { kind } : {}) };
    this.messages.push(message);
    this.deps.emit({ type: 'done', message });
    this.deps.onChange?.();
  }
}
