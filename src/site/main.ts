import './style.css';
import { Story, type Scene } from './story';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add('is-loading');

/**
 * The film, in scroll order. Frames live in public/site/seq/<name>/ and were cut
 * from Higgsfield clips (see README). Progress values are fractions of the pinned story.
 */
const SCENES: Scene[] = [
  { name: 'stack', frames: 101, from: 0.03, to: 0.24, fade: 0, theme: 'light', focus: [0.5, 0.5], narrowScale: 0.6 },
  { name: 'smash', frames: 97, from: 0.29, to: 0.5, fade: 0.05, theme: 'dark', focus: [0.64, 0.6] },
  { name: 'combo', frames: 97, from: 0.54, to: 0.8, fade: 0.04, theme: 'dark', focus: [0.3, 0.7] },
  { name: 'finale', frames: 97, from: 0.85, to: 1, fade: 0.04, theme: 'dark', focus: [0.45, 0.55] },
];

/** Callouts on the exploded burger, in the stack clip's image coordinates (first frame). */
const TAGS: { text: string; x: number; y: number }[] = [
  { text: 'Butter-Toasted Brioche', x: 0.625, y: 0.118 },
  { text: 'KO Sauce', x: 0.611, y: 0.256 },
  { text: 'Caramelized Onions', x: 0.617, y: 0.345 },
  { text: 'American, Melted', x: 0.632, y: 0.468 },
  { text: 'Smashed Chuck ×2', x: 0.63, y: 0.612 },
  { text: 'Crinkle Pickles', x: 0.6, y: 0.734 },
  { text: 'Toasted Heel', x: 0.618, y: 0.838 },
];

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
  const story = new Story($<HTMLCanvasElement>('[data-canvas]'), SCENES);
  // The opening clip must be complete before the curtain lifts; the rest stream in behind it.
  await Promise.all([
    story.load(0, (f) => (loadTarget = f * 0.9)),
    Promise.race([document.fonts.load('80px Anton'), new Promise((r) => setTimeout(r, 4000))]),
  ]);
  loadTarget = 1;
  await new Promise<void>((resolve) => {
    const wait = () => (shown > 0.995 ? resolve() : requestAnimationFrame(wait));
    wait();
  });
  countEl.textContent = '100';
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-loaded');
  setupStory(story);
  for (let i = 1; i < SCENES.length; i++) await story.load(i);
}

// ------------------------------------------------------------------- story

function setupStory(story: Story): void {
  const section = $('[data-story]');
  const chapters = $$('.chapter').map((el) => ({
    el,
    from: Number(el.dataset.from),
    to: Number(el.dataset.to),
  }));
  const roundEl = $('[data-round]');
  const roundBar = $('[data-round-bar]');
  const scrim = $('[data-scrim]');
  const tagLayer = $('[data-tags]');
  const tags = TAGS.map((t) => {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `<span class="tag__line"></span><span class="tag__dot"></span><span class="tag__text">${t.text}</span>`;
    tagLayer.appendChild(el);
    return { ...t, el };
  });

  const target = () => {
    const r = section.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
  };

  let inStory = true;
  let storyDark = false;
  let progress = target();
  let goal = progress;
  let last = performance.now();

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    progress += (goal - progress) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 8));
    if (Math.abs(goal - progress) < 1e-4) progress = goal;
    story.render(progress);

    const scene = story.sceneAt(progress);
    storyDark = SCENES[scene].theme === 'dark' && progress > SCENES[scene].from - SCENES[scene].fade / 2;

    let round = 0;
    let side = '';
    chapters.forEach((c, i) => {
      const on = progress >= c.from && progress < c.to;
      c.el.classList.toggle('is-active', on);
      const cl = c.el.classList;
      const topOnPhone = cl.contains('chapter--top-m') && window.innerWidth <= 700;
      if (on) side = topOnPhone || cl.contains('chapter--center') ? 'center' : cl.contains('chapter--right') ? 'right' : 'left';
      if (progress >= c.from - 0.02) round = i;
    });
    roundEl.textContent = String(round + 1).padStart(2, '0');
    roundBar.style.setProperty('--p', progress.toFixed(4));
    scrim.dataset.side = storyDark ? side : '';
    if (inStory) document.body.dataset.ui = storyDark ? 'dark' : 'light';

    // Callouts ride on the first clip and leave as soon as the layers start to fall.
    const vis = Math.min(1, Math.max(0, (0.045 - progress) / 0.025));
    tagLayer.style.opacity = String(vis);
    if (vis > 0) {
      const c = story.cover(0, progress);
      const narrow = window.innerWidth < 700;
      const colX = Math.min(
        c.dx + Math.max(...tags.map((t) => t.x)) * c.dw + (narrow ? 18 : 56),
        window.innerWidth - (narrow ? 112 : 230),
      );
      for (const t of tags) {
        const x = c.dx + t.x * c.dw;
        const y = c.dy + t.y * c.dh;
        t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        t.el.style.setProperty('--len', `${Math.max(8, colX - x).toFixed(1)}px`);
      }
    }
  };
  requestAnimationFrame(frame);

  const themed = $$('[data-theme]');
  const onScroll = () => {
    goal = target();
    const sr = section.getBoundingClientRect();
    inStory = sr.bottom > 40;
    document.body.classList.toggle('nav-solid', !inStory);
    if (inStory) return;
    const hit = themed.find((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= 40 && r.bottom > 40;
    });
    document.body.dataset.ui = hit?.dataset.theme ?? 'light';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function setupMenuImages(): void {
  for (const img of $$<HTMLImageElement>('.card__media img')) {
    const ready = () => img.classList.add('is-ready');
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });
  }
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
setupMenuImages();
setupManifesto();
setupCountUps();
setupOrder();
setupCursor();
setupFooter();
boot().catch((err) => {
  console.error(err);
  // Never trap the visitor behind the loader.
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-loaded');
});
