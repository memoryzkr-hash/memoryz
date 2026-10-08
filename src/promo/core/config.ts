/** promo/config.yml → PromoConfig. Missing keys fall back to DEFAULT_CONFIG; wrong ones become Korean error lines. */
import { parse } from 'yaml';
import { COMMENT_CATEGORIES, type CommentAction, type PromoConfig, type Slot, type Weekday } from './types';

export const DEFAULT_CONFIG: PromoConfig = {
  timeZone: 'Asia/Seoul',
  mode: 'auto',
  brand: {
    name: '',
    handle: '',
    colors: { background: '#FFF8F0', text: '#1F1A17', accent: '#FF6B35' },
    disclosure: null,
    links: [],
  },
  schedule: { slots: [{ days: ['mon', 'wed', 'fri'], time: '09:00' }], catchUpHours: 6 },
  content: {
    pillars: [],
    topics: [],
    bannedWords: [],
    hashtags: { fixed: [], max: 8 },
    research: { searches: 5, fetches: 5 },
  },
  platforms: {
    threads: { enabled: false, attachImage: false, maxPosts: 4 },
    instagram: { enabled: false, maxCards: 7 },
    wordpress: { enabled: false, url: '', status: 'publish' },
    naver: { enabled: false },
  },
  comments: {
    enabled: true,
    scope: 'all',
    lookbackDays: 7,
    maxRepliesPerRun: 15,
    replyMaxChars: 200,
    actions: {
      praise: 'reply',
      question: 'reply',
      purchase: 'reply',
      complaint: 'escalate',
      sensitive: 'escalate',
      spam: 'hide',
      abuse: 'hide',
      other: 'ignore',
    },
  },
  media: { repo: '', branch: 'promo-media' },
};

const DAYS: Record<string, Weekday> = {
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
  월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun',
};
const ACTIONS: CommentAction[] = ['reply', 'hide', 'escalate', 'ignore'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface ConfigResult {
  config: PromoConfig;
  errors: string[];
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseConfig(text: string): ConfigResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = parse(text) ?? {};
  } catch (e) {
    return { config: structuredClone(DEFAULT_CONFIG), errors: [`config.yml을 읽지 못했어요: ${(e as Error).message.split('\n')[0]}`] };
  }
  if (!isObj(raw)) return { config: structuredClone(DEFAULT_CONFIG), errors: ['config.yml 최상위는 "이름: 값" 형식이어야 해요'] };

  const c = structuredClone(DEFAULT_CONFIG);
  const at = (path: string) => `config.yml의 ${path}`;

  const str = (v: unknown, path: string, fallback: string): string => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    errors.push(`${at(path)}은(는) 글자여야 해요`);
    return fallback;
  };
  const bool = (v: unknown, path: string, fallback: boolean): boolean => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    errors.push(`${at(path)}은(는) true 또는 false여야 해요`);
    return fallback;
  };
  const int = (v: unknown, path: string, fallback: number, min: number, max: number): number => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) return v;
    errors.push(`${at(path)}은(는) ${min}~${max} 사이 정수여야 해요`);
    return fallback;
  };
  const strList = (v: unknown, path: string, fallback: string[]): string[] => {
    if (v === undefined || v === null) return fallback;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return v.map((x) => String(x).trim()).filter(Boolean);
    }
    errors.push(`${at(path)}은(는) 글자 목록이어야 해요 (예: [가, 나])`);
    return fallback;
  };
  const section = (v: unknown, path: string): Obj => {
    if (v === undefined || v === null) return {};
    if (isObj(v)) return v;
    errors.push(`${at(path)} 아래에는 "이름: 값" 항목이 와야 해요`);
    return {};
  };

  c.timeZone = str(raw.timeZone, 'timeZone', c.timeZone);
  if (!isValidTimeZone(c.timeZone)) {
    errors.push(`${at('timeZone')} "${c.timeZone}"을(를) 모르겠어요 (예: Asia/Seoul)`);
    c.timeZone = DEFAULT_CONFIG.timeZone;
  }
  const mode = str(raw.mode, 'mode', c.mode);
  if (mode === 'auto' || mode === 'review') c.mode = mode;
  else errors.push(`${at('mode')}은(는) auto 또는 review여야 해요`);

  const brand = section(raw.brand, 'brand');
  c.brand.name = str(brand.name, 'brand.name', '');
  c.brand.handle = str(brand.handle, 'brand.handle', '');
  const colors = section(brand.colors, 'brand.colors');
  for (const key of ['background', 'text', 'accent'] as const) {
    const v = str(colors[key], `brand.colors.${key}`, c.brand.colors[key]);
    if (HEX.test(v)) c.brand.colors[key] = v;
    else errors.push(`${at(`brand.colors.${key}`)}은(는) "#RRGGBB" 색 코드여야 해요`);
  }
  const disclosure = str(brand.disclosure, 'brand.disclosure', '');
  c.brand.disclosure = disclosure || null;
  if (brand.links !== undefined && brand.links !== null) {
    if (!Array.isArray(brand.links)) errors.push(`${at('brand.links')}은(는) 목록이어야 해요`);
    else {
      brand.links.forEach((l, i) => {
        const url = isObj(l) ? str(l.url, `brand.links[${i}].url`, '') : '';
        if (!/^https?:\/\/\S+$/.test(url)) errors.push(`${at(`brand.links[${i}].url`)}은(는) http(s)://로 시작하는 주소여야 해요`);
        else c.brand.links.push({ label: isObj(l) ? str(l.label, `brand.links[${i}].label`, url) || url : url, url });
      });
    }
  }

  const schedule = section(raw.schedule, 'schedule');
  if (schedule.slots !== undefined) {
    const slots: Slot[] = [];
    if (!Array.isArray(schedule.slots)) errors.push(`${at('schedule.slots')}은(는) 목록이어야 해요`);
    else {
      schedule.slots.forEach((s, i) => {
        const p = `schedule.slots[${i}]`;
        if (!isObj(s)) return void errors.push(`${at(p)}은(는) { days: [...], time: "09:00" } 형식이어야 해요`);
        const time = str(s.time, `${p}.time`, '');
        if (!TIME.test(time)) errors.push(`${at(`${p}.time`)}은(는) "09:00"처럼 24시간 HH:mm이어야 해요`);
        const dayNames = s.days === 'daily' || s.days === '매일' ? Object.keys(DAYS).slice(0, 7) : strList(s.days, `${p}.days`, []);
        const days = dayNames.map((d) => DAYS[d.toLowerCase()]);
        if (!days.length || days.some((d) => !d)) errors.push(`${at(`${p}.days`)}은(는) [mon, wed, fri] 또는 [월, 수, 금] 또는 daily여야 해요`);
        else if (TIME.test(time)) slots.push({ days: [...new Set(days)], time });
      });
    }
    c.schedule.slots = slots;
  }
  c.schedule.catchUpHours = int(schedule.catchUpHours, 'schedule.catchUpHours', c.schedule.catchUpHours, 1, 48);

  const content = section(raw.content, 'content');
  c.content.pillars = strList(content.pillars, 'content.pillars', []);
  c.content.topics = strList(content.topics, 'content.topics', []);
  c.content.bannedWords = strList(content.bannedWords, 'content.bannedWords', []);
  const tags = section(content.hashtags, 'content.hashtags');
  c.content.hashtags.fixed = strList(tags.fixed, 'content.hashtags.fixed', []).map((t) => (t.startsWith('#') ? t : `#${t}`));
  c.content.hashtags.max = int(tags.max, 'content.hashtags.max', c.content.hashtags.max, 0, 30);
  if (c.content.hashtags.fixed.length > c.content.hashtags.max) errors.push(`${at('content.hashtags.fixed')}이(가) max보다 많아요`);
  const research = section(content.research, 'content.research');
  c.content.research.searches = int(research.searches, 'content.research.searches', c.content.research.searches, 0, 10);
  c.content.research.fetches = int(research.fetches, 'content.research.fetches', c.content.research.fetches, 0, 10);

  const platforms = section(raw.platforms, 'platforms');
  const threads = section(platforms.threads, 'platforms.threads');
  c.platforms.threads.enabled = bool(threads.enabled, 'platforms.threads.enabled', false);
  c.platforms.threads.attachImage = bool(threads.attachImage, 'platforms.threads.attachImage', false);
  c.platforms.threads.maxPosts = int(threads.maxPosts, 'platforms.threads.maxPosts', c.platforms.threads.maxPosts, 1, 10);
  const instagram = section(platforms.instagram, 'platforms.instagram');
  c.platforms.instagram.enabled = bool(instagram.enabled, 'platforms.instagram.enabled', false);
  c.platforms.instagram.maxCards = int(instagram.maxCards, 'platforms.instagram.maxCards', c.platforms.instagram.maxCards, 1, 10);
  const wordpress = section(platforms.wordpress, 'platforms.wordpress');
  c.platforms.wordpress.enabled = bool(wordpress.enabled, 'platforms.wordpress.enabled', false);
  c.platforms.wordpress.url = str(wordpress.url, 'platforms.wordpress.url', '').replace(/\/+$/, '');
  const wpStatus = str(wordpress.status, 'platforms.wordpress.status', 'publish');
  if (wpStatus === 'publish' || wpStatus === 'draft') c.platforms.wordpress.status = wpStatus;
  else errors.push(`${at('platforms.wordpress.status')}은(는) publish 또는 draft여야 해요`);
  if (c.platforms.wordpress.enabled && !/^https?:\/\//.test(c.platforms.wordpress.url)) {
    errors.push(`${at('platforms.wordpress.url')}에 블로그 주소(https://...)를 적어 주세요`);
  }
  const naver = section(platforms.naver, 'platforms.naver');
  c.platforms.naver.enabled = bool(naver.enabled, 'platforms.naver.enabled', false);

  const comments = section(raw.comments, 'comments');
  c.comments.enabled = bool(comments.enabled, 'comments.enabled', c.comments.enabled);
  const scope = str(comments.scope, 'comments.scope', c.comments.scope);
  if (scope === 'all' || scope === 'agent') c.comments.scope = scope;
  else errors.push(`${at('comments.scope')}은(는) all 또는 agent여야 해요`);
  c.comments.lookbackDays = int(comments.lookbackDays, 'comments.lookbackDays', c.comments.lookbackDays, 1, 30);
  c.comments.maxRepliesPerRun = int(comments.maxRepliesPerRun, 'comments.maxRepliesPerRun', c.comments.maxRepliesPerRun, 0, 50);
  c.comments.replyMaxChars = int(comments.replyMaxChars, 'comments.replyMaxChars', c.comments.replyMaxChars, 20, 500);
  const actions = section(comments.actions, 'comments.actions');
  for (const cat of COMMENT_CATEGORIES) {
    const v = str(actions[cat], `comments.actions.${cat}`, c.comments.actions[cat]) as CommentAction;
    if (ACTIONS.includes(v)) c.comments.actions[cat] = v;
    else errors.push(`${at(`comments.actions.${cat}`)}은(는) reply / hide / escalate / ignore 중 하나여야 해요`);
  }
  for (const key of Object.keys(actions)) {
    if (!(COMMENT_CATEGORIES as string[]).includes(key)) errors.push(`${at(`comments.actions.${key}`)}: 모르는 분류예요 (${COMMENT_CATEGORIES.join(', ')})`);
  }

  const media = section(raw.media, 'media');
  c.media.repo = str(media.repo, 'media.repo', '');
  if (c.media.repo && !/^[\w.-]+\/[\w.-]+$/.test(c.media.repo)) errors.push(`${at('media.repo')}은(는) "계정/저장소" 형식이어야 해요`);
  c.media.branch = str(media.branch, 'media.branch', c.media.branch) || c.media.branch;

  if (!Object.values(c.platforms).some((p) => p.enabled)) errors.push('켜진 플랫폼이 없어요. platforms 아래에서 하나 이상 enabled: true로 바꿔 주세요');
  if (!c.brand.name) errors.push(`${at('brand.name')}에 브랜드 이름을 적어 주세요`);

  return { config: c, errors };
}

export function enabledPlatforms(c: PromoConfig) {
  return (Object.keys(c.platforms) as (keyof PromoConfig['platforms'])[]).filter((p) => c.platforms[p].enabled);
}
