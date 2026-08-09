import { FormEvent, useState } from "react";
import { Place } from "../types";
import { dateRange, formatDateLabel } from "../utils/date";

export function AddToScheduleForm({
  place,
  startDate,
  endDate,
  onAdd,
  onCancel,
}: {
  place: Place;
  startDate: string;
  endDate: string;
  onAdd: (args: { date: string; time?: string; duration?: number }) => void;
  onCancel: () => void;
}) {
  const dates = dateRange(startDate, endDate);
  const [date, setDate] = useState(dates[0] ?? startDate);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onAdd({
      date,
      time: time || undefined,
      duration: duration ? Number(duration) : undefined,
    });
  };

  return (
    <form className="quick-schedule-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          日程
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatDateLabel(d)}
              </option>
            ))}
          </select>
        </label>
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
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn-primary">
          「{place.name}」を追加
        </button>
      </div>
    </form>
  );
}
