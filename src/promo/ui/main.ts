/** 홍보 에이전트 관제실 (promo.html): see what the agent made, approve drafts, answer escalated comments, run it. */
import './promo.css';
import { createApp } from './app';
import { draftsView } from './drafts';
import { inboxView, settingsView } from './more';
import { historyView, homeView } from './overview';

const app = createApp(document.getElementById('app')!, {
  home: homeView,
  drafts: draftsView,
  inbox: inboxView,
  history: historyView,
  settings: settingsView,
});
void app.reload();
let wide = window.matchMedia('(min-width: 1100px)').matches;
window.addEventListener('resize', () => {
  const now = window.matchMedia('(min-width: 1100px)').matches;
  if (now !== wide) {
    wide = now;
    app.render();
  }
});
