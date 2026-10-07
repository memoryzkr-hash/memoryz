/** 오늘 학습 결과: what moved, and the next smallest step. */
import { makePlan } from '../core/plan';
import { shown } from '../core/readiness';
import type { App, SessionSummary } from './app';
import { gauge, h } from './dom';
import { DISCLAIMER } from './plan';

export function renderDone(root: HTMLElement, app: App, examId: string, s: SessionSummary): void {
  const exam = app.store.get(examId);
  if (!exam) {
    app.go({ name: 'home' }, { replace: true });
    return;
  }
  const plan = makePlan(exam, app.now());
  const minutes = Math.max(1, Math.round(s.seconds / 60));
  const shaky = plan.route.filter((c) => exam.progress[c.id]?.shaky).length;
  const gained = shown(s.after) - shown(s.before);
  const title = s.cards === 0 ? '다음엔 한 장만 넘겨 봐요' : s.routeDone || plan.todo.length === 0 ? '생존 루트 완주!' : gained >= 5 ? '오늘 확실히 살아났어요' : '시작했다는 게 제일 커요';

  root.append(
    h(
      'div',
      { class: 'screen done' },
      h('div', { class: 'big-emoji', 'aria-hidden': 'true' }, s.cards === 0 ? '🌱' : s.routeDone ? '🏁' : '💪'),
      h('h1', null, title),
      h(
        'section',
        { class: 'card ready' },
        gauge(s.after, 'lg', plan.todayTarget),
        h(
          'div',
          { class: 'ready-text' },
          h('p', { class: 'label' }, '시험 준비도'),
          h('p', { class: 'ready-now' }, h('span', { class: 'muted' }, String(shown(s.before))), ' → ', h('b', null, String(shown(s.after)))),
          gained > 0 && h('p', { class: 'up' }, `+${gained} 준비도`),
        ),
      ),
      h(
        'section',
        { class: 'card stats' },
        h('div', null, h('b', null, `${minutes}분`), h('span', null, '공부한 시간')),
        h('div', null, h('b', null, String(s.finished)), h('span', null, '끝낸 개념')),
        h('div', null, h('b', null, `${s.correct}/${s.cards}`), h('span', null, '맞힌 카드')),
      ),
      shaky > 0 && h('p', { class: 'banner info' }, `헷갈린 개념 ${shaky}개는 다음에 먼저 다시 나와요. 따로 정리할 필요 없어요.`),
      plan.mode !== 'over' &&
        plan.todo.length > 0 &&
        h('p', { class: 'muted center' }, `남은 루트 ${plan.todo.length}개 · 약 ${plan.minutes}분`),
      h(
        'div',
        { class: 'sticky-cta' },
        plan.mode !== 'over' &&
          (plan.todo.length > 0 || shaky > 0) &&
          h('button', { type: 'button', class: 'btn primary xl block', textContent: '3분만 더', onClick: () => app.go({ name: 'course', examId, goalMinutes: 3 }, { replace: true }) }),
        h('button', { type: 'button', class: 'btn ghost block', textContent: '생존 루트 보기', onClick: () => app.go({ name: 'plan', examId }, { replace: true }) }),
      ),
      h('p', { class: 'disclaimer' }, DISCLAIMER),
    ),
  );
}
