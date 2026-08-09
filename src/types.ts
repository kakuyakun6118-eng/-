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

export interface Place {
  id: string;
  name: string;
  category: Category;
  priority: Priority;
  area?: string;
  mapsUrl?: string;
  note?: string;
  createdAt: number;
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
}

export type NewScheduleItem = Omit<ScheduleItem, "id">;

export interface TripInfo {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hotelName?: string;
  hotelAddress?: string;
  hotelMapsUrl?: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

export const DEFAULT_TRIP_INFO: TripInfo = {
  startDate: "2026-09-18",
  endDate: "2026-09-24",
};
