/** "오늘" (what needs a decision, the next slot, run controls) and "기록" (what the agent has done). */
import { addDays, localParts, nextSlot } from '../core/schedule';
import type { PlatformId } from '../core/types';
import { renderBlogHtml } from '../platforms/blog';
import { topbar, type App } from './app';
import { ago, h, inFuture, link, PF_NAME, pfMark, shortDate, STATUS, toast, WEEKDAY_KO } from './kit';
import type { WorkflowCommand } from './source';

const DAY = 86400000;

interface Task {
  tone: 'bad' | 'warn' | 'accent';
  title: string;
  sub: string;
  go: () => void;
}

function tasks(app: App): Task[] {
  const snap = app.snap!;
  const out: Task[] = [];
  if (snap.configErrors.length) out.push({ tone: 'bad', title: `설정 오류 ${snap.configErrors.length}개`, sub: snap.configErrors[0], go: () => app.go('settings') });
  for (const f of snap.drafts) {
    const d = f.draft;
    if (!d) continue;
    if (d.status === 'draft') {
      const err = d.issues.find((i) => i.severity === 'error');
      out.push({ tone: err ? 'bad' : 'accent', title: `초안 검토 · ${d.plan.topic}`, sub: err ? `고칠 것: ${err.message}` : '읽어 보고 승인하면 다음 실행 때 올라가요', go: () => app.go('drafts', f.path) });
    }
    if (d.status === 'partial' || d.status === 'failed') {
      const failed = (Object.entries(d.results) as [PlatformId, NonNullable<(typeof d.results)[PlatformId]>][]).filter(([, r]) => r.status === 'failed');
      for (const [p, r] of failed) out.push({ tone: 'bad', title: `${PF_NAME[p]} 발행 실패 · ${d.plan.topic}`, sub: r.error ?? '', go: () => app.go('drafts', f.path) });
    }
  }
  const inbox = app.pendingInbox();
  if (inbox.length) out.push({ tone: 'warn', title: `직접 답할 댓글 ${inbox.length}개`, sub: inbox.map((i) => i.text).slice(0, 1).join('') , go: () => app.go('inbox') });
  for (const [p, t] of Object.entries(snap.state.tokens)) {
    if (!t?.expiresAt) continue;
    const days = Math.floor((new Date(t.expiresAt).getTime() - Date.now()) / DAY);
    if (days < 14) out.push({ tone: 'warn', title: `${p === 'threads' ? '쓰레드' : '인스타그램'} 토큰 ${days}일 뒤 만료`, sub: '설정 가이드의 "토큰 다시 받기"를 따라 새로 넣어 주세요', go: () => app.go('settings') });
  }
  return out;
}

function nextPanel(app: App): HTMLElement {
  const cfg = app.snap!.config!;
  const slot = nextSlot(new Date(), cfg.timeZone, cfg.schedule.slots);
  const used = new Set(app.snap!.state.topics.map((t) => t.topic));
  const queued = cfg.content.topics.find((t) => !used.has(t));
  const pf = (Object.keys(cfg.platforms) as PlatformId[]).map((p) => h('span', { class: `pf ${cfg.platforms[p].enabled ? '' : 'off'}` }, PF_NAME[p]));
  return h(
    'section',
    { class: 'next', 'aria-label': '다음 발행' },
    h('div', { class: 'next-label' }, '다음 발행'),
    slot
      ? h('div', null, h('div', { class: 'next-when' }, `${WEEKDAY_KO[slot.weekday]}요일 ${slot.time}`), h('div', { class: 'next-in' }, `${inFuture(slot.minutes)} · ${Number(slot.date.slice(5, 7))}월 ${Number(slot.date.slice(8))}일`))
      : h('div', { class: 'next-when' }, '예약 없음'),
    h(
      'div',
      { class: 'next-meta' },
      h('span', null, h('b', null, '주제 '), queued ? `대기열의 "${queued}"` : '콘텐츠 기둥에서 자동 선정'),
      h('span', null, h('b', null, '방식 '), cfg.mode === 'auto' ? '검수 통과하면 바로 발행' : '초안을 만들고 승인을 기다림'),
    ),
    h('div', { class: 'chips' }, ...pf),
  );
}

const COMMANDS: { id: WorkflowCommand; label: string; help: string; topic: boolean }[] = [
  { id: 'post-now', label: '지금 한 편', help: '슬롯과 상관없이 지금 글을 만들어요. 검토 모드면 초안으로 남아요.', topic: true },
  { id: 'preview', label: '미리보기', help: '아무 데도 올리지 않고 초안과 카드 이미지만 만들어요.', topic: true },
  { id: 'comments', label: '댓글만 확인', help: '새 댓글을 지금 확인하고 정책대로 처리해요.', topic: false },
  { id: 'check', label: '연결 점검', help: '토큰과 이미지 저장소가 제대로 연결됐는지 확인만 해요.', topic: false },
];

function runPanel(app: App): HTMLElement {
  let cmd = COMMANDS[0];
  const topic = h('input', { class: 'input', id: 'run-topic', placeholder: '비우면 알아서 정해요 (예: 편의점 단백질 간식)', maxLength: 80 });
  const topicField = h('div', { class: 'field' }, h('label', { htmlFor: 'run-topic' }, '주제'), topic);
  const help = h('p', { class: 'help' }, cmd.help);
  const go = h('button', { class: 'btn primary', type: 'button' }, '실행 요청');
  const seg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': '할 일' },
    ...COMMANDS.map((c) =>
      h('button', {
        type: 'button',
        'aria-pressed': c === cmd ? 'true' : 'false',
        onClick: (e: Event) => {
          cmd = c;
          for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          help.textContent = c.help;
          topicField.hidden = !c.topic;
        },
      }, c.label),
    ),
  );
  go.addEventListener('click', async () => {
    if (app.source.kind === 'demo') {
      toast('예시 데이터에서는 실행되지 않아요. 설정에서 GitHub을 연결해 주세요');
      return;
    }
    go.setAttribute('disabled', '');
    go.textContent = '요청 중…';
    try {
      await app.source.runWorkflow(cmd.id, cmd.topic ? topic.value.trim() || null : null);
      toast('실행을 요청했어요. 2~5분 뒤 새로고침하면 결과가 보여요');
      topic.value = '';
    } catch (e) {
      toast((e as Error).message);
    } finally {
      go.removeAttribute('disabled');
      go.textContent = '실행 요청';
    }
  });
  const actions = app.source.links.actions();
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '지금 실행하기'), h('span', { class: 'panel-note' }, `마지막 실행 ${ago(app.snap!.state.lastRun)}`)),
    seg,
    help,
    topicField,
    h('div', { class: 'btn-row' }, go, actions ? link(actions, '실행 기록 보기', 'btn ghost') : null),
  );
}

export function homeView(app: App): HTMLElement {
  const snap = app.snap!;
  const now = localParts(new Date(), snap.config?.timeZone ?? 'Asia/Seoul');
  const list = tasks(app);
  const head = h('header', { class: 'page-head' }, h('span', { class: 'eyebrow' }, `${Number(now.date.slice(5, 7))}월 ${Number(now.date.slice(8))}일 ${WEEKDAY_KO[now.weekday]}요일`), h('h1', { class: 'page-title' }, list.length ? `확인할 일이 ${list.length}개 있어요` : '오늘은 손댈 일이 없어요'));
  if (!snap.hasData) {
    return h(
      'div',
      { class: 'view' },
      topbar(app),
      head,
      h('div', { class: 'notice info' }, h('b', null, '에이전트가 아직 한 번도 실행되지 않았어요'), h('span', null, '아래에서 "연결 점검"을 먼저 실행하고, 이어서 "미리보기"로 첫 초안을 만들어 보세요. 실행이 끝나면 이 화면이 채워져요.')),
      snap.config ? nextPanel(app) : null,
      runPanel(app),
    );
  }
  return h(
    'div',
    { class: 'view' },
    topbar(app),
    head,
    h(
      'section',
      { class: 'tasks', 'aria-label': '확인할 일' },
      ...(list.length
        ? list.map((t) =>
            h('button', { class: `task ${t.tone}`, type: 'button', onClick: t.go }, h('span', { class: 'stripe' }), h('span', { class: 'row-main' }, h('span', { class: 'task-title' }, t.title), h('span', { class: 'task-sub' }, t.sub)), h('span', { class: 'go', 'aria-hidden': 'true' }, '›')),
          )
        : [h('div', { class: 'all-clear' }, '✓', h('span', null, '검토할 초안도, 답할 댓글도 없어요. 에이전트가 알아서 하고 있어요.'))]),
    ),
    h('div', { class: 'grid-2' }, snap.config ? nextPanel(app) : h('div', { class: 'notice bad' }, '설정 파일을 읽지 못했어요'), weekPanel(app, true)),
    runPanel(app),
  );
}

// ---------------- history ----------------

interface DayStat {
  date: string;
  posts: number;
  replies: number;
}

function lastDays(app: App, n: number): DayStat[] {
  const snap = app.snap!;
  const tz = snap.config?.timeZone ?? 'Asia/Seoul';
  const today = localParts(new Date(), tz).date;
  const days: DayStat[] = [];
  for (let i = n - 1; i >= 0; i--) days.push({ date: addDays(today, -i), posts: 0, replies: 0 });
  const find = (iso: string) => days.find((d) => d.date === localParts(new Date(iso), tz).date);
  for (const p of snap.state.posts) {
    const d = find(p.at);
    if (d) d.posts++;
  }
  for (const c of Object.values(snap.state.comments)) {
    const d = c.action === 'reply' ? find(c.at) : undefined;
    if (d) d.replies++;
  }
  return days;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  if (base - y <= 0) return '';
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function weekChart(days: DayStat[]): HTMLElement {
  // A narrower drawing on phones keeps the axis labels readable instead of shrinking them.
  const W = window.innerWidth < 640 ? 360 : 600;
  const H = 200;
  const L = 28;
  const B = 28;
  const T = 10;
  const max = niceMax(Math.max(1, ...days.flatMap((d) => [d.posts, d.replies])));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const col = (W - L) / days.length;
  const bw = Math.min(18, col / 3);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `최근 7일 발행 ${days.reduce((a, d) => a + d.posts, 0)}건, 답글 ${days.reduce((a, d) => a + d.replies, 0)}건`);
  svg.setAttribute('width', '100%');
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  for (const t of [0, max / 2, max]) {
    svg.append(el('line', { x1: L, x2: W, y1: y(t), y2: y(t), class: 'grid' }));
    svg.append(el('text', { x: L - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  }
  const wrap = h('div', { class: 'chart-wrap' });
  const tip = h('div', { class: 'tip', hidden: true });
  days.forEach((d, i) => {
    const cx = L + col * i + col / 2;
    const g = el('g', { class: 'col' });
    g.append(el('path', { d: barPath(cx - bw - 1, y(d.posts), bw, y(0)), class: 's1' }));
    g.append(el('path', { d: barPath(cx + 1, y(d.replies), bw, y(0)), class: 's2' }));
    const [, m, dd] = d.date.split('-');
    const wd = WEEKDAY_KO[(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[new Date(`${d.date}T00:00:00Z`).getUTCDay()]];
    g.append(el('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, W < 600 ? wd : `${Number(m)}/${Number(dd)} ${wd}`));
    const hit = el('rect', { x: L + col * i, y: T, width: col, height: H - T - B, class: 'hit', tabindex: 0 });
    const show = () => {
      tip.hidden = false;
      tip.textContent = `${Number(m)}월 ${Number(dd)}일 (${wd}) · 발행 ${d.posts} · 답글 ${d.replies}`;
      const box = svg.getBoundingClientRect();
      tip.style.left = `${(cx / W) * box.width}px`;
      tip.style.top = `${(y(Math.max(d.posts, d.replies)) / H) * box.height - 6}px`;
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('mouseleave', () => (tip.hidden = true));
    hit.addEventListener('blur', () => (tip.hidden = true));
    svg.append(g, hit);
  });
  wrap.append(svg, tip);
  return wrap;
}

function weekPanel(app: App, compact: boolean): HTMLElement {
  const days = lastDays(app, 7);
  const sum = (k: 'posts' | 'replies') => days.reduce((a, d) => a + d[k], 0);
  const table = h(
    'div',
    { class: 'table-wrap', hidden: true },
    h('table', { class: 'policy' }, h('tbody', null, ...days.map((d) => h('tr', null, h('td', null, d.date), h('td', null, `발행 ${d.posts}`), h('td', null, `답글 ${d.replies}`))))),
  );
  const toggle = h('button', { class: 'btn ghost small', type: 'button', onClick: () => ((table.hidden = !table.hidden), (toggle.textContent = table.hidden ? '표로 보기' : '표 닫기')) }, '표로 보기');
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '최근 7일'), compact ? h('button', { class: 'btn ghost small', type: 'button', onClick: () => app.go('history') }, '기록 전체 ›') : toggle),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:var(--series-1)' }), `발행 ${sum('posts')}건`), h('span', null, h('i', { style: 'background:var(--series-2)' }), `자동 답글 ${sum('replies')}건`)),
    weekChart(days),
    compact ? null : table,
  );
}

export function historyView(app: App): HTMLElement {
  const snap = app.snap!;
  const tz = snap.config?.timeZone ?? 'Asia/Seoul';
  const since = Date.now() - 7 * DAY;
  const recent = Object.values(snap.state.comments).filter((c) => new Date(c.at).getTime() >= since);
  const count = (a: string) => recent.filter((c) => c.action === a).length;
  const topicOf = (id: string) => snap.drafts.find((d) => d.draft?.id === id)?.draft?.plan.topic ?? id;
  const posts = [...snap.state.posts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  const report = h('div', { class: 'md' });
  if (snap.report) report.innerHTML = renderBlogHtml({ title: '', tags: [], body: snap.report }, [], []);
  return h(
    'div',
    { class: 'view' },
    topbar(app),
    h('header', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '기록'), h('h1', { class: 'page-title' }, '에이전트가 한 일')),
    h(
      'div',
      { class: 'stats' },
      ...[
        ['발행', snap.state.posts.filter((p) => new Date(p.at).getTime() >= since).length],
        ['자동 답글', count('reply')],
        ['숨긴 댓글', count('hide')],
        ['사람에게 넘김', count('escalate')],
      ].map(([k, v]) => h('div', { class: 'stat' }, h('span', { class: 'stat-v' }, String(v)), h('span', { class: 'stat-k' }, `${k} · 7일`))),
    ),
    weekPanel(app, false),
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '올라간 글'), h('span', { class: 'panel-note' }, '최근 20건')),
      posts.length
        ? h(
            'div',
            { class: 'list' },
            ...posts.map((p) => {
              const w = shortDate(p.at, tz);
              return h(
                'div',
                { class: 'row', style: 'cursor:default' },
                h('div', { class: 'row-date' }, h('b', null, w.day), h('span', null, w.wd)),
                h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, topicOf(p.draftId)), h('span', { class: 'row-sub' }, pfMark(p.platform, { status: 'ok', id: p.id, url: p.url, error: null, at: p.at, attempts: 1 }), `${PF_NAME[p.platform]} · ${w.md} ${w.time}`)),
                p.url ? link(p.url, '보기', 'btn small') : h('span'),
              );
            }),
          )
        : h('div', { class: 'empty' }, '아직 올라간 글이 없어요'),
    ),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '마지막 실행 보고서'), h('span', { class: 'panel-note' }, ago(snap.state.lastRun))), snap.report ? report : h('div', { class: 'empty' }, '보고서가 아직 없어요')),
  );
}

export { STATUS };
