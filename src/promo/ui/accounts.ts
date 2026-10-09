/** 계정 연결: the blog, Instagram and Threads accounts, the Claude key, and (on this computer) where card images go. */
import type { App } from './app';
import type { AccountKey } from './backend';
import { MARK } from './home';
import { h, icon, link, toast } from './kit';
import type { LocalModel } from './local';
import { BLOG_KIND_NAME, hasAccount, UI_NAME, type BlogKind, type UiPlatform } from './model';

const GUIDE = 'https://github.com/memoryzkr-hash/memoryz/blob/main/docs/promo/SETUP.md';
let changing: AccountKey | null = null;

function labelOf(app: App, key: AccountKey): string | null {
  return (app.m as LocalModel).local?.labels?.[key] ?? null;
}

/** Where the secret goes; Meta tokens (Threads, Instagram) also expire after 60 days unless refreshed. */
function storageNote(app: App, expires = false): string {
  if (app.backend.kind === 'local') return `이 컴퓨터의 .env 파일에만 저장돼요 (git에 올라가지 않아요).${expires ? ' 60일짜리 토큰은 앱이 알아서 연장해요.' : ''}`;
  if (app.backend.kind === 'github') return `GitHub에 암호화돼 저장되고, 이 화면에서도 다시 볼 수 없어요.${expires ? ' 60일마다 자동으로 연장돼요.' : ''}`;
  return '미리보기에서는 저장하지 않아요.';
}

async function register(app: App, key: AccountKey, fields: Record<string, string>, name: string, btn: HTMLElement) {
  btn.setAttribute('disabled', '');
  btn.textContent = '확인하는 중…';
  let label = '';
  const ok = await app.act(async () => {
    label = (await app.backend.registerAccount(app.m!, key, fields)) || '';
  });
  if (ok) {
    changing = null;
    toast(label ? `${name} 연결됨 · ${label}` : `${name}을(를) 등록했어요`);
  }
  app.render();
}

function connectedRow(app: App, key: AccountKey, name: string): HTMLElement {
  const label = labelOf(app, key);
  return h('div', { class: 'row' }, h('span', { class: 'help', style: 'flex:1' }, label ? `${name} 연결됨 · ${label}` : `${name}이(가) 연결돼 있어요.`), h('button', { class: 'btn small', type: 'button', onClick: () => ((changing = key), app.render()) }, '바꾸기'));
}

function tokenForm(app: App, key: 'threads' | 'instagram' | 'claude', o: { name: string; steps: string[]; anchor?: string; placeholder: string; extra?: HTMLElement[]; extraFields?: () => Record<string, string> }): HTMLElement {
  const input = h('input', { class: 'input', id: `token-${key}`, type: 'password', autocomplete: 'off', placeholder: o.placeholder });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, '등록');
  const form = h(
    'form',
    { class: 'stack' },
    h('ol', { class: 'steps' }, ...o.steps.map((s) => h('li', null, s))),
    o.anchor ? h('p', { class: 'help' }, link(`${GUIDE}#${o.anchor}`, '화면별 자세한 안내 보기')) : null,
    h('div', { class: 'field' }, h('label', { htmlFor: `token-${key}` }, key === 'claude' ? 'API 키' : '액세스 토큰'), input),
    ...(o.extra ?? []),
    h('p', { class: 'help' }, storageNote(app, key !== 'claude')),
    h('div', { class: 'row end' }, changing === key ? h('button', { class: 'btn ghost', type: 'button', onClick: () => ((changing = null), app.render()) }, '취소') : null, btn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (key === 'claude' ? !v.startsWith('sk-') : v.length < 20) return toast(key === 'claude' ? 'sk-로 시작하는 키를 넣어 주세요' : '토큰이 너무 짧아요. 전체를 붙여넣었는지 확인해 주세요');
    void register(app, key, { token: v, ...(o.extraFields?.() ?? {}) }, o.name, btn);
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
    h('div', { class: 'choices', role: 'group' }, ...kinds.map((k) => h('button', { class: 'choice', type: 'button', 'aria-pressed': String(m.blogKind === k || (k === 'wordpress' && changing === 'wordpress')), onClick: () => (k === 'wordpress' ? ((changing = 'wordpress'), app.render()) : app.act(() => app.backend.setBlogKind(m, k)).then(() => ((changing = null), app.render()))) }, BLOG_KIND_NAME[k]))),
  );
  if (m.blogKind !== 'wordpress' && changing !== 'wordpress') {
    return h(
      'div',
      { class: 'stack' },
      pick,
      h('div', { class: 'notice' }, h('b', null, '계정 등록이 필요 없어요'), h('span', null, `${BLOG_KIND_NAME[m.blogKind]}는 외부 프로그램의 자동 글쓰기를 막아 두었어요. 글을 만들면 "제목·본문·태그 복사" 버튼으로 붙여넣고 발행하면 돼요. 자동화를 켜면 정한 주기마다 글이 준비돼요.`)),
    );
  }
  if (m.blogKind === 'wordpress' && m.accounts.wordpress && changing !== 'wordpress') return h('div', { class: 'stack' }, pick, connectedRow(app, 'wordpress', '워드프레스'));
  const url = h('input', { class: 'input', id: 'wp-url', placeholder: 'https://blog.example.com', value: m.config.platforms.wordpress.url });
  const user = h('input', { class: 'input', id: 'wp-user', autocomplete: 'off' });
  const pw = h('input', { class: 'input', id: 'wp-pw', type: 'password', autocomplete: 'off', placeholder: 'abcd efgh ijkl mnop qrst uvwx' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, '등록');
  const form = h(
    'form',
    { class: 'stack' },
    pick,
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-url' }, '블로그 주소'), url),
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-user' }, '로그인 아이디'), user),
    h('div', { class: 'field' }, h('label', { htmlFor: 'wp-pw' }, '애플리케이션 비밀번호'), pw, h('span', { class: 'help' }, '워드프레스 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호에서 새로 만들어요. 로그인 비밀번호가 아니에요.')),
    h('p', { class: 'help' }, storageNote(app)),
    h('div', { class: 'row end' }, btn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/.test(url.value.trim()) || !user.value.trim() || !pw.value.trim()) return toast('주소, 아이디, 애플리케이션 비밀번호를 모두 넣어 주세요');
    void register(app, 'wordpress', { url: url.value.trim(), user: user.value.trim(), password: pw.value.trim() }, '워드프레스', btn);
  });
  return form;
}

const THREADS_STEPS = ['developers.facebook.com에서 앱을 만들고 "Threads API 액세스"를 고릅니다', '권한 threads_basic, threads_content_publish, threads_read_replies, threads_manage_replies를 추가합니다', '내 쓰레드 계정을 테스터로 추가하고 쓰레드 앱에서 초대를 수락합니다', '"사용자 토큰 생성기"에서 만든 토큰을 아래에 붙여넣습니다'];
const INSTAGRAM_STEPS = ['인스타그램을 프로페셔널 계정(비즈니스·크리에이터)으로 바꿉니다', '같은 메타 앱에 Instagram을 추가하고 "Instagram 로그인을 통한 API 설정"을 엽니다', '권한 instagram_business_basic, _content_publish, _manage_comments를 추가하고 내 계정을 테스터로 등록합니다', '"액세스 토큰 생성"에서 만든 토큰을 아래에 붙여넣습니다'];

/** The account block for one platform; `titled` adds the platform name for the 계정 연결 page. */
export function accountSection(app: App, ui: UiPlatform, titled = false): HTMLElement {
  const m = app.m!;
  const ok = hasAccount(m, ui);
  const chip = ok ? h('span', { class: 'chip ok' }, ui === 'blog' && m.blogKind !== 'wordpress' ? '준비됨' : '연결됨') : h('span', { class: 'chip warn' }, '등록 필요');
  const head = titled
    ? h('div', { class: 'section-head' }, h('div', { class: 'bar-title' }, h('span', { class: 'pmark small', 'aria-hidden': 'true' }, MARK[ui]), h('h2', null, `${UI_NAME[ui]} 계정`)), chip)
    : h('div', { class: 'section-head' }, h('h2', null, '계정'), chip);
  let body: HTMLElement;
  if (ui === 'blog') body = blogAccount(app);
  else if (ok && changing !== ui) body = connectedRow(app, ui, `${UI_NAME[ui]}`);
  else if (ui === 'threads') body = tokenForm(app, 'threads', { name: '쓰레드', steps: THREADS_STEPS, anchor: '3-쓰레드-토큰', placeholder: '토큰을 붙여넣으세요' });
  else body = tokenForm(app, 'instagram', { name: '인스타그램', steps: INSTAGRAM_STEPS, anchor: '4-인스타그램-토큰', placeholder: '토큰을 붙여넣으세요' });
  return h('section', { class: `section ${ui}`, id: titled ? `account-${ui}` : 'account' }, head, body);
}

function claudeSection(app: App): HTMLElement | null {
  if (app.backend.kind === 'preview') return null;
  const m = app.m!;
  const ok = m.accounts.claude && changing !== 'claude';
  return h(
    'section',
    { class: 'section', id: 'account-claude' },
    h('div', { class: 'section-head' }, h('h2', null, '글 쓰는 AI (Claude)'), h('span', { class: `chip ${m.accounts.claude ? 'ok' : 'warn'}` }, m.accounts.claude ? '연결됨' : '등록 필요')),
    ok ? connectedRow(app, 'claude', 'Claude') : tokenForm(app, 'claude', { name: 'Claude', steps: ['console.anthropic.com에 가입하고 결제 수단을 등록합니다', 'Settings → Limits에서 월 사용 한도를 꼭 정합니다', 'API Keys에서 새 키를 만들어 아래에 붙여넣습니다'], placeholder: 'sk-ant-…' }),
  );
}

/** Instagram fetches card images by URL, so on this computer they go to a public GitHub repository. */
function mediaSection(app: App): HTMLElement | null {
  if (app.backend.kind !== 'local') return null;
  const m = app.m!;
  const ok = m.accounts.media && changing !== 'media';
  const repo = h('input', { class: 'input', id: 'media-repo', placeholder: '내아이디/promo-media', value: m.config.media.repo });
  const token = h('input', { class: 'input', id: 'media-token', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, '등록');
  const form = h(
    'form',
    { class: 'stack' },
    h('ol', { class: 'steps' }, h('li', null, 'GitHub에서 공개(Public) 저장소를 하나 만듭니다 (예: promo-media)'), h('li', null, 'github.com/settings/personal-access-tokens에서 그 저장소만 골라 Contents를 "Read and write"로 토큰을 만듭니다'), h('li', null, '저장소 이름과 토큰을 아래에 넣습니다')),
    h('div', { class: 'field' }, h('label', { htmlFor: 'media-repo' }, '공개 저장소'), repo),
    h('div', { class: 'field' }, h('label', { htmlFor: 'media-token' }, 'GitHub 토큰'), token),
    h('p', { class: 'help' }, storageNote(app)),
    h('div', { class: 'row end' }, btn),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.value.trim()) || !token.value.trim()) return toast('저장소(계정/이름)와 토큰을 모두 넣어 주세요');
    void register(app, 'media', { repo: repo.value.trim(), token: token.value.trim() }, '카드 이미지 저장소', btn);
  });
  return h(
    'section',
    { class: 'section', id: 'account-media' },
    h('div', { class: 'section-head' }, h('h2', null, '카드 이미지 저장소'), h('span', { class: `chip ${m.accounts.media ? 'ok' : ''}` }, m.accounts.media ? '연결됨' : '인스타그램에 필요')),
    h('p', { class: 'help' }, '인스타그램은 이미지를 인터넷 주소로 가져가요. 이 컴퓨터에서 만든 카드 이미지를 공개 GitHub 저장소에 올려서 그 주소를 넘겨요.'),
    ok ? connectedRow(app, 'media', '카드 이미지 저장소') : form,
  );
}

export function accountsView(app: App): HTMLElement {
  const m = app.m!;
  const done = (['threads', 'instagram', 'blog'] as UiPlatform[]).filter((ui) => hasAccount(m, ui)).length;
  return h(
    'div',
    { class: 'wrap' },
    h('div', { class: 'bar' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': '처음으로', onClick: () => app.go('home') }, icon('back')), h('span', { class: 'bar-title' }, '계정 연결'), h('span')),
    h('header', { class: 'hello' }, h('h1', null, `계정 ${done}/3 연결됨`), h('p', null, '등록하면 바로 글을 올리고, 플랫폼마다 자동화를 켤 수 있어요.')),
    claudeSection(app),
    accountSection(app, 'threads', true),
    accountSection(app, 'instagram', true),
    mediaSection(app),
    accountSection(app, 'blog', true),
  );
}
