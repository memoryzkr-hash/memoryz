/** Sheets: start a new trip (sample or Claude) and add a stop where the map was tapped. */
import { checkApiKey } from '../../assistant/core/rules';
import { append, h, openSheet, replaceChildren } from '../../assistant/ui/dom';
import { checkRequest, createPlannerAi, createSamplePlanner, type PlannerAi, type SampleFn } from '../ai';
import { MODE_CHOICES, MODES } from '../core/modes';
import { scheduleTrip } from '../core/schedule';
import { formatKrw } from '../core/regions';
import type { PlanRequest, TravelStore } from '../core/store';
import type { ModeChoice, PlaceKind, Stop, TripPlan } from '../core/types';
import { KINDS, LIMITS, newId } from '../core/validate';
import { PACE_LABELS } from '../prompts';
import { SAMPLES, samplePlan } from '../samples';
import { KIND_ICONS } from './map';

const KIND_LABELS: Record<PlaceKind, string> = {
  hotel: '숙소', sight: '명소', food: '식당', cafe: '카페', shop: '쇼핑', activity: '체험', nature: '자연', station: '역', airport: '공항',
};

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function openCreateSheet(store: TravelStore, onPlan: (p: TripPlan) => void, sample: SampleFn | null, makeAi: (key: string) => PlannerAi = createPlannerAi): void {
  let controller: AbortController | null = null;
  const sheet = openSheet('새 여행', () => controller?.abort());

  // ---------- samples ----------
  const samples = h(
    'div',
    { class: 'samples' },
    ...SAMPLES.map((p) => {
      const s = scheduleTrip(p);
      return h(
        'button',
        {
          type: 'button',
          class: 'sample',
          onClick: () => {
            const copy = samplePlan(p.id);
            if (copy) onPlan(copy);
            sheet.close();
          },
        },
        h('span', { class: 'sample-place' }, p.destination),
        h('b', null, p.title),
        h('span', { class: 'muted' }, `${p.days.length}일 · ${p.days.reduce((n, d) => n + d.stops.length, 0)}곳 · 약 ${formatKrw(s.totalKrw)}`),
      );
    }),
  );

  // ---------- AI form ----------
  const req = store.request();
  const dest = h('input', { class: 'input', id: 'f-dest', placeholder: '예: 오사카, 강릉, 다낭, 뉴욕', maxLength: 60, value: req.destination });
  const days = h('select', { class: 'input' }, ...Array.from({ length: LIMITS.days }, (_, i) => h('option', { value: String(i + 1), selected: i + 1 === req.days }, i === 0 ? '당일' : `${i}박 ${i + 1}일`)));
  const people = h('select', { class: 'input' }, ...Array.from({ length: LIMITS.travelers }, (_, i) => h('option', { value: String(i + 1), selected: i + 1 === req.travelers }, `${i + 1}명`)));
  const budget = h('input', { class: 'input', type: 'number', min: 0, step: 10000, inputMode: 'numeric', placeholder: '없음', value: req.budgetKrw ?? '' });
  const pace = h('select', { class: 'input' }, ...(Object.keys(PACE_LABELS) as PlanRequest['pace'][]).map((k) => h('option', { value: k, selected: k === req.pace }, PACE_LABELS[k])));
  const interests = h('textarea', { class: 'input', rows: 2, maxLength: 300, placeholder: '예: 맛집 위주, 아이와 함께, 미술관 좋아함, 걷기 싫어함' }, req.interests);
  const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  const keyField = field('Anthropic API 키', keyInput, '이 브라우저에만 저장돼요 (개인 비서와 같이 써요). 콘솔에서 월 사용 한도를 걸어 두세요.');
  keyField.hidden = !!sample || !!store.apiKey();
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn primary wide' }, '일정 만들기');
  const cancel = h('button', { type: 'button', class: 'btn wide', hidden: true, onClick: () => controller?.abort() }, '취소');

  const read = (): PlanRequest => ({
    destination: dest.value.trim(),
    days: Number(days.value),
    travelers: Number(people.value),
    budgetKrw: Number(budget.value) > 0 ? Math.round(Number(budget.value)) : null,
    pace: pace.value as PlanRequest['pace'],
    interests: interests.value.trim(),
  });

  const form = h(
    'form',
    { class: 'create-form', novalidate: true },
    field('어디로 갈까요?', dest),
    h('div', { class: 'row3' }, field('기간', days), field('인원', people), field('예산 (원)', budget)),
    field('일정 밀도', pace),
    field('관심사·요청 (선택)', interests),
    keyField,
    error,
    submit,
    cancel,
    h(
      'p',
      { class: 'fine' },
      sample ? '지금 로그인한 claude.ai 계정의 Claude가 일정을 짜요. 처음 한 번 사용 허락을 물어봐요. ' : '',
      'Claude는 장소와 순서만 정하고, 이동 시간과 비용은 이 앱이 직접 계산해요. 30초~1분쯤 걸려요.',
    ),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    replaceChildren(error);
    const r = read();
    const problem = checkRequest(r);
    if (problem) {
      error.textContent = problem;
      return;
    }
    store.saveRequest(r);
    let key = store.apiKey();
    if (!sample && !key) {
      const k = checkApiKey(keyInput.value);
      if (!k.ok) {
        error.textContent = k.message || 'API 키를 넣어 주세요';
        keyField.hidden = false;
        keyInput.focus();
        return;
      }
      key = k.key;
    }
    controller = new AbortController();
    submit.disabled = true;
    submit.textContent = `${r.destination} 일정을 짜는 중…`;
    cancel.hidden = false;
    try {
      const plan = await (sample ? createSamplePlanner(sample) : makeAi(key!)).plan(r, controller.signal);
      if (!sample && !store.apiKey()) store.setApiKey(key); // only keep a key that worked
      onPlan(plan);
      sheet.close();
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      if (kind === 'auth' && !sample) {
        keyField.hidden = false;
        store.setApiKey(null);
        error.textContent = 'API 키가 맞지 않아요. 다시 넣어 주세요';
      } else if (kind !== 'aborted') error.textContent = (err as Error).message || '만들지 못했어요';
    } finally {
      controller = null;
      submit.disabled = false;
      submit.textContent = '일정 만들기';
      cancel.hidden = true;
    }
  });

  append(sheet.body, [
    h('h3', null, 'Claude에게 일정 맡기기'),
    form,
    h('h3', null, '샘플 여행으로 바로 보기'),
    samples,
    !sample && store.apiKey()
      ? h('button', { type: 'button', class: 'link-btn', onClick: (e: Event) => { store.setApiKey(null); keyField.hidden = false; (e.target as HTMLElement).remove(); } }, '저장된 API 키 지우기')
      : null,
  ]);
}

export interface NewStop {
  stop: Stop;
  /** Insert before this index. */
  at: number;
}

export function openAddStopSheet(lat: number, lng: number, stops: Stop[], onAdd: (n: NewStop) => void): void {
  const sheet = openSheet('여기에 장소 추가');
  const name = h('input', { class: 'input', placeholder: '장소 이름', maxLength: LIMITS.name });
  const kind = h('select', { class: 'input' }, ...KINDS.map((k) => h('option', { value: k, selected: k === 'sight' }, `${KIND_ICONS[k]} ${KIND_LABELS[k]}`)));
  const stay = h('input', { class: 'input', type: 'number', min: 0, max: LIMITS.stayMin, step: 15, value: 60 });
  const cost = h('input', { class: 'input', type: 'number', min: 0, value: 0 });
  const mode = h('select', { class: 'input' }, ...MODE_CHOICES.map((m) => h('option', { value: m }, m === 'auto' ? '🪄 자동' : `${MODES[m].icon} ${MODES[m].label}`)));
  // Default: before a closing hotel/airport, otherwise at the end.
  const lastAnchor = stops.length > 1 && ['hotel', 'airport', 'station'].includes(stops[stops.length - 1].kind);
  const pos = h(
    'select',
    { class: 'input' },
    ...stops.map((s, i) => h('option', { value: String(i + 1), selected: i === (lastAnchor ? stops.length - 2 : stops.length - 1) }, `${i + 1}. ${s.name} 다음`)),
  );
  const error = h('div', { class: 'err', role: 'alert' });
  const form = h(
    'form',
    { class: 'create-form', novalidate: true },
    h('p', { class: 'muted' }, `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`),
    field('이름', name),
    h('div', { class: 'row3' }, field('종류', kind), field('머무는 시간(분)', stay), field('1인 비용', cost)),
    h('div', { class: 'row2' }, field('넣을 위치', pos), field('가는 방법', mode)),
    error,
    h('button', { type: 'submit', class: 'btn primary wide' }, '추가하기'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!name.value.trim()) {
      error.textContent = '이름을 적어 주세요';
      name.focus();
      return;
    }
    onAdd({
      at: Number(pos.value),
      stop: {
        id: newId('s'),
        name: name.value.trim().slice(0, LIMITS.name),
        lat,
        lng,
        kind: kind.value as PlaceKind,
        stayMin: Math.min(LIMITS.stayMin, Math.max(0, Math.round(Number(stay.value) || 0))),
        cost: Math.max(0, Number(cost.value) || 0),
        open: null,
        close: null,
        note: null,
        modeIn: mode.value as ModeChoice,
      },
    });
    sheet.close();
  });
  append(sheet.body, [form]);
  name.focus();
}
