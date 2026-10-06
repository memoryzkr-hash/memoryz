/** Tiny DOM helpers. Text always goes through textContent, never innerHTML (AI and user text included). */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in el && !key.includes('-')) {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else el.setAttribute(key, value === true ? '' : String(value));
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

// ---------- toast ----------

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** 2 s for plain notes, 5 s when there is an action (되돌리기). */
export function toast(message: string, action?: { label: string; run: () => void }): void {
  toastEl?.remove();
  clearTimeout(toastTimer);
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { class: 'msg' }, message),
    action &&
      h('button', {
        type: 'button',
        textContent: action.label,
        onClick: () => {
          el.remove();
          action.run();
        },
      }),
  );
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(() => el.remove(), action ? 5000 : 2000);
}

// ---------- bottom sheet ----------

export interface Sheet {
  body: HTMLElement;
  close: () => void;
}

const openSheets: Sheet[] = [];

export function closeAllSheets(): void {
  while (openSheets.length) openSheets[openSheets.length - 1].close();
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
    if (e.key === 'Escape' && openSheets[openSheets.length - 1] === sheet) close();
  };
  document.addEventListener('keydown', onKey);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    openSheets.splice(openSheets.indexOf(sheet), 1);
    onClose?.();
  };
  const sheet: Sheet = { body, close };
  openSheets.push(sheet);
  document.body.appendChild(backdrop);
  return sheet;
}

/** Two-button confirm in a sheet. */
export function confirmSheet(title: string, message: string, okLabel: string, danger = true): Promise<boolean> {
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
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn', textContent: '취소', onClick: () => done(false) }),
        h('button', { type: 'button', class: danger ? 'btn danger' : 'btn', textContent: okLabel, onClick: () => done(true) }),
      ),
    ]);
  });
}

/** Character counter that turns red past the limit. */
export function counter(): { el: HTMLElement; set: (n: number, max: number) => void } {
  const el = h('span', { class: 'count' });
  return {
    el,
    set(n, max) {
      el.textContent = `${n}/${max}`;
      el.classList.toggle('over', n > max);
    },
  };
}

export async function copyText(text: string, fallbackSelect: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallbackSelect.focus();
    fallbackSelect.select();
    return false;
  }
}

export function download(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
