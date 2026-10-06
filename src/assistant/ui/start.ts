/** S0 시작 — API key entry (02-screens.md). Also reused by 설정 → 키 바꾸기. */
import { createAi } from '../ai';
import { checkApiKey } from '../core/rules';
import type { AssistantStore } from '../core/store';
import { h, replaceChildren } from './dom';

const NO_STORAGE = '이 브라우저에서는 저장할 수 없어요. 일반 창에서 열어 주세요';

export function keyForm(store: AssistantStore, submitLabel: string, onSaved: () => void): HTMLElement {
  const input = h('input', {
    class: 'input',
    type: 'password',
    id: 'api-key',
    placeholder: 'sk-ant-…',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
  });
  const eye = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '키 보기', textContent: '👁' });
  const error = h('div', { class: 'hint', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn primary', textContent: submitLabel, disabled: true });

  eye.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  input.addEventListener('input', () => {
    submit.disabled = !input.value.trim();
    replaceChildren(error);
  });

  const form = h(
    'form',
    { class: 'key-form', novalidate: true },
    h('label', { class: 'field', for: 'api-key' }, h('span', { class: 'label' }, 'Anthropic API 키'), h('div', { class: 'key-row' }, input, eye), error),
  );

  const showError = (msg: string, retry = false) => {
    replaceChildren(
      error,
      h('span', { class: 'err' }, msg),
      retry && h('button', { type: 'submit', class: 'link-btn', textContent: '다시 시도' }),
    );
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const check = checkApiKey(input.value);
    if (!check.ok) {
      if (check.message) showError(check.message);
      return;
    }
    if (!store.available) {
      showError(NO_STORAGE);
      return;
    }
    submit.disabled = true;
    submit.textContent = '확인 중…';
    try {
      await createAi(check.key).testKey();
      if (!store.setApiKey(check.key)) {
        showError(NO_STORAGE);
        return;
      }
      onSaved();
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      if (kind === 'auth') showError('키가 맞지 않아요. 콘솔에서 다시 복사해 주세요');
      else if (kind === 'network') showError('인터넷 연결을 확인해 주세요', true);
      else showError((err as Error).message || '확인하지 못했어요', true);
    } finally {
      submit.disabled = !input.value.trim();
      submit.textContent = submitLabel;
    }
  });

  form.append(submit);
  return form;
}

export function renderStart(root: HTMLElement, store: AssistantStore, onSaved: () => void): void {
  replaceChildren(
    root,
    h(
      'div',
      { class: 'start' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, '🤖'),
      h('h1', null, '개인 비서'),
      h('p', { class: 'tagline' }, '최신 소식 · 일정 · 메시지 초안'),
      keyForm(store, '시작하기', onSaved),
      h(
        'div',
        { class: 'notes' },
        h('p', null, '🔒 키는 이 브라우저에만 저장됩니다. 서버로 보내지 않습니다.'),
        h('p', null, '키 받는 곳: ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'console.anthropic.com ↗')),
        h('p', null, '⚠ 콘솔에서 월 사용 한도를 걸어 두세요.'),
      ),
    ),
  );
  root.querySelector<HTMLInputElement>('#api-key')?.focus();
}
