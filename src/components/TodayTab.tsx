import { useEffect, useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { TabKey } from "./TabBar";
import { ReservationLine } from "./ReservationsTab";
import { useWeather } from "../hooks/useWeather";
import {
  clothingAdvice,
  DayForecast,
  describeCode,
  LATE_SEPTEMBER_NORMALS,
} from "../utils/weather";
import { dateRange, daysUntil, formatDateLabel, sortScheduleItems } from "../utils/date";
import { PACKING_OWNER_LABELS, PackingOwner } from "../types";
import { Scene } from "./Scene";

/** New York local time, wherever the phone happens to think it is. */
const NY_TZ = "America/New_York";
const JP_TZ = "Asia/Tokyo";

function timeIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

function dayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

/** YYYY-MM-DD for "today" as New York sees it. */
function nyDateKey(now: Date): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the key format used here.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function TodayTab({ trip, onNavigate }: { trip: TripStore; onNavigate: (tab: TabKey) => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const weather = useWeather(trip.tripInfo.startDate, trip.tripInfo.endDate);
  const dates = dateRange(trip.tripInfo.startDate, trip.tripInfo.endDate);

  // During the trip the day that matters is the New York day, not the
  // device's — a phone still on Japan time would skip ahead by one.
  const nyToday = nyDateKey(now);
  const duringTrip = dates.includes(nyToday);
  const beforeTrip = nyToday < trip.tripInfo.startDate;
  const activeDate = duringTrip ? nyToday : trip.tripInfo.startDate;
  const dayNumber = dates.indexOf(activeDate) + 1;

  const todaysItems = useMemo(
    () => sortScheduleItems(trip.scheduleItems.filter((i) => i.date === activeDate)),
    [trip.scheduleItems, activeDate],
  );
  const todaysReservations = useMemo(
    () =>
      trip.reservations
        .filter((r) => r.date === activeDate)
        .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    [trip.reservations, activeDate],
  );

  return (
    <div className="tab-content">
      <Clocks now={now} />

      {beforeTrip && <BeforeTrip trip={trip} onNavigate={onNavigate} />}

      {duringTrip ? (
        <>
          <div className="td-dayhead">
            <span className="td-daynum">DAY {dayNumber}</span>
            <span className="td-daydate">{formatDateLabel(activeDate)}</span>
          </div>
          <WeatherCard
            forecast={weather.forDate(activeDate)}
            date={activeDate}
            state={weather.state}
            error={weather.error}
            fetchedAt={weather.fetchedAt}
            onRefresh={weather.refresh}
          />

          {todaysReservations.length > 0 && (
            <section className="td-section">
              <h3>今日の予約</h3>
              {todaysReservations.map((r) => (
                <ReservationLine key={r.id} reservation={r} />
              ))}
            </section>
          )}

          <section className="td-section">
            <h3>今日の予定</h3>
            {todaysItems.length === 0 ? (
              <p className="empty-state">今日の予定はまだありません。</p>
            ) : (
              todaysItems.map((item) => (
                <div key={item.id} className="td-item">
                  <span className="td-time">{item.time ?? "--:--"}</span>
                  <span className="td-item-main">
                    <span className="td-item-title">{item.title}</span>
                    {item.note && <span className="td-item-note">{item.note}</span>}
                  </span>
                </div>
              ))
            )}
            <button className="btn-secondary btn-block" onClick={() => onNavigate("itinerary")}>
              しおりで全日程を見る
            </button>
          </section>
        </>
      ) : (
        !beforeTrip && (
          <section className="td-section">
            <div className="hero hero-small">
              <Scene scene="skyline" />
              <div className="hero-overlay">
                <h2>おかえりなさい</h2>
                <p>しおりに旅の記録が残っています</p>
              </div>
            </div>
            <button className="btn-secondary btn-block" onClick={() => onNavigate("itinerary")}>
              しおりを見る
            </button>
          </section>
        )
      )}

      {beforeTrip && (
        <section className="td-section">
          <div className="tab-header-row">
            <h3>旅行中の天気</h3>
            <button className="btn-small" onClick={weather.refresh} disabled={weather.state === "loading"}>
              {weather.state === "loading" ? "取得中…" : "更新"}
            </button>
          </div>
          {weather.error && <p className="td-weather-error">⚠️ {weather.error}</p>}
          {dates.map((date) => (
            <ForecastRow key={date} date={date} forecast={weather.forDate(date)} />
          ))}
          <p className="td-weather-note">
            予報は約16日先までです。それより先の日は9月下旬の平年値(最高{LATE_SEPTEMBER_NORMALS.maxC}
            ℃前後・最低{LATE_SEPTEMBER_NORMALS.minC}℃前後)を目安にしてください。
            {weather.fetchedAt && ` 最終取得:${new Date(weather.fetchedAt).toLocaleString("ja-JP")}`}
          </p>
        </section>
      )}
    </div>
  );
}

function Clocks({ now }: { now: Date }) {
  return (
    <div className="td-clocks">
      <div className="td-clock primary">
        <span className="td-clock-city">ニューヨーク</span>
        <strong className="td-clock-time">{timeIn(NY_TZ, now)}</strong>
        <span className="td-clock-date">{dayIn(NY_TZ, now)}</span>
      </div>
      <div className="td-clock">
        <span className="td-clock-city">日本</span>
        <strong className="td-clock-time">{timeIn(JP_TZ, now)}</strong>
        <span className="td-clock-date">{dayIn(JP_TZ, now)}</span>
      </div>
    </div>
  );
}

function BeforeTrip({ trip, onNavigate }: { trip: TripStore; onNavigate: (tab: TabKey) => void }) {
  const left = daysUntil(trip.tripInfo.startDate);

  const packing = (["me", "partner"] as PackingOwner[]).map((owner) => {
    const items = trip.packingItems.filter((i) => i.owner === owner);
    return {
      owner,
      done: items.filter((i) => i.packed).length,
      total: items.length,
    };
  });
  const shared = trip.packingItems.filter((i) => i.owner === "shared");

  // Cancellation deadlines are the one thing here that is genuinely urgent.
  const deadlines = trip.reservations
    .filter((r) => r.cancelBy)
    .map((r) => ({ r, left: daysUntil(r.cancelBy!) }))
    .filter((d) => d.left !== null && d.left >= 0 && d.left <= 7)
    .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));

  return (
    <>
      <div className="td-countdown">
        <span className="td-countdown-num">{left ?? 0}</span>
        <span className="td-countdown-label">日後に出発</span>
      </div>

      {deadlines.length > 0 && (
        <div className="td-alert">
          <strong>キャンセル期限が近い予約</strong>
          {deadlines.map(({ r, left: d }) => (
            <p key={r.id}>
              {r.title} — {d === 0 ? "今日まで" : `あと${d}日`}
            </p>
          ))}
        </div>
      )}

      <section className="td-section">
        <h3>出発準備</h3>
        <div className="td-prep">
          {packing.map((p) => (
            <button key={p.owner} className="td-prep-card" onClick={() => onNavigate("packing")}>
              <span className="td-prep-label">{PACKING_OWNER_LABELS[p.owner]}の持ち物</span>
              <strong>
                {p.total === 0 ? "未登録" : `${p.done}/${p.total}`}
              </strong>
            </button>
          ))}
          <button className="td-prep-card" onClick={() => onNavigate("packing")}>
            <span className="td-prep-label">共通の持ち物</span>
            <strong>
              {shared.length === 0
                ? "未登録"
                : `${shared.filter((i) => i.packed).length}/${shared.length}`}
            </strong>
          </button>
          <button className="td-prep-card" onClick={() => onNavigate("reservations")}>
            <span className="td-prep-label">予約</span>
            <strong>{trip.reservations.length}件</strong>
          </button>
        </div>
      </section>
    </>
  );
}

function WeatherCard({
  forecast,
  date,
  state,
  error,
  fetchedAt,
  onRefresh,
}: {
  forecast: DayForecast | null;
  date: string;
  state: string;
  error: string | null;
  fetchedAt: number | null;
  onRefresh: () => void;
}) {
  if (!forecast) {
    return (
      <div className="card td-weather">
        <div className="td-weather-head">
          <span>{formatDateLabel(date)}の天気</span>
          <button className="btn-small" onClick={onRefresh} disabled={state === "loading"}>
            {state === "loading" ? "取得中…" : "取得"}
          </button>
        </div>
        <p className="td-weather-note">
          {error
            ? `⚠️ ${error}`
            : "まだ予報を取得していません。オンラインのときに「取得」を押してください。"}
        </p>
      </div>
    );
  }

  const { icon, label } = describeCode(forecast.code);
  return (
    <div className="card td-weather">
      <div className="td-weather-head">
        <span>{formatDateLabel(date)}の天気</span>
        <button className="btn-small" onClick={onRefresh} disabled={state === "loading"}>
          {state === "loading" ? "取得中…" : "更新"}
        </button>
      </div>
      <div className="td-weather-main">
        <span className="td-weather-icon">{icon}</span>
        <div>
          <strong className="td-weather-temp">
            {Math.round(forecast.maxC)}° / {Math.round(forecast.minC)}°
          </strong>
          <span className="td-weather-label">
            {label} · 降水 {forecast.rainChance}%
          </span>
        </div>
      </div>
      <p className="td-weather-advice">👕 {clothingAdvice(forecast)}</p>
      {error && <p className="td-weather-error">⚠️ {error}</p>}
      {fetchedAt && (
        <p className="td-weather-note">
          最終取得:{new Date(fetchedAt).toLocaleString("ja-JP")}
        </p>
      )}
    </div>
  );
}

function ForecastRow({ date, forecast }: { date: string; forecast: DayForecast | null }) {
  const desc = forecast ? describeCode(forecast.code) : null;
  return (
    <div className="td-fc-row">
      <span className="td-fc-date">{formatDateLabel(date)}</span>
      {forecast && desc ? (
        <>
          <span className="td-fc-icon">{desc.icon}</span>
          <span className="td-fc-temp">
            {Math.round(forecast.maxC)}° / {Math.round(forecast.minC)}°
          </span>
          <span className="td-fc-rain">☔{forecast.rainChance}%</span>
        </>
      ) : (
        <span className="td-fc-none">予報なし(平年値の目安)</span>
      )}
    </div>
  );
}
