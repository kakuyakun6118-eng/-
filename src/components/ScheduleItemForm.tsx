import { FormEvent, useState } from "react";
import { NewScheduleItem, Place, ScheduleItem } from "../types";

export function ScheduleItemForm({
  date,
  places,
  initial,
  onSubmit,
  onCancel,
}: {
  date: string;
  places: Place[];
  initial?: ScheduleItem;
  onSubmit: (item: NewScheduleItem) => void;
  onCancel: () => void;
}) {
  const [placeId, setPlaceId] = useState(initial?.placeId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [duration, setDuration] = useState(initial?.duration?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const selectedPlace = places.find((p) => p.id === placeId);
    const resolvedTitle = title.trim() || selectedPlace?.name || "";
    if (!resolvedTitle) return;
    onSubmit({
      date,
      time: time || undefined,
      duration: duration ? Number(duration) : undefined,
      title: resolvedTitle,
      placeId: placeId || undefined,
      note: note.trim() || undefined,
      mapsUrl: selectedPlace?.mapsUrl,
      order: initial?.order ?? Date.now(),
    });
  };

  return (
    <form className="schedule-item-form" onSubmit={handleSubmit}>
      <label>
        行きたい場所から選ぶ(任意)
        <select
          value={placeId}
          onChange={(e) => {
            setPlaceId(e.target.value);
            const p = places.find((pl) => pl.id === e.target.value);
            if (p && !title) setTitle(p.name);
          }}
        >
          <option value="">-- 選択しない --</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        タイトル
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: セントラルパーク散歩"
          required={!placeId}
        />
      </label>

      <div className="form-row">
        <label>
          時刻(任意)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          所要(分, 任意)
          <input
            type="number"
            min={0}
            step={15}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="60"
          />
        </label>
      </div>

      <label>
        メモ(任意)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="予約時間、持ち物など"
        />
      </label>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn-primary">
          保存
        </button>
      </div>
    </form>
  );
}
