/** Trip data. Times are minutes after midnight of the day (may pass 1440 when a day runs late). */

export type Mode = 'walk' | 'subway' | 'bus' | 'taxi' | 'car' | 'train' | 'flight' | 'ferry';
export type ModeChoice = Mode | 'auto';
export type PlaceKind = 'hotel' | 'sight' | 'food' | 'cafe' | 'shop' | 'activity' | 'nature' | 'station' | 'airport';
export type RegionId = 'KR' | 'JP' | 'FR' | 'US' | 'TH' | 'OTHER';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
  /** Minutes spent here. */
  stayMin: number;
  /** Per person, in the region's currency (tickets, meals). Transport is never included. */
  cost: number;
  /** "HH:mm" or null when always open. */
  open: string | null;
  close: string | null;
  note: string | null;
  /** How to get here from the previous stop. Ignored on a day's first stop. */
  modeIn: ModeChoice;
}

export interface DayPlan {
  label: string;
  /** "HH:mm" — when the day's first stop is left. */
  start: string;
  stops: Stop[];
}

export interface TripPlan {
  id: string;
  title: string;
  destination: string;
  region: RegionId;
  travelers: number;
  /** In KRW; null when the traveller set none. */
  budgetKrw: number | null;
  /** Per room per night, in the region's currency. Two people share a room. */
  lodgingPerNight: number;
  days: DayPlan[];
  tips: string[];
}
