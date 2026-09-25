// 작은 DOM 도우미: HTML 이스케이프, 토스트, 아래에서 올라오는 시트.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

/** 시트를 열고 본문 요소를 돌려준다. 바깥이나 [data-close]를 누르면 닫힌다. */
export function openSheet(title: string, bodyHtml: string): HTMLElement {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.id = 'sheet';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>`;
  wrap.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-close]')) closeSheet();
  });
  document.body.append(wrap);
  return wrap.querySelector('.sheet-body') as HTMLElement;
}

export function closeSheet(): void {
  document.getElementById('sheet')?.remove();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 문자 앱 링크. iOS는 본문 앞에 '&'를, 나머지는 '?'를 쓴다. */
export function smsLink(phone: string, body: string): string {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `sms:${phone.replace(/[^\d+]/g, '')}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
