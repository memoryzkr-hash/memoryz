/** S1 소식, S1a 주제 추가, S1b 지난 브리핑 (02-screens.md). */
import { toAiError } from '../ai';
import { formatLong } from '../core/dates';
import { LIMITS } from '../core/rules';
import { UndoSlot, type Removed } from '../core/store';
import { charCount, cleanSingleLine } from '../core/text';
import type { Briefing, BriefingItem, Topic } from '../core/types';
import { PASTE_LIMIT } from '../prompts';
import { KEY_VERSION_URL, type App, type Screen } from './app';
import { counter, h, openSheet, replaceChildren, toast } from './dom';

const EXAMPLES = ['AI 도구', '주식', '게임 업데이트'];
const PARALLEL = 2;

interface Run {
  abort: AbortController;
  total: number;
  done: number;
  items: Map<string, BriefingItem>;
}

export function newsScreen(app: App): Screen {
  let run: Run | null = null;
  /** S1b: showing an older day's briefing instead of today's. */
  let viewing: string | null = null;
  let banner: { kind: 'error'; text: string; settings?: boolean } | null = null;
  const undo = new UndoSlot<Removed<Topic>>();
  let root: HTMLElement;

  const rerender = () => {
    if (root && app.isShowing('news')) render(root);
  };

  function render(el: HTMLElement): void {
    root = el;
    const topics = app.store.topics();
    const today = app.today();
    const shownDate = viewing ?? today;
    const briefing = app.store.briefingFor(shownDate);
    const parts: (Node | null)[] = [];

    if (viewing) {
      parts.push(
        h(
          'div',
          { class: 'banner info' },
          h('span', { class: 'msg' }, `${formatLong(viewing)} 브리핑 보는 중`),
          h('button', { type: 'button', class: 'link-btn', textContent: '오늘로 돌아가기', onClick: () => ((viewing = null), rerender()) }),
        ),
      );
    }

    // Topic chips
    parts.push(h('div', { class: 'section-title' }, `내 주제 (${topics.length}/${LIMITS.topics})`));
    const chips = h('div', { class: 'chips' });
    for (const t of topics) {
      chips.append(
        h(
          'span',
          { class: 'chip' },
          t.name,
          h('button', { type: 'button', class: 'x', 'aria-label': `${t.name} 삭제`, textContent: '✕', disabled: !!run, onClick: () => removeTopic(t) }),
        ),
      );
    }
    const full = topics.length >= LIMITS.topics;
    chips.append(h('button', { type: 'button', class: 'chip plain add', textContent: '＋ 주제', disabled: full || !!run, onClick: () => openAddTopic() }));
    parts.push(chips);
    if (full) parts.push(h('div', { class: 'hint' }, `주제는 ${LIMITS.topics}개까지예요`));

    if (banner) {
      parts.push(
        h(
          'div',
          { class: `banner ${banner.kind}`, role: 'alert' },
          h('span', { class: 'msg' }, banner.text),
          banner.settings && h('button', { type: 'button', class: 'link-btn', textContent: '설정에서 바꾸기', onClick: () => app.go('settings') }),
        ),
      );
    }

    // Briefing button + last time
    if (!viewing) {
      const paste = app.mode === 'claude';
      const label = run
        ? paste
          ? '정리 중…'
          : `검색 중… (${run.done}/${run.total})`
        : paste
          ? '📋 기사 붙여 넣고 정리'
          : briefing
            ? '🔍 다시 받기'
            : '🔍 브리핑 받기';
      parts.push(
        h(
          'div',
          { class: 'row', style: 'margin-top:16px' },
          h('button', {
            type: 'button',
            class: 'btn primary',
            id: 'brief',
            textContent: label,
            disabled: !!run || topics.length === 0,
            onClick: () => (paste ? openPaste() : startBriefing()),
          }),
          run && h('button', { type: 'button', class: 'btn', textContent: '취소', onClick: () => run?.abort.abort() }),
        ),
      );
      if (paste) {
        parts.push(
          h(
            'p',
            { class: 'small muted' },
            '이 버전은 API 키 없이 쓰는 대신 웹 검색을 못 해요. 읽을 기사를 붙여 넣으면 내 주제별로 정리해 드려요. 최신 소식을 자동으로 찾으려면 ',
            h('a', { href: KEY_VERSION_URL, target: '_blank', rel: 'noopener' }, 'API 키 버전 ↗'),
          ),
        );
      }
    }
    const history = app.store.briefings();
    parts.push(
      h(
        'div',
        { class: 'row small muted', style: 'margin-top:4px' },
        h('span', { class: 'spacer' }, briefing && !viewing ? `마지막 브리핑: ${timeOf(briefing.createdAt)}` : ''),
        h('button', { type: 'button', class: 'link-btn small', textContent: '지난 브리핑 ›', onClick: () => openHistory(history) }),
      ),
    );

    // Cards
    if (run) {
      for (const t of topics) parts.push(cardFor(run.items.get(t.id) ?? null, t.name));
    } else if (briefing) {
      for (const item of briefing.items) parts.push(cardFor(item, item.topicName, briefing.date === today));
    } else if (topics.length === 0) {
      parts.push(
        h(
          'div',
          { class: 'empty' },
          '관심 있는 주제를 추가해 보세요',
          h('div', { class: 'chips' }, ...EXAMPLES.map((name) => h('button', { type: 'button', class: 'chip plain', textContent: name, onClick: () => addTopic(name) }))),
        ),
      );
    } else if (!viewing) {
      parts.push(h('div', { class: 'empty' }, app.mode === 'claude' ? '📋 읽을 기사를 붙여 넣으면 주제별로 정리해 드려요' : '🔍 브리핑 받기를 눌러 오늘 소식을 모아 보세요'));
    }

    replaceChildren(el, ...parts);
  }

  function cardFor(item: BriefingItem | null, name: string, canRetry = false): HTMLElement {
    const card = h('article', { class: 'card' }, h('h3', null, name));
    if (!item) {
      card.append(h('div', { class: 'skeleton', style: 'width:90%' }), h('div', { class: 'skeleton', style: 'width:75%' }), h('div', { class: 'skeleton', style: 'width:82%' }));
      return card;
    }
    if (item.status === 'empty') {
      card.append(h('p', { class: 'muted' }, app.mode === 'claude' ? '붙여 넣은 글에 이 주제 소식이 없어요' : '최근 소식을 찾지 못했어요'));
    } else if (item.status === 'error') {
      card.append(
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'muted spacer' }, item.error ?? '이 주제는 불러오지 못했어요'),
          canRetry && !run && app.mode === 'key' && h('button', { type: 'button', class: 'btn small', textContent: '다시 시도', onClick: () => retry(item) }),
        ),
      );
    } else {
      card.append(h('ul', null, ...item.bullets.map((b) => h('li', null, b))));
      if (item.sources.length) card.append(
        h(
          'div',
          { class: 'sources' },
          '출처: ',
          ...item.sources.map((s) =>
            h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title, s.lang === 'en' && h('span', { class: 'tag' }, 'EN'), ' ↗'),
          ),
        ),
      );
    }
    return card;
  }

  // ---------- topics ----------

  function addTopic(raw: string): string | null {
    const res = app.store.addTopic(raw);
    if (!res.ok) return res.message;
    rerender();
    return null;
  }

  function removeTopic(t: Topic): void {
    const removed = app.store.removeTopic(t.id);
    if (!removed) return toast('저장하지 못했어요');
    undo.hold(removed);
    rerender();
    toast('삭제됨', {
      label: '되돌리기',
      run: () => {
        const r = undo.take();
        if (r && !app.store.restoreTopic(r)) toast(`주제는 ${LIMITS.topics}개까지예요`);
        rerender();
      },
    });
  }

  function openAddTopic(): void {
    const sheet = openSheet('주제 추가');
    const input = h('input', { class: 'input', id: 'topic-name', placeholder: '예: 반도체 수출, 클래시로얄 패치', autocomplete: 'off' });
    const count = counter();
    const error = h('span', { class: 'err', role: 'alert' });
    const add = h('button', { type: 'submit', class: 'btn primary', textContent: '추가', disabled: true });
    const update = () => {
      const n = charCount(cleanSingleLine(input.value));
      count.set(n, LIMITS.topicName);
      add.disabled = n === 0 || n > LIMITS.topicName;
      error.textContent = '';
    };
    input.addEventListener('input', update);
    update();
    const form = h('form', null, h('label', { class: 'field' }, input, h('div', { class: 'hint' }, error, count.el)), add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = addTopic(input.value);
      if (msg === null) sheet.close();
      else error.textContent = msg;
    });
    sheet.body.append(form);
    input.focus();
  }

  // ---------- briefing ----------

  async function fetchItem(topic: Topic, signal: AbortSignal): Promise<BriefingItem> {
    const ai = app.ai();
    if (!ai) throw toAiError(new Error('no key'));
    const res = await ai.briefTopic(topic.name, app.store.settings(), app.today(), app.timeZone(), signal);
    return { topicId: topic.id, topicName: topic.name, ...res };
  }

  async function startBriefing(): Promise<void> {
    const topics = app.store.topics();
    if (topics.length === 0 || run) return;
    banner = null;
    const current: Run = { abort: new AbortController(), total: topics.length, done: 0, items: new Map() };
    run = current;
    rerender();

    const queue = [...topics];
    let fatal: string | null = null;
    let authFailed = false;
    const worker = async () => {
      for (let t = queue.shift(); t && !current.abort.signal.aborted; t = queue.shift()) {
        try {
          current.items.set(t.id, await fetchItem(t, current.abort.signal));
        } catch (e) {
          const err = toAiError(e);
          if (err.kind === 'aborted') return;
          if (err.kind === 'auth' || err.kind === 'network' || err.kind === 'rate') {
            // Every other topic would fail the same way: stop and say why once.
            fatal = err.message;
            authFailed = err.kind === 'auth';
            current.abort.abort();
            return;
          }
          current.items.set(t.id, { topicId: t.id, topicName: t.name, status: 'error', bullets: [], sources: [], error: '이 주제는 불러오지 못했어요' });
        }
        current.done++;
        rerender();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, topics.length) }, worker));
    run = null;

    if (fatal) {
      banner = { kind: 'error', text: authFailed ? 'API 키가 맞지 않아요' : fatal, settings: authFailed };
    } else if (!current.abort.signal.aborted) {
      const items = topics.map((t) => current.items.get(t.id)!).filter(Boolean);
      if (!app.store.saveBriefing(app.store.newBriefing(app.today(), items))) toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요');
    } else {
      toast('취소했어요');
    }
    rerender();
  }

  /** No-key mode: the viewer pastes articles and Claude sorts them into the topics. */
  function openPaste(): void {
    const sheet = openSheet('기사 붙여 넣기');
    const area = h('textarea', { class: 'textarea', id: 'paste-text', style: 'min-height:220px', placeholder: '기사 본문이나 뉴스레터를 붙여 넣으세요. 주소(https://…)가 같이 있으면 출처로 붙여 드려요.' });
    const count = counter();
    const go = h('button', { type: 'submit', class: 'btn primary', textContent: '주제별로 정리', disabled: true });
    const update = () => {
      const n = area.value.trim().length;
      count.set(n, PASTE_LIMIT);
      go.disabled = n === 0 || n > PASTE_LIMIT;
    };
    area.addEventListener('input', update);
    update();
    const form = h('form', null, h('label', { class: 'field' }, area, h('div', { class: 'hint' }, h('span', null, `주제: ${app.store.topics().map((t) => t.name).join(', ')}`), count.el)), go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = area.value.trim();
      sheet.close();
      void summarizePasted(text);
    });
    sheet.body.append(form);
    area.focus();
  }

  async function summarizePasted(text: string): Promise<void> {
    const ai = app.ai();
    const topics = app.store.topics();
    if (!ai?.briefFromText || topics.length === 0 || run) return;
    banner = null;
    const current: Run = { abort: new AbortController(), total: topics.length, done: 0, items: new Map() };
    run = current;
    rerender();
    try {
      const results = await ai.briefFromText(text, topics.map((t) => t.name), app.today(), app.timeZone(), current.abort.signal);
      const items: BriefingItem[] = topics.map((t) => {
        const r = results.find((x) => x.topic === t.name)?.result ?? { status: 'empty' as const, bullets: [], sources: [] };
        return { topicId: t.id, topicName: t.name, ...r };
      });
      if (!app.store.saveBriefing(app.store.newBriefing(app.today(), items))) toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요');
    } catch (e) {
      const err = toAiError(e);
      if (err.kind === 'aborted') toast('취소했어요');
      else banner = { kind: 'error', text: err.message };
    }
    run = null;
    rerender();
  }

  async function retry(item: BriefingItem): Promise<void> {
    const topic = app.store.topics().find((t) => t.id === item.topicId) ?? { id: item.topicId, name: item.topicName, createdAt: '' };
    run = { abort: new AbortController(), total: 1, done: 0, items: new Map() };
    const today = app.today();
    const b = app.store.briefingFor(today);
    // Show the other topics as they were while this one reloads.
    for (const i of b?.items ?? []) if (i.topicId !== item.topicId) run.items.set(i.topicId, i);
    rerender();
    try {
      const next = await fetchItem(topic, run.abort.signal);
      app.store.updateBriefingItem(today, next);
    } catch (e) {
      const err = toAiError(e);
      if (err.kind !== 'aborted') {
        banner = { kind: 'error', text: err.kind === 'auth' ? 'API 키가 맞지 않아요' : err.message, settings: err.kind === 'auth' };
      }
    }
    run = null;
    rerender();
  }

  // ---------- S1b ----------

  function openHistory(list: Briefing[]): void {
    const sheet = openSheet('지난 브리핑');
    if (list.length === 0) {
      sheet.body.append(h('p', { class: 'muted' }, '아직 받은 브리핑이 없어요'));
      return;
    }
    for (const b of list) {
      sheet.body.append(
        h(
          'button',
          {
            type: 'button',
            class: 'share-option',
            onClick: () => {
              viewing = b.date === app.today() ? null : b.date;
              sheet.close();
              rerender();
            },
          },
          h('strong', null, `${formatLong(b.date)} ${timeOf(b.createdAt)}`),
          h('span', { class: 'muted small' }, `주제 ${b.items.length}개`),
        ),
      );
    }
  }

  return { title: '소식', render };
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
