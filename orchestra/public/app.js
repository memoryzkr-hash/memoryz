const $ = (id) => document.getElementById(id);
const log = $('log');
const input = $('input');

const state = {
  messages: [],
  members: [],
  settings: {},
  modelOptions: { claude: [], gpt: [] },
  busy: false,
  /** 스트리밍 중인 말풍선: messageId -> { author, text } (text 가 비면 입력 중 점 3개) */
  live: new Map(),
  /** 직접 호출 대상 멤버 id */
  direct: null,
  search: '',
  /** 사용자 메시지를 아직 안 읽은 멤버 (카톡 숫자 1) */
  unread: new Map(),
};

const RANKS = [
  ['인턴', '0 미만'], ['사원', 0], ['대리', 10], ['과장', 20], ['차장', 35], ['부장', 50], ['이사', 70],
];

const member = (id) => state.members.find((m) => m.id === id);
const present = () => state.members.filter((m) => m.present && m.ready);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function highlight(html) {
  if (!state.search) return html;
  const q = state.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 태그 밖의 글자만 칠한다
  return html.replace(/(^|>)([^<]*)/g, (_, a, t) => a + t.replace(new RegExp(esc(q), 'gi'), (m) => `<mark>${m}</mark>`));
}

/** 작은 마크다운: 코드 블록, 인라인 코드, 굵게, 목록, @멘션 */
function render(md) {
  return md
    .split(/```/)
    .map((part, i) => {
      if (i % 2) return `<pre><code>${esc(part.replace(/^[\w+-]*\n/, '').replace(/\n$/, ''))}</code></pre>`;
      const inline = (t) =>
        esc(t)
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/(^|\s)(@[\w가-힣-]+)/g, '$1<span class="mention">$2</span>');
      // 줄 단위로 보면서 이어지는 목록 줄은 <ul>/<ol> 로 묶는다
      let out = '';
      let para = [];
      let list = null;
      const flushPara = () => {
        if (para.length) out += `<p>${para.map(inline).join('<br>')}</p>`;
        para = [];
      };
      const flushList = () => {
        if (list) out += `<${list.tag}>${list.items.map((t) => `<li>${inline(t)}</li>`).join('')}</${list.tag}>`;
        list = null;
      };
      for (const line of part.split('\n')) {
        const ul = line.match(/^\s*[-*•] (.*)/);
        const ol = line.match(/^\s*\d+[.)] (.*)/);
        const tag = ul ? 'ul' : ol ? 'ol' : null;
        if (tag) {
          flushPara();
          if (list?.tag !== tag) flushList();
          (list ??= { tag, items: [] }).items.push((ul ?? ol)[1]);
        } else if (!line.trim()) {
          flushPara();
          flushList();
        } else {
          flushList();
          para.push(line);
        }
      }
      flushPara();
      flushList();
      return out;
    })
    .join('');
}

const time = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const day = (ts) =>
  new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const sameMinute = (a, b) => Math.floor(a / 60000) === Math.floor(b / 60000);

const avatar = (m, cls = 'avatar', profile = true) =>
  `<div class="${cls}" style="background:${m?.color ?? '#ddd'}"${profile ? ` data-profile="${m?.id ?? ''}"` : ''}>${m?.emoji ?? '🤖'}</div>`;

// ─── 대화 그리기 ───────────────────────────────────────────

function items() {
  const list = state.messages.map((m) => ({ ...m, live: false }));
  for (const [id, l] of state.live) list.push({ id, author: l.author, text: l.text, ts: Date.now(), live: true });
  return list;
}

function renderLog() {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  const list = items();
  let html = '';
  let lastDay = '';
  let hits = 0;
  if (!list.length) {
    html = `<div class="date"><span>📅 ${day(Date.now())}</span></div>
      <div class="notice"><span>클로드 두 명과 지피티가 있는 단톡방이에요. 👑 메인이 먼저 답하고 서브들이 보완해요.</span></div>
      <div class="notice"><span>＋ 버튼이나 프로필에서 한 멤버만 직접 호출할 수 있어요.</span></div>`;
  }
  list.forEach((m, i) => {
    const d = day(m.ts);
    if (d !== lastDay) {
      html += `<div class="date"><span>📅 ${d}</span></div>`;
      lastDay = d;
    }
    if (m.author === 'system') {
      html += `<div class="notice"><span>${esc(m.text)}</span></div>`;
      return;
    }
    if (m.pass) {
      html += `<div class="notice quiet"><span>${esc(m.text)}</span></div>`;
      return;
    }
    const prev = list[i - 1];
    const next = list[i + 1];
    const first = !prev || prev.author !== m.author || prev.pass || !sameMinute(prev.ts, m.ts) || day(prev.ts) !== d;
    const last = !next || next.author !== m.author || next.pass || !sameMinute(next.ts, m.ts) || m.live;
    const mine = m.author === 'user';
    const who = member(m.author);
    let content;
    if (m.live && !m.text) content = '<span class="dots"><i></i><i></i><i></i></span>';
    else if (mine) content = (m.to ? `<div class="direct-quote">🎯 ${esc(member(m.to)?.name ?? '')}에게 직접 호출</div>` : '') + esc(m.text);
    else content = (m.kind === 'summary' ? '<div class="summary-head">📌 최종 정리</div>' : '') + render(m.text);
    content = highlight(content);
    if (state.search && m.text.toLowerCase().includes(state.search.toLowerCase())) hits++;
    const unread = mine ? state.unread.get(m.id)?.size : 0;
    const meta = last && !m.live ? `<div class="meta">${unread ? `<span class="unread">${unread}</span>` : ''}<span>${time(m.ts)}</span></div>` : '';
    const reaction = m.reaction ? `<div class="reaction" data-react="${m.id}">${m.reaction === 'up' ? '👍' : '👎'} 1</div>` : '';
    const bubbleCls = `bubble${m.kind === 'summary' ? ' summary' : ''}${m.live && m.text ? ' cursor' : ''}`;
    if (mine) {
      html += `<div class="msg mine${first ? ' first' : ''}" data-id="${m.id}"><div class="body"><div class="line">
        <div class="${bubbleCls}">${content}</div>${meta}</div></div></div>`;
    } else {
      const rank = who ? `<span class="rank">${esc(who.rank)}${who.position === '메인' ? ' 👑' : ''}</span>` : '';
      html += `<div class="msg${first ? ' first' : ''}" data-id="${m.id}" data-author="${m.author}">
        ${first ? avatar(who) : '<div class="avatar-space"></div>'}
        <div class="body">${first ? `<div class="name">${esc(who?.name ?? m.author)} ${rank}</div>` : ''}
          <div class="line"><div class="${bubbleCls}" data-bubble="${m.live ? '' : m.id}">${content}</div>${meta}</div>${reaction}</div></div>`;
    }
  });
  log.innerHTML = html;
  $('searchCount').textContent = state.search ? `${hits}건` : '';
  if (near || state.forceScroll) log.scrollTop = log.scrollHeight;
  state.forceScroll = false;
}

/** 스트리밍 중엔 그 말풍선만 고친다 */
function patchLive(id) {
  const l = state.live.get(id);
  const el = log.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (!l || !el || !l.text) return renderLog();
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  el.innerHTML = render(l.text);
  el.classList.add('cursor');
  if (near) log.scrollTop = log.scrollHeight;
}

// ─── 멤버 · 서랍 ────────────────────────────────────────────

function renderMembers() {
  const here = state.members.filter((m) => m.present);
  $('count').textContent = here.length + 1;
  $('memberCount').textContent = here.length + 1;
  const row = (m) => `<button class="member-row${m.present ? '' : ' away'}" data-profile="${m.id}">
      ${avatar(m)}<div class="info"><b>${esc(m.name)}</b>
      <span class="tag${m.position === '메인' ? ' main' : ''}">${m.position === '메인' ? '👑 메인' : m.position}</span>
      <span class="tag">${esc(m.rank)}</span>
      <small>${m.ready ? esc(m.model) : 'API 키 없음'} · ${m.score}점${m.present ? '' : ' · 나감'}</small></div></button>`;
  $('memberList').innerHTML =
    `<div class="member-row"><div class="avatar" style="background:#fee500">🙂</div><div class="info"><b>나</b><span class="me-tag">나</span><small>사용자</small></div></div>` +
    state.members.map(row).join('');
  $('rankTable').innerHTML = RANKS.map(([t, s]) => `<span><b>${t}</b>${s}${typeof s === 'number' ? '점~' : ''}</span>`).join('');
  $('maxTurns').value = state.settings.maxTurns;
  $('summarize').checked = state.settings.summarize;
  $('autoRank').checked = state.settings.autoRank;
  renderDirectBar();
  renderPlusMenu();
}

function openDrawer(open) {
  $('drawer').classList.toggle('open', open);
  $('drawer').setAttribute('aria-hidden', String(!open));
  $('drawerDim').hidden = !open;
}

// ─── 직접 호출 ──────────────────────────────────────────────

function setDirect(id) {
  state.direct = id;
  renderDirectBar();
  $('plusMenu').hidden = true;
  input.focus();
}

function renderDirectBar() {
  const m = state.direct && member(state.direct);
  if (m && !(m.present && m.ready)) state.direct = null;
  const bar = $('directBar');
  bar.hidden = !state.direct;
  if (!state.direct) return;
  bar.innerHTML = `${avatar(m, 'avatar mini')}<div class="who">🎯 <b>${esc(m.name)}</b>에게 직접 호출
    <small>다른 멤버 없이 ${esc(m.name)}만 답해요 · ${esc(m.model)}</small></div>
    <button class="icon-btn" id="directClose" aria-label="직접 호출 취소"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>`;
  $('directClose').onclick = () => setDirect(null);
}

function renderPlusMenu() {
  $('plusMenu').innerHTML = state.members
    .map((m) => {
      const ok = m.present && m.ready;
      return `<button data-direct="${m.id}" ${ok ? '' : 'disabled'} class="${ok ? '' : 'off'}">
        <div class="avatar" style="background:${m.color}">${m.emoji}</div>${esc(m.name)} 호출</button>`;
    })
    .join('');
}

// ─── @멘션 팝업 ────────────────────────────────────────────

function mentionQuery() {
  const upto = input.value.slice(0, input.selectionStart);
  const m = upto.match(/(^|\s)@([\w가-힣-]*)$/);
  return m ? m[2] : null;
}

function renderMentionPop() {
  const q = mentionQuery();
  const pop = $('mentionPop');
  if (q === null) return (pop.hidden = true);
  const list = present().filter((m) => !q || m.name.includes(q) || m.position.includes(q));
  const all = '모두'.startsWith(q) || !q;
  if (!list.length && !all) return (pop.hidden = true);
  pop.hidden = false;
  pop.innerHTML =
    list
      .map((m) => `<button data-mention="${esc(m.name)}">${avatar(m, 'avatar', false)}<span><b>${esc(m.name)}</b> <span class="tag">${m.position}</span> <span class="tag">${esc(m.rank)}</span></span></button>`)
      .join('') + (all && present().length > 1 ? `<button data-mention="모두"><div class="avatar" style="background:#eee">👥</div><b>모두</b></button>` : '');
}

function insertMention(name) {
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos).replace(/@([\w가-힣-]*)$/, `@${name} `);
  input.value = before + input.value.slice(pos);
  input.setSelectionRange(before.length, before.length);
  $('mentionPop').hidden = true;
  input.focus();
  updateSend();
}

// ─── 프로필 · 모델 설정 ─────────────────────────────────────

function darken(hex, f = 0.55) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c.join(',')})`;
}

function openProfile(id, edit = false) {
  const m = member(id);
  const el = $('profile');
  if (!m) return (el.hidden = true);
  el.hidden = false;
  el.dataset.id = id;
  const canCall = m.present && m.ready;
  el.innerHTML = `
    <div class="bg" style="background:linear-gradient(180deg, ${darken(m.color, 0.5)} 0%, ${darken(m.color, 0.3)} 100%)"></div>
    <div class="top">
      <button class="icon-btn" data-close aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
    </div>
    <div class="center">
      <div class="big" style="background:${m.color}">${m.emoji}</div>
      <h2>${esc(m.name)}</h2>
      <div class="status">${esc(m.specialty)}</div>
      <div class="badges">
        <span>${m.position === '메인' ? '👑 메인' : m.position}</span><span>${esc(m.rank)} · ${m.score}점</span>
        <span>${m.provider === 'claude' ? 'Claude' : 'GPT'} · ${esc(m.model)}</span>
        ${m.ready ? '' : '<span>⚠️ API 키 없음</span>'}
      </div>
    </div>
    <div class="actions">
      <button data-call ${canCall ? '' : 'disabled'}><svg viewBox="0 0 24 24"><path d="M12 4c-4.7 0-8.5 3-8.5 6.7 0 2.4 1.6 4.5 4 5.7l-.9 3.4 3.9-2.6c.5.1 1 .1 1.5.1 4.7 0 8.5-3 8.5-6.6S16.7 4 12 4Z" /></svg>직접 호출</button>
      <button data-edit><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>모델 설정</button>
      <button data-toggle ${m.ready ? '' : 'disabled'}><svg viewBox="0 0 24 24">${m.present ? '<path d="M15 12H4M8 8l-4 4 4 4M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />' : '<path d="M4 12h11M11 8l4 4-4 4M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />'}</svg>${m.present ? '내보내기' : '초대하기'}</button>
    </div>
    ${edit ? editSheet(m) : ''}`;
  if (edit) bindSheet(m);
}

function editSheet(m) {
  const opts = (p) => state.modelOptions[p].map((o) => `<option value="${o}"></option>`).join('');
  const effort = ['low', 'medium', 'high', 'xhigh', 'max'];
  return `<form class="sheet" id="sheet">
    <div class="grab"></div>
    <h3>${esc(m.name)} 설정</h3>
    <div class="field-row">
      <label class="field" style="flex:0 0 72px">아이콘<input name="emoji" value="${esc(m.emoji)}" maxlength="4" /></label>
      <label class="field">이름<input name="name" value="${esc(m.name)}" maxlength="20" required /></label>
      <label class="field" style="flex:0 0 64px">색<input name="color" type="color" value="${m.color}" style="padding:2px;height:40px" /></label>
    </div>
    <div class="field-row">
      <label class="field">AI 종류<select name="provider">
        <option value="claude" ${m.provider === 'claude' ? 'selected' : ''}>Claude (Anthropic)</option>
        <option value="gpt" ${m.provider === 'gpt' ? 'selected' : ''}>GPT (OpenAI)</option></select></label>
      <label class="field" id="effortField">생각 깊이<select name="effort">
        ${effort.map((e) => `<option ${m.effort === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
    </div>
    <label class="field">모델<input name="model" list="modelList" value="${esc(m.model)}" required />
      <datalist id="modelList">${opts(m.provider)}</datalist></label>
    <div class="warn" id="keyWarn" hidden></div>
    <label class="field">특기 (프로필 상태 메시지 · 프롬프트에 들어가요)<input name="specialty" value="${esc(m.specialty)}" maxlength="80" /></label>
    <label class="field">직급 · 점수
      <div class="rank-ctl"><strong id="rankNow">${esc(m.rank)}</strong>
        <button type="button" class="pill-btn" data-step="-1">강등</button>
        <button type="button" class="pill-btn" data-step="1">승진</button>
        <input name="score" type="number" value="${m.score}" /></div></label>
    <button class="save-btn">저장</button>
  </form>`;
}

function rankOf(score) {
  const mins = [-Infinity, 0, 10, 20, 35, 50, 70];
  let i = 0;
  mins.forEach((min, j) => score >= min && (i = j));
  return { i, title: RANKS[i][0], mins };
}

function bindSheet(m) {
  const f = $('sheet');
  const sync = () => {
    const p = f.provider.value;
    $('effortField').style.visibility = p === 'claude' ? 'visible' : 'hidden';
    f.querySelector('#modelList').innerHTML = state.modelOptions[p].map((o) => `<option value="${o}"></option>`).join('');
    const keyless = state.members.find((x) => x.provider === p && !x.ready) && !state.members.find((x) => x.provider === p && x.ready);
    $('keyWarn').hidden = !keyless;
    $('keyWarn').textContent = keyless ? `서버에 ${p === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} 가 없어서 이 멤버는 답할 수 없어요.` : '';
    $('rankNow').textContent = rankOf(Number(f.score.value)).title;
  };
  f.provider.onchange = () => {
    const opts = state.modelOptions[f.provider.value];
    if (!opts.includes(f.model.value)) f.model.value = opts[0];
    sync();
  };
  f.score.oninput = sync;
  f.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const { i, mins } = rankOf(Number(f.score.value));
      const j = Math.max(1, Math.min(mins.length - 1, i + Number(b.dataset.step)));
      f.score.value = mins[j];
      sync();
    };
  });
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    data.score = Number(data.score);
    await post('api/member', { id: m.id, ...data });
    await refresh();
    openProfile(m.id);
  };
  sync();
}

// ─── 서버 통신 ──────────────────────────────────────────────

const post = (url, data) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) });

async function refresh(full) {
  const s = await fetch('api/state').then((r) => r.json());
  state.members = s.members;
  state.settings = s.settings;
  state.modelOptions = s.modelOptions;
  if (full) {
    state.messages = s.messages;
    state.live.clear();
    state.unread.clear();
    setBusy(s.busy);
    state.forceScroll = true;
  } else {
    // 공감 등으로 바뀐 메시지 반영
    const byId = new Map(s.messages.map((m) => [m.id, m]));
    state.messages = state.messages.map((m) => byId.get(m.id) ?? m);
    if (!s.messages.length) state.messages = [];
  }
  renderMembers();
  renderLog();
  const p = $('profile');
  if (!p.hidden && !$('sheet')) openProfile(p.dataset.id);
}

function setBusy(b) {
  state.busy = b;
  $('stop').hidden = !b;
  updateSend();
}

function updateSend() {
  $('send').disabled = !input.value.trim();
  $('send').hidden = state.busy && !input.value.trim();
}

function markRead(author) {
  for (const set of state.unread.values()) set.delete(author);
}

function connect() {
  const es = new EventSource('api/events');
  es.onopen = () => refresh(true);
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    switch (e.type) {
      case 'message': {
        const m = e.message;
        if (!state.messages.some((x) => x.id === m.id)) state.messages.push(m);
        if (m.author === 'user') {
          const readers = m.to ? [m.to] : present().map((x) => x.id);
          state.unread.set(m.id, new Set(readers));
          state.forceScroll = true;
          setBusy(true);
        }
        renderLog();
        break;
      }
      case 'typing':
        state.live.set(e.messageId, { author: e.author, text: '' });
        markRead(e.author);
        setBusy(true);
        renderLog();
        break;
      case 'delta': {
        const l = state.live.get(e.messageId);
        if (!l) break;
        const wasEmpty = !l.text;
        l.text += e.text;
        wasEmpty ? renderLog() : patchLive(e.messageId);
        break;
      }
      case 'done':
        state.live.delete(e.message.id);
        state.messages.push(e.message);
        renderLog();
        break;
      case 'update':
        state.messages = state.messages.map((m) => (m.id === e.message.id ? e.message : m));
        renderLog();
        break;
      case 'pass': {
        state.live.delete(e.messageId);
        markRead(e.author);
        const m = member(e.author);
        state.messages.push({ id: e.messageId, author: e.author, ts: Date.now(), pass: true, text: `${m?.emoji ?? ''} ${m?.name ?? ''}님: 덧붙일 의견 없음` });
        renderLog();
        break;
      }
      case 'idle':
        state.live.clear();
        state.unread.clear();
        setBusy(false);
        renderLog();
        break;
      case 'members':
        refresh();
        break;
    }
  };
}

// ─── 입력 · 이벤트 ──────────────────────────────────────────

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autosize();
  updateSend();
  $('mentionPop').hidden = true;
  post('api/message', { text, to: state.direct ?? undefined });
  setDirect(null);
}

$('send').onclick = send;
$('stop').onclick = () => post('api/stop');
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    send();
  }
  if (ev.key === 'Escape') $('mentionPop').hidden = true;
});
input.addEventListener('input', () => {
  autosize();
  updateSend();
  renderMentionPop();
});
input.addEventListener('focus', () => ($('plusMenu').hidden = true));
$('mentionBtn').onclick = () => {
  const pos = input.selectionStart;
  const pre = input.value.slice(0, pos);
  const add = (pre && !/\s$/.test(pre) ? ' ' : '') + '@';
  input.value = pre + add + input.value.slice(pos);
  input.setSelectionRange(pos + add.length, pos + add.length);
  input.focus();
  renderMentionPop();
};
$('mentionPop').onclick = (ev) => {
  const b = ev.target.closest('[data-mention]');
  if (b) insertMention(b.dataset.mention);
};
$('plusBtn').onclick = () => {
  $('plusMenu').hidden = !$('plusMenu').hidden;
};
$('plusMenu').onclick = (ev) => {
  const b = ev.target.closest('[data-direct]');
  if (b && !b.disabled) setDirect(b.dataset.direct);
};

$('menuBtn').onclick = () => openDrawer(true);
$('drawerClose').onclick = () => openDrawer(false);
$('drawerDim').onclick = () => openDrawer(false);
$('back').onclick = () => log.scrollTo({ top: 0, behavior: 'smooth' });
$('searchBtn').onclick = () => {
  $('searchbar').hidden = false;
  $('searchInput').focus();
};
$('searchInput').oninput = () => {
  state.search = $('searchInput').value.trim();
  renderLog();
  log.querySelector('mark')?.scrollIntoView({ block: 'center' });
};
$('searchClose').onclick = () => {
  $('searchbar').hidden = true;
  $('searchInput').value = '';
  state.search = '';
  renderLog();
};

$('maxTurns').onchange = () => post('api/settings', { maxTurns: Number($('maxTurns').value) });
$('summarize').onchange = () => post('api/settings', { summarize: $('summarize').checked });
$('autoRank').onchange = () => post('api/settings', { autoRank: $('autoRank').checked });
$('reset').onclick = async () => {
  if (!confirm('대화 내용을 모두 지울까요? (멤버 설정과 직급은 유지돼요)')) return;
  await post('api/reset');
  openDrawer(false);
  refresh(true);
};

// 프로필 열기 (아바타, 서랍의 멤버)
document.addEventListener('click', (ev) => {
  const p = ev.target.closest('[data-profile]');
  if (p && p.dataset.profile) {
    openDrawer(false);
    openProfile(p.dataset.profile);
  }
});

$('profile').addEventListener('click', async (ev) => {
  const id = $('profile').dataset.id;
  const m = member(id);
  if (ev.target.closest('[data-close]')) return ($('profile').hidden = true);
  if (ev.target.closest('[data-call]')) {
    $('profile').hidden = true;
    return setDirect(id);
  }
  if (ev.target.closest('[data-edit]')) return openProfile(id, true);
  if (ev.target.closest('[data-toggle]')) {
    await post('api/member', { id, present: !m.present });
    return refresh();
  }
  // 시트 바깥 빈 곳을 누르면 시트만 닫기
  if ($('sheet') && !ev.target.closest('.sheet') && !ev.target.closest('.actions')) openProfile(id);
});

// 공감: 말풍선을 누르면 👍/👎
let pop;
function closePop() {
  pop?.remove();
  pop = null;
}
log.addEventListener('click', (ev) => {
  const chip = ev.target.closest('[data-react]');
  const bubble = ev.target.closest('[data-bubble]');
  const id = chip?.dataset.react || bubble?.dataset.bubble;
  closePop();
  if (!id) return;
  const msg = state.messages.find((m) => m.id === id);
  if (!msg || window.getSelection()?.toString()) return;
  pop = document.createElement('div');
  pop.className = 'react-pop';
  pop.innerHTML = `<button data-v="up" class="${msg.reaction === 'up' ? 'on' : ''}" title="좋아요 (+3점)">👍</button>
    <button data-v="down" class="${msg.reaction === 'down' ? 'on' : ''}" title="별로예요 (−3점)">👎</button>`;
  const r = (bubble ?? chip).getBoundingClientRect();
  const app = $('app').getBoundingClientRect();
  pop.style.left = `${Math.max(8, r.left - app.left)}px`;
  pop.style.top = `${Math.max(60, r.top - app.top - 52)}px`;
  $('app').append(pop);
  pop.onclick = (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v) post('api/react', { id, value: msg.reaction === v ? null : v });
    closePop();
  };
  ev.stopPropagation();
});
document.addEventListener('click', (ev) => {
  if (pop && !pop.contains(ev.target)) closePop();
  if (!ev.target.closest('.composer')) $('mentionPop').hidden = true;
});
log.addEventListener('scroll', closePop);

connect();
