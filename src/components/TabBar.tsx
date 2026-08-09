export type TabKey = "places" | "schedule" | "itinerary" | "settings";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "places", label: "行きたい場所", icon: "📍" },
  { key: "schedule", label: "スケジュール", icon: "🗓️" },
  { key: "itinerary", label: "しおり", icon: "📖" },
  { key: "settings", label: "設定", icon: "⚙️" },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`tab-button ${active === t.key ? "active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
