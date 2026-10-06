import './studio.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { HeroScene } from './hero';

gsap.registerPlugin(ScrollTrigger, SplitText);

const motion = matchMedia('(prefers-reduced-motion: no-preference)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];

let hero: HeroScene | null = null;
try {
  hero = new HeroScene($<HTMLCanvasElement>('#gl'), motion);
} catch {
  // No WebGL: the CSS glow behind the hero is enough.
}

startClock();
buildDecor();
if (finePointer) {
  setupCursor();
  setupMagnetic();
  setupSpotlight();
}

// SplitText measures lines, so wait for the web fonts (but not forever).
document.body.classList.toggle('is-loading', motion);
Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
  if (motion) {
    intro();
    setupScroll();
  } else {
    $('.loader').remove();
    $$('[data-count]').forEach((el) => (el.textContent = el.dataset.count!));
    setupMarquee();
  }
});

function startClock(): void {
  const el = $('#clock');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tick = () => (el.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 1000);
}

/** Fills in the repeated bits of markup: waveform bars and marquee copies. */
function buildDecor(): void {
  const wave = $('.wave');
  for (let i = 0; i < 28; i++) {
    const bar = document.createElement('span');
    bar.style.animationDelay = `${(-Math.random() * 1.1).toFixed(2)}s`;
    bar.style.animationDuration = `${(0.8 + Math.random() * 0.8).toFixed(2)}s`;
    wave.append(bar);
  }
  const track = $('.marquee-track');
  const group = $('.marquee-group');
  for (let i = 0; i < 3; i++) {
    const copy = group.cloneNode(true) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    track.append(copy);
  }
}

function intro(): void {
  const title = new SplitText('[data-hero-title]', { type: 'lines', mask: 'lines', linesClass: 'split-line' });
  const counter = { v: 0 };
  const num = $('#loader-num');

  gsap.set(title.lines, { yPercent: 110 });
  gsap.set(['.hero-meta', '.hero-bottom', '.nav'], { opacity: 0, y: 16 });

  gsap
    .timeline({ defaults: { ease: 'expo.out' } })
    .to(counter, {
      v: 100,
      duration: 1.3,
      ease: 'power2.inOut',
      onUpdate: () => (num.textContent = String(Math.round(counter.v)).padStart(3, '0')),
    })
    .to('.loader', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '+=0.1')
    .add(() => {
      document.body.classList.remove('is-loading');
      $('.loader').remove();
    })
    .to(title.lines, { yPercent: 0, duration: 1.4, stagger: 0.09 }, '-=0.55')
    .to(['.hero-meta', '.nav', '.hero-bottom'], { opacity: 1, y: 0, duration: 1, stagger: 0.08 }, '<0.2');
}

function setupScroll(): void {
  // Hero: the blob swells and drifts up while the copy fades away.
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => hero?.setProgress(self.progress),
  });
  gsap.to('.hero-inner', {
    yPercent: -18,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  setupMarquee();

  // Manifesto: words light up as they scroll past.
  const manifesto = new SplitText('[data-manifesto]', { type: 'words' });
  gsap.fromTo(
    manifesto.words,
    { opacity: 0.14 },
    {
      opacity: 1,
      stagger: 0.1,
      ease: 'none',
      scrollTrigger: { trigger: '[data-manifesto]', start: 'top 75%', end: 'bottom 45%', scrub: true },
    },
  );

  // Section titles rise out of a mask.
  for (const el of $$('[data-reveal]')) {
    const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 1.2,
      stagger: 0.1,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  }

  const mm = gsap.matchMedia();

  // Work: vertical scroll drives a horizontal track on wide screens.
  mm.add('(min-width: 900px)', () => {
    const track = $('.work-track');
    const distance = () => track.scrollWidth - innerWidth;
    const scroller = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.work',
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
      },
    });
    gsap.to('.work-progress span', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.work', start: 'top top', end: () => `+=${distance()}`, scrub: true },
    });
    for (const img of $$('.work-media img')) {
      gsap.fromTo(
        img,
        { xPercent: -6 },
        {
          xPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: img.closest('.work-card'), containerAnimation: scroller, start: 'left right', end: 'right left', scrub: true },
        },
      );
    }
  });

  mm.add('(max-width: 899px)', () => {
    gsap.from('.work-card', {
      y: 60,
      opacity: 0,
      duration: 1,
      ease: 'expo.out',
      stagger: 0.1,
      scrollTrigger: { trigger: '.work-card', start: 'top 85%' },
    });
  });

  // Bento: cards rise in batches, numbers count up.
  gsap.set('.bento-card', { y: 70, opacity: 0 });
  ScrollTrigger.batch('.bento-card', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.08 }),
  });
  for (const el of $$('[data-count]')) {
    const target = Number(el.dataset.count);
    const value = { v: 0 };
    gsap.to(value, {
      v: target,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => (el.textContent = String(Math.round(value.v))),
    });
  }

  // Process: each card shrinks back as the next one stacks on top of it.
  const steps = $$('.step');
  steps.forEach((step, i) => {
    const next = steps[i + 1];
    if (!next) return;
    gsap.to(step, {
      scale: 0.9 + i * 0.015,
      filter: 'brightness(0.7)',
      ease: 'none',
      scrollTrigger: { trigger: next, start: 'top 70%', end: 'top 20%', scrub: true },
    });
  });

  // CTA: letters fall into place.
  const cta = new SplitText('[data-cta]', { type: 'chars,words', mask: 'chars' });
  gsap.from(cta.chars, {
    yPercent: 100,
    duration: 1.1,
    ease: 'expo.out',
    stagger: 0.025,
    scrollTrigger: { trigger: '[data-cta]', start: 'top 80%' },
  });
}

/** Infinite ticker that speeds up with scroll velocity. */
function setupMarquee(): void {
  const tween = gsap.to('.marquee-track', { xPercent: -25, duration: 18, ease: 'none', repeat: -1 });
  if (!motion) {
    tween.pause();
    return;
  }
  let boost: gsap.core.Timeline | null = null;
  ScrollTrigger.create({
    onUpdate: (self) => {
      const extra = Math.min(Math.abs(self.getVelocity()) / 250, 6);
      boost?.kill();
      boost = gsap
        .timeline()
        .to(tween, { timeScale: 1 + extra, duration: 0.2 })
        .to(tween, { timeScale: 1, duration: 1.2, ease: 'power2.out' });
    },
  });
}

function setupCursor(): void {
  const cursor = $('.cursor');
  const label = $('.cursor-label');
  const x = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
  const y = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('pointermove', (e) => {
    x(e.clientX);
    y(e.clientY);
    cursor.style.opacity = '1';
  });
  document.addEventListener('pointerleave', () => (cursor.style.opacity = '0'));
  document.addEventListener('pointerover', (e) => {
    const target = e.target as Element;
    const labelled = target.closest<HTMLElement>('[data-cursor]');
    cursor.classList.toggle('has-label', !!labelled);
    cursor.classList.toggle('is-link', !labelled && !!target.closest('a, button'));
    label.textContent = labelled?.dataset.cursor ?? '';
  });
}

/** Buttons lean towards the pointer and spring back when it leaves. */
function setupMagnetic(): void {
  for (const el of $$('.magnetic')) {
    const inner = el.querySelector('span');
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      x(dx * 0.35);
      y(dy * 0.35);
      if (inner) gsap.to(inner, { x: dx * 0.15, y: dy * 0.15, duration: 0.6, ease: 'power3' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
      if (inner) gsap.to(inner, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
    });
  }
}

function setupSpotlight(): void {
  for (const el of $$('.spot')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}
