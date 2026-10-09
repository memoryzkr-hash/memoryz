/** What every platform adapter offers the agent. */
import type { Draft, PlatformId, PromoConfig, RemoteComment } from '../core/types';

export interface PublishInput {
  draft: Draft;
  /** Public image URLs, in card order. */
  images: string[];
  /** Local image files, in card order (for blogs that upload images themselves). */
  imageFiles: string[];
}

export interface Published {
  id: string;
  url: string | null;
  /** True when a person still has to post it (Naver/Tistory export). */
  manual?: boolean;
  note?: string;
}

export interface CommentQuery {
  since: Date;
  scope: PromoConfig['comments']['scope'];
  /** Ids of posts the agent published on this platform. */
  agentPostIds: string[];
}

export interface Platform {
  id: PlatformId;
  /** Looks up the connected account without changing anything. Returns the account name. */
  check(): Promise<string>;
  publish(input: PublishInput): Promise<Published>;
  /** Missing when the platform has no comment API. */
  comments?: {
    me(): Promise<string>;
    list(q: CommentQuery): Promise<RemoteComment[]>;
    reply(c: RemoteComment, text: string): Promise<void>;
    hide?(c: RemoteComment): Promise<void>;
  };
}
