/** One automation (blog, Instagram or Threads): make a post, set the cycle, register the account, see recent posts and comments. */
import { allowedUrls, checkContent, hasBlocking, instagramCaption, LIMITS, normalizeContent } from '../core/rules';
import { charLength, threadsLength } from '../core/text';
import type { ContentSet, Draft, DraftStatus, PublishResult } from '../core/types';
import type { App } from './app';
import { PREVIEW_ONLY } from './app';
import { BackendError } from './backend';
import { automationSwitch, MARK, pendingFor, subtitle } from './home';
import { copyText, h, icon, inFuture, link, toast } from './kit';
import {
  ALL_DAYS,
  automationOf,
  BLOG_KIND_NAME,
  CYCLES,
  DAY_KO,
  describeCycle,
  draftsFor,
  hasAccount,
  hourLabel,
  nextSlotFor,
  scopedFor,
  UI_NAME,
  type Automation,
  type BlogKind,
  type DraftFile,
  type UiPlatform,
} from './model';
import { blogPreview, instagramPreview, threadsPreview } from './previews';
import { pickedRefs, refsSection, topics, unpick } from './refs';

const GUIDE = 'https://github.com/memoryzkr-hash/memoryz/blob/main/docs/promo/SETUP.md';

interface MakeState {
  running: boolean;
  msg: string;
  ctl: AbortController | null;
  file: DraftFile | null;
  editing: boolean;
  publishing: boolean;
}
const make: Record<UiPlatform, MakeState> = {
  blog: { running: false, msg: '', ctl: null, file: null, editing: false, publishing: false },
  instagram: { running: false, msg: '', ctl: null, file: null, editing: false, publishing: false },
  threads: { running: false, msg: '', ctl: null, file: null, editing: false, publishing: false },
};
/** Unsaved cycle edits, kept while the page re-renders. */
const pendingAuto: Partial<Record<UiPlatform, Automation>> = {};
let openItem: string | null = null;

const STATUS: Record<DraftStatus, [string, string]> = {
  draft: ['확인 대기', 'warn'],
  approved: ['올리는 중', 'pc'],
  published: ['올라감', 'ok'],
  partial: ['일부 실패', 'bad'],
  failed: ['실패', 'bad'],
  skip: ['건너뜀', ''],
};
const chip = (s: DraftStatus) => h('span', { class: `chip ${STATUS[s][1]}` }, STATUS[s][0]);

function preview(app: App, ui: UiPlatform, d: Draft): HTMLElement {
  const m = app.m!;
  if (ui === 'instagram') return instagramPreview(d, m.config);
  if (ui === 'threads') return threadsPreview(d, m.config);
  return blogPreview(d, m.config, m.blogKind === 'wordpress' ? '워드프레스' : `${BLOG_KIND_NAME[m.blogKind]}에 붙여넣을 글`);
}

/** Naver and Tistory have no write API: the dashboard hands over the finished post to paste. */
function pasteTools(app: App, d: Draft, article: HTMLElement): HTMLElement | null {
  const m = app.m!;
  if (m.blogKind === 'wordpress' || !d.content.blog) return null;
  const blog = d.content.blog;
  const copy = async (text: string, what: string, el?: HTMLElement) => toast((await copyText(text, el)) ? `${what}을(를) 복사했어요` : '글을 선택해 뒀어요. 길게 눌러 복사하세요');
  const body = article.querySelector('.body') as HTMLElement | null;
  const copyBody = async () => {
    try {
      const html = body?.innerHTML ?? '';
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([body?.innerText ?? blog.body], { type: 'text/plain' }) })]);
      toast('본문을 복사했어요. 글쓰기 화면에 붙여넣으세요');
    } catch {
      await copy(body?.innerText ?? blog.body, '본문', body ?? undefined);
    }
  };
  return h(
    'div',
    { class: 'row' },
    h('button', { class: 'btn soft small', type: 'button', onClick: () => copy(blog.title, '제목') }, '제목 복사'),
    h('button', { class: 'btn soft small', type: 'button', onClick: copyBody }, '본문 복사'),
    h('button', { class: 'btn soft small', type: 'button', onClick: () => copy(blog.tags.map((t) => `#${t}`).join(' '), '태그') }, '태그 복사'),
  );
}

function issuesOf(d: Draft): HTMLElement | null {
  if (!d.issues.length) return null;
  return h('div', { class: 'issues' }, ...d.issues.map((i) => h('div', { class: `issue ${i.severity}` }, i.message)));
}

function resultsOf(d: Draft): HTMLElement | null {
  const rows = Object.entries(d.results) as [string, PublishResult][];
  if (!rows.length) return null;
  return h(
    'div',
    { class: 'row' },
    ...rows.map(([, r]) =>
      r.status === 'failed'
        ? h('span', { class: 'chip bad' }, `실패: ${r.error ?? ''}`)
        : r.url
          ? link(r.url, r.status === 'manual' ? '발행본 열기' : '게시물 보기', 'btn soft small')
          : h('span', { class: 'chip ok' }, r.status === 'manual' ? '발행본 준비됨' : '올라감'),
    ),
  );
}

// ---------------- 글 만들기 ----------------

function editor(app: App, ui: UiPlatform, file: DraftFile, done: () => void): HTMLElement {
  const d = file.draft!;
  const c: ContentSet = structuredClone(d.content);
  const cfg = scopedFor(app.m!, ui);
  const fields: HTMLElement[] = [];
  let n = 0;
  const counter = (v: number, max: number, soft = false) => h('span', { class: `count ${v > max ? (soft ? 'near' : 'over') : v > max * 0.9 ? 'near' : ''}` }, `${v.toLocaleString()}/${max.toLocaleString()}`);
  const field = (label: string, value: string, set: (v: string) => void, count: (v: string) => HTMLElement | null, rows = 0) => {
    const id = `edit-${ui}-${n++}`;
    const input = rows ? h('textarea', { class: 'textarea', id, rows, value }) : h('input', { class: 'input', id, value });
    const lab = h('label', { htmlFor: id }, label, count(value));
    input.addEventListener('input', () => {
      set(input.value);
      lab.lastChild?.remove();
      const next = count(input.value);
      if (next) lab.append(next);
    });
    fields.push(h('div', { class: 'field' }, lab, input));
  };
  if (ui === 'threads' && c.threads) c.threads.posts.forEach((p, i) => field(i === 0 ? '첫 글' : `이어지는 글 ${i + 1}`, p, (v) => (c.threads!.posts[i] = v), (v) => counter(threadsLength(v), LIMITS.threadsPost), 4));
  if (ui === 'instagram' && c.instagram) {
    const ig = c.instagram;
    field('캡션', ig.caption, (v) => (ig.caption = v), () => counter(charLength(instagramCaption(ig.caption, ig.hashtags)), LIMITS.instagramCaption), 5);
    field('해시태그 (띄어쓰기로 구분)', ig.hashtags.join(' '), (v) => (ig.hashtags = v.split(/\s+/).filter(Boolean)), (v) => counter(v.split(/\s+/).filter(Boolean).length, cfg.content.hashtags.max));
    ig.cards.forEach((card, i) => {
      field(`카드 ${i + 1} 제목`, card.title, (v) => (card.title = v), (v) => counter(charLength(v), LIMITS.cardTitle, true), 2);
      field(`카드 ${i + 1} 본문`, card.body, (v) => (card.body = v), (v) => counter(charLength(v), LIMITS.cardBody), 3);
    });
  }
  if (ui === 'blog' && c.blog) {
    const b = c.blog;
    field('제목', b.title, (v) => (b.title = v), (v) => counter(charLength(v), LIMITS.blogTitle, true));
    field('태그 (쉼표로 구분)', b.tags.join(', '), (v) => (b.tags = v.split(',').map((t) => t.trim()).filter(Boolean)), () => null);
    field('본문 (마크다운)', b.body, (v) => (b.body = v), (v) => counter(charLength(v), 3000, true), 14);
  }
  const save = async () => {
    const content = normalizeContent(c, cfg);
    const issues = checkContent(content, cfg, allowedUrls(cfg, d.references.map((r) => r.url)));
    const ok = await app.act(async () => {
      const next = await app.backend.saveDraft(file, { ...d, content, issues });
      app.m!.drafts = app.m!.drafts.map((x) => (x.path === file.path ? next : x));
      if (make[ui].file?.path === file.path) make[ui].file = next;
    }, '고친 내용을 저장했어요');
    if (ok) done();
  };
  return h('div', { class: 'section', style: 'padding:0;border:0' }, ...fields, h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onClick: done }, '취소'), h('button', { class: 'btn primary', type: 'button', onClick: save }, '저장')));
}

async function publish(app: App, ui: UiPlatform, file: DraftFile) {
  const st = make[ui];
  st.publishing = true;
  st.ctl = new AbortController();
  st.msg = '올릴 준비 중…';
  app.render();
  try {
    // Naver/Tistory posts are pasted by hand: marking it done is all there is to do.
    const pasted = ui === 'blog' && app.m!.blogKind !== 'wordpress';
    const at = new Date().toISOString();
    const next = pasted
      ? await app.backend.saveDraft(file, { ...file.draft!, status: 'published', results: { naver: { status: 'manual', id: 'pasted', url: null, error: null, at, attempts: 1 } } })
      : await app.backend.publish(app.m!, file, (msg) => ((st.msg = msg), app.render()), st.ctl.signal);
    app.m!.drafts = app.m!.drafts.map((x) => (x.path === file.path ? next : x));
    if (st.file?.path === file.path) st.file = next;
    const failed = Object.values(next.draft?.results ?? {}).find((r) => r?.status === 'failed');
    toast(failed ? `올리지 못했어요: ${failed.error}` : pasted ? '완료로 표시했어요' : app.backend.kind === 'preview' ? '미리보기라 실제로 올리지는 않았어요' : '올라갔어요');
  } catch (e) {
    toast(e instanceof BackendError ? e.message : '올리지 못했어요');
  } finally {
    st.publishing = false;
    st.ctl = null;
    app.render();
  }
}

function draftActions(app: App, ui: UiPlatform, file: DraftFile, onEdit: () => void): HTMLElement | null {
  const d = file.draft!;
  const st = make[ui];
  if (st.publishing) return null;
  if (d.status === 'published' || d.status === 'partial') return resultsOf(d);
  if (d.status === 'skip') return null;
  const naver = ui === 'blog' && app.m!.blogKind !== 'wordpress';
  const blocking = hasBlocking(d.issues);
  return h(
    'div',
    { class: 'row end' },
    h('button', { class: 'btn ghost', type: 'button', onClick: onEdit }, '고치기'),
    h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        title: blocking ? '빨간 메모를 확인했다면 그대로 올려도 돼요' : undefined,
        onClick: () => {
          if (!hasAccount(app.m!, ui)) {
            toast('먼저 계정을 등록해 주세요');
            app.go(ui, 'account');
            return;
          }
          void publish(app, ui, file);
        },
      },
      naver ? '완료로 표시' : '지금 올리기',
    ),
  );
}

function makeSection(app: App, ui: UiPlatform): HTMLElement {
  const st = make[ui];
  const topic = h('input', { class: 'input', id: `topic-${ui}`, value: topics[ui], placeholder: '예: 야근 날 편의점에서 단백질 채우기 (비우면 알아서 정해요)', maxLength: 80, onInput: (e: Event) => (topics[ui] = (e.target as HTMLInputElement).value) });
  const chosen = pickedRefs(app, ui);
  const start = async () => {
    st.running = true;
    st.ctl = new AbortController();
    st.msg = '시작하는 중…';
    st.editing = false;
    app.render();
    try {
      st.file = await app.backend.generate(app.m!, ui, topics[ui].trim(), (msg) => ((st.msg = msg), app.render()), st.ctl.signal, chosen);
    } catch (e) {
      if (!(e instanceof BackendError && e.message === '취소했어요')) toast(e instanceof BackendError ? e.message : '글을 만들지 못했어요');
    } finally {
      st.running = false;
      st.ctl = null;
      app.render();
    }
  };
  const busy = st.running || st.publishing;
  const parts: (HTMLElement | null)[] = [
    h('div', { class: 'section-head' }, h('h2', null, '2. 글 만들기'), st.file ? h('button', { class: 'btn ghost small', type: 'button', onClick: () => ((st.file = null), app.render()) }, '새로 만들기') : null),
  ];
  if (busy) {
    parts.push(h('div', { class: 'progress', role: 'status' }, h('span', { class: 'msg' }, st.msg), h('div', { class: 'bar-anim' }, h('i')), h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onClick: () => st.ctl?.abort() }, '그만두기'))));
  }
  if (!st.file && !st.running) {
    parts.push(
      chosen.length
        ? h(
            'div',
            { class: 'field' },
            h('span', { class: 'label' }, '참고할 인기 글'),
            h('div', { class: 'choices' }, ...chosen.map((r) => h('button', { class: 'choice', type: 'button', 'aria-pressed': 'true', title: '빼기', onClick: () => (unpick(ui, r), app.render()) }, `${r.title.slice(0, 24)}${r.title.length > 24 ? '…' : ''} ✕`))),
          )
        : h('p', { class: 'help' }, h('a', { href: '#refs', onClick: (e: Event) => (e.preventDefault(), document.getElementById('refs')?.scrollIntoView({ behavior: 'smooth' })) }, '위에서 인기 글을 고르면'), ' 그 형식을 따라 써요. 안 골라도 알아서 찾아봐요.'),
      h('div', { class: 'field' }, h('label', { htmlFor: `topic-${ui}` }, '어떤 내용으로 쓸까요?'), topic),
      h('p', { class: 'help' }, app.backend.kind === 'github' ? '레퍼런스를 찾아보고 내 브랜드 소개와 글 구성에 맞춰 써요. 2~5분 걸려요.' : '내 브랜드 소개에 맞춰 바로 써 드려요.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onClick: start }, `${UI_NAME[ui]} 글 만들기`)),
    );
  }
  if (st.file?.draft && !st.running) {
    const d = st.file.draft;
    if (st.editing) parts.push(editor(app, ui, st.file, () => ((st.editing = false), app.render())));
    else {
      const view = preview(app, ui, d);
      parts.push(h('p', { style: 'font-weight:700' }, d.plan.topic), issuesOf(d), view, ui === 'blog' ? pasteTools(app, d, view) : null, draftActions(app, ui, st.file, () => ((st.editing = true), app.render())));
      if (!st.publishing) parts.push(h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onClick: start }, '다시 만들기')));
    }
  }
  return h('section', { class: 'section', id: 'make' }, ...parts);
}

// ---------------- 자동으로 올리기 ----------------

function autoSection(app: App, ui: UiPlatform): HTMLElement {
  const m = app.m!;
  const saved = automationOf(m.config, ui, m.blogKind);
  const a = pendingAuto[ui] ?? { ...saved };
  const dirty = a.hour !== saved.hour || a.days.join() !== saved.days.join();
  const set = (patch: Partial<Automation>) => ((pendingAuto[ui] = { ...a, ...patch }), app.render());
  const preset = CYCLES.find((c) => c.days.length === a.days.length && c.days.every((d) => a.days.includes(d)));
  const hour = h('select', { class: 'select', id: `hour-${ui}`, onChange: (e: Event) => set({ hour: Number((e.target as HTMLSelectElement).value) }) }, ...Array.from({ length: 24 }, (_, i) => h('option', { value: String(i), selected: i === a.hour }, hourLabel(i))));
  const next = saved.on ? nextSlotFor(m, ui) : null;
  const save = async () => {
    if (!a.days.length) return toast('요일을 하나 이상 골라 주세요');
    const ok = await app.act(() => app.backend.saveAutomation(m, ui, { ...a, on: saved.on }), `주기를 저장했어요 · ${describeCycle(a)}`);
    if (ok) delete pendingAuto[ui];
    app.render();
  };
  return h(
    'section',
    { class: 'section', id: 'auto' },
    h('div', { class: 'section-head' }, h('h2', null, '자동으로 올리기'), automationSwitch(app, ui, saved.on ? '켜짐' : '꺼짐')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '얼마나 자주'), h('div', { class: 'choices', role: 'group' }, ...CYCLES.map((c) => h('button', { class: 'choice', type: 'button', 'aria-pressed': String(preset?.id === c.id), onClick: () => set({ days: c.days }) }, c.label)))),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '요일'), h('div', { class: 'days', role: 'group' }, ...ALL_DAYS.map((d) => h('button', { class: 'choice', type: 'button', 'aria-pressed': String(a.days.includes(d)), onClick: () => set({ days: a.days.includes(d) ? a.days.filter((x) => x !== d) : ALL_DAYS.filter((x) => x === d || a.days.includes(x)) }) }, DAY_KO[d])))),
    h('div', { class: 'field' }, h('label', { htmlFor: `hour-${ui}` }, '시간'), hour),
    h('p', { class: 'next-line' }, h('b', null, describeCycle(a)), saved.on && next && !dirty ? ` · 다음 게시 ${DAY_KO[next.weekday]}요일 ${hourLabel(Number(next.time.slice(0, 2)))} (${inFuture(next.minutes)})` : saved.on ? '' : ' · 자동화를 켜면 이 주기로 올라가요'),
    m.config.mode === 'review' ? h('p', { class: 'help' }, '자동으로 만든 글은 확인 대기로 남고, 아래 "최근 글"에서 확인하고 올리면 돼요. ', h('a', { href: '#settings' }, '바로 올리기로 바꾸기')) : null,
    dirty ? h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => (delete pendingAuto[ui], app.render()) }, '되돌리기'), h('button', { class: 'btn primary', type: 'button', onClick: save }, '주기 저장')) : null,
  );
}

// ---------------- 계정 ----------------

function tokenForm(app: App, ui: 'threads' | 'instagram', steps: string[], anchor: string): HTMLElement {
  const input = h('input', { class: 'input', id: `token-${ui}`, type: 'password', autocomplete: 'off', placeholder: '토큰을 붙여넣으세요' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, '등록');
  const form = h(
    'form',
    { class: 'section', style: 'padding:0;border:0' },
    h('ol', { class: 'steps' }, ...steps.map((s) => h('li', null, s))),
    h('p', { class: 'help' }, link(`${GUIDE}#${anchor}`, '화면별 자세한 안내 보기')),
    h('div', { class: 'field' }, h('label', { htmlFor: `token-${ui}` }, '액세스 토큰'), input),
    h('p', { class: 'help' }, app.backend.kind === 'github' ? '토큰은 GitHub에 암호화돼 저장되고, 이 화면에서도 다시 볼 수 없어요. 60일마다 자동으로 연장돼요.' : '미리보기에서는 토큰을 저장하지 않아요.'),
    h('div', { class: 'row end' }, btn),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (input.value.trim().length < 20) return toast('토큰이 너무 짧아요. 전체를 붙여넣었는지 확인해 주세요');
    btn.setAttribute('disabled', '');
    await app.act(() => app.backend.registerAccount(app.m!, ui, { token: input.value.trim() }), `${UI_NAME[ui]} 계정을 등록했어요`);
    app.render();
  });
  return form;
}

function blogAccount(app: App): HTMLElement {
  const m = app.m!;
  const kinds: BlogKind[] = ['naver', 'tistory', 'wordpress'];
  const pick = h(
    'div',
    { class: 'field' },
    h('span', { class: 'label' }, '어떤 블로그인가요?'),
    h('div', { class: 'choices', role: 'group' }, ...kinds.map((k) => h('button', { class: 'choice', type: 'button', 'aria-pressed': String(m.blogKind === k), onClick: () => app.act(() => app.backend.setBlogKind(m, k)).then(() => app.render()) }, BLOG_KIND_NAME[k]))),
  );
  if (m.blogKind !== 'wordpress') {
    return h(
      'div',
      { class: 'section', style: 'padding:0;border:0' },
      pick,
      h('div', { class: 'notice' }, h('b', null, '계정 등록이 필요 없어요'), h('span', null, `${BLOG_KIND_NAME[m.blogKind]}는 자동 글쓰기 기능을 닫아 두어서, 완성된 글을 만들어 두면 "제목·본문·태그 복사"로 붙여넣고 발행하면 돼요. 자동화를 켜면 정한 주기마다 글이 준비되고 알려 드려요.`)),
    );
  }
  const url = h('input', { class: 'input', id: 'wp-url', placeholder: 'https://blog.example.com', value: m.config.platforms.wordpress.url });
  const user = h('input', { class: 'input', id: 'wp-user', autocomplete: 'off' });
  const pw = h('input', { class: 'input', id: 'wp-pw', type: 'password', autocomplete: 'off', placeholder: 'abcd efgh ijkl mnop qrst uvwx' });
  const form = h(
    'form',
    { class: 'section', style: 'padding:0;border:0' },
    pick,
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-url' }, '블로그 주소'), url),
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-user' }, '로그인 아이디'), user),
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-pw' }, '애플리케이션 비밀번호'), pw, h('span', { class: 'help' }, '워드프레스 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호에서 새로 만들어요. 로그인 비밀번호가 아니에요.')),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, '등록')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/.test(url.value.trim()) || !user.value.trim() || !pw.value.trim()) return toast('주소, 아이디, 애플리케이션 비밀번호를 모두 넣어 주세요');
    await app.act(() => app.backend.registerAccount(m, 'wordpress', { url: url.value.trim(), user: user.value.trim(), password: pw.value.trim() }), '워드프레스를 등록했어요');
    app.render();
  });
  return form;
}

let changingAccount: UiPlatform | null = null;

function accountSection(app: App, ui: UiPlatform): HTMLElement {
  const m = app.m!;
  const ok = hasAccount(m, ui);
  const head = h('div', { class: 'section-head' }, h('h2', null, '계정'), ok ? h('span', { class: 'chip ok' }, ui === 'blog' && m.blogKind !== 'wordpress' ? '준비됨' : '등록됨') : h('span', { class: 'chip warn' }, '등록 필요'));
  let body: HTMLElement;
  if (ui === 'blog') body = blogAccount(app);
  else if (ok && changingAccount !== ui) body = h('div', { class: 'row' }, h('span', { class: 'help', style: 'flex:1' }, `${UI_NAME[ui]} 계정이 연결돼 있어요.`), h('button', { class: 'btn small', type: 'button', onClick: () => ((changingAccount = ui), app.render()) }, '토큰 바꾸기'));
  else if (ui === 'threads')
    body = tokenForm(app, 'threads', ['developers.facebook.com에서 앱을 만들고 "Threads API 액세스"를 고릅니다', '권한 threads_basic, threads_content_publish, threads_read_replies, threads_manage_replies를 추가합니다', '내 쓰레드 계정을 테스터로 추가하고 쓰레드 앱에서 초대를 수락합니다', '"사용자 토큰 생성기"에서 만든 토큰을 아래에 붙여넣습니다'], '3-쓰레드-토큰');
  else
    body = tokenForm(app, 'instagram', ['인스타그램을 프로페셔널 계정(비즈니스·크리에이터)으로 바꿉니다', '같은 메타 앱에 Instagram을 추가하고 "Instagram 로그인을 통한 API 설정"을 엽니다', '권한 instagram_business_basic, _content_publish, _manage_comments를 추가하고 내 계정을 테스터로 등록합니다', '"액세스 토큰 생성"에서 만든 토큰을 아래에 붙여넣습니다'], '4-인스타그램-토큰');
  return h('section', { class: 'section', id: 'account' }, head, body);
}

// ---------------- 최근 글 / 댓글 ----------------

function recentSection(app: App, ui: UiPlatform): HTMLElement {
  const files = draftsFor(app.m!, ui)
    .filter((f) => f.path !== make[ui].file?.path)
    .sort((a, b) => b.draft!.createdAt.localeCompare(a.draft!.createdAt))
    .slice(0, 8);
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, '최근 글')),
    files.length
      ? h(
          'div',
          { class: 'list' },
          ...files.map((f) => {
            const d = f.draft!;
            const open = openItem === f.path;
            const when = new Date(d.createdAt);
            return h(
              'div',
              { class: 'item' },
              h(
                'button',
                { class: 'item-head', type: 'button', 'aria-expanded': String(open), onClick: () => ((openItem = open ? null : f.path), app.render()) },
                h('span', { style: 'min-width:0;display:grid' }, h('span', { class: 'item-title' }, d.plan.topic || d.id), h('span', { class: 'item-sub num' }, `${when.getMonth() + 1}월 ${when.getDate()}일 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}${d.slotKey ? ' · 자동' : ''}`)),
                chip(d.status),
              ),
              open ? h('div', { style: 'display:grid;gap:12px' }, issuesOf(d), preview(app, ui, d), draftActions(app, ui, f, () => ((make[ui].file = f), (make[ui].editing = true), app.go(ui, 'make'))), d.status === 'draft' ? h('div', { class: 'row end' }, h('button', { class: 'btn ghost small danger', type: 'button', onClick: () => app.act(async () => { const next = await app.backend.saveDraft(f, { ...d, status: 'skip' }); app.m!.drafts = app.m!.drafts.map((x) => (x.path === f.path ? next : x)); }, '건너뛰었어요').then(() => app.render()) }, '이 글은 건너뛰기')) : null) : null,
            );
          }),
        )
      : h('p', { class: 'empty' }, '아직 만든 글이 없어요'),
  );
}

function commentsSection(app: App, ui: UiPlatform): HTMLElement | null {
  const m = app.m!;
  if (ui === 'blog' && m.blogKind !== 'wordpress') return null;
  const items = pendingFor(app, ui);
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, '직접 답할 댓글'), h('span', { class: `chip ${items.length ? 'warn' : 'ok'}` }, items.length ? `${items.length}개` : '없음')),
    h('p', { class: 'help' }, '칭찬과 자주 묻는 질문에는 자동으로 답하고, 스팸은 숨겨요. 불만·환불·건강 상담처럼 사람이 봐야 하는 댓글만 여기 모여요.'),
    ...items.map((i) => {
      const reply = h('p', null, i.suggestedReply);
      return h(
        'div',
        { class: 'item' },
        h('div', { class: 'quote' }, h('b', null, i.author), i.text),
        h('p', { class: 'help' }, i.reason),
        i.suggestedReply ? h('div', { class: 'suggest' }, h('span', { class: 'k' }, '추천 답글'), reply) : null,
        h(
          'div',
          { class: 'row' },
          i.suggestedReply ? h('button', { class: 'btn soft small', type: 'button', onClick: async () => toast((await copyText(i.suggestedReply, reply)) ? '답글을 복사했어요' : '글을 선택해 뒀어요') }, '답글 복사') : null,
          i.postUrl ? link(i.postUrl, '게시물 열기', 'btn small') : null,
          h('button', { class: 'btn small', type: 'button', onClick: () => app.act(async () => { await app.backend.markInboxDone([i.key]); m.inboxDone = [...m.inboxDone, i.key]; }, '처리했어요').then(() => app.render()) }, '처리 완료'),
        ),
      );
    }),
  );
}

export function platformView(app: App): HTMLElement {
  const ui = app.route as UiPlatform;
  const m = app.m!;
  return h(
    'div',
    { class: `wrap ${ui}` },
    h('div', { class: 'bar' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': '처음으로', onClick: () => app.go('home') }, icon('back')), h('span', { class: 'help' }, m.config.brand.name)),
    h('header', { class: 'ptitle' }, h('span', { class: 'pmark', 'aria-hidden': 'true' }, MARK[ui]), h('div', null, h('h1', null, `${UI_NAME[ui]} 자동화`), h('p', { class: 'help' }, subtitle(m, ui)))),
    app.backend.kind === 'preview' ? h('div', { class: 'note-preview' }, PREVIEW_ONLY ? '미리보기 · 실제 게시는 연결된 앱에서 돼요' : '미리보기 · 설정에서 GitHub을 연결하면 실제로 올라가요') : null,
    refsSection(app, ui),
    makeSection(app, ui),
    autoSection(app, ui),
    accountSection(app, ui),
    recentSection(app, ui),
    commentsSection(app, ui),
  );
}
