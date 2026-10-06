/** S2 일정, S2a 확인 카드, S2b 일정 상세, S2c 공유 (02-screens.md). */
import { toAiError } from '../ai';
import { formatLong, formatShort, sectionOf, type Section } from '../core/dates';
import { buildIcs, icsFileName } from '../core/ics';
import { emptyDraft, LIMITS } from '../core/rules';
import { UndoSlot, type Removed } from '../core/store';
import { charCount, cleanMultiLine, cleanSingleLine } from '../core/text';
import type { CalEvent, EventDraft, EventField } from '../core/types';
import type { App, Screen } from './app';
import { confirmSheet, counter, download, h, openSheet, replaceChildren, toast } from './dom';

const EXAMPLE = '다음 주 화요일 3시 강남역에서 민수랑 미팅';
const SECTION_TITLES: Record<Exclude<Section, 'past'>, string> = { today: '오늘', week: '이번 주', later: '나중' };

interface EditorOptions {
  draft: EventDraft;
  source: CalEvent['source'];
  editingId?: string;
  aiFilled?: EventField[];
  uncertain?: EventField[];
  interpretation?: string | null;
}

export function eventsScreen(app: App): Screen {
  let root: HTMLElement;
  let parsing: AbortController | null = null;
  let aiError: string | null = null;
  let pastOpen = false;
  let typed = '';
  const undo = new UndoSlot<Removed<CalEvent>>();

  const rerender = () => {
    if (root && app.isShowing('events')) render(root);
  };

  function render(el: HTMLElement): void {
    root = el;
    const today = app.today();
    const events = app.store.events();

    const input = h('input', {
      class: 'input',
      id: 'event-text',
      placeholder: '말하듯 적어 보세요',
      autocomplete: 'off',
      value: typed,
      disabled: !!parsing,
      onInput: (e: Event) => {
        typed = (e.target as HTMLInputElement).value;
        send.disabled = !typed.trim();
      },
    });
    const send = h('button', { type: 'submit', class: 'send', 'aria-label': '보내기', textContent: parsing ? '…' : '➤', disabled: !!parsing || !typed.trim() });
    const form = h('form', { class: 'input-send', style: 'margin-top:8px' }, input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void parse(typed.trim());
    });

    const parts: (Node | null | false)[] = [
      form,
      !!aiError &&
        h(
          'div',
          { class: 'banner error', role: 'alert' },
          h('span', { class: 'msg' }, aiError),
          h('button', { type: 'button', class: 'link-btn', textContent: '직접 입력', onClick: () => openEditor({ draft: emptyDraft(), source: 'manual' }) }),
        ),
      h('button', { type: 'button', class: 'link-btn', textContent: '＋ 직접 입력', onClick: () => openEditor({ draft: emptyDraft(), source: 'manual' }) }),
    ];

    if (events.length === 0) {
      parts.push(
        h(
          'button',
          {
            type: 'button',
            class: 'empty',
            style: 'width:100%;background:none;font:inherit',
            onClick: () => {
              typed = EXAMPLE;
              rerender();
              root.querySelector<HTMLInputElement>('#event-text')?.focus();
            },
          },
          h('div', null, '예: ', EXAMPLE),
          h('div', { class: 'small' }, '눌러서 입력칸에 넣기'),
        ),
      );
    }

    const bySection = new Map<Section, CalEvent[]>();
    for (const e of events) {
      const s = sectionOf(e.date, today);
      bySection.set(s, [...(bySection.get(s) ?? []), e]);
    }
    for (const s of ['today', 'week', 'later'] as const) {
      const list = bySection.get(s);
      if (!list?.length) continue;
      const title = s === 'today' ? `오늘 · ${formatLong(today)}` : SECTION_TITLES[s];
      parts.push(h('div', { class: 'section-title' }, title), h('ul', { class: 'event-list' }, ...list.map((e) => row(e, s === 'today'))));
    }
    const past = bySection.get('past') ?? [];
    if (past.length) {
      parts.push(
        h('button', { type: 'button', class: 'collapse', 'aria-expanded': String(pastOpen), textContent: `${pastOpen ? '▾' : '▸'} 지난 일정 (${past.length})`, onClick: () => ((pastOpen = !pastOpen), rerender()) }),
        pastOpen && h('ul', { class: 'event-list' }, ...[...past].reverse().map((e) => row(e, false, true))),
      );
    }
    replaceChildren(el, ...parts);
  }

  function row(e: CalEvent, isToday: boolean, past = false): HTMLElement {
    const when = isToday ? (e.start ?? '종일') : `${formatShort(e.date)}${e.start ? ` ${e.start}` : ''}`;
    return h(
      'li',
      null,
      h(
        'button',
        { type: 'button', class: past ? 'event-row past' : 'event-row', onClick: () => openDetail(e) },
        h('span', { class: 'when' }, when),
        h('span', null, h('span', { class: 'title' }, e.title), e.location && h('span', { class: 'place' }, `📍 ${e.location}`)),
        h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'),
      ),
    );
  }

  // ---------- AI parse ----------

  async function parse(text: string): Promise<void> {
    const ai = app.ai();
    if (!text || parsing || !ai) return;
    aiError = null;
    parsing = new AbortController();
    rerender();
    try {
      const res = await ai.parseEvent(text, app.today(), app.timeZone(), parsing.signal);
      const aiFilled = (Object.keys(res.draft) as EventField[]).filter((k) => res.draft[k]);
      parsing = null;
      rerender();
      openEditor({ draft: res.draft, source: 'ai', aiFilled, uncertain: res.uncertain, interpretation: res.interpretation }, () => {
        typed = '';
      });
    } catch (e) {
      const err = toAiError(e);
      parsing = null;
      aiError = err.kind === 'aborted' ? null : `지금은 AI를 쓸 수 없어요 (${err.message})`;
      rerender();
    }
  }

  // ---------- S2a ----------

  function openEditor(opts: EditorOptions, onSaved?: () => void): void {
    const sheet = openSheet(opts.editingId ? '일정 수정' : '일정 확인');
    const today = app.today();
    const unsure = new Set(opts.uncertain ?? []);
    const ai = new Set(opts.aiFilled ?? []);

    type Control = HTMLInputElement | HTMLTextAreaElement;
    const controls = {} as Record<EventField, Control>;
    const hints = {} as Record<EventField, HTMLElement>;
    const counters: Partial<Record<EventField, ReturnType<typeof counter>>> = {};
    const limits: Partial<Record<EventField, number>> = { title: LIMITS.eventTitle, location: LIMITS.eventLocation, memo: LIMITS.eventMemo };

    const make = (field: EventField, label: string, control: Control) => {
      control.id = `ev-${field}`;
      control.value = opts.draft[field];
      control.classList.toggle('ai', ai.has(field) && !!opts.draft[field]);
      control.classList.toggle('unsure', unsure.has(field));
      control.addEventListener('input', () => {
        control.classList.remove('unsure', 'ai');
        update();
      });
      hints[field] = h('span');
      const hint = h('div', { class: 'hint' }, hints[field]);
      if (limits[field]) {
        counters[field] = counter();
        hint.append(counters[field]!.el);
      }
      controls[field] = control;
      return h('label', { class: 'field', for: control.id }, h('span', { class: 'label' }, label), control, hint);
    };

    const save = h('button', { type: 'submit', class: 'btn primary', textContent: '저장' });
    const form = h(
      'form',
      { novalidate: true },
      make('title', '제목', h('input', { class: 'input', autocomplete: 'off' })),
      make('date', '날짜', h('input', { class: 'input', type: 'date' })),
      h(
        'div',
        { class: 'row', style: 'align-items:flex-start' },
        h('div', { class: 'spacer' }, make('start', '시작', h('input', { class: 'input', type: 'time' }))),
        h('div', { class: 'spacer' }, make('end', '끝', h('input', { class: 'input', type: 'time' }))),
      ),
      make('location', '장소', h('input', { class: 'input', autocomplete: 'off' })),
      make('memo', '메모', h('textarea', { class: 'textarea' })),
      opts.interpretation && h('p', { class: 'interpret' }, `💡 ${opts.interpretation.replace(/[.。\s]+$/, '')}. 맞는지 확인해 주세요.`),
      !opts.interpretation && unsure.has('date') && h('p', { class: 'interpret' }, '💡 날짜를 골라 주세요.'),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'btn', textContent: '취소', onClick: () => sheet.close() }), save),
    );

    const read = (): EventDraft => ({
      title: controls.title.value,
      date: controls.date.value,
      start: controls.start.value,
      end: controls.end.value,
      location: controls.location.value,
      memo: controls.memo.value,
    });

    function update() {
      const draft = read();
      const check = app.store.checkEvent(draft, today, opts.editingId);
      for (const f of Object.keys(controls) as EventField[]) {
        const err = check.errors[f];
        const warn = check.warnings[f];
        let text: Node | null = null;
        if (err) text = h('span', { class: 'err' }, err);
        else if (warn) text = h('span', { class: 'warn' }, warn);
        else if (f === 'date' && draft.date && !err) text = h('span', null, formatLong(draft.date));
        else if (f === 'date' && unsure.has('date') && !draft.date) text = h('span', { class: 'warn' }, '날짜를 골라 주세요');
        replaceChildren(hints[f], text);
        const c = counters[f];
        if (c) {
          const clean = f === 'memo' ? cleanMultiLine(draft[f]) : cleanSingleLine(draft[f]);
          c.set(charCount(clean), limits[f]!);
        }
      }
      save.disabled = !check.value;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const res = app.store.saveEvent(read(), today, opts.source, opts.editingId);
      if (!res.ok) {
        if (res.message) toast(res.message);
        return;
      }
      sheet.close();
      onSaved?.();
      toast('저장됨');
      rerender();
    });

    sheet.body.append(form);
    update();
    (unsure.has('date') ? controls.date : controls.title).focus();
  }

  // ---------- S2b ----------

  function openDetail(e: CalEvent): void {
    const sheet = openSheet(e.title);
    const time = e.start ? `${e.start}${e.end ? ` ~ ${e.end}` : ''}` : '종일';
    sheet.body.append(
      h(
        'dl',
        { class: 'detail' },
        h('dt', null, '날짜'),
        h('dd', null, `${formatLong(e.date)} · ${time}`),
        e.location && h('dt', null, '장소'),
        e.location && h('dd', null, e.location),
        e.memo && h('dt', null, '메모'),
        e.memo && h('dd', null, e.memo),
      ),
      h(
        'div',
        { class: 'sheet-actions', style: 'grid-template-columns:1fr 1fr 1fr' },
        h('button', {
          type: 'button',
          class: 'btn',
          textContent: '수정',
          onClick: () => {
            sheet.close();
            openEditor({
              draft: { title: e.title, date: e.date, start: e.start ?? '', end: e.end ?? '', location: e.location ?? '', memo: e.memo ?? '' },
              source: e.source,
              editingId: e.id,
            });
          },
        }),
        h('button', { type: 'button', class: 'btn', textContent: '공유', onClick: () => (sheet.close(), openShare(e)) }),
        h('button', {
          type: 'button',
          class: 'btn danger',
          textContent: '삭제',
          onClick: async () => {
            sheet.close();
            if (await confirmSheet('일정 삭제', '이 일정을 지울까요?', '삭제')) remove(e);
          },
        }),
      ),
    );
  }

  function remove(e: CalEvent): void {
    const removed = app.store.removeEvent(e.id);
    if (!removed) return toast('저장하지 못했어요');
    undo.hold(removed);
    rerender();
    toast('삭제됨', {
      label: '되돌리기',
      run: () => {
        const r = undo.take();
        if (r && !app.store.restoreEvent(r)) toast('되돌리지 못했어요');
        rerender();
      },
    });
  }

  // ---------- S2c ----------

  function openShare(e: CalEvent): void {
    const sheet = openSheet('일정 공유');
    sheet.body.append(
      h('div', { class: 'event-pill' }, h('span', null, `📅 ${summary(e)}`)),
      h(
        'button',
        {
          type: 'button',
          class: 'share-option',
          onClick: () => {
            download(icsFileName(e), buildIcs(e), 'text/calendar;charset=utf-8');
            toast('파일을 받았어요');
          },
        },
        h('strong', null, '📥 캘린더 파일(.ics) 받기'),
        h('span', { class: 'muted small' }, '받은 사람이 열면 자기 캘린더에 추가돼요'),
      ),
      h(
        'button',
        { type: 'button', class: 'share-option', onClick: () => (sheet.close(), app.composeAbout(e)) },
        h('strong', null, '✉️ 알림 메시지 쓰기'),
        h('span', { class: 'muted small' }, '일정 내용을 넣어 초안을 써 줘요'),
      ),
    );
  }

  return { title: '일정', render };
}

/** `10/13 (화) 15:00 민수 미팅 · 강남역` */
export function summary(e: CalEvent): string {
  return `${formatShort(e.date)}${e.start ? ` ${e.start}` : ''} ${e.title}${e.location ? ` · ${e.location}` : ''}`;
}
