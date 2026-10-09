/** Home: three automations side by side — blog, Instagram, Threads. */
import type { App } from './app';
import { PREVIEW_ONLY } from './app';
import { h, icon, inFuture, toast } from './kit';
import { automationOf, BLOG_KIND_NAME, describeCycle, hasAccount, hourLabel, nextPost, UI_NAME, UI_PLATFORMS, uiOf, type Model, type UiPlatform } from './model';
import { DAY_KO } from './model';

export const MARK: Record<UiPlatform, string> = { blog: 'B', instagram: 'IG', threads: '@' };
const DAY = 86400000;

export function subtitle(m: Model, ui: UiPlatform): string {
  if (ui === 'blog') return m.blogKind === 'wordpress' ? '워드프레스 · 자동 발행' : `${BLOG_KIND_NAME[m.blogKind]} · 복사해서 붙여넣기`;
  if (ui === 'instagram') return '카드뉴스 + 캡션';
  return '짧은 글 + 이어지는 타래';
}

export function pendingFor(app: App, ui: UiPlatform) {
  const m = app.m!;
  const done = new Set(m.inboxDone);
  return m.state.inbox.filter((i) => uiOf(i.platform) === ui && !done.has(i.key));
}

export function weekStats(m: Model, ui: UiPlatform) {
  const since = Date.now() - 7 * DAY;
  const posts = m.state.posts.filter((p) => uiOf(p.platform) === ui && new Date(p.at).getTime() >= since).length;
  const replies = Object.entries(m.state.comments).filter(([k, c]) => uiOf(k.split(':')[0] as never) === ui && c.action === 'reply' && new Date(c.at).getTime() >= since).length;
  return { posts, replies };
}

/** The on/off switch shared by the home card and the platform page. */
export function automationSwitch(app: App, ui: UiPlatform, label: string): HTMLElement {
  const m = app.m!;
  const a = automationOf(m.config, ui, m.blogKind);
  const input = h('input', { type: 'checkbox', role: 'switch', checked: a.on, 'aria-label': `${UI_NAME[ui]} 자동화` });
  input.addEventListener('change', async () => {
    if (input.checked && !hasAccount(m, ui)) {
      input.checked = false;
      toast('먼저 계정을 등록해 주세요');
      app.go(ui, 'account');
      return;
    }
    input.disabled = true;
    const ok = await app.act(() => app.backend.saveAutomation(m, ui, { ...a, on: input.checked }), input.checked ? `${UI_NAME[ui]} 자동화를 켰어요 · ${describeCycle(a)}` : `${UI_NAME[ui]} 자동화를 껐어요`);
    if (!ok) input.checked = !input.checked;
    app.render();
  });
  return h('label', { class: 'switch' }, label ? h('span', null, label) : null, input, h('span', { class: 'track', 'aria-hidden': 'true' }));
}

function card(app: App, ui: UiPlatform): HTMLElement {
  const m = app.m!;
  const a = automationOf(m.config, ui, m.blogKind);
  const account = hasAccount(m, ui);
  const next = nextPost(m.config, ui, m.blogKind);
  const stats = weekStats(m, ui);
  const pending = pendingFor(app, ui).length;
  let state: HTMLElement;
  if (!account) state = h('div', { class: 'state need' }, h('b', null, '계정을 등록해 주세요'), h('span', null, '등록하면 바로 자동화를 켤 수 있어요'));
  else if (a.on)
    state = h(
      'div',
      { class: 'state on' },
      h('b', null, describeCycle(a)),
      next ? h('span', { class: 'dim' }, `다음 게시 ${DAY_KO[next.weekday]}요일 ${hourLabel(Number(next.time.slice(0, 2)))} · ${inFuture(next.minutes)}`) : null,
    );
  else state = h('div', { class: 'state' }, h('b', null, '자동화 꺼짐'), h('span', { class: 'dim' }, '켜면 정한 주기마다 글을 만들어 올려요'));

  return h(
    'article',
    { class: `pcard ${ui}` },
    h('div', { class: 'pcard-head' }, h('span', { class: 'pmark', 'aria-hidden': 'true' }, MARK[ui]), h('div', null, h('h2', null, `${UI_NAME[ui]} 자동화`), h('p', { class: 'sub' }, subtitle(m, ui))), automationSwitch(app, ui, '')),
    state,
    h(
      'div',
      { class: 'minis' },
      h('span', null, '최근 7일 글 ', h('b', null, String(stats.posts))),
      ui === 'blog' && m.blogKind !== 'wordpress' ? null : h('span', null, '자동 답글 ', h('b', null, String(stats.replies))),
      pending ? h('span', { style: 'color:var(--warn);font-weight:700' }, `직접 답할 댓글 ${pending}`) : null,
    ),
    h(
      'div',
      { class: 'pcard-foot' },
      h('button', { class: 'btn primary', type: 'button', onClick: () => app.go(ui, 'make') }, '글 만들기'),
      h('button', { class: 'btn', type: 'button', onClick: () => app.go(ui) }, account ? '관리' : '계정 등록'),
    ),
  );
}

export function homeView(app: App): HTMLElement {
  const m = app.m!;
  const on = UI_PLATFORMS.filter((ui) => automationOf(m.config, ui, m.blogKind).on);
  const nexts = on.map((ui) => ({ ui, n: nextPost(m.config, ui, m.blogKind) })).filter((x) => x.n).sort((a, b) => a.n!.minutes - b.n!.minutes);
  const first = nexts[0];
  return h(
    'div',
    { class: 'wrap wide' },
    h(
      'div',
      { class: 'bar' },
      h('div', { class: 'bar-title' }, m.config.brand.name || '홍보 자동화'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': '설정', onClick: () => app.go('settings') }, icon('settings')),
    ),
    h(
      'header',
      { class: 'hello' },
      h('h1', null, '홍보 자동화'),
      h('p', null, on.length ? `자동화 ${on.length}개 켜짐${first ? ` · 다음 게시는 ${UI_NAME[first.ui]} ${inFuture(first.n!.minutes)}` : ''}` : '플랫폼마다 계정을 등록하고 자동화를 켜 보세요'),
    ),
    app.backend.kind === 'preview' ? h('div', { class: 'note-preview' }, PREVIEW_ONLY ? '미리보기 · 글 만들기는 실제로 되고, 게시는 연결된 앱에서 돼요' : '미리보기 · 설정에서 GitHub을 연결하면 실제로 올라가요') : null,
    !m.config.brand.name || !m.brandDoc.trim()
      ? h('button', { class: 'alert-row', type: 'button', onClick: () => app.go('settings') }, h('span', { class: 'dot' }), h('span', { style: 'flex:1' }, '내 브랜드 소개를 먼저 적어 주세요. 글은 이 내용을 바탕으로 만들어져요'), h('span', null, '›'))
      : null,
    h('div', { class: 'cards' }, ...UI_PLATFORMS.map((ui) => card(app, ui))),
  );
}
