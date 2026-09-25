// 주간보호센터 어르신 관리 앱: 해시 라우팅 + 문자열 템플릿 렌더링.
import './care.css';
import { bindChart, bpChartHtml } from './chart';
import {
  addDays,
  ageOf,
  blankElder,
  daySummary,
  emptyDb,
  ensureRecord,
  formatDateKo,
  getRecord,
  guardianReport,
  hasVitals,
  monthStats,
  newId,
  normalizeElder,
  nowTime,
  parseBackup,
  rosterFor,
  toDateStr,
  VITAL_RANGES,
  vitalFlags,
  vitalHistory,
} from './logic';
import { loadDb, sampleDb, saveDb } from './store';
import {
  CARE_LEVELS,
  DIETS,
  MEAL_AMOUNTS,
  MOBILITIES,
  MOODS,
  WEEKDAYS,
  type DailyRecord,
  type Db,
  type Elder,
  type Vitals,
} from './types';
import { closeSheet, copyText, download, esc, openSheet, smsLink, telLink, toast } from './ui';

let db: Db = loadDb();
const today = () => toDateStr(new Date());
let date = today();
let transportMode: 'pickup' | 'dropoff' = new Date().getHours() < 13 ? 'pickup' : 'dropoff';
let statsMonth = date.slice(0, 7);
let statsElder: string | undefined;
let elderQuery = '';
let showInactive = false;
/** 어르신 등록/수정 화면에서 편집 중인 사본 */
let draft: Elder | undefined;

const app = document.getElementById('app')!;

function persist(): void {
  if (!saveDb(db)) toast('저장하지 못했습니다. 저장 공간을 확인해 주세요.');
}

const elderById = (id: string) => db.elders.find((e) => e.id === id);

// ---------- 라우팅 ----------

type Route =
  | { name: 'today' }
  | { name: 'record'; id: string }
  | { name: 'transport' }
  | { name: 'elders' }
  | { name: 'elder'; id: string }
  | { name: 'stats' }
  | { name: 'settings' };

function currentRoute(): Route {
  const [, name, id] = location.hash.split('/');
  switch (name) {
    case 'record':
    case 'elder':
      return { name, id: id ?? '' };
    case 'transport':
    case 'elders':
    case 'stats':
    case 'settings':
      return { name };
    default:
      return { name: 'today' };
  }
}

function go(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render(): void {
  const route = currentRoute();
  const tab = route.name === 'record' ? 'today' : route.name === 'elder' ? 'elders' : route.name;
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.toggleAttribute('aria-current', a.getAttribute('data-tab') === tab);
  });
  const scroll = window.scrollY;
  app.innerHTML = view(route);
  bindChart(app);
  window.scrollTo(0, scroll);
}

function view(route: Route): string {
  switch (route.name) {
    case 'today':
      return viewToday();
    case 'record':
      return viewRecord(route.id);
    case 'transport':
      return viewTransport();
    case 'elders':
      return viewElders();
    case 'elder':
      return viewElderForm(route.id);
    case 'stats':
      return viewStats();
    case 'settings':
      return viewSettings();
  }
}

// ---------- 공통 조각 ----------

function dateBar(): string {
  const isToday = date === today();
  return `
    <div class="datebar">
      <button class="icon-btn" data-act="date-prev" aria-label="전날">‹</button>
      <label class="date-label">
        <span>${esc(formatDateKo(date))}</span>${isToday ? '<em>오늘</em>' : ''}
        <input type="date" value="${date}" data-act="date-pick" aria-label="날짜 선택">
      </label>
      <button class="icon-btn" data-act="date-next" aria-label="다음날">›</button>
      ${isToday ? '' : '<button class="chip" data-act="date-today">오늘로</button>'}
    </div>`;
}

function header(title: string, back?: string, extra = ''): string {
  return `
    <header class="top">
      ${back ? `<a class="icon-btn" href="${back}" aria-label="뒤로">‹</a>` : ''}
      <h1>${esc(title)}</h1>${extra}
    </header>`;
}

function elderMeta(e: Elder): string {
  const age = ageOf(e.birth, date);
  return [age !== undefined ? `${age}세` : '', e.gender, e.careLevel].filter(Boolean).join(' · ');
}

/** 안전과 직결되는 정보: 알레르기, 식이, 이동 */
function safetyTags(e: Elder): string {
  const tags = [];
  if (e.allergies.trim()) tags.push(`<span class="tag danger">알레르기: ${esc(e.allergies)}</span>`);
  if (e.diet !== '일반식') tags.push(`<span class="tag">${esc(e.diet)}</span>`);
  if (e.mobility !== '자립') tags.push(`<span class="tag">${esc(e.mobility)}</span>`);
  return tags.join('');
}

function emptyState(): string {
  return `
    <div class="empty">
      <p>등록된 어르신이 없습니다.</p>
      <a class="btn primary" href="#/elder/new">어르신 등록하기</a>
      <button class="btn" data-act="load-sample">예시 데이터로 둘러보기</button>
    </div>`;
}

// ---------- 오늘 ----------

function viewToday(): string {
  const s = daySummary(db, date);
  const roster = rosterFor(db, date);
  const alerts: string[] = [];
  for (const a of s.vitalAlerts) {
    alerts.push(`<li class="alert-danger"><a href="#/record/${a.elder.id}"><b>${esc(a.elder.name)}</b> ${esc(a.flags.map((f) => f.message).join(', '))}</a></li>`);
  }
  for (const m of s.medsPending) {
    alerts.push(`<li class="alert-warn"><a href="#/record/${m.elder.id}"><b>${esc(m.elder.name)}</b> 투약 전: ${esc(m.meds.join(', '))}</a></li>`);
  }
  if (s.vitalsMissing.length) {
    alerts.push(`<li class="alert-info">건강 체크 전: ${s.vitalsMissing.map((e) => `<a class="inline" href="#/record/${e.id}">${esc(e.name)}</a>`).join(', ')}</li>`);
  }

  return `
    ${header(db.settings.centerName)}
    ${dateBar()}
    ${db.elders.length === 0 ? emptyState() : `
    <div class="tiles">
      <div class="tile"><b>${s.scheduled}</b><span>예정</span></div>
      <div class="tile good"><b>${s.present}</b><span>출석</span></div>
      <div class="tile"><b>${s.absent}</b><span>결석</span></div>
      <div class="tile ${s.unchecked ? 'warn' : ''}"><b>${s.unchecked}</b><span>미확인</span></div>
    </div>
    ${alerts.length ? `<section class="card"><h2>확인할 일</h2><ul class="alerts">${alerts.join('')}</ul></section>` : ''}
    <h2 class="section-title">어르신 ${roster.length}명</h2>
    ${roster.length ? roster.map(elderCard).join('') : '<p class="muted pad">이 날 이용 예정인 어르신이 없습니다.</p>'}
    `}`;
}

function elderCard(e: Elder): string {
  const rec = getRecord(db, e.id, date);
  let state = '<span class="badge">미확인</span>';
  let quick = `
    <button class="btn primary" data-act="arrive" data-id="${e.id}">등원</button>
    <button class="btn" data-act="absent" data-id="${e.id}">결석</button>`;
  if (rec?.status === 'absent') {
    state = `<span class="badge muted-badge">결석${rec.absentReason ? ` · ${esc(rec.absentReason)}` : ''}</span>`;
    quick = `<button class="btn ghost" data-act="reset-status" data-id="${e.id}">결석 취소</button>`;
  } else if (rec?.status === 'present') {
    const flags = vitalFlags(rec.vitals);
    state = `<span class="badge good">등원 ${esc(rec.arrival ?? '')}</span>`;
    if (rec.departure) state += ` <span class="badge">하원 ${esc(rec.departure)}</span>`;
    if (flags.length) state += ' <span class="badge danger">건강 주의</span>';
    quick = rec.departure
      ? `<button class="btn ghost" data-act="undo-depart" data-id="${e.id}">하원 취소</button>`
      : `<button class="btn primary" data-act="depart" data-id="${e.id}">하원</button>
         <a class="btn" href="#/record/${e.id}">기록</a>`;
  }
  return `
    <article class="elder-card ${rec?.status ?? 'none'}">
      <a class="elder-main" href="#/record/${e.id}">
        <div class="name">${esc(e.name)} <small>${esc(elderMeta(e))}</small></div>
        <div class="tags">${safetyTags(e)}</div>
        <div class="state">${state}</div>
      </a>
      <div class="quick">${quick}</div>
    </article>`;
}

// ---------- 하루 기록 ----------

function viewRecord(id: string): string {
  const e = elderById(id);
  if (!e) return `${header('기록', '#/today')}<p class="pad">어르신을 찾을 수 없습니다.</p>`;
  const rec = getRecord(db, id, date);
  const r: DailyRecord = rec ?? { elderId: id, date, vitals: {}, medsGiven: {}, urine: 0, stool: 0, activities: [], note: '' };
  const v = r.vitals;
  const vitalInput = (field: keyof Vitals, step = '1') => `
    <label class="vital">
      <span>${VITAL_RANGES[field].label.replace(' 혈압', '')}</span>
      <input type="number" inputmode="${step === '1' ? 'numeric' : 'decimal'}" step="${step}"
        data-field="vitals.${field}" value="${v[field] ?? ''}" placeholder="${VITAL_RANGES[field].unit}">
    </label>`;
  const seg = (field: 'lunch' | 'snack' | 'mood', options: readonly string[]) =>
    `<div class="seg">${options
      .map((o) => `<button data-act="set" data-field="${field}" data-value="${o}" aria-pressed="${r[field] === o}">${o}</button>`)
      .join('')}</div>`;
  const counter = (field: 'urine' | 'stool', label: string) => `
    <div class="counter">
      <span>${label}</span>
      <button class="icon-btn" data-act="count" data-field="${field}" data-delta="-1" aria-label="${label} 줄이기">−</button>
      <b>${r[field]}</b>
      <button class="icon-btn" data-act="count" data-field="${field}" data-delta="1" aria-label="${label} 늘리기">+</button>
    </div>`;

  const attendance =
    r.status === 'absent'
      ? `<p>결석 처리됨</p>
         <label class="field"><span>결석 사유</span><input data-field="absentReason" value="${esc(r.absentReason ?? '')}"></label>
         <button class="btn ghost" data-act="reset-status" data-id="${id}">결석 취소</button>`
      : `<div class="row2">
           <label class="field"><span>등원</span><input type="time" data-field="arrival" value="${esc(r.arrival ?? '')}"></label>
           <label class="field"><span>하원</span><input type="time" data-field="departure" value="${esc(r.departure ?? '')}"></label>
         </div>
         <div class="row-btns">
           ${r.status === 'present' ? '' : `<button class="btn primary" data-act="arrive" data-id="${id}">지금 등원</button>`}
           ${r.status === 'present' && !r.departure ? `<button class="btn primary" data-act="depart" data-id="${id}">지금 하원</button>` : ''}
           ${r.status ? '' : `<button class="btn" data-act="absent" data-id="${id}">결석</button>`}
         </div>`;

  return `
    ${header(e.name, '#/today', `<a class="chip" href="#/elder/${id}">정보</a>`)}
    ${dateBar()}
    <section class="card info">
      <div class="name">${esc(e.name)} <small>${esc(elderMeta(e))}</small></div>
      <div class="tags">${safetyTags(e)}</div>
      ${e.conditions ? `<p><b>질환</b> ${esc(e.conditions)}</p>` : ''}
      ${e.notes ? `<p class="note">${esc(e.notes)}</p>` : ''}
      ${e.guardianPhone ? `<a class="btn small" href="${telLink(e.guardianPhone)}">📞 ${esc(e.guardianName || '보호자')}${e.guardianRelation ? `(${esc(e.guardianRelation)})` : ''}</a>` : ''}
    </section>

    <section class="card"><h2>출결</h2>${attendance}</section>

    ${r.status === 'absent' ? '' : `
    <section class="card">
      <h2>건강 체크</h2>
      <div class="vitals">
        ${vitalInput('sys')}${vitalInput('dia')}${vitalInput('pulse')}${vitalInput('temp', '0.1')}${vitalInput('glucose')}
      </div>
      <div id="vital-flags">${vitalFlagsHtml(v)}</div>
    </section>

    <section class="card">
      <h2>투약</h2>
      ${e.meds.length === 0 ? '<p class="muted">등록된 약이 없습니다.</p>' : e.meds
        .map((m) => {
          const given = r.medsGiven[m.id];
          return `<button class="check ${given ? 'on' : ''}" data-act="med" data-med="${m.id}" aria-pressed="${!!given}">
            <span class="box">${given ? '✓' : ''}</span>
            <span><b>${esc(m.name)}</b> <small>${esc(m.timing)}</small></span>
            <span class="time">${given ? `${esc(given)} 완료` : '투약 전'}</span>
          </button>`;
        })
        .join('')}
    </section>

    <section class="card">
      <h2>식사 <small>${esc(e.diet)}</small></h2>
      <p class="label">점심</p>${seg('lunch', MEAL_AMOUNTS)}
      <p class="label">간식</p>${seg('snack', MEAL_AMOUNTS)}
    </section>

    <section class="card">
      <h2>배설 · 기분</h2>
      ${counter('urine', '소변')}${counter('stool', '대변')}
      <p class="label">기분</p>${seg('mood', MOODS)}
    </section>

    <section class="card">
      <h2>프로그램 참여</h2>
      <div class="chips">${db.settings.programs
        .map((p) => `<button class="chip" data-act="activity" data-value="${esc(p)}" aria-pressed="${r.activities.includes(p)}">${esc(p)}</button>`)
        .join('')}</div>
    </section>`}

    <section class="card">
      <h2>특이사항</h2>
      <textarea data-field="note" rows="4" placeholder="오늘 있었던 일, 관찰 내용">${esc(r.note)}</textarea>
    </section>

    <div class="bottom-actions">
      <button class="btn primary block" data-act="report" data-id="${id}">보호자 알림장 보내기</button>
    </div>`;
}

function vitalFlagsHtml(v: Vitals): string {
  const flags = vitalFlags(v);
  if (!flags.length) return hasVitals(v) ? '<p class="ok">정상 범위입니다.</p>' : '';
  return `<ul class="alerts">${flags.map((f) => `<li class="alert-danger">⚠ ${esc(f.message)}</li>`).join('')}</ul>`;
}

// ---------- 송영 ----------

function viewTransport(): string {
  const pickup = transportMode === 'pickup';
  const roster = rosterFor(db, date).filter((e) => {
    const rec = getRecord(db, e.id, date);
    if (rec?.status === 'absent') return false;
    return pickup ? e.usesPickup : e.usesDropoff && rec?.status === 'present';
  });
  const routes = [...new Set([...db.settings.routes, ...roster.map((e) => e.route)])];
  const groups = routes
    .map((route) => ({ route, list: roster.filter((e) => e.route === route) }))
    .filter((g) => g.list.length);

  const body = groups
    .map((g) => {
      const boarded = g.list.filter((e) => getRecord(db, e.id, date)?.[pickup ? 'pickupAt' : 'dropoffAt']);
      return `
      <section class="card">
        <h2>${esc(g.route || '차량 미지정')} <small>${boarded.length}/${g.list.length}명 ${pickup ? '탑승' : '하차'}</small></h2>
        ${g.list
          .map((e) => {
            const rec = getRecord(db, e.id, date);
            const at = rec?.[pickup ? 'pickupAt' : 'dropoffAt'];
            return `
            <div class="ride">
              <button class="check ${at ? 'on' : ''}" data-act="ride" data-id="${e.id}" aria-pressed="${!!at}">
                <span class="box">${at ? '✓' : ''}</span>
                <span><b>${esc(e.name)}</b> <small>${esc(e.mobility)} · ${esc(e.address)}</small></span>
                <span class="time">${at ? esc(at) : ''}</span>
              </button>
              ${e.guardianPhone ? `<a class="icon-btn" href="${telLink(e.guardianPhone)}" aria-label="${esc(e.name)} 보호자에게 전화">📞</a>` : ''}
            </div>`;
          })
          .join('')}
        ${pickup && boarded.some((e) => !getRecord(db, e.id, date)?.status)
          ? `<button class="btn primary block" data-act="arrive-route" data-route="${esc(g.route)}">센터 도착 — 탑승자 등원 처리</button>`
          : ''}
      </section>`;
    })
    .join('');

  return `
    ${header('송영')}
    ${dateBar()}
    <div class="seg wide">
      <button data-act="transport-mode" data-value="pickup" aria-pressed="${pickup}">등원 차량</button>
      <button data-act="transport-mode" data-value="dropoff" aria-pressed="${!pickup}">하원 차량</button>
    </div>
    ${body || `<p class="muted pad">${pickup ? '등원 차량을 이용할 어르신이 없습니다.' : '하원 차량 명단은 등원한 어르신 중 하원 차량 이용자로 만들어집니다.'}</p>`}`;
}

// ---------- 어르신 목록 / 등록 ----------

function viewElders(): string {
  return `
    ${header('어르신', undefined, '<a class="chip primary" href="#/elder/new">+ 등록</a>')}
    <div class="pad">
      <input type="search" class="search" placeholder="이름 · 보호자 · 질환 검색" value="${esc(elderQuery)}" data-act="elder-search">
      <label class="toggle"><input type="checkbox" data-act="show-inactive" ${showInactive ? 'checked' : ''}> 퇴소한 어르신도 보기</label>
    </div>
    <div id="elder-list">${elderListHtml()}</div>`;
}

function elderListHtml(): string {
  if (!db.elders.length) return emptyState();
  const q = elderQuery.trim();
  const list = db.elders
    .filter((e) => showInactive || e.active)
    .filter((e) => !q || [e.name, e.guardianName, e.conditions, e.route].some((s) => s.includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (!list.length) return '<p class="muted pad">찾는 어르신이 없습니다.</p>';
  return list
    .map(
      (e) => `
    <a class="elder-row ${e.active ? '' : 'inactive'}" href="#/elder/${e.id}">
      <div class="name">${esc(e.name)} <small>${esc(elderMeta(e))}${e.active ? '' : ' · 퇴소'}</small></div>
      <div class="sub">${e.days.map((d) => WEEKDAYS[d]).join('')} · ${esc(e.route || '자가')} · ${esc(e.conditions || '질환 정보 없음')}</div>
      <div class="tags">${safetyTags(e)}</div>
    </a>`,
    )
    .join('');
}

function viewElderForm(id: string): string {
  // 새 등록은 아직 저장되지 않은 사본을, 수정은 그 어르신의 사본을 이어서 쓴다
  if (!draft || (id === 'new' ? !!elderById(draft.id) : draft.id !== id)) {
    const existing = elderById(id);
    draft = existing ? structuredClone(existing) : blankElder();
  }
  const d = draft;
  const isNew = !elderById(d.id);
  const text = (field: keyof Elder, label: string, attrs = '') =>
    `<label class="field"><span>${label}</span><input data-ef="${field}" value="${esc(d[field])}" ${attrs}></label>`;
  const select = (field: keyof Elder, label: string, options: readonly string[]) =>
    `<label class="field"><span>${label}</span><select data-ef="${field}">${options
      .map((o) => `<option ${d[field] === o ? 'selected' : ''}>${esc(o)}</option>`)
      .join('')}</select></label>`;
  const routeOptions = [...new Set([...db.settings.routes, d.route].filter(Boolean))];

  return `
    ${header(isNew ? '어르신 등록' : `${d.name} 정보`, '#/elders')}
    <form class="form" data-form="elder" novalidate>
      <section class="card">
        <h2>기본 정보</h2>
        ${text('name', '이름 *', 'required autocomplete="off"')}
        <div class="row2">
          ${select('gender', '성별', ['여', '남'])}
          ${select('careLevel', '장기요양등급', CARE_LEVELS)}
        </div>
        ${text('birth', '생년월일', 'type="date"')}
        <p class="label">이용 요일</p>
        <div class="chips days">${WEEKDAYS.map(
          (w, i) => `<button type="button" class="chip" data-act="toggle-day" data-value="${i}" aria-pressed="${d.days.includes(i)}">${w}</button>`,
        ).join('')}</div>
      </section>

      <section class="card">
        <h2>보호자</h2>
        <div class="row2">${text('guardianName', '이름')}${text('guardianRelation', '관계')}</div>
        ${text('guardianPhone', '연락처', 'type="tel" inputmode="tel"')}
      </section>

      <section class="card">
        <h2>건강 · 돌봄</h2>
        ${text('conditions', '질환')}
        ${text('allergies', '알레르기')}
        <div class="row2">${select('diet', '식이', DIETS)}${select('mobility', '이동', MOBILITIES)}</div>
        <label class="field"><span>주의사항 · 메모</span><textarea data-ef="notes" rows="3">${esc(d.notes)}</textarea></label>
      </section>

      <section class="card">
        <h2>센터에서 드리는 약</h2>
        ${d.meds
          .map(
            (m, i) => `
          <div class="med-row">
            <input data-med-field="name" data-index="${i}" value="${esc(m.name)}" placeholder="약 이름" aria-label="약 이름">
            <input data-med-field="timing" data-index="${i}" value="${esc(m.timing)}" placeholder="점심 식후" aria-label="복용 시점">
            <button type="button" class="icon-btn" data-act="remove-med" data-index="${i}" aria-label="약 삭제">✕</button>
          </div>`,
          )
          .join('')}
        <button type="button" class="btn" data-act="add-med">+ 약 추가</button>
      </section>

      <section class="card">
        <h2>송영</h2>
        <label class="toggle"><input type="checkbox" data-ef="usesPickup" ${d.usesPickup ? 'checked' : ''}> 등원 차량 이용</label>
        <label class="toggle"><input type="checkbox" data-ef="usesDropoff" ${d.usesDropoff ? 'checked' : ''}> 하원 차량 이용</label>
        <label class="field"><span>차량</span><select data-ef="route">
          <option value="" ${d.route ? '' : 'selected'}>미지정</option>
          ${routeOptions.map((r) => `<option ${d.route === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        </select></label>
        ${text('address', '주소 · 승하차 위치')}
      </section>

      ${isNew ? '' : `
      <section class="card">
        <h2>상태</h2>
        <label class="toggle"><input type="checkbox" data-ef="active" ${d.active ? 'checked' : ''}> 이용 중 (끄면 퇴소 처리)</label>
        <button type="button" class="btn danger" data-act="delete-elder">어르신과 모든 기록 삭제</button>
      </section>`}

      <div class="bottom-actions">
        <button type="submit" class="btn primary block">저장</button>
      </div>
    </form>`;
}

// ---------- 통계 ----------

function viewStats(): string {
  const until = today();
  const stats = monthStats(db, statsMonth, until);
  const selected = statsElder ? elderById(statsElder) : undefined;
  let detail = '';
  if (selected) {
    const hist = vitalHistory(db, selected.id, until);
    detail = `
      <section class="card">
        <h2>${esc(selected.name)} 혈압 추이 <small>최근 ${hist.length}회</small></h2>
        ${bpChartHtml(hist)}
        ${hist.length ? `
        <details><summary>표로 보기</summary>
          <table class="table"><thead><tr><th>날짜</th><th>혈압</th><th>맥박</th><th>체온</th><th>혈당</th></tr></thead>
          <tbody>${hist
            .slice()
            .reverse()
            .map(({ date: d, vitals: v }) => {
              const bad = new Set(vitalFlags(v).map((f) => f.field));
              const cell = (k: keyof Vitals, val: string) => `<td class="${bad.has(k) ? 'bad' : ''}">${val}</td>`;
              return `<tr><td>${Number(d.slice(5, 7))}/${Number(d.slice(8))}</td>${cell(bad.has('sys') ? 'sys' : 'dia', `${v.sys ?? '-'}/${v.dia ?? '-'}`)}${cell('pulse', String(v.pulse ?? '-'))}${cell('temp', String(v.temp ?? '-'))}${cell('glucose', String(v.glucose ?? '-'))}</tr>`;
            })
            .join('')}</tbody></table>
        </details>` : ''}
      </section>`;
  }
  return `
    ${header('통계')}
    <div class="pad"><label class="field inline"><span>월</span><input type="month" value="${statsMonth}" data-act="stats-month"></label></div>
    <section class="card">
      <h2>월간 출석 <small>${Number(statsMonth.slice(5))}월, 오늘까지</small></h2>
      ${stats.length ? `
      <table class="table">
        <thead><tr><th>어르신</th><th>예정</th><th>출석</th><th>결석</th><th>출석률</th></tr></thead>
        <tbody>${stats
          .map(
            (s) => `<tr class="clickable ${statsElder === s.elder.id ? 'selected' : ''}" data-act="stats-elder" data-id="${s.elder.id}">
              <td>${esc(s.elder.name)}</td><td>${s.scheduled}</td><td>${s.present}</td><td>${s.absent}</td>
              <td>${s.rate === undefined ? '-' : `<span class="bar"><i style="width:${s.rate}%"></i></span>${s.rate}%`}</td></tr>`,
          )
          .join('')}</tbody>
      </table>
      <p class="muted">이름을 누르면 혈압 추이를 볼 수 있습니다.</p>` : '<p class="muted">기록이 없습니다.</p>'}
    </section>
    ${detail}`;
}

// ---------- 설정 ----------

function viewSettings(): string {
  const s = db.settings;
  const count = Object.keys(db.records).length;
  return `
    ${header('설정')}
    <section class="card">
      <h2>센터</h2>
      <label class="field"><span>센터 이름</span><input data-setting="centerName" value="${esc(s.centerName)}"></label>
      <label class="field"><span>차량 (쉼표로 구분)</span><input data-setting="routes" value="${esc(s.routes.join(', '))}"></label>
      <label class="field"><span>프로그램 (쉼표로 구분)</span><input data-setting="programs" value="${esc(s.programs.join(', '))}"></label>
    </section>
    <section class="card">
      <h2>데이터</h2>
      <p class="muted">모든 기록은 이 기기의 브라우저에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 꼭 백업하세요.
      (어르신 ${db.elders.length}명, 기록 ${count}건)</p>
      <button class="btn block" data-act="export">백업 파일 내려받기</button>
      <label class="btn block file-btn">백업 파일에서 불러오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      <button class="btn block" data-act="load-sample">예시 데이터 넣기</button>
      <button class="btn danger block" data-act="reset">모든 데이터 지우기</button>
    </section>
    <section class="card">
      <h2>건강 체크 기준</h2>
      <table class="table"><thead><tr><th>항목</th><th>낮음</th><th>높음</th></tr></thead><tbody>
      ${Object.values(VITAL_RANGES)
        .map((r) => `<tr><td>${r.label}</td><td>&lt; ${r.low}</td><td>≥ ${r.high} ${r.unit}</td></tr>`)
        .join('')}
      </tbody></table>
    </section>
    <p class="muted pad">홈 화면에 추가하면 앱처럼 쓸 수 있고, 인터넷이 없어도 열립니다.</p>`;
}

// ---------- 동작 ----------

function markArrive(id: string): void {
  const rec = ensureRecord(db, id, date);
  rec.status = 'present';
  rec.absentReason = undefined;
  rec.arrival ??= nowTime();
}

function askAbsent(id: string): void {
  const e = elderById(id);
  const reasons = ['병원 진료', '몸이 안 좋음', '가족 행사', '입원', '연락 없음', '기타'];
  const body = openSheet(`${e?.name ?? ''} 결석 사유`, `<div class="reason-list">${reasons
    .map((r) => `<button class="btn block" data-reason="${r}">${r}</button>`)
    .join('')}</div>`);
  body.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest<HTMLElement>('[data-reason]');
    if (!btn) return;
    const rec = ensureRecord(db, id, date);
    rec.status = 'absent';
    rec.absentReason = btn.dataset.reason;
    rec.arrival = rec.departure = rec.pickupAt = rec.dropoffAt = undefined;
    persist();
    closeSheet();
    render();
  });
}

function showReport(id: string): void {
  const e = elderById(id);
  if (!e) return;
  const text = guardianReport(db, e, date);
  const body = openSheet('보호자 알림장', `
    <textarea class="report" rows="14" aria-label="알림장 내용">${esc(text)}</textarea>
    <div class="row-btns">
      ${e.guardianPhone ? '<button class="btn primary" data-r="sms">문자 보내기</button>' : ''}
      ${'share' in navigator ? '<button class="btn" data-r="share">공유 (카카오톡 등)</button>' : ''}
      <button class="btn" data-r="copy">복사</button>
    </div>
    <p class="muted">보내기 전에 내용을 고칠 수 있습니다.</p>`);
  body.addEventListener('click', async (ev) => {
    const act = (ev.target as Element).closest<HTMLElement>('[data-r]')?.dataset.r;
    const current = body.querySelector('textarea')!.value;
    if (act === 'sms') location.href = smsLink(e.guardianPhone, current);
    if (act === 'share') navigator.share({ text: current }).catch(() => {});
    if (act === 'copy') toast((await copyText(current)) ? '복사했습니다.' : '복사하지 못했습니다. 길게 눌러 복사해 주세요.');
  });
}

function toggleRide(id: string): void {
  const rec = ensureRecord(db, id, date);
  if (transportMode === 'pickup') {
    rec.pickupAt = rec.pickupAt ? undefined : nowTime();
  } else {
    rec.dropoffAt = rec.dropoffAt ? undefined : nowTime();
    // 하원 차량에 타면 하원 시간으로 기록
    if (rec.dropoffAt) rec.departure ??= rec.dropoffAt;
  }
}

function setByPath(rec: DailyRecord, path: string, raw: string): void {
  if (path.startsWith('vitals.')) {
    const key = path.slice(7) as keyof Vitals;
    const n = parseFloat(raw);
    if (raw.trim() === '' || Number.isNaN(n)) delete rec.vitals[key];
    else rec.vitals[key] = n;
    return;
  }
  const value = raw || undefined;
  if (path === 'arrival') {
    rec.arrival = value;
    if (value && !rec.status) rec.status = 'present';
  } else if (path === 'departure') rec.departure = value;
  else if (path === 'absentReason') rec.absentReason = value;
  else if (path === 'note') rec.note = raw;
}

app.addEventListener('click', (ev) => {
  const el = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const { act, id = '', value = '', field = '' } = el.dataset;
  const route = currentRoute();
  const recId = route.name === 'record' ? route.id : id;
  switch (act) {
    case 'date-prev':
      date = addDays(date, -1);
      break;
    case 'date-next':
      date = addDays(date, 1);
      break;
    case 'date-today':
      date = today();
      break;
    case 'arrive':
      markArrive(id);
      break;
    case 'depart': {
      markArrive(id);
      ensureRecord(db, id, date).departure = nowTime();
      break;
    }
    case 'undo-depart':
      ensureRecord(db, id, date).departure = undefined;
      break;
    case 'absent':
      askAbsent(id);
      return;
    case 'reset-status': {
      const rec = ensureRecord(db, id, date);
      rec.status = rec.absentReason = rec.arrival = rec.departure = undefined;
      break;
    }
    case 'set': {
      const rec = ensureRecord(db, recId, date);
      const f = field as 'lunch' | 'snack' | 'mood';
      (rec as unknown as Record<string, string | undefined>)[f] = rec[f] === value ? undefined : value;
      break;
    }
    case 'count': {
      const rec = ensureRecord(db, recId, date);
      const f = field as 'urine' | 'stool';
      rec[f] = Math.max(0, rec[f] + Number(el.dataset.delta));
      break;
    }
    case 'med': {
      const rec = ensureRecord(db, recId, date);
      const med = el.dataset.med!;
      if (rec.medsGiven[med]) delete rec.medsGiven[med];
      else rec.medsGiven[med] = nowTime();
      break;
    }
    case 'activity': {
      const rec = ensureRecord(db, recId, date);
      rec.activities = rec.activities.includes(value) ? rec.activities.filter((a) => a !== value) : [...rec.activities, value];
      break;
    }
    case 'report':
      persist();
      showReport(id);
      return;
    case 'transport-mode':
      transportMode = value as 'pickup' | 'dropoff';
      break;
    case 'ride':
      toggleRide(id);
      break;
    case 'arrive-route': {
      const time = nowTime();
      for (const e of rosterFor(db, date)) {
        const rec = getRecord(db, e.id, date);
        if (e.route === el.dataset.route && rec?.pickupAt && !rec.status) {
          rec.status = 'present';
          rec.arrival = time;
        }
      }
      toast('탑승한 어르신을 등원 처리했습니다.');
      break;
    }
    case 'toggle-day': {
      const day = Number(value);
      draft!.days = draft!.days.includes(day) ? draft!.days.filter((d) => d !== day) : [...draft!.days, day].sort();
      render();
      return;
    }
    case 'add-med':
      draft!.meds.push({ id: newId(), name: '', timing: '점심 식후' });
      render();
      return;
    case 'remove-med':
      draft!.meds.splice(Number(el.dataset.index), 1);
      render();
      return;
    case 'delete-elder': {
      const e = draft && elderById(draft.id);
      if (!e || !confirm(`${e.name} 어르신과 모든 기록을 삭제할까요? 되돌릴 수 없습니다.\n(퇴소만 하려면 '이용 중'을 끄세요.)`)) return;
      db.elders = db.elders.filter((x) => x.id !== e.id);
      for (const [k, r] of Object.entries(db.records)) if (r.elderId === e.id) delete db.records[k];
      persist();
      draft = undefined;
      toast('삭제했습니다.');
      go('#/elders');
      return;
    }
    case 'stats-elder':
      statsElder = statsElder === id ? undefined : id;
      break;
    case 'export':
      download(`주간보호-백업-${today()}.json`, JSON.stringify(db, null, 1));
      return;
    case 'load-sample':
      if (db.elders.length && !confirm('지금 데이터를 지우고 예시 데이터로 바꿀까요?')) return;
      db = sampleDb(today());
      persist();
      toast('예시 어르신 5명을 넣었습니다.');
      go('#/today');
      return;
    case 'reset':
      if (!confirm('어르신 정보와 모든 기록을 지웁니다. 백업하셨나요?')) return;
      if (!confirm('정말 모두 지울까요? 되돌릴 수 없습니다.')) return;
      db = { ...emptyDb(), settings: db.settings };
      persist();
      toast('모두 지웠습니다.');
      break;
    default:
      return;
  }
  persist();
  render();
});

// 입력칸: 다시 그리면 포커스가 사라지므로 값만 저장하고 필요한 부분만 고친다.
app.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  const route = currentRoute();
  if (el.dataset.act === 'elder-search') {
    elderQuery = el.value;
    document.getElementById('elder-list')!.innerHTML = elderListHtml();
    return;
  }
  if (el.dataset.field && route.name === 'record') {
    const rec = ensureRecord(db, route.id, date);
    setByPath(rec, el.dataset.field, el.value);
    if (el.dataset.field.startsWith('vitals.')) document.getElementById('vital-flags')!.innerHTML = vitalFlagsHtml(rec.vitals);
    persist();
    return;
  }
  if (el.dataset.ef && draft) {
    const key = el.dataset.ef as keyof Elder;
    (draft as unknown as Record<string, unknown>)[key] = el.type === 'checkbox' ? el.checked : el.value;
    return;
  }
  if (el.dataset.medField && draft) {
    const med = draft.meds[Number(el.dataset.index)];
    med[el.dataset.medField as 'name' | 'timing'] = el.value;
    return;
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    if (key === 'centerName') db.settings.centerName = el.value.trim() || '주간보호센터';
    else {
      const list = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (key === 'routes') db.settings.routes = list;
      if (key === 'programs') db.settings.programs = list;
    }
    persist();
  }
});

app.addEventListener('change', async (ev) => {
  const el = ev.target as HTMLInputElement;
  const act = el.dataset.act;
  if (el.dataset.ef && draft && (el.type === 'checkbox' || el.tagName === 'SELECT')) {
    (draft as unknown as Record<string, unknown>)[el.dataset.ef] = el.type === 'checkbox' ? el.checked : el.value;
    return;
  }
  if (act === 'date-pick' && el.value) {
    date = el.value;
    render();
  } else if (act === 'show-inactive') {
    showInactive = el.checked;
    document.getElementById('elder-list')!.innerHTML = elderListHtml();
  } else if (act === 'stats-month' && el.value) {
    statsMonth = el.value;
    render();
  } else if (act === 'import' && el.files?.[0]) {
    try {
      const next = parseBackup(await el.files[0].text());
      if (!confirm(`어르신 ${next.elders.length}명, 기록 ${Object.keys(next.records).length}건을 불러옵니다. 지금 데이터는 바뀝니다.`)) return;
      db = next;
      persist();
      toast('불러왔습니다.');
      render();
    } catch (err) {
      toast(err instanceof Error && err.message.includes('백업') ? err.message : '파일을 읽지 못했습니다.');
    }
  }
});

app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!draft) return;
  const name = draft.name.trim();
  if (!name) {
    toast('이름을 입력해 주세요.');
    (app.querySelector('[data-ef="name"]') as HTMLInputElement | null)?.focus();
    return;
  }
  const saved = normalizeElder({ ...draft, name, meds: draft.meds.filter((m) => m.name.trim()) });
  const i = db.elders.findIndex((e) => e.id === saved.id);
  if (i >= 0) db.elders[i] = saved;
  else db.elders.push(saved);
  persist();
  draft = undefined;
  toast('저장했습니다.');
  go('#/elders');
});

window.addEventListener('hashchange', () => {
  const route = currentRoute();
  if (route.name !== 'elder') draft = undefined;
  closeSheet();
  window.scrollTo(0, 0);
  render();
});

// 자정이 지나 앱을 다시 열면 오늘 날짜로 맞춘다.
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastToday) {
    if (date === lastToday) date = today();
    lastToday = today();
    render();
  }
});

render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
