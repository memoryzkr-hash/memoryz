/** Tiny DOM helpers. Text always goes through textContent, never innerHTML (AI and PDF text included). */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key in el && !key.includes('-')) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function replaceChildren(el: Element, ...children: Child[]): void {
  el.textContent = '';
  append(el, children);
}

/** Multi-line text (questions with a quoted passage) without innerHTML. */
export function lines(text: string): Node[] {
  return text.split('\n').flatMap((line, i) => (i === 0 ? [document.createTextNode(line)] : [h('br'), document.createTextNode(line)]));
}

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, kind: 'plain' | 'gain' = 'plain'): void {
  toastEl?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(() => el.remove(), 2200);
}

export interface Sheet {
  body: HTMLElement;
  close: () => void;
}

export function openSheet(title: string, onClose?: () => void): Sheet {
  const body = h('div', { class: 'sheet-body' });
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', textContent: '✕', onClick: () => close() })),
    body,
  );
  const backdrop = h('div', { class: 'backdrop' }, panel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose?.();
  };
  document.body.appendChild(backdrop);
  return { body, close };
}

export function confirmSheet(title: string, message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet(title, () => {
      if (!answered) resolve(false);
    });
    const done = (v: boolean) => {
      answered = true;
      sheet.close();
      resolve(v);
    };
    append(sheet.body, [
      h('p', null, message),
      h(
        'div',
        { class: 'row gap' },
        h('button', { type: 'button', class: 'btn ghost grow', textContent: '취소', onClick: () => done(false) }),
        h('button', { type: 'button', class: 'btn danger grow', textContent: okLabel, onClick: () => done(true) }),
      ),
    ]);
  });
}

/** Ring gauge for 준비도. */
export function gauge(value: number, size: 'lg' | 'sm' = 'lg', target?: number): HTMLElement {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const el = h('div', { class: `gauge ${size}`, role: 'img', 'aria-label': `시험 준비도 ${v} / 100` });
  el.style.setProperty('--v', String(v));
  if (target !== undefined) el.style.setProperty('--t', String(Math.max(v, Math.min(100, Math.round(target)))));
  append(el, [h('div', { class: 'gauge-num' }, h('b', null, String(v)), h('span', null, '/100'))]);
  return el;
}

export function bar(value: number, target?: number): HTMLElement {
  const v = Math.max(0, Math.min(100, value));
  const el = h('div', { class: 'bar' }, h('div', { class: 'bar-target' }), h('div', { class: 'bar-fill' }));
  el.style.setProperty('--v', `${v}%`);
  el.style.setProperty('--t', `${Math.max(v, Math.min(100, target ?? v))}%`);
  return el;
}
