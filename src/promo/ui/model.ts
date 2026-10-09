/** What the simple dashboard works with: three automations (blog, Instagram, Threads), each with an account and a cycle. */
import { scopeConfig, slotsFor } from '../core/config';
import { nextSlot } from '../core/schedule';
import type { Draft, PlatformId, PromoConfig, PromoState, Slot, Weekday } from '../core/types';

export type UiPlatform = 'blog' | 'instagram' | 'threads';
export const UI_PLATFORMS: UiPlatform[] = ['blog', 'instagram', 'threads'];
export type BlogKind = 'naver' | 'tistory' | 'wordpress';

export const UI_NAME: Record<UiPlatform, string> = { blog: '블로그', instagram: '인스타그램', threads: '쓰레드' };
export const BLOG_KIND_NAME: Record<BlogKind, string> = { naver: '네이버 블로그', tistory: '티스토리', wordpress: '워드프레스' };

export interface DraftFile {
  path: string;
  sha: string | null;
  draft: Draft | null;
  error: string | null;
}

export interface Accounts {
  threads: boolean;
  instagram: boolean;
  wordpress: boolean;
  claude: boolean;
}

export interface Model {
  config: PromoConfig;
  configErrors: string[];
  brandDoc: string;
  blogKind: BlogKind;
  drafts: DraftFile[];
  state: PromoState;
  inboxDone: string[];
  accounts: Accounts;
  /** False until the agent has run once (no promo-data branch yet). */
  hasData: boolean;
}

/** The config platforms behind one card. The blog card is WordPress or the Naver/Tistory paste-ready export. */
export function platformsOf(ui: UiPlatform, kind: BlogKind): PlatformId[] {
  if (ui === 'blog') return [kind === 'wordpress' ? 'wordpress' : 'naver'];
  return [ui];
}

export function uiOf(p: PlatformId): UiPlatform {
  return p === 'wordpress' || p === 'naver' ? 'blog' : p;
}

export function hasAccount(m: Model, ui: UiPlatform): boolean {
  if (ui === 'blog') return m.blogKind === 'wordpress' ? m.accounts.wordpress : true;
  return m.accounts[ui];
}

export interface Automation {
  on: boolean;
  days: Weekday[];
  /** Whole hours: the agent runs once an hour. */
  hour: number;
}

export const ALL_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_KO: Record<Weekday, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

export const CYCLES: { id: string; label: string; days: Weekday[] }[] = [
  { id: 'daily', label: '매일', days: ALL_DAYS },
  { id: 'weekdays', label: '평일', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { id: 'mwf', label: '주 3회', days: ['mon', 'wed', 'fri'] },
  { id: 'tt', label: '주 2회', days: ['tue', 'thu'] },
  { id: 'weekly', label: '주 1회', days: ['mon'] },
];

export function automationOf(config: PromoConfig, ui: UiPlatform, kind: BlogKind): Automation {
  const p = platformsOf(ui, kind)[0];
  const slot = slotsFor(config, p)[0] ?? { days: ['mon', 'wed', 'fri'], time: '09:00' };
  return { on: config.platforms[p].enabled, days: ALL_DAYS.filter((d) => slot.days.includes(d)), hour: Number(slot.time.slice(0, 2)) };
}

export function slotOf(a: Automation): Slot {
  return { days: a.days, time: `${String(a.hour).padStart(2, '0')}:00` };
}

export function hourLabel(h: number): string {
  if (h === 0) return '밤 12시';
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return '낮 12시';
  return `오후 ${h - 12}시`;
}

export function describeCycle(a: Pick<Automation, 'days' | 'hour'>): string {
  const preset = CYCLES.find((c) => c.days.length === a.days.length && c.days.every((d) => a.days.includes(d)));
  const list = a.days.map((d) => DAY_KO[d]).join('·');
  const days = preset?.id === 'daily' || preset?.id === 'weekdays' ? preset.label : preset && preset.id !== 'weekly' ? `${preset.label} (${list})` : `매주 ${list}`;
  return `${days} ${hourLabel(a.hour)}`;
}

export function blogKindOf(config: PromoConfig): BlogKind {
  return config.platforms.wordpress.url ? 'wordpress' : config.platforms.naver.kind;
}

/** Config with one automation changed, ready to save. */
export function withAutomation(config: PromoConfig, ui: UiPlatform, kind: BlogKind, a: Automation): PromoConfig {
  const c = structuredClone(config);
  const [p] = platformsOf(ui, kind);
  c.platforms[p].enabled = a.on;
  c.platforms[p].schedule = [slotOf(a)];
  if (ui === 'blog') {
    // Only one kind of blog is automated at a time.
    const other: PlatformId = p === 'wordpress' ? 'naver' : 'wordpress';
    c.platforms[other].enabled = false;
  }
  return c;
}

export function nextPost(config: PromoConfig, ui: UiPlatform, kind: BlogKind, now = new Date()) {
  const a = automationOf(config, ui, kind);
  if (!a.on || !a.days.length) return null;
  return nextSlot(now, config.timeZone, [slotOf(a)]);
}

export function draftsFor(m: Model, ui: UiPlatform): DraftFile[] {
  const targets = platformsOf(ui, m.blogKind);
  return m.drafts.filter((f) => {
    const d = f.draft;
    if (!d) return false;
    if (d.platforms.length) return d.platforms.some((p) => targets.includes(p) || (ui === 'blog' && uiOf(p) === 'blog'));
    return ui === 'blog' ? !!d.content.blog : !!d.content[ui];
  });
}

/** The config the writer and checks see when making content for one card. */
export function scopedFor(m: Model, ui: UiPlatform): PromoConfig {
  return scopeConfig(m.config, platformsOf(ui, m.blogKind));
}

export const SECRET_FOR: Record<'threads' | 'instagram', string> = { threads: 'THREADS_ACCESS_TOKEN', instagram: 'INSTAGRAM_ACCESS_TOKEN' };

export function nextSlotFor(m: Model, ui: UiPlatform) {
  return nextPost(m.config, ui, m.blogKind);
}
