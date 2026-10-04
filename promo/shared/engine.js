// 시간(초)만 넣으면 그 순간의 화면이 정해지는 작은 재생기.
// 브라우저에서 열면 반복 재생하고, ?render 를 붙이면 멈춘 채 window.seek(t) 로 한 프레임씩 그린다.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ease = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
// a초에서 b초 사이에 0 → 1
export const prog = (t, a, b, fn = ease) => fn((t - a) / (b - a));
// a초에 나타나서 b초에 사라짐 (d초 동안 페이드)
export const win = (t, a, b, d = 0.25) => Math.min(prog(t, a, a + d), 1 - prog(t, b - d, b));
export const lerp = (a, b, p) => a + (b - a) * p;
export const expoOut = (x) => (x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.pow(2, -10 * x));
export const backOut = (x, s = 1.9) => {
  x = clamp(x) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
// 128BPM: 15초 = 32박 = 8마디
export const BEAT = 60 / 128;
export const b = (n) => n * BEAT;

// 줄 단위로 아래에서 밀려 올라오는 글자. el 안의 첫 자식이 움직인다.
export function rise(el, t, at, dur = 0.45, from = 105) {
  const p = expoOut((t - at) / dur);
  el.firstElementChild.style.transform = `translateY(${lerp(from, 0, p)}%)`;
  el.style.visibility = t < at ? "hidden" : "visible";
}

// 쾅 하고 닿은 뒤 짧게 흔들림
export function shake(t, hits, amp = 10, dur = 0.18) {
  let x = 0, y = 0;
  for (const at of hits) {
    const p = (t - at) / dur;
    if (p < 0 || p > 1) continue;
    const a = amp * (1 - p) * (1 - p);
    x += a * Math.sin(p * 47);
    y += a * Math.cos(p * 39);
  }
  return [x, y];
}

// 화면 전체를 덮었다가 걷히는 막대들. mid초에 다 덮이고 그때 장면이 바뀐다.
export function bars(els, t, mid, { cover = 0.24, uncover = 0.24, stagger = 0.022, dir = 1 } = {}) {
  const n = els.length;
  els.forEach((el, i) => {
    const d = i * stagger;
    const a = mid - cover + d * 0.5;
    let s = 0, origin = dir > 0 ? "left" : "right";
    if (t >= a && t < mid) s = expoOut((t - a) / (cover - d * 0.5));
    else if (t >= mid && t < mid + uncover) {
      s = 1 - expoOut((t - mid - d * 0.5) / (uncover - d * 0.5));
      origin = dir > 0 ? "right" : "left";
    }
    el.style.transformOrigin = origin + " center";
    el.style.transform = `scaleX(${clamp(s)})`;
  });
}

export function set(el, styles) {
  for (const k in styles) el.style[k] = styles[k];
}
// 누른 자리 표시: at초에 x,y 를 누름
export function tap(el, t, at, x, y) {
  const p = (t - at) / 0.4;
  if (p < 0 || p > 1) { el.style.opacity = 0; return; }
  set(el, {
    left: x + "px", top: y + "px",
    opacity: String(p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75),
    transform: `scale(${lerp(0.55, 1, easeOut(p))})`,
  });
}

export function start({ duration, render, init }) {
  const stage = document.getElementById("stage");
  const isRender = new URLSearchParams(location.search).has("render");
  const ready = document.fonts.ready.then(() => init && init());

  window.DURATION = duration;
  window.seek = async (t) => { await ready; render(t); };

  if (isRender) {
    document.body.classList.add("render");
    return;
  }
  const fit = () => {
    const s = Math.min(innerWidth / 1080, innerHeight / 1920);
    stage.style.transform = `scale(${s})`;
    stage.style.margin = `0 ${(innerWidth - 1080 * s) / 2}px`;
    document.body.style.display = "block";
  };
  addEventListener("resize", fit);
  fit();
  ready.then(() => {
    const t0 = performance.now();
    const loop = (now) => {
      render(((now - t0) / 1000) % duration);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
