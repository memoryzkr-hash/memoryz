import './survive.css';
import { createAi, type Ai } from './ai';
import { SurviveStore } from './core/store';
import type { App, View } from './ui/app';
import { renderAnalyze } from './ui/analyze';
import { renderCourse } from './ui/course';
import { renderCreate } from './ui/create';
import { renderDone } from './ui/done';
import { renderHome } from './ui/home';
import { renderPlan } from './ui/plan';

function safeStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
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

const root = document.getElementById('app')!;
const store = new SurviveStore(safeStorage());
let ai: Ai | null = null;
let aiKey: string | null = null;
/** Each screen may hand back a cleanup (timers, listeners) that runs when we leave it. */
let leave: (() => void) | void;
let current: View = { name: 'home' };

const app: App = {
  store,
  now: () => new Date(),
  go(view, opts) {
    if (opts?.replace) history.replaceState({ v: view.name }, '');
    else history.pushState({ v: view.name }, '');
    show(view);
  },
  ai() {
    const key = store.apiKey();
    if (!key) return null;
    if (key !== aiKey) {
      ai = createAi(key);
      aiKey = key;
    }
    return ai;
  },
  resetAi() {
    ai = null;
    aiKey = null;
  },
};

function show(view: View): void {
  leave?.();
  leave = undefined;
  current = view;
  // A "+1 준비도" toast from the last card would cover the next screen's title.
  document.querySelector('.toast')?.remove();
  document.body.dataset.view = view.name;
  root.textContent = '';
  window.scrollTo(0, 0);
  switch (view.name) {
    case 'home':
      leave = renderHome(root, app);
      break;
    case 'create':
      leave = renderCreate(root, app, view.draft);
      break;
    case 'analyze':
      leave = renderAnalyze(root, app, view.draft);
      break;
    case 'plan':
      leave = renderPlan(root, app, view.examId, !!view.fresh);
      break;
    case 'course':
      leave = renderCourse(root, app, view.examId, view.goalMinutes);
      break;
    case 'done':
      leave = renderDone(root, app, view.examId, view.summary);
      break;
  }
}

// Phone back button: from a study card go to the plan (progress is already saved), elsewhere go home.
window.addEventListener('popstate', () => {
  if (current.name === 'course' || current.name === 'done') show({ name: 'plan', examId: current.examId });
  else if (current.name === 'analyze') return void history.pushState({ v: 'analyze' }, '');
  else show({ name: 'home' });
});

// The clock moves while the tab sleeps: the plan screen recomputes the route when we come back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (current.name === 'plan' || current.name === 'home') && !document.querySelector('.backdrop')) show(current);
});

history.replaceState({ v: 'home' }, '');
show({ name: 'home' });
