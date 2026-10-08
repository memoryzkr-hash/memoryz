/** Small spherical-earth helpers. Accurate to well under 1% for trip-planning distances. */

export type LatLng = [number, number];

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * A gently bowed line from a to b for drawing a leg (not a real road route).
 * `bend` is the sideways offset of the middle as a share of the leg length.
 */
export function curvedPath(a: LatLng, b: LatLng, bend: number, points = 24): LatLng[] {
  const midLat = (a[0] + b[0]) / 2;
  const kx = Math.cos(rad(midLat)); // shrink longitude so the bow is perpendicular on screen
  const dx = (b[1] - a[1]) * kx;
  const dy = b[0] - a[0];
  // Control point: midpoint pushed along the left-hand normal.
  const cy = midLat + dx * bend * 2;
  const cx = (a[1] + b[1]) / 2 - (dy * bend * 2) / (kx || 1);
  const out: LatLng[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * cy + t * t * b[0], u * u * a[1] + 2 * u * t * cx + t * t * b[1]]);
  }
  return out;
}

/** Point a share `f` (0..1) of the way along a polyline, by length. */
export function pointAlong(path: LatLng[], f: number): LatLng {
  if (path.length === 0) return [0, 0];
  if (path.length === 1 || f <= 0) return path[0];
  if (f >= 1) return path[path.length - 1];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1], path[i]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return path[0];
  let left = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const t = seg[i] === 0 ? 0 : left / seg[i];
      const p = path[i];
      const q = path[i + 1];
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
    left -= seg[i];
  }
  return path[path.length - 1];
}
