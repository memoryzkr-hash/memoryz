import './usage.css';
import { append, h, openSheet, replaceChildren, toast, type Sheet } from '../assistant/ui/dom';
import { BOOKMARKLET } from './bookmarklet';
import {
  applyImport,
  clampPercent,
  DAY,
  daysUntil,
  formatAgo,
  formatClock,
  formatDateTime,
  formatDuration,
  formatWhen,
  HOUR,
  midnightsAhead,
  needsAttention,
  newAccount,
  nextBilling,
  nextWeekly,
  parseUsageJson,
  PLAN_LABELS,
  rankAccounts,
  round1,
  sessionStatus,
  STALE_AFTER,
  weekPos,
  weeklyStatus,
  type Account,
  type ImportedUsage,
  type Plan,
  type WeeklyLevel,
  type WeeklyStatus,
} from './core';
import { openStore, type AccountStore } from './store';

type SortMode = 'reset' | 'remaining' | 'name';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const LEVEL: Record<WeeklyLevel, { label: string; note: (s: WeeklyStatus) => string }> = {
  unknown: { label: '입력 필요', note: () => '주간 사용량과 초기화 시각을 넣어 주세요' },
  'stale-reset': { label: '초기화됨', note: () => '지난 기록 뒤로 초기화됐어요. 새 값을 넣어 주세요' },
  exhausted: { label: '소진', note: (s) => `${formatDuration(s.msLeft!)} 뒤 다시 쓸 수 있어요` },
  fast: { label: '과속', note: (s) => `이 속도면 초기화 전에 다 써요 · 예상 ${s.projected}%` },
  'use-it': { label: '곧 초기화', note: (s) => `${round1(s.remaining!)}% 남았는데 하루 안에 초기화돼요` },
  ok: { label: '적정', note: (s) => (s.projected === null ? '이번 주가 막 시작됐어요' : `이 속도면 초기화 때 약 ${s.projected}%`) },
  plenty: { label: '여유', note: (s) => `이 속도면 초기화 때 약 ${s.projected}%` },
};

let store: AccountStore | null = null;
let accounts: Account[] = [];
let loaded = false;
let quickId: string | null = null;
let sortMode: SortMode = readPref('sort', 'reset') as SortMode;

function readPref(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(`claude-usage/${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(`claude-usage/${key}`, value);
  } catch {
    // a remembered sort order is a nicety
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const nameOf = (a: Account) => a.name || a.email || '이름 없는 계정';

async function save(a: Account): Promise<boolean> {
  try {
    await store!.save(a);
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
}

// ---------- small pieces ----------

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Dial gauge: the arc is the share of the weekly limit used, the needle is the share of the week gone.
 * Arc past the needle = spending faster than an even pace.
 */
function dial(used: number | null, elapsed: number | null, size: 'lg' | 'md'): HTMLElement {
  const r = 40;
  const box = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  box.append(
    svg('circle', { cx: 50, cy: 50, r, class: 'dial-track', fill: 'none', 'stroke-width': 9 }),
    svg('circle', {
      cx: 50,
      cy: 50,
      r,
      class: 'dial-arc',
      fill: 'none',
      'stroke-width': 9,
      'stroke-linecap': used ? 'round' : 'butt',
      pathLength: 100,
      'stroke-dasharray': `${used ?? 0} 100`,
      transform: 'rotate(-90 50 50)',
    }),
  );
  if (elapsed !== null) {
    const a = elapsed * 2 * Math.PI - Math.PI / 2;
    const p = (rad: number) => [50 + rad * Math.cos(a), 50 + rad * Math.sin(a)];
    const [x1, y1] = p(r - 9);
    const [x2, y2] = p(r + 8);
    box.append(svg('line', { x1, y1, x2, y2, class: 'dial-needle', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
  return h(
    'div',
    { class: `dial dial-${size}`, role: 'img', 'aria-label': used === null ? '주간 사용량 미입력' : `주간 ${round1(used)}% 사용, 이번 주 ${Math.round((elapsed ?? 0) * 100)}% 지남` },
    box,
    h('div', { class: 'dial-center' }, h('span', { class: 'dial-num' }, used === null ? '–' : String(Math.round(used))), h('span', { class: 'dial-unit' }, used === null ? '' : '% 사용')),
  );
}

function pill(level: WeeklyLevel): HTMLElement {
  return h('span', { class: `pill p-${level}` }, LEVEL[level].label);
}

// ---------- layout ----------

const app = document.getElementById('app')!;
const storageBadge = h('span', { class: 'badge' }, '불러오는 중…');
const heroEl = h('section', { class: 'hero', 'aria-label': '요약' });
const timelineEl = h('section', { class: 'panel timeline', 'aria-label': '초기화 일정' });
const countEl = h('span', { class: 'count' });
const listEl = h('div', { class: 'cards' });

const sortBtns = (['reset', 'remaining', 'name'] as SortMode[]).map((mode) =>
  h(
    'button',
    {
      type: 'button',
      class: 'seg',
      'aria-pressed': String(mode === sortMode),
      onClick: () => {
        sortMode = mode;
        writePref('sort', mode);
        sortBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['reset', 'remaining', 'name'][i] === mode)));
        render();
      },
    },
    { reset: '초기화 임박순', remaining: '남은 양순', name: '이름순' }[mode],
  ),
);

append(app, [
  h(
    'header',
    { class: 'top' },
    h('div', { class: 'brand' }, h('h1', null, '클로드 사용량'), storageBadge),
    h(
      'div',
      { class: 'top-actions' },
      h('button', { type: 'button', class: 'btn ghost', onClick: () => openPaste(null) }, '붙여넣기'),
      h('button', { type: 'button', class: 'btn primary', onClick: () => openEdit(null) }, '+ 계정 추가'),
    ),
  ),
  heroEl,
  timelineEl,
  h(
    'div',
    { class: 'list-head' },
    h('h2', null, '계정 ', countEl),
    h('div', { class: 'segs', role: 'group', 'aria-label': '정렬' }, ...sortBtns),
  ),
  listEl,
  h(
    'footer',
    { class: 'foot' },
    h('p', null, '값은 claude.ai → 설정 → 사용량에서 확인해 넣어요. 주간 초기화 시각은 한 번만 넣으면 매주 자동으로 넘어갑니다.'),
  ),
]);

// ---------- render ----------

function sorted(now: Date): Account[] {
  const list = [...accounts];
  if (sortMode === 'name') return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
  const key = (a: Account) => {
    const s = weeklyStatus(a.weekly, now);
    return sortMode === 'reset' ? (s.msLeft ?? Infinity) : -(s.remaining ?? -1);
  };
  return list.sort((a, b) => key(a) - key(b));
}

function render(): void {
  const now = new Date();
  storageBadge.textContent = !store ? '불러오는 중…' : store.kind === 'cloud' ? '클라우드 저장됨' : '이 브라우저에 저장';
  storageBadge.className = `badge ${store?.kind ?? ''}`;
  storageBadge.title = store?.kind === 'cloud' ? '어느 기기에서 열어도 같은 목록이 보여요. 나만 볼 수 있어요.' : '이 브라우저에만 저장돼요.';
  countEl.textContent = loaded ? String(accounts.length) : '';

  const ready = loaded && accounts.length > 0;
  heroEl.hidden = !ready;
  timelineEl.hidden = !ready;
  if (ready) {
    renderHero(now);
    renderTimeline(now);
  }

  if (!loaded) {
    replaceChildren(listEl, h('p', { class: 'loading' }, '계정 목록을 불러오는 중이에요…'));
    return;
  }
  if (accounts.length === 0) {
    replaceChildren(listEl, emptyState());
    return;
  }
  replaceChildren(listEl, ...sorted(now).map((a) => card(a, now)));
}

function emptyState(): HTMLElement {
  const step = (n: string, title: string, body: string) => h('li', null, h('span', { class: 'step-n' }, n), h('div', null, h('strong', null, title), h('p', null, body)));
  return h(
    'div',
    { class: 'empty' },
    dial(null, null, 'md'),
    h('h3', null, '첫 계정을 등록해 보세요'),
    h(
      'ol',
      { class: 'steps' },
      step('1', '계정 추가', '이름과 요금제를 넣어요.'),
      step('2', '초기화 요일·시각', 'claude.ai 설정 → 사용량에 나온 주간 초기화 시각을 한 번만 넣어요.'),
      step('3', '사용량 %', '가끔 들어가서 %만 고치면, 언제 어느 계정을 쓸지 알려 드려요.'),
    ),
    h(
      'div',
      { class: 'row center' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => openEdit(null) }, '+ 계정 추가'),
      h('button', { type: 'button', class: 'btn', onClick: addExamples }, '예시로 둘러보기'),
    ),
  );
}

function renderHero(now: Date): void {
  const { picks, blocked } = rankAccounts(accounts, now);
  const top = picks[0];
  const attention = needsAttention(accounts, now);

  let next: { a: Account; at: Date } | null = null;
  for (const a of accounts) {
    const w = weeklyStatus(a.weekly, now);
    if (w.resetAt && (!next || w.resetAt < next.at)) next = { a, at: w.resetAt };
  }

  const topStatus = top && weeklyStatus(top.account.weekly, now);
  const rec = h(
    'div',
    { class: 'rec' },
    h('p', { class: 'eyebrow' }, '지금 쓸 계정'),
    top
      ? h(
          'div',
          { class: `rec-main lv-${topStatus!.level}` },
          dial(topStatus!.used, topStatus!.elapsed, 'lg'),
          h(
            'div',
            { class: 'rec-text' },
            h('h2', null, nameOf(top.account)),
            h('p', null, top.reason),
            h('p', { class: 'rec-rate' }, h('strong', null, `시간당 ${round1(top.perHour)}%`), '씩 써도 초기화 전에 다 쓰지 않아요'),
          ),
        )
      : h('div', { class: 'rec-main none' }, h('h2', null, '지금 바로 쓸 수 있는 계정이 없어요'), h('p', null, '아래 대기 사유를 확인하세요.')),
    (picks.length > 1 || blocked.length > 0) &&
      h(
        'ol',
        { class: 'rec-rest' },
        ...picks.slice(1).map((p, i) => h('li', null, h('span', { class: 'rank' }, String(i + 2)), h('strong', null, nameOf(p.account)), h('span', { class: 'why' }, p.reason))),
        ...blocked.map((b) => h('li', { class: 'off' }, h('span', { class: 'rank' }, '대기'), h('strong', null, nameOf(b.account)), h('span', { class: 'why' }, b.reason))),
      ),
  );

  const stat = (label: string, value: Node | string, sub: Node | string | null, tone = '') =>
    h('div', { class: `stat ${tone}` }, h('p', { class: 'stat-label' }, label), h('p', { class: 'stat-value' }, value), sub && h('p', { class: 'stat-sub' }, sub));

  const side = h(
    'div',
    { class: 'side' },
    next
      ? stat('다음 초기화', formatDuration(next.at.getTime() - now.getTime()) + ' 뒤', `${nameOf(next.a)} · ${formatWhen(next.at, now)}`)
      : stat('다음 초기화', '–', '초기화 시각을 넣어 주세요'),
    attention.length
      ? stat(
          '확인 필요',
          `${attention.length}개 계정`,
          h('span', { class: 'attn' }, ...attention.slice(0, 3).map((x) => h('button', { type: 'button', class: 'chip', onClick: () => openQuick(x.account.id) }, `${nameOf(x.account)} · ${x.why}`))),
          'warn',
        )
      : stat('확인 필요', '없음', '모든 값이 최신이에요', 'good'),
  );
  replaceChildren(heroEl, rec, side);
}

function renderTimeline(now: Date): void {
  const rows = sorted(now)
    .map((a) => ({ a, w: weeklyStatus(a.weekly, now) }))
    .filter((r) => r.w.resetAt)
    .sort((x, y) => x.w.msLeft! - y.w.msLeft!);
  if (rows.length === 0) {
    timelineEl.hidden = true;
    return;
  }
  const ticks = midnightsAhead(now);
  const axis = h(
    'div',
    { class: 'tl-axis', 'aria-hidden': 'true' },
    h('span', { class: 'tl-now', style: 'left:0%' }, '지금'),
    ...ticks.filter((d) => weekPos(d, now) > 0.07).map((d) => h('span', { class: `tl-day${d.getDay() === 0 ? ' sun' : ''}`, style: `left:${weekPos(d, now) * 100}%` }, `${WEEKDAYS[d.getDay()]} ${d.getDate()}`)),
  );
  const grid = () => h('div', { class: 'tl-grid', 'aria-hidden': 'true' }, ...ticks.map((d) => h('i', { style: `left:${weekPos(d, now) * 100}%` })));
  replaceChildren(
    timelineEl,
    h('div', { class: 'panel-head' }, h('h2', null, '초기화 일정'), h('p', { class: 'hint' }, '앞으로 7일 · 막대 끝이 초기화 시각')),
    axis,
    h(
      'ul',
      { class: 'tl-rows' },
      ...rows.map(({ a, w }) => {
        const pos = weekPos(w.resetAt!, now) * 100;
        return h(
          'li',
          { class: `tl-row lv-${w.level}` },
          h(
            'div',
            { class: 'tl-label' },
            h('strong', null, nameOf(a)),
            h('span', { class: 'tl-left' }, w.remaining === null ? '사용량 미입력' : `${round1(w.remaining)}% 남음`),
            h('span', { class: 'tl-when' }, `${formatDateTime(w.resetAt!)} · ${formatDuration(w.msLeft!)} 뒤`),
          ),
          h(
            'div',
            { class: 'tl-track' },
            grid(),
            h('div', { class: 'tl-bar', style: `width:${pos}%` }, h('div', { class: 'tl-fill', style: `width:${w.remaining ?? 0}%` })),
            h('span', { class: 'tl-dot', style: `left:${pos}%` }),
          ),
        );
      }),
    ),
  );
}

function card(a: Account, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const stale = !!a.weekly.updatedAt && now.getTime() - new Date(a.weekly.updatedAt).getTime() > STALE_AFTER && w.level !== 'stale-reset';

  const sessionText =
    s.level === 'unknown'
      ? '기록 없음'
      : s.level === 'idle'
        ? '새 세션 가능'
        : s.resetAt
          ? `${round1(s.used ?? 0)}% · ${formatClock(s.resetAt)}에 풀림 (${formatDuration(s.msLeft!)})`
          : `${round1(s.used ?? 0)}%`;

  const billing = a.billingDay !== null ? nextBilling(a.billingDay, now) : null;
  const billDays = billing ? daysUntil(billing, now) : null;
  const needsUpdate = stale || w.level === 'stale-reset' || w.level === 'unknown';

  const el = h(
    'article',
    { class: `card lv-${w.level}${stale ? ' stale' : ''}${quickId === a.id ? ' editing' : ''}` },
    h(
      'div',
      { class: 'card-main' },
      h('button', { type: 'button', class: 'dial-btn', 'aria-label': `${nameOf(a)} 사용량 수정`, onClick: () => toggleQuick(a.id) }, dial(w.level === 'stale-reset' ? 0 : w.used, w.elapsed, 'md')),
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'card-title' }, h('h3', null, nameOf(a)), h('span', { class: 'plan' }, PLAN_LABELS[a.plan])),
        a.email && a.name && h('p', { class: 'email' }, a.email),
        h('div', { class: 'status' }, pill(w.level), h('span', { class: 'note' }, LEVEL[w.level].note(w))),
      ),
      h(
        'dl',
        { class: 'facts' },
        h('div', null, h('dt', null, '주간 초기화'), h('dd', null, w.resetAt ? h('span', null, h('strong', null, formatDateTime(w.resetAt)), h('span', { class: 'muted' }, ` · ${formatDuration(w.msLeft!)} 뒤`)) : '미입력')),
        h('div', { class: `s-${s.level}` }, h('dt', null, '5시간 세션'), h('dd', null, h('span', { class: 'mini-bar' }, h('span', { style: `width:${s.used ?? 0}%` })), sessionText)),
        billing && h('div', null, h('dt', null, '결제 갱신'), h('dd', null, `${billDays === 0 ? '오늘' : `D-${billDays}`} · ${billing.getMonth() + 1}/${billing.getDate()}`)),
        a.memo && h('div', null, h('dt', null, '메모'), h('dd', { class: 'memo' }, a.memo)),
      ),
    ),
    h(
      'footer',
      { class: 'card-foot' },
      h(
        'button',
        { type: 'button', class: `fresh${needsUpdate ? ' warn' : ''}`, onClick: () => toggleQuick(a.id) },
        a.weekly.updatedAt ? `${formatAgo(a.weekly.updatedAt, now)} 업데이트` : '사용량 기록 없음',
        needsUpdate && h('strong', null, ' · 지금 업데이트'),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn small ghost', onClick: () => openPaste(a.id) }, '붙여넣기'),
        h('button', { type: 'button', class: 'btn small ghost', onClick: () => openEdit(a) }, '편집'),
        h('button', { type: 'button', class: 'btn small primary', 'aria-expanded': String(quickId === a.id), onClick: () => toggleQuick(a.id) }, quickId === a.id ? '닫기' : '사용량 수정'),
      ),
    ),
  );
  if (quickId === a.id) el.appendChild(quickPanel(a, now));
  return el;
}

function toggleQuick(id: string): void {
  quickId = quickId === id ? null : id;
  render();
  if (quickId) document.getElementById(`q-${id}-w`)?.focus({ preventScroll: true });
}

function openQuick(id: string): void {
  quickId = id;
  render();
  const input = document.getElementById(`q-${id}-w`);
  input?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}

/** Slider + number + ±5 steppers, kept in sync. */
function percentField(id: string, label: string, value: number): { el: HTMLElement; get: () => number } {
  const num = h('input', { id, type: 'number', min: '0', max: '100', step: '1', inputMode: 'decimal', value: String(Math.round(value)) });
  const range = h('input', { id: `${id}-range`, type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(value)), 'aria-label': `${label} 슬라이더` });
  const set = (v: number) => {
    const c = String(Math.round(clampPercent(v)));
    num.value = c;
    range.value = c;
  };
  range.addEventListener('input', () => (num.value = range.value));
  num.addEventListener('input', () => (range.value = num.value));
  const step = (d: number) => h('button', { type: 'button', class: 'step', 'aria-label': `${label} ${d > 0 ? '+' : ''}${d}`, onClick: () => set(Number(num.value) + d) }, d > 0 ? `+${d}` : `−${-d}`);
  return {
    el: h('div', { class: 'field pct' }, h('label', { htmlFor: id }, label), h('div', { class: 'pct-row' }, step(-5), range, step(5), h('span', { class: 'num-wrap' }, num, h('span', { class: 'unit' }, '%')))),
    get: () => clampPercent(Number(num.value)),
  };
}

function durationFields(id: string, label: string, ms: number | null, withDays: boolean): { el: HTMLElement; get: () => number } {
  const total = Math.max(0, Math.round((ms ?? 0) / 60_000));
  const box = (suffix: string, unit: string, v: number, max: number) => {
    const input = h('input', { id: `${id}-${suffix}`, type: 'number', min: '0', max: String(max), inputMode: 'numeric', value: String(v), 'aria-label': `${label} ${unit}` });
    return { input, el: h('span', { class: 'dur' }, input, h('span', null, unit)) };
  };
  const d = box('d', '일', Math.floor(total / 1440), 7);
  const hh = box('h', '시간', withDays ? Math.floor((total % 1440) / 60) : Math.floor(total / 60), withDays ? 23 : 5);
  const mm = box('m', '분', total % 60, 59);
  return {
    el: h('div', { class: 'field' }, h('span', { class: 'flabel' }, label), h('div', { class: 'dur-row' }, withDays && d.el, hh.el, mm.el)),
    get: () => {
      const n = (i: HTMLInputElement) => Math.max(0, Number(i.value) || 0);
      return (withDays ? n(d.input) * DAY : 0) + n(hh.input) * HOUR + n(mm.input) * 60_000;
    },
  };
}

/** Session inputs behind an "in use" switch, since most of the time no window is running. */
function sessionFields(prefix: string, s: ReturnType<typeof sessionStatus>): { el: HTMLElement; read: (at: Date) => Account['session'] } {
  const active = s.level === 'active' || s.level === 'blocked';
  const on = h('input', { id: `${prefix}-on`, type: 'checkbox', checked: active });
  const pct = percentField(`${prefix}-pct`, '세션 사용량', s.used ?? 0);
  const left = durationFields(`${prefix}-left`, '풀리기까지', s.msLeft, false);
  const body = h('div', { class: 'sub-fields' }, pct.el, left.el);
  body.hidden = !active;
  on.addEventListener('change', () => (body.hidden = !on.checked));
  return {
    el: h('div', { class: 'session-fields' }, h('label', { class: 'switch' }, on, h('span', null, '5시간 세션 사용 중')), body),
    read: (at) => {
      if (!on.checked) return { used: null, resetAt: null, updatedAt: at.toISOString() };
      const ms = left.get();
      return { used: pct.get(), resetAt: ms > 0 ? new Date(at.getTime() + ms).toISOString() : null, updatedAt: at.toISOString() };
    },
  };
}

function quickPanel(a: Account, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const weekly = percentField(`q-${a.id}-w`, '주간 사용량', w.level === 'stale-reset' ? 0 : (w.used ?? 0));
  const session = sessionFields(`q-${a.id}-s`, s);
  const form = h(
    'form',
    { class: 'quick' },
    weekly.el,
    session.el,
    h(
      'div',
      { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onClick: () => ((quickId = null), render()) }, '취소'),
      h('button', { type: 'submit', class: 'btn primary' }, '저장'),
    ),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date();
    const next: Account = {
      ...a,
      weekly: { used: weekly.get(), resetAt: w.resetAt?.toISOString() ?? a.weekly.resetAt, updatedAt: at.toISOString() },
      session: session.read(at),
    };
    if (await save(next)) {
      quickId = null;
      toast('저장했어요');
    }
  });
  return form;
}

// ---------- add / edit ----------

function openEdit(existing: Account | null): void {
  const now = new Date();
  const a = existing ?? newAccount(newId(), now);
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const sheet = openSheet(existing ? '계정 편집' : '계정 추가');

  const name = h('input', { id: 'f-name', type: 'text', value: a.name, placeholder: '예: 개인, 회사, 서브', required: true, maxLength: 40 });
  const email = h('input', { id: 'f-email', type: 'email', value: a.email, placeholder: 'name@example.com', autocomplete: 'off' });
  const plan = h('select', { id: 'f-plan' }, ...Object.entries(PLAN_LABELS).map(([k, v]) => h('option', { value: k }, v)));
  plan.value = a.plan;

  // Weekly reset: a fixed weekday and time, or "resets in …" as claude.ai sometimes shows it.
  let resetMode: 'weekly' | 'in' = 'weekly';
  const dow = h('select', { id: 'f-dow', 'aria-label': '초기화 요일' }, ...WEEKDAYS.map((d, i) => h('option', { value: String(i) }, `${d}요일`)));
  const time = h('input', { id: 'f-time', type: 'time', 'aria-label': '초기화 시각', value: w.resetAt ? formatClock(w.resetAt) : '09:00' });
  if (w.resetAt) dow.value = String(w.resetAt.getDay());
  const resetIn = durationFields('f-reset-in', '초기화까지 남은 시간', w.msLeft, true);
  const weeklyBox = h('div', { class: 'field' }, h('span', { class: 'flabel' }, '매주'), h('div', { class: 'inline' }, dow, time));
  const preview = h('p', { class: 'hint' });
  const modeBtn = (mode: 'weekly' | 'in', label: string) => h('button', { type: 'button', class: 'seg', onClick: () => setMode(mode) }, label);
  const segW = modeBtn('weekly', '요일·시각');
  const segIn = modeBtn('in', '남은 시간');

  const computeReset = (at: Date): Date | null => {
    if (resetMode === 'weekly') {
      if (!time.value) return null;
      const [hh, mm] = time.value.split(':').map(Number);
      return nextWeekly(Number(dow.value), hh, mm, at);
    }
    const ms = resetIn.get();
    return ms > 0 ? new Date(at.getTime() + ms) : null;
  };
  const updatePreview = () => {
    const r = computeReset(new Date());
    preview.textContent = r ? `다음 초기화: ${formatDateTime(r)} (${formatDuration(r.getTime() - Date.now())} 뒤)` : '';
  };
  const setMode = (m: 'weekly' | 'in') => {
    resetMode = m;
    segW.setAttribute('aria-pressed', String(m === 'weekly'));
    segIn.setAttribute('aria-pressed', String(m === 'in'));
    weeklyBox.hidden = m !== 'weekly';
    resetIn.el.hidden = m !== 'in';
    updatePreview();
  };
  [dow, time].forEach((el) => el.addEventListener('input', updatePreview));
  resetIn.el.addEventListener('input', updatePreview);

  const weeklyKnown = h('input', { id: 'f-weekly-known', type: 'checkbox', checked: a.weekly.used !== null || !existing });
  const weekly = percentField('f-weekly', '주간 사용량', w.level === 'stale-reset' ? 0 : (w.used ?? 0));
  const session = sessionFields('f-session', s);
  const billing = h('input', { id: 'f-billing', type: 'number', min: '1', max: '31', inputMode: 'numeric', value: a.billingDay ? String(a.billingDay) : '', placeholder: '예: 15' });
  const memo = h('input', { id: 'f-memo', type: 'text', value: a.memo, maxLength: 80, placeholder: '예: 코딩 전용' });
  const error = h('p', { class: 'error', role: 'alert' });

  let armed = false;
  const del =
    existing &&
    h(
      'button',
      {
        type: 'button',
        class: 'btn danger',
        onClick: async () => {
          if (!armed) {
            armed = true;
            del!.textContent = '한 번 더 누르면 삭제돼요';
            return;
          }
          try {
            await store!.remove(a.id);
            sheet.close();
            toast(`${nameOf(a)}을 삭제했어요`);
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
      },
      '삭제',
    );

  const form = h(
    'form',
    { class: 'edit', novalidate: true },
    h('div', { class: 'field' }, h('label', { htmlFor: 'f-name' }, '이름'), name),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { htmlFor: 'f-email' }, '이메일 (선택)'), email), h('div', { class: 'field' }, h('label', { htmlFor: 'f-plan' }, '요금제'), plan)),
    h(
      'fieldset',
      null,
      h('legend', null, '주간 한도'),
      h('div', { class: 'segs', role: 'group', 'aria-label': '초기화 시각 입력 방식' }, segW, segIn),
      weeklyBox,
      resetIn.el,
      preview,
      h('label', { class: 'switch' }, weeklyKnown, h('span', null, '현재 사용량을 알고 있어요')),
      weekly.el,
    ),
    h('fieldset', null, h('legend', null, '5시간 세션'), session.el),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { htmlFor: 'f-billing' }, '결제 갱신일 (매달)'), billing), h('div', { class: 'field' }, h('label', { htmlFor: 'f-memo' }, '메모'), memo)),
    error,
    h('div', { class: 'row end sticky-actions' }, del, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn ghost', onClick: () => sheet.close() }, '취소'), h('button', { type: 'submit', class: 'btn primary' }, existing ? '저장' : '추가')),
  );
  weeklyKnown.addEventListener('change', () => (weekly.el.hidden = !weeklyKnown.checked));
  weekly.el.hidden = !weeklyKnown.checked;
  setMode('weekly');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date();
    if (!name.value.trim()) {
      error.textContent = '이름을 넣어 주세요.';
      name.focus();
      return;
    }
    if (resetMode === 'in' && resetIn.get() > 8 * DAY) {
      error.textContent = '주간 초기화까지는 7일을 넘을 수 없어요.';
      return;
    }
    const day = billing.value ? Math.round(Number(billing.value)) : null;
    if (day !== null && (day < 1 || day > 31)) {
      error.textContent = '결제 갱신일은 1~31 사이로 넣어 주세요.';
      return;
    }
    const reset = computeReset(at);
    const weeklyChanged = weeklyKnown.checked && (weekly.get() !== w.used || a.weekly.used === null || w.level === 'stale-reset');
    const next: Account = {
      ...a,
      name: name.value.trim(),
      email: email.value.trim(),
      plan: plan.value as Plan,
      weekly: {
        used: weeklyKnown.checked ? weekly.get() : null,
        resetAt: reset ? reset.toISOString() : null,
        updatedAt: weeklyChanged ? at.toISOString() : a.weekly.updatedAt,
      },
      session: session.read(at),
      billingDay: day,
      memo: memo.value.trim(),
    };
    if (await save(next)) {
      sheet.close();
      toast(existing ? '저장했어요' : `${next.name}을 추가했어요`);
    }
  });
  append(sheet.body, [form]);
  name.focus();
}

// ---------- paste import ----------

let pasteSheet: Sheet | null = null;

function openPaste(accountId: string | null, initial = ''): void {
  pasteSheet?.close();
  const sheet = openSheet('붙여넣기로 업데이트');
  pasteSheet = sheet;
  const text = h('textarea', { id: 'p-text', rows: 4, placeholder: '북마클릿이 복사한 내용을 여기에 붙여 넣으세요', value: initial });
  const target = h('select', { id: 'p-target' }, h('option', { value: '' }, '계정을 고르세요'), ...accounts.map((a) => h('option', { value: a.id }, nameOf(a))), h('option', { value: '__new' }, '+ 새 계정으로 추가'));
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });
  const apply = h('button', { type: 'submit', class: 'btn primary', disabled: true }, '적용');
  let parsed: ImportedUsage | null = null;
  if (accountId) target.value = accountId;

  const update = () => {
    parsed = text.value.trim() ? parseUsageJson(text.value) : null;
    if (!text.value.trim()) {
      replaceChildren(preview);
    } else if (!parsed) {
      replaceChildren(preview, h('p', { class: 'error' }, '사용량 정보를 찾지 못했어요. 북마클릿이 복사한 내용 전체를 붙여 넣었는지 확인해 주세요.'));
    } else {
      if (!target.value && parsed.email) {
        const match = accounts.find((a) => a.email.toLowerCase() === parsed!.email!.toLowerCase());
        target.value = match ? match.id : '__new';
      }
      const now = new Date();
      const line = (label: string, v: { used: number; resetAt: string | null } | null) =>
        v && h('li', null, h('strong', null, label), ` ${round1(v.used)}%`, v.resetAt ? ` · ${formatWhen(new Date(v.resetAt), now)} 초기화` : '');
      replaceChildren(preview, h('ul', null, parsed.email && h('li', null, h('strong', null, '계정'), ` ${parsed.email}`), line('주간', parsed.weekly), line('5시간 세션', parsed.session)));
    }
    apply.disabled = !parsed || !target.value;
  };
  text.addEventListener('input', update);
  target.addEventListener('change', update);

  const code = h('textarea', { id: 'p-code', rows: 3, readOnly: true, value: BOOKMARKLET, hidden: true, 'aria-label': '북마클릿 코드' });
  const copyBtn = h('button', { type: 'button', class: 'btn small' }, '코드 복사');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET);
      toast('복사했어요. 새 북마크의 주소(URL)에 붙여 넣으세요.');
    } catch {
      code.hidden = false;
      code.select();
    }
  });
  const dragLink = h('a', { class: 'bookmarklet', href: BOOKMARKLET, title: '북마크바로 끌어다 놓으세요' }, '클로드 사용량 복사');
  dragLink.addEventListener('click', (e) => {
    e.preventDefault();
    toast('이 버튼은 북마크바로 끌어다 놓은 뒤 claude.ai에서 눌러요.');
  });

  const form = h(
    'form',
    { class: 'paste' },
    h(
      'details',
      { class: 'how', open: !initial },
      h('summary', null, '북마클릿 만들기 (실험적)'),
      h(
        'ol',
        null,
        h('li', null, h('span', null, '버튼을 북마크바로 끌어다 놓거나 코드를 복사해 새 북마크 주소로 저장'), h('span', { class: 'row' }, dragLink, copyBtn)),
        h('li', null, '컴퓨터 브라우저로 claude.ai에 로그인한 뒤 그 북마크를 누르면 사용량이 복사돼요'),
        h('li', null, '여기에 붙여 넣고 계정을 골라 적용. 다른 계정도 로그인을 바꿔 가며 반복'),
      ),
      code,
      h('p', { class: 'hint' }, 'claude.ai의 공개되지 않은 주소를 읽기 때문에 바뀌면 작동하지 않을 수 있어요. 그땐 직접 입력하세요. 로그인 정보는 복사하지 않아요.'),
    ),
    h('div', { class: 'field' }, h('label', { htmlFor: 'p-text' }, '복사한 내용'), text),
    h('div', { class: 'field' }, h('label', { htmlFor: 'p-target' }, '넣을 계정'), target),
    preview,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn ghost', onClick: () => sheet.close() }, '취소'), apply),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!parsed || !target.value) return;
    const now = new Date();
    let base: Account | undefined = accounts.find((a) => a.id === target.value);
    if (!base) {
      base = newAccount(newId(), now);
      base.name = parsed.email?.split('@')[0] ?? '새 계정';
    }
    const next = applyImport(base, parsed, now);
    if (await save(next)) {
      sheet.close();
      toast(`${nameOf(next)} 사용량을 업데이트했어요`);
    }
  });
  append(sheet.body, [form]);
  update();
  text.focus();
}

// Pasting usage JSON anywhere outside a field opens the import with it.
document.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const text = e.clipboardData?.getData('text') ?? '';
  if (parseUsageJson(text)) {
    e.preventDefault();
    openPaste(null, text);
  }
});

// ---------- examples ----------

async function addExamples(): Promise<void> {
  const now = new Date();
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const read = iso(-30 * 60_000);
  const make = (name: string, plan: Plan, used: number, resetIn: number, session: Account['session'], billingDay: number, memo: string): Account => ({
    ...newAccount(newId(), now),
    name,
    plan,
    weekly: { used, resetAt: iso(resetIn), updatedAt: read },
    session,
    billingDay,
    memo,
  });
  const examples = [
    make('예시 · 개인', 'pro', 58, 20 * HOUR, { used: 40, resetAt: iso(2 * HOUR + 10 * 60_000), updatedAt: read }, 15, '예시예요. 편집 → 삭제로 지우세요'),
    make('예시 · 회사', 'max5', 31, 4 * DAY + 6 * HOUR, { used: null, resetAt: null, updatedAt: null }, 3, '예시예요'),
    make('예시 · 서브', 'pro', 64, 5 * DAY, { used: 100, resetAt: iso(HOUR + 25 * 60_000), updatedAt: read }, 27, '예시예요'),
  ];
  for (const a of examples) if (!(await save(a))) return;
  toast('예시 계정 3개를 넣었어요');
}

// ---------- boot ----------

render();
openStore().then((s) => {
  store = s;
  s.subscribe(
    (list) => {
      accounts = list;
      loaded = true;
      if (quickId && !list.some((a) => a.id === quickId)) quickId = null;
      render();
    },
    (message) => toast(message),
  );
  render();
});

// Countdowns move on their own; skip while a quick edit is open so typed values survive.
setInterval(() => {
  if (!quickId) render();
}, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !quickId) render();
});
