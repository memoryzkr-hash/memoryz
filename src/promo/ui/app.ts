/** Dashboard shell: which backend is connected, the loaded model, and simple routing (#home, #blog, #instagram, #threads, #settings). */
import { createGitHubBackend, repoFromLocation, BackendError, type Backend } from './backend';
import { h, replaceChildren, store, toast } from './kit';
import type { Model, UiPlatform } from './model';
import { UI_PLATFORMS } from './model';
import { createPreviewBackend } from './preview';

export type Route = 'home' | UiPlatform | 'settings';

export interface App {
  backend: Backend;
  m: Model | null;
  error: string | null;
  route: Route;
  /** Section to scroll to after navigating (e.g. "make"). */
  focus: string | null;
  go(route: Route, focus?: string | null): void;
  render(): void;
  reload(): Promise<void>;
  connect(repo: string, token: string): Promise<boolean>;
  usePreview(): void;
  defaultRepo(): string;
  /** Runs an action with a toast on failure; returns false when it failed. */
  act(run: () => Promise<unknown>, done?: string): Promise<boolean>;
}

const KEY_REPO = 'promo.dashboard.repo';
const KEY_TOKEN = 'promo.dashboard.token';
/** Set in the shareable claude.ai build, whose sandbox cannot reach api.github.com. */
export const PREVIEW_ONLY = import.meta.env.VITE_PROMO_PREVIEW_ONLY === '1';
export const LIVE_URL = 'https://memoryzkr-hash.github.io/memoryz/promo.html';

type View = (app: App) => HTMLElement;

export function createApp(root: HTMLElement, views: Record<'home' | 'platform' | 'settings', View>): App {
  const repo = store.get(KEY_REPO);
  const token = store.get(KEY_TOKEN);
  const app: App = {
    backend: !PREVIEW_ONLY && repo && token ? createGitHubBackend(repo, token) : createPreviewBackend(),
    m: null,
    error: null,
    route: 'home',
    focus: null,

    go(route, focus = null) {
      app.route = route;
      app.focus = focus;
      if (location.hash.slice(1) !== route) history.replaceState(null, '', `#${route}`);
      app.render();
      if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0 });
    },

    render() {
      let body: HTMLElement;
      if (app.error) {
        body = h(
          'div',
          { class: 'wrap' },
          h('div', { class: 'notice bad' }, h('b', null, '불러오지 못했어요'), h('span', null, app.error)),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onClick: () => app.reload() }, '다시 불러오기'), h('button', { class: 'btn', type: 'button', onClick: () => app.go('settings') }, '연결 설정'), h('button', { class: 'btn ghost', type: 'button', onClick: () => app.usePreview() }, '미리보기로 보기')),
        );
      } else if (!app.m) body = h('div', { class: 'wrap' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
      else body = app.route === 'home' ? views.home(app) : app.route === 'settings' ? views.settings(app) : views.platform(app);
      replaceChildren(root, body);
    },

    async reload() {
      app.error = null;
      app.render();
      try {
        app.m = await app.backend.load();
      } catch (e) {
        app.m = null;
        app.error = e instanceof BackendError ? e.message : (e as Error).message || '알 수 없는 오류';
      }
      app.render();
    },

    async connect(r, t) {
      const backend = createGitHubBackend(r.trim(), t.trim());
      try {
        app.m = await backend.load();
        app.backend = backend;
        app.error = null;
        store.set(KEY_REPO, r.trim());
        store.set(KEY_TOKEN, t.trim());
        toast(`${r.trim()}에 연결했어요`);
        app.go('home');
        return true;
      } catch (e) {
        toast(e instanceof BackendError ? e.message : '연결하지 못했어요');
        return false;
      }
    },

    usePreview() {
      store.set(KEY_TOKEN, null);
      app.backend = createPreviewBackend();
      void app.reload().then(() => app.go('home'));
    },

    defaultRepo() {
      return store.get(KEY_REPO) ?? repoFromLocation(location) ?? '';
    },

    async act(run, done) {
      try {
        await run();
        if (done) toast(done);
        return true;
      } catch (e) {
        toast(e instanceof BackendError ? e.message : (e as Error).message || '실패했어요');
        return false;
      }
    },
  };

  const fromHash = () => {
    const t = location.hash.slice(1);
    if (t === 'home' || t === 'settings' || (UI_PLATFORMS as string[]).includes(t)) app.route = t as Route;
  };
  fromHash();
  window.addEventListener('hashchange', () => {
    fromHash();
    app.render();
  });
  return app;
}
