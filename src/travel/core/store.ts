/** Saves the plan being edited and the last request form in this browser only. */
import { checkPlan } from './validate';
import type { TripPlan } from './types';

export const KEYS = {
  plan: 'travel.v1.plan',
  form: 'travel.v1.form',
  /** Shared with the personal assistant page so the key is entered once. */
  apiKey: 'assistant.v1.apiKey',
};

export interface PlanRequest {
  destination: string;
  days: number;
  travelers: number;
  budgetKrw: number | null;
  pace: 'relaxed' | 'normal' | 'packed';
  interests: string;
  /** Who is coming, in the traveller's words ("친구", "아이와 함께"). Empty when not asked. */
  companions: string;
  transport: Transport;
  /** "HH:mm" the first day starts. */
  start: string;
}

export type Transport = 'any' | 'transit' | 'car' | 'taxi';

export const DEFAULT_REQUEST: PlanRequest = {
  destination: '',
  days: 2,
  travelers: 2,
  budgetKrw: null,
  pace: 'normal',
  interests: '',
  companions: '',
  transport: 'any',
  start: '09:00',
};

export class TravelStore {
  constructor(private readonly storage: Storage) {}

  private get(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private set(key: string, value: string | null): boolean {
    try {
      if (value === null) this.storage.removeItem(key);
      else this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  plan(): TripPlan | null {
    const raw = this.get(KEYS.plan);
    if (!raw) return null;
    try {
      return checkPlan(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  savePlan(plan: TripPlan): boolean {
    return this.set(KEYS.plan, JSON.stringify(plan));
  }

  request(): PlanRequest {
    const raw = this.get(KEYS.form);
    if (!raw) return { ...DEFAULT_REQUEST };
    try {
      const v = JSON.parse(raw) as Partial<PlanRequest>;
      return {
        destination: typeof v.destination === 'string' ? v.destination : '',
        days: typeof v.days === 'number' ? v.days : DEFAULT_REQUEST.days,
        travelers: typeof v.travelers === 'number' ? v.travelers : DEFAULT_REQUEST.travelers,
        budgetKrw: typeof v.budgetKrw === 'number' ? v.budgetKrw : null,
        pace: v.pace === 'relaxed' || v.pace === 'packed' ? v.pace : 'normal',
        interests: typeof v.interests === 'string' ? v.interests : '',
        companions: typeof v.companions === 'string' ? v.companions : '',
        transport: v.transport === 'transit' || v.transport === 'car' || v.transport === 'taxi' ? v.transport : 'any',
        start: typeof v.start === 'string' && /^\d\d:\d\d$/.test(v.start) ? v.start : '09:00',
      };
    } catch {
      return { ...DEFAULT_REQUEST };
    }
  }

  saveRequest(r: PlanRequest): void {
    this.set(KEYS.form, JSON.stringify(r));
  }

  apiKey(): string | null {
    return this.get(KEYS.apiKey);
  }

  setApiKey(key: string | null): boolean {
    return this.set(KEYS.apiKey, key);
  }
}
