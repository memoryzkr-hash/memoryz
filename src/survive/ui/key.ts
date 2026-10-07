/** Claude 정밀 분석 key: optional, kept only in this browser. */
import { createAi } from '../ai';
import type { App } from './app';
import { append, h, openSheet, replaceChildren, toast } from './dom';

export function keySheet(app: App, onSaved?: () => void): void {
  const sheet = openSheet('Claude 정밀 분석');
  const has = !!app.store.apiKey();
  const input = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Anthropic API 키' });
  const err = h('p', { class: 'err small', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'btn primary block', textContent: '키 확인하고 저장' });
  const form = h('form', { class: 'stack' }, input, err, save);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = input.value.trim();
    if (!/^sk-ant-\S{10,}$/.test(key)) {
      replaceChildren(err, 'sk-ant- 로 시작하는 키를 붙여 넣어 주세요');
      return;
    }
    save.disabled = true;
    save.textContent = '확인 중…';
    try {
      await createAi(key).testKey();
      if (!app.store.setApiKey(key)) throw new Error('이 브라우저에서는 키를 저장할 수 없어요');
      app.resetAi();
      toast('정밀 분석을 켰어요');
      sheet.close();
      onSaved?.();
    } catch (error) {
      replaceChildren(err, (error as Error).message || '확인하지 못했어요');
    } finally {
      save.disabled = false;
      save.textContent = '키 확인하고 저장';
    }
  });
  append(sheet.body, [
    h('p', null, '키가 없어도 앱은 그대로 동작해요(빠른 분석). 키를 넣으면 Claude가 자료를 읽고 문제를 직접 만들어서 더 정확해요.'),
    form,
    h(
      'ul',
      { class: 'notes small' },
      h('li', null, '키는 이 브라우저에만 저장되고, 이 기기에서 Claude API로 바로 보내요(중간 서버 없음).'),
      h('li', null, '자료 1개 분석 = Claude 호출 1번. 100쪽 자료 기준 대략 수백 원 수준이에요. 콘솔에서 월 사용 한도를 꼭 걸어 두세요.'),
      h('li', null, '키 받는 곳: ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'console.anthropic.com ↗')),
    ),
    has &&
      h('button', {
        type: 'button',
        class: 'btn ghost block',
        textContent: '저장된 키 지우기',
        onClick: () => {
          app.store.setApiKey(null);
          app.resetAi();
          toast('키를 지웠어요');
          sheet.close();
          onSaved?.();
        },
      }),
  ]);
  input.focus();
}
