export type AuthorId = 'user' | 'system' | string;

export interface ChatMessage {
  id: string;
  author: AuthorId;
  text: string;
  ts: number;
  /** 'summary' = 토론을 마무리하는 최종 정리 */
  kind?: 'summary';
  /** 사용자가 이 멤버만 직접 호출한 메시지 */
  to?: string;
  /** 사용자의 공감 (직급 점수에 반영) */
  reaction?: 'up' | 'down';
}

export type Provider = 'claude' | 'gpt';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** 단톡방 멤버 한 명의 설정. 화면에서 바꿀 수 있고 data/room.json 에 저장된다. */
export interface MemberConfig {
  id: string;
  name: string;
  emoji: string;
  color: string;
  provider: Provider;
  model: string;
  /** Claude 생각 깊이 */
  effort: Effort;
  /** 이 멤버의 특기 (시스템 프롬프트와 프로필 상태 메시지) */
  specialty: string;
  /** 실적 점수. 직급과 포지션(메인/서브)을 정한다 */
  score: number;
  present: boolean;
}

/** 멤버 설정 + 지금 계산된 직급/포지션 */
export interface MemberView extends MemberConfig {
  rank: string;
  /** '메인' | '서브1' | '서브2' ... */
  position: string;
  ready: boolean;
}

export interface RespondArgs {
  system: string;
  transcript: ChatMessage[];
  /** 이번 차례에만 주는 진행자 지시 */
  instruction: string;
  /** 대화 기록의 발언자 이름표 */
  label: (m: ChatMessage) => string;
  /** 방에 있는 다른 멤버 이름 */
  peers: string[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export interface Agent {
  respond(args: RespondArgs): Promise<string>;
}
