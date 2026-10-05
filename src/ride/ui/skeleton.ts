import { LM, type Landmark, type PoseReading } from '../core/controls';

/** Upper-body bones worth drawing for a seated rider (MediaPipe pose indices). */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [15, 17], [15, 19], [16, 18], [16, 20],
  [0, 2], [0, 5], [2, 7], [5, 8], [9, 10],
];

/** Draws the tracked skeleton over the (mirrored by CSS) webcam picture. */
export function drawSkeleton(canvas: HTMLCanvasElement, video: HTMLVideoElement, lm: readonly Landmark[] | null, reading: PoseReading | null, steer: number): void {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  if (!lm) return;
  const vis = (i: number) => (lm[i]?.visibility ?? 1) > 0.5;
  const px = (i: number) => [lm[i].x * w, lm[i].y * h] as const;
  const scale = w / 640;

  g.lineCap = 'round';
  g.strokeStyle = '#2ef2ff';
  g.shadowColor = '#2ef2ff';
  g.shadowBlur = 12 * scale;
  g.lineWidth = 4 * scale;
  g.beginPath();
  for (const [a, b] of BONES) {
    if (!vis(a) || !vis(b)) continue;
    const [ax, ay] = px(a);
    const [bx, by] = px(b);
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
  }
  g.stroke();

  // The virtual handlebar between the fists.
  const grip = !!reading?.grip;
  if (grip && vis(LM.leftWrist) && vis(LM.rightWrist)) {
    const [ax, ay] = px(LM.leftWrist);
    const [bx, by] = px(LM.rightWrist);
    g.strokeStyle = '#ffffff';
    g.shadowColor = '#ff2bd6';
    g.lineWidth = 7 * scale;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }

  g.shadowBlur = 0;
  for (const i of [LM.leftWrist, LM.rightWrist]) {
    if (!vis(i)) continue;
    const [x, y] = px(i);
    g.fillStyle = grip ? '#7dffb2' : '#ff2bd6';
    g.beginPath();
    g.arc(x, y, 11 * scale, 0, Math.PI * 2);
    g.fill();
  }
  for (const i of [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow]) {
    if (!vis(i)) continue;
    const [x, y] = px(i);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, 5 * scale, 0, Math.PI * 2);
    g.fill();
  }

  // Steering gauge along the top (drawn mirrored back so it reads left-to-right).
  if (grip) {
    g.save();
    g.translate(w, 0);
    g.scale(-1, 1);
    const cx = w / 2;
    const bw = w * 0.5;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(cx - bw / 2, 12 * scale, bw, 10 * scale);
    g.fillStyle = '#ff2bd6';
    const x = cx + (steer * bw) / 2;
    g.fillRect(Math.min(cx, x), 12 * scale, Math.abs(x - cx), 10 * scale);
    g.fillStyle = '#fff';
    g.fillRect(cx - 1.5 * scale, 8 * scale, 3 * scale, 18 * scale);
    g.restore();
  }
}
