import { useState } from "react";
import { useTrip } from "./hooks/useTrip";
import { TabBar, TabKey } from "./components/TabBar";
import { PlacesTab } from "./components/PlacesTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { ItineraryTab } from "./components/ItineraryTab";
import { SettingsTab } from "./components/SettingsTab";

export default function App() {
  const [tab, setTab] = useState<TabKey>("places");
  const trip = useTrip();

  return (
    <div className="app">
      <header className="app-header">
        <h1>NY旅のしおり</h1>
        {!trip.isShared && (
          <p className="header-note">
            この端末だけに保存中です。2人で共有するにはFirebase設定が必要です(設定タブ参照)
          </p>
        )}
      </header>

      <main className="app-main">
        {trip.loading ? (
          <p className="loading">読み込み中...</p>
        ) : (
          <>
            {tab === "places" && <PlacesTab trip={trip} />}
            {tab === "schedule" && <ScheduleTab trip={trip} />}
            {tab === "itinerary" && <ItineraryTab trip={trip} />}
            {tab === "settings" && <SettingsTab trip={trip} />}
          </>
        )}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
