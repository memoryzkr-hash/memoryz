import type { ChatMessage, Persona } from './types.js';

export const PASS = '[PASS]';

export function systemPrompt(me: Persona, members: Persona[]): string {
  const roster = members
    .map((p) => `- ${p.emoji} ${p.name} (@${p.aliases[0]}): ${p.role}`)
    .join('\n');
  return `당신은 "AI 단톡방"의 멤버 ${me.emoji} ${me.name}입니다.
이 방에는 사람 사용자 한 명과 아래 AI 멤버들이 함께 있습니다.

${roster}

당신의 역할: ${me.role}

대화 기록에서 다른 사람의 발언은 "[이름]: 내용" 형식으로 보입니다. 당신의 과거 발언은 그대로 보입니다.

단톡방 규칙:
1. 팀의 목표는 사용자의 요청을 최고 품질로 끝내는 것입니다. 서로 경쟁하지 말고 보완하세요.
2. 이미 누군가 말한 내용을 반복하지 마세요. 빠진 부분, 틀린 부분, 더 나은 대안만 덧붙이세요.
3. 다른 멤버의 발언에 오류가 있으면 누구의 어떤 부분인지 짚고 고친 내용을 제시하세요. 동의하면 짧게 동의만 하면 됩니다.
4. 특정 멤버의 의견이 꼭 필요하면 "@별칭" 으로 불러서 넘기세요 (예: @검증자 이 코드 엣지 케이스 봐줘).
5. 더할 말이 없으면 다른 말 없이 정확히 ${PASS} 만 답하세요. 억지로 말을 보태는 것보다 낫습니다.
6. 사용자와 같은 언어로(기본은 한국어) 메신저답게 간결하게 쓰세요. 코드가 필요하면 코드 블록을 쓰세요.
7. 자기 이름표("[${me.name}]:")를 앞에 붙이지 마세요.`;
}

export function instructionFor(me: Persona, kind: 'first' | 'follow' | 'mentioned' | 'summary'): string {
  switch (kind) {
    case 'first':
      return `[진행자] ${me.name} 차례입니다. 사용자의 최신 메시지에 먼저 답해 주세요.`;
    case 'mentioned':
      return `[진행자] ${me.name}님이 호출되었습니다. 호출한 내용에 답해 주세요.`;
    case 'follow':
      return `[진행자] ${me.name} 차례입니다. 지금까지의 대화를 보고 당신의 역할로 보완할 점이 있으면 덧붙이고, 없으면 ${PASS} 라고만 답하세요.`;
    case 'summary':
      return `[진행자] 토론이 끝났습니다. ${me.name}님이 지금까지 멤버들이 합의한 내용을 반영해 사용자에게 줄 최종 결론을 정리해 주세요. 반영한 수정 사항은 누구의 의견인지 짧게 밝혀 주세요. ${PASS} 는 쓰지 마세요.`;
  }
}

export function isPass(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t === '' || t === PASS || t === 'PASS' || t.startsWith(PASS);
}

/** 스트리밍 중인 글이 아직 [PASS] 로 끝날 수도 있는지 (화면에 보여주기 전에 잠깐 참기 위함) */
export function mightBePass(text: string): boolean {
  const t = text.trimStart().toUpperCase();
  return t.length < PASS.length ? PASS.startsWith(t) : t.startsWith(PASS);
}

/** 대화 기록을 "나" 기준의 user/assistant 턴으로 바꾼다. */
export function toTurns(
  me: Persona,
  transcript: ChatMessage[],
  nameOf: (author: string) => string,
  instruction: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  };
  for (const m of transcript) {
    if (m.author === me.id) push('assistant', m.text);
    else push('user', `[${nameOf(m.author)}]: ${m.text}`);
  }
  push('user', instruction);
  // 첫 턴은 반드시 user 여야 한다.
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: '[진행자] 대화를 시작합니다.' });
  return turns;
}
