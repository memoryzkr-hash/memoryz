/** Card-news slides as HTML (1080×1350, Instagram's 4:5). Text shrinks to fit inside the card. */
import { escapeHtml } from '../platforms/blog';
import type { Card, PromoConfig } from '../core/types';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const FONT = `"Pretendard","Noto Sans KR","Noto Sans CJK KR","Apple SD Gothic Neo","Malgun Gothic","WenQuanYi Zen Hei",sans-serif`;

const text = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

export function cardHtml(card: Card, index: number, total: number, brand: PromoConfig['brand']): string {
  const { background, text: ink, accent } = brand.colors;
  const kind = index === 0 ? 'cover' : index === total - 1 && total > 2 ? 'cta' : 'body';
  const bg = kind === 'body' ? background : accent;
  const fg = kind === 'body' ? ink : background;
  const page = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px}
body{background:${bg};color:${fg};font-family:${FONT};word-break:keep-all;overflow-wrap:anywhere}
.card{position:relative;width:100%;height:100%;padding:110px 96px 150px;display:flex;flex-direction:column;gap:48px}
.cover .card,.cta .card{justify-content:center}
.page{position:absolute;top:56px;right:72px;font-size:30px;font-weight:600;opacity:.55;letter-spacing:2px}
.handle{position:absolute;left:96px;bottom:64px;font-size:32px;font-weight:700;opacity:.8}
.brand{position:absolute;right:72px;bottom:64px;font-size:28px;opacity:.6}
.fit{overflow:hidden}
.title{font-weight:800;line-height:1.25;letter-spacing:-1px}
.body{font-weight:500;line-height:1.6;opacity:.92}
.cover .title{font-size:104px}
.cover .body{font-size:46px}
.body-kind .title{font-size:72px;color:${accent};padding-bottom:28px;border-bottom:8px solid ${accent}}
.body-kind .body{font-size:48px}
.cta .title{font-size:88px}
.cta .body{font-size:48px}
.bar{width:120px;height:14px;background:${fg};border-radius:7px;opacity:.9}
</style></head>
<body class="${kind === 'body' ? 'body-kind' : kind}"><div class="card">
${kind === 'body' ? `<div class="page">${page}</div>` : '<div class="bar"></div>'}
<div class="title fit" data-max="${kind === 'body' ? 330 : 560}">${text(card.title)}</div>
${card.body ? `<div class="body fit" data-max="${kind === 'body' ? 640 : 420}">${text(card.body)}</div>` : ''}
${brand.handle ? `<div class="handle">${escapeHtml(brand.handle)}</div>` : ''}
${brand.name ? `<div class="brand">${escapeHtml(brand.name)}</div>` : ''}
</div>
<script>
for (const el of document.querySelectorAll('.fit')) {
  const max = Number(el.dataset.max);
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollHeight > max && size > 24) { size -= 2; el.style.fontSize = size + 'px'; }
}
document.body.dataset.ready = '1';
</script></body></html>`;
}
