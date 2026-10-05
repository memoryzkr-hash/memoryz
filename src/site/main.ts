import './style.css';
import { Stage } from './stage';
import { renderThumbs } from './thumbs';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add('is-loading');

// ------------------------------------------------------------------ loader

const countEl = $('[data-count]');
const loaderEl = $('.loader');
let shown = 0;
let loadTarget = 0;
const loaderStart = performance.now();
function tickLoader(): void {
  // Never faster than the minimum show time, never ahead of real progress.
  const timeCap = Math.min(1, (performance.now() - loaderStart) / 1400);
  shown += (Math.min(loadTarget, timeCap) - shown) * 0.12;
  const pct = Math.round(shown * 100);
  countEl.textContent = String(pct).padStart(2, '0');
  loaderEl.style.setProperty('--p', String(shown));
  if (pct < 100) requestAnimationFrame(tickLoader);
}
requestAnimationFrame(tickLoader);

async function boot(): Promise<void> {
  // Canvas textures print the wordmark in Anton, so wait for the face first.
  await Promise.race([
    Promise.all([document.fonts.load('80px Anton'), document.fonts.load('600 16px "Inter Tight"')]),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
  loadTarget = 0.2;

  const stage = new Stage($<HTMLCanvasElement>('[data-canvas]'), $('[data-tags]'));
  loadTarget = 0.35;

  const cards = $$('[data-thumb]');
  const shots = await renderThumbs(
    cards.map((c) => c.dataset.thumb!),
    (f) => (loadTarget = 0.35 + f * 0.65),
  );
  for (const card of cards) {
    const img = $<HTMLImageElement>('img', card);
    img.addEventListener('load', () => img.classList.add('is-ready'), { once: true });
    img.src = shots[card.dataset.thumb!];
  }

  loadTarget = 1;
  await new Promise<void>((resolve) => {
    const wait = () => (shown > 0.995 ? resolve() : requestAnimationFrame(wait));
    wait();
  });
  countEl.textContent = '100';
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-loaded');
  setupStory(stage);
}

// ------------------------------------------------------------------- story

function setupStory(stage: Stage): void {
  const story = $('[data-story]');
  const chapters = $$('.chapter').map((el) => ({
    el,
    from: Number(el.dataset.from),
    to: Number(el.dataset.to),
  }));
  const roundEl = $('[data-round]');
  const roundBar = $('[data-round-bar]');

  const storyProgress = () => {
    const r = story.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
  };

  const scrim = $('[data-scrim]');
  let inStory = true;
  let storyDark = false;
  stage.onFrame = ({ progress, darkness }) => {
    let round = 0;
    let side = '';
    chapters.forEach((c, i) => {
      const on = progress >= c.from && progress < c.to;
      c.el.classList.toggle('is-active', on);
      if (on) side = c.el.classList.contains('chapter--right') ? 'right' : c.el.classList.contains('chapter--left') ? 'left' : 'center';
      if (progress >= c.from - 0.02) round = i;
    });
    // Darken behind the copy so it reads over the 3D set.
    scrim.dataset.side = darkness > 0.5 ? side : '';
    roundEl.textContent = String(round + 1).padStart(2, '0');
    roundBar.parentElement!.style.setProperty('--p', progress.toFixed(4));
    roundBar.style.setProperty('--p', progress.toFixed(4));
    storyDark = darkness > 0.5;
    if (inStory) document.body.dataset.ui = storyDark ? 'dark' : 'light';
  };

  stage.jump(storyProgress());
  const onScroll = () => {
    stage.setProgress(storyProgress());
    updateTheme();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Only spend GPU time while the pinned scene is on screen.
  new IntersectionObserver(([e]) => (e.isIntersecting ? stage.start() : stage.stop())).observe(story);
  stage.start();

  // Nav colour follows whichever section sits under it.
  const themed = $$('[data-theme]');
  function updateTheme(): void {
    const sr = story.getBoundingClientRect();
    inStory = sr.bottom > 40;
    document.body.classList.toggle('nav-solid', !inStory);
    if (inStory) {
      document.body.dataset.ui = storyDark ? 'dark' : 'light';
      return;
    }
    const hit = themed.find((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= 40 && r.bottom > 40;
    });
    document.body.dataset.ui = hit?.dataset.theme ?? 'light';
  }
  updateTheme();
}

// ------------------------------------------------------------- the rest

function setupReveals(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  $$('.reveal').forEach((el) => {
    const siblings = [...(el.parentElement?.children ?? [])].filter((s) => s.classList.contains('reveal'));
    el.style.setProperty('--d', `${(siblings.indexOf(el) % 3) * 0.08}s`);
    io.observe(el);
  });
}

function setupManifesto(): void {
  const el = $('[data-manifesto]');
  const hot = new Set(['freezers.', 'shortcuts.', 'violence.']);
  const words = el.textContent!.trim().split(/\s+/);
  el.innerHTML = words
    .map((w) => `<span class="w${hot.has(w.toLowerCase()) ? ' w--hot' : ''}">${w}</span>`)
    .join(' ');
  const spans = $$('.w', el);
  const update = () => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const f = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(f * spans.length);
    spans.forEach((s, i) => {
      s.classList.toggle('is-on', i < lit);
      s.classList.toggle('is-hot', i < lit && s.classList.contains('w--hot'));
    });
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function setupCountUps(): void {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const end = Number(el.dataset.countup);
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 1400);
        el.textContent = String(Math.round(end * (1 - Math.pow(1 - t, 4))));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  });
  $$('[data-countup]').forEach((el) => io.observe(el));
}

function setupOrder(): void {
  const toast = $('[data-toast]');
  let count = 0;
  let timer = 0;
  $$('.add').forEach((btn) =>
    btn.addEventListener('click', () => {
      count++;
      const name = $('h3', btn.closest('.card')!).textContent;
      toast.innerHTML = `<b>${count}</b> ${name} 담았어요 — 라운드 준비 완료`;
      toast.classList.add('is-on');
      clearTimeout(timer);
      timer = window.setTimeout(() => toast.classList.remove('is-on'), 2200);
    }),
  );
}

function setupCursor(): void {
  if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
  const dot = $('.cursor');
  let x = 0;
  let y = 0;
  let cx = 0;
  let cy = 0;
  window.addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
    dot.classList.add('is-on');
    const t = e.target as Element;
    dot.classList.toggle('is-big', !!t.closest?.('a, button, .card__media'));
  });
  document.addEventListener('pointerleave', () => dot.classList.remove('is-on'));
  const loop = () => {
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    dot.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(loop);
  };
  loop();
}

function setupFooter(): void {
  const mark = $('.footer__mark');
  const footer = $('.footer');
  const update = () => {
    const r = footer.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (window.innerHeight - r.top) / r.height));
    mark.style.setProperty('--y', `${(1 - f) * 40}%`);
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

setupReveals();
setupManifesto();
setupCountUps();
setupOrder();
setupCursor();
setupFooter();
boot().catch((err) => {
  console.error(err);
  // Never trap the visitor behind the loader if WebGL is unavailable.
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-loaded');
});
