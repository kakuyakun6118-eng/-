import { useState } from "react";
import { TripStore } from "../hooks/useTrip";
import {
  NewPackingItem,
  PACKING_CATEGORIES,
  PACKING_CATEGORY_ICONS,
  PACKING_CATEGORY_LABELS,
  PACKING_OWNERS,
  PACKING_OWNER_LABELS,
  PackingCategory,
  PackingItem,
  PackingOwner,
} from "../types";
import { PERSONAL_SUGGESTIONS, SHARED_SUGGESTIONS } from "../data/packingSuggestions";

/** Same-name items shouldn't stack up when the suggestions are added twice. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function PackingTab({ trip }: { trip: TripStore }) {
  const [owner, setOwner] = useState<PackingOwner>("me");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hidePacked, setHidePacked] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Saving can fail on the device or at Firestore. Never fail silently —
   *  an unreported error just looks like a dead button. */
  const save = async (run: () => Promise<unknown>) => {
    try {
      setSaveError(null);
      await run();
      return true;
    } catch (err) {
      console.error("packing save failed", err);
      setSaveError(
        err instanceof Error ? err.message : "保存できませんでした。時間をおいて再度お試しください。",
      );
      return false;
    }
  };

  const itemsFor = (o: PackingOwner) => trip.packingItems.filter((i) => i.owner === o);
  const mine = itemsFor(owner);
  const packedCount = mine.filter((i) => i.packed).length;
  const percent = mine.length === 0 ? 0 : Math.round((packedCount / mine.length) * 100);

  const visible = hidePacked ? mine.filter((i) => !i.packed) : mine;
  const grouped = PACKING_CATEGORIES.map((category) => ({
    category,
    items: visible.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);

  const addSuggestions = async () => {
    const source = owner === "shared" ? SHARED_SUGGESTIONS : PERSONAL_SUGGESTIONS;
    const existing = new Set(mine.map((i) => normalize(i.name)));
    const fresh = source.filter((s) => !existing.has(normalize(s.name)));
    setSaveError(null);
    if (fresh.length === 0) {
      // Otherwise a second tap looks like the button is broken.
      setNotice("おすすめはすべて追加ずみです。");
      return;
    }
    setBusy(true);
    const ok = await save(async () => {
      for (const s of fresh) {
        await trip.addPackingItem({
          name: s.name,
          category: s.category,
          note: s.note,
          owner,
          packed: false,
        });
      }
    });
    setBusy(false);
    setNotice(ok ? `${fresh.length}件を追加しました。` : null);
  };

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>持ち物リスト</h2>
        {!adding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + 追加
          </button>
        )}
      </div>

      {/* Each person gets their own list so neither has to scroll past the
          other's underwear to find their charger. */}
      <div className="pk-owners">
        {PACKING_OWNERS.map((o) => {
          const list = itemsFor(o);
          const done = list.filter((i) => i.packed).length;
          return (
            <button
              key={o}
              className={`pk-owner ${owner === o ? "active" : ""}`}
              onClick={() => {
                setOwner(o);
                setEditingId(null);
                setNotice(null);
              }}
            >
              <span className="pk-owner-name">{PACKING_OWNER_LABELS[o]}</span>
              <span className="pk-owner-count">
                {list.length === 0 ? "—" : `${done}/${list.length}`}
              </span>
            </button>
          );
        })}
      </div>

      {saveError && <p className="save-error">⚠️ {saveError}</p>}

      {mine.length > 0 && (
        <div className="pk-progress">
          <div className="pk-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="pk-progress-meta">
            <span>
              {PACKING_OWNER_LABELS[owner]}:{packedCount}/{mine.length} 準備ずみ
            </span>
            <label className="pk-hide-toggle">
              <input
                type="checkbox"
                checked={hidePacked}
                onChange={(e) => setHidePacked(e.target.checked)}
              />
              済みを隠す
            </label>
          </div>
        </div>
      )}

      {adding && (
        <PackingForm
          owner={owner}
          onSubmit={async (item) => {
            if (await save(() => trip.addPackingItem(item))) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {mine.length === 0 && !adding && (
        <p className="empty-state">
          {PACKING_OWNER_LABELS[owner]}の持ち物はまだありません。
          <br />
          9月下旬のニューヨーク向けのおすすめリストから始めるのが早いです。
        </p>
      )}

      <button className="btn-secondary btn-block pk-suggest" onClick={addSuggestions} disabled={busy}>
        {busy ? "追加中…" : `✨ ${PACKING_OWNER_LABELS[owner]}におすすめを追加`}
      </button>
      {notice && <p className="pk-notice">{notice}</p>}

      {grouped.map((group) => (
        <section key={group.category} className="pk-group">
          <h3>
            {PACKING_CATEGORY_ICONS[group.category]} {PACKING_CATEGORY_LABELS[group.category]}
          </h3>
          {group.items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="pk-row-edit">
                <PackingForm
                  owner={item.owner}
                  initial={item}
                  onSubmit={async (patch) => {
                    if (await save(() => trip.updatePackingItem(item.id, patch))) {
                      setEditingId(null);
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={async () => {
                    if (!confirm(`「${item.name}」を削除しますか?`)) return;
                    if (await save(() => trip.removePackingItem(item.id))) setEditingId(null);
                  }}
                />
              </div>
            ) : (
              <div key={item.id} className={`pk-row ${item.packed ? "packed" : ""}`}>
                <label className="pk-check">
                  <input
                    type="checkbox"
                    checked={item.packed}
                    onChange={(e) =>
                      save(() => trip.updatePackingItem(item.id, { packed: e.target.checked }))
                    }
                  />
                  <span className="pk-text">
                    <span className="pk-name">{item.name}</span>
                    {item.note && <span className="pk-note">{item.note}</span>}
                  </span>
                </label>
                <button className="btn-small" onClick={() => setEditingId(item.id)}>
                  編集
                </button>
              </div>
            ),
          )}
        </section>
      ))}

      {mine.length > 0 && visible.length === 0 && (
        <p className="empty-state">すべて準備ずみです 🎉</p>
      )}
    </div>
  );
}

function PackingForm({
  owner,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  owner: PackingOwner;
  initial?: PackingItem;
  onSubmit: (item: NewPackingItem) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<PackingCategory>(initial?.category ?? "other");
  const [itemOwner, setItemOwner] = useState<PackingOwner>(initial?.owner ?? owner);
  const [note, setNote] = useState(initial?.note ?? "");

  return (
    <form
      className="packing-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({
          name: name.trim(),
          category,
          owner: itemOwner,
          note: note.trim() || undefined,
          packed: initial?.packed ?? false,
        });
      }}
    >
      <label>
        持ち物
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例:モバイルバッテリー"
          autoFocus
        />
      </label>
      <div className="form-row">
        <label>
          誰の
          <select value={itemOwner} onChange={(e) => setItemOwner(e.target.value as PackingOwner)}>
            {PACKING_OWNERS.map((o) => (
              <option key={o} value={o}>
                {PACKING_OWNER_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <label>
          分類
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PackingCategory)}
          >
            {PACKING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PACKING_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        メモ(任意)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="個数や注意点" />
      </label>
      <div className="form-actions">
        {onDelete && (
          <button type="button" className="btn-small btn-danger" onClick={onDelete}>
            削除
          </button>
        )}
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
