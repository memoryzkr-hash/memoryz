import './travel.css';
import { h, replaceChildren, toast } from '../assistant/ui/dom';
import { findSample, type SampleFn } from './ai';
import { optimizeDay } from './core/optimize';
import { REGIONS } from './core/regions';
import { scheduleTrip, type TripSchedule } from './core/schedule';
import { TravelStore } from './core/store';
import { formatDuration } from './core/time';
import type { TripPlan } from './core/types';
import { LIMITS } from './core/validate';
import { SAMPLES, samplePlan } from './samples';
import { openAddStopSheet, openCreateSheet } from './ui/create';
import { TripMap } from './ui/map';
import { renderPanel, type PanelActions, type PanelView } from './ui/panel';
import { Player } from './ui/player';

function safeStorage(): Storage {
  try {
    const s = window.localStorage;
    s.getItem('x');
    return s;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage;
  }
}

const store = new TravelStore(safeStorage());
let sample: SampleFn | null = null;

// ---------- layout ----------

const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': '여행 지도. 누르면 장소를 추가해요' });
const panelEl = h('aside', { class: 'panel', 'aria-label': '여행 일정' });
const planNote = h('div', { class: 'plan-note', hidden: true }, '지도 이미지 없이 경로도로 보여 줘요');
const player = new Player(
  (s, tl) => {
    map.update(s, tl);
    highlight(s.visit, s.kind);
  },
  (on) => (map.follow = on),
);
const newBtn = h('button', { type: 'button', class: 'btn primary', onClick: () => openCreate() }, '새 여행');
const topbar = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', null, '여행 플래너'), h('small', null, '이동 시뮬레이터')),
  h('div', { class: 'top-actions' }, newBtn),
);
const stage = h('section', { class: 'stage', 'aria-label': '이동 시뮬레이션' }, mapEl, planNote, player.hud, player.startCta, player.controls);
document.getElementById('app')!.append(topbar, stage, panelEl);

const map = new TripMap(mapEl, ([lat, lng]) => {
  const day = plan.days[view.day];
  if (day.stops.length >= LIMITS.stopsPerDay) {
    toast(`하루에 ${LIMITS.stopsPerDay}곳까지 넣을 수 있어요`);
    return;
  }
  openAddStopSheet(lat, lng, day.stops, ({ stop, at }) => {
    edit((p) => p.days[view.day].stops.splice(at, 0, stop));
    toast(`${stop.name}을(를) 넣었어요`);
  });
});
map.insets = () => ({
  top: player.hud.offsetTop + player.hud.offsetHeight + 20,
  bottom: stage.clientHeight - player.controls.offsetTop + (player.startCta.hidden ? 20 : 70),
});
map.onTilesChange = (ok) => {
  planNote.hidden = ok;
  stage.classList.toggle('no-tiles', !ok);
};

// ---------- state ----------

let plan: TripPlan = store.plan() ?? samplePlan(SAMPLES[0].id)!;
let sched: TripSchedule = scheduleTrip(plan);
const view: PanelView = { day: 0, tab: 'plan', editing: false, openLeg: null };

/** Copy, change, re-plan; the simulation clock stays where it is. */
function edit(change: (p: TripPlan) => void): void {
  const next = structuredClone(plan);
  change(next);
  setPlan(next, { keepTime: true, fit: false });
}

function setPlan(next: TripPlan, opts: { keepTime: boolean; fit: boolean }): void {
  plan = next;
  sched = scheduleTrip(plan);
  view.day = Math.min(view.day, plan.days.length - 1);
  if (!store.savePlan(plan)) toast('이 브라우저에는 저장되지 않아요');
  draw(opts);
}

function drawPanel(): void {
  const scroll = panelEl.scrollTop;
  renderPanel(panelEl, plan, sched, view, actions);
  panelEl.scrollTop = scroll;
  lastHighlight = -1;
}

function draw({ keepTime, fit }: { keepTime: boolean; fit: boolean }): void {
  drawPanel();
  const day = sched.days[view.day];
  player.load(day, sched.region, keepTime);
  map.show(day, player.tl!, fit);
  player.seek(player.time); // repaint pins and trail on the freshly drawn route
}

let lastHighlight = -1;
function highlight(visit: number, kind: string): void {
  const moving = kind === 'move' || kind === 'wait';
  const key = visit * 10 + (moving ? 1 : 0);
  if (key === lastHighlight) return;
  lastHighlight = key;
  panelEl.querySelectorAll('.route .now').forEach((el) => el.classList.remove('now'));
  const v = panelEl.querySelector<HTMLElement>(`.stop[data-visit="${visit}"]`);
  (moving ? (v?.previousElementSibling as HTMLElement | null) : v)?.classList.add('now');
}

// ---------- actions ----------

const actions: PanelActions = {
  view(patch) {
    const dayChanged = patch.day !== undefined && patch.day !== view.day;
    Object.assign(view, patch);
    if (dayChanged) draw({ keepTime: false, fit: true });
    else drawPanel();
    if (patch.tab) panelEl.scrollTop = 0;
  },
  setStart: (value) => edit((p) => (p.days[view.day].start = value)),
  setTravelers: (n) => edit((p) => (p.travelers = Math.min(LIMITS.travelers, Math.max(1, n)))),
  setBudget: (krw) => edit((p) => (p.budgetKrw = krw)),
  setLodging: (n) => edit((p) => (p.lodgingPerNight = n)),
  setMode(i, mode) {
    view.openLeg = null;
    edit((p) => (p.days[view.day].stops[i].modeIn = mode));
  },
  changeStay: (i, delta) =>
    edit((p) => {
      const s = p.days[view.day].stops[i];
      s.stayMin = Math.min(LIMITS.stayMin, Math.max(0, s.stayMin + delta));
    }),
  move: (i, dir) =>
    edit((p) => {
      const stops = p.days[view.day].stops;
      const j = i + dir;
      if (j >= 0 && j < stops.length) [stops[i], stops[j]] = [stops[j], stops[i]];
    }),
  remove(i) {
    const removed = plan.days[view.day].stops[i];
    const before = plan;
    edit((p) => p.days[view.day].stops.splice(i, 1));
    toast(`${removed.name}을(를) 뺐어요`, { label: '되돌리기', run: () => setPlan(before, { keepTime: true, fit: false }) });
  },
  optimize() {
    const r = optimizeDay(plan.days[view.day], REGIONS[plan.region], plan.travelers);
    if (!r.changed) {
      toast('지금 순서가 가장 빨라요');
      return;
    }
    const before = plan;
    const next = structuredClone(plan);
    next.days[view.day] = structuredClone(r.day);
    setPlan(next, { keepTime: false, fit: false });
    toast(`이동 시간을 ${formatDuration(r.beforeMin - r.afterMin)} 줄였어요`, { label: '되돌리기', run: () => setPlan(before, { keepTime: false, fit: false }) });
  },
  seekVisit(i) {
    const day = sched.days[view.day];
    const v = day.visits[i];
    player.pause();
    player.seek(i === 0 ? day.start : v.arrive);
    map.focus([v.stop.lat, v.stop.lng]);
  },
};

function openCreate(): void {
  openCreateSheet(
    store,
    (p) => {
      view.day = 0;
      view.tab = 'plan';
      view.editing = false;
      view.openLeg = null;
      player.startCta.hidden = false;
      player.started = false;
      setPlan(p, { keepTime: false, fit: true });
      toast(`${p.title}을(를) 열었어요. 재생을 눌러 보세요`);
    },
    sample,
  );
}

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.backdrop')) return;
  if (t.closest('input, select, textarea, [contenteditable]')) return;
  if (e.key === ' ' && !t.closest('button')) {
    e.preventDefault();
    player.toggle();
  } else if (e.key === 'ArrowRight' && !t.closest('.strip')) player.step(1);
  else if (e.key === 'ArrowLeft' && !t.closest('.strip')) player.step(-1);
});

// ---------- start ----------

draw({ keepTime: false, fit: true });
requestAnimationFrame(() => {
  map.invalidate();
  map.fit(sched.days[view.day]);
});
window.addEventListener('resize', () => map.invalidate());
// On claude.ai the page can ask Claude on the viewer's account; light that up when it answers.
void findSample().then((s) => {
  sample = s;
  if (s) replaceChildren(newBtn, '새 여행 · AI');
});
