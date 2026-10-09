/** "1. 인기 글 고르기": a scrollable feed of popular posts to model a new post on, plus posts the person found. */
import type { Reference, ReferenceKind } from '../core/types';
import type { App } from './app';
import { BackendError } from './backend';
import { h, link, toast } from './kit';
import { UI_NAME, type UiPlatform } from './model';

const KIND_NAME: Record<ReferenceKind, string> = { blog: '블로그', instagram: '인스타', threads: '쓰레드', news: '기사', video: '영상', other: '기타' };
type Filter = 'all' | 'web' | 'social' | 'mine';
const FILTERS: { id: Filter; label: string; match: (r: Reference) => boolean }[] = [
  { id: 'all', label: '전체', match: () => true },
  { id: 'web', label: '블로그·기사', match: (r) => r.kind === 'blog' || r.kind === 'news' },
  { id: 'social', label: '인스타·쓰레드', match: (r) => r.kind === 'instagram' || r.kind === 'threads' },
  { id: 'mine', label: '직접 넣은 글', match: (r) => r.source === '직접 추가' },
];

const keyOf = (r: Reference) => r.url || r.title;
const hostOf = (url: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

interface RefState {
  picked: string[];
  filter: Filter;
  finding: boolean;
  msg: string;
  ctl: AbortController | null;
  adding: boolean;
  analyzing: boolean;
  /** Feed scroll position, kept across re-renders so picking a card does not jump to the top. */
  scroll: number;
}
const states: Record<UiPlatform, RefState> = {
  blog: { picked: [], filter: 'all', finding: false, msg: '', ctl: null, adding: false, analyzing: false, scroll: 0 },
  instagram: { picked: [], filter: 'all', finding: false, msg: '', ctl: null, adding: false, analyzing: false, scroll: 0 },
  threads: { picked: [], filter: 'all', finding: false, msg: '', ctl: null, adding: false, analyzing: false, scroll: 0 },
};
/** What the person typed as the topic; shared by "인기 글 찾기" and "글 만들기". */
export const topics: Record<UiPlatform, string> = { blog: '', instagram: '', threads: '' };

export function pickedRefs(app: App, ui: UiPlatform): Reference[] {
  const keys = states[ui].picked;
  return keys.map((k) => app.m!.references.find((r) => keyOf(r) === k)).filter((r): r is Reference => !!r);
}

export function unpick(ui: UiPlatform, r: Reference) {
  states[ui].picked = states[ui].picked.filter((k) => k !== keyOf(r));
}

/** Posts from the platform being written for come first. */
function ordered(refs: Reference[], ui: UiPlatform): Reference[] {
  const near = (r: Reference) => (ui === 'blog' ? r.kind === 'blog' || r.kind === 'news' : r.kind === ui);
  return [...refs.filter((r) => r.source === '직접 추가'), ...refs.filter((r) => r.source !== '직접 추가' && near(r)), ...refs.filter((r) => r.source !== '직접 추가' && !near(r))];
}

function refCard(app: App, ui: UiPlatform, r: Reference): HTMLElement {
  const st = states[ui];
  const on = st.picked.includes(keyOf(r));
  const steps = (r.structure ?? '').split(/\s*(?:→|->|>)\s*/).filter(Boolean);
  const toggle = () => {
    st.picked = on ? st.picked.filter((k) => k !== keyOf(r)) : [...st.picked, keyOf(r)].slice(-5);
    if (!on && st.picked.length === 5) toast('최대 5개까지 고를 수 있어요');
    app.render();
  };
  return h(
    'article',
    { class: `ref ${on ? 'on' : ''}` },
    h(
      'div',
      { class: 'ref-top' },
      h('span', { class: `kind k-${r.kind ?? 'other'}` }, KIND_NAME[r.kind ?? 'other']),
      h('span', { class: 'ref-src' }, r.source || hostOf(r.url)),
      r.popularity ? h('span', { class: 'chip ok' }, r.popularity) : null,
    ),
    h('h3', { class: 'ref-title' }, r.title),
    r.hook ? h('div', { class: 'ref-row' }, h('span', { class: 'k' }, '시작'), h('span', null, r.hook)) : null,
    steps.length > 1
      ? h('div', { class: 'ref-row' }, h('span', { class: 'k' }, '구성'), h('ol', { class: 'flow' }, ...steps.map((s) => h('li', null, s))))
      : r.structure
        ? h('div', { class: 'ref-row' }, h('span', { class: 'k' }, '구성'), h('span', null, r.structure))
        : null,
    r.why ? h('div', { class: 'ref-row' }, h('span', { class: 'k' }, '왜 잘 될까'), h('span', null, r.why)) : null,
    !r.hook && !r.structure && r.excerpt ? h('p', { class: 'ref-excerpt' }, r.excerpt.slice(0, 220)) : null,
    h(
      'div',
      { class: 'ref-foot' },
      r.url ? link(r.url, '원문 보기 ↗', 'btn ghost small') : h('span'),
      h('button', { class: `btn small ${on ? 'primary' : 'soft'}`, type: 'button', 'aria-pressed': String(on), onClick: toggle }, on ? '✓ 골랐어요' : '이 글 참고하기'),
    ),
  );
}

function addForm(app: App, ui: UiPlatform): HTMLElement {
  const st = states[ui];
  if (!st.adding) {
    return h('button', { class: 'btn ghost', type: 'button', onClick: () => ((st.adding = true), app.render()) }, '+ 내가 찾은 인기 글 넣기');
  }
  const text = h('textarea', { class: 'textarea', id: `ref-text-${ui}`, rows: 6, placeholder: '반응 좋았던 글을 복사해서 붙여넣으세요 (인스타 캡션, 쓰레드 글, 블로그 본문 일부)' });
  const url = h('input', { class: 'input', id: `ref-url-${ui}`, placeholder: 'https://… (있으면)' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, st.analyzing ? '분석하는 중…' : '분석해서 추가');
  if (st.analyzing) go.setAttribute('disabled', '');
  const form = h(
    'form',
    { class: 'addref' },
    h('div', { class: 'field' }, h('label', { htmlFor: `ref-text-${ui}` }, '글 내용'), text),
    h('div', { class: 'field' }, h('label', { htmlFor: `ref-url-${ui}` }, '링크'), url),
    h('p', { class: 'help' }, app.backend.kind === 'preview' ? '붙여넣은 글의 시작 방식·구성·잘 된 이유를 AI가 바로 정리해요.' : '글을 쓸 때 에이전트가 이 글의 형식을 분석해서 따라요.'),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ((st.adding = false), app.render()) }, '닫기'), go),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = text.value.trim();
    const u = url.value.trim();
    if (!t && !u) return toast('글 내용이나 링크를 넣어 주세요');
    if (u && !/^https?:\/\/\S+$/.test(u)) return toast('링크는 https://로 시작해야 해요');
    st.analyzing = true;
    app.render();
    try {
      const ref = await app.backend.addReference(app.m!, ui, { text: t, url: u });
      st.picked = [...st.picked, keyOf(ref)].slice(-5);
      st.adding = false;
      st.filter = 'all';
      toast('추가하고 골라 뒀어요');
    } catch (err) {
      toast(err instanceof BackendError ? err.message : '추가하지 못했어요');
    } finally {
      st.analyzing = false;
      app.render();
    }
  });
  return form;
}

export function refsSection(app: App, ui: UiPlatform): HTMLElement {
  const m = app.m!;
  const st = states[ui];
  const topic = h('input', { class: 'input', id: `ref-topic-${ui}`, value: topics[ui], placeholder: '예: 편의점 단백질, 바쁜 날 점심', maxLength: 60, onInput: (e: Event) => (topics[ui] = (e.target as HTMLInputElement).value) });
  const find = async () => {
    st.finding = true;
    st.ctl = new AbortController();
    st.msg = '시작하는 중…';
    app.render();
    try {
      const found = await app.backend.findReferences(m, ui, topics[ui].trim(), (msg) => ((st.msg = msg), app.render()), st.ctl.signal);
      st.filter = 'all';
      toast(app.backend.kind === 'preview' ? '예시 레퍼런스예요. 연결된 앱에서는 웹에서 새로 찾아요' : `인기 글 ${found.length}개를 찾았어요`);
    } catch (e) {
      if (!(e instanceof BackendError && e.message === '취소했어요')) toast(e instanceof BackendError ? e.message : '찾지 못했어요');
    } finally {
      st.finding = false;
      st.ctl = null;
      app.render();
    }
  };
  const list = ordered(m.references, ui).filter(FILTERS.find((f) => f.id === st.filter)!.match);
  const feed = list.length ? h('div', { class: 'feed', tabindex: '0', 'aria-label': '인기 글 목록, 스크롤해서 보기' }, ...list.map((r) => refCard(app, ui, r))) : null;
  if (feed) {
    feed.addEventListener('scroll', () => (st.scroll = feed.scrollTop));
    queueMicrotask(() => (feed.scrollTop = st.scroll));
  }
  return h(
    'section',
    { class: 'section', id: 'refs' },
    h('div', { class: 'section-head' }, h('h2', null, '1. 인기 글 고르기'), st.picked.length ? h('span', { class: 'chip pc' }, `${st.picked.length}개 고름`) : null),
    h('p', { class: 'help' }, `마음에 드는 글을 고르면 그 글의 시작 방식과 구성을 따라 ${UI_NAME[ui]} 글을 새로 써요. 문장은 베끼지 않아요.`),
    h(
      'div',
      { class: 'searchrow' },
      h('label', { class: 'sr', htmlFor: `ref-topic-${ui}` }, '찾을 주제'),
      topic,
      h('button', { class: 'btn primary', type: 'button', disabled: st.finding, onClick: find }, '인기 글 찾기'),
    ),
    st.finding ? h('div', { class: 'progress', role: 'status' }, h('span', { class: 'msg' }, st.msg), h('div', { class: 'bar-anim' }, h('i')), h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onClick: () => st.ctl?.abort() }, '그만두기'))) : null,
    h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': '종류로 거르기' },
      ...FILTERS.map((f) => {
        const n = m.references.filter(f.match).length;
        return f.id !== 'all' && !n ? null : h('button', { class: 'choice', type: 'button', 'aria-pressed': String(st.filter === f.id), onClick: () => ((st.filter = f.id), (st.scroll = 0), app.render()) }, `${f.label} ${n}`);
      }),
    ),
    feed ?? h('p', { class: 'empty' }, '아직 레퍼런스가 없어요. 주제를 적고 "인기 글 찾기"를 눌러 보세요'),
    ui !== 'blog' ? h('p', { class: 'help' }, `${UI_NAME[ui]} 글은 로그인해야 보여서 검색에 잘 안 잡혀요. 직접 본 인기 글을 아래에 붙여넣으면 바로 레퍼런스가 돼요.`) : null,
    addForm(app, ui),
    st.picked.length
      ? h('div', { class: 'pickbar' }, h('span', null, `${st.picked.length}개 골랐어요`), h('button', { class: 'btn primary small', type: 'button', onClick: () => document.getElementById('make')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, '이걸로 글 만들기 ↓'))
      : null,
  );
}
