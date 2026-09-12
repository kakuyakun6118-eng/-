import { TripStore } from "../hooks/useTrip";
import { TabKey } from "./TabBar";

/**
 * With eleven screens there is no honest way to fit everything in a bottom
 * bar on a phone. The four things used every day stay in the bar; the rest
 * live here, with a count so you can see the state without opening them.
 */
export function MoreTab({
  trip,
  onNavigate,
}: {
  trip: TripStore;
  onNavigate: (tab: TabKey) => void;
}) {
  const packedTotal = trip.packingItems.length;
  const packedDone = trip.packingItems.filter((i) => i.packed).length;

  const entries: { key: TabKey; icon: string; label: string; sub: string }[] = [
    {
      key: "places",
      icon: "📍",
      label: "行きたい場所",
      sub: `${trip.places.length}件 · まとめて取り込みもここ`,
    },
    {
      key: "plan",
      icon: "✨",
      label: "AI提案",
      sub: "登録した場所から日程を自動作成",
    },
    {
      key: "packing",
      icon: "🧳",
      label: "持ち物",
      sub: packedTotal === 0 ? "まだ登録がありません" : `${packedDone}/${packedTotal} 準備ずみ`,
    },
    {
      key: "reservations",
      icon: "🎫",
      label: "予約・チケット",
      sub: trip.reservations.length === 0 ? "まだ登録がありません" : `${trip.reservations.length}件`,
    },
    {
      key: "phrases",
      icon: "🗣️",
      label: "旅の英会話",
      sub: "フレーズをクイズで練習",
    },
    {
      key: "settings",
      icon: "⚙️",
      label: "設定",
      sub: "日程・宿泊先・レート・動作状況",
    },
  ];

  return (
    <div className="tab-content">
      <h2>もっと</h2>
      <div className="more-list">
        {entries.map((e) => (
          <button key={e.key} className="more-row" onClick={() => onNavigate(e.key)}>
            <span className="more-icon">{e.icon}</span>
            <span className="more-main">
              <span className="more-label">{e.label}</span>
              <span className="more-sub">{e.sub}</span>
            </span>
            <span className="more-chevron">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
