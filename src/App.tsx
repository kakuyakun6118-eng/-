import { useEffect, useState } from "react";
import { useTrip } from "./hooks/useTrip";
import { TabBar, TabKey } from "./components/TabBar";
import { PlacesTab } from "./components/PlacesTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { ItineraryTab } from "./components/ItineraryTab";
import { SettingsTab } from "./components/SettingsTab";
import { AutoPlanTab } from "./components/AutoPlanTab";
import { PhrasesTab } from "./components/PhrasesTab";
import { Scene } from "./components/Scene";
import { dateRange, daysUntil, formatDateLabel } from "./utils/date";
import { AuthStatus, subscribeAuthStatus } from "./firebase";

export default function App() {
  const [tab, setTab] = useState<TabKey>("places");
  const [auth, setAuth] = useState<AuthStatus>({ state: "pending" });
  const trip = useTrip();

  useEffect(() => subscribeAuthStatus(setAuth), []);

  const nights = Math.max(0, dateRange(trip.tripInfo.startDate, trip.tripInfo.endDate).length - 1);
  const countdown = daysUntil(trip.tripInfo.startDate);

  return (
    <div className="app">
      <header className="app-header">
        <Scene scene="skyline" className="header-scene" />
        <div className="app-header-inner">
          <div className="header-titles">
            <h1>NEW YORK</h1>
            <p className="header-sub">
              {formatDateLabel(trip.tripInfo.startDate)} – {formatDateLabel(trip.tripInfo.endDate)}
              {nights > 0 && ` · ${nights}泊`}
            </p>
          </div>
          {countdown !== null && countdown > 0 && (
            <div className="countdown">
              <span className="countdown-num">{countdown}</span>
              <span className="countdown-label">日後</span>
            </div>
          )}
        </div>
        {!trip.isShared && (
          <p className="header-note">
            この端末だけに保存中です。2人で共有するにはFirebase設定が必要です(設定タブ参照)
          </p>
        )}
        {/* Without a signed-in user every Firestore write is rejected, so the
            app would look like it just doesn't save. Say so up front. */}
        {trip.isShared && auth.state === "error" && (
          <p className="header-note header-alert">
            ⚠️ 共有サーバーにログインできていないため保存できません。設定タブの「動作状況」をご確認ください
          </p>
        )}
        {trip.isShared && auth.state !== "error" && trip.syncError && (
          <p className="header-note header-alert">⚠️ {trip.syncError}</p>
        )}
      </header>

      <main className="app-main">
        {trip.loading ? (
          <p className="loading">読み込み中...</p>
        ) : (
          <>
            {tab === "places" && <PlacesTab trip={trip} />}
            {tab === "plan" && <AutoPlanTab trip={trip} />}
            {tab === "schedule" && <ScheduleTab trip={trip} />}
            {tab === "itinerary" && <ItineraryTab trip={trip} />}
            {tab === "phrases" && <PhrasesTab trip={trip} />}
            {tab === "settings" && <SettingsTab trip={trip} />}
          </>
        )}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
