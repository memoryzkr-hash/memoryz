const $ = (id) => document.getElementById(id);
const log = $('log');
const input = $('input');

let members = [];
let busy = false;
/** 스트리밍 중인 말풍선: messageId -> { author, text, el } */
const live = new Map();
/** 입력 중인 멤버: messageId -> author */
const typing = new Map();

const member = (id) => members.find((m) => m.id === id);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** 아주 작은 마크다운: 코드 블록, 인라인 코드, 굵게, 목록, @멘션 */
function render(md) {
  const blocks = md.split(/```/);
  return blocks
    .map((part, i) => {
      if (i % 2) {
        const body = part.replace(/^[\w+-]*\n/, '');
        return `<pre><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`;
      }
      return part
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p) => {
          const lines = p.split('\n');
          const inline = (t) =>
            escapeHtml(t)
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/(^|\s)(@[\w가-힣-]+)/g, '$1<span class="mention">$2</span>');
          if (lines.every((l) => /^\s*[-*] /.test(l)))
            return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
          if (lines.every((l) => /^\s*\d+[.)] /.test(l)))
            return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)] /, ''))}</li>`).join('')}</ol>`;
          return `<p>${lines.map(inline).join('<br>')}</p>`;
        })
        .join('');
    })
    .join('');
}

const time = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

function scrollDown(force) {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  if (force || near) log.scrollTop = log.scrollHeight;
}

function clearEmpty() {
  log.querySelector('.empty')?.remove();
}

function showEmpty() {
  log.innerHTML = `<div class="empty">
    <p>👋 클로드 두 명과 지피티가 있는 단톡방이에요.</p>
    <p>질문이나 작업을 올리면 <b>🧠 설계자</b>가 먼저 답하고, <b>🔍 검증자</b>와 <b>⚡ 지피티</b>가 차례로 보완합니다.
    <code>@검증자</code>처럼 부르면 그 멤버가 바로 답해요.</p></div>`;
}

function bubbleRow(author, ts, kind) {
  const row = document.createElement('div');
  if (author === 'user') {
    row.className = 'row me';
    row.innerHTML = `<span class="time">${time(ts)}</span><div class="col"><div class="bubble"></div></div>`;
  } else {
    const m = member(author) ?? { name: author, emoji: '🤖', color: '#eee' };
    row.className = 'row';
    row.innerHTML = `<div class="avatar" style="background:${m.color}">${m.emoji}</div>
      <div class="col"><div class="name">${escapeHtml(m.name)}${m.model ? ` · <small>${escapeHtml(m.model)}</small>` : ''}</div>
      <div class="bubble${kind === 'summary' ? ' summary' : ''}" style="background:${m.color}"></div></div>
      <span class="time">${ts ? time(ts) : ''}</span>`;
  }
  return row;
}

function appendMessage(msg) {
  clearEmpty();
  if (msg.author === 'system') {
    const el = document.createElement('div');
    el.className = 'system';
    el.textContent = msg.text;
    log.append(el);
  } else {
    const row = bubbleRow(msg.author, msg.ts, msg.kind);
    const bubble = row.querySelector('.bubble');
    if (msg.author === 'user') bubble.textContent = msg.text;
    else bubble.innerHTML = render(msg.text);
    log.append(row);
  }
  scrollDown(msg.author === 'user');
}

function updateTyping() {
  const el = $('typing');
  const names = [...new Set(typing.values())].map((id) => member(id)?.name ?? id);
  el.hidden = !names.length;
  el.textContent = names.length ? `${names.join(', ')} 입력 중…` : '';
}

function setBusy(b) {
  busy = b;
  $('stop').hidden = !b;
}

function renderMembers(settings) {
  const present = members.filter((m) => m.present);
  $('count').textContent = `${present.length + 1}`;
  $('members').innerHTML = members
    .map((m) => {
      const cls = !m.ready ? 'off' : m.present ? 'on' : 'off';
      const tip = !m.ready ? 'API 키가 없어서 참여할 수 없어요' : m.present ? '눌러서 내보내기' : '눌러서 초대하기';
      return `<button class="chip ${cls}" data-id="${m.id}" title="${tip}" ${m.ready ? '' : 'disabled'}>
        <span class="dot"></span>${m.emoji} ${escapeHtml(m.name)}${m.ready ? '' : ' <small>(키 없음)</small>'}</button>`;
    })
    .join('');
  $('mentionBar').innerHTML = [
    ...present.map((m) => `<button type="button" data-mention="${m.aliases[0]}">@${escapeHtml(m.aliases[0])}</button>`),
    present.length > 1 ? '<button type="button" data-mention="모두">@모두</button>' : '',
  ].join('');
  if (settings) {
    $('maxTurns').value = settings.maxTurns;
    $('summarize').checked = settings.summarize;
  }
}

async function loadState() {
  const s = await fetch('api/state').then((r) => r.json());
  members = s.members;
  renderMembers(s.settings);
  live.clear();
  typing.clear();
  updateTyping();
  log.innerHTML = '';
  if (!s.messages.length) showEmpty();
  s.messages.forEach(appendMessage);
  setBusy(s.busy);
  scrollDown(true);
}

function connect() {
  const es = new EventSource('api/events');
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    switch (e.type) {
      case 'message':
        appendMessage(e.message);
        if (e.message.author === 'user') setBusy(true);
        break;
      case 'typing':
        typing.set(e.messageId, e.author);
        updateTyping();
        setBusy(true);
        break;
      case 'delta': {
        let entry = live.get(e.messageId);
        if (!entry) {
          clearEmpty();
          const author = typing.get(e.messageId);
          const row = bubbleRow(author, 0);
          log.append(row);
          entry = { text: '', bubble: row.querySelector('.bubble') };
          live.set(e.messageId, entry);
        }
        entry.text += e.text;
        entry.bubble.innerHTML = render(entry.text);
        entry.bubble.classList.add('cursor');
        scrollDown();
        break;
      }
      case 'done': {
        typing.delete(e.message.id);
        updateTyping();
        const entry = live.get(e.message.id);
        live.delete(e.message.id);
        if (entry) entry.bubble.closest('.row').remove();
        appendMessage(e.message);
        break;
      }
      case 'pass': {
        typing.delete(e.messageId);
        updateTyping();
        live.get(e.messageId)?.bubble.closest('.row').remove();
        live.delete(e.messageId);
        const m = member(e.author);
        const el = document.createElement('div');
        el.className = 'system quiet';
        el.textContent = `${m?.emoji ?? ''} ${m?.name ?? e.author}: 덧붙일 의견 없음`;
        log.append(el);
        scrollDown();
        break;
      }
      case 'idle':
        typing.clear();
        updateTyping();
        setBusy(false);
        break;
      case 'members':
        fetch('api/state')
          .then((r) => r.json())
          .then((s) => {
            members = s.members;
            renderMembers(s.settings);
            if (!s.messages.length) showEmpty();
          });
        break;
    }
  };
  // 재연결되면 놓친 메시지가 있을 수 있으니 상태를 다시 받는다
  es.onopen = () => loadState();
}

const post = (url, data) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) });

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autosize();
  post('api/message', { text });
});

input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $('form').requestSubmit();
  }
});

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
input.addEventListener('input', autosize);

$('stop').addEventListener('click', () => post('api/stop'));
$('members').addEventListener('click', (ev) => {
  const chip = ev.target.closest('[data-id]');
  if (!chip) return;
  const m = member(chip.dataset.id);
  post('api/member', { id: m.id, present: !m.present });
});
$('mentionBar').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mention]');
  if (!b) return;
  input.value = `@${b.dataset.mention} ${input.value}`.trimEnd() + ' ';
  input.focus();
});
$('maxTurns').addEventListener('change', () => post('api/settings', { maxTurns: Number($('maxTurns').value) }));
$('summarize').addEventListener('change', () => post('api/settings', { summarize: $('summarize').checked }));
$('reset').addEventListener('click', async () => {
  if (!confirm('대화 내용을 모두 지울까요?')) return;
  await post('api/reset');
  loadState();
});

connect();
