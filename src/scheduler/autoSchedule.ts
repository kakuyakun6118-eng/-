import { NewScheduleItem, Place, PlanOptions, Priority, TripInfo } from "../types";
import { dateRange } from "../utils/date";
import {
  advisoriesFor,
  areaFor,
  estimateCrowd,
  profileFor,
  travelMinutes,
  VenueProfile,
} from "./nycKnowledge";

export interface PlanWarning {
  level: "info" | "warn";
  message: string;
  /** Inferred rather than confirmed — the UI shows a 要確認 badge. */
  verify?: boolean;
}

export interface PlanResult {
  items: NewScheduleItem[];
  warnings: PlanWarning[];
  unplaced: { place: Place; reason: string }[];
}

const PRIORITY_RANK: Record<Priority, number> = { must: 0, want: 1, "if-time": 2 };

const LUNCH_WINDOW = { from: 11 * 60 + 30, to: 14 * 60 };
const DINNER_WINDOW = { from: 18 * 60, to: 20 * 60 + 30 };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

function isOpenOn(profile: VenueProfile, date: string): boolean {
  return !profile.closedDays?.includes(weekdayOf(date));
}

/** Usable planning window for a given day, honouring flight times. */
function dayWindow(
  date: string,
  dates: string[],
  trip: TripInfo,
  options: PlanOptions,
): { start: number; end: number } {
  let start = toMinutes(options.dayStart);
  let end = toMinutes(options.dayEnd);

  if (date === dates[0] && trip.arrivalTime) {
    // Immigration, baggage and the ride into Manhattan.
    start = Math.max(start, toMinutes(trip.arrivalTime) + 150);
  }
  if (date === dates[dates.length - 1] && trip.departureTime) {
    // Leave for the airport well before departure.
    end = Math.min(end, toMinutes(trip.departureTime) - 210);
  }
  return { start, end };
}

interface Candidate {
  place: Place;
  profile: VenueProfile;
  area: string;
}

function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.place.priority] - PRIORITY_RANK[b.place.priority];
    if (byPriority !== 0) return byPriority;
    // Crowd-sensitive places first, so they claim the good early slots.
    return b.profile.crowdSensitivity - a.profile.crowdSensitivity;
  });
}

/**
 * Picks the best start time for an activity, preferring earlier slots when the
 * estimate says it will be busy.
 */
function chooseStart(
  place: Place,
  date: string,
  earliest: number,
  latest: number,
  options: PlanOptions,
): { start: number; crowd: number } {
  const base = Math.max(earliest, 0);
  let best = { start: base, crowd: estimateCrowd(place, date, toHHMM(base)) };
  if (!options.avoidCrowds || best.crowd < 4) return best;

  // Nudge within a modest range; a quieter visit is worth a small shift.
  for (const delta of [30, 60, -30, 90]) {
    const candidate = base + delta;
    if (candidate < earliest || candidate > latest) continue;
    const crowd = estimateCrowd(place, date, toHHMM(candidate));
    if (crowd < best.crowd) best = { start: candidate, crowd };
  }
  return best;
}

/** Builds a full itinerary from the place list. */
export function autoSchedule(
  places: Place[],
  trip: TripInfo,
  options: PlanOptions,
): PlanResult {
  const dates = dateRange(trip.startDate, trip.endDate);
  const warnings: PlanWarning[] = [];
  const items: NewScheduleItem[] = [];

  if (dates.length === 0) {
    return {
      items,
      warnings: [{ level: "warn", message: "旅行の日程が正しく設定されていません。設定タブで出発日と帰国日を確認してください。" }],
      unplaced: [],
    };
  }

  const usable = places.filter(
    (p) => options.includeIfTime || p.priority !== "if-time",
  );

  const all: Candidate[] = usable.map((place) => ({
    place,
    profile: profileFor(place),
    area: areaFor(place),
  }));

  const activities = rankCandidates(all.filter((c) => c.place.category !== "restaurant"));
  const restaurants = rankCandidates(all.filter((c) => c.place.category === "restaurant"));

  const usedIds = new Set<string>();
  let order = 0;

  // Days with enough usable time to plan anything (arrival/departure days may
  // have none). Knowing this up front lets the trip spread evenly instead of
  // cramming everything into the first days and leaving the rest empty.
  const usableDates = dates.filter((date) => {
    const { start, end } = dayWindow(date, dates, trip, options);
    return end - start >= 60;
  });

  for (const [dayIndex, date] of usableDates.entries()) {
    const { start, end } = dayWindow(date, dates, trip, options);

    // Claimed for *this* day's plan. A place is only marked globally used once
    // it actually fits in the timeline, so anything squeezed out stays
    // available for a later day instead of silently disappearing.
    const claimed = new Set<string>();
    const openToday = (c: Candidate) =>
      !usedIds.has(c.place.id) && !claimed.has(c.place.id) && isOpenOn(c.profile, date);

    // Seed the day, then prefer places near the seed to cut travel time.
    const seed = activities.find(openToday);
    if (!seed && !restaurants.some(openToday)) continue;

    // Spread the remaining places over the remaining days so the back half of
    // the trip doesn't end up empty while day 2 runs twelve hours.
    const remainingDays = usableDates.length - dayIndex;
    const remainingActivities = activities.filter((c) => !usedIds.has(c.place.id)).length;
    const targetCount = Math.min(
      options.maxPerDay,
      Math.max(1, Math.ceil(remainingActivities / remainingDays)),
    );

    const dayActivities: Candidate[] = [];
    if (seed) {
      dayActivities.push(seed);
      claimed.add(seed.place.id);

      while (dayActivities.length < targetCount) {
        const pool = activities.filter(openToday);
        if (pool.length === 0) break;

        const near = options.clusterByArea
          ? pool.filter((c) => travelMinutes(c.area, seed.area) <= 20)
          : pool;
        const shortlist = near.length > 0 ? near : pool;

        // Prefer a category the day doesn't already have, so a single day
        // doesn't turn into two back-to-back museums.
        const varied = shortlist.filter(
          (c) => !dayActivities.some((d) => d.place.category === c.place.category),
        );
        const next = varied[0] ?? shortlist[0];

        dayActivities.push(next);
        claimed.add(next.place.id);
      }
    }

    // Up to two restaurants per day, preferring ones near the day's area.
    const pickRestaurant = (): Candidate | undefined => {
      const pool = restaurants.filter(openToday);
      if (pool.length === 0) return undefined;
      const anchor = seed?.area;
      const chosen = anchor
        ? (pool.find((c) => travelMinutes(c.area, anchor) <= 20) ?? pool[0])
        : pool[0];
      claimed.add(chosen.place.id);
      return chosen;
    };

    const lunch = start <= LUNCH_WINDOW.to && end >= LUNCH_WINDOW.from ? pickRestaurant() : undefined;
    const dinner = end >= DINNER_WINDOW.from ? pickRestaurant() : undefined;

    // Order activities by their preferred time of day.
    const slotRank = (c: Candidate) =>
      c.profile.bestSlot === "morning" ? 0 : c.profile.bestSlot === "evening" ? 2 : 1;
    dayActivities.sort((a, b) => slotRank(a) - slotRank(b));

    const morning = dayActivities.filter((c) => slotRank(c) === 0);
    const midday = dayActivities.filter((c) => slotRank(c) === 1);
    const evening = dayActivities.filter((c) => slotRank(c) === 2);

    let cursor = start;
    let lastArea: string | null = null;

    const push = (c: Candidate, earliest: number, latest: number) => {
      let earliestStart = earliest;
      if (lastArea) earliestStart += travelMinutes(lastArea, c.area);
      if (c.profile.opensAt) earliestStart = Math.max(earliestStart, toMinutes(c.profile.opensAt));
      // Sunset spots (observation decks, Times Square, shows) lose the point
      // if the planner drops them into the middle of the afternoon.
      if (c.profile.bestSlot === "evening") earliestStart = Math.max(earliestStart, 17 * 60);
      if (earliestStart + c.profile.durationMin > latest) return false;

      const { start: chosenStart, crowd } = chooseStart(
        c.place,
        date,
        earliestStart,
        latest - c.profile.durationMin,
        options,
      );

      items.push({
        date,
        time: toHHMM(chosenStart),
        title: c.place.name,
        placeId: c.place.id,
        duration: c.profile.durationMin,
        mapsUrl: c.place.mapsUrl,
        note: c.profile.tip,
        crowdLevel: crowd,
        auto: true,
        order: order++,
      });

      if (c.profile.needsReservation) {
        warnings.push({
          level: "warn",
          message: `「${c.place.name}」は事前予約・時間指定チケットが必要になりやすい場所です。日程が固まったら早めに手配してください。`,
        });
      }
      if (c.profile.verify) {
        warnings.push({
          level: "info",
          message: `「${c.place.name}」の休館日・営業時間は公式サイトで最新情報を確認してください。`,
          verify: true,
        });
      }

      cursor = chosenStart + c.profile.durationMin;
      lastArea = c.area;
      usedIds.add(c.place.id);
      return true;
    };

    let lunchDone = false;
    let dinnerDone = false;

    /** Places a meal, using a registered restaurant when there is one. */
    const placeMeal = (
      restaurant: Candidate | undefined,
      window: { from: number; to: number },
      label: string,
    ): boolean => {
      const earliest = Math.max(cursor, window.from);
      if (restaurant && push(restaurant, earliest, Math.min(end, window.to + 90))) return true;
      if (earliest + 60 > end) return false;
      items.push({
        date,
        time: toHHMM(earliest),
        title: label,
        duration: 60,
        note: "近くのお店で。行きたいレストランを登録すると自動で組み込まれます",
        auto: true,
        order: order++,
      });
      cursor = earliest + 60;
      return true;
    };

    // Single pass over the day. Before each activity, check whether a meal is
    // due — either because we've reached the window, or because this activity
    // would run straight through it.
    const ordered = [...morning, ...midday, ...evening];
    for (const c of ordered) {
      const projectedStart = cursor + (lastArea ? travelMinutes(lastArea, c.area) : 0);
      const projectedEnd = projectedStart + c.profile.durationMin;

      // `ordered` never contains restaurants, so these are always genuine
      // "should we break for a meal first?" decisions.
      const mealDue = (window: { from: number; to: number }) =>
        cursor <= window.to &&
        projectedEnd > window.from &&
        (projectedStart >= window.from || projectedEnd > window.to);

      if (!lunchDone && mealDue(LUNCH_WINDOW)) {
        lunchDone = placeMeal(lunch, LUNCH_WINDOW, "ランチ(自由)") || lunchDone;
      }
      if (!dinnerDone && mealDue(DINNER_WINDOW)) {
        dinnerDone = placeMeal(dinner, DINNER_WINDOW, "ディナー(自由)") || dinnerDone;
      }

      push(c, cursor, end);
    }

    if (!lunchDone && cursor <= LUNCH_WINDOW.to && end > LUNCH_WINDOW.from) {
      placeMeal(lunch, LUNCH_WINDOW, "ランチ(自由)");
    }
    if (!dinnerDone && end >= DINNER_WINDOW.from) {
      placeMeal(dinner, DINNER_WINDOW, "ディナー(自由)");
    }
  }

  // Anything that never fit.
  const unplaced = usable
    .filter((p) => !usedIds.has(p.id))
    .map((place) => {
      const profile = profileFor(place);
      const everOpen = dates.some((d) => isOpenOn(profile, d));
      return {
        place,
        reason: everOpen
          ? "日程に空きがありませんでした。1日あたりの件数を増やすか、滞在日数を確認してください。"
          : "旅行期間中はすべて休業日と判定されました。休館日の設定を確認してください。",
      };
    });

  for (const advisory of advisoriesFor(dates)) {
    warnings.push({ level: "info", message: advisory.message, verify: advisory.verify });
  }

  // Collapse duplicates so the warning list stays readable.
  const seen = new Set<string>();
  const deduped = warnings.filter((w) => {
    if (seen.has(w.message)) return false;
    seen.add(w.message);
    return true;
  });

  return { items, warnings: deduped, unplaced };
}
