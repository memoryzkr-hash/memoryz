import './usage.css';
import macScript from '../../tools/claude-usage/claude-usage?raw';
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
  HOUR,
  matchAccount,
  newAccount,
  nextBilling,
  nextWeekly,
  parseUsageBatch,
  PLAN_LABELS,
  rankAccounts,
  round1,
  SESSION,
  sessionStatus,
  STALE_AFTER,
  WEEK,
  weeklyStatus,
  type Account,
  type ImportBatch,
  type Plan,
  type WeeklyLevel,
  type WeeklyStatus,
} from './core';
import { openStore, type AccountStore } from './store';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const LEVEL: Record<WeeklyLevel, { label: string; note: (s: WeeklyStatus) => string }> = {
  unknown: { label: '입력 필요', note: () => '사용량을 불러오면 여기에 보여요' },
  'stale-reset': { label: '초기화됨', note: () => '초기화됐어요. 새 사용량을 불러와 주세요' },
  exhausted: { label: '소진', note: (s) => `${formatDuration(s.msLeft!)} 뒤에 다시 쓸 수 있어요` },
  fast: { label: '빠르게 쓰는 중', note: (s) => `이 속도면 초기화 전에 다 써요 · 예상 ${s.projected}%` },
  'use-it': { label: '곧 초기화', note: (s) => `${round1(s.remaining!)}% 남았는데 하루 안에 초기화돼요` },
  ok: { label: '적당해요', note: (s) => (s.projected === null ? '이번 주가 막 시작됐어요' : `이 속도면 초기화 때 약 ${s.projected}%`) },
  plenty: { label: '여유 있어요', note: (s) => `이 속도면 초기화 때 약 ${s.projected}%` },
};

let store: AccountStore | null = null;
let accounts: Account[] = [];
let loaded = false;
let quickId: string | null = null;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const nameOf = (a: Account) => a.name || a.email || '이름 없는 계정';
/** Registration order is the account number ("계정 1", "계정 2"). */
const ordered = () => [...accounts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

async function save(a: Account): Promise<boolean> {
  try {
    await store!.save(a);
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
}

async function copy(text: string, done: string, fallback?: HTMLTextAreaElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    if (fallback) {
      fallback.hidden = false;
      fallback.select();
      toast('자동 복사가 막혀 있어요. 선택된 내용을 Cmd+C로 복사하세요.');
    } else toast('복사하지 못했어요.');
  }
}

// ---------- layout ----------

const app = document.getElementById('app')!;
const subtitle = h('p', { class: 'sub' }, '불러오는 중…');
const recEl = h('section', { class: 'rec', 'aria-live': 'polite' });
const listEl = h('div', { class: 'list' });
const autoSub = h('span', null, '명령 한 줄로 모든 계정의 사용량을 가져와요');
const autoRow = h(
  'button',
  { type: 'button', class: 'row-link', onClick: () => openSetup() },
  h('span', { class: 'row-icon', 'aria-hidden': 'true' }, '⌘'),
  h('span', { class: 'row-text' }, h('strong', null, '맥에서 자동으로 불러오기'), autoSub),
  h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'),
);

append(app, [
  h(
    'header',
    { class: 'top' },
    h('div', null, h('h1', null, '클로드 사용량'), subtitle),
    h('button', { type: 'button', class: 'text-btn', onClick: () => openEdit(null) }, '계정 추가'),
  ),
  recEl,
  listEl,
  autoRow,
  h('p', { class: 'foot' }, '주간 초기화 시각은 한 번 알면 매주 자동으로 넘어가요. 값은 이 페이지에만 저장되고, 로그인 정보는 받지 않아요.'),
]);

const cta = h(
  'div',
  { class: 'cta' },
  h(
    'div',
    { class: 'cta-inner' },
    h('button', { type: 'button', class: 'btn big secondary', onClick: () => openEdit(null) }, '계정 추가'),
    h('button', { type: 'button', class: 'btn big primary', onClick: () => (LOCAL ? loadLocalData(true) : openPaste()) }, '사용량 불러오기'),
  ),
);
document.body.appendChild(cta);

// ---------- render ----------

function render(): void {
  const now = new Date();
  if (!loaded) {
    subtitle.textContent = '불러오는 중…';
    recEl.hidden = true;
    replaceChildren(listEl, h('div', { class: 'card skeleton' }), h('div', { class: 'card skeleton' }));
    return;
  }
  const latest = accounts.map((a) => a.weekly.updatedAt).filter(Boolean).sort().pop();
  subtitle.textContent = accounts.length === 0 ? '계정을 추가해 주세요' : `계정 ${accounts.length}개${latest ? ` · ${formatAgo(latest, now)} 업데이트` : ''}${store?.kind === 'cloud' ? ' · 클라우드 저장' : LOCAL ? ' · 이 맥에 저장' : ''}`;

  if (LOCAL) {
    autoSub.textContent =
      localState === 'missing' ? '아직 조회 결과가 없어요 · 터미널에서 claude-usage 를 실행하세요' : '터미널에서 claude-usage 를 실행하면 이 페이지에 자동으로 반영돼요';
  }

  if (accounts.length === 0) {
    recEl.hidden = true;
    replaceChildren(listEl, emptyState());
    return;
  }
  renderRec(now);
  replaceChildren(listEl, ...ordered().map((a, i) => card(a, i + 1, now)));
}

function emptyState(): HTMLElement {
  return h(
    'div',
    { class: 'card empty' },
    h('h2', null, '등록된 계정이 없어요'),
    h('p', null, '계정 이름만 먼저 추가하고, 사용량은 맥에서 자동으로 불러오거나 직접 넣을 수 있어요.'),
    h(
      'div',
      { class: 'empty-actions' },
      h('button', { type: 'button', class: 'btn primary', onClick: () => openEdit(null) }, '계정 추가하기'),
      h('button', { type: 'button', class: 'btn secondary', onClick: addExamples }, '예시로 둘러보기'),
    ),
  );
}

function renderRec(now: Date): void {
  const { picks } = rankAccounts(accounts, now);
  const top = picks[0];
  recEl.hidden = false;
  if (!top) {
    replaceChildren(recEl, h('p', { class: 'rec-title' }, '지금 바로 쓸 수 있는 계정이 없어요'), h('p', { class: 'rec-sub' }, '사용량을 불러오거나 초기화를 기다려 주세요.'));
    return;
  }
  replaceChildren(
    recEl,
    h('p', { class: 'rec-eyebrow' }, '지금 쓰기 좋은 계정'),
    h('p', { class: 'rec-title' }, '지금은 ', h('strong', null, nameOf(top.account)), ' 계정이 좋아요'),
    h('p', { class: 'rec-sub' }, `${top.reason} · 시간당 ${round1(top.perHour)}%까지 써도 돼요`),
  );
}

/** One limit: title + percent, a bar, and the window it covers with time left. */
function gauge(opts: { title: string; used: number | null; level: string; start: Date | null; end: Date | null; now: Date; elapsed: number | null; empty: string; endFormat: (d: Date) => string }): HTMLElement {
  const { title, used, level, start, end, now, elapsed, empty } = opts;
  const pct = used === null ? null : Math.round(used);
  return h(
    'div',
    { class: `gauge g-${level}` },
    h('div', { class: 'gauge-head' }, h('span', { class: 'gauge-title' }, title), h('span', { class: 'gauge-pct' }, pct === null ? '–' : `${pct}%`)),
    h(
      'div',
      { class: 'track', role: 'meter', 'aria-label': `${title} 사용량`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct ?? 0) },
      h('div', { class: 'fill', style: `width:${pct ?? 0}%` }),
      elapsed !== null && h('div', { class: 'now-mark', style: `left:${round1(elapsed * 100)}%`, title: '기간 중 지금 위치' }),
    ),
    start && end
      ? h(
          'div',
          { class: 'gauge-foot' },
          h('span', { class: 'period' }, `${opts.endFormat(start)} ~ ${opts.endFormat(end)}`),
          h('span', { class: 'left' }, `${formatDuration(end.getTime() - now.getTime())} 남음`),
        )
      : h('div', { class: 'gauge-foot' }, h('span', { class: 'period' }, empty)),
  );
}

function card(a: Account, n: number, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const s = sessionStatus(a.session, now);
  const stale = !!a.weekly.updatedAt && now.getTime() - new Date(a.weekly.updatedAt).getTime() > STALE_AFTER && w.level !== 'stale-reset';
  const billing = a.billingDay !== null ? nextBilling(a.billingDay, now) : null;
  const billDays = billing ? daysUntil(billing, now) : null;

  const weekly = gauge({
    title: '주간 한도',
    used: w.level === 'stale-reset' ? 0 : w.used,
    level: w.level,
    start: w.resetAt ? new Date(w.resetAt.getTime() - WEEK) : null,
    end: w.resetAt,
    now,
    elapsed: w.elapsed,
    empty: '초기화 시각을 모르면 사용량을 불러오거나 편집에서 넣어 주세요',
    endFormat: formatDateTime,
  });
  const sessionLevel = s.level === 'blocked' ? 'exhausted' : s.level === 'active' && (s.used ?? 0) >= 80 ? 'fast' : 'ok';
  const session = gauge({
    title: '5시간 세션',
    used: s.level === 'unknown' ? null : (s.used ?? 0),
    level: sessionLevel,
    start: s.resetAt ? new Date(s.resetAt.getTime() - SESSION) : null,
    end: s.resetAt,
    now,
    elapsed: s.msLeft !== null ? 1 - s.msLeft / SESSION : null,
    empty: s.level === 'idle' ? '진행 중인 세션이 없어요. 지금 새로 시작할 수 있어요' : '세션 정보가 없어요',
    endFormat: formatClock,
  });

  const meta = [billing && `결제일 ${billDays === 0 ? '오늘' : `D-${billDays}`}`, a.weekly.updatedAt ? `${formatAgo(a.weekly.updatedAt, now)} 업데이트` : '아직 불러오지 않음'].filter(Boolean).join(' · ');

  const el = h(
    'article',
    { class: `card account lv-${w.level}${stale ? ' stale' : ''}` },
    h(
      'div',
      { class: 'acc-head' },
      h('div', { class: 'acc-id' }, h('span', { class: 'acc-n' }, `계정 ${n}`), h('h2', null, nameOf(a)), h('span', { class: 'acc-plan' }, PLAN_LABELS[a.plan])),
      h('button', { type: 'button', class: 'text-btn small', onClick: () => openEdit(a) }, '편집'),
    ),
    h('div', { class: 'status' }, h('span', { class: `chip c-${w.level}` }, LEVEL[w.level].label), h('span', { class: 'note' }, LEVEL[w.level].note(w))),
    weekly,
    session,
    h(
      'div',
      { class: 'acc-foot' },
      h('span', { class: stale ? 'warn' : '' }, stale ? `${meta} · 오래된 값이에요` : meta),
      h('button', { type: 'button', class: 'btn small secondary', 'aria-expanded': String(quickId === a.id), onClick: () => toggleQuick(a.id) }, quickId === a.id ? '닫기' : '직접 수정'),
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

// ---------- form pieces ----------

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
  const step = (d: number) => h('button', { type: 'button', class: 'stepper', 'aria-label': `${label} ${d > 0 ? '+' : ''}${d}`, onClick: () => set(Number(num.value) + d) }, d > 0 ? `+${d}` : `−${-d}`);
  return {
    el: h('div', { class: 'field' }, h('label', { htmlFor: id }, label), h('div', { class: 'pct-row' }, step(-5), range, step(5), h('span', { class: 'num-wrap' }, num, h('span', { class: 'unit' }, '%')))),
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

function toggle(id: string, label: string, checked: boolean): { el: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { id, type: 'checkbox', role: 'switch', checked });
  return { input, el: h('label', { class: 'switch', htmlFor: id }, h('span', null, label), input) };
}

/** Session inputs behind an "in use" switch, since most of the time no window is running. */
function sessionFields(prefix: string, s: ReturnType<typeof sessionStatus>): { el: HTMLElement; read: (at: Date) => Account['session'] } {
  const active = s.level === 'active' || s.level === 'blocked';
  const on = toggle(`${prefix}-on`, '5시간 세션 사용 중', active);
  const pct = percentField(`${prefix}-pct`, '세션 사용량', s.used ?? 0);
  const left = durationFields(`${prefix}-left`, '풀리기까지', s.msLeft, false);
  const body = h('div', { class: 'stack' }, pct.el, left.el);
  body.hidden = !active;
  on.input.addEventListener('change', () => (body.hidden = !on.input.checked));
  return {
    el: h('div', { class: 'stack' }, on.el, body),
    read: (at) => {
      if (!on.input.checked) return { used: null, resetAt: null, updatedAt: at.toISOString() };
      const ms = left.get();
      return { used: pct.get(), resetAt: ms > 0 ? new Date(at.getTime() + ms).toISOString() : null, updatedAt: at.toISOString() };
    },
  };
}

function quickPanel(a: Account, now: Date): HTMLElement {
  const w = weeklyStatus(a.weekly, now);
  const weekly = percentField(`q-${a.id}-w`, '주간 사용량', w.level === 'stale-reset' ? 0 : (w.used ?? 0));
  const session = sessionFields(`q-${a.id}-s`, sessionStatus(a.session, now));
  const form = h('form', { class: 'quick' }, weekly.el, session.el, h('button', { type: 'submit', class: 'btn primary full' }, '저장'));
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
  const sheet = openSheet(existing ? '계정 편집' : '계정 추가');

  const name = h('input', { id: 'f-name', type: 'text', value: a.name, placeholder: '예: quaternary2026', required: true, maxLength: 40, autocomplete: 'off' });
  const email = h('input', { id: 'f-email', type: 'email', value: a.email, placeholder: '선택 · name@example.com', autocomplete: 'off' });
  const plan = h('select', { id: 'f-plan' }, ...Object.entries(PLAN_LABELS).map(([k, v]) => h('option', { value: k }, v)));
  plan.value = a.plan;

  const knowsReset = toggle('f-reset-on', '주간 초기화 시각을 알고 있어요', !!w.resetAt);
  const dow = h('select', { id: 'f-dow', 'aria-label': '초기화 요일' }, ...WEEKDAYS.map((d, i) => h('option', { value: String(i) }, `매주 ${d}요일`)));
  const time = h('input', { id: 'f-time', type: 'time', 'aria-label': '초기화 시각', value: w.resetAt ? formatClock(w.resetAt) : '09:00' });
  if (w.resetAt) dow.value = String(w.resetAt.getDay());
  const preview = h('p', { class: 'hint' });
  const resetAt = (at: Date) => {
    if (!knowsReset.input.checked || !time.value) return null;
    const [hh, mm] = time.value.split(':').map(Number);
    return nextWeekly(Number(dow.value), hh, mm, at);
  };
  const updatePreview = () => {
    const r = resetAt(new Date());
    preview.textContent = r ? `다음 초기화는 ${formatDateTime(r)}, ${formatDuration(r.getTime() - Date.now())} 뒤예요` : '';
  };
  const resetBox = h('div', { class: 'stack' }, h('div', { class: 'inline' }, dow, time), preview);
  const syncReset = () => {
    resetBox.hidden = !knowsReset.input.checked;
    updatePreview();
  };
  [dow, time].forEach((el) => el.addEventListener('input', updatePreview));
  knowsReset.input.addEventListener('change', syncReset);

  const knowsUsage = toggle('f-weekly-on', '현재 주간 사용량을 알고 있어요', a.weekly.used !== null);
  const weekly = percentField('f-weekly', '주간 사용량', w.level === 'stale-reset' ? 0 : (w.used ?? 0));
  knowsUsage.input.addEventListener('change', () => (weekly.el.hidden = !knowsUsage.input.checked));
  weekly.el.hidden = !knowsUsage.input.checked;
  const session = sessionFields('f-session', sessionStatus(a.session, now));
  const billing = h('input', { id: 'f-billing', type: 'number', min: '1', max: '31', inputMode: 'numeric', value: a.billingDay ? String(a.billingDay) : '', placeholder: '매달 며칠 · 선택' });
  const memo = h('input', { id: 'f-memo', type: 'text', value: a.memo, maxLength: 80, placeholder: '선택' });
  const error = h('p', { class: 'error', role: 'alert' });

  let armed = false;
  const del =
    existing &&
    h(
      'button',
      {
        type: 'button',
        class: 'text-btn danger',
        onClick: async () => {
          if (!armed) {
            armed = true;
            del!.textContent = '한 번 더 누르면 삭제돼요';
            return;
          }
          try {
            await store!.remove(a.id);
            sheet.close();
            toast(`${nameOf(a)} 계정을 삭제했어요`);
          } catch (e) {
            error.textContent = (e as Error).message;
          }
        },
      },
      '이 계정 삭제',
    );

  const field = (id: string, label: string, input: HTMLElement) => h('div', { class: 'field' }, h('label', { htmlFor: id }, label), input);
  const guideBox = h('div', null, tokenGuide(a.name));
  name.addEventListener('input', () => replaceChildren(guideBox, tokenGuide(name.value)));
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field('f-name', '계정 이름', name),
    guideBox,
    h('div', { class: 'grid2' }, field('f-email', '이메일', email), field('f-plan', '요금제', plan)),
    h('div', { class: 'group' }, knowsReset.el, resetBox, knowsUsage.el, weekly.el),
    h('div', { class: 'group' }, session.el),
    h('div', { class: 'grid2' }, field('f-billing', '결제일', billing), field('f-memo', '메모', memo)),
    error,
    del,
    h('button', { type: 'submit', class: 'btn primary full big' }, existing ? '저장하기' : '추가하기'),
  );
  syncReset();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date();
    if (!name.value.trim()) {
      error.textContent = '계정 이름을 넣어 주세요.';
      name.focus();
      return;
    }
    const day = billing.value ? Math.round(Number(billing.value)) : null;
    if (day !== null && (day < 1 || day > 31)) {
      error.textContent = '결제일은 1~31 사이로 넣어 주세요.';
      return;
    }
    const reset = resetAt(at);
    const used = knowsUsage.input.checked ? weekly.get() : null;
    const usageChanged = used !== null && (used !== w.used || a.weekly.used === null || w.level === 'stale-reset');
    const next: Account = {
      ...a,
      name: name.value.trim(),
      email: email.value.trim(),
      plan: plan.value as Plan,
      weekly: { used, resetAt: reset ? reset.toISOString() : null, updatedAt: usageChanged ? at.toISOString() : a.weekly.updatedAt },
      session: session.read(at),
      billingDay: day,
      memo: memo.value.trim(),
    };
    if (await save(next)) {
      sheet.close();
      toast(existing ? '저장했어요' : `${next.name} 계정을 추가했어요`);
    }
  });
  append(sheet.body, [form]);
  if (!existing) name.focus();
}

// ---------- import ----------

let pasteSheet: Sheet | null = null;

/** What applying a batch would do, account by account. */
function importPlan(batch: ImportBatch): { label: string; detail: string; target: Account | null; item: ImportBatch['items'][number] }[] {
  return batch.items.map((item) => {
    const target = matchAccount(accounts, item) ?? null;
    const parts = [item.weekly && `주간 ${round1(item.weekly.used)}%`, item.session && `세션 ${round1(item.session.used)}%`].filter(Boolean).join(' · ');
    return { label: target ? nameOf(target) : (item.name ?? item.email?.split('@')[0] ?? '새 계정'), detail: target ? parts : `${parts} · 새 계정으로 추가돼요`, target, item };
  });
}

/** Saves every account in the batch, creating unknown names. Readings are stamped with the fetch time. */
async function applyBatch(batch: ImportBatch): Promise<number | null> {
  const at = batch.fetchedAt ? new Date(batch.fetchedAt) : new Date();
  let n = 0;
  for (const p of importPlan(batch)) {
    let base = p.target;
    if (!base) {
      base = newAccount(newId(), new Date(Date.now() + n));
      base.name = p.label;
    }
    if (!(await save(applyImport(base, p.item, at)))) return null;
    n++;
  }
  return n;
}

function openPaste(initial = ''): void {
  pasteSheet?.close();
  const sheet = openSheet('사용량 불러오기');
  pasteSheet = sheet;
  const text = h('textarea', { id: 'p-text', rows: 3, placeholder: '여기를 누르고 Cmd+V', value: initial });
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });
  const apply = h('button', { type: 'submit', class: 'btn primary full big', disabled: true }, '반영하기');
  let batch: ImportBatch | null = null;

  const update = () => {
    batch = text.value.trim() ? parseUsageBatch(text.value) : null;
    if (!text.value.trim()) replaceChildren(preview);
    else if (!batch) replaceChildren(preview, h('p', { class: 'error' }, '사용량 정보를 찾지 못했어요. claude-usage 결과를 그대로 붙여 넣었는지 확인해 주세요.'));
    else {
      replaceChildren(
        preview,
        h(
          'ul',
          { class: 'plan-list' },
          ...importPlan(batch).map((p) => h('li', null, h('strong', null, p.label), h('span', null, p.detail))),
          ...batch.failed.map((f) => h('li', { class: 'fail' }, h('strong', null, f.name), h('span', null, f.error))),
        ),
      );
    }
    apply.disabled = !batch || batch.items.length === 0;
    apply.textContent = batch?.items.length ? `${batch.items.length}개 계정에 반영하기` : '반영하기';
  };
  text.addEventListener('input', update);

  const form = h(
    'form',
    { class: 'form' },
    h('p', { class: 'lead' }, '맥 터미널에서 claude-usage를 실행하면 결과가 복사돼요. 아래에 붙여 넣으면 이름이 같은 계정에 한 번에 반영돼요.'),
    text,
    preview,
    apply,
    h('button', { type: 'button', class: 'text-btn', onClick: () => (sheet.close(), openSetup()) }, '아직 설정 전이라면 · 맥에서 자동으로 불러오기 ›'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!batch) return;
    const n = await applyBatch(batch);
    if (n === null) return;
    sheet.close();
    toast(`${n}개 계정에 반영했어요`);
  });
  append(sheet.body, [form]);
  update();
  if (!initial) text.focus();
}

// Cmd+V anywhere outside a field opens the import with the clipboard.
document.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const text = e.clipboardData?.getData('text') ?? '';
  if (parseUsageBatch(text)) {
    e.preventDefault();
    openPaste(text);
  }
});

// ---------- Mac setup ----------

function installCommand(): string {
  const bytes = new TextEncoder().encode(macScript);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  // base64 keeps the paste free of characters an interactive shell would expand.
  return [
    'mkdir -p ~/.local/bin',
    `echo '${btoa(bin)}' | base64 --decode > ~/.local/bin/claude-usage`,
    'chmod +x ~/.local/bin/claude-usage',
    `(grep -qs '.local/bin' ~/.zshrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc)`,
    'export PATH="$HOME/.local/bin:$PATH"',
    'claude-usage help',
  ].join(' && ');
}

/** A code line with its own copy button (and a selectable fallback when the clipboard is blocked). */
function copyRow(label: string, text: string, done = '복사했어요. 터미널에 붙여 넣으세요.'): HTMLElement {
  const fallback = h('textarea', { class: 'code-fallback', rows: 2, readOnly: true, value: text, hidden: true, 'aria-label': label });
  return h(
    'div',
    { class: 'cmd' },
    h('code', null, label),
    h('button', { type: 'button', class: 'btn small secondary', onClick: () => copy(text, done, fallback) }, '복사'),
    fallback,
  );
}

/** Environment variable the cloud fetcher reads for an account: "memoryz.kr" → CLAUDE_USAGE_TOKEN_MEMORYZ_KR. */
function envVarFor(name: string): string {
  return `CLAUDE_USAGE_TOKEN_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || '계정이름'}`;
}

/** Where this account's token goes. The page itself never takes one. */
function tokenGuide(name: string): HTMLElement {
  const n = name.trim() || '계정이름';
  return h(
    'div',
    { class: 'token-box' },
    h('strong', null, '사용량 자동 조회 연결'),
    h('p', null, '토큰은 이 페이지에 적지 않아요. 아래 둘 중 한 곳에 넣으면 이 계정과 자동으로 연결돼요.'),
    h('p', { class: 'opt' }, '클로드에게 맡기기 · 클라우드 환경 설정 → 비밀 값의 이름'),
    copyRow(envVarFor(n), envVarFor(n), '변수 이름을 복사했어요. 값에는 토큰을 넣으세요.'),
    h('p', { class: 'opt' }, '내 맥에서 · 터미널'),
    copyRow(`claude-usage add ${n}`, `claude-usage add ${n}`),
  );
}

function openSetup(): void {
  const sheet = openSheet('맥에서 자동으로 불러오기');
  const cmd = (label: string, command: string) => copyRow(label, command);
  const names = ordered().map(nameOf);
  const step = (n: number, title: string, ...body: (Node | string | false)[]) =>
    h('li', { class: 'step' }, h('span', { class: 'step-n' }, String(n)), h('div', { class: 'step-body' }, h('strong', null, title), ...body.filter((b): b is Node | string => b !== false)));

  append(sheet.body, [
    h('p', { class: 'lead' }, '처음 한 번만 설정하면, 이후에는 터미널에 claude-usage 한 줄로 모든 계정의 사용량을 가져와요.'),
    h(
      'ol',
      { class: 'steps' },
      LOCAL
        ? step(1, '설치하기', h('p', null, '이 폴더(index.html이 있는 곳)를 터미널에서 열고 아래를 실행하세요. 폴더를 옮기면 다시 실행해요.'), cmd('zsh install.sh', 'zsh install.sh'))
        : step(1, '설치하기', h('p', null, '터미널 앱을 열고 아래 명령을 붙여 넣으세요.'), cmd('설치 명령 (한 줄)', installCommand())),
      step(
        2,
        '계정 연결하기',
        h('p', null, '계정마다 한 번씩 실행해요. 브라우저가 열리면 그 계정으로 로그인하고, 나온 토큰을 붙여 넣으면 끝이에요.'),
        ...(names.length ? names : ['계정이름']).map((n) => cmd(`claude-usage add ${n}`, `claude-usage add ${n}`)),
      ),
      LOCAL
        ? step(3, '불러오기', h('p', null, '실행하면 이 페이지가 1분 안에 저절로 최신 값으로 바뀌어요. claude-usage open 은 조회하고 이 페이지를 열어 줘요.'), cmd('claude-usage open', 'claude-usage open'))
        : step(3, '불러오기', h('p', null, '실행하면 결과가 복사돼요. 이 페이지에서 Cmd+V 하면 바로 반영돼요.'), cmd('claude-usage', 'claude-usage')),
      step(4, '자동 조회 (선택)', h('p', null, '1시간마다 알아서 조회하고, 곧 초기화되는데 많이 남은 계정이 있으면 알림을 보내요.'), cmd('claude-usage schedule on', 'claude-usage schedule on')),
    ),
    h(
      'div',
      { class: 'notice' },
      h('strong', null, '알아 두세요'),
      h(
        'ul',
        null,
        h('li', null, '로그인은 각 계정 브라우저에서 직접 하고, 토큰은 맥 키체인에만 저장돼요. 이 페이지는 사용량 숫자만 받아요.'),
        h('li', null, 'Claude Code가 설치돼 있어야 해요(claude setup-token).'),
        h('li', null, 'Claude Code의 /usage가 쓰는 공개되지 않은 주소를 읽어요. 바뀌면 스크립트를 고쳐야 할 수 있어요.'),
      ),
    ),
    h(
      'details',
      { class: 'more' },
      h('summary', null, '맥이 아닌 컴퓨터라면 · 북마클릿 (실험적)'),
      h('p', null, 'claude.ai에 로그인한 상태에서 누르면 그 계정의 사용량이 복사돼요. 아래 버튼을 북마크바로 끌어다 놓으세요.'),
      h('a', { class: 'bookmarklet', href: BOOKMARKLET, onClick: (e: Event) => (e.preventDefault(), toast('북마크바로 끌어다 놓은 뒤 claude.ai에서 눌러요.')) }, '클로드 사용량 복사'),
    ),
  ]);
}

// ---------- examples ----------

async function addExamples(): Promise<void> {
  const now = new Date();
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const read = iso(-30 * 60_000);
  const make = (i: number, name: string, used: number, resetIn: number, session: Account['session'], billingDay: number): Account => ({
    ...newAccount(newId(), new Date(now.getTime() + i)),
    name,
    weekly: { used, resetAt: iso(resetIn), updatedAt: read },
    session,
    billingDay,
    memo: '예시예요. 편집에서 삭제할 수 있어요',
  });
  const examples = [
    make(0, '예시 · 개인', 58, 20 * HOUR, { used: 40, resetAt: iso(2 * HOUR + 10 * 60_000), updatedAt: read }, 15),
    make(1, '예시 · 회사', 31, 4 * DAY + 6 * HOUR, { used: null, resetAt: null, updatedAt: null }, 3),
  ];
  for (const a of examples) if (!(await save(a))) return;
  toast('예시 계정 2개를 넣었어요');
}

// ---------- local mode (index.html opened from the Mac folder) ----------

/** Opened as a file from the folder claude-usage writes usage-data.js into. */
const LOCAL = location.protocol === 'file:';
const LAST_APPLIED = 'claude-usage/last-applied';
let localState: 'unknown' | 'missing' | 'ok' = 'unknown';

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Called by usage-data.js, which `claude-usage` rewrites on every run. */
(window as unknown as { claudeUsageLoaded: (data: unknown) => void }).claudeUsageLoaded = (data) => {
  localState = 'ok';
  const batch = parseUsageBatch(JSON.stringify(data));
  if (!batch || !loaded) return;
  const stamp = batch.fetchedAt ?? '';
  if (stamp && readPref(LAST_APPLIED) === stamp && !forceLocal) return;
  forceLocal = false;
  void applyBatch(batch).then((n) => {
    if (n === null) return;
    try {
      window.localStorage.setItem(LAST_APPLIED, stamp);
    } catch {
      // re-applying the same numbers next time is harmless
    }
    const failed = batch.failed.length ? ` · ${batch.failed.map((f) => f.name).join(', ')} 실패` : '';
    toast(`${n}개 계정 사용량을 불러왔어요${failed}`);
  });
};

let forceLocal = false;
function loadLocalData(userAsked = false): void {
  if (!LOCAL) return;
  forceLocal = userAsked;
  const tag = document.createElement('script');
  tag.src = `usage-data.js?t=${Date.now()}`;
  tag.onload = () => tag.remove();
  tag.onerror = () => {
    tag.remove();
    localState = 'missing';
    render();
    if (userAsked) toast('아직 조회 결과가 없어요. 터미널에서 claude-usage 를 실행하세요.');
  };
  document.head.appendChild(tag);
}

// ---------- boot ----------

render();
openStore().then((s) => {
  store = s;
  s.subscribe(
    (list) => {
      const first = !loaded;
      accounts = list;
      loaded = true;
      if (quickId && !list.some((a) => a.id === quickId)) quickId = null;
      render();
      if (first) loadLocalData();
    },
    (message) => toast(message),
  );
});
// The script may run while the page is open (by hand or every hour).
if (LOCAL) setInterval(() => document.visibilityState === 'visible' && loadLocalData(), 60_000);

// Countdowns move on their own; skip while a quick edit is open so typed values survive.
setInterval(() => {
  if (!quickId) render();
}, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!quickId) render();
  loadLocalData();
});
