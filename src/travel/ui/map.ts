/**
 * Leaflet map: labelled stops, legs drawn like transit lines, and the moving traveller with a trail.
 * Basemap tiles are optional: a local canvas grid always sits underneath, so when tiles are blocked
 * or offline the map turns into a clean route diagram instead of a blank page.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../core/geo';
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

/** Line colours, chosen like a metro map: each mode keeps its colour everywhere in the app. */
export const MODE_COLORS: Record<Mode, string> = {
  walk: '#7a8597',
  subway: '#2f6fe4',
  bus: '#1f9d57',
  taxi: '#e3a008',
  car: '#d9465f',
  train: '#7b4fd6',
  flight: '#0b9bd0',
  ferry: '#12a3a3',
};

const DASHED: Mode[] = ['walk', 'flight', 'ferry'];

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Faint graph-paper grid drawn locally, so the map never depends on the network to look finished. */
const GridLayer = L.GridLayer.extend({
  createTile(this: L.GridLayer): HTMLElement {
    const size = this.getTileSize();
    const tile = document.createElement('canvas');
    tile.width = size.x;
    tile.height = size.y;
    const ctx = tile.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    ctx.strokeStyle = css.getPropertyValue('--grid').trim() || 'rgba(0,0,0,.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const p = Math.round((i * size.x) / 4) + 0.5;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size.y);
      ctx.moveTo(0, p);
      ctx.lineTo(size.x, p);
    }
    ctx.stroke();
    return tile;
  },
});

export class TripMap {
  readonly map: L.Map;
  private layer = L.layerGroup();
  private trail = L.polyline([], { color: '#000', weight: 6, opacity: 0.35, lineCap: 'round', className: 'trail' });
  private traveller: L.Marker;
  private grid: L.GridLayer;
  private tiles: L.TileLayer | null = null;
  /** Pin element per visit index. */
  private pins: HTMLElement[] = [];
  private lastIcon = '';
  private lastVisit = -1;
  follow = false;
  /** Pixels covered by overlays (HUD on top, controls at the bottom) that a fitted route must avoid. */
  insets: () => { top: number; bottom: number } = () => ({ top: 24, bottom: 24 });
  onTilesChange: (ok: boolean) => void = () => {};

  constructor(el: HTMLElement, onClick: (at: LatLng) => void) {
    this.map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25 }).setView([37.5665, 126.978], 12);
    L.control.zoom({ position: 'topright' }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);
    this.grid = new (GridLayer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ zIndex: 0 });
    this.grid.addTo(this.map);
    this.setTiles();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.setTiles());
    this.layer.addTo(this.map);
    this.trail.addTo(this.map);
    this.traveller = L.marker([0, 0], { icon: this.travellerIcon('🧳', false), zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => onClick([e.latlng.lat, e.latlng.lng]));
  }

  /** CARTO's quiet basemap in the page's theme. Any tile error hides it and keeps the route diagram. */
  private setTiles(): void {
    this.tiles?.remove();
    const style = isDark() ? 'dark_all' : 'light_all';
    const tiles = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd',
      maxZoom: 19,
      zIndex: 1,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    });
    let failed = false;
    tiles.on('tileerror', () => {
      if (failed) return;
      failed = true;
      tiles.remove();
      if (this.tiles === tiles) this.tiles = null;
      this.onTilesChange(false);
    });
    tiles.on('tileload', () => this.onTilesChange(true));
    tiles.addTo(this.map);
    this.tiles = tiles;
  }

  private travellerIcon(emoji: string, moving: boolean): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<div class="traveller${moving ? ' moving' : ''}"><span>${emoji}</span></div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
  }

  show(day: DaySchedule, tl: Timeline, fit: boolean): void {
    this.layer.clearLayers();
    this.pins = [];
    this.lastVisit = -1;
    for (const seg of tl.segments) {
      if (seg.kind !== 'move') continue;
      const color = MODE_COLORS[seg.mode];
      L.polyline(seg.path, { color: '#fff', weight: 9, opacity: 1, interactive: false, className: 'casing' }).addTo(this.layer);
      L.polyline(seg.path, { color, weight: 5, opacity: 1, dashArray: DASHED.includes(seg.mode) ? '1 9' : undefined, lineCap: 'round' })
        .bindTooltip(`${MODES[seg.mode].icon} ${MODES[seg.mode].label}`, { sticky: true })
        .addTo(this.layer);
    }
    // One pin per place; a place visited twice (hotel at both ends) shows both numbers.
    const byPlace = new Map<string, number[]>();
    day.visits.forEach((v, i) => {
      const key = `${v.stop.lat.toFixed(5)},${v.stop.lng.toFixed(5)}`;
      byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
    });
    for (const idx of byPlace.values()) {
      const v = day.visits[idx[0]];
      const nums = idx.map((i) => `<b>${i + 1}</b>`).join('');
      const marker = L.marker([v.stop.lat, v.stop.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin kind-${v.stop.kind}"><span class="pin-dot">${nums}</span><span class="pin-label">${escapeHtml(v.stop.name)}</span></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        title: v.stop.name,
        riseOnHover: true,
      }).addTo(this.layer);
      const el = marker.getElement()?.querySelector<HTMLElement>('.pin');
      if (el) for (const i of idx) this.pins[i] = el;
    }
    if (fit) this.fit(day);
  }

  fit(day: DaySchedule): void {
    const pts = day.visits.map((v) => [v.stop.lat, v.stop.lng] as LatLng);
    if (!pts.length) return;
    const side = this.map.getSize().x < 600 ? 40 : 70;
    const { top, bottom } = this.insets();
    if (pts.length === 1) this.map.setView(pts[0], 14);
    else this.map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [side, top], paddingBottomRight: [side, bottom], maxZoom: 15, animate: false });
  }

  focus(at: LatLng): void {
    this.map.panTo(at, { animate: true });
  }

  update(s: SimState, tl: Timeline): void {
    const moving = s.kind === 'move' || s.kind === 'wait';
    const emoji = moving ? MODES[s.mode!].icon : s.kind === 'done' ? '🏁' : '🧳';
    const key = `${emoji}${s.kind}`;
    if (key !== this.lastIcon) {
      this.traveller.setIcon(this.travellerIcon(emoji, s.kind === 'move'));
      this.lastIcon = key;
    }
    this.traveller.setLatLng(s.at);
    if (s.visit !== this.lastVisit) {
      this.pins.forEach((el, i) => {
        el.classList.toggle('done', i < s.visit || (i === s.visit && s.kind === 'done'));
        el.classList.toggle('next', i === s.visit && s.kind !== 'done');
      });
      this.lastVisit = s.visit;
    }
    // Trail: finished legs, plus the part of the current one already covered.
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
