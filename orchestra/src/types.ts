export type AuthorId = 'user' | 'system' | string;

export interface ChatMessage {
  id: string;
  author: AuthorId;
  text: string;
  ts: number;
  /** 'summary' = 토론을 마무리하는 최종 정리 */
  kind?: 'summary';
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  /** 단톡방에서 맡는 역할 (시스템 프롬프트에 들어감) */
  role: string;
  /** '@이름' 으로 부를 때 쓰는 별칭들 */
  aliases: string[];
  /** UI 말풍선 색 */
  color: string;
}

export interface RespondArgs {
  system: string;
  transcript: ChatMessage[];
  /** 이번 차례에만 주는 진행자 지시 */
  instruction: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export interface Agent {
  persona: Persona;
  /** API 키 등 준비가 되어 있는지 */
  ready: boolean;
  model: string;
  respond(args: RespondArgs): Promise<string>;
}
