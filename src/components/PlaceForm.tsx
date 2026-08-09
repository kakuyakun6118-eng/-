import { FormEvent, useState } from "react";
import {
  CATEGORY_LABELS,
  Category,
  NewPlace,
  Place,
  PRIORITY_LABELS,
  Priority,
} from "../types";

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
