import { useCallback, useEffect, useState } from "react";
import { DayForecast, fetchForecast, readCache, writeCache } from "../utils/weather";

export type WeatherState = "idle" | "loading" | "ok" | "error";

const ONE_HOUR = 3600_000;

/**
 * The forecast is cached in localStorage and shown even when a refresh fails,
 * because the moment you most want to know whether to take a jacket is the
 * moment you are on the subway with no signal.
 */
export function useWeather(startDate: string, endDate: string) {
  // A cache for a different range is useless here — the trip dates changed —
  // so it is dropped rather than left on screen as a set of blank days.
  const cached = readCache();
  const usable = cached && cached.start === startDate && cached.end === endDate ? cached : null;

  const [days, setDays] = useState<DayForecast[]>(usable?.days ?? []);
  const [fetchedAt, setFetchedAt] = useState<number | null>(usable?.fetchedAt ?? null);
  const [state, setState] = useState<WeatherState>(usable ? "ok" : "idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!startDate || !endDate) return;
    setState("loading");
    setError(null);
    try {
      const fresh = await fetchForecast(startDate, endDate);
      const cache = writeCache(fresh, startDate, endDate);
      setDays(fresh);
      setFetchedAt(cache.fetchedAt);
      setState("ok");
    } catch (err) {
      console.error("weather fetch failed", err);
      setError(
        err instanceof Error
          ? `${err.message}(オフラインかもしれません)`
          : "天気を取得できませんでした",
      );
      // Keep whatever was cached on screen rather than blanking it out.
      setState("error");
    }
  }, [startDate, endDate]);

  // Refetch when the range changes, and otherwise at most once an hour.
  useEffect(() => {
    const fresh = readCache();
    const matches = fresh && fresh.start === startDate && fresh.end === endDate;
    if (matches) {
      setDays(fresh.days);
      setFetchedAt(fresh.fetchedAt);
      setState("ok");
      if (Date.now() - fresh.fetchedAt <= ONE_HOUR) return;
    } else {
      setDays([]);
      setFetchedAt(null);
    }
    refresh();
  }, [refresh, startDate, endDate]);

  const forDate = useCallback(
    (date: string) => days.find((d) => d.date === date) ?? null,
    [days],
  );

  return { days, forDate, state, error, fetchedAt, refresh };
}
