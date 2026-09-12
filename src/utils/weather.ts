/**
 * Weather for the trip, from Open-Meteo (https://open-meteo.com/).
 *
 * Picked because it needs no API key and no account: nothing to configure,
 * nothing to leak in a public GitHub Pages build. The forecast only reaches
 * ~16 days out, so before that the app shows the late-September averages
 * instead of pretending to know.
 */

/** Manhattan. Close enough for a city-wide daily forecast. */
const NYC_LAT = 40.7484;
const NYC_LON = -73.9857;

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY = "ny-trip:weather";

export interface DayForecast {
  date: string; // YYYY-MM-DD
  maxC: number;
  minC: number;
  /** WMO weather code. */
  code: number;
  /** Percent, 0-100. */
  rainChance: number;
}

export interface WeatherCache {
  fetchedAt: number;
  /** The range this forecast was fetched for. */
  start: string;
  end: string;
  days: DayForecast[];
}

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
}

export function parseForecast(json: unknown): DayForecast[] {
  const daily = (json as OpenMeteoResponse)?.daily;
  const time = daily?.time;
  if (!Array.isArray(time)) return [];

  const days: DayForecast[] = [];
  for (let i = 0; i < time.length; i++) {
    const maxC = daily?.temperature_2m_max?.[i];
    const minC = daily?.temperature_2m_min?.[i];
    if (typeof maxC !== "number" || typeof minC !== "number") continue;
    days.push({
      date: time[i],
      maxC,
      minC,
      code: daily?.weather_code?.[i] ?? 0,
      rainChance: daily?.precipitation_probability_max?.[i] ?? 0,
    });
  }
  return days;
}

export async function fetchForecast(start: string, end: string): Promise<DayForecast[]> {
  const url =
    `${ENDPOINT}?latitude=${NYC_LAT}&longitude=${NYC_LON}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    `&timezone=America%2FNew_York&start_date=${start}&end_date=${end}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`天気の取得に失敗しました (${res.status})`);
  return parseForecast(await res.json());
}

export function readCache(): WeatherCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherCache;
    return Array.isArray(parsed?.days) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(days: DayForecast[], start: string, end: string): WeatherCache {
  const cache: WeatherCache = { fetchedAt: Date.now(), start, end, days };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private browsing / full quota. The in-memory copy still works today.
  }
  return cache;
}

/**
 * WMO weather interpretation codes, grouped to the level of detail that
 * actually changes what you put on.
 */
export function describeCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "快晴" };
  if (code <= 2) return { icon: "🌤️", label: "晴れ" };
  if (code === 3) return { icon: "☁️", label: "くもり" };
  if (code <= 48) return { icon: "🌫️", label: "霧" };
  if (code <= 55) return { icon: "🌦️", label: "霧雨" };
  if (code <= 57) return { icon: "🌧️", label: "着氷性の霧雨" };
  if (code <= 65) return { icon: "🌧️", label: "雨" };
  if (code <= 67) return { icon: "🌧️", label: "着氷性の雨" };
  if (code <= 77) return { icon: "🌨️", label: "雪" };
  if (code <= 82) return { icon: "🌦️", label: "にわか雨" };
  if (code <= 86) return { icon: "🌨️", label: "にわか雪" };
  return { icon: "⛈️", label: "雷雨" };
}

/** What to actually wear, from the day's spread rather than one temperature. */
export function clothingAdvice(day: DayForecast): string {
  const tips: string[] = [];

  if (day.maxC >= 26) tips.push("日中は半袖で十分");
  else if (day.maxC >= 21) tips.push("日中は長袖シャツ1枚で快適");
  else if (day.maxC >= 16) tips.push("日中も長袖+薄手の羽織りが安心");
  else tips.push("日中もしっかり上着が必要");

  if (day.minC <= 12) tips.push("朝晩は冷えるのでジャケット必須");
  else if (day.minC <= 17) tips.push("朝晩は肌寒いので羽織りものを");

  if (day.maxC - day.minC >= 10) tips.push("寒暖差が大きいので重ね着で調節を");

  if (day.rainChance >= 60) tips.push("雨の可能性が高いので傘を");
  else if (day.rainChance >= 30) tips.push("折りたたみ傘があると安心");

  return tips.join("。") + "。";
}

/**
 * Climate normals for late September in New York, used for days the forecast
 * does not reach yet. Labelled as averages in the UI so they are never
 * mistaken for a real forecast.
 */
export const LATE_SEPTEMBER_NORMALS = { maxC: 24, minC: 16 };
