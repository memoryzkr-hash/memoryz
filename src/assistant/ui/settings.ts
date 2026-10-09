/** S4 설정 (02-screens.md). */
import { LIMITS, maskApiKey } from '../core/rules';
import type { Settings } from '../core/types';
import { KEY_VERSION_URL, type App, type Screen } from './app';
import { confirmSheet, h, openSheet, replaceChildren, toast } from './dom';
import { keyForm } from './start';

export function settingsScreen(app: App, onKeyChanged: () => void): Screen {
  let root: HTMLElement;

  const update = (patch: Partial<Settings>) => {
    if (!app.store.setSettings({ ...app.store.settings(), ...patch })) toast('저장하지 못했어요');
    render(root);
  };

  function render(el: HTMLElement): void {
    root = el;
    const s = app.store.settings();
    const key = app.store.apiKey();
    const searches = Array.from({ length: LIMITS.searchesMax - LIMITS.searchesMin + 1 }, (_, i) => i + LIMITS.searchesMin);

    replaceChildren(
      el,
      ...(app.mode === 'key'
        ? [
          h('div', { class: 'section-title' }, 'API 키'),
          h(
            'div',
            { class: 'settings-group' },
            h(
              'div',
              { class: 'item row' },
              h('code', { class: 'spacer' }, key ? maskApiKey(key) : '없음'),
              h('button', { type: 'button', class: 'btn small', textContent: '바꾸기', onClick: changeKey }),
              h('button', { type: 'button', class: 'btn small danger', textContent: '지우기', onClick: clearKey }),
            ),
          ),
          h('div', { class: 'section-title' }, '브리핑'),
          h(
            'div',
            { class: 'settings-group' },
            h(
              'div',
              { class: 'item' },
              h('div', null, '주제당 검색 횟수'),
              h('div', { class: 'small muted', style: 'margin-bottom:8px' }, '많을수록 정확하지만 비용이 늘어요'),
              h(
                'div',
                { class: 'segmented', role: 'group', 'aria-label': '주제당 검색 횟수' },
                ...searches.map((n) => h('button', { type: 'button', 'aria-pressed': String(s.searchesPerTopic === n), textContent: String(n), onClick: () => update({ searchesPerTopic: n }) })),
              ),
            ),
            h(
              'div',
              { class: 'item' },
              h('div', null, '브리핑 언어'),
              h('div', { class: 'small muted', style: 'margin-bottom:8px' }, '요약은 항상 한국어로 써요'),
              h(
                'div',
                { class: 'segmented', role: 'group', 'aria-label': '브리핑 언어' },
                h('button', { type: 'button', 'aria-pressed': String(s.briefingLanguage === 'ko+en'), textContent: '한국어 + 영어 기사', onClick: () => update({ briefingLanguage: 'ko+en' }) }),
                h('button', { type: 'button', 'aria-pressed': String(s.briefingLanguage === 'ko'), textContent: '한국어 기사만', onClick: () => update({ briefingLanguage: 'ko' }) }),
              ),
            ),
          ),
          ]
        : [
            h('div', { class: 'section-title' }, 'AI 연결'),
            h(
              'div',
              { class: 'settings-group' },
              h('div', { class: 'item' }, 'Claude 계정으로 연결돼 있어요. API 키가 필요 없고, 쓴 만큼 내 Claude 사용량에서 빠져요.'),
              h(
                'div',
                { class: 'item small muted' },
                '이 버전은 웹 검색을 못 해요. 최신 소식을 자동으로 찾으려면 ',
                h('a', { href: KEY_VERSION_URL, target: '_blank', rel: 'noopener' }, 'API 키 버전 ↗'),
              ),
            ),
          ]),
      h('div', { class: 'section-title' }, '데이터'),
      h(
        'div',
        { class: 'settings-group' },
        h('div', { class: 'item' }, h('button', { type: 'button', class: 'btn danger', style: 'width:100%', textContent: '모든 데이터 지우기', onClick: clearAll })),
        h('div', { class: 'item small muted' }, app.savedIn === 'account' ? '데이터는 내 Claude 계정에 나만 볼 수 있게 저장돼요. 다른 기기에서 열어도 이어져요.' : '데이터는 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 함께 지워져요.'),
      ),
      h('p', { class: 'small muted', style: 'text-align:center' }, '개인 비서 v1 · memoryz'),
    );
  }

  function changeKey(): void {
    const sheet = openSheet('API 키 바꾸기');
    sheet.body.append(
      keyForm(app.store, '바꾸기', () => {
        sheet.close();
        onKeyChanged();
        toast('키를 바꿨어요');
      }),
    );
    sheet.body.querySelector<HTMLInputElement>('#api-key')?.focus();
  }

  async function clearKey(): Promise<void> {
    if (!(await confirmSheet('API 키 지우기', '키를 지우면 다시 입력할 때까지 AI 기능을 쓸 수 없어요.', '지우기'))) return;
    app.store.clearApiKey();
    onKeyChanged();
    app.go('start');
  }

  async function clearAll(): Promise<void> {
    if (!(await confirmSheet('모든 데이터 지우기', app.mode === 'key' ? '주제, 브리핑, 일정, API 키가 모두 지워져요.' : '주제, 브리핑, 일정이 모두 지워져요.', '모두 지우기'))) return;
    app.store.clearAll();
    onKeyChanged();
    app.go('start');
  }

  return { title: '설정', render };
}
