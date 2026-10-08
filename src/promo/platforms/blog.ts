/** Blog markdown → HTML. Raw HTML from the model is escaped; `{{image:N}}` lines become card images. */
import { Marked } from 'marked';
import type { BlogContent, Card } from '../core/types';

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: (token) => escapeHtml(token.text),
  },
});

export function renderBlogHtml(blog: BlogContent, images: string[], cards: Card[]): string {
  const body = blog.body.replace(/^\{\{image:(\d+)\}\}$/gm, (_, n) => `@@IMAGE_${n}@@`);
  const html = marked.parse(body, { async: false });
  return html.replace(/<p>@@IMAGE_(\d+)@@<\/p>/g, (_, n) => {
    const src = images[Number(n) - 1];
    if (!src) return '';
    const alt = escapeHtml(cards[Number(n) - 1]?.title ?? '');
    return `<figure><img src="${escapeHtml(src)}" alt="${alt}" /></figure>`;
  });
}

/** Image numbers the body actually uses, in order, without repeats. */
export function usedImages(body: string): number[] {
  const out: number[] = [];
  for (const m of body.matchAll(/^\{\{image:(\d+)\}\}$/gm)) if (!out.includes(Number(m[1]))) out.push(Number(m[1]));
  return out;
}
