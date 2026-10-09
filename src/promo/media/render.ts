/** Renders card HTML to JPEG with headless Chromium (Instagram accepts JPEG only). */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Card, PromoConfig } from '../core/types';
import { CARD_HEIGHT, CARD_WIDTH, cardHtml } from './cards';

export type CardRenderer = (cards: Card[], brand: PromoConfig['brand'], outDir: string) => Promise<string[]>;

/** PROMO_CHROMIUM_PATH points at a Chromium binary; otherwise Playwright's own download is used. */
export const renderCards: CardRenderer = async (cards, brand, outDir) => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.PROMO_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: CARD_WIDTH, height: CARD_HEIGHT }, deviceScaleFactor: 1 });
    await mkdir(outDir, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      await page.setContent(cardHtml(cards[i], i, cards.length, brand), { waitUntil: 'load' });
      await page.waitForSelector('body[data-ready="1"]');
      const file = join(outDir, `card-${String(i + 1).padStart(2, '0')}.jpg`);
      await writeFile(file, await page.screenshot({ type: 'jpeg', quality: 92 }));
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
};
