/** Upload → 남은 시간 계산 → 중요도 분석 → 생존 루트. Shows each step so the wait feels like work being done. */
import { AiError, MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARS } from '../ai';
import { analyzeText, estimatePages } from '../core/extract';
import { calendarDays, dDayLabel, makePlan, parseLocal } from '../core/plan';
import { SAMPLE_MATERIAL, sampleConcepts } from '../core/sample';
import type { Concept, Exam, Material } from '../core/types';
import { readPdf, toBase64 } from '../pdf';
import type { App, Draft } from './app';
import { h, replaceChildren } from './dom';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Stop extends Error {
  constructor(message: string, readonly retryLocal = false) {
    super(message);
  }
}

export function renderAnalyze(root: HTMLElement, app: App, draft: Draft): () => void {
  const abort = new AbortController();
  let left = false;
  const list = h('ol', { class: 'steps' });
  const foot = h('div', { class: 'analyze-foot' });
  const steps: { el: HTMLElement; detail: HTMLElement }[] = [];
  const labels = ['자료 읽는 중', '시험까지 남은 시간 계산', '시험에 나올 것 고르는 중', '최소 생존 루트 만드는 중'];
  for (const label of labels) {
    const detail = h('span', { class: 'step-detail' });
    const el = h('li', { class: 'pending' }, h('span', { class: 'step-dot', 'aria-hidden': 'true' }), h('span', { class: 'step-text' }, h('b', null, label), detail));
    steps.push({ el, detail });
    list.append(el);
  }
  const set = (i: number, state: 'active' | 'done', detail?: string) => {
    steps[i].el.className = state;
    if (detail !== undefined) steps[i].detail.textContent = detail;
  };

  const title = h('h1', null, `${draft.subject} 분석 중`);
  const sub = h('p', { class: 'muted' }, '뭘 공부할지는 AI가 정해요. 잠깐만 기다려 주세요.');
  const screen = h(
    'div',
    { class: 'screen analyze' },
    h('div', { class: 'pulse', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
    title,
    sub,
    list,
    foot,
  );
  root.append(screen);

  const run = async () => {
    // 1. 자료 읽기
    set(0, 'active');
    let pages: string[] = [];
    let pageCount = 0;
    let chars = 0;
    let pdfData: ArrayBuffer | null = null;
    let material: Material;
    if (draft.sample) {
      await wait(500);
      pageCount = SAMPLE_MATERIAL.pages;
      material = { name: SAMPLE_MATERIAL.name, pages: pageCount, chars: 0, source: 'sample', analyzer: 'sample', note: null };
    } else if (draft.file && /pdf$/i.test(draft.file.type || draft.file.name)) {
      pdfData = await draft.file.arrayBuffer();
      const pdf = await readPdf(pdfData, (done, total) => set(0, 'active', `${done} / ${total}쪽`)).catch(() => {
        throw new Stop('PDF를 열지 못했어요. 암호가 걸렸거나 손상된 파일인지 확인해 주세요');
      });
      pages = pdf.pages;
      pageCount = pages.length;
      chars = pdf.chars;
      material = { name: draft.file.name, pages: pageCount, chars, source: 'pdf', analyzer: 'local', note: null };
    } else {
      const text = draft.file ? await draft.file.text() : draft.text;
      pages = text.split(/\f/);
      chars = text.replace(/\s/g, '').length;
      pageCount = estimatePages(text.length);
      material = { name: draft.file?.name ?? '붙여 넣은 텍스트', pages: pageCount, chars, source: 'text', analyzer: 'local', note: null };
    }
    set(0, 'done', `총 ${pageCount}쪽`);
    if (left) return;

    // 2. 남은 시간
    set(1, 'active');
    const now = app.now();
    const examAt = parseLocal(draft.examAt);
    const hours = Math.max(0, (examAt.getTime() - now.getTime()) / 3_600_000);
    await wait(450);
    set(1, 'done', `${dDayLabel(calendarDays(now, examAt))} · ${hours >= 48 ? `${Math.floor(hours / 24)}일` : `${Math.floor(hours)}시간`} 남음`);
    if (left) return;

    // 3. 중요도 분석
    set(2, 'active');
    let concepts: Concept[];
    if (draft.sample) {
      await wait(700);
      concepts = sampleConcepts();
    } else if (draft.useClaude) {
      const ai = app.ai();
      if (!ai) throw new Stop('API 키가 없어요', true);
      const started = Date.now();
      const tick = setInterval(() => set(2, 'active', `Claude가 자료를 읽는 중 · ${Math.round((Date.now() - started) / 1000)}초`), 1000);
      replaceChildren(foot, h('button', { type: 'button', class: 'btn ghost', textContent: '취소', onClick: () => abort.abort() }));
      try {
        const full = pages.map((p, i) => `[${i + 1}쪽]\n${p}`).join('\n\n');
        let text: string | null = chars >= 300 ? full : null;
        if (text && text.length > MAX_TEXT_CHARS) {
          // Say so instead of cutting silently: the plan screen shows this note.
          const cut = full.slice(0, MAX_TEXT_CHARS);
          const lastPage = (cut.match(/\[(\d+)쪽\]/g) ?? []).length;
          material.note = `자료가 길어서 앞 ${lastPage}쪽까지만 정밀 분석했어요`;
          text = cut;
        }
        let pdfBase64: string | null = null;
        if (!text) {
          if (!pdfData) throw new Stop('자료에 글자가 거의 없어요');
          if (pdfData.byteLength > MAX_PDF_BYTES || pageCount > MAX_PDF_PAGES) throw new Stop(`스캔한 PDF는 ${MAX_PDF_PAGES}쪽, 30MB까지만 분석할 수 있어요`);
          pdfBase64 = toBase64(pdfData);
        }
        concepts = await ai.analyze({ subject: draft.subject, text, pdfBase64, note: null }, abort.signal);
        material.analyzer = 'claude';
      } catch (e) {
        if (e instanceof Stop) throw e;
        const err = e as AiError;
        if (err.kind === 'aborted') throw new Stop('취소했어요', true);
        throw new Stop(err.message || '분석하지 못했어요', chars >= 300);
      } finally {
        clearInterval(tick);
        replaceChildren(foot);
      }
    } else {
      if (chars < 300) {
        throw new Stop(
          pdfData
            ? '글자를 읽을 수 없는 PDF예요(스캔본·사진). Claude 정밀 분석을 켜거나, 텍스트를 붙여 넣어 주세요'
            : '자료가 너무 짧아요. 노트나 요약을 조금 더 붙여 넣어 주세요',
        );
      }
      await wait(300);
      concepts = analyzeText(pages).concepts;
      if (concepts.length < 3) throw new Stop('자료에서 학습할 개념을 찾지 못했어요. Claude 정밀 분석을 켜면 더 잘 찾아요');
    }
    set(2, 'done', `핵심 ${concepts.length}개 찾음`);
    if (left) return;

    // 4. 생존 루트
    set(3, 'active');
    const exam: Exam = {
      id: crypto.randomUUID(),
      subject: draft.subject,
      examAt: draft.examAt,
      createdAt: now.toISOString(),
      material,
      concepts,
      progress: {},
      sessions: [],
      course: null,
    };
    const plan = makePlan(exam, now);
    await wait(550);
    set(3, 'done', `${plan.todo.length}개 · ${plan.minutes}분`);
    app.store.put(exam);
    await wait(350);
    if (!left) app.go({ name: 'plan', examId: exam.id, fresh: true }, { replace: true });
  };

  run().catch((e: unknown) => {
    if (left) return;
    const stop = e instanceof Stop ? e : new Stop('문제가 생겼어요. 다시 시도해 주세요');
    for (const s of steps) if (s.el.className === 'active') s.el.className = 'failed';
    screen.classList.add('failed');
    title.textContent = '분석하지 못했어요';
    sub.textContent = '자료만 바꾸면 바로 다시 할 수 있어요.';
    replaceChildren(
      foot,
      h('p', { class: 'banner warn', role: 'alert' }, stop.message),
      stop.retryLocal &&
        h('button', {
          type: 'button',
          class: 'btn primary block',
          textContent: '빠른 분석으로 계속하기',
          onClick: () => app.go({ name: 'analyze', draft: { ...draft, useClaude: false } }, { replace: true }),
        }),
      h('button', { type: 'button', class: 'btn ghost block', textContent: '자료 다시 고르기', onClick: () => app.go({ name: 'create', draft }, { replace: true }) }),
    );
  });

  return () => {
    left = true;
    abort.abort();
  };
}
