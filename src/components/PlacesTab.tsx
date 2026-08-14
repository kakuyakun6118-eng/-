import { useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { CATEGORY_LABELS, Place, PRIORITY_LABELS, Priority } from "../types";
import { PlaceForm } from "./PlaceForm";
import { AddToScheduleForm } from "./AddToScheduleForm";
import { ImportPanel } from "./ImportPanel";
import { mapsSearchUrl } from "../utils/maps";

const PRIORITY_ORDER: Priority[] = ["must", "want", "if-time"];

export function PlacesTab({ trip }: { trip: TripStore }) {
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  const grouped = PRIORITY_ORDER.map((priority) => ({
    priority,
    places: trip.places.filter((p) => p.priority === priority),
  })).filter((g) => g.places.length > 0);

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>行きたい場所 ({trip.places.length})</h2>
        {!adding && !importing && (
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => setImporting(true)}>
              ⬇ まとめて取り込み
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              + 追加
            </button>
          </div>
        )}
      </div>

      {importing && (
        <ImportPanel
          onClose={() => setImporting(false)}
          onImport={async (places) => {
            for (const place of places) {
              await trip.addPlace(place);
            }
          }}
        />
      )}

      {adding && (
        <PlaceForm
          onSubmit={(place) => {
            trip.addPlace(place);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {trip.places.length === 0 && !adding && !importing && (
        <p className="empty-state">
          Googleマップの保存リストからまとめて取り込むか、1つずつ追加してください。
          「⬇ まとめて取り込み」が手早いです。
        </p>
      )}

      {grouped.map((group) => (
        <section key={group.priority} className="place-group">
          <h3>{PRIORITY_LABELS[group.priority]}</h3>
          {group.places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              trip={trip}
              editing={editingId === place.id}
              scheduling={schedulingId === place.id}
              onStartEdit={() => setEditingId(place.id)}
              onStopEdit={() => setEditingId(null)}
              onStartSchedule={() => setSchedulingId(place.id)}
              onStopSchedule={() => setSchedulingId(null)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function PlaceCard({
  place,
  trip,
  editing,
  scheduling,
  onStartEdit,
  onStopEdit,
  onStartSchedule,
  onStopSchedule,
}: {
  place: Place;
  trip: TripStore;
  editing: boolean;
  scheduling: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onStartSchedule: () => void;
  onStopSchedule: () => void;
}) {
  if (editing) {
    return (
      <div className="place-card">
        <PlaceForm
          initial={place}
          onSubmit={(patch) => {
            trip.updatePlace(place.id, patch);
            onStopEdit();
          }}
          onCancel={onStopEdit}
        />
      </div>
    );
  }

  const link = place.mapsUrl || mapsSearchUrl(`${place.name} ${place.area ?? ""}`.trim());

  return (
    <div className="place-card">
      <div className="place-card-main">
        <div className="place-card-title">
          <span className="category-tag">{CATEGORY_LABELS[place.category]}</span>
          <strong>{place.name}</strong>
        </div>
        {place.area && <p className="place-area">{place.area}</p>}
        {place.note && <p className="place-note">{place.note}</p>}
        <a className="maps-link" href={link} target="_blank" rel="noreferrer">
          🗺️ マップで見る
        </a>
      </div>
      <div className="place-card-actions">
        <button className="btn-small" onClick={onStartSchedule}>
          予定に追加
        </button>
        <button className="btn-small" onClick={onStartEdit}>
          編集
        </button>
        <button
          className="btn-small btn-danger"
          onClick={() => {
            if (confirm(`「${place.name}」を削除しますか?`)) trip.removePlace(place.id);
          }}
        >
          削除
        </button>
      </div>

      {scheduling && (
        <AddToScheduleForm
          place={place}
          startDate={trip.tripInfo.startDate}
          endDate={trip.tripInfo.endDate}
          onAdd={({ date, time, duration }) => {
            trip.addScheduleItem({
              date,
              time,
              duration,
              title: place.name,
              placeId: place.id,
              mapsUrl: place.mapsUrl,
              order: Date.now(),
            });
            onStopSchedule();
          }}
          onCancel={onStopSchedule}
        />
      )}
    </div>
  );
}
