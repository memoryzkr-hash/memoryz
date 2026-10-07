/** 시험 생존모드 요약: what the AI chose, how long it takes, and one big start button. */
import { dDayLabel, makePlan, type Plan } from '../core/plan';
import { shown } from '../core/readiness';
import type { Exam } from '../core/types';
import type { App } from './app';
import { gauge, h } from './dom';

export const DISCLAIMER = '시험 준비도는 이 앱의 학습 진행을 보여 주는 값이에요. 실제 시험 점수를 뜻하지 않아요.';

function headline(plan: Plan, exam: Exam): { title: string; sub: string } {
  if (plan.mode === 'over') return { title: '시험이 끝났어요', sub: '수고했어요. 다음 시험도 여기서 시작하세요.' };
  if (plan.todo.length === 0) return { title: '생존 루트를 다 끝냈어요', sub: '헷갈렸던 것만 한 번 더 보면 돼요.' };
  if (plan.skipped.length === 0) return { title: '시간이 충분해요', sub: '그래도 중요한 것부터 합니다. 순서는 AI가 정했어요.' };
  if (plan.mode === 'cram') return { title: '시간이 거의 없어요', sub: `${exam.material.pages}쪽 중 꼭 나올 것만 남겼어요.` };
  return { title: '현재 시간으로 전체 학습은 비효율적입니다', sub: '그래서 AI가 시험에 나올 것만 골랐어요.' };
}

export function renderPlan(root: HTMLElement, app: App, examId: string, fresh: boolean): void {
  const exam = app.store.get(examId);
  if (!exam) {
    app.go({ name: 'home' }, { replace: true });
    return;
  }
  const plan = makePlan(exam, app.now());
  const { title, sub } = headline(plan, exam);
  const r = shown(plan.readiness);
  const multiDay = plan.studyDays > 1 && plan.todayMinutes < plan.minutes;
  const routeMinutes = multiDay ? plan.todayMinutes : plan.minutes;
  const start = (goalMinutes: number) => app.go({ name: 'course', examId, goalMinutes });
  const hasShaky = plan.route.some((c) => exam.progress[c.id]?.shaky);
  const canStudy = plan.mode !== 'over' && (plan.todo.length > 0 || hasShaky);

  const skippedList = h(
    'details',
    { class: 'skipped' },
    h('summary', null, `이번엔 버리는 것 ${plan.skipped.length}개 보기`),
    h('p', { class: 'muted small' }, '중요도가 낮아 시간이 남을 때만 해요. 루트를 끝내면 자동으로 다음 순서에 들어와요.'),
    h('ul', null, ...plan.skipped.map((c) => h('li', null, c.term, h('span', { class: 'stars', 'aria-label': `중요도 ${c.importance}` }, '●'.repeat(c.importance))))),
  );

  root.append(
    h(
      'div',
      { class: 'screen plan' },
      h(
        'div',
        { class: 'topnav' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '홈으로', textContent: '←', onClick: () => app.go({ name: 'home' }) }),
        h('span', { class: 'step' }, fresh ? '분석 완료' : '시험 생존모드'),
      ),
      h('div', { class: 'plan-head' }, h('span', { class: `dday big ${plan.dDay <= 1 ? 'hot' : ''}` }, `시험 ${dDayLabel(plan.dDay)}`), h('h1', null, exam.subject)),
      h(
        'section',
        { class: 'card scope' },
        h('div', { class: 'scope-row' }, h('span', null, '총 시험범위'), h('b', { class: plan.skipped.length ? 'cut' : '' }, `${exam.material.pages}페이지`)),
        h('p', { class: 'verdict' }, title),
        h('p', { class: 'muted' }, sub),
      ),
      canStudy &&
        h(
          'section',
          { class: 'card picked' },
          h('p', { class: 'label' }, 'AI가 우선 학습 대상으로 선택'),
          h(
            'div',
            { class: 'stats' },
            h('div', null, h('b', null, String(plan.counts.concepts)), h('span', null, '핵심 개념')),
            h('div', null, h('b', null, String(plan.counts.memorize)), h('span', null, '필수 암기')),
            h('div', null, h('b', null, String(plan.counts.problems)), h('span', null, '실전 확인 문제')),
          ),
          h('div', { class: 'eta' }, h('span', null, '예상 소요시간'), h('b', null, `${plan.minutes}분`), multiDay && h('span', { class: 'muted small' }, `· 오늘 ${plan.todayMinutes}분`)),
          plan.skipped.length > 0 && skippedList,
        ),
      h(
        'section',
        { class: 'card ready' },
        gauge(plan.readiness, 'lg', plan.todayTarget),
        h(
          'div',
          { class: 'ready-text' },
          h('p', { class: 'label' }, '현재 준비도'),
          h('p', { class: 'ready-now' }, h('b', null, String(r)), ' / 100'),
          canStudy &&
            h('p', { class: 'ready-target' }, `오늘 ${routeMinutes}분 학습하면`, h('br'), '목표 준비도 ', h('b', null, `${shown(plan.todayTarget)} / 100`)),
        ),
      ),
      exam.material.note && h('p', { class: 'banner info' }, exam.material.note),
      canStudy &&
        h(
          'div',
          { class: 'sticky-cta' },
          h('button', { type: 'button', class: 'btn primary xl block', textContent: `${routeMinutes}분 생존 루트 시작`, onClick: () => start(routeMinutes) }),
          h('button', { type: 'button', class: 'btn soft block', textContent: '3분만 시작', onClick: () => start(3) }),
        ),
      h('p', { class: 'disclaimer' }, DISCLAIMER),
      h(
        'p',
        { class: 'muted tiny center' },
        exam.material.analyzer === 'claude' ? 'Claude 정밀 분석' : exam.material.analyzer === 'sample' ? '샘플 자료' : '빠른 분석 (기기 안에서)',
        ` · ${exam.material.name}`,
      ),
    ),
  );
}
