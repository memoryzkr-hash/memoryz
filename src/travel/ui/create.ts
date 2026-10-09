/** Sheet for adding a stop where the map was tapped. */
import { append, h, openSheet } from '../../assistant/ui/dom';
import { MODE_CHOICES, MODES } from '../core/modes';
import type { ModeChoice, PlaceKind, Stop } from '../core/types';
import { KINDS, LIMITS, newId } from '../core/validate';
import { KIND_ICONS } from './map';

const KIND_LABELS: Record<PlaceKind, string> = {
  hotel: '숙소', sight: '명소', food: '식당', cafe: '카페', shop: '쇼핑', activity: '체험', nature: '자연', station: '역', airport: '공항',
};

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'form-field' }, h('span', { class: 'label' }, label), control);
}

export interface NewStop {
  stop: Stop;
  /** Insert before this index. */
  at: number;
}

export function openAddStopSheet(lat: number, lng: number, stops: Stop[], onAdd: (n: NewStop) => void): void {
  const sheet = openSheet('여기에 장소 추가');
  const name = h('input', { class: 'field', placeholder: '장소 이름', maxLength: LIMITS.name });
  const kind = h('select', { class: 'field' }, ...KINDS.map((k) => h('option', { value: k, selected: k === 'sight' }, `${KIND_ICONS[k]} ${KIND_LABELS[k]}`)));
  const stay = h('input', { class: 'field', type: 'number', min: 0, max: LIMITS.stayMin, step: 15, value: 60 });
  const cost = h('input', { class: 'field', type: 'number', min: 0, value: 0 });
  const mode = h('select', { class: 'field' }, ...MODE_CHOICES.map((m) => h('option', { value: m }, m === 'auto' ? '🪄 자동' : `${MODES[m].icon} ${MODES[m].label}`)));
  // Default: before a closing hotel/airport, otherwise at the end.
  const lastAnchor = stops.length > 1 && ['hotel', 'airport', 'station'].includes(stops[stops.length - 1].kind);
  const pos = h(
    'select',
    { class: 'field' },
    ...stops.map((s, i) => h('option', { value: String(i + 1), selected: i === (lastAnchor ? stops.length - 2 : stops.length - 1) }, `${i + 1}. ${s.name} 다음`)),
  );
  const error = h('div', { class: 'err', role: 'alert' });
  const form = h(
    'form',
    { class: 'sheet-form', novalidate: true },
    h('p', { class: 'muted' }, `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`),
    field('이름', name),
    h('div', { class: 'row3' }, field('종류', kind), field('머무는 시간(분)', stay), field('1인 비용', cost)),
    h('div', { class: 'row2' }, field('넣을 위치', pos), field('가는 방법', mode)),
    error,
    h('button', { type: 'submit', class: 'btn primary block' }, '추가하기'),
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
