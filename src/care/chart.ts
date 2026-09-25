// 혈압 추이 선 그래프 (SVG). 수축기/이완기 두 계열, 기준선, 터치·마우스 읽기.
import { VITAL_RANGES } from './logic';
import type { Vitals } from './types';
import { esc } from './ui';

const W = 340;
const H = 190;
const PAD = { l: 34, r: 52, t: 12, b: 26 };

export function bpChartHtml(history: { date: string; vitals: Vitals }[]): string {
  const pts = history.filter((h) => h.vitals.sys !== undefined || h.vitals.dia !== undefined);
  if (pts.length < 2) return '<p class="muted">혈압 기록이 2번 이상 쌓이면 그래프가 나타납니다.</p>';

  const values = pts.flatMap((p) => [p.vitals.sys, p.vitals.dia]).filter((v): v is number => v !== undefined);
  const lo = Math.floor((Math.min(50, ...values) - 5) / 10) * 10;
  const hi = Math.ceil((Math.max(160, ...values) + 5) / 10) * 10;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (pts.length - 1);
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo);

  const line = (key: 'sys' | 'dia') => {
    let d = '';
    let pen = false;
    pts.forEach((p, i) => {
      const v = p.vitals[key];
      if (v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const dots = (key: 'sys' | 'dia') =>
    pts
      .map((p, i) => (p.vitals[key] === undefined ? '' : `<circle cx="${x(i)}" cy="${y(p.vitals[key]!)}" r="4" class="dot ${key}"/>`))
      .join('');
  const lastOf = (key: 'sys' | 'dia') => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].vitals[key] !== undefined) return { i, v: pts[i].vitals[key]! };
    return undefined;
  };

  const grid = [];
  for (let v = lo; v <= hi; v += 20) {
    grid.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`);
    grid.push(`<text x="${PAD.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`);
  }
  const refs = [VITAL_RANGES.sys.high, VITAL_RANGES.dia.high].map(
    (v) =>
      `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="ref"/>`,
  );
  const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  const labels = [0, pts.length - 1].map(
    (i) => `<text x="${x(i)}" y="${H - 6}" class="axis" text-anchor="${i ? 'end' : 'start'}">${md(pts[i].date)}</text>`,
  );
  const direct = (['sys', 'dia'] as const).map((key) => {
    const last = lastOf(key);
    if (!last) return '';
    // 끝 라벨이 겹치면 살짝 벌린다
    const other = lastOf(key === 'sys' ? 'dia' : 'sys');
    let ty = y(last.v) + 4;
    if (other && Math.abs(y(other.v) - y(last.v)) < 14) ty += key === 'sys' ? -7 : 7;
    return `<text x="${x(last.i) + 8}" y="${ty}" class="dlabel">${key === 'sys' ? '수축기' : '이완기'}</text>`;
  });

  const data = esc(JSON.stringify(pts.map((p) => [md(p.date), p.vitals.sys ?? '-', p.vitals.dia ?? '-'])));
  return `
    <div class="chart" data-points="${data}" data-x0="${PAD.l}" data-x1="${W - PAD.r}" data-w="${W}">
      <div class="legend">
        <span><i class="sw sys"></i>수축기</span><span><i class="sw dia"></i>이완기</span>
        <span><i class="sw ref"></i>기준 ${VITAL_RANGES.sys.high}/${VITAL_RANGES.dia.high}</span>
        <span class="readout" aria-live="polite">그래프를 눌러 값 보기</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${pts.length}회 혈압 추이">
        ${grid.join('')}${refs.join('')}
        <line class="cross" y1="${PAD.t}" y2="${H - PAD.b}" x1="-10" x2="-10"/>
        <path d="${line('dia')}" class="line dia"/><path d="${line('sys')}" class="line sys"/>
        ${dots('dia')}${dots('sys')}${labels.join('')}${direct.join('')}
        <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" class="hit"/>
      </svg>
    </div>`;
}

/** 차트 위에서 손가락/마우스를 움직이면 가장 가까운 날짜의 값을 보여 준다. */
export function bindChart(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.chart').forEach((chart) => {
    const svg = chart.querySelector('svg')!;
    const readout = chart.querySelector('.readout')!;
    const cross = chart.querySelector('.cross')!;
    const pts: [string, number | string, number | string][] = JSON.parse(chart.dataset.points!);
    const x0 = Number(chart.dataset.x0);
    const x1 = Number(chart.dataset.x1);
    const w = Number(chart.dataset.w);
    const show = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * w;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((vx - x0) / (x1 - x0)) * (pts.length - 1))));
      const cx = x0 + (i * (x1 - x0)) / (pts.length - 1);
      cross.setAttribute('x1', String(cx));
      cross.setAttribute('x2', String(cx));
      const [d, s, di] = pts[i];
      readout.textContent = `${d}  ${s}/${di} mmHg`;
    };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', show);
  });
}
