import './assistant.css';
import { createAi, type Ai } from './ai';
import { browserTimeZone, todayIn } from './core/dates';
import { createDbStorage, type DbLike } from './core/dbStorage';
import { AssistantStore, KEYS, type StorageLike } from './core/store';
import { createSampleAi, type SampleLike } from './sampleAi';
import type { App, Screen, View } from './ui/app';
import { h, replaceChildren, toast } from './ui/dom';
import { eventsScreen } from './ui/events';
import { messagesScreen } from './ui/messages';
import { newsScreen } from './ui/news';
import { settingsScreen } from './ui/settings';
import { renderStart } from './ui/start';

type Tab = Exclude<View, 'start' | 'settings'>;
const TABS: { view: Tab; icon: string; label: string }[] = [
  { view: 'news', icon: '📰', label: '소식' },
  { view: 'events', icon: '📅', label: '일정' },
  { view: 'messages', icon: '✉️', label: '메시지' },
];

function safeStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    // Some private modes throw on access; an in-memory stand-in keeps the app usable for this visit.
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: () => {
        throw new Error('storage unavailable');
      },
      removeItem: (k: string) => void mem.delete(k),
    } as unknown as Storage;
  }
}

/** The Claude artifact viewer puts `window.claude` on the page before any script runs. */
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

interface Boot {
  mode: App['mode'];
  storage: StorageLike;
  savedIn: App['savedIn'];
  /** No-key mode only: Claude through the viewer's account (null when this view cannot). */
  claudeAi?: Ai | null;
}

const DB_KEYS = [KEYS.settings, KEYS.topics, KEYS.briefings, KEYS.events];

async function boot(): Promise<void> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (typeof host?.use !== 'function') {
    start({ mode: 'key', storage: safeStorage(), savedIn: 'browser' });
    return;
  }
  const root = document.getElementById('app')!;
  root.append(h('p', { class: 'muted', style: 'padding-top:40px;text-align:center' }, '불러오는 중…'));
  const use = (name: string) => host.use(name).catch(() => null);
  const [sample, db, user] = await Promise.all([use('sample'), use('db'), use('user')]);
  let storage: StorageLike = safeStorage();
  let savedIn: App['savedIn'] = 'browser';
  const id = user ? await (user as { id(): Promise<string | null> }).id().catch(() => null) : null;
  if (db && id) {
    try {
      storage = await createDbStorage(db as DbLike, id, DB_KEYS, () => toast('계정에 저장하지 못했어요. 잠시 후 다시 해 주세요'));
      savedIn = 'account';
    } catch {
      // Fall back to this browser's storage for this visit.
    }
  }
  root.textContent = '';
  start({ mode: 'claude', storage, savedIn, claudeAi: sample ? createSampleAi(sample as SampleLike) : null });
}

function start(cfg: Boot): void {
  const store = new AssistantStore(cfg.storage);
  let ai: Ai | null = null;
  let aiKey: string | null = null;
  let view: View = 'news';
  let lastTab: Tab = 'news';
  let noticeDismissed = false;

  const appEl = document.getElementById('app')!;
  const notice = h('div');
  const viewEl = h('main');
  const title = h('h1');
  const topRight = h('div');
  const topbar = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' }, title, topRight));
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const tabbar = h(
    'nav',
    { class: 'tabbar', 'aria-label': '메뉴' },
    h(
      'div',
      { class: 'tabbar-inner' },
      ...TABS.map((t) => {
        const b = h('button', { type: 'button', onClick: () => app.go(t.view) }, h('span', { class: 'ico', 'aria-hidden': 'true' }, t.icon), t.label);
        tabButtons.set(t.view, b);
        return b;
      }),
    ),
  );
  appEl.append(notice, viewEl);
  document.body.prepend(topbar);
  document.body.append(tabbar);

  const app: App = {
    mode: cfg.mode,
    savedIn: cfg.savedIn,
    store,
    ai() {
      if (cfg.mode === 'claude') return cfg.claudeAi ?? null;
      const key = store.apiKey();
      if (!key) return null;
      if (key !== aiKey) {
        ai = createAi(key);
        aiKey = key;
      }
      return ai;
    },
    today: () => todayIn(browserTimeZone()),
    timeZone: browserTimeZone,
    go(next) {
      if (cfg.mode === 'claude') view = next === 'start' ? lastTab : next;
      else view = next !== 'start' && !store.apiKey() ? 'start' : next;
      if (view === 'news' || view === 'events' || view === 'messages') lastTab = view;
      draw();
      window.scrollTo(0, 0);
    },
    isShowing: (v) => view === v,
    refresh: () => draw(),
    composeAbout(event) {
      messages.useEvent(event);
      app.go('messages');
    },
  };

  const messages = messagesScreen(app);
  const screens: Record<Exclude<View, 'start'>, Screen> = {
    news: newsScreen(app),
    events: eventsScreen(app),
    messages,
    settings: settingsScreen(app, () => {
      ai = null;
      aiKey = null;
    }),
  };

  function draw(): void {
    const start = view === 'start';
    topbar.hidden = start;
    tabbar.hidden = start || view === 'settings';
    appEl.classList.toggle('no-tabs', tabbar.hidden);

    if (!start && cfg.mode === 'claude' && !cfg.claudeAi) {
      replaceChildren(
        notice,
        h('div', { class: 'banner warn', role: 'alert' }, h('span', { class: 'msg' }, '여기서는 Claude를 쓸 수 없어요. claude.ai에서 이 페이지를 열어 주세요. 일정은 직접 입력할 수 있어요.')),
      );
    } else if (!start && store.corrupt.length && !noticeDismissed) {
      replaceChildren(
        notice,
        h(
          'div',
          { class: 'banner warn', role: 'alert' },
          h('span', { class: 'msg' }, '저장된 데이터 일부를 읽지 못했어요. 원래 내용은 따로 보관해 두었어요.'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', textContent: '✕', onClick: () => ((noticeDismissed = true), draw()) }),
        ),
      );
    } else replaceChildren(notice);

    if (start) {
      renderStart(viewEl, store, () => app.go(lastTab));
      return;
    }

    const screen = screens[view as Exclude<View, 'start'>];
    title.textContent = screen.title;
    replaceChildren(
      topRight,
      view === 'settings'
        ? h('button', { type: 'button', class: 'link-btn', textContent: '완료', onClick: () => app.go(lastTab) })
        : h('button', { type: 'button', class: 'icon-btn', 'aria-label': '설정', textContent: '⚙', onClick: () => app.go('settings') }),
    );
    for (const [v, b] of tabButtons) b.setAttribute('aria-current', v === view ? 'page' : 'false');
    screen.render(viewEl);
  }

  // The date can roll over while the tab sits in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && view !== 'start' && !document.querySelector('.backdrop')) draw();
  });


  app.go('news');
}

void boot();
