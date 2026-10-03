import type { MemberConfig } from './types.js';

/** 점수 하한과 직급. 점수는 사용자 공감(👍/👎)과 최종 정리의 채택/오류 평가로 오르내린다. */
export const RANKS: { min: number; title: string }[] = [
  { min: -Infinity, title: '인턴' },
  { min: 0, title: '사원' },
  { min: 10, title: '대리' },
  { min: 20, title: '과장' },
  { min: 35, title: '차장' },
  { min: 50, title: '부장' },
  { min: 70, title: '이사' },
];

export const POINTS = { up: 3, down: -3, adopted: 2, mistake: -2 } as const;

export function rankOf(score: number): string {
  let title = RANKS[0].title;
  for (const r of RANKS) if (score >= r.min) title = r.title;
  return title;
}

export function rankIndex(score: number): number {
  return RANKS.findLastIndex((r) => score >= r.min);
}

/** 한 직급 올리거나 내린 점수 (그 직급의 하한) */
export function stepScore(score: number, dir: 1 | -1): number {
  const i = Math.max(1, Math.min(RANKS.length - 1, rankIndex(score) + dir));
  return RANKS[i].min;
}

/** 점수 높은 순. 같으면 원래 순서 (메인 → 서브1 → 서브2) */
export function byPosition(members: MemberConfig[]): MemberConfig[] {
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.score - a.m.score || a.i - b.i)
    .map(({ m }) => m);
}

export function positionTitle(index: number): string {
  return index === 0 ? '메인' : `서브${index}`;
}

export const DUTIES: Record<'main' | 'sub1' | 'sub', string> = {
  main: '메인(리드). 사용자의 요청에 가장 먼저 답하고 방향·설계·초안을 잡습니다. 토론이 끝나면 최종 정리를 맡습니다.',
  sub1: '서브1(검증). 다른 멤버의 답을 꼼꼼히 검증해 버그, 빠진 요구사항, 엣지 케이스, 보안·성능 문제를 찾아 구체적인 수정안을 냅니다.',
  sub: '서브(대안). 다른 멤버와 다른 관점에서 대안적 접근, 반론, 실무 팁, 더 단순한 방법을 제시합니다. 동의만 할 거면 PASS 합니다.',
};

export function dutyOf(position: string): string {
  return position === '메인' ? DUTIES.main : position === '서브1' ? DUTIES.sub1 : DUTIES.sub;
}
