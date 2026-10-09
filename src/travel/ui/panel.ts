/** Side panel: trip header, then tabs for the timetable, the money, and how the numbers are made. */
import { compareModes, MODE_CHOICES, MODES, RUSH_FACTOR, speedKmh } from '../core/modes';
import { formatKrw, formatMoney, type Region } from '../core/regions';
import type { DaySchedule, TripSchedule } from '../core/schedule';
import { formatClock, formatDuration } from '../core/time';
import type { Mode, ModeChoice, TripPlan } from '../core/types';
import { LIMITS } from '../core/validate';
import { h, replaceChildren } from '../../assistant/ui/dom';
import { KIND_ICONS, MODE_COLORS } from './map';

export type Tab = 'plan' | 'cost' | 'info';

export interface PanelView {
  day: number;
  tab: Tab;
  editing: boolean;
  /** Leg (index of the stop it arrives at) whose mode picker is open. */
  openLeg: number | null;
}

export interface PanelActions {
  view(patch: Partial<PanelView>): void;
  setStart(value: string): void;
  setTravelers(n: number): void;
  setBudget(krw: number | null): void;
  setLodging(n: number): void;
  setMode(stop: number, mode: ModeChoice): void;
  changeStay(stop: number, delta: number): void;
  move(stop: number, dir: -1 | 1): void;
  remove(stop: number): void;
  optimize(): void;
  seekVisit(stop: number): void;
}

const clock = (min: number) => formatClock(min).replace('다음날 ', '+1 ');

export function renderPanel(root: HTMLElement, plan: TripPlan, sched: TripSchedule, view: PanelView, a: PanelActions): void {
  const region = sched.region;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'plan', label: '일정' },
    { id: 'cost', label: '비용' },
    { id: 'info', label: '여행 정보' },
  ];
  const head = h(
    'header',
    { class: 'trip-head' },
    h('p', { class: 'eyebrow' }, `${plan.destination || region.name} · ${plan.days.length > 1 ? `${plan.days.length - 1}박 ${plan.days.length}일` : '당일'} · ${plan.travelers}명`),
    h('h1', null, plan.title),
    h(
      'div',
      { class: 'head-figures' },
      h('div', null, h('span', { class: 'k' }, '예상 총비용'), h('strong', { class: 'v' }, formatMoney(region, sched.total))),
      h('div', null, h('span', { class: 'k' }, '1인당'), h('strong', { class: 'v sm' }, formatMoney(region, sched.perPerson))),
      h('div', null, h('span', { class: 'k' }, '이동'), h('strong', { class: 'v sm' }, formatDuration(sched.travelMin))),
    ),
    region.id === 'KR' ? null : h('p', { class: 'fx' }, `≈ ${formatKrw(sched.totalKrw)} (1${region.currency} = ${region.krw.toLocaleString('ko-KR')}원 기준)`),
  );
  const tabBar = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ...tabs.map((t) =>
      h(
        'button',
        { type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-selected': String(view.tab === t.id), onClick: () => a.view({ tab: t.id }) },
        t.label,
        t.id === 'plan' && sched.warnings.length ? h('span', { class: 'badge', 'aria-label': `확인할 것 ${sched.warnings.length}개` }, String(sched.warnings.length)) : null,
      ),
    ),
  );
  const body =
    view.tab === 'plan' ? planTab(plan, sched, view, a) : view.tab === 'cost' ? costTab(plan, sched, a) : infoTab(plan, region);
  replaceChildren(root, head, tabBar, h('div', { class: 'tab-body', role: 'tabpanel', 'aria-labelledby': `tab-${view.tab}` }, body));
}

// ---------- 일정 ----------

function planTab(plan: TripPlan, sched: TripSchedule, view: PanelView, a: PanelActions): HTMLElement {
  const day = sched.days[view.day];
  const dayTabs =
    plan.days.length > 1
      ? h(
          'div',
          { class: 'days', role: 'tablist', 'aria-label': '날짜' },
          ...plan.days.map((d, i) =>
            h(
              'button',
              { type: 'button', role: 'tab', 'aria-selected': String(i === view.day), onClick: () => a.view({ day: i, openLeg: null }) },
              h('b', null, `${i + 1}일차`),
              h('small', null, d.label.replace(/^\d+일차\s*·?\s*/, '') || `${d.stops.length}곳`),
            ),
          ),
        )
      : null;

  const warnings = sched.warnings.length
    ? h(
        'div',
        { class: 'warnings', role: 'status' },
        ...sched.warnings.map((w) => h('p', null, h('span', { class: 'sev', 'aria-hidden': 'true' }), w.day >= 0 && plan.days.length > 1 ? `${w.day + 1}일차 · ${w.message}` : w.message)),
      )
    : null;

  const startInput = h('input', { class: 'field time', type: 'time', id: 'day-start', value: day.plan.start });
  startInput.addEventListener('change', () => startInput.value && a.setStart(startInput.value));

  const toolbar = h(
    'div',
    { class: 'day-bar' },
    h('label', { class: 'start', for: 'day-start' }, h('span', null, '출발'), startInput),
    h(
      'button',
      { type: 'button', class: 'btn quiet', disabled: day.visits.length < 4, onClick: a.optimize, title: '처음과 마지막 숙소는 그대로 두고, 이동 시간이 가장 짧은 순서로 바꿔요' },
      '동선 최적화',
    ),
    h('button', { type: 'button', class: `btn quiet${view.editing ? ' on' : ''}`, 'aria-pressed': String(view.editing), onClick: () => a.view({ editing: !view.editing }) }, view.editing ? '편집 끝' : '편집'),
  );

  const facts = h(
    'dl',
    { class: 'day-facts' },
    h('div', null, h('dt', null, '끝나는 시각'), h('dd', null, clock(day.end))),
    h('div', null, h('dt', null, '이동'), h('dd', null, `${formatDuration(day.travelMin)} · ${day.km.toFixed(1)}km`)),
    h('div', null, h('dt', null, '이날 비용'), h('dd', null, formatMoney(sched.region, day.transport + day.places))),
  );

  return h(
    'div',
    { class: 'plan' },
    dayTabs,
    warnings,
    toolbar,
    facts,
    h('ol', { class: `route${view.editing ? ' editing' : ''}` }, ...routeRows(day, sched, plan.travelers, view, a)),
    h('p', { class: 'hint' }, view.editing ? '지도를 누르면 그 자리에 장소를 넣을 수 있어요.' : '시각을 누르면 그 순간으로 이동해요. 이동 수단을 누르면 다른 수단과 비교할 수 있어요.'),
  );
}

function routeRows(day: DaySchedule, sched: TripSchedule, travelers: number, view: PanelView, a: PanelActions): HTMLElement[] {
  const region = sched.region;
  const rows: HTMLElement[] = [];
  const last = day.visits.length - 1;
  day.visits.forEach((v, i) => {
    if (i > 0) rows.push(legRow(day, i, region, travelers, view, a));
    const warn = day.warnings.find((w) => w.stopId === v.stop.id && w.kind === 'closed');
    const time = i === 0 ? day.start : v.arrive;
    rows.push(
      h(
        'li',
        { class: `stop${warn ? ' bad' : ''}${i === 0 || i === last ? ' end' : ''}`, 'data-visit': i },
        h('button', { type: 'button', class: 'when', title: '이 시각으로 이동', onClick: () => a.seekVisit(i) }, clock(time)),
        h('span', { class: 'node', 'aria-hidden': 'true' }, String(i + 1)),
        h(
          'div',
          { class: 'what' },
          h('div', { class: 'name' }, h('span', { class: 'kind', 'aria-hidden': 'true' }, KIND_ICONS[v.stop.kind]), v.stop.name),
          h(
            'div',
            { class: 'meta' },
            i === 0 ? h('span', null, '출발') : v.stop.stayMin ? h('span', null, `${formatDuration(v.stop.stayMin)} · ${clock(v.leave)}까지`) : h('span', null, '도착'),
            v.wait > 0 ? h('span', { class: 'tag warn' }, `${formatDuration(v.wait)} 개장 대기`) : null,
            v.cost ? h('span', null, formatMoney(region, v.cost)) : null,
            v.stop.open || v.stop.close ? h('span', { class: 'hours' }, `${v.stop.open ?? '—'}~${v.stop.close ?? '—'}`) : null,
          ),
          v.stop.note ? h('p', { class: 'note' }, v.stop.note) : null,
          warn ? h('p', { class: 'err' }, warn.message) : null,
          view.editing
            ? h(
                'div',
                { class: 'edit' },
                i > 0
                  ? h(
                      'span',
                      { class: 'stay' },
                      h('button', { type: 'button', class: 'mini', 'aria-label': '15분 줄이기', disabled: v.stop.stayMin <= 0, onClick: () => a.changeStay(i, -15) }, '−'),
                      h('span', null, `머무름 ${formatDuration(v.stop.stayMin)}`),
                      h('button', { type: 'button', class: 'mini', 'aria-label': '15분 늘리기', onClick: () => a.changeStay(i, 15) }, '+'),
                    )
                  : null,
                h('button', { type: 'button', class: 'mini', 'aria-label': '위로', disabled: i === 0, onClick: () => a.move(i, -1) }, '↑'),
                h('button', { type: 'button', class: 'mini', 'aria-label': '아래로', disabled: i === last, onClick: () => a.move(i, 1) }, '↓'),
                h('button', { type: 'button', class: 'mini danger', 'aria-label': `${v.stop.name} 빼기`, disabled: day.visits.length <= 1, onClick: () => a.remove(i) }, '빼기'),
              )
            : null,
        ),
      ),
    );
  });
  return rows;
}

function legRow(day: DaySchedule, i: number, region: Region, travelers: number, view: PanelView, a: PanelActions): HTMLElement {
  const leg = day.legs[i - 1];
  const stop = day.visits[i].stop;
  const prev = day.visits[i - 1].stop;
  const m = MODES[leg.mode];
  const open = view.openLeg === i;
  const km = leg.routeKm < 1 ? `${Math.round(leg.routeKm * 1000)}m` : `${leg.routeKm.toFixed(1)}km`;

  let picker: HTMLElement | null = null;
  if (open) {
    const options = compareModes([prev.lat, prev.lng], [stop.lat, stop.lng], leg.depart, region, travelers);
    const fastest = Math.min(...options.map((o) => o.minutes));
    const cheapest = Math.min(...options.map((o) => o.cost));
    picker = h(
      'div',
      { class: 'picker' },
      h(
        'button',
        { type: 'button', class: `opt${stop.modeIn === 'auto' ? ' current' : ''}`, onClick: () => a.setMode(i, 'auto') },
        h('span', { class: 'opt-name' }, '자동'),
        h('span', { class: 'opt-note' }, '거리에 맞춰 골라요'),
      ),
      ...options.map((o) =>
        h(
          'button',
          { type: 'button', class: `opt${stop.modeIn === o.mode ? ' current' : ''}`, style: `--c:${MODE_COLORS[o.mode]}`, onClick: () => a.setMode(i, o.mode) },
          h('span', { class: 'opt-name' }, h('i', { class: 'line' }), `${MODES[o.mode].icon} ${MODES[o.mode].label}`),
          h('span', { class: 'opt-time' }, formatDuration(o.minutes), o.rush ? h('small', null, ' 출퇴근') : null),
          h('span', { class: 'opt-cost' }, o.cost ? formatMoney(region, o.cost) : '무료'),
          o.minutes === fastest ? h('span', { class: 'tag' }, '가장 빠름') : o.cost === cheapest ? h('span', { class: 'tag' }, '가장 쌈') : null,
        ),
      ),
      MODE_CHOICES.filter((c) => c !== 'auto' && !options.some((o) => o.mode === c)).length
        ? h('p', { class: 'hint' }, '이 거리에 맞지 않는 수단은 뺐어요.')
        : null,
    );
  }

  return h(
    'li',
    { class: `leg${open ? ' open' : ''}${leg.mode === 'walk' || leg.mode === 'flight' || leg.mode === 'ferry' ? ' dashed' : ''}`, style: `--c:${MODE_COLORS[leg.mode]}` },
    h('span', { class: 'when dur' }, formatDuration(leg.minutes)),
    h('span', { class: 'rail', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'what' },
      h(
        'button',
        { type: 'button', class: 'ride', 'aria-expanded': String(open), onClick: () => a.view({ openLeg: open ? null : i }) },
        h('span', { class: 'ride-mode' }, `${m.icon} ${m.label}${leg.auto ? ' · 자동' : ''}`),
        h('span', { class: 'ride-facts' }, `${km} · ${leg.cost ? formatMoney(region, leg.cost) : '무료'}`),
        leg.rush ? h('span', { class: 'tag warn' }, '출퇴근 정체') : null,
        leg.night ? h('span', { class: 'tag' }, '심야 할증') : null,
        h('span', { class: 'caret', 'aria-hidden': 'true' }),
      ),
      picker,
    ),
  );
}

// ---------- 비용 ----------

function costTab(plan: TripPlan, sched: TripSchedule, a: PanelActions): HTMLElement {
  const region = sched.region;
  const money = (n: number) => formatMoney(region, n);
  const parts = [
    { label: '교통', value: sched.transport, cls: 'c-transport' },
    { label: '입장·식사', value: sched.places, cls: 'c-places' },
    { label: sched.nights ? `숙박 ${sched.nights}박 × ${sched.rooms}실` : '숙박 (당일)', value: sched.lodging, cls: 'c-lodging' },
  ];
  const share = (n: number) => (sched.total > 0 ? Math.round((n / sched.total) * 100) : 0);

  // Spending by mode across the whole trip.
  const byMode = new Map<Mode, { min: number; cost: number; n: number }>();
  for (const d of sched.days) for (const l of d.legs) {
    const e = byMode.get(l.mode) ?? { min: 0, cost: 0, n: 0 };
    e.min += l.minutes;
    e.cost += l.cost;
    e.n += 1;
    byMode.set(l.mode, e);
  }
  const maxDay = Math.max(1, ...sched.days.map((d) => d.transport + d.places));

  const budgetInput = h('input', { class: 'field', id: 'budget', type: 'number', min: 0, step: 10000, inputMode: 'numeric', placeholder: '정하지 않음', value: plan.budgetKrw ?? '' });
  budgetInput.addEventListener('change', () => {
    const v = Number(budgetInput.value);
    a.setBudget(budgetInput.value.trim() && v > 0 ? Math.round(v) : null);
  });
  const lodgingInput = h('input', { class: 'field', id: 'lodging', type: 'number', min: 0, step: region.decimals ? 1 : 1000, value: plan.lodgingPerNight });
  lodgingInput.addEventListener('change', () => a.setLodging(Math.max(0, Number(lodgingInput.value) || 0)));

  const budget = plan.budgetKrw
    ? h(
        'div',
        { class: `budget${sched.overBudget ? ' over' : ''}` },
        h('div', { class: 'budget-row' }, h('span', null, sched.overBudget ? '예산 초과' : '예산 대비'), h('b', null, `${Math.round((sched.totalKrw / plan.budgetKrw) * 100)}%`)),
        h('div', { class: 'meter' }, h('span', { style: `width:${Math.min(100, (sched.totalKrw / plan.budgetKrw) * 100)}%` })),
        h('p', { class: 'muted' }, sched.overBudget ? `${formatKrw(sched.totalKrw - plan.budgetKrw)} 넘어요` : `${formatKrw(plan.budgetKrw - sched.totalKrw)} 남아요`, ` · 예산 ${formatKrw(plan.budgetKrw)}`),
      )
    : null;

  return h(
    'div',
    { class: 'cost' },
    h(
      'section',
      { class: 'block' },
      h('h2', null, '어디에 쓰나'),
      h('div', { class: 'stack', role: 'img', 'aria-label': parts.map((p) => `${p.label} ${money(p.value)}`).join(', ') }, ...parts.map((p) => h('span', { class: p.cls, style: `flex-grow:${Math.max(p.value, 0.0001)}` }))),
      h(
        'table',
        { class: 'ledger' },
        h('tbody', null, ...parts.map((p) => h('tr', null, h('th', null, h('i', { class: `sw ${p.cls}` }), p.label), h('td', null, `${share(p.value)}%`), h('td', null, money(p.value))))),
        h('tfoot', null, h('tr', null, h('th', null, '합계'), h('td', null, ''), h('td', null, money(sched.total)))),
      ),
      budget,
    ),
    sched.days.length > 1
      ? h(
          'section',
          { class: 'block' },
          h('h2', null, '날짜별 (숙박 제외)'),
          h(
            'div',
            { class: 'bars' },
            ...sched.days.map((d, i) =>
              h(
                'div',
                { class: 'bar-row' },
                h('span', { class: 'bar-k' }, `${i + 1}일차`),
                h(
                  'span',
                  { class: 'bar' },
                  h('span', { class: 'c-transport', style: `width:${(d.transport / maxDay) * 100}%` }),
                  h('span', { class: 'c-places', style: `width:${(d.places / maxDay) * 100}%` }),
                ),
                h('span', { class: 'bar-v' }, money(d.transport + d.places)),
              ),
            ),
          ),
        )
      : null,
    byMode.size
      ? h(
          'section',
          { class: 'block' },
          h('h2', null, '이동 수단별'),
          h(
            'table',
            { class: 'ledger modes' },
            h('thead', null, h('tr', null, h('th', null, '수단'), h('td', null, '시간'), h('td', null, '교통비'))),
            h(
              'tbody',
              null,
              ...[...byMode.entries()]
                .sort((x, y) => y[1].min - x[1].min)
                .map(([mode, e]) => h('tr', null, h('th', null, h('i', { class: 'sw', style: `background:${MODE_COLORS[mode]}` }), `${MODES[mode].label} ${e.n}번`), h('td', null, formatDuration(e.min)), h('td', null, e.cost ? money(e.cost) : '무료'))),
            ),
          ),
        )
      : null,
    h(
      'section',
      { class: 'block' },
      h('h2', null, '계산 조건'),
      h(
        'div',
        { class: 'conditions' },
        h(
          'div',
          { class: 'form-field' },
          h('span', { class: 'label' }, '인원'),
          h(
            'div',
            { class: 'stepper' },
            h('button', { type: 'button', class: 'mini', 'aria-label': '한 명 줄이기', disabled: plan.travelers <= 1, onClick: () => a.setTravelers(plan.travelers - 1) }, '−'),
            h('b', null, `${plan.travelers}명`),
            h('button', { type: 'button', class: 'mini', 'aria-label': '한 명 늘리기', disabled: plan.travelers >= LIMITS.travelers, onClick: () => a.setTravelers(plan.travelers + 1) }, '+'),
          ),
        ),
        h('label', { class: 'form-field', for: 'budget' }, h('span', { class: 'label' }, '예산 (원)'), budgetInput),
        h('label', { class: 'form-field', for: 'lodging' }, h('span', { class: 'label' }, `숙소 1박 · 2인 1실 (${region.currency})`), lodgingInput),
      ),
      h('p', { class: 'hint' }, '택시·렌터카는 4명당 한 대, 대중교통·기차·비행기는 1인 요금 × 인원으로 계산해요.'),
    ),
  );
}

// ---------- 여행 정보 ----------

function infoTab(plan: TripPlan, region: Region): HTMLElement {
  const fare = (mode: Mode): string => {
    switch (mode) {
      case 'walk':
        return '무료';
      case 'subway':
        return region.metro.step ? `${formatMoney(region, region.metro.base)} (${region.metro.baseKm}km 넘으면 ${region.metro.stepKm}km마다 +${formatMoney(region, region.metro.step)})` : `${formatMoney(region, region.metro.base)} 균일`;
      case 'bus':
        return `${formatMoney(region, region.bus)} 균일`;
      case 'taxi':
        return `기본 ${formatMoney(region, region.taxi.base)} + km당 ${formatMoney(region, region.taxi.perKm)}${region.taxi.night !== 1 ? ` · 22~04시 ×${region.taxi.night}` : ''}`;
      case 'car':
        return `km당 ${formatMoney(region, region.carPerKm)} (기름·통행료)`;
      case 'train':
        return `${formatMoney(region, region.train.base)} + km당 ${formatMoney(region, region.train.perKm)}`;
      case 'flight':
        return `${formatMoney(region, region.flight.base)} + km당 ${formatMoney(region, region.flight.perKm)}`;
      case 'ferry':
        return `${formatMoney(region, region.ferry.base)} + km당 ${formatMoney(region, region.ferry.perKm)}`;
    }
  };
  const modes: Mode[] = ['walk', 'subway', 'bus', 'taxi', 'car', 'train', 'flight', 'ferry'];
  return h(
    'div',
    { class: 'info' },
    plan.tips.length ? h('section', { class: 'block' }, h('h2', null, '알아 두면 좋은 것'), h('ul', { class: 'tips' }, ...plan.tips.map((t) => h('li', null, t)))) : null,
    h(
      'section',
      { class: 'block' },
      h('h2', null, `${region.name} 요금표로 계산해요`),
      h(
        'div',
        { class: 'scroll-x' },
        h(
          'table',
          { class: 'ledger fares' },
          h('thead', null, h('tr', null, h('th', null, '수단'), h('td', null, '속도'), h('td', null, '대기'), h('td', null, '요금'))),
          h(
            'tbody',
            null,
            ...modes.map((mode) => {
              const info = MODES[mode];
              const speed = mode === 'taxi' || mode === 'car' || mode === 'bus' ? `${Math.round(speedKmh(mode, 1))}~${Math.round(speedKmh(mode, 999))}` : String(speedKmh(mode, 1));
              return h('tr', null, h('th', null, h('i', { class: 'sw', style: `background:${MODE_COLORS[mode]}` }), info.label), h('td', null, `${speed}km/h`), h('td', null, info.overheadMin ? `${info.overheadMin}분` : '—'), h('td', null, fare(mode)));
            }),
          ),
        ),
      ),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, '거리는 두 장소의 직선거리에 수단별 우회 계수(도보 1.25, 도로·지하철 1.3, 기차 1.15, 비행기 1.05)를 곱해요.'),
        h('li', null, `07:30~09:30, 17:30~19:30에 출발하는 버스·택시·렌터카는 ${RUSH_FACTOR}배 느려요.`),
        h('li', null, '문 열기 전에 도착하면 기다리고, 닫은 뒤 도착하면 경고해요.'),
        h('li', null, '지도의 선은 실제 길이 아니라 직선을 살짝 휜 곡선이에요. 요금은 2026년 기준 대략값이에요.'),
      ),
    ),
  );
}
