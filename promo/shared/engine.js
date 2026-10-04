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
