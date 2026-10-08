/** Shapes shared by the promo agent (docs/promo/PLAN.md). Node-only; nothing here touches the network. */

export type PlatformId = 'threads' | 'instagram' | 'wordpress' | 'naver';
export const PLATFORMS: PlatformId[] = ['threads', 'instagram', 'wordpress', 'naver'];
export const PLATFORM_LABELS: Record<PlatformId, string> = {
  threads: '쓰레드',
  instagram: '인스타그램',
  wordpress: '워드프레스',
  naver: '네이버·티스토리',
};

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type Mode = 'auto' | 'review';

export type CommentCategory = 'praise' | 'question' | 'purchase' | 'complaint' | 'sensitive' | 'spam' | 'abuse' | 'other';
export const COMMENT_CATEGORIES: CommentCategory[] = ['praise', 'question', 'purchase', 'complaint', 'sensitive', 'spam', 'abuse', 'other'];
export type CommentAction = 'reply' | 'hide' | 'escalate' | 'ignore';

export interface Slot {
  days: Weekday[];
  /** Local wall-clock time, HH:mm. */
  time: string;
}

export interface BrandLink {
  label: string;
  url: string;
}

export interface PromoConfig {
  timeZone: string;
  mode: Mode;
  brand: {
    name: string;
    handle: string;
    colors: { background: string; text: string; accent: string };
    /** Forced into every post when set, e.g. "#광고". */
    disclosure: string | null;
    links: BrandLink[];
  };
  schedule: { slots: Slot[]; catchUpHours: number };
  content: {
    pillars: string[];
    topics: string[];
    bannedWords: string[];
    hashtags: { fixed: string[]; max: number };
    research: { searches: number; fetches: number };
  };
  platforms: {
    threads: { enabled: boolean; attachImage: boolean; maxPosts: number };
    instagram: { enabled: boolean; maxCards: number };
    wordpress: { enabled: boolean; url: string; status: 'publish' | 'draft' };
    naver: { enabled: boolean };
  };
  comments: {
    enabled: boolean;
    scope: 'all' | 'agent';
    lookbackDays: number;
    maxRepliesPerRun: number;
    replyMaxChars: number;
    actions: Record<CommentCategory, CommentAction>;
  };
  media: { repo: string; branch: string };
}

/** The free-form markdown files the person writes in promo/. */
export interface BrandDocs {
  brand: string;
  faq: string;
  references: string;
  templates: { blog: string; instagram: string; threads: string };
}

export interface BlogContent {
  title: string;
  /** Markdown. A line `{{image:N}}` places card N (1-based). */
  body: string;
  tags: string[];
}

export interface Card {
  title: string;
  body: string;
}

export interface InstagramContent {
  caption: string;
  hashtags: string[];
  cards: Card[];
}

export interface ThreadsContent {
  /** posts[0] is the main post; the rest are chained as self-replies. */
  posts: string[];
}

export interface ContentSet {
  blog: BlogContent | null;
  instagram: InstagramContent | null;
  threads: ThreadsContent | null;
}

export interface TopicPlan {
  topic: string;
  angle: string;
  pillar: string;
  keywords: string[];
}

export interface Reference {
  title: string;
  url: string;
  /** What is worth borrowing: hook, structure, format. Never the wording. */
  note: string;
}

export interface Fact {
  claim: string;
  sourceUrl: string;
}

export interface Research {
  references: Reference[];
  hooks: string[];
  structures: string[];
  keywords: string[];
  hashtags: string[];
  facts: Fact[];
  avoid: string[];
}

export type DraftStatus = 'draft' | 'approved' | 'skip' | 'published' | 'partial' | 'failed';

export interface PublishResult {
  status: 'ok' | 'manual' | 'failed';
  id: string | null;
  url: string | null;
  error: string | null;
  at: string;
  attempts: number;
}

export interface Draft {
  id: string;
  slotKey: string | null;
  status: DraftStatus;
  createdAt: string;
  plan: TopicPlan;
  references: Reference[];
  /** Problems left after review; any `error` keeps auto mode from publishing. */
  issues: Issue[];
  /** Public card image URLs (or local paths in a dry run), in card order. */
  images: string[];
  /** Fingerprint of the cards the images were made from; edited cards get new images. */
  imagesFor: string;
  results: Partial<Record<PlatformId, PublishResult>>;
  content: ContentSet;
}

export interface Issue {
  severity: 'error' | 'warn';
  platform: PlatformId | 'all';
  message: string;
}

export interface RemoteComment {
  platform: PlatformId;
  id: string;
  /** Where a reply goes (Instagram nests replies under the top-level comment). */
  replyTo: string;
  postId: string;
  postUrl: string | null;
  postText: string;
  author: string;
  text: string;
  at: string;
  repliedByMe: boolean;
}

export interface CommentDecision {
  id: string;
  category: CommentCategory;
  action: CommentAction;
  reply: string;
  /** Short reason, shown in the inbox. */
  reason: string;
}

export interface InboxItem {
  key: string;
  platform: PlatformId;
  postUrl: string | null;
  author: string;
  text: string;
  category: CommentCategory;
  suggestedReply: string;
  reason: string;
  at: string;
}

export interface PromoState {
  version: 1;
  /** slotKey → draft id; a slot listed here is never run again. */
  slots: Record<string, string>;
  /** Most recent first, capped. */
  topics: { date: string; topic: string; draftId: string }[];
  /** Everything the agent published, for comment scanning. */
  posts: { draftId: string; platform: PlatformId; id: string; url: string | null; at: string }[];
  /** `${platform}:${commentId}` → what was done. */
  comments: Record<string, { action: CommentAction | 'escalate'; category: CommentCategory; at: string }>;
  inbox: InboxItem[];
  tokens: Partial<Record<'threads' | 'instagram', { refreshedAt: string; expiresAt: string | null }>>;
  lastRun: string | null;
}
