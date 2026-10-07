/** What every screen can reach: storage, Claude, today's date, navigation. */
import type { Ai } from '../ai';
import type { AssistantStore } from '../core/store';
import type { CalEvent } from '../core/types';

export type View = 'start' | 'news' | 'events' | 'messages' | 'settings';

export interface App {
  readonly store: AssistantStore;
  /** null until a key is saved. */
  ai(): Ai | null;
  today(): string;
  timeZone(): string;
  go(view: View): void;
  /** Background work (a briefing still running) only redraws when its screen is on top. */
  isShowing(view: View): boolean;
  /** Re-draws the current screen from storage. */
  refresh(): void;
  /** S2c → S3: open the message tab with this event filled in. */
  composeAbout(event: CalEvent): void;
}

export interface Screen {
  title: string;
  render(root: HTMLElement): void;
}
