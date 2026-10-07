/** STEP 1 첫 화면 + the list of exams already set up. */
import { calendarDays, dDayLabel, makePlan, parseLocal } from '../core/plan';
import { shown } from '../core/readiness';
import type { Exam } from '../core/types';
import type { App } from './app';
import { bar, confirmSheet, h, openSheet, toast } from './dom';
import { keySheet } from './key';

function examCard(app: App, exam: Exam, refresh: () => void): HTMLElement {
  const now = app.now();
  const plan = makePlan(exam, now);
  const dDay = calendarDays(now, parseLocal(exam.examAt));
  const r = shown(plan.readiness);
  const left = plan.todo.length;
  const status =
    plan.mode === 'over' ? '시험이 끝났어요. 수고했어요!' : left === 0 ? '생존 루트 완료! 복습만 남았어요' : `남은 개념 ${left}개 · 오늘 ${plan.todayMinutes}분`;
  const more = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': `${exam.subject} 메뉴`,
    textContent: '⋯',
    onClick: (e: Event) => {
      e.stopPropagation();
      const sheet = openSheet(exam.subject);
      sheet.body.append(
        h('button', {
          type: 'button',
          class: 'btn danger block',
          textContent: '이 시험 삭제',
          onClick: async () => {
            sheet.close();
            if (await confirmSheet('시험 삭제', `${exam.subject} 시험과 공부 기록을 지울까요? 되돌릴 수 없어요.`, '삭제')) {
              app.store.remove(exam.id);
              toast('삭제했어요');
              refresh();
            }
          },
        }),
      );
    },
  });
  return h(
    'article',
    { class: 'exam-card', tabIndex: 0, onClick: () => app.go({ name: 'plan', examId: exam.id }), onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && app.go({ name: 'plan', examId: exam.id }) },
    h(
      'div',
      { class: 'exam-card-top' },
      h('span', { class: `dday ${dDay <= 1 && dDay >= 0 ? 'hot' : ''}` }, dDayLabel(dDay)),
      h('h3', null, exam.subject),
      more,
    ),
    h('div', { class: 'exam-card-ready' }, h('span', null, '시험 준비도'), h('b', null, `${r}`), h('span', { class: 'muted' }, '/100')),
    bar(r, plan.routeTarget),
    h('p', { class: 'muted small' }, status),
    plan.mode !== 'over' && left > 0 && h('div', { class: 'exam-card-cta' }, '이어서 하기 →'),
  );
}

export function renderHome(root: HTMLElement, app: App): void {
  const exams = app.store.list();
  const draw = () => {
    root.textContent = '';
    renderHome(root, app);
  };

  const hero = h(
    'section',
    { class: 'hero' },
    h('div', { class: 'hero-badge' }, '시험 생존'),
    h('h1', null, '시험 망할 것 같나요?'),
    h('p', { class: 'hero-sub' }, '자료만 올리세요.', h('br'), '지금부터 뭘 해야 할지 AI가 대신 정해드립니다.'),
    h('button', { type: 'button', class: 'btn primary xl block', textContent: '시험 생존 시작', onClick: () => app.go({ name: 'create' }) }),
    h(
      'ul',
      { class: 'promise' },
      h('li', null, h('span', { class: 'tick' }, '✓'), '계획 필요 없음'),
      h('li', null, h('span', { class: 'tick' }, '✓'), '요약 읽을 필요 없음'),
      h('li', null, h('span', { class: 'tick' }, '✓'), '중요한 것부터 바로 시작'),
    ),
  );

  root.append(
    h(
      'div',
      { class: 'screen home' },
      exams.length === 0
        ? hero
        : h(
            'section',
            null,
            h('div', { class: 'home-head' }, h('h1', null, '내 시험'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': '설정', textContent: '⚙', onClick: () => keySheet(app) })),
            h('p', { class: 'lead' }, '전부 공부하지 마세요. 지금 필요한 것부터 살아남게 해드릴게요.'),
            ...exams.map((e) => examCard(app, e, draw)),
            h('button', { type: 'button', class: 'btn ghost block', textContent: '＋ 새 시험 추가', onClick: () => app.go({ name: 'create' }) }),
          ),
      app.store.corrupt && h('p', { class: 'banner warn' }, '저장된 기록 일부를 읽지 못했어요. 원래 내용은 따로 보관해 두었어요.'),
      !app.store.available && h('p', { class: 'banner warn' }, '이 브라우저에서는 기록이 저장되지 않아요(사생활 보호 모드?). 창을 닫으면 사라져요.'),
    ),
  );
}
