import './travel.css';
import { h, toast } from '../assistant/ui/dom';
import { REGIONS } from './core/regions';
import { optimizeDay } from './core/optimize';
import { scheduleTrip, type TripSchedule } from './core/schedule';
import { TravelStore } from './core/store';
import { formatDuration } from './core/time';
import type { TripPlan } from './core/types';
import { LIMITS } from './core/validate';
import { SAMPLES, samplePlan } from './samples';
import { openAddStopSheet, openCreateSheet } from './ui/create';
import { TripMap } from './ui/map';
import { renderPanel, type PanelActions } from './ui/panel';
import { Player } from './ui/player';

function safeStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage;
  }
}

const store = new TravelStore(safeStorage());

const mapEl = h('div', { class: 'map' });
const panelEl = h('aside', { class: 'panel' });
const player = new Player(
  (s, tl) => {
    map.update(s, tl);
    highlight(s.visit, s.kind);
  },
  (on) => (map.follow = on),
);
const stage = h(
  'section',
  { class: 'stage' },
  mapEl,
  player.hud,
  h('div', { class: 'home' }, '🧳 여행 플래너'),
  player.controls,
);
document.getElementById('app')!.append(stage, panelEl);

const map = new TripMap(mapEl, ([lat, lng]) => {
  const day = plan.days[dayIndex];
  if (day.stops.length >= LIMITS.stopsPerDay) {
    toast(`하루에 ${LIMITS.stopsPerDay}곳까지 넣을 수 있어요`);
    return;
  }
  openAddStopSheet(lat, lng, day.stops, ({ stop, at }) => {
    edit((p) => p.days[dayIndex].stops.splice(at, 0, stop), true);
    toast(`${stop.name}을(를) 넣었어요`);
  });
});

let plan: TripPlan = store.plan() ?? samplePlan(SAMPLES[0].id)!;
let sched: TripSchedule = scheduleTrip(plan);
let dayIndex = 0;

/** Copy, change, re-plan. `keepTime` keeps the simulation clock where it is. */
function edit(change: (p: TripPlan) => void, keepTime = true): void {
  const next = structuredClone(plan);
  change(next);
  setPlan(next, { keepTime, fit: false });
}

function setPlan(next: TripPlan, opts: { keepTime: boolean; fit: boolean }): void {
  plan = next;
  sched = scheduleTrip(plan);
  dayIndex = Math.min(dayIndex, plan.days.length - 1);
  if (!store.savePlan(plan)) toast('이 브라우저에는 저장되지 않아요');
  draw(opts);
}

function draw({ keepTime, fit }: { keepTime: boolean; fit: boolean }): void {
  const day = sched.days[dayIndex];
  const scroll = panelEl.scrollTop;
  renderPanel(panelEl, plan, sched, dayIndex, actions);
  panelEl.scrollTop = scroll;
  player.load(day, sched.region, keepTime);
  map.show(day, player.tl!, fit);
}

let lastHighlight = -1;
function highlight(visit: number, kind: string): void {
  const key = visit * 10 + (kind === 'move' || kind === 'wait' ? 1 : 0);
  if (key === lastHighlight) return;
  lastHighlight = key;
  panelEl.querySelectorAll('.visit.active, .leg.active').forEach((el) => el.classList.remove('active'));
  const v = panelEl.querySelector<HTMLElement>(`.visit[data-visit="${visit}"]`);
  const target = kind === 'move' || kind === 'wait' ? (v?.previousElementSibling as HTMLElement | null) : v;
  target?.classList.add('active');
}

const actions: PanelActions = {
  selectDay(i) {
    dayIndex = i;
    draw({ keepTime: false, fit: true });
  },
  setStart: (value) => edit((p) => (p.days[dayIndex].start = value)),
  setTravelers: (n) => edit((p) => (p.travelers = Math.min(LIMITS.travelers, Math.max(1, n)))),
  setBudget: (krw) => edit((p) => (p.budgetKrw = krw)),
  setLodging: (n) => edit((p) => (p.lodgingPerNight = n)),
  setMode: (i, mode) => edit((p) => (p.days[dayIndex].stops[i].modeIn = mode)),
  changeStay: (i, delta) => edit((p) => {
    const s = p.days[dayIndex].stops[i];
    s.stayMin = Math.min(LIMITS.stayMin, Math.max(0, s.stayMin + delta));
  }),
  move: (i, dir) => edit((p) => {
    const stops = p.days[dayIndex].stops;
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    [stops[i], stops[j]] = [stops[j], stops[i]];
  }),
  remove(i) {
    const removed = plan.days[dayIndex].stops[i];
    const before = plan;
    edit((p) => p.days[dayIndex].stops.splice(i, 1));
    toast(`${removed.name}을(를) 뺐어요`, { label: '되돌리기', run: () => setPlan(before, { keepTime: true, fit: false }) });
  },
  optimize() {
    const r = optimizeDay(plan.days[dayIndex], REGIONS[plan.region], plan.travelers);
    if (!r.changed) {
      toast('지금 순서가 가장 빨라요 👍');
      return;
    }
    const before = plan;
    edit((p) => (p.days[dayIndex] = structuredClone(r.day)), false);
    toast(`이동 ${formatDuration(r.beforeMin - r.afterMin)} 줄였어요`, { label: '되돌리기', run: () => setPlan(before, { keepTime: false, fit: false }) });
  },
  seekVisit(i) {
    const v = sched.days[dayIndex].visits[i];
    player.pause();
    player.seek(i === 0 ? sched.days[dayIndex].start : v.arrive);
    map.focus([v.stop.lat, v.stop.lng]);
  },
  openCreate() {
    openCreateSheet(store, (p) => {
      dayIndex = 0;
      setPlan(p, { keepTime: false, fit: true });
      toast(`${p.title} — ▶를 눌러 이동을 시뮬레이션해 보세요`);
    });
  },
};

draw({ keepTime: false, fit: true });
// The map measures itself after layout settles (fonts, mobile toolbars).
requestAnimationFrame(() => {
  map.invalidate();
  map.fit(sched.days[dayIndex]);
});
window.addEventListener('resize', () => map.invalidate());
