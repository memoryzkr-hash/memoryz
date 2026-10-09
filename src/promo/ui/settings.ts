/** 설정: my brand (what every post is written from), the Claude key, and the GitHub connection. */
import type { App } from './app';
import { LIVE_URL, PREVIEW_ONLY } from './app';
import { h, icon, toast } from './kit';

function brandSection(app: App): HTMLElement {
  const m = app.m!;
  const name = h('input', { class: 'input', id: 'brand-name', value: m.config.brand.name, placeholder: '예: 단백한끼' });
  const handle = h('input', { class: 'input', id: 'brand-handle', value: m.config.brand.handle, placeholder: '예: @danbaek.meal' });
  const doc = h('textarea', { class: 'textarea', id: 'brand-doc', rows: 12, value: m.brandDoc, placeholder: '무엇을 파는지, 누구에게, 어떤 말투로, 꼭 강조할 것과 하지 말 것을 적어 주세요' });
  const review = h('input', { type: 'checkbox', role: 'switch', id: 'brand-review', checked: m.config.mode === 'review' });
  const form = h(
    'form',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, '내 브랜드')),
    h('p', { class: 'help' }, '모든 글은 여기 적은 내용을 바탕으로 만들어져요. 자세할수록 글이 좋아져요.'),
    h('div', { class: 'field' }, h('label', { htmlFor: 'brand-name' }, '브랜드 이름'), name),
    h('div', { class: 'field' }, h('label', { htmlFor: 'brand-handle' }, '대표 계정 (카드 이미지에 들어가요)'), handle),
    h('div', { class: 'field' }, h('label', { htmlFor: 'brand-doc' }, '브랜드 소개'), doc),
    h('label', { class: 'switch', style: 'justify-content:space-between' }, h('span', null, '자동으로 만든 글은 내가 확인한 뒤 올리기'), review, h('span', { class: 'track', 'aria-hidden': 'true' })),
    h('p', { class: 'help' }, '켜 두면 자동화가 만든 글이 "확인 대기"로 남아요. 처음 1~2주는 켜 두는 걸 권해요.'),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, '저장')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return toast('브랜드 이름을 적어 주세요');
    await app.act(() => app.backend.saveBrand(m, { name: name.value.trim(), handle: handle.value.trim(), doc: doc.value, review: review.checked }), '저장했어요');
    app.render();
  });
  return form;
}

function claudeSection(app: App): HTMLElement | null {
  if (app.backend.kind !== 'github') return null;
  const m = app.m!;
  const key = h('input', { class: 'input', id: 'claude-key', type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…' });
  const form = h(
    'form',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, '글 쓰는 AI (Claude)'), h('span', { class: `chip ${m.accounts.claude ? 'ok' : 'warn'}` }, m.accounts.claude ? '등록됨' : '등록 필요')),
    h('p', { class: 'help' }, 'console.anthropic.com에서 API 키를 만들고, 월 사용 한도를 꼭 걸어 두세요.'),
    h('div', { class: 'field' }, h('label', { htmlFor: 'claude-key' }, 'Anthropic API 키'), key),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, m.accounts.claude ? '바꾸기' : '등록')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!key.value.trim().startsWith('sk-')) return toast('sk-로 시작하는 키를 넣어 주세요');
    await app.act(() => app.backend.registerAccount(m, 'claude', { token: key.value.trim() }), 'Claude 키를 등록했어요');
    app.render();
  });
  return form;
}

function githubSection(app: App): HTMLElement {
  if (PREVIEW_ONLY) {
    return h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, '실제로 올리려면')),
      h('p', { class: 'help' }, '이 링크는 미리보기예요. 보안 때문에 여기서는 GitHub에 접속할 수 없어서, 계정 등록과 게시는 아래 주소의 앱에서 해요. 설정은 같은 화면이에요.'),
      h('p', { class: 'mono' }, LIVE_URL),
    );
  }
  const repo = h('input', { class: 'input', id: 'gh-repo', value: app.defaultRepo(), placeholder: '내아이디/저장소', autocomplete: 'off' });
  const token = h('input', { class: 'input', id: 'gh-token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, '연결');
  const form = h(
    'form',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'GitHub 연결'), app.backend.kind === 'github' ? h('span', { class: 'chip ok' }, '연결됨') : h('span', { class: 'chip warn' }, '미리보기 중')),
    h('p', { class: 'help' }, '에이전트는 GitHub에서 매시간 돌아요. 연결하면 계정 등록, 글 만들기, 자동화 설정이 실제로 적용돼요.'),
    h('div', { class: 'field' }, h('label', { htmlFor: 'gh-repo' }, '저장소'), repo),
    h('div', { class: 'field' }, h('label', { htmlFor: 'gh-token' }, '접근 토큰'), token, h('span', { class: 'help' }, 'github.com/settings/personal-access-tokens에서 이 저장소만 골라 Contents · Actions · Secrets · Variables를 "읽기·쓰기"로 만들어요. 이 브라우저에만 저장돼요.')),
    h('div', { class: 'row end' }, app.backend.kind === 'github' ? h('button', { class: 'btn ghost', type: 'button', onClick: () => app.usePreview() }, '연결 끊기') : null, btn),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!repo.value.includes('/') || !token.value.trim()) return toast('저장소(계정/이름)와 토큰을 모두 넣어 주세요');
    btn.setAttribute('disabled', '');
    btn.textContent = '연결 중…';
    await app.connect(repo.value, token.value);
    btn.removeAttribute('disabled');
    btn.textContent = '연결';
  });
  return form;
}

export function settingsView(app: App): HTMLElement {
  return h(
    'div',
    { class: 'wrap' },
    h('div', { class: 'bar' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': '처음으로', onClick: () => app.go('home') }, icon('back')), h('span', { class: 'bar-title' }, '설정'), h('span')),
    brandSection(app),
    claudeSection(app),
    githubSection(app),
  );
}
