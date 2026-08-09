import { useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { dateRange, formatDateLabel, sortScheduleItems } from "../utils/date";
import { ScheduleItemForm } from "./ScheduleItemForm";
import { mapsSearchUrl } from "../utils/maps";

export function ScheduleTab({ trip }: { trip: TripStore }) {
  const dates = dateRange(trip.tripInfo.startDate, trip.tripInfo.endDate);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? trip.tripInfo.startDate);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const itemsForDay = sortScheduleItems(
    trip.scheduleItems.filter((i) => i.date === selectedDate),
  );

  return (
    <div className="tab-content">
      <h2>スケジュール</h2>

      <div className="day-pills">
        {dates.map((d) => (
          <button
            key={d}
            className={`day-pill ${d === selectedDate ? "active" : ""}`}
            onClick={() => {
              setSelectedDate(d);
              setAdding(false);
              setEditingId(null);
            }}
          >
            {formatDateLabel(d)}
          </button>
        ))}
      </div>

      <div className="tab-header-row">
        <h3>{formatDateLabel(selectedDate)}の予定</h3>
        {!adding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + 予定を追加
          </button>
        )}
      </div>

      {adding && (
        <ScheduleItemForm
          date={selectedDate}
          places={trip.places}
          onSubmit={(item) => {
            trip.addScheduleItem(item);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {itemsForDay.length === 0 && !adding && (
        <p className="empty-state">まだ予定がありません。「行きたい場所」タブから追加するか、ここで直接追加できます。</p>
      )}

      <ol className="schedule-list">
        {itemsForDay.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="schedule-item-editing">
              <ScheduleItemForm
                date={selectedDate}
                places={trip.places}
                initial={item}
                onSubmit={(patch) => {
                  trip.updateScheduleItem(item.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="schedule-item">
              <div className="schedule-item-time">{item.time || "時刻未定"}</div>
              <div className="schedule-item-body">
                <strong>{item.title}</strong>
                {item.duration && <span className="duration-tag">{item.duration}分</span>}
                {item.note && <p className="schedule-item-note">{item.note}</p>}
                <a
                  className="maps-link"
                  href={item.mapsUrl || mapsSearchUrl(item.title)}
                  target="_blank"
                  rel="noreferrer"
                >
                  🗺️ マップで見る
                </a>
              </div>
              <div className="schedule-item-actions">
                <button className="btn-small" onClick={() => setEditingId(item.id)}>
                  編集
                </button>
                <button
                  className="btn-small btn-danger"
                  onClick={() => trip.removeScheduleItem(item.id)}
                >
                  削除
                </button>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
