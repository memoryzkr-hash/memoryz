import { dutyOf } from './ranks.js';
import type { ChatMessage, MemberView } from './types.js';

export const PASS = '[PASS]';
export const REVIEW_TAG = '[평가]';

export function systemPrompt(me: MemberView, members: MemberView[]): string {
  const roster = members
    .map((m) => `- ${m.emoji} ${m.name} — ${m.rank}, ${m.position}${m.specialty ? `, 특기: ${m.specialty}` : ''}`)
    .join('\n');
  return `당신은 "AI 단톡방"의 멤버 ${me.emoji} ${me.name}입니다 (${me.rank}, ${me.position}).
이 방에는 사람 사용자 한 명과 아래 AI 멤버들이 함께 있습니다.

${roster}

당신의 포지션: ${dutyOf(me.position)}${me.specialty ? `\n당신의 특기: ${me.specialty}` : ''}

직급과 포지션은 실적으로 바뀝니다. 사용자의 공감과, 최종 정리에서 의견이 채택되었는지가 실적입니다.
좋은 실적은 말을 많이 하는 것이 아니라 팀의 결과물을 실제로 낫게 만드는 것입니다.

대화 기록에서 다른 사람의 발언은 "[이름]: 내용" 형식으로 보입니다. 당신의 과거 발언은 그대로 보입니다.
"[사용자 → 이름]" 은 사용자가 그 멤버만 직접 호출한 메시지입니다.

단톡방 규칙:
1. 팀의 목표는 사용자의 요청을 최고 품질로 끝내는 것입니다. 서로 보완하세요.
2. 이미 누군가 말한 내용을 반복하지 마세요. 빠진 부분, 틀린 부분, 더 나은 대안만 덧붙이세요.
3. 다른 멤버의 발언에 오류가 있으면 누구의 어떤 부분인지 짚고 고친 내용을 제시하세요. 동의하면 짧게 동의만 하면 됩니다.
4. 특정 멤버의 의견이 꼭 필요하면 "@이름" 으로 불러서 넘기세요 (예: @${members.find((m) => m.id !== me.id)?.name ?? '이름'} 이 부분 봐줘).
5. 더할 말이 없으면 다른 말 없이 정확히 ${PASS} 만 답하세요. 억지로 말을 보태는 것보다 낫습니다.
6. 사용자와 같은 언어로(기본은 한국어) 메신저답게 간결하게 쓰세요. 코드가 필요하면 코드 블록을 쓰세요.
7. 자기 이름표("[${me.name}]:")를 앞에 붙이지 마세요.`;
}

export type Kind = 'first' | 'follow' | 'mentioned' | 'direct' | 'summary';

export function instructionFor(me: MemberView, kind: Kind): string {
  switch (kind) {
    case 'first':
      return `[진행자] ${me.name} 차례입니다. 사용자의 최신 메시지에 먼저 답해 주세요.`;
    case 'mentioned':
      return `[진행자] ${me.name}님이 호출되었습니다. 호출한 내용에 답해 주세요.`;
    case 'direct':
      return `[진행자] 사용자가 ${me.name}님만 직접 호출했습니다. 다른 멤버의 보완 없이 이 답이 그대로 전달되니, 완결된 답을 주세요. ${PASS} 는 쓰지 마세요.`;
    case 'follow':
      return `[진행자] ${me.name} 차례입니다. 지금까지의 대화를 보고 당신의 포지션으로 보완할 점이 있으면 덧붙이고, 없으면 ${PASS} 라고만 답하세요.`;
    case 'summary':
      return `[진행자] 토론이 끝났습니다. ${me.name}님이 지금까지 합의한 내용을 반영해 사용자에게 줄 최종 결론을 정리해 주세요. 반영한 수정 사항은 누구의 의견인지 짧게 밝혀 주세요. ${PASS} 는 쓰지 마세요.
그리고 맨 마지막 줄에 인사고과를 정확히 이 형식으로 남겨 주세요 (화면에는 보이지 않습니다):
${REVIEW_TAG} 채택: 이름, 이름 / 오류: 이름
- 채택: 최종 결론에 실제로 반영된 의견을 낸 다른 멤버 (자신 제외)
- 오류: 이번 토론에서 틀린 내용을 말해 다른 멤버에게 정정된 멤버 (자신이 정정되었다면 자신도 솔직하게 포함)
- 해당자가 없으면 "없음" 이라고 쓰세요.`;
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

/** 최종 정리 끝의 인사고과 줄을 떼어낸다 */
export function parseReview(text: string): { text: string; adopted: string; mistakes: string } | null {
  const i = text.lastIndexOf(REVIEW_TAG);
  if (i < 0) return null;
  const line = text.slice(i + REVIEW_TAG.length);
  const part = (label: string) => line.match(new RegExp(`${label}\\s*[:：]\\s*([^/\\n]*)`))?.[1]?.trim() ?? '';
  return { text: text.slice(0, i).trim(), adopted: part('채택'), mistakes: part('오류') };
}

/** 대화 기록을 "나" 기준의 user/assistant 턴으로 바꾼다. */
export function toTurns(
  meId: string,
  transcript: ChatMessage[],
  label: (m: ChatMessage) => string,
  instruction: string,
): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  };
  for (const m of transcript) {
    if (m.author === meId) push('assistant', m.text);
    else push('user', `[${label(m)}]: ${m.text}`);
  }
  push('user', instruction);
  // 첫 턴은 반드시 user 여야 한다.
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', content: '[진행자] 대화를 시작합니다.' });
  return turns;
}
