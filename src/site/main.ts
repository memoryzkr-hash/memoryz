import './style.css';
import { Story, type Scene } from './story';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add('is-loading');

/**
 * The film, in scroll order. Frames live in public/site/seq/<name>/ and were cut
 * from Higgsfield clips (see README). Progress values are fractions of the pinned story.
 * Before the first clip plays, its opening frame (the exploded burger) hosts the
 * ingredient tour.
 */
const SCENES: Scene[] = [
  { name: 'stack', frames: 101, from: 0.43, to: 0.56, fade: 0, theme: 'light', focus: [0.5, 0.5], narrowScale: 0.6, seamless: true, still: 'still.webp' },
  { name: 'pack', frames: 101, from: 0.6, to: 0.74, fade: 0, theme: 'light', focus: [0.5, 0.5], narrowScale: 0.6, seamless: true },
  { name: 'close', frames: 101, from: 0.78, to: 0.92, fade: 0, theme: 'light', focus: [0.5, 0.5], narrowScale: 0.6, seamless: true },
];

/**
 * Each layer of the exploded burger, bottom to top (the order it gets built), with
 * where it sits in the stack clip's first frame (x = right edge, y = middle).
 */
const INGREDIENTS = [
  {
    name: 'Toasted Heel',
    ko: '토스티드 힐',
    role: 'The Stance',
    text: '아래 번은 패티 기름에 한 번 더 구워요. 육즙을 다 받아내도 눅눅해지지 않는, 모든 펀치의 단단한 스탠스.',
    meta: ['철판 토스트', '육즙 받침'],
    x: 0.618,
    y: 0.838,
  },
  {
    name: 'Crinkle Pickles',
    ko: '크링클 피클',
    role: 'The Jab',
    text: '주름 잡힌 단면이 소스를 붙잡고, 새콤한 산미가 기름진 맛을 한 번씩 끊어줘요. 리듬을 만드는 가벼운 잽.',
    meta: ['딜 브라인', '산미'],
    x: 0.6,
    y: 0.734,
  },
  {
    name: 'Smashed Chuck ×2',
    ko: '스매시드 척 패티',
    role: 'The Power',
    text: '매일 아침 직접 간 척 블렌드를 260°C 철판에 90초 동안 짓눌러요. 가장자리는 레이스처럼 바삭하게, 속은 육즙 그대로.',
    meta: ['260°C', '90초', '매일 분쇄'],
    x: 0.63,
    y: 0.612,
  },
  {
    name: 'American, Melted',
    ko: '아메리칸 치즈',
    role: 'The Clinch',
    text: '패티의 열로 녹아 흘러내리면서 모든 층을 하나로 붙잡아요. 상대를 놓치지 않는 클린치.',
    meta: ['패티당 1장', '녹여서 접착'],
    x: 0.632,
    y: 0.468,
  },
  {
    name: 'Caramelized Onions',
    ko: '카라멜라이즈드 어니언',
    role: 'The Stamina',
    text: '양파를 12시간 동안 약불에 천천히 볶아 단맛과 깊이를 끌어냈어요. 라운드가 길어질수록 진가가 나오는 체력.',
    meta: ['12시간', '저온 조리'],
    x: 0.617,
    y: 0.345,
  },
  {
    name: 'KO Sauce',
    ko: 'KO 소스',
    role: 'The Finisher',
    text: '스모키 파프리카와 피클 브라인을 섞은 하우스 소스. 한 입마다 마지막 한 방을 얹어요.',
    meta: ['하우스 레시피', '스모키'],
    x: 0.611,
    y: 0.256,
  },
  {
    name: 'Butter-Toasted Brioche',
    ko: '버터 브리오슈',
    role: 'The Belt',
    text: '주문이 들어오면 버터를 발라 바로 구워요. 겉은 반짝이고 속은 폭신하게. 챔피언 벨트처럼 맨 위에 얹어 완성.',
    meta: ['버터 토스트', '매일 입고'],
    x: 0.625,
    y: 0.118,
  },
];

/** Ingredient tour: one step of scroll per layer, between the overview and the build. */
const TOUR_START = 0.05;
const TOUR_STEP = 0.05;
const TOUR_END = TOUR_START + TOUR_STEP * INGREDIENTS.length;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * (3 - 2 * t);

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
  const tagLayer = $('[data-tags]');
  const tags = INGREDIENTS.map((t) => {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `<span class="tag__line"></span><span class="tag__dot"></span><span class="tag__text">${t.name}</span>`;
    tagLayer.appendChild(el);
    return { ...t, el };
  });

  // Ingredient panel.
  const tour = $('[data-tour]');
  const tourNo = $('[data-tour-no]', tour);
  const tourRole = $('[data-tour-role]', tour);
  const tourName = $('[data-tour-name]', tour);
  const tourKo = $('[data-tour-ko]', tour);
  const tourText = $('[data-tour-text]', tour);
  const tourMeta = $('[data-tour-meta]', tour);
  const tourDots = $('[data-tour-dots]', tour);
  tourDots.innerHTML = INGREDIENTS.map(() => '<i></i>').join('');
  let shownIngredient = -1;
  const showIngredient = (i: number) => {
    if (i === shownIngredient) return;
    shownIngredient = i;
    const g = INGREDIENTS[i];
    tour.classList.remove('is-swap');
    void tour.offsetWidth;
    tour.classList.add('is-swap');
    tourNo.textContent = `${String(i + 1).padStart(2, '0')} / ${String(INGREDIENTS.length).padStart(2, '0')}`;
    tourRole.textContent = g.role;
    tourName.textContent = g.name;
    tourKo.textContent = g.ko;
    tourText.textContent = g.text;
    tourMeta.innerHTML = g.meta.map((m) => `<li>${m}</li>`).join('');
    [...tourDots.children].forEach((d, k) => d.classList.toggle('is-on', k <= i));
    tags.forEach((t, k) => t.el.classList.toggle('is-active', k === i));
  };
  showIngredient(0);

  const target = () => {
    const r = section.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
  };

  let inStory = true;
  let progress = target();
  let goal = progress;
  let last = performance.now();

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    progress += (goal - progress) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 8));
    if (Math.abs(goal - progress) < 1e-4) progress = goal;
    const p = progress;
    const narrow = window.innerWidth <= 700;

    // Tour camera: push in on one layer at a time, glide to the next between steps.
    const zoomIn = ease(clamp01((p - (TOUR_START - 0.015)) / 0.025));
    const zoomOut = ease(clamp01((p - (TOUR_END - 0.01)) / 0.03));
    const amount = zoomIn * (1 - zoomOut);
    const t = clamp01((p - TOUR_START) / (TOUR_END - TOUR_START)) * INGREDIENTS.length;
    const idx = Math.min(INGREDIENTS.length - 1, Math.floor(t));
    const next = Math.min(INGREDIENTS.length - 1, idx + 1);
    const glide = ease(clamp01((t - idx - 0.72) / 0.28));
    const fy = INGREDIENTS[idx].y + (INGREDIENTS[next].y - INGREDIENTS[idx].y) * glide;
    if (amount > 0 || narrow) {
      story.setView({
        amount,
        scale: narrow ? 1.75 : 2.1,
        x: 0.5,
        y: fy,
        ax: narrow ? 0.5 : 0.68,
        ay: narrow ? 0.66 : 0.52,
      });
    } else {
      // After the tour, slide the burger right and pull back a touch so the copy has room.
      story.setView({ amount: ease(clamp01((p - (TOUR_END + 0.02)) / 0.04)), scale: 0.86, x: 0.5, y: 0.52, ax: 0.64, ay: 0.53 });
    }
    story.render(p);

    const touring = p >= TOUR_START - 0.005 && p < TOUR_END;
    tour.classList.toggle('is-active', touring);
    if (touring) showIngredient(glide > 0.5 ? next : idx);

    let round = 0;
    chapters.forEach((c, i) => {
      c.el.classList.toggle('is-active', p >= c.from && p < c.to);
      if (p >= c.from - 0.02) round = i;
    });
    roundEl.textContent = String(round + 1).padStart(2, '0');
    roundBar.style.setProperty('--p', p.toFixed(4));
    if (inStory) document.body.dataset.ui = 'light';

    // Callouts: all of them on the overview, gone while the camera is pushed in.
    const vis = clamp01((TOUR_START - 0.005 - p) / 0.02) + clamp01((p - TOUR_END) / 0.015) * clamp01((0.44 - p) / 0.015);
    tagLayer.style.opacity = String(Math.min(1, vis));
    if (vis > 0) {
      const c = story.cover(0, p);
      const colX = Math.min(
        c.dx + Math.max(...tags.map((g) => g.x)) * c.dw + (narrow ? 18 : 56),
        window.innerWidth - (narrow ? 112 : 230),
      );
      for (const g of tags) {
        const x = c.dx + g.x * c.dw;
        const y = c.dy + g.y * c.dh;
        g.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        g.el.style.setProperty('--len', `${Math.max(8, colX - x).toFixed(1)}px`);
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
