export type TabKey =
  | "today"
  | "schedule"
  | "itinerary"
  | "money"
  | "more"
  // Reached from the "もっと" hub rather than the bar itself.
  | "places"
  | "plan"
  | "packing"
  | "reservations"
  | "phrases"
  | "settings";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "today", label: "今日", icon: "🏠" },
  { key: "schedule", label: "予定", icon: "🗓️" },
  { key: "itinerary", label: "しおり", icon: "📖" },
  { key: "money", label: "お金", icon: "💵" },
  { key: "more", label: "もっと", icon: "⋯" },
];

/** Screens that live under "もっと", which keeps that tab lit while you are in one. */
export const SECONDARY_TABS: TabKey[] = [
  "places",
  "plan",
  "packing",
  "reservations",
  "phrases",
  "settings",
];

export const TAB_TITLES: Partial<Record<TabKey, string>> = {
  places: "行きたい場所",
  plan: "AI提案",
  packing: "持ち物",
  reservations: "予約・チケット",
  phrases: "旅の英会話",
  settings: "設定",
};

export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  const effective = SECONDARY_TABS.includes(active) ? "more" : active;
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`tab-button ${effective === t.key ? "active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
