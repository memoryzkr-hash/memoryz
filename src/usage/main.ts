import './usage.css';
import { append, h, openSheet, replaceChildren, toast, type Sheet } from '../assistant/ui/dom';
import { BOOKMARKLET } from './bookmarklet';
import {
  applyImport,
  clampPercent,
  DAY,
  daysUntil,
  formatAgo,
  formatDateTime,
  formatDuration,
  formatWhen,
  formatClock,
  HOUR,
  newAccount,
  nextBilling,
  parseUsageJson,
  PLAN_LABELS,
  rankAccounts,
  round1,
  sessionStatus,
  STALE_AFTER,
  toLocalInput,
  weeklyStatus,
  type Account,
  type ImportedUsage,
  type Plan,
  type WeeklyLevel,
} from './core';
import { openStore, type AccountStore } from './store';

type SortMode = 'reset' | 'remaining' | 'name';

const LEVEL: Record<WeeklyLevel, { label: string; note: (s: ReturnType<typeof weeklyStatus>) => string }> = {
  unknown: { label: '입력 필요', note: () => '주간 사용량과 초기화 시각을 넣어 주세요' },
  'stale-reset': { label: '초기화됨', note: () => '지난 기록 뒤로 한도가 초기화됐어요. 새 사용량을 넣어 주세요' },
  exhausted: { label: '소진', note: (s) => `${formatDuration(s.msLeft!)} 뒤 다시 쓸 수 있어요` },
  fast: { label: '과속', note: (s) => `이 속도면 초기화 전에 다 써요 (예상 ${s.projected}%)` },
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

async function save(a: Account): Promise<boolean> {
  try {
    await store!.save(a);
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
}

// ---------- layout ----------

const app = document.getElementById('app')!;
const storageBadge = h('span', { class: 'badge' }, '불러오는 중…');
const recEl = h('section', { class: 'rec', 'aria-label': '지금 쓸 계정' });
const listEl = h('div', { class: 'cards' });
const sortSelect = h(
  'select',
  {
    id: 'sort',
    'aria-label': '정렬',
    onChange: () => {
      sortMode = sortSelect.value as SortMode;
      writePref('sort', sortMode);
      render();
    },
  },
  h('option', { value: 'reset' }, '초기화 임박순'),
  h('option', { value: 'remaining' }, '남은 양 많은 순'),
  h('option', { value: 'name' }, '이름순'),
);
sortSelect.value = sortMode;

append(app, [
  h(
    'header',
    { class: 'top' },
    h('div', { class: 'brand' }, h('h1', null, '클로드 사용량'), storageBadge),
    h(
      'div',
      { class: 'top-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => openPaste(null) }, '붙여넣기로 업데이트'),
      h('button', { type: 'button', class: 'btn primary', onClick: () => openEdit(null) }, '+ 계정 추가'),
    ),
  ),
  recEl,
  h('div', { class: 'list-head' }, h('h2', null, '계정'), sortSelect),
  listEl,
  h(
    'footer',
    { class: 'foot' },
    h('p', null, '사용량은 claude.ai → 설정 → 사용량에서 확인한 값을 넣어요. 주간 초기화 시각은 한 번만 넣으면 7일마다 자동으로 넘어갑니다.'),
  ),
]);

// ---------- render ----------

function sorted(now: Date): Account[] {
  const list = [...accounts];
  if (sortMode === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const key = (a: Account) => {
    const s = weeklyStatus(a.weekly, now);
    if (sortMode === 'reset') return s.msLeft ?? Infinity;
    return -(s.remaining ?? -1);
  };
  return list.sort((a, b) => key(a) - key(b));
}

function render(): void {
  const now = new Date();
  storageBadge.textContent = !store ? '불러오는 중…' : store.kind === 'cloud' ? '클라우드 저장 · 어느 기기에서나' : '이 브라우저에만 저장';
  storageBadge.className = `badge ${store?.kind ?? ''}`;
  renderRecommendation(now);
  if (!loaded) {
    replaceChildren(listEl, h('p', { class: 'empty' }, '계정 목록을 불러오는 중이에요…'));
    return;
  }
  if (accounts.length === 0) {
    replaceChildren(
      listEl,
      h(
        'div',
        { class: 'empty' },
        h('h3', null, '등록된 계정이 없어요'),
        h('p', null, '계정을 추가하고 claude.ai 설정 → 사용량에 나온 주간 사용량과 초기화 시각을 넣으면, 계정마다 남은 양과 초기화까지 남은 시간을 여기서 볼 수 있어요.'),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onClick: () => openEdit(null) }, '+ 계정 추가'),
          h('button', { type: 'button', class: 'btn', onClick: addExamples }, '예시 계정 넣어 보기'),
        ),
      ),
    );
    return;
  }
  replaceChildren(listEl, ...sorted(now).map((a) => card(a, now)));
}

function renderRecommendation(now: Date): void {
  if (!loaded || accounts.length === 0) {
    recEl.hidden = true;
    return;
  }
  recEl.hidden = false;
  const { picks, blocked } = rankAccounts(accounts, now);
  const top = picks[0];
  replaceChildren(
    recEl,
    h('p', { class: 'eyebrow' }, '지금 쓸 계정'),
    top
      ? h(
          'div',
          { class: 'rec-top' },
          h('h2', null, top.account.name || '이름 없는 계정'),
          h('p', null, top.reason),
          h('p', { class: 'rec-rate' }, `초기화까지 시간당 ${round1(top.perHour)}%씩 써도 돼요`),
        )
      : h('div', { class: 'rec-top' }, h('h2', null, '지금 바로 쓸 수 있는 계정이 없어요'), h('p', null, '아래 사유를 확인하세요.')),
    picks.length > 1 &&
      h(
        'ol',
        { class: 'rec-rest' },
        ...picks.slice(1).map((p, i) => h('li', null, h('span', { class: 'rank' }, String(i + 2)), h('strong', null, p.account.name || '이름 없는 계정'), h('span', null, p.reason))),
      ),
    blocked.length > 0 &&
      h(
        'ul',
        { class: 'rec-blocked' },
        ...blocked.map((b) => h('li', null, h('span', { class: 'rank' }, '대기'), h('strong', null, b.account.name || '이름 없는 계정'), h('span', null, b.reason))),
      ),
  );
}

function card(a: Account, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const lv = LEVEL[w.level];
  const stale = !!a.weekly.updatedAt && now.getTime() - new Date(a.weekly.updatedAt).getTime() > STALE_AFTER && w.level !== 'stale-reset';
  const usedPct = w.used ?? 0;

  const weekly = h(
    'section',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter-top' },
      h('span', { class: 'label' }, '주간 한도'),
      h('span', { class: 'big' }, w.used === null ? '–' : String(round1(usedPct)), h('small', null, '% 사용')),
      w.remaining !== null && h('span', { class: 'left' }, `${round1(w.remaining)}% 남음`),
    ),
    h(
      'div',
      {
        class: 'bar',
        role: 'meter',
        'aria-label': '주간 사용량',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(usedPct),
      },
      h('div', { class: 'fill', style: `width:${usedPct}%` }),
      w.elapsed !== null && h('div', { class: 'tick', style: `left:${round1(w.elapsed * 100)}%`, title: '지금 시점 기준선' }),
    ),
    w.resetAt
      ? h(
          'div',
          { class: 'meter-meta' },
          h('span', null, `초기화 ${formatDateTime(w.resetAt)}`),
          h('span', null, `${formatDuration(w.msLeft!)} 남음`),
        )
      : h('div', { class: 'meter-meta' }, h('span', null, '초기화 시각 미입력')),
    w.elapsed !== null && h('p', { class: 'legend' }, h('i', { class: 'tick-key' }), `이번 주 ${Math.round(w.elapsed * 100)}% 지남 — 막대가 이 선보다 길면 빨리 쓰는 중`),
  );

  const sessionText =
    s.level === 'unknown'
      ? '기록 없음'
      : s.level === 'idle'
        ? '새 세션 가능'
        : s.resetAt
          ? `${round1(s.used ?? 0)}% · ${formatDuration(s.msLeft!)} 뒤 풀림 (${formatClock(s.resetAt)})`
          : `${round1(s.used ?? 0)}%`;
  const session = h(
    'div',
    { class: `session s-${s.level}` },
    h('span', { class: 'label' }, '5시간 세션'),
    h('span', { class: 'mini-bar' }, h('span', { style: `width:${s.used ?? 0}%` })),
    h('span', null, sessionText),
  );

  const billing = a.billingDay !== null ? nextBilling(a.billingDay, now) : null;
  const billDays = billing ? daysUntil(billing, now) : null;

  const el = h(
    'article',
    { class: `card lv-${w.level}${stale ? ' stale' : ''}` },
    h(
      'header',
      { class: 'card-head' },
      h('div', { class: 'who' }, h('h3', null, a.name || '이름 없는 계정'), a.email && h('p', { class: 'email' }, a.email)),
      h('span', { class: 'plan' }, PLAN_LABELS[a.plan]),
    ),
    h('div', { class: 'status' }, h('span', { class: `pill p-${w.level}` }, lv.label), h('span', { class: 'note' }, lv.note(w))),
    weekly,
    session,
    h(
      'footer',
      { class: 'card-foot' },
      h(
        'div',
        { class: 'facts' },
        billing && h('span', null, `결제 갱신 ${billDays === 0 ? '오늘' : `D-${billDays}`} (${billing.getMonth() + 1}/${billing.getDate()})`),
        h('span', { class: stale ? 'warn' : '' }, a.weekly.updatedAt ? `업데이트 ${formatAgo(a.weekly.updatedAt, now)}${stale ? ' · 오래된 값' : ''}` : '사용량 기록 없음'),
        a.memo && h('span', { class: 'memo' }, a.memo),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onClick: () => openPaste(a.id) }, '붙여넣기'),
        h('button', { type: 'button', class: 'btn small', onClick: () => openEdit(a) }, '편집'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn small primary',
            'aria-expanded': String(quickId === a.id),
            onClick: () => {
              quickId = quickId === a.id ? null : a.id;
              render();
            },
          },
          '사용량 수정',
        ),
      ),
    ),
  );
  if (quickId === a.id) el.appendChild(quickPanel(a, now));
  return el;
}

/** Slider + number pair that stay in sync. */
function percentField(id: string, label: string, value: number): { el: HTMLElement; get: () => number } {
  const num = h('input', { id, type: 'number', min: '0', max: '100', step: '1', inputMode: 'decimal', value: String(value) });
  const range = h('input', { id: `${id}-range`, type: 'range', min: '0', max: '100', step: '1', value: String(value), 'aria-label': `${label} 슬라이더` });
  range.addEventListener('input', () => (num.value = range.value));
  num.addEventListener('input', () => (range.value = num.value));
  return {
    el: h('div', { class: 'field pct' }, h('label', { htmlFor: id }, label), h('div', { class: 'pct-row' }, range, num, h('span', { class: 'unit' }, '%'))),
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

function quickPanel(a: Account, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const weekly = percentField(`q-${a.id}-w`, '주간 사용량', w.used ?? 0);
  const session = percentField(`q-${a.id}-s`, '5시간 세션 사용량', s.used ?? 0);
  const left = durationFields(`q-${a.id}-sl`, '세션이 풀리기까지', s.msLeft, false);
  const form = h(
    'form',
    { class: 'quick' },
    weekly.el,
    session.el,
    left.el,
    h('p', { class: 'hint' }, '세션을 아직 시작하지 않았으면 세션 사용량과 시간을 0으로 두세요.'),
    h(
      'div',
      { class: 'row end' },
      h('button', { type: 'button', class: 'btn', onClick: () => ((quickId = null), render()) }, '취소'),
      h('button', { type: 'submit', class: 'btn primary' }, '저장'),
    ),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date();
    const leftMs = left.get();
    const next: Account = {
      ...a,
      weekly: { used: weekly.get(), resetAt: w.resetAt?.toISOString() ?? a.weekly.resetAt, updatedAt: at.toISOString() },
      session: leftMs > 0 ? { used: session.get(), resetAt: new Date(at.getTime() + leftMs).toISOString(), updatedAt: at.toISOString() } : { used: session.get() > 0 ? session.get() : null, resetAt: null, updatedAt: at.toISOString() },
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

  // Weekly reset: an exact time, or "resets in …" as claude.ai often shows it.
  let resetMode: 'at' | 'in' = 'at';
  const resetAt = h('input', { id: 'f-reset', type: 'datetime-local', value: w.resetAt ? toLocalInput(w.resetAt) : '' });
  const resetIn = durationFields('f-reset-in', '초기화까지 남은 시간', w.msLeft, true);
  const atBox = h('div', { class: 'field' }, h('label', { htmlFor: 'f-reset' }, '다음 초기화 날짜·시각'), resetAt);
  const modeBtn = (mode: 'at' | 'in', label: string) =>
    h('button', { type: 'button', class: 'seg', 'aria-pressed': String(mode === resetMode), onClick: () => setMode(mode) }, label);
  const segAt = modeBtn('at', '날짜·시각으로');
  const segIn = modeBtn('in', '남은 시간으로');
  const setMode = (m: 'at' | 'in') => {
    resetMode = m;
    segAt.setAttribute('aria-pressed', String(m === 'at'));
    segIn.setAttribute('aria-pressed', String(m === 'in'));
    atBox.hidden = m !== 'at';
    resetIn.el.hidden = m !== 'in';
  };
  setMode('at');

  const weekly = percentField('f-weekly', '주간 사용량', w.used ?? 0);
  const weeklyKnown = h('input', { id: 'f-weekly-known', type: 'checkbox', checked: a.weekly.used !== null || !existing });
  const session = percentField('f-session', '5시간 세션 사용량', s.used ?? 0);
  const sessionLeft = durationFields('f-session-left', '세션이 풀리기까지', s.msLeft, false);
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
            toast(`${a.name || '계정'}을 삭제했어요`);
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
      },
      '계정 삭제',
    );

  const form = h(
    'form',
    { class: 'edit', novalidate: true },
    h('div', { class: 'field' }, h('label', { htmlFor: 'f-name' }, '이름'), name),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { htmlFor: 'f-email' }, '이메일 (선택)'), email), h('div', { class: 'field' }, h('label', { htmlFor: 'f-plan' }, '요금제'), plan)),
    h('fieldset', null, h('legend', null, '주간 한도'), h('div', { class: 'segs', role: 'group', 'aria-label': '초기화 시각 입력 방식' }, segAt, segIn), atBox, resetIn.el, h('label', { class: 'check' }, weeklyKnown, '사용량을 확인했어요'), weekly.el),
    h('fieldset', null, h('legend', null, '5시간 세션 (선택)'), session.el, sessionLeft.el),
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { htmlFor: 'f-billing' }, '결제 갱신일 (매달 며칠)'), billing), h('div', { class: 'field' }, h('label', { htmlFor: 'f-memo' }, '메모'), memo)),
    error,
    h('div', { class: 'row end' }, del, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn', onClick: () => sheet.close() }, '취소'), h('button', { type: 'submit', class: 'btn primary' }, '저장')),
  );
  weeklyKnown.addEventListener('change', () => (weekly.el.hidden = !weeklyKnown.checked));
  weekly.el.hidden = !weeklyKnown.checked;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date();
    if (!name.value.trim()) {
      error.textContent = '이름을 넣어 주세요.';
      name.focus();
      return;
    }
    let reset: string | null = null;
    if (resetMode === 'at') {
      if (resetAt.value) reset = new Date(resetAt.value).toISOString();
    } else {
      const ms = resetIn.get();
      if (ms > 8 * DAY) {
        error.textContent = '주간 초기화까지는 7일을 넘을 수 없어요.';
        return;
      }
      if (ms > 0) reset = new Date(at.getTime() + ms).toISOString();
    }
    const day = billing.value ? Math.round(Number(billing.value)) : null;
    if (day !== null && (day < 1 || day > 31)) {
      error.textContent = '결제 갱신일은 1~31 사이로 넣어 주세요.';
      return;
    }
    const weeklyChanged = weeklyKnown.checked && (weekly.get() !== w.used || a.weekly.used === null);
    const sLeft = sessionLeft.get();
    const sessionChanged = session.get() !== (s.used ?? 0) || Math.abs(sLeft - (s.msLeft ?? 0)) > 60_000;
    const next: Account = {
      ...a,
      name: name.value.trim(),
      email: email.value.trim(),
      plan: plan.value as Plan,
      weekly: {
        used: weeklyKnown.checked ? weekly.get() : null,
        resetAt: reset,
        updatedAt: weeklyChanged ? at.toISOString() : a.weekly.updatedAt,
      },
      session: !sessionChanged
        ? a.session
        : sLeft > 0
          ? { used: session.get(), resetAt: new Date(at.getTime() + sLeft).toISOString(), updatedAt: at.toISOString() }
          : { used: session.get() > 0 ? session.get() : null, resetAt: null, updatedAt: at.toISOString() },
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
  const target = h('select', { id: 'p-target' }, h('option', { value: '' }, '계정을 고르세요'), ...accounts.map((a) => h('option', { value: a.id }, a.name || a.email || '이름 없는 계정')), h('option', { value: '__new' }, '+ 새 계정으로 추가'));
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

  const copyBtn = h('button', { type: 'button', class: 'btn small' }, '북마클릿 코드 복사');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET);
      toast('복사했어요. 새 북마크의 주소(URL)에 붙여 넣으세요.');
    } catch {
      code.hidden = false;
      code.select();
    }
  });
  const code = h('textarea', { id: 'p-code', rows: 3, readOnly: true, value: BOOKMARKLET, hidden: true, 'aria-label': '북마클릿 코드' });
  const dragLink = h('a', { class: 'bookmarklet', href: BOOKMARKLET, title: '북마크바로 끌어다 놓으세요' }, '클로드 사용량 복사');
  dragLink.addEventListener('click', (e) => {
    e.preventDefault();
    toast('이 버튼은 북마크바로 끌어다 놓아서 claude.ai에서 눌러요.');
  });

  const form = h(
    'form',
    { class: 'paste' },
    h(
      'details',
      { class: 'how', open: accounts.length === 0 || !initial },
      h('summary', null, '처음이라면: 북마클릿 만들기 (실험적)'),
      h(
        'ol',
        null,
        h('li', null, '아래 버튼을 북마크바로 끌어다 놓거나, 코드를 복사해 새 북마크의 주소로 저장하세요. ', dragLink, ' ', copyBtn),
        h('li', null, '컴퓨터 브라우저에서 claude.ai에 원하는 계정으로 로그인한 뒤 그 북마크를 누르세요. 사용량이 복사돼요.'),
        h('li', null, '여기에 붙여 넣고 계정을 고른 뒤 적용하세요. 다른 계정도 로그인을 바꿔 가며 반복하면 돼요.'),
      ),
      code,
      h('p', { class: 'hint' }, 'claude.ai의 공개되지 않은 주소를 읽기 때문에 claude.ai가 바뀌면 작동하지 않을 수 있어요. 그럴 땐 카드의 "사용량 수정"으로 직접 넣으세요. 로그인 정보는 복사하지 않아요.'),
    ),
    h('div', { class: 'field' }, h('label', { htmlFor: 'p-text' }, '복사한 내용'), text),
    h('div', { class: 'field' }, h('label', { htmlFor: 'p-target' }, '어느 계정에 넣을까요?'), target),
    preview,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onClick: () => sheet.close() }, '취소'), apply),
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
      toast(`${next.name || '계정'} 사용량을 업데이트했어요`);
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
    make('예시 · 개인', 'pro', 58, 20 * HOUR, { used: 40, resetAt: iso(2 * HOUR + 10 * 60_000), updatedAt: read }, 15, '예시예요. 편집 → 계정 삭제로 지우세요'),
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
