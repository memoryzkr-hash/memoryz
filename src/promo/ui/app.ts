/** Dashboard shell: which source is connected, the loaded snapshot, navigation, and re-rendering. */
import type { Draft } from '../core/types';
import { createDemoSource } from './demo';
import { h, icon, replaceChildren, store, toast } from './kit';
import { createGitHubSource, repoFromLocation, SourceError, type DraftFile, type Snapshot, type Source } from './source';

export type ViewId = 'home' | 'drafts' | 'inbox' | 'history' | 'settings';

export interface App {
  source: Source;
  snap: Snapshot | null;
  error: string | null;
  view: ViewId;
  /** Draft path open on the drafts desk. */
  openDraft: string | null;
  go(view: ViewId, draftPath?: string | null): void;
  render(): void;
  reload(): Promise<void>;
  connect(repo: string, token: string): Promise<boolean>;
  useDemo(): void;
  saveDraft(file: DraftFile, draft: Draft, message: string, done: string): Promise<boolean>;
  pendingInbox(): Snapshot['state']['inbox'];
  defaultRepo(): string;
}

const KEY_REPO = 'promo.dashboard.repo';
const KEY_TOKEN = 'promo.dashboard.token';
const NAV: { id: ViewId; label: string }[] = [
  { id: 'home', label: '오늘' },
  { id: 'drafts', label: '초안' },
  { id: 'inbox', label: '댓글함' },
  { id: 'history', label: '기록' },
  { id: 'settings', label: '설정' },
];

type Renderer = (app: App) => HTMLElement;

export function createApp(root: HTMLElement, views: Record<ViewId, Renderer>): App {
  const savedRepo = store.get(KEY_REPO);
  const savedToken = store.get(KEY_TOKEN);
  const app: App = {
    source: savedRepo && savedToken ? createGitHubSource(savedRepo, savedToken) : createDemoSource(),
    snap: null,
    error: null,
    view: 'home',
    openDraft: null,

    go(view, draftPath = null) {
      app.view = view;
      app.openDraft = draftPath;
      const hash = draftPath ? `draft-${draftPath.replace(/^drafts\//, '').replace(/\.md$/, '')}` : view;
      if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
      app.render();
      window.scrollTo({ top: 0 });
    },

    render() {
      const badge = (id: ViewId) => {
        if (!app.snap) return null;
        const n = id === 'inbox' ? app.pendingInbox().length : id === 'drafts' ? app.snap.drafts.filter((d) => d.draft?.status === 'draft').length : 0;
        return n ? h('span', { class: 'badge', 'aria-label': `${n}개` }, String(n)) : null;
      };
      const navBtn = (cls: string, n: (typeof NAV)[number]) =>
        h(
          'button',
          { class: cls, type: 'button', 'aria-current': app.view === n.id ? 'page' : undefined, onClick: () => app.go(n.id) },
          icon(n.id),
          h('span', null, n.label),
          badge(n.id),
        );
      const brandName = app.snap?.config?.brand.name || '홍보 에이전트';
      const rail = h(
        'aside',
        { class: 'rail' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-name' }, brandName), h('span', { class: 'brand-sub' }, '홍보 에이전트 관제실')),
        ...NAV.map((n) => navBtn('rail-link', n)),
        h('div', { class: 'rail-foot' }, sourceChip(app), app.snap ? h('span', null, `불러온 시각 ${app.snap.loadedAt.toTimeString().slice(0, 5)}`) : null),
      );
      const tabbar = h('nav', { class: 'tabbar', 'aria-label': '메뉴' }, ...NAV.map((n) => navBtn('tab', n)));
      let body: HTMLElement;
      if (!app.snap && !app.error) body = h('div', { class: 'view' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
      else if (app.error && app.view !== 'settings')
        body = h(
          'div',
          { class: 'view' },
          h('div', { class: 'notice bad' }, h('b', null, '불러오지 못했어요'), h('span', null, app.error)),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: () => app.reload() }, '다시 불러오기'), h('button', { class: 'btn', type: 'button', onClick: () => app.go('settings') }, '연결 설정 열기'), h('button', { class: 'btn ghost', type: 'button', onClick: () => app.useDemo() }, '예시 데이터로 보기')),
        );
      else body = views[app.view](app);
      replaceChildren(root, h('div', { class: 'app' }, rail, h('main', { class: 'main', id: 'main' }, body), tabbar));
    },

    async reload() {
      app.error = null;
      app.render();
      try {
        app.snap = await app.source.load();
      } catch (e) {
        app.snap = null;
        app.error = e instanceof SourceError ? e.message : (e as Error).message || '알 수 없는 오류';
      }
      app.render();
    },

    async connect(repo, token) {
      const source = createGitHubSource(repo.trim(), token.trim());
      try {
        const snap = await source.load();
        app.source = source;
        app.snap = snap;
        app.error = null;
        store.set(KEY_REPO, repo.trim());
        store.set(KEY_TOKEN, token.trim());
        toast(`${repo.trim()}에 연결했어요`);
        app.go('home');
        return true;
      } catch (e) {
        toast(e instanceof SourceError ? e.message : '연결하지 못했어요. 브라우저가 GitHub에 접속할 수 없는 화면일 수 있어요');
        return false;
      }
    },

    useDemo() {
      store.set(KEY_TOKEN, null);
      app.source = createDemoSource();
      void app.reload().then(() => app.go('home'));
    },

    async saveDraft(file, draft, message, done) {
      try {
        const next = await app.source.saveDraft(file, draft, message);
        if (app.snap) app.snap.drafts = app.snap.drafts.map((d) => (d.path === file.path ? next : d));
        toast(done);
        app.render();
        return true;
      } catch (e) {
        toast(e instanceof SourceError ? e.message : '저장하지 못했어요');
        return false;
      }
    },

    pendingInbox() {
      if (!app.snap) return [];
      const done = new Set(app.snap.inboxDone);
      return app.snap.state.inbox.filter((i) => !done.has(i.key));
    },

    defaultRepo() {
      return store.get(KEY_REPO) ?? repoFromLocation(location) ?? '';
    },
  };

  const fromHash = () => {
    const t = location.hash.slice(1);
    if (t.startsWith('draft-')) {
      app.view = 'drafts';
      app.openDraft = `drafts/${t.slice(6)}.md`;
    } else if (NAV.some((n) => n.id === t)) {
      app.view = t as ViewId;
      app.openDraft = null;
    }
  };
  fromHash();
  window.addEventListener('hashchange', () => {
    fromHash();
    app.render();
  });
  return app;
}

export function sourceChip(app: App): HTMLElement {
  return app.source.kind === 'demo'
    ? h('span', { class: 'chip warn', title: '설정에서 GitHub을 연결하면 실제 데이터가 보여요' }, h('span', { class: 'dot' }), '예시 데이터')
    : h('span', { class: 'chip ok', title: app.source.label }, h('span', { class: 'dot' }), app.source.label);
}

export function topbar(app: App, ...extra: (HTMLElement | null)[]): HTMLElement {
  const cfg = app.snap?.config;
  return h(
    'div',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-name' }, cfg?.brand.name || '홍보 에이전트'), h('span', { class: 'brand-sub' }, '관제실')),
    h('div', { class: 'chips' }, cfg ? h('span', { class: 'chip accent' }, cfg.mode === 'auto' ? '자동 발행' : '승인 후 발행') : null, sourceChip(app), ...extra),
  );
}
