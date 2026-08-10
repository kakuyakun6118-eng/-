import { TripStore } from "../hooks/useTrip";
import { dateRange, formatDateLabel, sortScheduleItems } from "../utils/date";
import { mapsSearchUrl } from "../utils/maps";
import { assignScenes, Scene } from "./Scene";
import { CrowdBadge } from "./AutoPlanTab";

/**
 * Auto-generated meal placeholders ("ランチ(自由)") aren't real venues, so a
 * map search for their title would just be noise.
 */
function hasLocation(item: { placeId?: string; mapsUrl?: string; auto?: boolean }): boolean {
  return Boolean(item.placeId || item.mapsUrl || !item.auto);
}

function buildShareText(trip: TripStore): string {
  const dates = dateRange(trip.tripInfo.startDate, trip.tripInfo.endDate);
  const lines: string[] = ["NY旅のしおり", ""];

  if (trip.tripInfo.hotelName) {
    lines.push(`【宿泊先】${trip.tripInfo.hotelName}`);
    if (trip.tripInfo.hotelAddress) lines.push(trip.tripInfo.hotelAddress);
    lines.push("");
  }

  for (const date of dates) {
    lines.push(`■ ${formatDateLabel(date)}`);
    const items = sortScheduleItems(trip.scheduleItems.filter((i) => i.date === date));
    if (items.length === 0) {
      lines.push("  (予定なし)");
    }
    for (const item of items) {
      lines.push(`  ${item.time ?? "--:--"} ${item.title}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function ItineraryTab({ trip }: { trip: TripStore }) {
  const dates = dateRange(trip.tripInfo.startDate, trip.tripInfo.endDate);

  // Each day's banner follows what is actually planned that day.
  const scenes = assignScenes(
    dates.map((date) =>
      trip.scheduleItems
        .filter((i) => i.date === date)
        .map((i) => i.title)
        .join(" "),
    ),
  );

  const handleShare = async () => {
    const text = buildShareText(trip);
    if (navigator.share) {
      try {
        await navigator.share({ title: "NY旅のしおり", text });
      } catch {
        // user cancelled; no-op
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert("しおりの内容をコピーしました");
    }
  };

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>しおり</h2>
        <button className="btn-primary" onClick={handleShare}>
          共有
        </button>
      </div>

      {trip.tripInfo.hotelName && (
        <div className="hotel-card">
          <h3>🏨 {trip.tripInfo.hotelName}</h3>
          {trip.tripInfo.hotelAddress && <p>{trip.tripInfo.hotelAddress}</p>}
          <p className="hotel-dates">
            {trip.tripInfo.checkIn && `チェックイン ${trip.tripInfo.checkIn}`}
            {trip.tripInfo.checkIn && trip.tripInfo.checkOut && " / "}
            {trip.tripInfo.checkOut && `チェックアウト ${trip.tripInfo.checkOut}`}
          </p>
          <a
            className="maps-link"
            href={
              trip.tripInfo.hotelMapsUrl || mapsSearchUrl(trip.tripInfo.hotelAddress || trip.tripInfo.hotelName)
            }
            target="_blank"
            rel="noreferrer"
          >
            🗺️ マップで見る
          </a>
        </div>
      )}

      {dates.map((date, index) => {
        const items = sortScheduleItems(trip.scheduleItems.filter((i) => i.date === date));
        return (
          <section key={date} className="itinerary-day">
            <div className="day-banner">
              <Scene scene={scenes[index]} />
              <div className="day-banner-label">
                <span className="day-banner-num">DAY {index + 1}</span>
                <span className="day-banner-date">{formatDateLabel(date)}</span>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="empty-state">予定なし</p>
            ) : (
              <ol className="itinerary-list">
                {items.map((item) => (
                  <li key={item.id} className="itinerary-item">
                    <div className="itinerary-time">{item.time || "-"}</div>
                    <div className="itinerary-body">
                      <strong>{item.title}</strong>
                      {item.duration && <span className="duration-tag">{item.duration}分</span>}
                      {item.crowdLevel && <CrowdBadge level={item.crowdLevel} />}
                      {item.note && <p className="schedule-item-note">{item.note}</p>}
                      {hasLocation(item) && (
                        <a
                          className="maps-link"
                          href={item.mapsUrl || mapsSearchUrl(item.title)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          🗺️ ナビ
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
