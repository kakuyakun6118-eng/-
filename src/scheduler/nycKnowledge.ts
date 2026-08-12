import { Category, Place, Slot } from "../types";

/**
 * Built-in planning knowledge for New York City.
 *
 * IMPORTANT: none of this is live data. Google does not publish an API for
 * "popular times", and there is no public feed for museum opening hours or
 * ticket availability. Everything here is a heuristic built from typical
 * patterns, and anything venue-specific is flagged with `verify` so the UI can
 * tell the user to confirm it before relying on it. Users can override every
 * value per place in the edit form.
 */

export interface VenueProfile {
  durationMin: number;
  bestSlot: Slot;
  /** Weekday numbers the venue is typically closed. 0 = Sunday. */
  closedDays?: number[];
  opensAt?: string;
  closesAt?: string;
  /** 0–1: how much day/time choice changes the experience. */
  crowdSensitivity: number;
  needsReservation?: boolean;
  tip?: string;
  /** True when the venue-specific facts should be double-checked. */
  verify?: boolean;
}

const CATEGORY_PROFILES: Record<Category, VenueProfile> = {
  museum: {
    durationMin: 150,
    bestSlot: "morning",
    opensAt: "10:00",
    closesAt: "17:30",
    crowdSensitivity: 0.8,
  },
  restaurant: {
    durationMin: 75,
    bestSlot: "any",
    crowdSensitivity: 0.7,
  },
  sightseeing: {
    durationMin: 90,
    bestSlot: "any",
    crowdSensitivity: 0.7,
  },
  park: {
    durationMin: 90,
    bestSlot: "morning",
    crowdSensitivity: 0.4,
  },
  shopping: {
    durationMin: 90,
    bestSlot: "afternoon",
    opensAt: "10:00",
    closesAt: "20:00",
    crowdSensitivity: 0.5,
  },
  other: {
    durationMin: 90,
    bestSlot: "any",
    crowdSensitivity: 0.5,
  },
};

interface VenueRule {
  /** Lower-cased keywords; any match applies the profile. */
  keywords: string[];
  profile: Partial<VenueProfile>;
  area?: string;
}

/**
 * Well-known venues. Kept deliberately small: each entry is a guess about the
 * real world that can go stale, so anything beyond broad patterns carries
 * `verify: true` and is surfaced to the user as "要確認".
 */
const VENUE_RULES: VenueRule[] = [
  {
    keywords: ["metropolitan museum", "メトロポリタン", "met museum", "ザ・メット"],
    area: "Upper East Side",
    profile: {
      durationMin: 210,
      bestSlot: "morning",
      closedDays: [3],
      crowdSensitivity: 0.9,
      tip: "水曜休館の年が多いです。半日は見込んでおくと安心",
      verify: true,
    },
  },
  {
    keywords: ["moma", "近代美術館", "モマ"],
    area: "Midtown",
    profile: {
      durationMin: 180,
      bestSlot: "morning",
      crowdSensitivity: 0.9,
      tip: "金曜夕方の無料枠は非常に混みます。開館直後が狙い目",
      verify: true,
    },
  },
  {
    keywords: ["whitney", "ホイットニー"],
    area: "Chelsea",
    profile: { durationMin: 120, bestSlot: "afternoon", closedDays: [2], crowdSensitivity: 0.7, verify: true },
  },
  {
    keywords: ["guggenheim", "グッゲンハイム"],
    area: "Upper East Side",
    profile: { durationMin: 120, bestSlot: "morning", crowdSensitivity: 0.7, verify: true },
  },
  {
    keywords: ["自由の女神", "statue of liberty", "リバティ島", "ellis island", "エリス島"],
    area: "Downtown",
    profile: {
      durationMin: 270,
      bestSlot: "morning",
      opensAt: "09:00",
      crowdSensitivity: 1,
      needsReservation: true,
      tip: "フェリーは事前予約必須。午前の早い便ほど空いています",
      verify: true,
    },
  },
  {
    keywords: ["empire state", "エンパイア"],
    area: "Midtown",
    profile: {
      durationMin: 90,
      bestSlot: "evening",
      crowdSensitivity: 0.9,
      needsReservation: true,
      tip: "日没前後が一番混みます。時間指定チケット推奨",
    },
  },
  {
    keywords: ["top of the rock", "トップ・オブ・ザ・ロック", "トップオブザロック"],
    area: "Midtown",
    profile: {
      durationMin: 90,
      bestSlot: "evening",
      crowdSensitivity: 0.9,
      needsReservation: true,
      tip: "サンセット枠は早く売り切れます",
    },
  },
  {
    keywords: ["summit", "サミット", "one vanderbilt"],
    area: "Midtown",
    profile: { durationMin: 90, bestSlot: "evening", crowdSensitivity: 0.9, needsReservation: true },
  },
  {
    keywords: ["brooklyn bridge", "ブルックリン・ブリッジ", "ブルックリンブリッジ"],
    area: "Downtown",
    profile: {
      durationMin: 90,
      bestSlot: "morning",
      crowdSensitivity: 0.9,
      tip: "朝8時前後は人が少なく写真も撮りやすいです",
    },
  },
  {
    keywords: ["central park", "セントラルパーク"],
    area: "Central Park",
    profile: { durationMin: 120, bestSlot: "morning", crowdSensitivity: 0.5 },
  },
  {
    keywords: ["high line", "ハイライン"],
    area: "Chelsea",
    profile: { durationMin: 75, bestSlot: "morning", crowdSensitivity: 0.7 },
  },
  {
    keywords: ["times square", "タイムズスクエア"],
    area: "Midtown",
    profile: {
      durationMin: 60,
      bestSlot: "evening",
      crowdSensitivity: 0.3,
      tip: "夜のネオンが本番。常に混雑しているので混雑回避の対象外です",
    },
  },
  {
    keywords: ["9/11", "911", "world trade", "ワールドトレード", "グラウンド・ゼロ", "one world"],
    area: "Downtown",
    profile: { durationMin: 150, bestSlot: "morning", crowdSensitivity: 0.8, verify: true },
  },
  {
    keywords: ["grand central", "グランド・セントラル", "グランドセントラル"],
    area: "Midtown",
    profile: { durationMin: 45, bestSlot: "any", crowdSensitivity: 0.4 },
  },
  {
    keywords: ["chelsea market", "チェルシー・マーケット", "チェルシーマーケット"],
    area: "Chelsea",
    profile: { durationMin: 90, bestSlot: "afternoon", crowdSensitivity: 0.7 },
  },
  {
    keywords: ["katz", "カッツ"],
    area: "Lower East Side",
    profile: {
      durationMin: 60,
      bestSlot: "any",
      crowdSensitivity: 0.9,
      tip: "昼のピーク(12〜14時)は行列。11時台か14時以降が快適",
    },
  },
  {
    keywords: ["broadway", "ブロードウェイ", "ミュージカル"],
    area: "Midtown",
    profile: {
      durationMin: 180,
      bestSlot: "evening",
      crowdSensitivity: 0.2,
      needsReservation: true,
      tip: "開演は夜19:00〜20:00が一般的。チケットは事前手配を",
    },
  },
  {
    keywords: ["dumbo", "ダンボ"],
    area: "Brooklyn",
    profile: { durationMin: 75, bestSlot: "morning", crowdSensitivity: 0.8 },
  },
  {
    keywords: ["williamsburg", "ウィリアムズバーグ"],
    area: "Brooklyn",
    profile: { durationMin: 120, bestSlot: "afternoon", crowdSensitivity: 0.5 },
  },
  {
    keywords: ["soho", "ソーホー"],
    area: "SoHo",
    profile: { durationMin: 120, bestSlot: "afternoon", crowdSensitivity: 0.6 },
  },
  {
    keywords: ["fifth avenue", "5th ave", "五番街"],
    area: "Midtown",
    profile: { durationMin: 90, bestSlot: "afternoon", crowdSensitivity: 0.6 },
  },
];

/** Resolves the effective planning profile for a place. */
export function profileFor(place: Place): VenueProfile {
  const base = CATEGORY_PROFILES[place.category];
  const haystack = `${place.name} ${place.area ?? ""}`.toLowerCase();
  const rule = VENUE_RULES.find((r) => r.keywords.some((k) => haystack.includes(k.toLowerCase())));

  const merged: VenueProfile = { ...base, ...(rule?.profile ?? {}) };

  // Explicit per-place settings always win over the knowledge base.
  if (place.durationMin) merged.durationMin = place.durationMin;
  if (place.bestSlot) merged.bestSlot = place.bestSlot;
  if (place.closedDays) merged.closedDays = place.closedDays;
  if (place.opensAt) merged.opensAt = place.opensAt;
  if (place.closesAt) merged.closesAt = place.closesAt;
  if (place.needsReservation !== undefined) merged.needsReservation = place.needsReservation;

  return merged;
}

/** Best-effort area label, used for clustering and travel estimates. */
export function areaFor(place: Place): string {
  if (place.area?.trim()) return normalizeArea(place.area);
  const haystack = place.name.toLowerCase();
  const rule = VENUE_RULES.find((r) => r.keywords.some((k) => haystack.includes(k.toLowerCase())));
  return rule?.area ? normalizeArea(rule.area) : "その他";
}

const AREA_ALIASES: [string[], string][] = [
  [["midtown", "ミッドタウン", "times square", "タイムズ", "rockefeller", "ロックフェラー"], "Midtown"],
  [["upper east", "アッパーイースト", "ues"], "Upper East Side"],
  [["upper west", "アッパーウエスト", "アッパーウェスト", "uws"], "Upper West Side"],
  [["central park", "セントラルパーク"], "Central Park"],
  [["chelsea", "チェルシー", "meatpacking", "ミートパッキング", "high line", "ハイライン"], "Chelsea"],
  [["soho", "ソーホー", "nolita", "ノリータ", "tribeca", "トライベッカ"], "SoHo"],
  [["lower east", "ロウアーイースト", "ローワーイースト", "les", "east village", "イーストビレッジ"], "Lower East Side"],
  [["greenwich", "グリニッチ", "west village", "ウエストビレッジ", "ウェストビレッジ"], "Greenwich Village"],
  [["downtown", "ダウンタウン", "financial", "ウォール", "wall st", "battery", "バッテリー"], "Downtown"],
  [["brooklyn", "ブルックリン", "dumbo", "ダンボ", "williamsburg", "ウィリアムズバーグ"], "Brooklyn"],
  [["harlem", "ハーレム"], "Harlem"],
  [["queens", "クイーンズ", "long island city", "lic"], "Queens"],
];

export function normalizeArea(raw: string): string {
  const lower = raw.toLowerCase();
  for (const [aliases, canonical] of AREA_ALIASES) {
    if (aliases.some((a) => lower.includes(a))) return canonical;
  }
  return raw.trim();
}

/** Rough subway travel time in minutes between two canonical areas. */
export function travelMinutes(from: string, to: string): number {
  if (from === to) return 10;
  const near: Record<string, string[]> = {
    Midtown: ["Central Park", "Chelsea", "Upper East Side", "Upper West Side"],
    "Central Park": ["Midtown", "Upper East Side", "Upper West Side"],
    "Upper East Side": ["Central Park", "Upper West Side", "Harlem", "Midtown"],
    "Upper West Side": ["Central Park", "Upper East Side", "Harlem", "Midtown"],
    Chelsea: ["Midtown", "Greenwich Village", "SoHo"],
    "Greenwich Village": ["Chelsea", "SoHo", "Lower East Side"],
    SoHo: ["Chelsea", "Greenwich Village", "Lower East Side", "Downtown"],
    "Lower East Side": ["SoHo", "Greenwich Village", "Downtown"],
    Downtown: ["SoHo", "Lower East Side", "Brooklyn"],
    Brooklyn: ["Downtown"],
    Harlem: ["Upper East Side", "Upper West Side"],
    Queens: ["Midtown"],
  };
  if (near[from]?.includes(to)) return 20;
  return 35;
}

const WEEKDAY_FACTOR: number[] = [
  1.35, // Sun
  0.85, // Mon
  0.8, // Tue
  0.85, // Wed
  0.95, // Thu
  1.15, // Fri
  1.45, // Sat
];

/** Time-of-day crowd curve per category, keyed by hour. */
function timeFactor(category: Category, hour: number): number {
  if (category === "restaurant") {
    if (hour >= 12 && hour < 14) return 1.5;
    if (hour >= 18.5 && hour < 21) return 1.4;
    if (hour >= 14 && hour < 17) return 0.6;
    return 0.9;
  }
  if (category === "museum") {
    if (hour < 11) return 0.6;
    if (hour < 13) return 1.1;
    if (hour < 16) return 1.4;
    return 0.9;
  }
  if (category === "park") {
    if (hour < 10) return 0.5;
    if (hour < 16) return 1.2;
    return 0.9;
  }
  // sightseeing / shopping / other
  if (hour < 10) return 0.6;
  if (hour < 12) return 0.9;
  if (hour < 16) return 1.3;
  if (hour < 19) return 1.2;
  return 0.9;
}

/**
 * Estimated crowd level, 1 (空いている) 〜 5 (非常に混雑).
 * Heuristic only — see the file header.
 */
export function estimateCrowd(place: Place, date: string, time: string): number {
  const profile = profileFor(place);
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const [h, m] = time.split(":").map(Number);
  const hour = h + (m || 0) / 60;

  const base = 2.4;
  const sensitivity = profile.crowdSensitivity;
  const raw =
    base *
    (1 + (WEEKDAY_FACTOR[weekday] - 1) * sensitivity) *
    (1 + (timeFactor(place.category, hour) - 1) * sensitivity);

  return Math.max(1, Math.min(5, Math.round(raw)));
}

export const CROWD_LABELS: Record<number, string> = {
  1: "空いている",
  2: "やや空き",
  3: "ふつう",
  4: "混雑",
  5: "非常に混雑",
};

export interface DateAdvisory {
  date: string;
  message: string;
  /** Advisory is inferred, not confirmed — the UI marks it 要確認. */
  verify?: boolean;
}

/**
 * Date-specific warnings for the trip window. These are pattern-based guesses
 * (e.g. the UN General Assembly high-level week usually lands in late
 * September and closes streets around UN headquarters); they are always shown
 * as "要確認" rather than as fact.
 */
export function advisoriesFor(dates: string[]): DateAdvisory[] {
  const out: DateAdvisory[] = [];
  for (const date of dates) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const weekday = d.getDay();
    const month = d.getMonth() + 1;
    const day = d.getDate();

    if (month === 9 && day >= 20 && day <= 27) {
      out.push({
        date,
        message:
          "国連総会(UNGA)ハイレベル週と重なる可能性があります。ミッドタウン東側(国連本部周辺)は交通規制と渋滞が起きやすいので、この時期は地下鉄移動が無難です。",
        verify: true,
      });
    }
    if (weekday === 6 || weekday === 0) {
      out.push({
        date,
        message: "週末は主要スポットが最も混みます。人気の場所は開館直後を狙うのがおすすめです。",
      });
    }
    if (weekday === 1) {
      out.push({
        date,
        message: "月曜は休館の美術館・博物館が多い曜日です。訪問前に開館日を確認してください。",
        verify: true,
      });
    }
  }
  return out;
}
