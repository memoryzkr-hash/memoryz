// 영상에 쓰는 예시 그림. 직접 그린 그림이라 저작권 걱정이 없다.
// 이름표마다 <g id="{id}-l{i}"> 안에 강조 칸(.hl), 글자, 가림막(.mk)이 들어 있다.

const CELL_LABELS = [
  { n: "핵", p: [256, 128], e: [110, 92], box: [46, 72, 64, 40] },
  { n: "세포벽", p: [181, 220], e: [110, 220], box: [14, 200, 96, 40] },
  { n: "엽록체", p: [410, 98], e: [510, 70], box: [510, 50, 96, 40] },
  { n: "액포", p: [395, 200], e: [510, 180], box: [510, 160, 72, 40] },
  { n: "미토콘드리아", p: [440, 320], e: [486, 350], box: [486, 330, 168, 40] },
];

const HEART_LABELS = [
  { n: "대동맥", p: [160, 30], e: [64, 22], box: [10, 12, 54, 22] },
  { n: "좌심방", p: [196, 84], e: [258, 72], box: [258, 61, 54, 22] },
  { n: "좌심실", p: [186, 150], e: [258, 160], box: [258, 149, 54, 22] },
];

function labelMarkup(id, labels, font) {
  return labels
    .map((l, i) => {
      const [x, y, w, h] = l.box;
      return `
      <line x1="${l.p[0]}" y1="${l.p[1]}" x2="${l.e[0]}" y2="${l.e[1]}" stroke="#55575E" stroke-width="${font > 20 ? 2 : 1.2}"/>
      <g id="${id}-l${i}">
        <rect class="hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 4}" fill="#EFEEFD" stroke="#3D33D8" stroke-width="${font > 20 ? 2.5 : 1.5}" opacity="0"/>
        <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central"
          font-size="${font}" font-weight="600" fill="#0A0A0A">${l.n}</text>
        <rect class="mk" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 5}" fill="#0A0A0A"
          style="transform-box: fill-box; transform-origin: left center; transform: scaleX(0)"/>
      </g>`;
    })
    .join("");
}

export function cellSVG(id) {
  return `<svg viewBox="0 0 660 400" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard">
    <rect x="180" y="40" width="300" height="320" rx="36" fill="#F1F7EC" stroke="#5E9A3A" stroke-width="10"/>
    <rect x="194" y="54" width="272" height="292" rx="26" fill="none" stroke="#A9CF8F" stroke-width="3"/>
    <ellipse cx="348" cy="215" rx="92" ry="70" fill="#DCEBF6" stroke="#6FA3C8" stroke-width="3"/>
    <circle cx="256" cy="128" r="40" fill="#EADCF2" stroke="#9C6BC0" stroke-width="3"/>
    <circle cx="256" cy="128" r="14" fill="#9C6BC0"/>
    <ellipse cx="390" cy="98" rx="34" ry="17" fill="#7CC25B" stroke="#4E8F34" stroke-width="2.5"/>
    <ellipse cx="240" cy="300" rx="32" ry="16" fill="#7CC25B" stroke="#4E8F34" stroke-width="2.5"/>
    <ellipse cx="428" cy="318" rx="26" ry="12" fill="#F2B36B" stroke="#D18A3D" stroke-width="2.5"/>
    ${labelMarkup(id, CELL_LABELS, 24)}
  </svg>`;
}

export function heartSVG(id) {
  return `<svg viewBox="0 0 320 220" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard">
    <rect x="148" y="14" width="24" height="44" rx="4" fill="#E07A6E" stroke="#C0504D" stroke-width="2"/>
    <path d="M160 206 C 52 142, 64 40, 128 50 C 144 52, 154 60, 160 74 C 166 60, 176 52, 192 50 C 256 40, 268 142, 160 206 Z"
      fill="#F4D3D3" stroke="#C0504D" stroke-width="3"/>
    <line x1="160" y1="78" x2="160" y2="196" stroke="#C0504D" stroke-width="2"/>
    <line x1="96" y1="118" x2="224" y2="118" stroke="#C0504D" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${labelMarkup(id, HEART_LABELS, 14)}
  </svg>`;
}

// 이름표 상태 바꾸기: mask 0~1(가림막이 덮인 정도), reveal 0~1(정답 강조)
export function setLabel(root, id, i, mask, reveal = 0) {
  const g = root.querySelector(`#${id}-l${i}`);
  if (!g) return;
  g.querySelector(".mk").style.transform = `scaleX(${mask})`;
  g.querySelector(".hl").setAttribute("opacity", reveal);
  g.querySelector("text").setAttribute("fill", reveal > 0.5 ? "#3D33D8" : "#0A0A0A");
}

export const CELL_COUNT = CELL_LABELS.length;
export const HEART_COUNT = HEART_LABELS.length;
export const CELL_BOXES = CELL_LABELS.map((l) => l.box);
