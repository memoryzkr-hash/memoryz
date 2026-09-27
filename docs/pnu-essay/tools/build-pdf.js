// 부산대 경영학과 대비 자료 PDF 빌드 (Toss 스타일)
// 사용: node build-pdf.js   (필요: marked, pretendard, playwright, python3 + pymupdf)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { marked } = require('marked');
const { chromium } = require('playwright');

const SRC = path.resolve(__dirname, '..');
const OUT = path.join(SRC, 'pdf');
const TMP = require.main === module ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'pnu-pdf-')) : null;
const FONT = path.dirname(require.resolve('pretendard/package.json')) + '/dist/web/static/woff2';
const BRAND = '부산대 경영학과 입시 대비 자료';
const COMBINED = '부산대_경영학과_인문논술_정시_대비자료.pdf';

const DOCS = [
  { file: '01_기출분석.md', no: '01', short: '기출 분석',
    desc: '2017~2026학년도 인문·사회계열 논술 10년치와 출제 경향',
    stats: [['10년', '2017~2026 기출 정리'], ['3문항', '100분 · 약 1,300자'], ['30 : 1+', '경영학과 논술 경쟁률'], ['11.28', '2026년 마지막 논술고사']] },
  { file: '02_예시문제.md', no: '02', short: '모의논술',
    desc: '부산대 형식 그대로, 100분 3문항 모의논술 3회분',
    stats: [['3회분', '문항 9개 · 소문항 18개'], ['100분', '실전과 같은 시간'], ['1,350자', '회당 답안 분량'], ['100점', '30 · 35 · 35점 배점']] },
  { file: '03_채점기준.md', no: '03', short: '채점 기준',
    desc: '부산대 공식 채점 원칙을 소문항 단위 채점표로 옮겼습니다',
    stats: [['50%', '핵심 내용 포함'], ['20%', '제시문 이해·활용'], ['20%', '논리적 구성'], ['10%', '표현']] },
  { file: '04_정시분석.md', no: '04', short: '정시 분석',
    desc: '경영학과 정시, 보통 몇 점이면 붙는지 정리했습니다',
    stats: [['84~85', '최종등록자 70% 컷 (백분위)'], ['87+', '안정권 (국·수·탐 평균)'], ['702.2', '2026 지원 가능 환산점수'], ['2.9 : 1', '2026 정시 경쟁률']] },
];

const face = (w, f) => `@font-face{font-family:'PretendardW';font-weight:${w};src:url(file://${FONT}/Pretendard-${f}.woff2) format('woff2');}`;
const CSS = `
${face(400, 'Regular')}${face(500, 'Medium')}${face(600, 'SemiBold')}${face(700, 'Bold')}${face(800, 'ExtraBold')}
:root{--blue:#3182F6;--blue600:#1B64DA;--blue50:#E8F3FF;--g900:#191F28;--g800:#333D4B;--g700:#4E5968;--g600:#6B7684;--g500:#8B95A1;--g400:#B0B8C1;--g300:#D1D6DB;--g200:#E5E8EB;--g100:#F2F4F6;--g50:#F9FAFB;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;font-family:'PretendardW','Pretendard',sans-serif;font-size:9.6pt;line-height:1.72;color:var(--g800);letter-spacing:-0.01em;word-break:keep-all;overflow-wrap:break-word;font-feature-settings:'tnum';}
p{margin:0 0 7pt;} strong{font-weight:700;color:var(--g900);} a{color:var(--g500);text-decoration:none;word-break:break-all;}
hr{display:none;}
code{font-family:inherit;font-size:.88em;background:var(--g100);color:var(--g700);border-radius:5px;padding:1pt 4pt;}
ul,ol{margin:4pt 0 12pt;padding-left:15pt;} li{margin:3pt 0;padding-left:2pt;}
ul li::marker{color:var(--g400);} ol li::marker{color:var(--blue);font-weight:700;}
h2{font-size:15.5pt;font-weight:700;color:var(--g900);letter-spacing:-0.025em;line-height:1.4;margin:28pt 0 10pt;break-after:avoid;}
h2 .no{color:var(--blue);margin-right:7pt;}
h3{font-size:12pt;font-weight:700;color:var(--g900);letter-spacing:-0.02em;margin:18pt 0 8pt;break-after:avoid;}
h3 .no{color:var(--g400);margin-right:6pt;}
h4{font-size:10.5pt;font-weight:700;color:var(--g900);margin:14pt 0 6pt;break-after:avoid;}
.chapter{break-before:page;}
.ch-head{padding:4mm 0 0;margin-bottom:14pt;}
.eyebrow{color:var(--blue);font-weight:700;font-size:9.5pt;letter-spacing:.04em;}
.ch-title{font-size:25pt;font-weight:800;color:var(--g900);letter-spacing:-0.035em;line-height:1.3;margin:6pt 0 6pt;}
.ch-desc{font-size:11pt;color:var(--g600);margin:0;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin:16pt 0 18pt;}
.stat{background:var(--g50);border-radius:14px;padding:12pt 12pt 11pt;}
.stat .v{font-size:17pt;font-weight:800;color:var(--g900);letter-spacing:-0.03em;line-height:1.2;}
.stat:first-child .v{color:var(--blue);}
.stat .k{font-size:7.8pt;color:var(--g600);margin-top:4pt;line-height:1.4;}
.tbl{border:1px solid var(--g200);border-radius:14px;overflow:hidden;margin:8pt 0 16pt;background:#fff;}
.tbl table{width:100%;border-collapse:collapse;font-size:8.7pt;line-height:1.55;}
.tbl th{background:var(--g50);color:var(--g600);font-weight:600;text-align:left;padding:7pt 10pt;border-bottom:1px solid var(--g200);}
.tbl td{padding:7.5pt 10pt;border-bottom:1px solid var(--g100);vertical-align:top;}
.tbl tr:last-child td{border-bottom:0;} .tbl tr{break-inside:avoid;}
.tbl td:first-child{font-weight:600;color:var(--g900);}
.tbl.fill td{height:20pt;}
.callout{background:var(--g50);border-radius:14px;padding:11pt 15pt;margin:8pt 0 16pt;color:var(--g700);font-size:9pt;}
.callout p:last-child{margin:0;}
.pill{display:inline-block;font-size:7.4pt;font-weight:600;line-height:1;padding:3.5pt 6.5pt;border-radius:999px;white-space:nowrap;vertical-align:1px;letter-spacing:0;}
.pill.warn{background:#FFF3E0;color:#E57A00;} .pill.blue{background:var(--blue50);color:var(--blue600);}
.pill.green{background:#E5F8EF;color:#029359;} .pill.orange{background:#FFF3E0;color:#E57A00;}
.pill.red{background:#FFEEEE;color:#E42939;} .pill.grey{background:var(--g100);color:var(--g600);}
.set{break-before:page;margin:0 0 16pt;padding-top:2mm;}
.set .t{font-size:21pt;font-weight:800;color:var(--g900);letter-spacing:-0.03em;margin-top:4pt;}
.set.first{break-before:auto;margin-top:22pt;}
.problem{display:flex;align-items:flex-end;justify-content:space-between;gap:10pt;margin:24pt 0 10pt;padding-bottom:8pt;border-bottom:1px solid var(--g200);break-after:avoid;}
.problem .t{font-size:13.5pt;font-weight:800;color:var(--g900);letter-spacing:-0.025em;margin-top:2pt;}
.passage{background:var(--g50);border-radius:14px;padding:11pt 15pt 5pt;margin:8pt 0;break-inside:avoid;}
.passage-head{display:flex;align-items:center;gap:6pt;margin-bottom:5pt;}
.passage-label{font-weight:800;color:var(--blue);font-size:10.5pt;}
.tag{font-size:7.2pt;font-weight:600;color:var(--g600);background:#fff;border:1px solid var(--g200);border-radius:6px;padding:1.5pt 5pt;}
.passage .caption{font-weight:600;color:var(--g900);}
.passage .tbl{margin:6pt 0 10pt;}
.question{display:grid;grid-template-columns:30pt 1fr;gap:4pt;border:1.5px solid var(--g200);border-radius:14px;padding:12pt 15pt;margin:10pt 0;break-inside:avoid;}
.question .qn{color:var(--blue);font-weight:800;font-size:11pt;line-height:1.5;}
.question .qt{color:var(--g900);font-weight:500;}
.question .qm{margin-top:6pt;display:flex;gap:4pt;}
.subq{display:flex;align-items:center;gap:7pt;margin:22pt 0 8pt;break-after:avoid;}
.subq .qn{background:var(--blue);color:#fff;border-radius:7px;padding:2.5pt 7pt;font-weight:700;font-size:9pt;}
.subq .t{font-weight:700;font-size:11.5pt;color:var(--g900);letter-spacing:-0.02em;}
.card{border-radius:14px;padding:11pt 15pt;margin:8pt 0;break-inside:avoid;}
.card .lb{display:block;font-weight:700;font-size:8.3pt;margin-bottom:3pt;}
.card p{margin:0;}
.answer{background:var(--blue50);} .answer .lb{color:var(--blue600);} .answer p{color:#23364F;}
.deduct{background:#FFF6EC;} .deduct .lb{color:#E57A00;} .deduct p{color:#5A4632;}
.src-label{font-weight:700;font-size:8.5pt;color:var(--g700);margin:12pt 0 2pt;}
ul.sources{list-style:none;padding:0;margin:4pt 0 12pt;font-size:8pt;color:var(--g700);}
ul.sources li{padding:5pt 0;margin:0;border-bottom:1px solid var(--g100);line-height:1.5;}
ul.sources a{font-size:7.2pt;color:var(--g500);}
/* cover & summary */
.cover{height:258mm;display:flex;flex-direction:column;}
.cover-badge{display:inline-flex;align-items:center;gap:6pt;font-weight:700;font-size:9.5pt;color:var(--g700);}
.cover-badge i{display:inline-block;width:18pt;height:18pt;border-radius:6pt;background:var(--blue);}
.cover-title{font-size:36pt;font-weight:800;color:var(--g900);letter-spacing:-0.045em;line-height:1.22;margin:34mm 0 10pt;}
.cover-title .b{color:var(--blue);}
.cover-sub{font-size:12pt;color:var(--g600);margin:0 0 10mm;}
.toc{margin-top:auto;}
.toc-h{font-size:9pt;font-weight:700;color:var(--g500);margin-bottom:4pt;}
.toc-row{display:flex;align-items:center;gap:12pt;padding:11pt 2pt;border-top:1px solid var(--g100);}
.toc-row .n{width:22pt;color:var(--blue);font-weight:800;font-size:11pt;}
.toc-row .t{font-weight:700;color:var(--g900);font-size:11.5pt;}
.toc-row .d{color:var(--g600);font-size:8.6pt;margin-top:1pt;}
.toc-row .p{margin-left:auto;color:var(--g500);font-weight:600;font-size:10pt;}
.cover-foot{margin-top:10mm;font-size:8pt;color:var(--g500);}
.facts{margin:6pt 0 16pt;}
.fact{display:grid;grid-template-columns:26pt 1fr;gap:8pt;padding:11pt 0;border-bottom:1px solid var(--g100);break-inside:avoid;}
.fact .n{width:20pt;height:20pt;border-radius:10pt;background:var(--blue50);color:var(--blue600);font-weight:800;font-size:9pt;display:flex;align-items:center;justify-content:center;}
.fact .x{color:var(--g800);font-size:10pt;line-height:1.65;}
`;

// Runs inside the page: turns plain Markdown HTML into Toss-style components.
const TRANSFORM = String.raw`(() => {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const pill = (t, tone) => el('span', 'pill ' + tone, t);
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const startsWithStrong = (p, re) => p && p.tagName === 'P' && p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.tagName === 'STRONG' && re.test(p.firstChild.textContent.trim());
  const LABEL = /^\((가|나|다|라|마|바)\)$/, QNO = /^\d-\d\.$/;
  const boundary = n => !n || /^(H1|H2|H3|H4|HR)$/.test(n.tagName) || startsWithStrong(n, LABEL) || startsWithStrong(n, QNO);

  document.querySelectorAll('section.doc').forEach(sec => {
    const part = sec.dataset.part;
    // passages (가)(나)... -> cards
    [...sec.querySelectorAll('p')].filter(p => startsWithStrong(p, LABEL)).forEach(p => {
      const card = el('div', 'passage'), head = el('div', 'passage-head');
      head.append(el('span', 'passage-label', esc(p.firstChild.textContent.trim())));
      p.firstChild.remove();
      while (p.firstChild && ((p.firstChild.nodeType === 3 && !p.firstChild.nodeValue.trim()) || (p.firstChild.nodeType === 1 && p.firstChild.tagName === 'CODE'))) {
        const n = p.firstChild; n.remove();
        if (n.nodeType === 1) head.append(el('span', 'tag', esc(n.textContent.replace(/[\[\]]/g, ''))));
      }
      if (p.firstChild && p.firstChild.nodeType === 3) p.firstChild.nodeValue = p.firstChild.nodeValue.replace(/^\s+/, '');
      p.before(card); card.append(head);
      let next = p.nextElementSibling;
      if (p.textContent.trim()) { card.append(p); if (p.textContent.trim().length < 80 && next && /^(TABLE|UL)$/.test(next.tagName)) p.className = 'caption'; } else p.remove();
      while (next && !boundary(next)) { const n2 = next.nextElementSibling; card.append(next); next = n2; }
    });
    // questions 1-1. ... (150자 내외) [12점]
    [...sec.querySelectorAll('p')].filter(p => startsWithStrong(p, QNO)).forEach(p => {
      const no = p.firstChild.textContent.trim().replace(/\.$/, ''); p.firstChild.remove();
      let text = p.textContent.trim(), len = '', pts = '';
      const m = text.match(/\s*\((\d[\d,]*자 내외)\)\s*\[(\d+)점\]\s*$/);
      if (m) { len = m[1]; pts = m[2]; text = text.slice(0, m.index); }
      const q = el('div', 'question'); q.append(el('div', 'qn', no));
      const body = el('div'); body.append(el('div', 'qt', esc(text)));
      const meta = el('div', 'qm'); if (len) meta.append(pill(len, 'grey')); if (pts) meta.append(pill(pts + '점', 'blue'));
      if (len || pts) body.append(meta); q.append(body); p.replaceWith(q);
    });
    // headings
    let firstSet = true;
    sec.querySelectorAll('h2, h3, h4').forEach(h => {
      const t = h.textContent.trim(); let m;
      if (h.tagName === 'H2' && (m = t.match(/^모의논술 (\d)회\s*:\s*(.+)$/))) {
        const d = el('div', 'set' + (firstSet ? ' first' : '')); firstSet = false;
        d.append(el('div', 'eyebrow', '모의논술 ' + m[1] + '회'), el('div', 't', esc(m[2]))); h.replaceWith(d);
      } else if (h.tagName === 'H3' && (m = t.match(/^\[문제 (\d)\]\s*(.+?)\s*\((\d+)점\)$/))) {
        const d = el('div', 'problem'), l = el('div');
        l.append(el('div', 'eyebrow', '문제 ' + m[1]), el('div', 't', esc(m[2])));
        d.append(l, pill(m[3] + '점', 'blue')); h.replaceWith(d);
      } else if (h.tagName === 'H3' && (m = t.match(/^모의논술 (\d)회$/))) {
        const d = el('div', 'set' + (firstSet ? ' first' : '')); firstSet = false;
        d.append(el('div', 'eyebrow', '채점표'), el('div', 't', '모의논술 ' + m[1] + '회')); h.replaceWith(d);
      } else if (h.tagName === 'H4' && (m = t.match(/^(\d-\d)\s*\((\d+)점\)\s*(.+)$/))) {
        const d = el('div', 'subq'); d.append(el('span', 'qn', m[1]), el('span', 't', esc(m[3])), pill(m[2] + '점', 'blue')); h.replaceWith(d);
      } else if (h.tagName === 'H2' && (m = t.match(/^(\d+)\.\s*(.+)$/))) {
        h.innerHTML = '<span class="no">' + m[1].padStart(2, '0') + '</span>' + esc(m[2]);
      } else if (h.tagName === 'H3' && (m = t.match(/^(\d+\.\d+)\s+(.+)$/))) {
        h.innerHTML = '<span class="no">' + m[1] + '</span>' + esc(m[2]);
      }
    });
    // answer / deduction cards
    sec.querySelectorAll('p').forEach(p => {
      const t = p.textContent.trim();
      for (const [lb, cls] of [['답안 요지:', 'answer'], ['감점 포인트:', 'deduct']]) {
        if (t.startsWith(lb)) {
          const c = el('div', 'card ' + cls); c.append(el('span', 'lb', lb.replace(':', '')), el('p', '', esc(t.slice(lb.length).trim()))); p.replaceWith(c);
        }
      }
    });
    // sources sections
    sec.querySelectorAll('h2').forEach(h => {
      if (!h.textContent.includes('출처')) return;
      let n = h.nextElementSibling;
      while (n && n.tagName !== 'H2') { if (n.tagName === 'UL') n.classList.add('sources'); if (n.tagName === 'P') n.classList.add('src-label'); n = n.nextElementSibling; }
    });
    sec.querySelectorAll('blockquote').forEach(b => { const c = el('div', 'callout'); c.innerHTML = b.innerHTML; b.replaceWith(c); });
  });
  // tables
  const TONE = { '안정': 'green', '적정': 'blue', '소신': 'orange', '도전': 'red', '어려움': 'grey' };
  document.querySelectorAll('table').forEach(t => {
    const w = el('div', 'tbl'); t.replaceWith(w); w.append(t);
    const tds = [...t.querySelectorAll('td')];
    if (tds.length && tds.filter(td => !td.textContent.trim()).length / tds.length > 0.3) w.classList.add('fill');
    tds.forEach(td => { const k = td.textContent.trim(); if (TONE[k]) { td.textContent = ''; td.append(pill(k, TONE[k])); } });
  });
  // ❓ -> pill
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const hits = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('❓')) hits.push(walker.currentNode);
  hits.forEach(n => { const f = document.createDocumentFragment(); n.nodeValue.split('❓').forEach((s, i, a) => { if (s) f.append(s); if (i < a.length - 1) f.append(pill('확인 필요', 'warn')); }); n.replaceWith(f); });
  document.querySelectorAll('code').forEach(c => { if (c.querySelector('.pill') && c.textContent.trim() === '확인 필요') c.replaceWith(c.querySelector('.pill')); });
})();`;

const mdHtml = md => marked.parse(md.replace(/\[([^\]]+)\]\(\.\/[^)]*\)/g, '$1'), { gfm: true });

function chapter(doc) {
  const md = fs.readFileSync(path.join(SRC, doc.file), 'utf8').replace(/^# .*\n/, '');
  const stats = doc.stats.map(([v, k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  const title = fs.readFileSync(path.join(SRC, doc.file), 'utf8').match(/^# (?:\d+\.\s*)?(.*)$/m)[1];
  return `<section class="doc chapter" data-part="${doc.no}"><div class="ch-head"><div class="eyebrow">PART ${doc.no}</div>
    <h1 class="ch-title">${title}</h1><p class="ch-desc">${doc.desc}</p></div><div class="stats">${stats}</div>${mdHtml(md)}</section>`;
}

function summary() {
  const md = fs.readFileSync(path.join(SRC, 'README.md'), 'utf8');
  const facts = md.split('## 꼭 알아야 할 사실')[1].split('\n## ')[0].split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s/, ''));
  const limit = md.split('## 자료의 한계')[1].trim();
  return `<section class="doc chapter" data-part="00"><div class="ch-head"><div class="eyebrow">SUMMARY</div>
    <h1 class="ch-title">먼저 알아야 할 ${facts.length}가지</h1><p class="ch-desc">자료 전체에서 가장 중요한 사실만 모았습니다</p></div>
    <div class="facts">${facts.map((f, i) => `<div class="fact"><div class="n">${i + 1}</div><div class="x">${marked.parseInline(f)}</div></div>`).join('')}</div>
    <h2>자료의 한계</h2><div class="callout">${marked.parse(limit)}</div></section>`;
}

function cover(pages) {
  const rows = [['00', '핵심 요약', '먼저 알아야 할 사실 7가지', pages.SUMMARY],
    ...DOCS.map(d => [d.no, d.short, d.desc, pages['PART ' + d.no]])];
  return `<div class="cover"><div class="cover-badge"><i></i>2027학년도 입시 대비</div>
    <div class="cover-title">부산대 경영학과<br><span class="b">입시 대비 자료</span></div>
    <p class="cover-sub">인문논술 기출 분석부터 모의논술, 채점 기준, 정시 합격선까지</p>
    <div class="stats"><div class="stat"><div class="v">18명</div><div class="k">2027 논술 경영학과 모집</div></div>
    <div class="stat"><div class="v">80%</div><div class="k">2027 논술 반영 비율</div></div>
    <div class="stat"><div class="v">합 4</div><div class="k">경영학과 논술 수능최저</div></div>
    <div class="stat"><div class="v">84~85</div><div class="k">정시 70% 컷 (백분위)</div></div></div>
    <div class="toc"><div class="toc-h">목차</div>${rows.map(([n, t, d, p]) => `<div class="toc-row"><div class="n">${n}</div><div><div class="t">${t}</div><div class="d">${d}</div></div><div class="p">${p || ''}</div></div>`).join('')}</div>
    <div class="cover-foot">작성일 2026.09.27 · 공개 자료와 보도를 교차 확인해 정리했습니다. '확인 필요' 표시는 입학처 원문으로 확인해야 하는 항목입니다.</div></div>`;
}

const page = body => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}<script>${TRANSFORM}</script></body></html>`;
const footer = label => `<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-family:Pretendard,sans-serif;font-size:7.5pt;color:#8B95A1;-webkit-print-color-adjust:exact;"><span>${label}</span><span class="pageNumber"></span></div>`;

async function pdf(browser, html, out, label) {
  const p = await browser.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: !!label,
    headerTemplate: '<div></div>', footerTemplate: label ? footer(label) : '<div></div>',
    margin: { top: '16mm', bottom: '18mm', left: '18mm', right: '18mm' } });
  await p.close();
}

module.exports = { DOCS, TRANSFORM, mdHtml, chapter, summary };

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const d of DOCS) {
    const out = path.join(OUT, d.file.replace(/\.md$/, '.pdf'));
    await pdf(browser, page(chapter(d)), out, `${BRAND} · ${d.no} ${d.short}`);
    console.log('wrote', path.basename(out));
  }
  const body = path.join(TMP, 'body.pdf'), cov = path.join(TMP, 'cover.pdf');
  await pdf(browser, page(summary() + DOCS.map(chapter).join('')), body, BRAND);
  const pages = JSON.parse(execFileSync('python3', [path.join(__dirname, 'pdfpost.py'), 'pages', body]).toString());
  await pdf(browser, page(cover(pages)), cov, null);
  await browser.close();
  execFileSync('python3', [path.join(__dirname, 'pdfpost.py'), 'merge', cov, body, path.join(OUT, COMBINED), JSON.stringify(pages)]);
  console.log('wrote', COMBINED, JSON.stringify(pages));
})().catch(e => { console.error(e); process.exit(1); });
