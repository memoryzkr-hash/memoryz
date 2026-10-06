import { animate, inView, scroll, stagger } from 'motion';
import './landing.css';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scroll progress bar runs even with reduced motion: it tracks position rather than animating on its own.
const progress = document.querySelector<HTMLElement>('.progress');
if (progress) scroll(animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));

if (!reduceMotion) {
  const ease = [0.22, 1, 0.36, 1] as const;

  // Hero entrance: eyebrow, headline lines, copy and buttons rise in sequence.
  animate(
    '[data-hero]',
    { opacity: [0, 1], y: [28, 0], filter: ['blur(8px)', 'blur(0px)'] },
    { duration: 0.9, delay: stagger(0.12, { startDelay: 0.15 }), ease },
  );

  // Hero background drifts and fades as the page scrolls away from it.
  const hero = document.querySelector<HTMLElement>('.hero');
  if (hero) {
    const target = { target: hero, offset: ['start start', 'end start'] as ['start start', 'end start'] };
    scroll(animate('.orb-a', { y: [0, 160], x: [0, 60] }, { ease: 'linear' }), target);
    scroll(animate('.orb-b', { y: [0, 220], x: [0, -40] }, { ease: 'linear' }), target);
    scroll(animate('.hero-inner', { y: [0, 120], opacity: [1, 0] }, { ease: 'linear' }), target);
  }

  // Section reveals: each block lifts in once when a quarter of it is on screen.
  inView(
    '.reveal',
    (el) => {
      const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal')) : [el];
      const index = Math.max(0, siblings.indexOf(el));
      animate(el, { opacity: [0, 1], y: [40, 0], scale: [0.98, 1] }, { duration: 0.8, delay: el.closest('.strip-list') ? index * 0.08 : 0, ease });
    },
    { amount: 0.25 },
  );

  // Screenshot parallax inside each game card.
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((img) => {
    const frame = img.parentElement ?? img;
    scroll(animate(img, { y: ['-8%', '8%'] }, { ease: 'linear' }), { target: frame, offset: ['start end', 'end start'] });
  });

  // Stat counters tick up from zero the first time they appear.
  inView(
    '[data-count]',
    (el) => {
      const end = Number((el as HTMLElement).dataset.count ?? '0');
      animate(0, end, {
        duration: 1.1,
        ease: 'easeOut',
        onUpdate: (v) => {
          el.textContent = String(Math.round(v));
        },
      });
    },
    { amount: 0.6 },
  );
}
