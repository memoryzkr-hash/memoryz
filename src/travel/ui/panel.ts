/** Side panel: trip summary, warnings, day tabs and the editable timetable. */
import { compareModes, MODE_CHOICES, MODES } from '../core/modes';
import { formatKrw, formatMoney, toKrw } from '../core/regions';
import { legLine, type DaySchedule, type TripSchedule } from '../core/schedule';
import { formatClock, formatDuration } from '../core/time';
import type { ModeChoice, TripPlan } from '../core/types';
import { LIMITS } from '../core/validate';
import { h, replaceChildren } from '../../assistant/ui/dom';
import { KIND_ICONS, MODE_COLORS } from './map';

export interface PanelActions {
  selectDay(i: number): void;
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
  openCreate(): void;
}

const modeLabel = (m: ModeChoice) => (m === 'auto' ? '🪄 자동' : `${MODES[m].icon} ${MODES[m].label}`);

export function renderPanel(root: HTMLElement, plan: TripPlan, sched: TripSchedule, dayIndex: number, a: PanelActions): void {
  const region = sched.region;
  const money = (n: number) => formatMoney(region, n);
  const krwNote = (n: number) => (region.id === 'KR' ? null : h('span', { class: 'muted' }, ` ≈ ${formatKrw(toKrw(region, n))}`));

  // ---------- header ----------
  const header = h(
    'header',
    { class: 'trip-head' },
    h('div', null, h('h1', null, plan.title), h('p', { class: 'muted' }, `${plan.destination || region.name} · ${plan.days.length}일 · ${plan.travelers}명`)),
    h('button', { type: 'button', class: 'btn primary', onClick: a.openCreate }, '✨ 새 여행'),
  );

  // ---------- summary ----------
  const parts = [
    { label: '교통', value: sched.transport, cls: 'c-transport' },
    { label: '입장·식사', value: sched.places, cls: 'c-places' },
    { label: sched.nights ? `숙박 ${sched.nights}박×${sched.rooms}실` : '숙박 (당일치기)', value: sched.lodging, cls: 'c-lodging' },
  ];
  const budgetShare = plan.budgetKrw ? Math.min(1, sched.totalKrw / plan.budgetKrw) : null;
  const summary = h(
    'section',
    { class: 'card summary' },
    h('div', { class: 'total' }, h('span', { class: 'label' }, '예상 총비용'), h('strong', null, money(sched.total)), krwNote(sched.total)),
    h('div', { class: 'muted' }, `1인당 ${money(sched.perPerson)} · 이동 ${formatDuration(sched.travelMin)} · ${sched.km.toFixed(1)}km`),
    h(
      'div',
      { class: 'stack', role: 'img', 'aria-label': parts.map((p) => `${p.label} ${money(p.value)}`).join(', ') },
      ...parts.map((p) => h('span', { class: p.cls, style: `flex-grow:${Math.max(p.value, 0.0001)}` })),
    ),
    h('ul', { class: 'legend' }, ...parts.map((p) => h('li', null, h('i', { class: p.cls }), `${p.label} `, h('b', null, money(p.value))))),
    budgetShare !== null &&
      h(
        'div',
        { class: `budget${sched.overBudget ? ' over' : ''}` },
        h('div', { class: 'meter' }, h('span', { style: `width:${Math.round(budgetShare * 100)}%` })),
        h('span', null, sched.overBudget ? `예산 ${formatKrw(plan.budgetKrw!)} 초과` : `예산 ${formatKrw(plan.budgetKrw!)} 중 ${Math.round((sched.totalKrw / plan.budgetKrw!) * 100)}%`),
      ),
  );

  // ---------- trip settings ----------
  const budgetInput = h('input', { class: 'input', type: 'number', min: 0, step: 10000, inputMode: 'numeric', placeholder: '없음', value: plan.budgetKrw ?? '' });
  budgetInput.addEventListener('change', () => {
    const v = Number(budgetInput.value);
    a.setBudget(budgetInput.value.trim() && v > 0 ? Math.round(v) : null);
  });
  const lodgingInput = h('input', { class: 'input', type: 'number', min: 0, step: region.decimals ? 1 : 1000, value: plan.lodgingPerNight });
  lodgingInput.addEventListener('change', () => a.setLodging(Math.max(0, Number(lodgingInput.value) || 0)));
  const settings = h(
    'section',
    { class: 'card settings' },
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'label' }, '인원'),
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '한 명 줄이기', disabled: plan.travelers <= 1, onClick: () => a.setTravelers(plan.travelers - 1) }, '−'),
        h('b', null, `${plan.travelers}명`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '한 명 늘리기', disabled: plan.travelers >= LIMITS.travelers, onClick: () => a.setTravelers(plan.travelers + 1) }, '+'),
      ),
    ),
    h('label', { class: 'field' }, h('span', { class: 'label' }, '예산 (원)'), budgetInput),
    h('label', { class: 'field' }, h('span', { class: 'label' }, `숙소 1박 (${region.currency})`), lodgingInput),
  );

  // ---------- warnings ----------
  const warnings = sched.warnings.length
    ? h(
        'section',
        { class: 'card warnings', role: 'status' },
        h('h2', null, '⚠ 확인해 보세요'),
        h('ul', null, ...sched.warnings.map((w) => h('li', null, w.day >= 0 && plan.days.length > 1 ? `${w.day + 1}일차 · ` : '', w.message))),
      )
    : null;

  // ---------- day ----------
  const tabs =
    plan.days.length > 1
      ? h(
          'div',
          { class: 'day-tabs', role: 'tablist' },
          ...plan.days.map((d, i) =>
            h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === dayIndex), onClick: () => a.selectDay(i) }, `${i + 1}일차`, h('small', null, d.label.replace(/^\d+일차\s*·?\s*/, ''))),
          ),
        )
      : null;

  const day = sched.days[dayIndex];
  replaceChildren(
    root,
    header,
    summary,
    settings,
    warnings,
    h('section', { class: 'day' }, tabs, dayView(day, sched, plan.travelers, a)),
    plan.tips.length ? h('section', { class: 'card tips' }, h('h2', null, '💡 여행 팁'), h('ul', null, ...plan.tips.map((t) => h('li', null, t)))) : null,
    h(
      'p',
      { class: 'fine' },
      `시간·비용은 직선거리×우회 계수와 ${region.name} 요금표로 계산한 추정치예요. 지도의 선은 실제 길이 아니에요. `,
      region.id === 'KR' ? '' : `환율 1${region.currency} = ${region.krw.toLocaleString('ko-KR')}원 기준. `,
      '지도를 누르면 장소를 추가할 수 있어요.',
    ),
  );
}

function dayView(day: DaySchedule, sched: TripSchedule, travelers: number, a: PanelActions): HTMLElement {
  const region = sched.region;
  const startInput = h('input', { class: 'input time', type: 'time', value: day.plan.start, 'aria-label': '출발 시각' });
  startInput.addEventListener('change', () => startInput.value && a.setStart(startInput.value));
  const last = day.visits.length - 1;

  const rows: HTMLElement[] = [];
  day.visits.forEach((v, i) => {
    if (i > 0) rows.push(legRow(day, i, sched, travelers, a));
    const warn = day.warnings.find((w) => w.stopId === v.stop.id && w.kind === 'closed');
    rows.push(
      h(
        'li',
        { class: `visit${warn ? ' bad' : ''}`, 'data-visit': i },
        h('button', { type: 'button', class: 'num', title: '이 시각으로 이동', onClick: () => a.seekVisit(i) }, String(i + 1)),
        h(
          'div',
          { class: 'visit-main' },
          h(
            'div',
            { class: 'visit-time' },
            i === 0 ? `${formatClock(day.start)} 출발` : v.leave > v.arrive ? `${formatClock(v.arrive)} – ${formatClock(v.leave)}` : `${formatClock(v.arrive)} 도착`,
            v.wait > 0 ? h('span', { class: 'chip warn' }, `⏳ ${formatDuration(v.wait)} 대기`) : null,
          ),
          h('div', { class: 'visit-name' }, `${KIND_ICONS[v.stop.kind]} ${v.stop.name}`),
          h(
            'div',
            { class: 'visit-meta muted' },
            i > 0 &&
              h(
                'span',
                { class: 'stay' },
                h('button', { type: 'button', class: 'mini', 'aria-label': '15분 줄이기', disabled: v.stop.stayMin <= 0, onClick: () => a.changeStay(i, -15) }, '−'),
                `${formatDuration(v.stop.stayMin)} 머묾`,
                h('button', { type: 'button', class: 'mini', 'aria-label': '15분 늘리기', onClick: () => a.changeStay(i, 15) }, '+'),
              ),
            v.cost ? h('span', null, `💳 ${formatMoney(region, v.cost)}`) : null,
            v.stop.open || v.stop.close ? h('span', null, `🕘 ${v.stop.open ?? ''}–${v.stop.close ?? ''}`) : null,
          ),
          v.stop.note ? h('div', { class: 'note' }, v.stop.note) : null,
          warn ? h('div', { class: 'err' }, `⚠ ${warn.message}`) : null,
        ),
        h(
          'div',
          { class: 'visit-actions' },
          h('button', { type: 'button', class: 'mini', 'aria-label': '위로', disabled: i === 0, onClick: () => a.move(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'mini', 'aria-label': '아래로', disabled: i === last, onClick: () => a.move(i, 1) }, '↓'),
          h('button', { type: 'button', class: 'mini danger', 'aria-label': '빼기', disabled: day.visits.length <= 1, onClick: () => a.remove(i) }, '✕'),
        ),
      ),
    );
  });

  return h(
    'div',
    { class: 'card day-card' },
    h(
      'div',
      { class: 'day-head' },
      h('label', { class: 'field inline' }, h('span', { class: 'label' }, '출발'), startInput),
      h('button', { type: 'button', class: 'btn small', disabled: day.visits.length < 4, onClick: a.optimize, title: '처음·마지막(숙소)은 그대로 두고 순서를 바꿔 이동 시간을 줄여요' }, '🔀 동선 최적화'),
    ),
    h(
      'div',
      { class: 'day-stats muted' },
      `${formatClock(day.end)} 끝 · 이동 ${formatDuration(day.travelMin)} · 교통 ${formatMoney(region, day.transport)} · 입장·식사 ${formatMoney(region, day.places)}`,
    ),
    h('ol', { class: 'timeline' }, ...rows),
  );
}

function legRow(day: DaySchedule, i: number, sched: TripSchedule, travelers: number, a: PanelActions): HTMLElement {
  const leg = day.legs[i - 1];
  const stop = day.visits[i].stop;
  const prev = day.visits[i - 1].stop;
  const select = h(
    'select',
    { class: 'mode-select', 'aria-label': `${stop.name}까지 이동 수단` },
    ...MODE_CHOICES.map((m) => h('option', { value: m, selected: m === stop.modeIn }, modeLabel(m))),
  );
  select.addEventListener('change', () => a.setMode(i, select.value as ModeChoice));

  const compare = h('div', { class: 'compare', hidden: true });
  const toggle = h('button', { type: 'button', class: 'link-btn', 'aria-expanded': 'false' }, '수단 비교');
  toggle.addEventListener('click', () => {
    const open = compare.hidden;
    compare.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open && !compare.childElementCount) {
      const options = compareModes([prev.lat, prev.lng], [stop.lat, stop.lng], leg.depart, sched.region, travelers);
      replaceChildren(
        compare,
        h(
          'table',
          null,
          h('thead', null, h('tr', null, h('th', null, '수단'), h('th', null, '시간'), h('th', null, '비용'))),
          h(
            'tbody',
            null,
            ...options.map((o) =>
              h(
                'tr',
                { class: o.mode === leg.mode ? 'current' : '', tabIndex: 0, title: '이 수단으로 바꾸기', onClick: () => a.setMode(i, o.mode), onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && a.setMode(i, o.mode) },
                h('td', null, `${MODES[o.mode].icon} ${MODES[o.mode].label}`),
                h('td', null, formatDuration(o.minutes), o.rush ? ' 🚦' : ''),
                h('td', null, o.cost ? formatMoney(sched.region, o.cost) : '무료'),
              ),
            ),
          ),
        ),
        h('p', { class: 'fine' }, '🚦 출퇴근 시간이라 느려요. 줄을 누르면 그 수단으로 바뀌어요.'),
      );
    }
  });

  return h(
    'li',
    { class: 'leg', style: `--leg:${MODE_COLORS[leg.mode]}` },
    h('div', { class: 'leg-line' }, legLine(leg, sched.region), leg.rush ? h('span', { class: 'chip' }, '🚦 출퇴근') : null, leg.night ? h('span', { class: 'chip' }, '🌙 할증') : null),
    h('div', { class: 'leg-edit' }, select, toggle),
    compare,
  );
}
