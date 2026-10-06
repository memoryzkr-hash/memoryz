/** S3 메시지 (02-screens.md). Inputs and drafts live in memory only: they survive tab switches, not reloads. */
import { toAiError } from '../ai';
import { LIMITS, checkMessageRequest } from '../core/rules';
import { charCount, cleanMultiLine } from '../core/text';
import type { CalEvent, MessageRequest, Relation } from '../core/types';
import { RELATION_LABELS } from '../prompts';
import type { App, Screen } from './app';
import { copyText, counter, h, replaceChildren, toast } from './dom';
import { summary } from './events';

const RELATIONS: Relation[] = ['boss', 'coworker', 'friend', 'family', 'client', 'custom'];

export interface MessagesScreen extends Screen {
  useEvent(e: CalEvent): void;
}

export function messagesScreen(app: App): MessagesScreen {
  let root: HTMLElement;
  let relation: Relation | null = null;
  const req: Omit<MessageRequest, 'relation'> = { customRelation: '', name: '', intent: '', tone: 'polite', event: null };
  let drafts: string[] = [];
  let busy: AbortController | null = null;
  let error: string | null = null;

  const rerender = () => {
    if (root && app.isShowing('messages')) render(root);
  };

  const request = (): MessageRequest | null => (relation ? { ...req, relation } : null);
  const canSend = () => {
    const r = request();
    return !!r && checkMessageRequest(r).ok && !busy;
  };

  function render(el: HTMLElement): void {
    root = el;
    const intentCount = counter();
    const button = h('button', { type: 'submit', class: 'btn primary', textContent: busy ? '쓰는 중…' : '✍️ 초안 쓰기', disabled: !canSend() });
    const refresh = () => {
      intentCount.set(charCount(cleanMultiLine(req.intent)), LIMITS.intent);
      button.disabled = !canSend();
    };

    const custom = h('input', {
      class: 'input',
      placeholder: '예: 동아리 선배',
      value: req.customRelation,
      hidden: relation !== 'custom',
      'aria-label': '관계 직접 입력',
      onInput: (e: Event) => ((req.customRelation = (e.target as HTMLInputElement).value), refresh()),
    });

    const form = h(
      'form',
      null,
      req.event &&
        h(
          'div',
          { class: 'event-pill' },
          h('span', null, `📅 ${summary(req.event)}`),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': '일정 빼기', textContent: '✕', onClick: () => ((req.event = null), rerender()) }),
        ),
      h('div', { class: 'section-title' }, '누구에게'),
      h(
        'div',
        { class: 'chips', role: 'group', 'aria-label': '받는 사람' },
        ...RELATIONS.map((r) =>
          h('button', {
            type: 'button',
            class: 'chip plain',
            'aria-pressed': String(relation === r),
            textContent: RELATION_LABELS[r],
            onClick: () => {
              relation = r;
              rerender();
              if (r === 'custom') root.querySelector<HTMLInputElement>('input[aria-label="관계 직접 입력"]')?.focus();
            },
          }),
        ),
      ),
      h('div', { style: 'margin-top:8px' }, custom),
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'label' }, '이름 (선택)'),
        h('input', { class: 'input', value: req.name, autocomplete: 'off', onInput: (e: Event) => ((req.name = (e.target as HTMLInputElement).value), refresh()) }),
      ),
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'label' }, '하고 싶은 말'),
        h('textarea', {
          class: 'textarea',
          id: 'intent',
          value: req.intent,
          placeholder: '예: 내일 오후 반차 쓴다고',
          onInput: (e: Event) => ((req.intent = (e.target as HTMLTextAreaElement).value), refresh()),
        }),
        h('div', { class: 'hint' }, h('span'), intentCount.el),
      ),
      h('div', { class: 'section-title' }, '말투'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': '말투' },
        h('button', { type: 'button', 'aria-pressed': String(req.tone === 'polite'), textContent: '정중하게', onClick: () => ((req.tone = 'polite'), rerender()) }),
        h('button', { type: 'button', 'aria-pressed': String(req.tone === 'casual'), textContent: '편하게', onClick: () => ((req.tone = 'casual'), rerender()) }),
      ),
      h('div', { style: 'margin-top:16px' }, button),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void write();
    });
    refresh();

    const parts: (Node | null | false)[] = [form];
    if (error) {
      parts.push(
        h('div', { class: 'banner error', role: 'alert' }, h('span', { class: 'msg' }, error), h('button', { type: 'button', class: 'link-btn', textContent: '다시 시도', onClick: () => void write() })),
      );
    }
    if (busy) {
      for (const n of [1, 2]) {
        parts.push(h('div', { class: 'draft' }, h('div', { class: 'label' }, `초안 ${n}`), h('div', { class: 'skeleton', style: 'width:92%' }), h('div', { class: 'skeleton', style: 'width:70%' })));
      }
    } else {
      drafts.forEach((text, i) => parts.push(draftCard(text, i)));
      if (drafts.length) parts.push(h('button', { type: 'button', class: 'link-btn', textContent: '↻ 다시 쓰기', disabled: !canSend(), onClick: () => void write() }));
    }
    replaceChildren(el, ...parts);
  }

  function draftCard(text: string, i: number): HTMLElement {
    const area = h('textarea', {
      class: 'textarea',
      value: text,
      'aria-label': `초안 ${i + 1}`,
      onInput: (e: Event) => (drafts[i] = (e.target as HTMLTextAreaElement).value),
    });
    const copy = h('button', { type: 'button', class: 'btn small', textContent: '📋 복사' });
    copy.addEventListener('click', async () => {
      if (await copyText(drafts[i], area)) {
        copy.textContent = '✓ 복사됨';
        setTimeout(() => (copy.textContent = '📋 복사'), 1000);
        toast('복사됨');
      } else {
        toast('길게 눌러 복사해 주세요');
      }
    });
    return h('div', { class: 'draft' }, h('div', { class: 'label' }, `초안 ${i + 1}`), area, h('div', { class: 'row' }, h('span', { class: 'spacer' }), copy));
  }

  async function write(): Promise<void> {
    const r = request();
    const ai = app.ai();
    if (!r || !ai || busy || !checkMessageRequest(r).ok) return;
    error = null;
    busy = new AbortController();
    rerender();
    try {
      drafts = await ai.draftMessages(r, app.today(), app.timeZone(), busy.signal);
    } catch (e) {
      const err = toAiError(e);
      if (err.kind !== 'aborted') error = err.kind === 'bad' ? '초안을 받지 못했어요' : err.message;
    }
    busy = null;
    rerender();
  }

  return {
    title: '메시지',
    render,
    useEvent(e) {
      req.event = e;
      drafts = [];
      error = null;
    },
  };
}
