/** Leaflet map: numbered stops, leg lines per mode, and the moving traveller with a trail. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pointAlong, type LatLng } from '../core/geo';
import { MODES } from '../core/modes';
import type { DaySchedule } from '../core/schedule';
import type { SimState, Timeline } from '../core/sim';
import type { Mode, PlaceKind } from '../core/types';

export const KIND_ICONS: Record<PlaceKind, string> = {
  hotel: '🏨',
  sight: '🏛️',
  food: '🍽️',
  cafe: '☕',
  shop: '🛍️',
  activity: '🎡',
  nature: '🌿',
  station: '🚉',
  airport: '🛫',
};

export const MODE_COLORS: Record<Mode, string> = {
  walk: '#5f6b7a',
  subway: '#2e7dff',
  bus: '#16a34a',
  taxi: '#f59e0b',
  car: '#e11d48',
  train: '#7c3aed',
  flight: '#0ea5e9',
  ferry: '#0891b2',
};

export class TripMap {
  readonly map: L.Map;
  private layer = L.layerGroup();
  private trail = L.polyline([], { color: '#111827', weight: 5, opacity: 0.55, lineCap: 'round' });
  private traveller: L.Marker;
  private markers: L.Marker[] = [];
  private lastIcon = '';
  follow = false;

  constructor(el: HTMLElement, onClick: (at: LatLng) => void) {
    this.map = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView([37.5665, 126.978], 12);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(this.map);
    // Offline or blocked tiles: routes and simulation still work on a blank map, so just say why it's blank.
    const note = document.createElement('div');
    note.className = 'tile-note';
    note.textContent = '지도 그림을 불러오지 못했어요 (인터넷 연결 확인). 경로와 시뮬레이션은 그대로 돼요.';
    note.hidden = true;
    el.appendChild(note);
    tiles.on('tileerror', () => (note.hidden = false));
    tiles.on('tileload', () => (note.hidden = true));
    this.layer.addTo(this.map);
    this.trail.addTo(this.map);
    this.traveller = L.marker([0, 0], { icon: this.travellerIcon('🧳', false), zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => onClick([e.latlng.lat, e.latlng.lng]));
  }

  private travellerIcon(emoji: string, moving: boolean): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<div class="traveller${moving ? ' moving' : ''}"><span>${emoji}</span></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  show(day: DaySchedule, tl: Timeline, fit: boolean): void {
    this.layer.clearLayers();
    this.markers = [];
    for (const seg of tl.segments) {
      if (seg.kind !== 'move') continue;
      const color = MODE_COLORS[seg.mode];
      const dashed = seg.mode === 'walk' || seg.mode === 'flight' || seg.mode === 'ferry';
      L.polyline(seg.path, { color: '#ffffff', weight: 7, opacity: 0.8 }).addTo(this.layer);
      L.polyline(seg.path, { color, weight: 4, opacity: 0.9, dashArray: dashed ? '2 8' : undefined, lineCap: 'round' })
        .bindTooltip(`${MODES[seg.mode].icon} ${MODES[seg.mode].label}`, { sticky: true })
        .addTo(this.layer);
      const mid = pointAlong(seg.path, 0.5);
      L.marker(mid, {
        icon: L.divIcon({ className: '', html: `<div class="leg-badge" style="border-color:${color}">${MODES[seg.mode].icon}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
        interactive: false,
        keyboard: false,
      }).addTo(this.layer);
    }
    // Number each stop; a stop visited twice (hotel at both ends) gets both numbers on one pin.
    const byPlace = new Map<string, number[]>();
    day.visits.forEach((v, i) => {
      const key = `${v.stop.lat.toFixed(5)},${v.stop.lng.toFixed(5)}`;
      byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
    });
    for (const idx of byPlace.values()) {
      const v = day.visits[idx[0]];
      const label = idx.map((i) => i + 1).join('·');
      const m = L.marker([v.stop.lat, v.stop.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin kind-${v.stop.kind}"><b>${label}</b><span>${KIND_ICONS[v.stop.kind]}</span></div>`,
          iconSize: [label.length > 2 ? 52 : 40, 30],
          iconAnchor: [label.length > 2 ? 26 : 20, 30],
        }),
        title: v.stop.name,
      })
        .bindTooltip(v.stop.name, { direction: 'top', offset: [0, -28] })
        .addTo(this.layer);
      for (const i of idx) this.markers[i] = m;
    }
    if (fit) this.fit(day);
  }

  fit(day: DaySchedule): void {
    const pts = day.visits.map((v) => [v.stop.lat, v.stop.lng] as LatLng);
    if (!pts.length) return;
    if (pts.length === 1) this.map.setView(pts[0], 14);
    else this.map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15 });
  }

  focus(at: LatLng): void {
    this.map.panTo(at, { animate: true });
  }

  update(s: SimState, tl: Timeline): void {
    const emoji = s.kind === 'move' || s.kind === 'wait' ? MODES[s.mode!].icon : s.kind === 'done' ? '🏁' : '🧳';
    const key = `${emoji}${s.kind}`;
    if (key !== this.lastIcon) {
      this.traveller.setIcon(this.travellerIcon(emoji, s.kind === 'move'));
      this.lastIcon = key;
    }
    this.traveller.setLatLng(s.at);
    // Trail: every finished leg, plus the part of the current one already covered.
    const trail: LatLng[][] = [];
    for (let i = 0; i < tl.segments.length && i <= s.segment; i++) {
      const seg = tl.segments[i];
      if (seg.kind !== 'move') continue;
      if (i < s.segment || s.progress >= 1) trail.push(seg.path);
      else if (s.kind === 'move') {
        const cut = Math.max(1, Math.round(s.progress * (seg.path.length - 1)));
        trail.push([...seg.path.slice(0, cut), s.at]);
      }
    }
    this.trail.setLatLngs(trail);
    if (this.follow) this.map.panTo(s.at, { animate: false });
  }

  invalidate(): void {
    this.map.invalidateSize();
  }
}
