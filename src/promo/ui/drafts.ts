/** 초안 desk: the list, one draft with platform previews, review notes, editing and approval. */
import { checkContent, hasBlocking, instagramCaption, LIMITS, normalizeContent, allowedUrls } from '../core/rules';
import { charLength, threadsLength } from '../core/text';
import type { ContentSet, Draft, DraftStatus, PlatformId } from '../core/types';
import { topbar, type App } from './app';
import { draftWhen, h, link, PF_NAME, pfMark, STATUS, statusChip } from './kit';
import { blogPreview, instagramPreview, threadsPreview } from './previews';
import type { DraftFile } from './source';

type Filter = 'all' | 'review' | 'done' | 'failed';
const FILTERS: { id: Filter; label: string; match: (s: DraftStatus) => boolean }[] = [
  { id: 'all', label: '전체', match: () => true },
  { id: 'review', label: '검토 대기', match: (s) => s === 'draft' || s === 'approved' },
  { id: 'done', label: '발행됨', match: (s) => s === 'published' },
  { id: 'failed', label: '실패', match: (s) => s === 'partial' || s === 'failed' },
];
let filter: Filter = 'all';
let tab: 'instagram' | 'threads' | 'blog' = 'instagram';
let editing: string | null = null;
let confirming: 'approve' | 'skip' | null = null;

function enabledPlatforms(app: App): PlatformId[] {
  const p = app.snap?.config?.platforms;
  return p ? (Object.keys(p) as PlatformId[]).filter((k) => p[k].enabled) : ['threads', 'instagram', 'naver'];
}

function draftRow(app: App, f: DraftFile): HTMLElement {
  const d = f.draft;
  if (!d) {
    return h('div', { class: 'row', style: 'cursor:default' }, h('div', { class: 'row-date' }, h('b', null, '!'), h('span', null, '오류')), h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, f.path), h('span', { class: 'row-sub' }, f.error ?? '')), h('span'));
  }
  const w = draftWhen(d.id);
  return h(
    'button',
    { class: 'row', type: 'button', 'aria-current': app.openDraft === f.path ? 'true' : undefined, onClick: () => ((editing = null), (confirming = null), app.go('drafts', f.path)) },
    h('div', { class: 'row-date' }, h('b', null, w.day), h('span', null, `${w.wd} ${w.time}`)),
    h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, d.plan.topic || d.id), h('span', { class: 'row-sub' }, statusChip(d.status), ...enabledPlatforms(app).map((p) => pfMark(p, d.results[p])))),
    h('span', { class: 'go', 'aria-hidden': 'true' }, '›'),
  );
}

function listPanel(app: App, files: DraftFile[]): HTMLElement {
  const shown = files.filter((f) => !f.draft || FILTERS.find((x) => x.id === filter)!.match(f.draft.status));
  return h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'filters seg', role: 'group', 'aria-label': '상태로 거르기' },
      ...FILTERS.map((x) => {
        const n = files.filter((f) => f.draft && x.match(f.draft.status)).length;
        return h('button', { type: 'button', 'aria-pressed': String(filter === x.id), onClick: () => ((filter = x.id), app.render()) }, `${x.label} ${n}`);
      }),
    ),
    shown.length ? h('div', { class: 'list' }, ...shown.map((f) => draftRow(app, f))) : h('div', { class: 'empty' }, '이 상태의 초안이 없어요'),
  );
}

// ---------------- detail ----------------

function issuesBlock(d: Draft): HTMLElement | null {
  if (!d.issues.length) return null;
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '검수 메모'), h('span', { class: 'panel-note' }, hasBlocking(d.issues) ? '빨간 항목을 고치거나 확인한 뒤 승인하세요' : '참고만 하면 돼요')),
    h('div', { class: 'issues' }, ...d.issues.map((i) => h('div', { class: `issue ${i.severity}` }, h('span', { class: 'tag' }, i.platform === 'all' ? '전체' : PF_NAME[i.platform as PlatformId] ?? i.platform), h('span', null, i.message)))),
  );
}

function resultsBlock(app: App, d: Draft): HTMLElement | null {
  const rows = enabledPlatforms(app)
    .map((p) => [p, d.results[p]] as const)
    .filter(([, r]) => r);
  if (!rows.length) return null;
  return h(
    'section',
    { class: 'panel' },
    h('h2', { class: 'panel-title' }, '발행 결과'),
    h(
      'div',
      { class: 'results' },
      ...rows.map(([p, r]) =>
        h(
          'div',
          { class: 'result' },
          h('span', { class: 'row-sub' }, pfMark(p, r!), h('b', null, PF_NAME[p])),
          r!.status === 'failed'
            ? h('span', { style: 'color:var(--bad)' }, `${r!.error ?? '실패'} · ${r!.attempts}번 시도`)
            : r!.status === 'manual'
              ? r!.url ? link(r!.url, '붙여넣기용 발행본 열기') : h('span', { class: 'panel-note' }, '붙여넣기용 발행본이 준비됐어요')
              : r!.url ? link(r!.url, '게시물 보기') : h('span', { class: 'panel-note' }, '발행됨'),
        ),
      ),
    ),
  );
}

function refsBlock(d: Draft): HTMLElement | null {
  if (!d.references.length) return null;
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '참고한 레퍼런스'), h('span', { class: 'panel-note' }, '형식만 참고하고 문장은 쓰지 않았어요')),
    h('div', { class: 'refs' }, ...d.references.map((r) => h('div', { class: 'ref' }, link(r.url, r.title || r.url), h('span', null, r.note)))),
  );
}

function previewTabs(app: App, d: Draft): HTMLElement {
  const cfg = app.snap!.config!;
  const has = { instagram: !!d.content.instagram, threads: !!d.content.threads, blog: !!d.content.blog };
  const order = (['instagram', 'threads', 'blog'] as const).filter((k) => has[k]);
  if (!order.includes(tab)) tab = order[0] ?? 'instagram';
  const label = { instagram: '인스타그램', threads: '쓰레드', blog: '블로그' };
  const blogLabel = cfg.platforms.wordpress.enabled ? '워드프레스' : '네이버·티스토리 붙여넣기용';
  const pane = tab === 'instagram' ? instagramPreview(d, cfg) : tab === 'threads' ? threadsPreview(d, cfg) : blogPreview(d, cfg, blogLabel);
  return h(
    'section',
    { class: 'detail' },
    h('div', { class: 'ptabs', role: 'tablist' }, ...order.map((k) => h('button', { class: 'ptab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onClick: () => ((tab = k), app.render()) }, label[k]))),
    h('div', { role: 'tabpanel' }, pane),
  );
}

function actionBar(app: App, f: DraftFile, d: Draft): HTMLElement | null {
  const save = (status: DraftStatus, msg: string, done: string) => app.saveDraft(f, { ...d, status }, msg, done).then(() => (confirming = null));
  const blocking = hasBlocking(d.issues);
  const targets = enabledPlatforms(app).map((p) => PF_NAME[p]).join(', ');

  if (d.status === 'approved') {
    return h('div', { class: 'actionbar' }, h('p', { class: 'panel-note' }, '승인했어요. 다음 실행(매시 7분쯤) 때 올라가요.'), h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: () => save('draft', `dashboard: unapprove ${d.id}`, '승인을 취소했어요') }, '승인 취소')));
  }
  if (d.status !== 'draft' && d.status !== 'skip') return null;
  if (confirming) {
    const approve = confirming === 'approve';
    return h(
      'div',
      { class: 'actionbar' },
      h(
        'div',
        { class: 'confirm' },
        h('p', null, approve ? `승인하면 다음 실행 때 ${targets}에 올라가요.${blocking ? ' 빨간 검수 메모가 남아 있어요. 확인했다면 그대로 승인해도 돼요.' : ''}` : '이 초안을 건너뛸까요? 올라가지 않고 목록에 남아요.'),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onClick: () => ((confirming = null), app.render()) }, '취소'),
          approve
            ? h('button', { class: 'btn primary', type: 'button', onClick: () => save('approved', `dashboard: approve ${d.id}`, '승인했어요. 다음 실행 때 올라가요') }, '승인')
            : h('button', { class: 'btn danger', type: 'button', onClick: () => save('skip', `dashboard: skip ${d.id}`, '건너뛰었어요') }, '건너뛰기'),
        ),
      ),
    );
  }
  return h(
    'div',
    { class: 'actionbar' },
    h(
      'div',
      { class: 'btn-row' },
      d.status === 'skip'
        ? h('button', { class: 'btn', type: 'button', onClick: () => save('draft', `dashboard: restore ${d.id}`, '검토 대기로 되돌렸어요') }, '되살리기')
        : h('button', { class: 'btn ghost', type: 'button', onClick: () => ((confirming = 'skip'), app.render()) }, '건너뛰기'),
      h('button', { class: 'btn', type: 'button', onClick: () => ((editing = f.path), app.render()) }, '글 고치기'),
      h('button', { class: 'btn primary', type: 'button', onClick: () => ((confirming = 'approve'), app.render()) }, '승인하기'),
    ),
  );
}

// ---------------- editor ----------------

function counter(n: number, max: number, soft = false): HTMLElement {
  return h('span', { class: `count ${n > max ? (soft ? 'near' : 'over') : n > max * 0.9 ? 'near' : ''}` }, `${n.toLocaleString()}/${max.toLocaleString()}`);
}

function editor(app: App, f: DraftFile, d: Draft): HTMLElement {
  const c: ContentSet = structuredClone(d.content);
  const cfg = app.snap!.config!;
  const fields: HTMLElement[] = [];
  let uid = 0;
  const field = (label: string, value: string, onInput: (v: string) => void, count: (v: string) => HTMLElement | null, rows = 0, help?: string) => {
    const id = `edit-${uid++}`;
    const input = rows ? h('textarea', { class: 'textarea', id, rows, value }) : h('input', { class: 'input', id, value });
    const lab = h('label', { htmlFor: id }, label, count(value));
    input.addEventListener('input', () => {
      onInput(input.value);
      const next = count(input.value);
      lab.lastChild?.remove();
      if (next) lab.append(next);
    });
    return h('div', { class: 'field' }, lab, input, help ? h('span', { class: 'help' }, help) : null);
  };

  if (c.instagram) {
    const ig = c.instagram;
    fields.push(h('h3', { class: 'panel-title' }, '인스타그램'));
    fields.push(field('캡션', ig.caption, (v) => (ig.caption = v), () => counter(charLength(instagramCaption(ig.caption, ig.hashtags)), LIMITS.instagramCaption), 6, '해시태그 포함 글자 수예요'));
    fields.push(field('해시태그', ig.hashtags.join(' '), (v) => (ig.hashtags = v.split(/\s+/).filter(Boolean)), (v) => counter(v.split(/\s+/).filter(Boolean).length, cfg.content.hashtags.max), 0, '띄어쓰기로 구분'));
    ig.cards.forEach((card, i) => {
      fields.push(field(`카드 ${i + 1} 제목`, card.title, (v) => (card.title = v), (v) => counter(charLength(v), LIMITS.cardTitle, true), 2));
      fields.push(field(`카드 ${i + 1} 본문`, card.body, (v) => (card.body = v), (v) => counter(charLength(v), LIMITS.cardBody), 3));
    });
  }
  if (c.threads) {
    const th = c.threads;
    fields.push(h('h3', { class: 'panel-title' }, '쓰레드'));
    th.posts.forEach((p, i) => fields.push(field(i === 0 ? '첫 글' : `이어지는 글 ${i + 1}`, p, (v) => (th.posts[i] = v), (v) => counter(threadsLength(v), LIMITS.threadsPost), 4)));
  }
  if (c.blog) {
    const bl = c.blog;
    fields.push(h('h3', { class: 'panel-title' }, '블로그'));
    fields.push(field('제목', bl.title, (v) => (bl.title = v), (v) => counter(charLength(v), LIMITS.blogTitle, true)));
    fields.push(field('태그', bl.tags.join(', '), (v) => (bl.tags = v.split(',').map((t) => t.trim()).filter(Boolean)), () => null, 0, '쉼표로 구분'));
    fields.push(field('본문', bl.body, (v) => (bl.body = v), (v) => counter(charLength(v), 3000, true), 14, '마크다운. {{image:2}}만 있는 줄은 카드 2번 이미지가 들어가요'));
  }

  const save = async () => {
    const content = normalizeContent(c, cfg);
    const issues = checkContent(content, cfg, allowedUrls(cfg, d.references.map((r) => r.url)));
    const ok = await app.saveDraft(f, { ...d, content, issues }, `dashboard: edit ${d.id}`, hasBlocking(issues) ? '저장했어요. 빨간 검수 메모를 확인해 주세요' : '저장했어요');
    if (ok) {
      editing = null;
      app.render();
    }
  };
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '글 고치기'), h('span', { class: 'panel-note' }, '카드를 고치면 다음 실행 때 이미지를 새로 만들어요')),
    ...fields,
    h('div', { class: 'actionbar' }, h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ((editing = null), app.render()) }, '취소'), h('button', { class: 'btn primary', type: 'button', onClick: save }, '저장'))),
  );
}

function detail(app: App, f: DraftFile): HTMLElement {
  const d = f.draft!;
  const st = STATUS[d.status];
  const w = draftWhen(d.id);
  const gh = app.source.links.draft(f.path);
  return h(
    'div',
    { class: 'detail' },
    h('button', { class: 'btn ghost small back', type: 'button', onClick: () => app.go('drafts') }, '‹ 초안 목록'),
    h(
      'header',
      { class: 'detail-head' },
      h('span', { class: `stamp ${st.tone}`, 'aria-hidden': 'true' }, st.stamp),
      h('span', { class: 'eyebrow' }, `${w.md} ${w.wd}요일 ${w.time}${d.slotKey ? '' : ' · 수동 실행'}`),
      h('h1', { class: 'detail-title' }, d.plan.topic),
      h('div', { class: 'kv' }, statusChip(d.status), d.plan.angle ? h('span', null, '각도 ', h('b', null, d.plan.angle)) : null, d.plan.pillar ? h('span', null, '기둥 ', h('b', null, d.plan.pillar)) : null, gh ? link(gh, 'GitHub에서 원본 보기') : null),
    ),
    issuesBlock(d),
    editing === f.path ? editor(app, f, d) : previewTabs(app, d),
    editing === f.path ? null : actionBar(app, f, d),
    resultsBlock(app, d),
    refsBlock(d),
  );
}

export function draftsView(app: App): HTMLElement {
  const files = app.snap!.drafts;
  const open = files.find((f) => f.path === app.openDraft && f.draft);
  if (!app.snap!.config) return h('div', { class: 'view' }, topbar(app), h('div', { class: 'notice bad' }, '설정 파일(promo/config.yml)을 읽지 못해 초안을 보여 줄 수 없어요'));
  const head = h('header', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '초안'), h('h1', { class: 'page-title' }, open ? '초안 살펴보기' : '만들어진 글'));
  if (!files.length) return h('div', { class: 'view' }, topbar(app), head, h('div', { class: 'empty panel' }, '아직 만들어진 초안이 없어요. 오늘 화면에서 "미리보기"를 실행해 보세요.'));
  const wide = window.matchMedia('(min-width: 1100px)').matches;
  if (open && !wide) return h('div', { class: 'view' }, detail(app, open));
  return h('div', { class: 'view', style: wide ? 'max-width:1240px' : '' }, topbar(app), head, h('div', { class: `desk ${open ? 'split' : ''}` }, listPanel(app, files), open ? detail(app, open) : null));
}
