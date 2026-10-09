/** 댓글함 (comments a person should answer) and 설정 (connection + what the agent is told to do). */
import type { CommentAction, CommentCategory, PlatformId } from '../core/types';
import { topbar, type App } from './app';
import { copyText, h, link, PF_NAME, shortDate, toast, WEEKDAY_KO } from './kit';

const CATEGORY: Record<CommentCategory, string> = {
  praise: '칭찬·감사',
  question: '질문',
  purchase: '구매 문의',
  complaint: '불만·환불',
  sensitive: '민감한 내용',
  spam: '스팸',
  abuse: '욕설·비방',
  other: '기타',
};
const ACTION: Record<CommentAction, string> = { reply: '자동 답글', hide: '숨김', escalate: '사람에게', ignore: '무시' };
const CAT_TONE: Partial<Record<CommentCategory, string>> = { complaint: 'bad', sensitive: 'bad', purchase: 'accent', question: 'accent' };

export function inboxView(app: App): HTMLElement {
  const snap = app.snap!;
  const tz = snap.config?.timeZone ?? 'Asia/Seoul';
  const items = app.pendingInbox();
  const markDone = async (key: string) => {
    try {
      await app.source.markInboxDone([key]);
      snap.inboxDone = [...snap.inboxDone, key];
      app.render();
      toast('처리 완료로 옮겼어요');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return h(
    'div',
    { class: 'view' },
    topbar(app),
    h(
      'header',
      { class: 'page-head' },
      h('span', { class: 'eyebrow' }, '댓글함'),
      h('h1', { class: 'page-title' }, items.length ? `직접 답할 댓글 ${items.length}개` : '직접 답할 댓글이 없어요'),
      h('p', { class: 'lede' }, '불만, 건강·법률 상담, FAQ에 없는 질문은 에이전트가 답하지 않고 여기로 넘겨요. 추천 답글을 복사해 앱에서 답한 뒤 "처리 완료"를 눌러 주세요.'),
    ),
    ...(items.length
      ? items.map((i) => {
          const w = shortDate(i.at, tz);
          const reply = h('p', null, i.suggestedReply);
          return h(
            'article',
            { class: 'panel comment' },
            h('div', { class: 'comment-head' }, h('span', { class: `chip ${CAT_TONE[i.category] ?? ''}` }, CATEGORY[i.category]), h('b', null, PF_NAME[i.platform as PlatformId]), h('span', null, `${w.md} (${w.wd}) ${w.time}`)),
            h('blockquote', { class: 'quote' }, h('b', null, i.author), i.text),
            h('p', { class: 'reason' }, `넘긴 이유 · ${i.reason}`),
            i.suggestedReply
              ? h(
                  'div',
                  { class: 'suggest' },
                  h('span', { class: 'label' }, '추천 답글'),
                  reply,
                  h('div', { class: 'btn-row' }, h('button', { class: 'btn small', type: 'button', onClick: async () => toast((await copyText(i.suggestedReply, reply)) ? '복사했어요' : '글을 선택해 뒀어요. 길게 눌러 복사하세요') }, '답글 복사')),
                )
              : null,
            h('div', { class: 'btn-row' }, i.postUrl ? link(i.postUrl, '게시물 열기', 'btn') : null, h('button', { class: 'btn primary', type: 'button', onClick: () => markDone(i.key) }, '처리 완료')),
          );
        })
      : [h('div', { class: 'panel empty' }, h('b', null, '깨끗해요'), h('span', null, '칭찬과 FAQ로 답할 수 있는 질문에는 에이전트가 이미 답했어요.'))]),
  );
}

// ---------------- settings ----------------

/** Set when this build is the shareable preview, whose sandbox cannot reach api.github.com. */
const PREVIEW_ONLY = import.meta.env.VITE_PROMO_PREVIEW_ONLY === '1';
export const LIVE_URL = 'https://memoryzkr-hash.github.io/memoryz/promo.html';

function connectPanel(app: App): HTMLElement {
  if (PREVIEW_ONLY) {
    return h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'GitHub 연결'),
      h('div', { class: 'notice info' }, h('b', null, '이 링크는 예시 데이터로 보는 미리보기예요'), h('span', null, '보안 때문에 이 페이지에서는 GitHub에 접속할 수 없어요. 실제 초안 승인·댓글 처리·실행은 저장소의 GitHub Pages 주소에서 연결하세요.'), h('span', { class: 'mono' }, LIVE_URL)),
    );
  }

  const repo = h('input', { class: 'input', id: 'gh-repo', value: app.defaultRepo(), placeholder: '내아이디/저장소', autocomplete: 'off' });
  const token = h('input', { class: 'input', id: 'gh-token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'GitHub 연결');
  const form = h(
    'form',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'GitHub 연결'), app.source.kind === 'github' ? h('span', { class: 'chip ok' }, h('span', { class: 'dot' }), `${app.source.label} 연결됨`) : null),
    h('p', { class: 'help' }, '에이전트가 기록을 남기는 저장소를 연결하면 실제 초안·댓글·기록이 보이고, 승인과 실행도 여기서 할 수 있어요.'),
    h('div', { class: 'field' }, h('label', { htmlFor: 'gh-repo' }, '저장소'), repo),
    h('div', { class: 'field' }, h('label', { htmlFor: 'gh-token' }, '접근 토큰'), token, h('span', { class: 'help' }, '토큰 만들기: GitHub 설정 → Developer settings → Fine-grained tokens. 이 저장소만 고르고 권한은 Contents 읽기·쓰기, Actions 읽기·쓰기. 토큰은 이 브라우저에만 저장돼요.')),
    h('div', { class: 'btn-row' }, btn, h('button', { class: 'btn ghost', type: 'button', onClick: () => app.useDemo() }, '예시 데이터로 보기')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!repo.value.includes('/') || !token.value.trim()) {
      toast('저장소(계정/이름)와 토큰을 모두 넣어 주세요');
      return;
    }
    btn.setAttribute('disabled', '');
    btn.textContent = '연결 중…';
    await app.connect(repo.value, token.value);
    btn.removeAttribute('disabled');
    btn.textContent = 'GitHub 연결';
  });
  return form;
}

function configPanel(app: App): HTMLElement | null {
  const cfg = app.snap?.config;
  if (!cfg) return null;
  const edit = app.source.links.config();
  const slots = cfg.schedule.slots.map((s) => `${s.days.map((d) => WEEKDAY_KO[d]).join('·')} ${s.time}`).join(', ') || '없음';
  const pf = (Object.keys(cfg.platforms) as PlatformId[]).map((p) => h('span', { class: `chip ${cfg.platforms[p].enabled ? 'ok' : ''}` }, h('span', { class: 'dot' }), `${PF_NAME[p]} ${cfg.platforms[p].enabled ? '켜짐' : '꺼짐'}`));
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '에이전트 설정'), edit ? link(edit, 'config.yml 고치기', 'btn small') : h('span', { class: 'panel-note' }, 'promo/config.yml')),
    app.snap!.configErrors.length ? h('div', { class: 'notice bad' }, h('b', null, '설정 오류'), ...app.snap!.configErrors.map((e) => h('span', null, e))) : null,
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'policy' },
        h(
          'tbody',
          null,
          h('tr', null, h('td', null, '발행 방식'), h('td', null, cfg.mode === 'auto' ? '검수 통과하면 바로' : '승인 후 발행')),
          h('tr', null, h('td', null, '올리는 시간'), h('td', null, `${slots} (${cfg.timeZone})`)),
          h('tr', null, h('td', null, '대기 중인 주제'), h('td', null, cfg.content.topics.length ? cfg.content.topics.join(', ') : '없음 — 기둥에서 자동 선정')),
          h('tr', null, h('td', null, '콘텐츠 기둥'), h('td', null, cfg.content.pillars.join(', ') || '브랜드 설명에서 자동')),
          h('tr', null, h('td', null, '금지 표현'), h('td', null, cfg.content.bannedWords.join(', ') || '없음')),
          h('tr', null, h('td', null, '광고 표기'), h('td', null, cfg.brand.disclosure ?? '없음')),
        ),
      ),
    ),
    h('div', { class: 'chips' }, ...pf),
  );
}

function policyPanel(app: App): HTMLElement | null {
  const cfg = app.snap?.config;
  if (!cfg) return null;
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '댓글 정책'), h('span', { class: 'panel-note' }, `한 번에 답글 최대 ${cfg.comments.maxRepliesPerRun}개 · ${cfg.comments.lookbackDays}일 안의 글`)),
    h(
      'div',
      { class: 'table-wrap' },
      h('table', { class: 'policy' }, h('tbody', null, ...(Object.keys(CATEGORY) as CommentCategory[]).map((c) => h('tr', null, h('td', null, CATEGORY[c]), h('td', null, h('span', { class: `chip ${cfg.comments.actions[c] === 'escalate' ? 'warn' : cfg.comments.actions[c] === 'reply' ? 'accent' : ''}` }, ACTION[cfg.comments.actions[c]])))))),
    ),
  );
}

export function settingsView(app: App): HTMLElement {
  return h(
    'div',
    { class: 'view' },
    topbar(app),
    h('header', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '설정'), h('h1', { class: 'page-title' }, '연결과 규칙')),
    app.error ? h('div', { class: 'notice bad' }, h('b', null, '불러오지 못했어요'), h('span', null, app.error)) : null,
    connectPanel(app),
    h('div', { class: 'grid-2' }, configPanel(app), policyPanel(app)),
  );
}
