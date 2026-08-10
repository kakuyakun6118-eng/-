import { FormEvent, useState } from "react";
import {
  CATEGORY_LABELS,
  Category,
  NewPlace,
  Place,
  PRIORITY_LABELS,
  Priority,
  Slot,
  SLOT_LABELS,
} from "../types";

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export function PlaceForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Place;
  onSubmit: (place: NewPlace) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "sightseeing");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "want");
  const [area, setArea] = useState(initial?.area ?? "");
  const [mapsUrl, setMapsUrl] = useState(initial?.mapsUrl ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial?.closedDays?.length || initial?.durationMin || initial?.bestSlot),
  );
  const [closedDays, setClosedDays] = useState<number[]>(initial?.closedDays ?? []);
  const [durationMin, setDurationMin] = useState(initial?.durationMin?.toString() ?? "");
  const [bestSlot, setBestSlot] = useState<Slot | "">(initial?.bestSlot ?? "");
  const [needsReservation, setNeedsReservation] = useState(initial?.needsReservation ?? false);

  const toggleClosedDay = (day: number) =>
    setClosedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      category,
      priority,
      area: area.trim() || undefined,
      mapsUrl: mapsUrl.trim() || undefined,
      note: note.trim() || undefined,
      closedDays: closedDays.length ? closedDays : undefined,
      durationMin: durationMin ? Number(durationMin) : undefined,
      bestSlot: bestSlot || undefined,
      needsReservation: needsReservation || undefined,
    });
  };

  return (
    <form className="place-form" onSubmit={handleSubmit}>
      <label>
        場所の名前
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: MoMA"
          autoFocus
          required
        />
      </label>

      <div className="form-row">
        <label>
          カテゴリ
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          優先度
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        エリア(任意)
        <input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="例: Manhattan / SoHo"
        />
      </label>

      <label>
        Googleマップのリンク(任意)
        <input
          value={mapsUrl}
          onChange={(e) => setMapsUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          inputMode="url"
        />
      </label>

      <label>
        メモ(任意)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="営業時間、予約要否など"
          rows={2}
        />
      </label>

      <button
        type="button"
        className="link-button"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "▾" : "▸"} AI提案の詳細設定(定休日・所要時間)
      </button>

      {showAdvanced && (
        <div className="advanced-block">
          <p className="hint">
            未入力なら、場所の名前とカテゴリから自動で推定します。分かっている場合はここで上書きできます。
          </p>

          <span className="field-label">定休日</span>
          <div className="weekday-row">
            {WEEKDAY_NAMES.map((label, day) => (
              <button
                type="button"
                key={day}
                className={`weekday-chip ${closedDays.includes(day) ? "active" : ""}`}
                onClick={() => toggleClosedDay(day)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="form-row">
            <label>
              所要時間(分)
              <input
                type="number"
                min={15}
                step={15}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="自動"
              />
            </label>
            <label>
              おすすめ時間帯
              <select value={bestSlot} onChange={(e) => setBestSlot(e.target.value as Slot | "")}>
                <option value="">自動</option>
                {Object.entries(SLOT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={needsReservation}
              onChange={(e) => setNeedsReservation(e.target.checked)}
            />
            事前予約が必要
          </label>
        </div>
      )}

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
