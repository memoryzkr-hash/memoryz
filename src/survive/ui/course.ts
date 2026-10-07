/**
 * AI 자동코스. The student never picks content: one card at a time, four kinds of answer
 * (답하기 · 모르겠음 · 헷갈림 · 다음), and the engine decides what comes next.
 */
import { currentStep, newCourse, respond, seedReviews, shownGain, type GainLabel, type Outcome } from '../core/engine';
import { localDate, makePlan } from '../core/plan';
import { readiness, shown } from '../core/readiness';
import type { Choice, Concept, Exam, Response, Step } from '../core/types';
import type { App, SessionSummary } from './app';
import { gauge, h, lines, replaceChildren, toast } from './dom';

/** A card left open longer than this counts as a break, not study. */
const MAX_CARD_SECONDS = 180;
const EXPLAIN_SECONDS = 20;

const KIND_LABEL: Record<Step['kind'], string> = {
  recall: '떠올리기',
  explain: '20초 설명',
  mcq: '선택형 문제',
  flash: '암기카드',
  similar: '유사문제',
};

const GAIN_ORDER: GainLabel[] = ['핵심 개념 학습 완료', '헷갈리던 개념 복습 완료', '정답', '암기 완료', '설명 확인'];

export function renderCourse(root: HTMLElement, app: App, examId: string, goalMinutes: number): () => void {
  const loaded = app.store.get(examId);
  if (!loaded) {
    app.go({ name: 'home' }, { replace: true });
    return () => {};
  }
  const exam: Exam = loaded;
  const plan = makePlan(exam, app.now());
  const routeIds = plan.todo.map((c) => c.id);
  const routeAll = plan.route.map((c) => c.id);
  const course = (exam.course ??= newCourse());
  seedReviews(exam, course, routeAll);

  const summary: SessionSummary = { seconds: 0, cards: 0, correct: 0, finished: 0, before: readiness(exam), after: readiness(exam), routeDone: false };
  let goalSeconds = goalMinutes * 60;
  let cardStarted = performance.now();
  let hiddenAt: number | null = null;
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;
  let left = false;

  // ---- frame ----
  const progressFill = h('div', { class: 'cprog-fill' });
  const progressText = h('span', { class: 'cprog-text' });
  const timeFill = h('div', { class: 'ctime-fill' });
  const miniGauge = h('div', { class: 'mini-ready' });
  const gainPop = h('div', { class: 'gain-pop', 'aria-live': 'polite' });
  const card = h('section', { class: 'study-card' });
  const actions = h('div', { class: 'actions' });

  root.append(
    h(
      'div',
      { class: 'screen course' },
      h(
        'header',
        { class: 'course-top' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '그만하기', textContent: '✕', onClick: () => finish(false) }),
        h('div', { class: 'cprog' }, h('div', { class: 'cprog-bar' }, progressFill), progressText),
        h('div', { class: 'mini-wrap' }, miniGauge, gainPop),
      ),
      h('div', { class: 'ctime', title: '오늘 목표 시간' }, timeFill),
      card,
      actions,
      h('p', { class: 'disclaimer' }, '준비도는 학습 진행 표시예요. 실제 시험 점수가 아니에요.'),
    ),
  );

  const conceptOf = (s: Step): Concept => exam.concepts.find((c) => c.id === s.conceptId)!;

  const drawHeader = () => {
    const done = routeAll.filter((id) => exam.progress[id]?.done).length;
    progressFill.style.width = `${routeAll.length ? (done / routeAll.length) * 100 : 0}%`;
    progressText.textContent = `${done} / ${routeAll.length} 개념`;
    replaceChildren(miniGauge, gauge(readiness(exam), 'sm'));
    timeFill.style.width = `${Math.min(100, (summary.seconds / goalSeconds) * 100)}%`;
  };

  const logTime = () => {
    const now = performance.now();
    const secs = Math.min(MAX_CARD_SECONDS, Math.max(0, (now - cardStarted) / 1000));
    cardStarted = now;
    summary.seconds += secs;
    const date = localDate(app.now());
    let log = exam.sessions.find((s) => s.date === date);
    if (!log) exam.sessions.push((log = { date, seconds: 0, steps: 0 }));
    log.seconds += Math.round(secs);
    log.steps++;
  };

  const showGain = (o: Outcome) => {
    const n = shownGain(o);
    const label = GAIN_ORDER.find((g) => o.gains.includes(g));
    if (n > 0) {
      gainPop.textContent = `+${n}`;
      gainPop.classList.remove('go');
      void gainPop.offsetWidth;
      gainPop.classList.add('go');
    }
    if (o.finished) toast(`✓ ‘${o.finished.term}’ 끝! 핵심 개념 학습 완료${n > 0 ? ` +${n} 준비도` : ''}`, 'gain');
    else if (label && label !== '설명 확인' && label !== '암기 완료' && n > 0) toast(`${label} +${n} 준비도`, 'gain');
  };

  const answer = (step: Step, r: Response): Outcome => {
    logTime();
    const o = respond(exam, course, step, r);
    summary.cards++;
    if (o.correct) summary.correct++;
    if (o.finished) summary.finished++;
    summary.after = o.after;
    app.store.touch(exam);
    showGain(o);
    drawHeader();
    return o;
  };

  // ---- flow ----
  function next(): void {
    clearTimeout(advanceTimer);
    if (left) return;
    if (summary.seconds >= goalSeconds && summary.cards > 0) return checkpoint();
    const step = currentStep(exam, course, routeIds);
    if (!step) {
      summary.routeDone = true;
      return finish(true);
    }
    app.store.touch(exam);
    cardStarted = performance.now();
    drawHeader();
    draw(step);
  }

  function finish(routeDone: boolean): void {
    if (left) return;
    clearTimeout(advanceTimer);
    summary.routeDone = routeDone;
    app.store.touch(exam);
    app.go({ name: 'done', examId, summary }, { replace: true });
  }

  function checkpoint(): void {
    const minutes = Math.max(1, Math.round(summary.seconds / 60));
    const more = goalMinutes <= 3 ? 5 : 10;
    replaceChildren(
      card,
      h(
        'div',
        { class: 'checkpoint' },
        h('div', { class: 'big-emoji', 'aria-hidden': 'true' }, '🔥'),
        h('h2', null, goalMinutes <= 3 ? `${minutes}분 했어요! 시작이 제일 어려운 거예요` : `오늘 목표 ${goalMinutes}분 끝!`),
        h('p', null, '준비도 ', h('b', null, String(shown(summary.before))), ' → ', h('b', { class: 'up' }, String(shown(summary.after)))),
        h('p', { class: 'muted' }, '흐름 탔을 때 조금만 더 해볼까요?'),
      ),
    );
    replaceChildren(
      actions,
      h('button', { type: 'button', class: 'btn primary xl block', textContent: `${more}분 더 하기`, onClick: () => ((goalSeconds = summary.seconds + more * 60), next()) }),
      h('button', { type: 'button', class: 'btn ghost block', textContent: '오늘은 여기까지', onClick: () => finish(false) }),
    );
  }

  function header(step: Step): HTMLElement {
    const c = conceptOf(step);
    return h(
      'div',
      { class: 'card-tags' },
      h('span', { class: `tag k-${step.kind}` }, step.review ? `복습 · ${KIND_LABEL[step.kind]}` : KIND_LABEL[step.kind]),
      c.importance >= 5 && h('span', { class: 'tag hot' }, '출제 유력'),
      c.kind === 'memorize' && step.kind !== 'flash' && h('span', { class: 'tag' }, '암기'),
    );
  }

  function draw(step: Step): void {
    card.className = `study-card enter k-${step.kind}`;
    if (step.kind === 'recall') drawRecall(step);
    else if (step.kind === 'explain') drawExplain(step);
    else if (step.kind === 'flash') drawFlash(step);
    else drawChoice(step, step.kind === 'similar' ? conceptOf(step).similar! : conceptOf(step).mcq!);
  }

  const secondary = (step: Step, unsure = true) =>
    h(
      'div',
      { class: 'row gap' },
      unsure && h('button', { type: 'button', class: 'btn soft grow', textContent: '헷갈려요', onClick: () => (answer(step, { type: 'unsure' }), next()) }),
      h('button', { type: 'button', class: 'btn soft grow', textContent: '모르겠어요', onClick: () => (answer(step, { type: 'dontknow' }), next()) }),
    );

  function drawRecall(step: Step): void {
    const c = conceptOf(step);
    replaceChildren(card, header(step), h('p', { class: 'prompt' }, ...lines(c.recall)), h('p', { class: 'hint' }, '머릿속으로 답을 떠올린 뒤 확인하세요'));
    replaceChildren(
      actions,
      h(
        'button',
        {
          type: 'button',
          class: 'btn primary xl block',
          textContent: '답 확인하기',
          onClick: () => {
            card.append(h('div', { class: 'answer-box' }, h('span', { class: 'label' }, '정답'), h('p', null, c.answer)));
            replaceChildren(
              actions,
              h('p', { class: 'muted small center' }, '내가 떠올린 답과 비슷했나요?'),
              h(
                'div',
                { class: 'row gap' },
                h('button', { type: 'button', class: 'btn bad grow', textContent: '틀렸어요', onClick: () => (answer(step, { type: 'missed' }), next()) }),
                h('button', { type: 'button', class: 'btn good grow', textContent: '맞았어요', onClick: () => (answer(step, { type: 'knew' }), next()) }),
              ),
            );
          },
        },
      ),
      secondary(step),
    );
  }

  function drawExplain(step: Step): void {
    const c = conceptOf(step);
    const timer = h('div', { class: 'read-timer' }, h('div', { class: 'read-timer-fill' }));
    timer.style.setProperty('--secs', `${EXPLAIN_SECONDS}s`);
    replaceChildren(card, header(step), h('h2', { class: 'term' }, c.term), h('p', { class: 'explain' }, c.explain), h('div', { class: 'answer-box soft' }, h('span', { class: 'label' }, '한 줄 정리'), h('p', null, c.answer)), timer);
    replaceChildren(
      actions,
      h('button', { type: 'button', class: 'btn primary xl block', textContent: '이해했어요 · 다음', onClick: () => (answer(step, { type: 'next' }), next()) }),
      h('div', { class: 'row gap' }, h('button', { type: 'button', class: 'btn soft grow', textContent: '헷갈려요', onClick: () => (answer(step, { type: 'unsure' }), next()) })),
    );
  }

  function drawFlash(step: Step): void {
    const c = conceptOf(step);
    const flip = h(
      'button',
      { type: 'button', class: 'flash', 'aria-label': '카드 뒤집기' },
      h('div', { class: 'flash-face front' }, h('span', { class: 'label' }, '앞면'), h('b', null, c.term), h('span', { class: 'muted small' }, '탭해서 뒤집기')),
      h('div', { class: 'flash-face back' }, h('span', { class: 'label' }, '뒷면'), h('p', null, c.answer)),
    );
    const reveal = () => {
      if (flip.classList.contains('flipped')) return;
      flip.classList.add('flipped');
      replaceChildren(
        actions,
        h(
          'div',
          { class: 'row gap' },
          h('button', { type: 'button', class: 'btn soft grow', textContent: '헷갈려요', onClick: () => (answer(step, { type: 'unsure' }), next()) }),
          h('button', { type: 'button', class: 'btn good grow', textContent: '외웠어요', onClick: () => (answer(step, { type: 'knew' }), next()) }),
        ),
      );
    };
    flip.addEventListener('click', reveal);
    replaceChildren(card, header(step), flip);
    replaceChildren(actions, h('button', { type: 'button', class: 'btn primary xl block', textContent: '뒤집기', onClick: reveal }));
  }

  function drawChoice(step: Step, q: Choice): void {
    let answered = false;
    const buttons = q.options.map((opt, i) =>
      h('button', { type: 'button', class: 'option', onClick: () => pick(i) }, h('span', { class: 'opt-no' }, String(i + 1)), h('span', { class: 'opt-text' }, opt)),
    );
    const pick = (i: number | null) => {
      if (answered) return;
      answered = true;
      const o = answer(step, i === null ? { type: 'dontknow' } : { type: 'choose', index: i });
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      card.append(
        h(
          'div',
          { class: `verdict-box ${o.correct ? 'ok' : 'no'}` },
          h('b', null, o.correct ? '정답!' : i === null ? '괜찮아요, 지금 알면 돼요' : '아쉬워요'),
          q.why && h('p', null, q.why),
        ),
      );
      const go = h('button', { type: 'button', class: 'btn primary xl block', textContent: '다음', onClick: () => next() });
      replaceChildren(actions, go);
      go.focus();
      // Right answers move on by themselves: one less tap between the student and the next card.
      if (o.correct) advanceTimer = setTimeout(next, 1600);
    };
    replaceChildren(card, header(step), h('p', { class: 'prompt' }, ...lines(q.question)), h('div', { class: 'options' }, ...buttons));
    replaceChildren(actions, h('button', { type: 'button', class: 'btn soft block', textContent: '모르겠어요', onClick: () => pick(null) }));
  }

  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.backdrop')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5) {
      const opt = card.querySelectorAll<HTMLButtonElement>('.option')[n - 1];
      if (opt && !opt.disabled) opt.click();
    }
  };
  // Time in another app is not study time.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') hiddenAt = performance.now();
    else if (hiddenAt !== null) {
      cardStarted += performance.now() - hiddenAt;
      hiddenAt = null;
    }
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  next();

  return () => {
    left = true;
    clearTimeout(advanceTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    app.store.touch(exam);
  };
}
