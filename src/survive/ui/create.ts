/** STEP 2 시험 생성: 과목, 날짜, 자료. Three inputs, nothing else. */
import { MAX_PDF_BYTES } from '../ai';
import { localDate } from '../core/plan';
import { SAMPLE_MATERIAL, SAMPLE_SUBJECT } from '../core/sample';
import type { App, Draft } from './app';
import { h, replaceChildren, toast } from './dom';
import { keySheet } from './key';

const QUICK_DAYS: [string, number][] = [
  ['오늘', 0],
  ['내일', 1],
  ['모레', 2],
  ['3일 뒤', 3],
  ['일주일 뒤', 7],
];

export function renderCreate(root: HTMLElement, app: App, initial: Partial<Draft> = {}): void {
  const now = app.now();
  const plusDays = (n: number) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const draft: Draft = {
    subject: initial.subject ?? '',
    examAt: initial.examAt ?? '',
    file: initial.file ?? null,
    text: initial.text ?? '',
    sample: initial.sample ?? false,
    useClaude: initial.useClaude ?? !!app.store.apiKey(),
  };
  let date = draft.examAt.split('T')[0] ?? '';
  let time = draft.examAt.split('T')[1] ?? '09:00';
  let mode: 'file' | 'text' | 'sample' | null = draft.sample ? 'sample' : draft.file ? 'file' : draft.text ? 'text' : null;

  const subject = h('input', { class: 'input', id: 'subject', placeholder: '예: 약리학', maxLength: 40, value: draft.subject, autocomplete: 'off' });
  const dateInput = h('input', { class: 'input', type: 'date', id: 'date', min: plusDays(0), value: date, 'aria-label': '시험 날짜' });
  const timeInput = h('input', { class: 'input time', type: 'time', value: time, 'aria-label': '시험 시간' });
  const chips = h('div', { class: 'chips' });
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf,.txt,.md,text/plain', class: 'visually-hidden', id: 'file' });
  const textArea = h('textarea', { class: 'input textarea', placeholder: '강의 노트, 요약본, 교재 내용을 붙여 넣으세요', value: draft.text });
  const materialBox = h('div');
  const analyzer = h('div');
  const go = h('button', { type: 'submit', class: 'btn primary xl block', textContent: 'AI 분석 시작' });

  const drawChips = () => {
    replaceChildren(
      chips,
      ...QUICK_DAYS.map(([label, n]) =>
        h('button', {
          type: 'button',
          class: `chip ${date === plusDays(n) ? 'on' : ''}`,
          textContent: label,
          onClick: () => {
            date = plusDays(n);
            dateInput.value = date;
            refresh();
          },
        }),
      ),
    );
  };

  const tile = (key: 'file' | 'text' | 'sample', icon: string, title: string, sub: string) =>
    h(
      'button',
      {
        type: 'button',
        class: `tile ${mode === key ? 'on' : ''}`,
        'aria-pressed': String(mode === key),
        onClick: () => {
          if (key === 'file') {
            fileInput.click();
            return;
          }
          mode = key;
          if (key === 'sample' && !subject.value.trim()) subject.value = SAMPLE_SUBJECT;
          refresh();
          if (key === 'text') textArea.focus();
        },
      },
      h('span', { class: 'tile-ico', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'tile-title' }, title),
      h('span', { class: 'tile-sub' }, sub),
    );

  const drawMaterial = () => {
    const fileName = draft.file && mode === 'file' ? draft.file.name : null;
    replaceChildren(
      materialBox,
      h(
        'div',
        { class: 'tiles' },
        tile('file', '📄', fileName ? '파일 바꾸기' : 'PDF 올리기', fileName ?? 'PDF · TXT'),
        tile('text', '📝', '붙여넣기', '노트·요약 텍스트'),
        tile('sample', '💊', '샘플로 체험', `${SAMPLE_SUBJECT} ${SAMPLE_MATERIAL.pages}쪽`),
      ),
      mode === 'text' && textArea,
      mode === 'sample' && h('p', { class: 'muted small' }, `‘${SAMPLE_MATERIAL.name}’를 미리 분석해 둔 자료로 바로 체험해요.`),
    );
  };

  const drawAnalyzer = () => {
    if (mode === 'sample') {
      replaceChildren(analyzer);
      return;
    }
    const hasKey = !!app.store.apiKey();
    replaceChildren(
      analyzer,
      h(
        'div',
        { class: 'seg', role: 'radiogroup', 'aria-label': '분석 방식' },
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(!draft.useClaude), class: !draft.useClaude ? 'on' : '', onClick: () => ((draft.useClaude = false), refresh()) }, h('b', null, '빠른 분석'), h('span', null, '무료 · 기기 안에서')),
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(draft.useClaude),
            class: draft.useClaude ? 'on' : '',
            onClick: () => {
              if (!hasKey) keySheet(app, () => ((draft.useClaude = !!app.store.apiKey()), refresh()));
              else ((draft.useClaude = true), refresh());
            },
          },
          h('b', null, 'Claude 정밀 분석'),
          h('span', null, hasKey ? 'API 키 연결됨' : 'API 키 필요'),
        ),
      ),
    );
  };

  const ready = () => !!subject.value.trim() && !!date && (mode === 'sample' || (mode === 'file' && !!draft.file) || (mode === 'text' && textArea.value.trim().length >= 80));

  const refresh = () => {
    drawChips();
    drawMaterial();
    drawAnalyzer();
    go.disabled = !ready();
  };

  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (f.size > MAX_PDF_BYTES * 3) {
      toast('파일이 너무 커요 (90MB 이하)');
      return;
    }
    draft.file = f;
    mode = 'file';
    if (!subject.value.trim()) subject.value = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
    refresh();
  });
  dateInput.addEventListener('change', () => {
    date = dateInput.value;
    refresh();
  });
  timeInput.addEventListener('change', () => (time = timeInput.value || '09:00'));
  subject.addEventListener('input', () => (go.disabled = !ready()));
  textArea.addEventListener('input', () => (go.disabled = !ready()));

  const form = h(
    'form',
    { class: 'screen create', novalidate: true },
    h('div', { class: 'topnav' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': '뒤로', textContent: '←', onClick: () => history.back() }), h('span', { class: 'step' }, '시험 만들기')),
    h('h1', null, '어떤 시험이에요?'),
    h('label', { class: 'field', for: 'subject' }, h('span', { class: 'label' }, '과목명'), subject),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '시험 날짜'), chips, h('div', { class: 'row gap' }, dateInput, timeInput)),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '시험 자료'), materialBox, fileInput),
    analyzer,
    h('div', { class: 'sticky-cta' }, go, h('p', { class: 'muted small center' }, '계획은 AI가 세워요. 당신은 시작만 누르면 돼요.')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ready()) return;
    if (`${date}T${time}` <= `${plusDays(0)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`) {
      toast('시험 시간이 이미 지났어요. 날짜를 확인해 주세요');
      return;
    }
    app.go({
      name: 'analyze',
      draft: {
        subject: subject.value.trim(),
        examAt: `${date}T${time}`,
        file: mode === 'file' ? draft.file : null,
        text: mode === 'text' ? textArea.value : '',
        sample: mode === 'sample',
        useClaude: mode !== 'sample' && draft.useClaude && !!app.store.apiKey(),
      },
    });
  });
  refresh();
  root.append(form);
  if (!subject.value) subject.focus();
}
