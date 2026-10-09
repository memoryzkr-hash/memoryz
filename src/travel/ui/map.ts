/**
 * The 3D map (MapLibre GL). Street map with 3D buildings from OpenFreeMap and terrain from the
 * AWS elevation tiles, both free and keyless. While the day plays, the camera tilts and follows
 * the traveller along real roads; "전체 보기" shows the whole day from above.
 *
 * Nothing here needs the network to work: if the street map can't load (offline, or a page that
 * blocks outside requests) the same routes, pins and camera run on a plain background.
 */
import maplibregl, { type GeoJSONSource, type LngLatLike, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, MultiLineString } from 'geojson';
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

/** Line colours, like a metro map: each mode keeps its colour everywhere in the app. */
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

const STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** How close the follow camera sits for each way of travelling. */
const FOLLOW_ZOOM: Record<Mode, number> = { walk: 17, subway: 15, bus: 15.5, taxi: 15.5, car: 15, train: 12, flight: 7, ferry: 12 };

type LngLat = [number, number];
const ll = ([lat, lng]: LatLng): LngLat => [lng, lat];

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function css(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function blankStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'paper', type: 'background', paint: { 'background-color': css('--fill-2', '#f9fafb') } }] };
}

async function fetchStyle(url: string): Promise<StyleSpecification | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const style = (await res.json()) as StyleSpecification;
    return style && style.version === 8 ? style : null;
  } catch {
    return null;
  }
}

/** Shortest turn from one bearing to another, eased a fraction of the way. */
function easeBearing(from: number, to: number, f: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return from + d * f;
}

function bearing(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export type CameraMode = 'follow' | 'overview';

export class TripMap {
  readonly map: maplibregl.Map;
  private routes: FeatureCollection = EMPTY;
  private trailData: Feature<MultiLineString> = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
  private pins: HTMLElement[] = [];
  private pinMarkers: maplibregl.Marker[] = [];
  private travellerEl = document.createElement('div');
  private traveller: maplibregl.Marker;
  private lastIcon = '';
  private lastVisit = -1;
  private day: DaySchedule | null = null;
  private real = false;
  private cam = { bearing: 0, zoom: 14 };
  private toggleBtn: HTMLButtonElement;
  camera: CameraMode = 'overview';
  /** Pixels covered by overlays (HUD on top, controls at the bottom) that the camera must avoid. */
  insets: () => { top: number; bottom: number } = () => ({ top: 24, bottom: 24 });
  /** Told whether the real street map is showing. */
  onTilesChange: (ok: boolean) => void = () => {};
  onCameraChange: (mode: CameraMode) => void = () => {};

  constructor(el: HTMLElement, onClick: (at: LatLng) => void) {
    this.map = new maplibregl.Map({
      container: el,
      style: blankStyle(),
      center: [126.978, 37.5665],
      zoom: 12,
      pitch: 0,
      maxPitch: 75,
      attributionControl: { compact: true, customAttribution: '경로 OSRM · 지형 AWS Terrain Tiles' },
      // Hangul and CJK draw with the device font instead of downloading glyphs.
      localIdeographFontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.on('style.load', () => this.addOverlays());
    this.map.on('click', (e) => onClick([e.lngLat.lat, e.lngLat.lng]));
    // A drag or rotate by hand means "let me look": stop steering the camera.
    this.map.on('dragstart', () => this.setCamera('overview', false));

    this.travellerEl.className = 'traveller-wrap';
    this.traveller = new maplibregl.Marker({ element: this.travellerEl, anchor: 'center' }).setLngLat([0, 0]).addTo(this.map);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.className = 'cam-toggle';
    this.toggleBtn.addEventListener('click', () => this.setCamera(this.camera === 'follow' ? 'overview' : 'follow'));
    el.appendChild(this.toggleBtn);
    this.paintToggle();

    void this.loadStreetMap();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void this.loadStreetMap());
  }

  private async loadStreetMap(): Promise<void> {
    const style = await fetchStyle(isDark() ? STYLE_URLS.dark : STYLE_URLS.light);
    this.real = !!style;
    this.map.setStyle(style ?? blankStyle());
    this.onTilesChange(this.real);
  }

  /** Our layers on top of whichever base style is loaded (setStyle drops them). */
  private addOverlays(): void {
    const m = this.map;
    if (this.real) {
      // Korean names first wherever the map has them.
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === 'symbol' && m.getLayoutProperty(layer.id, 'text-field')) {
          m.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name'], ['get', 'name:latin']]);
        }
      }
      if (!(m.getStyle().layers ?? []).some((l) => l.type === 'fill-extrusion') && m.getSource('openmaptiles')) {
        m.addLayer({
          id: 'buildings-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': isDark() ? '#2b2f39' : '#dfe3ea',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        });
      }
      if (!m.getSource('dem')) {
        m.addSource('dem', { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      }
      m.setTerrain({ source: 'dem', exaggeration: 1.3 });
      try {
        m.setSky({ 'sky-color': isDark() ? '#0d1424' : '#bcd8ff', 'horizon-color': isDark() ? '#25304a' : '#f0f5ff', 'fog-color': isDark() ? '#17171c' : '#ffffff', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5 });
      } catch {
        // older engines without sky: fine
      }
    }
    m.addSource('routes', { type: 'geojson', data: this.routes });
    m.addSource('trail', { type: 'geojson', data: this.trailData });
    const casing = css('--casing', '#ffffff');
    m.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': casing, 'line-width': 9, 'line-opacity': 0.9 } });
    m.addLayer({ id: 'route', type: 'line', source: 'routes', filter: ['!', ['get', 'dashed']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
    m.addLayer({ id: 'route-dashed', type: 'line', source: 'routes', filter: ['get', 'dashed'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [0.1, 2] } });
    m.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': css('--blue', '#3182f6'), 'line-width': 7, 'line-opacity': 0.85 } });
  }

  private setSource(id: string, data: FeatureCollection | Feature): void {
    (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  setCamera(mode: CameraMode, announce = true): void {
    if (mode === this.camera) return;
    this.camera = mode;
    this.paintToggle();
    if (mode === 'overview' && this.day && announce) this.fit(this.day);
    if (mode === 'follow') this.cam.zoom = this.map.getZoom();
    this.onCameraChange(mode);
  }

  private paintToggle(): void {
    this.toggleBtn.textContent = this.camera === 'follow' ? '전체 보기' : '3D로 따라가기';
    this.toggleBtn.setAttribute('aria-pressed', String(this.camera === 'follow'));
  }

  show(day: DaySchedule, tl: Timeline, fit: boolean): void {
    this.day = day;
    this.routes = {
      type: 'FeatureCollection',
      features: tl.segments.flatMap((seg) =>
        seg.kind === 'move'
          ? [{ type: 'Feature' as const, properties: { color: MODE_COLORS[seg.mode], dashed: DASHED.includes(seg.mode), mode: seg.mode }, geometry: { type: 'LineString' as const, coordinates: seg.path.map(ll) } }]
          : [],
      ),
    };
    this.setSource('routes', this.routes);

    for (const mk of this.pinMarkers) mk.remove();
    this.pinMarkers = [];
    this.pins = [];
    this.lastVisit = -1;
    // One pin per place; a place visited twice (hotel at both ends) shows both numbers.
    const byPlace = new Map<string, number[]>();
    day.visits.forEach((v, i) => {
      const key = `${v.stop.lat.toFixed(5)},${v.stop.lng.toFixed(5)}`;
      byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
    });
    for (const idx of byPlace.values()) {
      const v = day.visits[idx[0]];
      const wrap = document.createElement('div');
      wrap.className = 'pin-wrap';
      const pin = document.createElement('div');
      pin.className = `pin kind-${v.stop.kind}`;
      const dot = document.createElement('span');
      dot.className = 'pin-dot';
      for (const i of idx) {
        const b = document.createElement('b');
        b.textContent = String(i + 1);
        dot.appendChild(b);
      }
      const label = document.createElement('span');
      label.className = 'pin-label';
      label.textContent = v.stop.name;
      pin.append(dot, label);
      wrap.appendChild(pin);
      wrap.title = v.stop.name;
      this.pinMarkers.push(new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([v.stop.lng, v.stop.lat]).addTo(this.map));
      for (const i of idx) this.pins[i] = pin;
    }
    if (fit && this.camera === 'overview') this.fit(day);
  }

  private padding(): { top: number; bottom: number; left: number; right: number } {
    const { top, bottom } = this.insets();
    const side = this.map.getContainer().clientWidth < 600 ? 36 : 64;
    return { top, bottom, left: side, right: side };
  }

  fit(day: DaySchedule): void {
    const pts = day.visits.map((v) => [v.stop.lng, v.stop.lat] as LngLat);
    if (!pts.length) return;
    const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    this.map.fitBounds(bounds, { padding: this.padding(), maxZoom: 15.5, pitch: this.real ? 45 : 30, bearing: 0, duration: 900 });
  }

  focus(at: LatLng): void {
    this.setCamera('overview', false);
    this.map.easeTo({ center: ll(at), zoom: Math.max(this.map.getZoom(), 15), pitch: 55, duration: 700, padding: this.padding() });
  }

  update(s: SimState, tl: Timeline): void {
    const moving = s.kind === 'move' || s.kind === 'wait';
    const emoji = moving ? MODES[s.mode!].icon : s.kind === 'done' ? '🏁' : '🧳';
    const key = `${emoji}${s.kind}`;
    if (key !== this.lastIcon) {
      this.travellerEl.innerHTML = '';
      const t = document.createElement('div');
      t.className = `traveller${s.kind === 'move' ? ' moving' : ''}`;
      const span = document.createElement('span');
      span.textContent = emoji;
      t.appendChild(span);
      this.travellerEl.appendChild(t);
      this.lastIcon = key;
    }
    this.traveller.setLngLat(ll(s.at));

    if (s.visit !== this.lastVisit) {
      this.pins.forEach((el, i) => {
        el.classList.toggle('done', i < s.visit || (i === s.visit && s.kind === 'done'));
        el.classList.toggle('next', i === s.visit && s.kind !== 'done');
      });
      this.lastVisit = s.visit;
    }

    // Trail: finished legs, plus the part of the current one already covered.
    const lines: LngLat[][] = [];
    for (let i = 0; i < tl.segments.length && i <= s.segment; i++) {
      const seg = tl.segments[i];
      if (seg.kind !== 'move') continue;
      if (i < s.segment || s.progress >= 1) lines.push(seg.path.map(ll));
      else if (s.kind === 'move') {
        const cut = Math.max(1, Math.round(s.progress * (seg.path.length - 1)));
        lines.push([...seg.path.slice(0, cut).map(ll), ll(s.at)]);
      }
    }
    this.trailData = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
    this.setSource('trail', this.trailData);

    if (this.camera === 'follow') this.chase(s, tl);
  }

  /** Follow camera: tilted, heading the way the traveller goes, closer on foot than in the air. */
  private chase(s: SimState, tl: Timeline): void {
    const seg = tl.segments[s.segment];
    let zoom = 16.2;
    let target = this.cam.bearing;
    if (seg?.kind === 'move' && (s.kind === 'move' || s.kind === 'wait')) {
      zoom = FOLLOW_ZOOM[seg.mode];
      if (seg.mode === 'flight' || seg.mode === 'train' || seg.mode === 'ferry') zoom = Math.min(zoom, 15 - Math.log2(Math.max(1, seg.km / 4)));
      const ahead = pointAlong(seg.path, Math.min(1, s.progress + 0.03));
      if (ahead[0] !== s.at[0] || ahead[1] !== s.at[1]) target = bearing(s.at, ahead);
    } else {
      target = this.cam.bearing + 0.15; // a slow turn while staying somewhere
    }
    this.cam.bearing = easeBearing(this.cam.bearing, target, 0.08);
    this.cam.zoom += (zoom - this.cam.zoom) * 0.06;
    this.map.jumpTo({ center: ll(s.at) as LngLatLike, zoom: this.cam.zoom, bearing: this.cam.bearing, pitch: this.real ? 62 : 50, padding: this.padding() });
  }

  invalidate(): void {
    this.map.resize();
  }

  /** True once the real street map (not the plain fallback) is showing. */
  get streetMap(): boolean {
    return this.real;
  }
}
