/** How a draft will look on each platform, drawn from the draft itself (not a screenshot). */
import { instagramCaption, LIMITS } from '../core/rules';
import { threadsLength } from '../core/text';
import type { Card, Draft, PromoConfig } from '../core/types';
import { renderBlogHtml } from '../platforms/blog';
import { h } from './kit';

/** The agent's card design (src/promo/media/cards.ts), as live HTML that scales with its container. */
export function cardEl(card: Card, index: number, total: number, brand: PromoConfig['brand']): HTMLElement {
  const kind = index === 0 ? 'cover' : index === total - 1 && total > 2 ? 'cta' : 'body';
  const { background, text, accent } = brand.colors;
  const bg = kind === 'body' ? background : accent;
  const fg = kind === 'body' ? text : background;
  const title = h('div', { class: 'c-title' }, card.title);
  if (kind === 'body') title.style.color = accent;
  return h(
    'div',
    { class: `card ${kind}`, role: 'img', 'aria-label': `카드 ${index + 1}: ${card.title} ${card.body}`, style: `background:${bg};color:${fg}` },
    h(
      'div',
      { class: 'card-in' },
      kind === 'body' ? h('div', { class: 'c-page' }, `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`) : h('div', { class: 'c-bar' }),
      title,
      card.body ? h('div', { class: 'c-body' }, card.body) : null,
    ),
    brand.handle ? h('div', { class: 'c-handle' }, brand.handle) : null,
    brand.name ? h('div', { class: 'c-brand' }, brand.name) : null,
  );
}

function avatar(config: PromoConfig): HTMLElement {
  const a = h('div', { class: 'avatar' }, [...config.brand.name][0] ?? '?');
  a.style.background = config.brand.colors.accent;
  a.style.color = config.brand.colors.background;
  return a;
}

const handle = (config: PromoConfig) => config.brand.handle.replace(/^@/, '') || config.brand.name;

export function instagramPreview(draft: Draft, config: PromoConfig): HTMLElement {
  const ig = draft.content.instagram;
  if (!ig) return h('div', { class: 'empty' }, '인스타그램 글이 없어요');
  const slides = ig.cards.map((c, i) =>
    /^https?:\/\//.test(draft.images[i] ?? '') ? h('img', { src: draft.images[i], alt: `카드 ${i + 1}: ${c.title}`, loading: 'lazy' }) : cardEl(c, i, ig.cards.length, config.brand),
  );
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, ...slides.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
  const carousel = h('div', { class: 'carousel', tabindex: '0', 'aria-label': `카드뉴스 ${slides.length}장, 옆으로 넘겨 보기` }, ...slides);
  carousel.addEventListener('scroll', () => {
    const i = Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth));
    [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j));
  });
  const full = instagramCaption(ig.caption, []);
  const short = full.length > 120;
  const text = h('span', null, short ? `${full.slice(0, 110)}… ` : full);
  const more = short
    ? h('button', {
        class: 'more',
        type: 'button',
        onClick: () => {
          text.textContent = full;
          more!.remove();
        },
      }, '더 보기')
    : null;
  const total = [...instagramCaption(ig.caption, ig.hashtags)].length;
  return h(
    'div',
    { class: 'phone' },
    h('div', { class: 'phone-head' }, avatar(config), h('div', { class: 'handle' }, handle(config))),
    carousel,
    dots,
    h(
      'div',
      { class: 'caption' },
      h('b', null, `${handle(config)} `),
      text,
      more,
      ig.hashtags.length ? h('div', { class: 'tags' }, ig.hashtags.join(' ')) : null,
      h('div', { class: 'count', style: 'margin-top:8px' }, `캡션 ${total.toLocaleString()} / ${LIMITS.instagramCaption.toLocaleString()}자 · 카드 ${ig.cards.length}장`),
    ),
  );
}

export function threadsPreview(draft: Draft, config: PromoConfig): HTMLElement {
  const posts = draft.content.threads?.posts ?? [];
  if (!posts.length) return h('div', { class: 'empty' }, '쓰레드 글이 없어요');
  return h(
    'div',
    { class: 'phone' },
    h(
      'div',
      { class: 'thread' },
      ...posts.map((p, i) => {
        const n = threadsLength(p);
        return h(
          'div',
          { class: 'tpost' },
          h('div', { class: 'rail-line' }, avatar(config), h('i')),
          h(
            'div',
            { class: 'tpost-body' },
            h('div', { class: 'tpost-meta' }, h('span', { class: 'handle' }, handle(config)), h('span', { class: `count ${n > LIMITS.threadsPost ? 'over' : n > 450 ? 'near' : ''}` }, `${i === 0 ? '본문' : `${i + 1}번`} · ${n}/${LIMITS.threadsPost}`)),
            h('div', { class: 'tpost-text' }, p),
          ),
        );
      }),
    ),
  );
}

/** Blog body with {{image:N}} lines shown as the real image, or the card drawn live when there is no upload yet. */
export function blogPreview(draft: Draft, config: PromoConfig, label: string): HTMLElement {
  const blog = draft.content.blog;
  if (!blog) return h('div', { class: 'empty' }, '블로그 글이 없어요');
  const cards = draft.content.instagram?.cards ?? [];
  const body = h('div', { class: 'body' });
  for (const chunk of blog.body.split(/^(\{\{image:\d+\}\})$/m)) {
    const m = /^\{\{image:(\d+)\}\}$/.exec(chunk);
    if (m) {
      const i = Number(m[1]) - 1;
      if (/^https?:\/\//.test(draft.images[i] ?? '')) body.append(h('img', { src: draft.images[i], alt: cards[i]?.title ?? '' }));
      else if (cards[i]) body.append(cardEl(cards[i], i, cards.length, config.brand));
      continue;
    }
    if (!chunk.trim()) continue;
    const part = h('div');
    part.innerHTML = renderBlogHtml({ ...blog, body: chunk }, [], cards); // raw HTML is escaped by renderBlogHtml
    for (const a of part.querySelectorAll('a')) {
      if (!/^https?:\/\//.test(a.getAttribute('href') ?? '')) a.removeAttribute('href');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    body.append(...part.childNodes);
  }
  return h(
    'article',
    { class: 'article' },
    h('div', { class: 'eyebrow' }, label),
    h('h1', null, blog.title),
    body,
    blog.tags.length ? h('div', { class: 'tags' }, ...blog.tags.map((t) => h('span', null, `#${t}`))) : null,
  );
}
