export type Category =
  | "restaurant"
  | "sightseeing"
  | "shopping"
  | "museum"
  | "park"
  | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  restaurant: "食事",
  sightseeing: "観光",
  shopping: "買い物",
  museum: "美術館・博物館",
  park: "公園",
  other: "その他",
};

export type Priority = "must" | "want" | "if-time";

export const PRIORITY_LABELS: Record<Priority, string> = {
  must: "絶対行く",
  want: "行きたい",
  "if-time": "時間があれば",
};

/** Preferred time of day for visiting a place. */
export type Slot = "morning" | "afternoon" | "evening" | "any";

export const SLOT_LABELS: Record<Slot, string> = {
  morning: "午前",
  afternoon: "午後",
  evening: "夕方・夜",
  any: "いつでも",
};

export interface Place {
  id: string;
  name: string;
  category: Category;
  priority: Priority;
  area?: string;
  mapsUrl?: string;
  note?: string;
  createdAt: number;

  // Optional planning hints. When omitted, the scheduler falls back to the
  // built-in NYC knowledge base (src/scheduler/nycKnowledge.ts).
  /** Weekday numbers the venue is closed. 0 = Sunday. */
  closedDays?: number[];
  /** Typical visit length in minutes. */
  durationMin?: number;
  /** Preferred time of day. */
  bestSlot?: Slot;
  /** Earliest sensible start, "HH:mm". */
  opensAt?: string;
  /** Latest sensible end, "HH:mm". */
  closesAt?: string;
  needsReservation?: boolean;
}

export type NewPlace = Omit<Place, "id" | "createdAt">;

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm, optional (unordered items sort by `order`)
  title: string;
  placeId?: string;
  duration?: number; // minutes
  note?: string;
  mapsUrl?: string;
  order: number;
  /** 1 (空いている) 〜 5 (非常に混雑). Set by the auto planner. */
  crowdLevel?: number;
  /** True when this item was created by the auto planner. */
  auto?: boolean;
}

export type NewScheduleItem = Omit<ScheduleItem, "id">;

export interface TripInfo {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hotelName?: string;
  hotelAddress?: string;
  hotelMapsUrl?: string;
  hotelArea?: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  /** Local arrival time on the first day, "HH:mm". Limits day-1 planning. */
  arrivalTime?: string;
  /** Local departure time on the last day, "HH:mm". Limits the final day. */
  departureTime?: string;
}

export const DEFAULT_TRIP_INFO: TripInfo = {
  startDate: "2026-09-18",
  endDate: "2026-09-24",
};

export interface PlanOptions {
  /** When sightseeing starts each day, "HH:mm". */
  dayStart: string;
  /** When the day's last activity should end, "HH:mm". */
  dayEnd: string;
  /** Max sightseeing/meal stops per day. */
  maxPerDay: number;
  /** Keep each day inside one area to cut travel time. */
  clusterByArea: boolean;
  /** Try to dodge the busiest time bands. */
  avoidCrowds: boolean;
  /** Include places marked "時間があれば". */
  includeIfTime: boolean;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  dayStart: "09:00",
  dayEnd: "21:00",
  maxPerDay: 4,
  clusterByArea: true,
  avoidCrowds: true,
  includeIfTime: false,
};
